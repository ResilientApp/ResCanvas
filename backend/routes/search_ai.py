from flask import Blueprint, request, jsonify, g
from middleware.auth import require_auth_optional
from services.db import rooms_coll, shares_coll
from bson import ObjectId
from services.search_algorithms import text_search, image_search
import logging

search_ai_bp = Blueprint('search_ai', __name__)
logger = logging.getLogger(__name__)




@search_ai_bp.route('/api/v1/search/ai', methods=['POST'])
@require_auth_optional
def search_ai():
    payload = request.get_json(silent=True) or {}
    q = (payload.get('q') or '').strip()
    image_b64 = payload.get('image_b64')
    user = g.current_user
    claims = getattr(g, 'token_claims', None)

    # ---- Visibility: public OR owner OR shared; always exclude archived ----
    vis_or = [{"type": "public"}]
    if user and claims and claims.get('sub'):
        # collect shared room ObjectIds
        try:
            shared_cursor = shares_coll.find(
                {"$or": [{"userId": claims['sub']}, {"username": claims['sub']}]},
                {"roomId": 1}
            )
            oids_obj = []
            oids_str = []
            for doc in shared_cursor:
                rid = doc.get("roomId")
                # roomId may be stored as a string (hex) or as an ObjectId already
                if isinstance(rid, str):
                    oids_str.append(rid)
                    try:
                        oids_obj.append(ObjectId(rid))
                    except Exception:
                        pass
                else:
                    # assume it's an ObjectId or similar
                    try:
                        oids_obj.append(ObjectId(rid))
                    except Exception:
                        try:
                            # fallback: convert to str
                            oids_str.append(str(rid))
                        except Exception:
                            pass
        except Exception:
            oids_obj = []
            oids_str = []

        # Match ownerId stored as string or as ObjectId (legacy/varied schemas)
        try:
            oid_owner = ObjectId(claims['sub'])
            vis_or.append({"ownerId": claims['sub']})
            vis_or.append({"ownerId": oid_owner})
        except Exception:
            vis_or.append({"ownerId": claims['sub']})
        # Also match by ownerName to handle legacy documents that store owner
        # as a username or when ownerId formats vary.
        if claims.get('username'):
            vis_or.append({"ownerName": claims.get('username')})
        # include shared rooms by _id; support both ObjectId and string representations
        if oids_obj:
            vis_or.append({"_id": {"$in": oids_obj}})
        if oids_str:
            vis_or.append({"_id": {"$in": oids_str}})
        logger.debug("search_ai: visibility OR clauses count: owners=%s, shared_obj=%s, shared_str=%s", len([c for c in vis_or if 'ownerId' in c or 'ownerName' in c]), len(oids_obj), len(oids_str))

    # If a text query is provided, search across all non-archived rooms (public+private)
    if q:
        match = {"archived": {"$ne": True}}
    else:
        match = {"$and": [{"archived": {"$ne": True}}, {"$or": vis_or}]}

    # ---- Limit / fields ----
    LIMIT = min(int(payload.get("limit", 50)), 100)
    fields = {"name": 1, "type": 1, "ownerName": 1, "description": 1, "createdAt": 1, "updatedAt": 1}

    # ---- Fetch candidates (visibility-filtered) ----
    try:
        candidates = []
        logger.debug("search_ai: using match=%s", match)
        for r in rooms_coll.find(match, fields).limit(LIMIT * 5):  # oversample; rank later
            candidates.append({
                "id": str(r.get("_id")),
                "name": r.get("name"),
                "type": r.get("type"),
                "ownerName": r.get("ownerName"),
                "description": r.get("description"),
                "createdAt": r.get("createdAt"),
                "updatedAt": r.get("updatedAt"),
            })
        logger.info("search_ai: fetched %d candidate rooms (limit=%s)", len(candidates), LIMIT * 5)
    except Exception as e:
        logger.exception("Search candidate fetch failed: %s", e)
        return jsonify({"status": "ok", "results": []}), 200

    # ---- Match + rank using your stubs ----
    try:
        if image_b64:
            ranked = image_search(image_b64=image_b64, rooms=candidates, q=q or None, top_n=LIMIT)
        elif q:
            ranked = text_search(query=q, rooms=candidates, top_n=LIMIT)
        else:
            # No signals → recency fallback with default score
            ranked = sorted(
                candidates,
                key=lambda x: x.get("updatedAt") or x.get("createdAt"),
                reverse=True
            )[:LIMIT]
            for r in ranked:
                r["score"] = 1.0
    except Exception as e:
        logger.exception("Search ranking failed: %s", e)
        ranked = candidates[:LIMIT]  # fail soft

    # ---- Presentation fields ----
    for r in ranked:
        r["snippet"] = (r.get("description") or "")[:300]
        if "score" not in r:
            r["score"] = 1.0

    return jsonify({"status": "ok", "results": ranked}), 200
