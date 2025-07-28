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