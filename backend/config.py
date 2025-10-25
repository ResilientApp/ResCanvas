import os
from dotenv import load_dotenv
load_dotenv()

MONGO_ATLAS_URI_SECRET = os.getenv("MONGO_ATLAS_URI")
RES_DB_BASE_URI = os.getenv("RES_DB_BASE_URI")
RES_DB_API_COMMIT = f"{RES_DB_BASE_URI}/v1/transactions/commit"
RES_DB_API_QUERY = f"{RES_DB_BASE_URI}/v1/transactions/"
HEADERS = {"Content-Type": "application/json"}

SIGNER_PUBLIC_KEY = os.getenv("SIGNER_PUBLIC_KEY")
SIGNER_PRIVATE_KEY = os.getenv("SIGNER_PRIVATE_KEY")
RECIPIENT_PUBLIC_KEY = SIGNER_PUBLIC_KEY

GRAPHQL_URL = os.getenv("RESILIENTDB_GRAPHQL_URI")
MONGO_URI = os.getenv("MONGO_ATLAS_URI")
DB_NAME = "canvasCache"
COLLECTION_NAME = "strokes"

LOG_FILE = "backend_graphql.log"

# Analytics / LLM configuration
ANALYTICS_ENABLED = os.getenv("ANALYTICS_ENABLED", "True") == "True"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
ANALYTICS_COLLECTION_NAME = os.getenv("ANALYTICS_COLLECTION_NAME", "analytics_events")
ANALYTICS_AGGREGATES_COLLECTION = os.getenv("ANALYTICS_AGGREGATES_COLLECTION", "analytics_aggregates")

JWT_SECRET = os.getenv("JWT_SECRET", "dev-insecure-change-me")
JWT_ISSUER = "rescanvas"

ACCESS_TOKEN_EXPIRES_SECS = int(os.getenv("ACCESS_TOKEN_EXPIRES_SECS", str(7*24*3600)))  # default is 7 days or 7*24*3600 (so no auto logout within this period)
REFRESH_TOKEN_EXPIRES_SECS = int(os.getenv("REFRESH_TOKEN_EXPIRES_SECS", str(30*24*3600)))  # default is 30 days or 30*24*3600

REFRESH_TOKEN_COOKIE_NAME = os.getenv("REFRESH_TOKEN_COOKIE_NAME", "rescanvas_refresh")
REFRESH_TOKEN_COOKIE_SECURE = os.getenv("REFRESH_TOKEN_COOKIE_SECURE", "False") == "True"
REFRESH_TOKEN_COOKIE_SAMESITE = os.getenv("REFRESH_TOKEN_COOKIE_SAMESITE", "Lax")

ROOM_MASTER_KEY_B64 = os.getenv("ROOM_MASTER_KEY_B64")
if not ROOM_MASTER_KEY_B64:
    import os, base64
    ROOM_MASTER_KEY_B64 = base64.b64encode(os.urandom(32)).decode()