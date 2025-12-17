from flask import Blueprint, request, jsonify
import json
import logging
from bson import ObjectId
from services.db import redis_client, strokes_coll, rooms_coll, shares_coll
from services.crypto_service import unwrap_room_key, decrypt_for_room
from middleware.auth import require_auth, require_room_access
from cryptography.exceptions import InvalidTag

logger = logging.getLogger(__name__)
export_bp = Blueprint("export", __name__, url_prefix="/api")

def _try_int(v, default=None):
    """Safe int conversion supporting bytes and Mongo numeric wrappers."""
    try:
        if v is None:
            return default
        if isinstance(v, (bytes, bytearray)):
            v = v.decode()
        if isinstance(v, dict) and "$numberLong" in v:
            return int(v["$numberLong"])
        if isinstance(v, str) and v.isdigit():
            return int(v)
        if isinstance(v, (int, float)):
            return int(v)
    except Exception:
        return default
    return default

def _deep_json_loads(v):
    """Recursively parse JSON strings until we get a dict or give up."""
    if v is None:
        return {}
    if isinstance(v, dict):
        return v
    if isinstance(v, str):
        try:
            parsed = json.loads(v)
            if isinstance(parsed, str):
                return _deep_json_loads(parsed)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}
    return {}

@export_bp.route("/rooms/<room_id>/export", methods=["GET"])
@require_auth
@require_room_access(room_id_param='room_id')
def export_canvas(room_id):
    """
    Export all canvas data for a room in a format that can be re-imported.
    Returns JSON with strokes and metadata.
    """
    try:
        from flask import g
        room = g.current_room
        user = g.current_user
        
        logger.info(f"export_canvas: Starting export for room {room_id}")
        
        # Get all stroke IDs from Redis (includes recently imported strokes not yet in MongoDB)
        redis_strokes = []
        try:
            # Get all stroke keys and filter by roomId
            all_keys = redis_client.keys("res-canvas-draw-*")
            for key in all_keys:
                if isinstance(key, bytes):
                    key = key.decode()
                try:
                    val = redis_client.get(key)
                    if val:
                        if isinstance(val, bytes):
                            val = val.decode()
                        cache_entry = json.loads(val)
                        if cache_entry.get("roomId") == room_id:
                            redis_strokes.append(cache_entry)
                except Exception as e:
                    logger.warning(f"export_canvas: Failed to parse Redis key {key}: {e}")
            
            logger.info(f"export_canvas: Found {len(redis_strokes)} strokes in Redis for room {room_id}")
        except Exception as e:
            logger.warning(f"export_canvas: Redis scan failed: {e}")
        
        # Get all strokes from MongoDB (authoritative source)
        mongo_strokes = []
        try:
            # Query MongoDB for all strokes in this room
            # Strokes can be stored in multiple formats:
            # 1. {roomId, ts, stroke: {...}} - standard format from submit_room_line
            # 2. {value.roomId: ...} - legacy format
            # 3. {transactions.value.roomId: ...} - from ResilientDB sync
            mongo_docs = list(strokes_coll.find({
                "$or": [
                    {"roomId": room_id},  # Standard format - TOP LEVEL roomId
                    {"value.roomId": room_id},
                    {"transactions.value.roomId": room_id},
                    {"transactions.value.asset.data.roomId": room_id}
                ]
            }).sort("_id", 1))
            
            logger.info(f"export_canvas: Found {len(mongo_docs)} MongoDB documents for room {room_id}")
            
            # Extract strokes from documents
            for doc in mongo_docs:
                # Format 1: Standard format {roomId, ts, stroke: {...}}
                if "stroke" in doc and "roomId" in doc:
                    stroke_data = doc["stroke"]
                    if isinstance(stroke_data, dict):
                        mongo_strokes.append(stroke_data)
                
                # Format 2: Encrypted format {roomId, ts, blob: "..."}
                elif "blob" in doc and "roomId" in doc:
                    # Store the encrypted blob for later decryption
                    mongo_strokes.append({
                        "id": doc.get("id"),
                        "user": doc.get("user"),
                        "ts": doc.get("ts"),
                        "roomId": doc.get("roomId"),
                        "value": json.dumps({"encrypted": doc["blob"]})
                    })
                
                # Format 3: Try to extract from transactions array (ResilientDB sync format)
                elif "transactions" in doc and isinstance(doc["transactions"], list):
                    for tx in doc["transactions"]:
                        tx_value = tx.get("value", {})
                        if isinstance(tx_value, dict):
                            # Check if this transaction belongs to our room
                            tx_room_id = tx_value.get("roomId")
                            if tx_room_id and str(tx_room_id) == str(room_id):
                                mongo_strokes.append(tx_value)
                            # Also check nested asset.data
                            elif "asset" in tx_value and isinstance(tx_value["asset"], dict):
                                asset_data = tx_value["asset"].get("data", {})
                                if isinstance(asset_data, dict):
                                    asset_room_id = asset_data.get("roomId")
                                    if asset_room_id and str(asset_room_id) == str(room_id):
                                        mongo_strokes.append(asset_data)
                
                # Format 4: Top-level value field (legacy)
                elif "value" in doc:
                    doc_value = doc["value"]
                    if isinstance(doc_value, dict):
                        doc_room_id = doc_value.get("roomId")
                        if doc_room_id and str(doc_room_id) == str(room_id):
                            mongo_strokes.append(doc_value)
                            
        except Exception as e:
            logger.exception(f"export_canvas: MongoDB query failed: {e}")
            return jsonify({"status": "error", "message": f"Failed to query database: {str(e)}"}), 500
        
        logger.info(f"export_canvas: Extracted {len(mongo_strokes)} strokes from MongoDB")
        
        # Merge Redis strokes with MongoDB strokes (Redis may have newer strokes not yet synced)
        # Use a set of stroke IDs to avoid duplicates
        stroke_ids_from_mongo = set()
        for stroke in mongo_strokes:
            stroke_id = stroke.get("id")
            if stroke_id:
                stroke_ids_from_mongo.add(stroke_id)
        
        # Add Redis strokes that aren't already in MongoDB
        for redis_stroke in redis_strokes:
            stroke_id = redis_stroke.get("id")
            if stroke_id and stroke_id not in stroke_ids_from_mongo:
                mongo_strokes.append(redis_stroke)
                logger.info(f"export_canvas: Added Redis stroke {stroke_id} not yet in MongoDB")
        
        logger.info(f"export_canvas: Total strokes after Redis merge: {len(mongo_strokes)}")
        
        # Decrypt encrypted values if this is a private/secure room
        room_type = "public"
        if room and isinstance(room, dict):
            room_type = room.get("type", "public")
        if room and isinstance(room, dict) and room_type in ("private", "secure") and room.get("wrappedKey"):
            try:
                room_key = unwrap_room_key(room["wrappedKey"])
                decrypted_count = 0
                
                for stroke in mongo_strokes:
                    try:
                        # Check if value is encrypted
                        value_field = stroke.get("value")
                        if isinstance(value_field, str):
                            try:
                                value_parsed = json.loads(value_field)
                            except:
                                value_parsed = None
                        elif isinstance(value_field, dict):
                            value_parsed = value_field
                        else:
                            value_parsed = None
                        
                        if value_parsed and isinstance(value_parsed, dict) and "encrypted" in value_parsed:
                            enc = value_parsed["encrypted"]
                            dec = decrypt_for_room(room_key, enc)
                            dec_text = dec.decode("utf-8") if isinstance(dec, (bytes, bytearray)) else str(dec)
                            stroke["value"] = dec_text
                            decrypted_count += 1
                    except InvalidTag:
                        logger.warning(f"export_canvas: InvalidTag when decrypting stroke {stroke.get('id')}")
                    except Exception as e:
                        logger.warning(f"export_canvas: Failed to decrypt stroke {stroke.get('id')}: {e}")
                
                logger.info(f"export_canvas: Decrypted {decrypted_count} strokes")
            except Exception as e:
                logger.exception(f"export_canvas: Failed to unwrap room key: {e}")
        
        # Normalize and clean stroke data for export
        export_strokes = []
        for stroke in mongo_strokes:
            try:
                # Parse the value field if it's a JSON string
                value_field = stroke.get("value")
                if isinstance(value_field, str):
                    try:
                        value_data = json.loads(value_field)
                    except:
                        value_data = {"raw": value_field}
                elif isinstance(value_field, dict):
                    value_data = value_field
                else:
                    value_data = {}
                
                # Extract stroke data
                export_stroke = {
                    "id": stroke.get("id") or value_data.get("id"),
                    "user": stroke.get("user") or value_data.get("user"),
                    "timestamp": _try_int(stroke.get("ts") or stroke.get("timestamp") or 
                                         value_data.get("timestamp") or value_data.get("ts"), 0),
                    "roomId": room_id,
                }
                
                # Add drawing-specific fields from both value_data and stroke object
                # Check stroke object first (for {roomId, ts, stroke: {...}} format)
                # then value_data (for legacy {value: {...}} format)
                for field in ["color", "lineWidth", "pathData", "brushStyle", "brushType", 
                             "brushParams", "drawingType", "stampData", "stampSettings", 
                             "filterType", "filterParams", "drawingId", "shapeType", "type"]:
                    if field in stroke:
                        export_stroke[field] = stroke[field]
                    elif field in value_data:
                        export_stroke[field] = value_data[field]
                
                # Only add strokes that have actual drawing data
                if export_stroke.get("pathData") or export_stroke.get("stampData") or export_stroke.get("type"):
                    export_strokes.append(export_stroke)
                    
            except Exception as e:
                logger.warning(f"export_canvas: Failed to normalize stroke: {e}")
        
        logger.info(f"export_canvas: Normalized {len(export_strokes)} strokes for export")
        
        # Sort by timestamp
        export_strokes.sort(key=lambda s: s.get("timestamp", 0))
        
        # Build export data structure
        export_data = {
            "version": "1.0",
            "roomId": room_id,
            "roomName": room.get("name", "Untitled Room") if room else "Untitled Room",
            "roomType": room_type,
            "exportedAt": _try_int(__import__('time').time() * 1000),
            "strokeCount": len(export_strokes),
            "strokes": export_strokes
        }
        
        return jsonify({"status": "success", "data": export_data}), 200
        
    except Exception as e:
        logger.exception(f"export_canvas: Unexpected error")
        return jsonify({"status": "error", "message": f"Export failed: {str(e)}"}), 500


