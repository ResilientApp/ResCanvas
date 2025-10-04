from flask import request
from flask import current_app
from flask_socketio import join_room, leave_room, emit
from services.socketio import socketio
from services.db import rooms_coll, shares_coll, users_coll
from config import JWT_SECRET
import jwt
from bson import ObjectId

@socketio.on('connect')
def handle_connect():
    # Clients should supply token as query parameter: ?token=...
    token = request.args.get('token')
    if not token:
        # allow anonymous connections but do not join personal rooms
        return
    try:
        claims = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
        user_id = claims.get('sub')
        if user_id:
            # join personal room for notifications
            join_room(f"user:{user_id}")
            # optionally emit a connected ack
            emit('connected', {'userId': user_id})
    except Exception:
        # ignore invalid token (no personal room)
        return

@socketio.on('join_room')
def on_join_room(data):
    """
    Client requests to join a room channel to receive real-time strokes & events.
    Data: {roomId: "<roomId>"}
    """
    token = request.args.get('token')
    user_id = None
    if token:
        try:
            claims = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
            user_id = claims.get('sub')
        except Exception:
            user_id = None
    room_id = data.get('roomId')
    if not room_id:
        return
    room = rooms_coll.find_one({"_id": ObjectId(room_id)})
    if not room:
        return
    # If private/secure, ensure membership
    if room.get('type') in ('private','secure'):
        if not user_id:
            return
        share = shares_coll.find_one({'roomId': str(room['_id']), 'userId': user_id})
        if not share:
            # not allowed
            return
    # join the socket room
    join_room(f"room:{room_id}")
    # Emit a generic joined_room acknowledge
    emit('joined_room', {'roomId': room_id})
    # If we know the username, broadcast a user_joined event to the room channel
    try:
        username = None
        if user_id:
            # find username if available
            u = users_coll.find_one({'_id': ObjectId(user_id)}) if user_id and ObjectId.is_valid(user_id) else None
            if u:
                username = u.get('username')
        if username:
            # compile current member list (usernames)
            members_cursor = shares_coll.find({'roomId': str(room['_id'])}, {'username': 1})
            members = [m.get('username') for m in members_cursor if m and m.get('username')]
            emit('user_joined', {'roomId': room_id, 'userId': user_id, 'username': username, 'members': members}, room=f"room:{room_id}")
    except Exception:
        pass

@socketio.on('leave_room')
def on_leave_room(data):
    room_id = data.get('roomId')
    if room_id:
        leave_room(f"room:{room_id}")
        emit('left_room', {'roomId': room_id})
        try:
            # If token present, try to look up user for event; request.args available may contain token
            token = request.args.get('token')
            username = None
            if token:
                try:
                    claims = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
                    uid = claims.get('sub')
                    if uid and ObjectId.is_valid(uid):
                        u = users_coll.find_one({'_id': ObjectId(uid)})
                        if u: username = u.get('username')
                except Exception:
                    username = None
            if username:
                members_cursor = shares_coll.find({'roomId': room_id}, {'username': 1})
                members = [m.get('username') for m in members_cursor if m and m.get('username')]
                emit('user_left', {'roomId': room_id, 'username': username, 'members': members}, room=f"room:{room_id}")
        except Exception:
            pass
