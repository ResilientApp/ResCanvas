# services/db.py

import threading
import redis
from pymongo import MongoClient
from pymongo.server_api import ServerApi
import logging
from logging.handlers import RotatingFileHandler
from config import *

logging.basicConfig(
    level=logging.DEBUG,  # adjust to DEBUG for development
    format="%(asctime)s [%(levelname)s] %(name)s:%(lineno)d – %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)

handler = RotatingFileHandler(
    LOG_FILE, maxBytes=1*1024*1024, backupCount=1
)
handler.setLevel(logging.DEBUG)
handler.setFormatter(logging.Formatter(
    "%(asctime)s [%(levelname)s] %(name)s:%(lineno)d – %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
))
logging.getLogger().addHandler(handler)

logger = logging.getLogger(__name__)

# Use a short serverSelectionTimeoutMS so the app fails fast when MongoDB is
# unreachable. Without this, PyMongo can hang for a long time (default ~30s)
# during server selection, which causes HTTP requests (like login) to appear
# to "time out" from the client side. 5 seconds is a reasonable dev timeout.
mongo_client = MongoClient(MONGO_URI, server_api=ServerApi('1'), serverSelectionTimeoutMS=5000)
strokes_coll = mongo_client[DB_NAME][COLLECTION_NAME]
users_coll   = mongo_client[DB_NAME]["users"]
rooms_coll   = mongo_client[DB_NAME]["rooms"]
shares_coll  = mongo_client[DB_NAME]["room_shares"]  # records who can access
refresh_tokens_coll = mongo_client[DB_NAME]["refresh_tokens"]  # store refresh token hashes for sessions
invites_coll = mongo_client[DB_NAME]["room_invites"]
notifications_coll = mongo_client[DB_NAME]["notifications"]
# Dedicated collection to persist compact cut-record indexes so rebuilds can
# repopulate Redis even when other legacy payload shapes are hard to parse.
cuts_coll = mongo_client[DB_NAME]["cuts"]

# TTL index on refresh token expiresAt so expired refresh tokens are removed automatically
try:
    refresh_tokens_coll.create_index("expiresAt", expireAfterSeconds=0)
except Exception:
    pass

# Helpful indexes
try:
    invites_coll.create_index([("invitedUserId",1), ("status",1)])
    notifications_coll.create_index([("userId",1), ("read",1)])
    rooms_coll.create_index([("ownerId",1), ("archived",1)])
    try:
        cuts_coll.create_index([("roomId",1), ("cutId",1)], unique=True)
    except Exception:
        pass
except Exception:
    pass

settings_coll = mongo_client[DB_NAME]["settings"]    # key-value settings (e.g., master key)

redis_client = redis.Redis(host='localhost', port=6379, db=0)

lock = threading.Lock()

users_coll.create_index("username", unique=True)
rooms_coll.create_index([("ownerId", 1), ("type", 1)])
shares_coll.create_index([("roomId", 1), ("userId", 1)], unique=True)
strokes_coll.create_index([("roomId", 1), ("ts", 1)])