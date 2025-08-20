# routes/auth.py
from flask import Blueprint, request, jsonify
from passlib.hash import bcrypt
from datetime import datetime, timedelta, timezone
import jwt, re
from services.db import users_coll
from config import JWT_SECRET, JWT_ISSUER, JWT_EXPIRES_SECS

auth_bp = Blueprint("auth", __name__)

def _mk_token(user):
    payload = {
        "iss": JWT_ISSUER,
        "sub": str(user["_id"]),
        "username": user["username"],
        "exp": datetime.now(timezone.utc) + timedelta(seconds=JWT_EXPIRES_SECS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

@auth_bp.route("/auth/register", methods=["POST"])
def register():
    data = request.get_json(force=True)
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if not re.fullmatch(r"[A-Za-z0-9_.-]{3,32}", username):
        return jsonify({"status":"error","message":"Invalid username"}), 400
    if len(password) < 8:
        return jsonify({"status":"error","message":"Password too short"}), 400
    if users_coll.find_one({"username": username}):
        return jsonify({"status":"error","message":"Username taken"}), 409
    user = {
        "username": username,
        "pwd": bcrypt.hash(password),
        "walletPubKey": data.get("walletPubKey") or None,
        "createdAt": datetime.utcnow()
    }
    users_coll.insert_one(user)
    token = _mk_token(user)
    return jsonify({"status":"ok","token":token,"user":{"username":username,"walletPubKey":user["walletPubKey"]}}), 201

@auth_bp.route("/auth/login", methods=["POST"])
def login():
    data = request.get_json(force=True)
    username = data.get("username")
    password = data.get("password")
    user = users_coll.find_one({"username": username})
    if not user or not bcrypt.verify(password, user["pwd"]):
        return jsonify({"status":"error","message":"Bad credentials"}), 401
    # Optional: bind/update wallet pubkey on login
    if data.get("walletPubKey"):
        users_coll.update_one({"_id": user["_id"]}, {"$set": {"walletPubKey": data["walletPubKey"]}})
        user["walletPubKey"] = data["walletPubKey"]
    token = _mk_token(user)
    return jsonify({"status":"ok","token":token,"user":{"username":user["username"],"walletPubKey":user.get("walletPubKey")}})

@auth_bp.route("/auth/me", methods=["GET"])
def me():
    # Accept Authorization: Bearer <token>
    auth = request.headers.get("Authorization","")
    if not auth.startswith("Bearer "):
        return jsonify({"status":"error","message":"Missing token"}), 401
    token = auth.split(" ",1)[1]
    try:
        claims = jwt.decode(token, JWT_SECRET, algorithms=["HS256"], options={"require":["exp","sub"]})
    except Exception as e:
        return jsonify({"status":"error","message":"Invalid token"}), 401
    user = users_coll.find_one({"username": claims["username"]}, {"pwd":0})
    return jsonify({"status":"ok","user": {"id": str(user["_id"]), "username": user["username"], "walletPubKey": user.get("walletPubKey")}})
