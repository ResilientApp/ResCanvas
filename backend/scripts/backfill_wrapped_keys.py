#!/usr/bin/env python3
"""
Backfill wrappedKey for private/secure rooms that are missing it.

Policy:
 - Only add a new wrappedKey when there are NO encrypted blobs for the room
   (i.e., no documents with 'blob' or asset.data.encrypted). If encrypted blobs
   exist and wrappedKey is missing, the script will skip the room and report it
   for manual investigation (old master key might be required).

Usage: run from repo root:
  python3 backend/scripts/backfill_wrapped_keys.py

This script uses the project's crypto_service.wrap_room_key so the new wrapped
keys are properly encrypted with the current ROOM_MASTER_KEY_B64.
"""
import sys, os, json
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from services import db
from services.crypto_service import wrap_room_key

def main():
    rooms = list(db.rooms_coll.find({
        "type": {"$in": ["private", "secure"]},
        "$or": [{"wrappedKey": {"$exists": False}}, {"wrappedKey": None}]
    }))
    if not rooms:
        print("No private/secure rooms missing wrappedKey.")
        return

    safe_updated = 0
    skipped = []
    for r in rooms:
        rid = str(r.get("_id"))
        enc_count = db.strokes_coll.count_documents({
            "roomId": rid,
            "$or": [{"blob": {"$exists": True}}, {"asset.data.encrypted": {"$exists": True}}]
        })
        if enc_count > 0:
            skipped.append({"roomId": rid, "enc_docs": enc_count})
            print(f"SKIP {rid}: has {enc_count} encrypted blob(s); manual recovery required")
            continue
        raw = os.urandom(32)
        wrapped = wrap_room_key(raw)
        db.rooms_coll.update_one({"_id": r["_id"]}, {"$set": {"wrappedKey": wrapped}})
        safe_updated += 1
        print(f"UPDATED {rid}: wrappedKey set")

    print("\nSummary:")
    print(f"  rooms processed: {len(rooms)}")
    print(f"  updated safely: {safe_updated}")
    print(f"  skipped (needs manual recovery): {len(skipped)}")
    if skipped:
        print(json.dumps(skipped, indent=2))

if __name__ == '__main__':
    main()