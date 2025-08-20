# routes/rooms.py
from flask import Blueprint, request, jsonify
from bson import ObjectId
from datetime import datetime
import json, time, traceback, logging
from services.db import rooms_coll, shares_coll, users_coll, strokes_coll, redis_client
from services.crypto_service import wrap_room_key, unwrap_room_key, encrypt_for_room, decrypt_for_room
from services.graphql_service import commit_transaction_via_graphql
from config import SIGNER_PUBLIC_KEY, SIGNER_PRIVATE_KEY, RECIPIENT_PUBLIC_KEY
import jwt
from config import JWT_SECRET

logger = logging.getLogger(__name__)
rooms_bp = Blueprint("rooms", __name__)

def _authed_user():
    auth = request.headers.get("Authorization","")
    if not auth.startswith("Bearer "):
        return None
    token = auth.split(" ",1)[1]
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except Exception:
        return None

def _ensure_member(user_id:str, room):
    if room["ownerId"] == user_id: return True
    return shares_coll.find_one({"roomId": str(room["_id"]), "userId": user_id}) is not None

@rooms_bp.route("/rooms", methods=["POST"])
def create_room():
    claims = _authed_user()
    if not claims: return jsonify({"status":"error","message":"Unauthorized"}), 401
    data = request.get_json(force=True)
    name = (data.get("name") or "").strip() or "Untitled"
    rtype = (data.get("type") or "public").lower()
    if rtype not in ("public","private","secure"):
        return jsonify({"status":"error","message":"Invalid type"}), 400

    # Generate per-room key and wrap with master for storage (for private/secure)
    wrapped = None
    if rtype in ("private","secure"):
        import os
        raw = os.urandom(32)
        wrapped = wrap_room_key(raw)

    room = {
        "name": name,
        "type": rtype,
        "ownerId": claims["sub"],
        "ownerName": claims["username"],
        "createdAt": datetime.utcnow(),
        "wrappedKey": wrapped  # None for public
    }
    rooms_coll.insert_one(room)
    # owner membership record (present implicitly for quick queries)
    shares_coll.update_one(
        {"roomId": str(room["_id"]), "userId": claims["sub"]},
        {"$set": {"roomId": str(room["_id"]), "userId": claims["sub"], "username": claims["username"], "role":"owner"}},
        upsert=True
    )
    return jsonify({"status":"ok","room":{"id":str(room["_id"]), "name":name, "type":rtype}}), 201

@rooms_bp.route("/rooms", methods=["GET"])
def list_rooms():
    claims = _authed_user()
    if not claims: return jsonify({"status":"error","message":"Unauthorized"}), 401
    uid = claims["sub"]
    # rooms owned or shared
    owned = list(rooms_coll.find({"ownerId": uid}))
    shared_ids = [ s["roomId"] for s in shares_coll.find({"userId": uid}) ]
    shared = list(rooms_coll.find({"_id": {"$in": [ObjectId(x) for x in shared_ids]}}))
    def _fmt(r):
        return {"id": str(r["_id"]), "name": r["name"], "type": r["type"], "ownerName": r.get("ownerName")}
    # de-dupe
    ids = set()
    items=[]
    for r in owned + shared:
        if str(r["_id"]) in ids: continue
        ids.add(str(r["_id"])); items.append(_fmt(r))
    return jsonify({"status":"ok","rooms": items})

@rooms_bp.route("/rooms/<roomId>/share", methods=["POST"])
def share_room(roomId):
    claims = _authed_user()
    if not claims: return jsonify({"status":"error","message":"Unauthorized"}), 401
    room = rooms_coll.find_one({"_id": ObjectId(roomId)})
    if not room: return jsonify({"status":"error","message":"Room not found"}), 404
    if room["ownerId"] != claims["sub"]:
        return jsonify({"status":"error","message":"Only owner can share"}), 403

    data = request.get_json(force=True)  # {usernames: ["alice","bob"]}
    added=[]
    for uname in data.get("usernames", []):
        u = users_coll.find_one({"username": uname})
        if not u: continue
        shares_coll.update_one(
            {"roomId": roomId, "userId": str(u["_id"])},
            {"$set": {"roomId": roomId, "userId": str(u["_id"]), "username": uname, "role":"editor"}},
            upsert=True
        )
        added.append(uname)
    return jsonify({"status":"ok","added": added})

