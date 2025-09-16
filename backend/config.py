import os
from dotenv import load_dotenv
load_dotenv()


MONGO_ATLAS_URI_SECRET = os.getenv("MONGO_ATLAS_URI")
RES_DB_BASE_URI = os.getenv("RES_DB_BASE_URI")
RES_DB_API_COMMIT = f"{RES_DB_BASE_URI}/v1/transactions/commit"
RES_DB_API_QUERY = f"{RES_DB_BASE_URI}/v1/transactions/"
HEADERS = {"Content-Type": "application/json"}

SIGNER_PUBLIC_KEY    = os.getenv("SIGNER_PUBLIC_KEY")
SIGNER_PRIVATE_KEY   = os.getenv("SIGNER_PRIVATE_KEY")
RECIPIENT_PUBLIC_KEY = SIGNER_PUBLIC_KEY

GRAPHQL_URL = os.getenv("RESILIENTDB_GRAPHQL_URI")
MONGO_URI = os.getenv("MONGO_ATLAS_URI")
DB_NAME = "canvasCache"
COLLECTION_NAME = "strokes"

LOG_FILE = "backend_graphql.log"

JWT_SECRET        = os.getenv("JWT_SECRET", "dev-insecure-change-me")
JWT_ISSUER        = "rescanvas"
JWT_EXPIRES_SECS  = int(os.getenv("JWT_EXPIRES_SECS", "1209600"))  # DEPRECATED - kept for compatibility (14 days)

# New token timing
ACCESS_TOKEN_EXPIRES_SECS = int(os.getenv('ACCESS_TOKEN_EXPIRES_SECS', str(15*60)))  # 15 minutes
REFRESH_TOKEN_EXPIRES_SECS = int(os.getenv('REFRESH_TOKEN_EXPIRES_SECS', str(7*24*3600)))  # 7 days

# Refresh token cookie settings
REFRESH_TOKEN_COOKIE_NAME = os.getenv('REFRESH_TOKEN_COOKIE_NAME', 'rescanvas_refresh')
REFRESH_TOKEN_COOKIE_SECURE = os.getenv('REFRESH_TOKEN_COOKIE_SECURE', 'False') == 'True'
REFRESH_TOKEN_COOKIE_SAMESITE = os.getenv('REFRESH_TOKEN_COOKIE_SAMESITE', 'Lax')


# Per-room key is wrapped with this master key (32 bytes, base64)
ROOM_MASTER_KEY_B64 = os.getenv("ROOM_MASTER_KEY_B64")  # REQUIRED in prod
if not ROOM_MASTER_KEY_B64:
    # Dev fallback: generate ephemeral (OK for local dev only)
    import os, base64
    ROOM_MASTER_KEY_B64 = base64.b64encode(os.urandom(32)).decode()