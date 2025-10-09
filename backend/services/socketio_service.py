from flask import request
from flask_socketio import SocketIO, emit, join_room, leave_room, disconnect
import jwt
from datetime import datetime
from config import JWT_SECRET
from bson import ObjectId

# Singleton SocketIO instance, will be initialized in app.py
socketio = None

# Helpers to emit to logical rooms
def room_name_for_user(user_id: str) -> str:
    return f"user:{user_id}"

def room_name_for_canvas(room_id: str) -> str:
    return f"room:{room_id}"

def push_to_user(user_id: str, event: str, payload: dict):
    socketio.emit(event, payload, to=room_name_for_user(user_id))

def push_to_room(room_id: str, event: str, payload: dict, skip_sid=None):
    socketio.emit(event, payload, to=room_name_for_canvas(room_id), skip_sid=skip_sid)

# Socket event handlers - will be registered after socketio is initialized
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
    # Auto-join personal room when token decodes
    try:
        if user_id:
            join_room(room_name_for_user(user_id))
    except Exception:
        import logging
        logging.getLogger(__name__).debug("Socket join_room failed during connect")

    # Acknowledge connection (do not leak identity if unauthenticated)
    try:
        emit("connected", {"ok": True, "userId": user_id, "username": username})
    except Exception:
        import logging
        logging.getLogger(__name__).debug("Socket emit failed during connect")

def on_join_room(data):
    room_id = (data or {}).get("roomId")
    if not room_id:
        return
    join_room(room_name_for_canvas(room_id))
    emit("joined_room", {"roomId": room_id})

def on_leave_room(data):
    room_id = (data or {}).get("roomId")
    if not room_id:
        return
    leave_room(room_name_for_canvas(room_id))
    emit("left_room", {"roomId": room_id})

def register_socketio_handlers():
    """Register event handlers after socketio is initialized"""
    if socketio:
        # Prefer to register richer handlers defined in routes.socketio_handlers
        try:
            import logging
            logging.getLogger(__name__).info('socketio_service: attempting to register routes.socketio_handlers handlers')
            from routes import socketio_handlers as handlers
            # handlers module exposes functions handle_connect, on_join_room, on_leave_room
            if hasattr(handlers, 'handle_connect'):
                socketio.on_event('connect', handlers.handle_connect)
            else:
                socketio.on_event('connect', on_connect)
            if hasattr(handlers, 'on_join_room'):
                socketio.on_event('join_room', handlers.on_join_room)
            else:
                socketio.on_event('join_room', on_join_room)
            if hasattr(handlers, 'on_leave_room'):
                socketio.on_event('leave_room', handlers.on_leave_room)
            else:
                socketio.on_event('leave_room', on_leave_room)
            logging.getLogger(__name__).info('socketio_service: registered handlers from routes.socketio_handlers')
        except Exception:
            # Fallback to local simple handlers if importing fails
            socketio.on_event('connect', on_connect)
            socketio.on_event('join_room', on_join_room)
            socketio.on_event('leave_room', on_leave_room)