@rooms_bp.route("/rooms/<roomId>/strokes", methods=["POST"])
def post_stroke(roomId):
    claims = _authed_user()
    if not claims: return jsonify({"status":"error","message":"Unauthorized"}), 401
    room = rooms_coll.find_one({"_id": ObjectId(roomId)})
    if not room: return jsonify({"status":"error","message":"Room not found"}), 404
    if not _ensure_member(claims["sub"], room): return jsonify({"status":"error","message":"Forbidden"}), 403

    payload = request.get_json(force=True)  # {stroke:{...}, signature?, signerPubKey?}
    stroke = payload["stroke"]
    stroke["roomId"] = roomId
    stroke["user"]   = claims["username"]
    stroke["ts"]     = int(time.time() * 1000)

    # Secure rooms must include wallet signature
    if room["type"] == "secure":
        sig = payload.get("signature"); spk = payload.get("signerPubKey")
        if not (sig and spk):
            return jsonify({"status":"error","message":"Signature required for secure room"}), 400
        # Verify signature (ed25519)
        try:
            import nacl.signing, nacl.encoding
            vk = nacl.signing.VerifyKey(spk, encoder=nacl.encoding.HexEncoder)
            # Canonical message = JSON with stable key order
            msg = json.dumps({
                "roomId": roomId, "user": stroke["user"], "color": stroke["color"],
                "lineWidth": stroke["lineWidth"], "pathData": stroke["pathData"], "timestamp": stroke.get("timestamp", stroke["ts"])
            }, separators=(',', ':'), sort_keys=True).encode()
            vk.verify(msg, bytes.fromhex(sig))
        except Exception:
            return jsonify({"status":"error","message":"Bad signature"}), 400
        stroke["walletSignature"] = sig
        stroke["walletPubKey"]    = spk

    # Encrypt content for private & secure rooms
    asset_data = {}
    if room["type"] in ("private","secure"):
        rk = unwrap_room_key(room["wrappedKey"])
        enc = encrypt_for_room(rk, json.dumps(stroke).encode())
        asset_data = {"roomId": roomId, "type": room["type"], "encrypted": enc}
        # keep a small Mongo cache for quick reloads
        strokes_coll.insert_one({"roomId": roomId, "ts": stroke["ts"], "blob": enc})
    else:
        asset_data = {"roomId": roomId, "type": "public", "stroke": stroke}
        strokes_coll.insert_one({"roomId": roomId, "ts": stroke["ts"], "stroke": stroke})

    # Commit to ResilientDB via GraphQL using server operator key
    prep = {
        "operation": "CREATE",
        "amount": 1,
        "signerPublicKey": SIGNER_PUBLIC_KEY,
        "signerPrivateKey": SIGNER_PRIVATE_KEY,
        "recipientPublicKey": RECIPIENT_PUBLIC_KEY,
        "asset": { "data": asset_data }
    }
    commit_transaction_via_graphql(prep)

    # Room-scoped undo stack in Redis
    key_base = f"{roomId}:{claims['sub']}"
    redis_client.lpush(f"{key_base}:undo", json.dumps(stroke))
    redis_client.delete(f"{key_base}:redo")

    return jsonify({"status":"ok"})

@rooms_bp.route("/rooms/<roomId>/strokes", methods=["GET"])
def get_strokes(roomId):
    claims = _authed_user()
    if not claims: return jsonify({"status":"error","message":"Unauthorized"}), 401
    room = rooms_coll.find_one({"_id": ObjectId(roomId)})
    if not room: return jsonify({"status":"error","message":"Room not found"}), 404
    if not _ensure_member(claims["sub"], room): return jsonify({"status":"error","message":"Forbidden"}), 403

    items = list(strokes_coll.find({"roomId": roomId}).sort("ts", 1))
    if room["type"] in ("private","secure"):
        rk = unwrap_room_key(room["wrappedKey"])
        out=[]
        for it in items:
            blob = it["blob"]
            raw = decrypt_for_room(rk, blob)
            out.append(json.loads(raw.decode()))
        return jsonify({"status":"ok","strokes": out})
    else:
        return jsonify({"status":"ok","strokes": [it["stroke"] for it in items]})

@rooms_bp.route("/rooms/<roomId>/undo", methods=["POST"])
def room_undo(roomId):
    claims = _authed_user()
    if not claims: return jsonify({"status":"error","message":"Unauthorized"}), 401
    key_base = f"{roomId}:{claims['sub']}"
    last = redis_client.lpop(f"{key_base}:undo")
    if not last: return jsonify({"status":"noop"})
    redis_client.lpush(f"{key_base}:redo", last)
    return jsonify({"status":"ok"})

@rooms_bp.route("/rooms/<roomId>/redo", methods=["POST"])
def room_redo(roomId):
    claims = _authed_user()
    if not claims: return jsonify({"status":"error","message":"Unauthorized"}), 401
    key_base = f"{roomId}:{claims['sub']}"
    last = redis_client.lpop(f"{key_base}:redo")
    if not last: return jsonify({"status":"noop"})
    # In a full implementation we'd re-commit the stroke; you already have redo logic elsewhere.
    redis_client.lpush(f"{key_base}:undo", last)
    return jsonify({"status":"ok"})

@rooms_bp.route("/rooms/<roomId>/clear", methods=["POST"])
def room_clear(roomId):
    claims = _authed_user()
    if not claims: return jsonify({"status":"error","message":"Unauthorized"}), 401
    room = rooms_coll.find_one({"_id": ObjectId(roomId)})
    if not room: return jsonify({"status":"error","message":"Room not found"}), 404
    if not _ensure_member(claims["sub"], room): return jsonify({"status":"error","message":"Forbidden"}), 403
    strokes_coll.delete_many({"roomId": roomId})
    # (Optional) Commit a “clear” event to chain if desired
    return jsonify({"status":"ok"})
