import logging
import os
from datetime import datetime
from bson import ObjectId
from services.db import rooms_coll, shares_coll, redis_client
from services.crypto_service import wrap_room_key

logger = logging.getLogger(__name__)

def create_room_record(name: str, room_type: str, owner_id: str, owner_name: str, description: str = None):
    """
    Create a new room record in the database.
    
    Args:
        name: Room name
        room_type: 'public', 'private', or 'secure'
        owner_id: Owner's user ID
        owner_name: Owner's username
        description: Optional room description
    
    Returns:
        The created room document
    """
    wrapped = None
    if room_type in ("private", "secure"):
        raw = os.urandom(32)
        wrapped = wrap_room_key(raw)

    room = {
        "name": name,
        "type": room_type,
        "description": description,
        "archived": False,
        "ownerId": owner_id,
        "ownerName": owner_name,
        "createdAt": datetime.utcnow(),
        "updatedAt": datetime.utcnow(),
        "wrappedKey": wrapped
    }
    rooms_coll.insert_one(room)
    
    shares_coll.update_one(
        {"roomId": str(room["_id"]), "userId": owner_id},
        {"$set": {
            "roomId": str(room["_id"]),
            "userId": owner_id,
            "username": owner_name,
            "role": "owner"
        }},
        upsert=True
    )
    
    return room

def get_room_by_id(room_id: str):
    """Get room by ID."""
    try:
        return rooms_coll.find_one({"_id": ObjectId(room_id)})
    except Exception as e:
        logger.error(f"Error fetching room {room_id}: {e}")
        return None

def update_room_record(room_id: str, updates: dict):
    """Update room record with given updates."""
    try:
        updates["updatedAt"] = datetime.utcnow()
        rooms_coll.update_one(
            {"_id": ObjectId(room_id)},
            {"$set": updates}
        )
        return True
    except Exception as e:
        logger.error(f"Error updating room {room_id}: {e}")
        return False

def archive_room(room_id: str):
    """Archive a room."""
    return update_room_record(room_id, {"archived": True})

def delete_room_record(room_id: str):
    """Permanently delete a room and all associated data."""
    try:
        rooms_coll.delete_one({"_id": ObjectId(room_id)})
        shares_coll.delete_many({"roomId": room_id})
        
        try:
            redis_keys = redis_client.keys(f"room:{room_id}:*")
            for key in redis_keys:
                redis_client.delete(key)
        except Exception as e:
            logger.error(f"Error cleaning up Redis keys for room {room_id}: {e}")
        
        return True
    except Exception as e:
        logger.error(f"Error deleting room {room_id}: {e}")
        return False

