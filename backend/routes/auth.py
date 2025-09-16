
# routes/auth.py
from flask import Blueprint, request, jsonify, make_response, current_app
from passlib.hash import bcrypt
import re
from datetime import datetime, timedelta, timezone
import jwt, re, os, hashlib, base64
from bson import ObjectId
from services.db import users_coll, refresh_tokens_coll
from config import JWT_SECRET, JWT_ISSUER, ACCESS_TOKEN_EXPIRES_SECS, REFRESH_TOKEN_EXPIRES_SECS, REFRESH_TOKEN_COOKIE_NAME, REFRESH_TOKEN_COOKIE_SECURE, REFRESH_TOKEN_COOKIE_SAMESITE

auth_bp = Blueprint("auth", __name__)

def _mk_access_token(user):
    payload = {
        "iss": JWT_ISSUER,
        "sub": str(user["_id"]),
        "username": user["username"],
        "exp": datetime.now(timezone.utc) + timedelta(seconds=ACCESS_TOKEN_EXPIRES_SECS)
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
    if isinstance(token, bytes):
        token = token.decode('utf-8')
    return token

def _mk_refresh_token():
    raw = base64.urlsafe_b64encode(os.urandom(48)).decode('utf-8')
    h = hashlib.sha256(raw.encode('utf-8')).hexdigest()
    return raw, h

def _store_refresh_token(user_id, token_hash, expires_at):
    doc = {
        "userId": ObjectId(user_id) if not isinstance(user_id, ObjectId) else user_id,
        "tokenHash": token_hash,
        "createdAt": datetime.utcnow(),
        "expiresAt": expires_at,
        "revoked": False
    }
    refresh_tokens_coll.insert_one(doc)

def _delete_refresh_token_hash(token_hash):
    refresh_tokens_coll.delete_many({"tokenHash": token_hash})

def _find_valid_refresh_token(token_hash):
    now = datetime.utcnow()
    doc = refresh_tokens_coll.find_one({
        "tokenHash": token_hash,
        "revoked": False,
        "expiresAt": {"$gt": now}
    })
    return doc

@auth_bp.route("/auth/register", methods=["POST"])
def register():
    body = request.get_json() or {}
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    wallet = body.get("walletPubKey")
    if not re.match(r"^[A-Za-z0-9_\\-\\.]{3,128}$", username):
        return jsonify({"status":"error","message":"Invalid username"}), 400
    if len(password) < 6:
        return jsonify({"status":"error","message":"Password too short"}), 400
    if users_coll.find_one({"username": username}):
        return jsonify({"status":"error","message":"Username already exists"}), 409
    pwd_hash = bcrypt.hash(password)
    user_doc = {"username": username, "pwd": pwd_hash, "createdAt": datetime.utcnow(), "role": "user"}
    if wallet:
        user_doc["walletPubKey"] = wallet
    users_coll.insert_one(user_doc)
    user = users_coll.find_one({"username": username}, {"pwd":0})
    access = _mk_access_token(user)
    raw_refresh, h = _mk_refresh_token()
    expires_at = datetime.utcnow() + timedelta(seconds=REFRESH_TOKEN_EXPIRES_SECS)
    _store_refresh_token(user["_id"], h, expires_at)
    resp = make_response(jsonify({"status":"ok","token": access, "user": {"username": user["username"], "walletPubKey": user.get("walletPubKey")}}), 201)
    resp.set_cookie(REFRESH_TOKEN_COOKIE_NAME, raw_refresh, httponly=True, secure=REFRESH_TOKEN_COOKIE_SECURE, samesite=REFRESH_TOKEN_COOKIE_SAMESITE, max_age=REFRESH_TOKEN_EXPIRES_SECS)
    return resp

@auth_bp.route("/auth/login", methods=["POST"])
def login():
    body = request.get_json() or {}
    username = body.get("username") or ""
    password = body.get("password") or ""
    user = users_coll.find_one({"username": username})
    if not user:
        return jsonify({"status":"error","message":"Invalid username or password"}), 401
    if not bcrypt.verify(password, user["pwd"]):
        return jsonify({"status":"error","message":"Invalid username or password"}), 401
    access = _mk_access_token(user)
    raw_refresh, h = _mk_refresh_token()
    expires_at = datetime.utcnow() + timedelta(seconds=REFRESH_TOKEN_EXPIRES_SECS)
    _store_refresh_token(user["_id"], h, expires_at)
    resp = make_response(jsonify({"status":"ok","token": access, "user": {"username": user["username"], "walletPubKey": user.get("walletPubKey")}}))
    resp.set_cookie(REFRESH_TOKEN_COOKIE_NAME, raw_refresh, httponly=True, secure=REFRESH_TOKEN_COOKIE_SECURE, samesite=REFRESH_TOKEN_COOKIE_SAMESITE, max_age=REFRESH_TOKEN_EXPIRES_SECS)
    return resp

@auth_bp.route("/auth/refresh", methods=["POST"])
def refresh():
    raw = request.cookies.get(REFRESH_TOKEN_COOKIE_NAME)
    if not raw:
        return jsonify({"status":"error","message":"Missing refresh token"}), 401
    token_hash = hashlib.sha256(raw.encode('utf-8')).hexdigest()
    doc = _find_valid_refresh_token(token_hash)
    if not doc:
        return jsonify({"status":"error","message":"Invalid or expired refresh token"}), 401
    _delete_refresh_token_hash(token_hash)
    user = users_coll.find_one({"_id": doc["userId"]})
    access = _mk_access_token(user)
    new_raw, new_h = _mk_refresh_token()
    expires_at = datetime.utcnow() + timedelta(seconds=REFRESH_TOKEN_EXPIRES_SECS)
    _store_refresh_token(user["_id"], new_h, expires_at)
    resp = make_response(jsonify({"status":"ok","token": access}))
    resp.set_cookie(REFRESH_TOKEN_COOKIE_NAME, new_raw, httponly=True, secure=REFRESH_TOKEN_COOKIE_SECURE, samesite=REFRESH_TOKEN_COOKIE_SAMESITE, max_age=REFRESH_TOKEN_EXPIRES_SECS)
    return resp

@auth_bp.route("/auth/logout", methods=["POST"])
def logout():
    raw = request.cookies.get(REFRESH_TOKEN_COOKIE_NAME)
    if raw:
        token_hash = hashlib.sha256(raw.encode('utf-8')).hexdigest()
        _delete_refresh_token_hash(token_hash)
    resp = make_response(jsonify({"status":"ok"}))
    resp.delete_cookie(REFRESH_TOKEN_COOKIE_NAME)
    return resp

@auth_bp.route("/auth/me", methods=["GET"])
def me():
    auth = request.headers.get("Authorization","")
    if not auth.startswith("Bearer "):
        return jsonify({"status":"error","message":"Missing token"}), 401
    token = auth.split(" ",1)[1]
    try:
        claims = jwt.decode(token, JWT_SECRET, algorithms=["HS256"], options={"require":["exp","sub"]})
    except Exception as e:
        return jsonify({"status":"error","message":"Invalid token"}), 401
    user = users_coll.find_one({"username": claims["username"]}, {"pwd":0})
    if not user:
        return jsonify({"status":"error","message":"User not found"}), 404
    return jsonify({"status":"ok","user": {"id": str(user["_id"]), "username": user["username"], "walletPubKey": user.get("walletPubKey"), "role": user.get("role","user")}})


@auth_bp.route("/users/search", methods=["GET"])
def users_search():
    q = (request.args.get("q") or "").strip()
    if not q:
        return jsonify({"status":"ok", "users": []})
    regex = {"$regex": f"^{re.escape(q)}", "$options":"i"}
    results = []
    for u in users_coll.find({"username": regex}).limit(30):
        results.append({"id": str(u["_id"]), "username": u["username"]})
    return jsonify({"status":"ok", "users": results})
