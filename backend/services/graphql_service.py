# services/graphql_service.py

import json
import requests
import logging
from config import *

logger = logging.getLogger(__name__)

def commit_transaction_via_graphql(payload: dict) -> str:
    mutation = """
    mutation PostTransaction($data: PrepareAsset!) {
      postTransaction(data: $data) { id }
    }
    """
    body = {
        "query": mutation,
        "variables": {"data": payload},
        "operationName": "PostTransaction"
    }

    resp = requests.post(
        GRAPHQL_URL,
        json=body,
        headers={**HEADERS, "Content-Type": "application/json"}
    )

    # Parse JSON (or raise if it isn't JSON)
    try:
        result = resp.json()
    except ValueError:
        logger.error("GraphQL did not return JSON:", resp.text)
        resp.raise_for_status()
    
    logger.error(f"[GraphQL {resp.status_code}] response:")
    logger.error(json.dumps(result, indent=2))

    if result.get("errors"):
        errs = result["errors"]
        raise RuntimeError(f"GraphQL errors: {errs}")

    if resp.status_code // 100 != 2:
        raise RuntimeError(f"HTTP {resp.status_code} from GraphQL")

    return result["data"]["postTransaction"]["id"]