def get_user_rooms(user_id: str, include_archived: bool = False, room_type: str = None, 
                   sort_by: str = "updatedAt", order: str = "desc", 
                   page: int = 1, per_page: int = 200):
    """
    Get rooms accessible to a user with filtering, sorting, and pagination.
    
    Args:
        user_id: User ID
        include_archived: Include archived rooms
        room_type: Filter by room type ('public', 'private', 'secure')
        sort_by: Sort field ('updatedAt', 'createdAt', 'name', 'memberCount')
        order: Sort order ('asc' or 'desc')
        page: Page number (1-indexed)
        per_page: Results per page
    
    Returns:
        dict with 'rooms', 'total', 'page', 'per_page'
    """
    try:
        shared_cursor = shares_coll.find(
            {"$or": [{"userId": user_id}, {"username": user_id}]},
            {"roomId": 1}
        )
        shared_room_ids = [r["roomId"] for r in shared_cursor]
        
        oids = []
        for rid in shared_room_ids:
            try:
                oids.append(ObjectId(rid))
            except Exception:
                pass

        base_clauses = [{"ownerId": user_id}]
        if oids:
            base_clauses.append({"_id": {"$in": oids}})
        base_match = {"$or": base_clauses} if len(base_clauses) > 1 else base_clauses[0]

        if room_type in ("public", "private", "secure"):
            match = {"$and": [base_match, {"type": room_type}]}
        else:
            match = base_match

        if not include_archived:
            match = {"$and": [match, {"archived": {"$ne": True}}]}

        pipeline = []
        pipeline.append({"$match": match})
        pipeline.append({"$addFields": {"_id_str": {"$toString": "$_id"}}})
        pipeline.append({
            "$lookup": {
                "from": shares_coll.name,
                "localField": "_id_str",
                "foreignField": "roomId",
                "as": "members"
            }
        })
        pipeline.append({"$addFields": {"memberCount": {"$size": {"$ifNull": ["$members", []]}}}})

        sort_map = {
            'updatedAt': ('updatedAt', -1),
            'createdAt': ('createdAt', -1),
            'name': ('name', 1),
            'memberCount': ('memberCount', -1)
        }
        sort_field, default_dir = sort_map.get(sort_by, ('updatedAt', -1))
        dir_val = 1 if order == 'asc' else -1
        sort_spec = {sort_field: dir_val}

        skip = (page - 1) * per_page

        facet_results_pipeline = [
            {"$sort": sort_spec},
            {"$skip": skip},
            {"$limit": per_page},
            {"$project": {
                "id": {"$toString": "$_id"},
                "name": 1,
                "type": 1,
                "ownerName": 1,
                "description": 1,
                "archived": 1,
                "createdAt": 1,
                "updatedAt": 1,
                "memberCount": 1,
                "ownerId": 1
            }}
        ]
        facet_total_pipeline = [{"$count": "count"}]

        pipeline.append({
            "$facet": {
                "results": facet_results_pipeline,
                "total": facet_total_pipeline
            }
        })

        agg_res = list(rooms_coll.aggregate(pipeline))
        results = []
        total = 0
        if agg_res and isinstance(agg_res, list):
            res0 = agg_res[0]
            results = res0.get('results', [])
            total = (res0.get('total', []) and res0['total'][0].get('count', 0)) or 0

        out = []
        for r in results:
            my_role = None
            try:
                if str(r.get('ownerId')) == user_id:
                    my_role = 'owner'
                else:
                    sh = shares_coll.find_one({
                        'roomId': r.get('id'),
                        '$or': [{'userId': user_id}, {'username': user_id}]
                    })
                    if sh and sh.get('role'):
                        my_role = sh.get('role')
            except Exception:
                my_role = None
            
            out.append({
                'id': r.get('id'),
                'name': r.get('name'),
                'type': r.get('type'),
                'ownerName': r.get('ownerName'),
                'description': r.get('description'),
                'archived': bool(r.get('archived', False)),
                'myRole': my_role,
                'createdAt': r.get('createdAt'),
                'updatedAt': r.get('updatedAt'),
                'memberCount': r.get('memberCount', 0)
            })

        return {
            'status': 'ok',
            'rooms': out,
            'total': total,
            'page': page,
            'per_page': per_page
        }
    except Exception as e:
        logger.error(f"Error fetching user rooms: {e}")
        return {
            'status': 'error',
            'message': 'Failed to fetch rooms',
            'rooms': [],
            'total': 0,
            'page': page,
            'per_page': per_page
        }

def get_room_members(room_id: str):
    """Get all members of a room."""
    try:
        members = list(shares_coll.find({"roomId": room_id}))
        return members
    except Exception as e:
        logger.error(f"Error fetching room members: {e}")
        return []

def add_room_member(room_id: str, user_id: str, username: str, role: str = "editor"):
    """Add a member to a room."""
    try:
        shares_coll.update_one(
            {"roomId": room_id, "userId": user_id},
            {"$set": {
                "roomId": room_id,
                "userId": user_id,
                "username": username,
                "role": role
            }},
            upsert=True
        )
        return True
    except Exception as e:
        logger.error(f"Error adding room member: {e}")
        return False

def remove_room_member(room_id: str, user_id: str):
    """Remove a member from a room."""
    try:
        shares_coll.delete_one({"roomId": room_id, "userId": user_id})
        return True
    except Exception as e:
        logger.error(f"Error removing room member: {e}")
        return False

def update_member_role(room_id: str, user_id: str, role: str):
    """Update a member's role in a room."""
    try:
        shares_coll.update_one(
            {"roomId": room_id, "userId": user_id},
            {"$set": {"role": role}}
        )
        return True
    except Exception as e:
        logger.error(f"Error updating member role: {e}")
        return False

def transfer_room_ownership(room_id: str, new_owner_id: str, new_owner_name: str):
    """Transfer room ownership to another user."""
    try:
        rooms_coll.update_one(
            {"_id": ObjectId(room_id)},
            {"$set": {
                "ownerId": new_owner_id,
                "ownerName": new_owner_name,
                "updatedAt": datetime.utcnow()
            }}
        )
        
        shares_coll.update_one(
            {"roomId": room_id, "userId": new_owner_id},
            {"$set": {"role": "owner"}},
            upsert=True
        )
        
        return True
    except Exception as e:
        logger.error(f"Error transferring room ownership: {e}")
        return False
