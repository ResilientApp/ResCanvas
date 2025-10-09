# Rewrap room wrappedKeys when rotating the master key.
# Usage: python3 scripts/rewrap_rooms.py <oldMasterB64> <newMasterB64> [roomId1,roomId2,...] or --all

import sys
import base64
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from services.db import rooms_coll
from bson import ObjectId

def rewrap_room_doc(room_doc, old_b64, new_b64):
    old_master = AESGCM(base64.b64decode(old_b64))
    new_master = AESGCM(base64.b64decode(new_b64))
    wrapped = room_doc.get("wrappedKey")
    if not wrapped:
        return False, "no wrappedKey"
    nonce = base64.b64decode(wrapped["nonce"])
    ct = base64.b64decode(wrapped["ct"])
    try:
        raw = old_master.decrypt(nonce, ct, None)
    except Exception as e:
        return False, f"decrypt failed: {e}"
    n2 = os.urandom(12)
    ct2 = new_master.encrypt(n2, raw, None)
    new_wrapped = {"nonce": base64.b64encode(n2).decode(), "ct": base64.b64encode(ct2).decode()}
    rooms_coll.update_one({"_id": room_doc["_id"]}, {"$set": {"wrappedKey": new_wrapped}})
    return True, "rewrapped"

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 scripts/rewrap_rooms.py <oldMasterB64> <newMasterB64> [roomId1,roomId2,...] or --all")
        sys.exit(2)
    old_b64 = sys.argv[1]
    new_b64 = sys.argv[2]
    target = sys.argv[3] if len(sys.argv) > 3 else "--all"
    if target == "--all":
        cursor = rooms_coll.find({"wrappedKey": {"$exists": True}})
    else:
        ids = target.split(",")
        q = {"$or": []}
        for rid in ids:
            try:
                q["$or"].append({"_id": ObjectId(rid)})
            except Exception:
                q["$or"].append({"_id": rid})
                q["$or"].append({"roomId": rid})
        cursor = rooms_coll.find(q)
    total = 0; ok = 0; bad = 0
    for r in cursor:
        total += 1
        success, msg = rewrap_room_doc(r, old_b64, new_b64)
        if success:
            ok += 1
        else:
            bad += 1
            print(f"ROOM {_id_repr(r)} FAILED: {msg}")
    print(f"Done. total={total}, ok={ok}, bad={bad}")

def _id_repr(r):
    return str(r.get("_id")) if r else "<unknown>"

if __name__ == "__main__":
    main()
