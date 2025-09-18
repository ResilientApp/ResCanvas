from flask import request
from flask_socketio import join_room, leave_room, emit
from services.socketio import socketio
from services.db import rooms_coll, shares_coll, users_coll
from config import JWT_SECRET
import jwt
from bson import ObjectId

@socketio.on('connect')
def handle_connect():
    token = request.args.get('token')
    if not token:
        return
    try:
        claims = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
        user_id = claims.get('sub')
        if user_id:
            join_room(f"user:{user_id}")
            emit('connected', {'userId': user_id})
    except Exception:
        return

@socketio.on('join_room')
def on_join_room(data):
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
    if room.get('type') in ('private','secure'):
        if not user_id:
            return
        share = shares_coll.find_one({'roomId': str(room['_id']), 'userId': user_id})
        if not share:
            return
    join_room(f"room:{room_id}")
    emit('joined_room', {'roomId': room_id})

@socketio.on('leave_room')
def on_leave_room(data):
    room_id = data.get('roomId')
    if room_id:
        leave_room(f"room:{room_id}")
        emit('left_room', {'roomId': room_id})
