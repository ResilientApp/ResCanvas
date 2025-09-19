from flask import request
from flask_socketio import SocketIO, emit, join_room, leave_room, disconnect
import jwt
from datetime import datetime
from config import JWT_SECRET
from bson import ObjectId

# Singleton SocketIO instance, initialized in app.py
socketio = SocketIO(cors_allowed_origins="*")

# Helpers to emit to logical rooms
def room_name_for_user(user_id: str) -> str:
    return f"user:{user_id}"

def room_name_for_canvas(room_id: str) -> str:
    return f"room:{room_id}"

def push_to_user(user_id: str, event: str, payload: dict):
    socketio.emit(event, payload, to=room_name_for_user(user_id))

def push_to_room(room_id: str, event: str, payload: dict, skip_sid=None):
    socketio.emit(event, payload, to=room_name_for_canvas(room_id), skip_sid=skip_sid)

# Socket event handlers (registered when app initializes)
@socketio.on("connect")
def on_connect(auth=None):
    # Support token in auth or query string (?token=...)
    token = None
    if auth and isinstance(auth, dict):
        token = auth.get("token")
    if not token:
        token = request.args.get("token")
    user_id = None
    username = None
    if token:
        try:
            claims = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            user_id = claims.get("sub")
            username = claims.get("username")
        except Exception:
            pass
    # Store in the connection session dict
    if user_id:
        # auto-join the user's personal room
        join_room(room_name_for_user(user_id))

    # Acknowledge connection (do not leak identity if unauthenticated)
    emit("connected", {"ok": True, "userId": user_id, "username": username})

@socketio.on("join_room")
def on_join_room(data):
    room_id = (data or {}).get("roomId")
    if not room_id:
        return
    join_room(room_name_for_canvas(room_id))
    emit("joined_room", {"roomId": room_id})

@socketio.on("leave_room")
def on_leave_room(data):
    room_id = (data or {}).get("roomId")
    if not room_id:
        return
    leave_room(room_name_for_canvas(room_id))
    emit("left_room", {"roomId": room_id})