@export_bp.route("/rooms/<room_id>/import", methods=["POST"])
@require_auth
@require_room_access(room_id_param='room_id')
def import_canvas(room_id):
    """
    Import canvas data into a room.
    Expects JSON with strokes array and metadata.
    """
    try:
        from flask import g
        room = g.current_room
        user = g.current_user
        
        data = request.get_json(force=True) or {}
        logger.info(f"import_canvas: Starting import for room {room_id}")
        
        # Validate import data
        if not isinstance(data, dict):
            return jsonify({"status": "error", "message": "Invalid import data format"}), 400
        
        strokes = data.get("strokes", [])
        if not isinstance(strokes, list):
            return jsonify({"status": "error", "message": "Import data must contain strokes array"}), 400
        
        if len(strokes) == 0:
            return jsonify({"status": "error", "message": "No strokes to import"}), 400
        
        # Check member permissions
        user_id = str(user['_id'])
        is_owner = room.get("ownerId") == user_id
        # Owners can always import, check viewer role for members only
        if not is_owner:
            member = shares_coll.find_one({"roomId": str(room["_id"]), "userId": user_id})
            if member and member.get("role") == "viewer":
                return jsonify({"status": "error", "message": "Viewers cannot import data"}), 403
        
        # Import configuration
        clear_existing = data.get("clearExisting", False)
        
        # Clear existing canvas if requested
        # Note: We clear strokes but DO NOT set a clear timestamp because
        # imported strokes may have old timestamps and would be filtered out
        if clear_existing:
            try:
                # Clear MongoDB strokes for this room
                # Strokes can be stored in multiple nested structures
                mongo_result = strokes_coll.delete_many({
                    "$or": [
                        {"roomId": room_id},
                        {"value.roomId": room_id},
                        {"transactions.value.roomId": room_id},
                        {"transactions.value.asset.data.roomId": room_id}
                    ]
                })
                logger.info(f"import_canvas: Cleared {mongo_result.deleted_count} strokes from MongoDB")
                
                # Also clear any clear_marker documents to prevent timestamp filtering
                clear_marker_result = strokes_coll.delete_many({
                    "asset.data.type": "clear_marker",
                    "asset.data.roomId": room_id
                })
                logger.info(f"import_canvas: Cleared {clear_marker_result.deleted_count} clear_markers from MongoDB")
                
                # Clear Redis cache for this room's strokes
                # We need to find all stroke keys that belong to this room
                all_keys = redis_client.keys("res-canvas-draw-*")
                room_stroke_keys = []
                for key in all_keys:
                    if isinstance(key, bytes):
                        key = key.decode()
                    try:
                        val = redis_client.get(key)
                        if val:
                            if isinstance(val, bytes):
                                val = val.decode()
                            val_json = json.loads(val)
                            if val_json.get("roomId") == room_id:
                                room_stroke_keys.append(key)
                    except:
                        pass
                
                if room_stroke_keys:
                    redis_client.delete(*room_stroke_keys)
                    logger.info(f"import_canvas: Cleared {len(room_stroke_keys)} Redis stroke keys")
                
                # Remove the clear timestamp so old strokes can be imported
                redis_client.delete(f"last-clear-ts:{room_id}")
                logger.info(f"import_canvas: Removed clear timestamp to allow old strokes")
            except Exception as e:
                logger.warning(f"import_canvas: Failed to clear existing data: {e}")
        
        # Get room type for encryption handling
        room_type = "public"
        if room and isinstance(room, dict):
            room_type = room.get("type", "public")
        
        # Get room key for encryption if needed
        room_key = None
        if room and isinstance(room, dict) and room_type in ("private", "secure"):
            if room.get("wrappedKey"):
                try:
                    room_key = unwrap_room_key(room["wrappedKey"])
                except Exception as e:
                    logger.warning(f"import_canvas: Failed to unwrap room key: {e}")
        
        # Import strokes
        from services.graphql_service import commit_transaction_via_graphql
        from services.canvas_counter import get_canvas_draw_count, increment_canvas_draw_count
        from services.crypto_service import encrypt_for_room
        
        imported_count = 0
        failed_count = 0
        
        for stroke in strokes:
            try:
                # Validate stroke has required fields
                if not isinstance(stroke, dict):
                    logger.warning(f"import_canvas: Skipping non-dict stroke")
                    failed_count += 1
                    continue
                
                # Build stroke data
                stroke_data = {
                    "roomId": room_id,
                    "user": stroke.get("user", "imported"),
                    "timestamp": _try_int(stroke.get("timestamp"), int(__import__('time').time() * 1000)),
                    "color": stroke.get("color", "#000000"),
                    "lineWidth": stroke.get("lineWidth", 5),
                }
                
                # Add optional fields
                for field in ["pathData", "brushStyle", "brushType", "brushParams", 
                             "drawingType", "stampData", "stampSettings", "filterType", 
                             "filterParams", "drawingId", "shapeType", "type"]:
                    if field in stroke:
                        stroke_data[field] = stroke[field]
                
                # ATOMIC OPERATION: Increment counter and get the NEW value
                # This must happen FIRST to ensure unique stroke IDs even under concurrent load
                draw_count = increment_canvas_draw_count()
                stroke_id = f"res-canvas-draw-{draw_count}"
                stroke_data["id"] = stroke_id
                
                # Prepare value for storage
                value_json = json.dumps(stroke_data, ensure_ascii=False)
                
                # Encrypt if needed
                if room_key:
                    try:
                        from services.crypto_service import encrypt_for_room
                        enc = encrypt_for_room(room_key, value_json.encode("utf-8"))
                        value_json = json.dumps({"encrypted": enc}, ensure_ascii=False)
                    except Exception as e:
                        logger.warning(f"import_canvas: Failed to encrypt stroke {stroke_id}: {e}")
                
                # Cache in Redis
                cache_entry = {
                    "id": stroke_id,
                    "user": stroke_data["user"],
                    "ts": stroke_data["timestamp"],
                    "deletion_date_flag": "",
                    "undone": False,
                    "value": value_json,
                    "roomId": room_id,
                }
                redis_client.set(stroke_id, json.dumps(cache_entry))
                
                # Insert directly into MongoDB for immediate availability
                # This ensures strokes appear right away without waiting for sync service
                # Format must match what the sync service and GET endpoints expect
                try:
                    # Decrypt the value if it was encrypted (for MongoDB storage)
                    stroke_for_mongo = stroke_data.copy()
                    stroke_for_mongo["id"] = stroke_id
                    
                    if room_key and "encrypted" in json.loads(value_json):
                        # For encrypted rooms, store the encrypted blob
                        mongo_doc = {
                            "roomId": room_id,
                            "ts": stroke_data["timestamp"],
                            "blob": json.loads(value_json)["encrypted"],
                            "type": room_type,
                            "id": stroke_id,
                            "user": stroke_data["user"]
                        }
                    else:
                        # For public rooms, store the full stroke object
                        mongo_doc = {
                            "roomId": room_id,
                            "ts": stroke_data["timestamp"],
                            "stroke": stroke_for_mongo,
                            "type": room_type
                        }
                    strokes_coll.insert_one(mongo_doc)
                    logger.debug(f"import_canvas: Inserted stroke {stroke_id} into MongoDB")
                except Exception as e:
                    logger.warning(f"import_canvas: Failed to insert stroke {stroke_id} into MongoDB: {e}")
                
                # Commit to ResilientDB via GraphQL
                try:
                    from config import SIGNER_PUBLIC_KEY, SIGNER_PRIVATE_KEY
                    graphql_payload = {
                        "data": {
                            "id": stroke_id,
                            "user": stroke_data["user"],
                            "ts": stroke_data["timestamp"],
                            "value": value_json
                        },
                        "publicKey": SIGNER_PUBLIC_KEY,
                        "privateKey": SIGNER_PRIVATE_KEY
                    }
                    commit_transaction_via_graphql(graphql_payload)
                except Exception as e:
                    logger.warning(f"import_canvas: GraphQL commit failed for {stroke_id}: {e}")
                    # Continue even if GraphQL fails - data is in Redis/MongoDB
                
                # Note: increment_canvas_draw_count() already called above - do not call again
                imported_count += 1
                
            except Exception as e:
                logger.warning(f"import_canvas: Failed to import stroke: {e}")
                failed_count += 1
        
        logger.info(f"import_canvas: Imported {imported_count} strokes, {failed_count} failed")
        
        # Broadcast refresh event to all clients in the room
        from services.socketio_service import push_to_room
        try:
            push_to_room(room_id, "canvas_refresh", {
                "message": "Canvas data imported",
                "imported": imported_count
            })
        except Exception as e:
            logger.warning(f"import_canvas: Failed to broadcast refresh: {e}")
        
        return jsonify({
            "status": "success",
            "imported": imported_count,
            "failed": failed_count,
            "total": len(strokes)
        }), 200
        
    except Exception as e:
        logger.exception(f"import_canvas: Unexpected error")
        return jsonify({"status": "error", "message": f"Import failed: {str(e)}"}), 500
