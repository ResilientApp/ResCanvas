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

mongo_client = MongoClient(MONGO_URI, server_api=ServerApi('1'))
strokes_coll = mongo_client[DB_NAME][COLLECTION_NAME]

redis_client = redis.Redis(host='localhost', port=6379, db=0)

lock = threading.Lock()
