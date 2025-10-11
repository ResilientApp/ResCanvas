import jwt
import logging
from config import JWT_SECRET
from services.db import shares_coll
from flask import request as flask_request

logger = logging.getLogger(__name__)


def authed_user(request=None):
    """
    Authenticate user via JWT token in Authorization header.
    If `request` is not provided, the function will fall back to Flask's
    `request` object so callers may invoke `authed_user()` without passing
    the request explicitly.

    Returns decoded JWT payload if valid, None otherwise.

    SECURITY: This function ONLY accepts JWT tokens. All fallback authentication
    methods have been removed to prevent security loopholes.
    """
    req = request or flask_request
    auth = req.headers.get("Authorization", "")
    if not auth or not auth.startswith("Bearer "):
        return None

    token = auth.split(" ", 1)[1]
    try:
        decoded = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return decoded
    except jwt.ExpiredSignatureError:
        logger.warning("Expired JWT token attempt")
        return None
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid JWT token: {e}")
        return None
    except Exception as e:
        logger.error(f"JWT validation error: {e}")
        return None

def ensure_member(user_id: str, room):
    """Return True if the given authenticated identity corresponds to a member.

    Historically the app accepted a permissive fallback auth where `sub` was a
    username (e.g. "alice") while the modern JWT `sub` is the user's ObjectId
    string. Membership documents were created under both schemes, so check both
    forms (userId and username) to remain backward-compatible.
    """
    if room.get("ownerId") == user_id:
        return True
    try:
        if shares_coll.find_one({"roomId": str(room["_id"]), "$or": [{"userId": user_id}, {"username": user_id}] } ):
            return True
    except Exception:
        try:
            return shares_coll.find_one({"roomId": str(room["_id"]), "userId": user_id}) is not None
        except Exception:
            return False
    return False

def notification_allowed_for(user_identifier, ntype: str, users_coll):
    """Check the user's notification preferences. user_identifier may be a userId (string) or username.
    If the user has no preferences saved, default to allowing all notifications.
    """
    try:
        query = None
        if isinstance(user_identifier, str) and len(user_identifier) == 24:
            try:
                from bson import ObjectId
                query = {"_id": ObjectId(user_identifier)}
            except Exception:
                query = {"username": user_identifier}
        else:
            query = {"username": user_identifier}
        user = users_coll.find_one(query, {"notificationPreferences": 1})
        if not user:
            return True
        prefs = user.get("notificationPreferences") or {}
        return bool(prefs.get(ntype, True))
    except Exception:
        return True
