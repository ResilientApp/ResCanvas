# services/db.py

import threading
import os
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

mongo_client = MongoClient(MONGO_URI, server_api=ServerApi('1'))
strokes_coll = mongo_client[DB_NAME][COLLECTION_NAME]
users_coll   = mongo_client[DB_NAME]["users"]
rooms_coll   = mongo_client[DB_NAME]["rooms"]
shares_coll  = mongo_client[DB_NAME]["room_shares"]  # records who can access
settings_coll = mongo_client[DB_NAME]["settings"]    # key-value settings (e.g., master key)

redis_client = redis.Redis(
    host=os.getenv("REDIS_HOST", "localhost"),
    port=int(os.getenv("REDIS_PORT", "6379")),
    db=int(os.getenv("REDIS_DB", "0"))
)

lock = threading.Lock()

users_coll.create_index("username", unique=True)
rooms_coll.create_index([("ownerId", 1), ("type", 1)])
shares_coll.create_index([("roomId", 1), ("userId", 1)], unique=True)
strokes_coll.create_index([("roomId", 1), ("ts", 1)])