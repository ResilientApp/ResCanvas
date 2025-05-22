from secret import *

# RESDB_API_COMMIT = "http://127.0.0.1:18000/v1/transactions/commit"
# RESDB_API_QUERY = "http://127.0.0.1:18000/v1/transactions/"

# RESDB_API_COMMIT = "https://crow.resilientdb.com/v1/transactions/commit"
# RESDB_API_QUERY = "https://crow.resilientdb.com/v1/transactions/"
HEADERS = {"Content-Type": "application/json"}

SIGNER_PUBLIC_KEY    = "FbUGKzKnSgh6bKRw8sxdzaCq1NMjGT6FVeAWLot5bCa1"
SIGNER_PRIVATE_KEY   = "5EzirRSQvWHwtekrg4TYtxBbdJbtgvG25pepGZRWJneC"
RECIPIENT_PUBLIC_KEY = SIGNER_PUBLIC_KEY

GRAPHQL_URL = "http://localhost:8000/graphql"
# RES_DB_BASE_URL = "resilientdb://localhost:18000"
RES_DB_BASE_URL = "resilientdb://crow.resilientdb.com"

# MONGO_URI = "mongodb://localhost:27017"
MONGO_URI = MONGO_ATLAS_URI_SECRET
DB_NAME = "canvasCache"
COLLECTION_NAME = "strokes"

LOG_FILE = "backend_graphql.log"