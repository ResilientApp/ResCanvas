#!/usr/bin/env python3
"""
Safe migration script to remove the legacy `hiddenRooms` field from user documents.

Usage:
  python backend/scripts/purge_hidden_rooms.py           # dry-run, shows counts
  python backend/scripts/purge_hidden_rooms.py --apply   # actually unsets the field

This script intentionally defaults to a dry-run. It imports the project's
`services.db.users_coll` so it uses the same MongoDB configuration the app uses.

It performs a simple `update_many` with `{$unset: { hiddenRooms: "" }}` when
--apply is provided. This is a non-reversible operation unless you have DB
backups. The script prints counts before and after.
"""
import sys
import argparse
from datetime import datetime

try:
    # Import the app's DB connection (uses config from services/db.py)
    from services.db import users_coll
except Exception as e:
    print("Failed to import services.db.users_coll. Run this script from the project root and ensure dependencies are installed.")
    print("Error:", e)
    sys.exit(2)

parser = argparse.ArgumentParser(description='Purge hiddenRooms field from users collection (dry-run by default).')
parser.add_argument('--apply', action='store_true', help='Perform the DB update. Without this flag the script runs a dry-run.')
parser.add_argument('--limit-sample', type=int, default=5, help='Number of sample user docs to print that contain hiddenRooms')
args = parser.parse_args()

print('Purge hiddenRooms script')
print('Timestamp:', datetime.utcnow().isoformat() + 'Z')

try:
    query = { 'hiddenRooms': { '$exists': True } }
    count = users_coll.count_documents(query)
    print(f'Users with hiddenRooms present: {count}')

    if count == 0:
        print('Nothing to do.')
        sys.exit(0)

    # Show some sample documents (ids and hiddenRooms length) for manual inspection
    print('\nSample user documents with hiddenRooms:')
    cursor = users_coll.find(query, {'_id': 1, 'username': 1, 'hiddenRooms': 1}).limit(args.limit_sample)
    for u in cursor:
        hid = u.get('hiddenRooms') or []
        print(f" - id={str(u.get('_id'))} username={u.get('username')} hiddenRooms_count={len(hid)} hiddenRooms_sample={hid[:5]}")

    if not args.apply:
        print('\nDry-run mode. To remove the field run with --apply (this will unset the hiddenRooms field on all user documents).')
        sys.exit(0)

    # Confirm again on command line when --apply is used.
    confirm = input('\nType YES to confirm you want to unset hiddenRooms from all users: ')
    if confirm != 'YES':
        print('Confirmation not given. Aborting.')
        sys.exit(1)

    # Perform update
    print('Performing update: unset hiddenRooms on all users...')
    res = users_coll.update_many({}, { '$unset': { 'hiddenRooms': '' } })
    print(f'Modified count: {res.modified_count}  matched_count: {res.matched_count}')

    # Recount
    new_count = users_coll.count_documents(query)
    print(f'Users remaining with hiddenRooms present (should be 0): {new_count}')
    print('Done.')
    sys.exit(0)

except Exception as exc:
    print('Error while examining or updating users collection:', exc)
    sys.exit(3)
