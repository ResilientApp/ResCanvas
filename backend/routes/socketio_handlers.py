from flask import request
from flask import current_app
from flask_socketio import join_room, leave_room, emit
from services.socketio import socketio
from services.db import rooms_coll, shares_coll, users_coll
import logging
from config import JWT_SECRET
import jwt
from bson import ObjectId

"""Map socket sid -> decoded JWT claims for quick lookup in handlers.
Allows handlers to access authenticated identity without re-parsing.
"""
_connected_claims = {}

@socketio.on('connect')
def handle_connect():
    # Clients should supply token as query parameter: ?token=...
    token = request.args.get('token')
    # Log connection attempt details
    try:
        transport = request.args.get('transport') or request.environ.get('wsgi.websocket') or request.environ.get('werkzeug.server.shutdown')
    except Exception:
        transport = None
    try:
        sid = request.sid
    except Exception:
        sid = request.environ.get('socketio.sid')
    logging.getLogger(__name__).info('socket: connect attempt token_present=%s remote_addr=%s transport=%s sid=%s', bool(token), request.remote_addr, transport, sid)
    if not token:
        # allow anonymous connections but do not join personal rooms
        return
    try:
        claims = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
        user_id = claims.get('sub')
        if user_id:
            # persist claims for this socket session so future handlers can access them
            try:
                    sid = request.sid
                    _connected_claims[sid] = claims
                    logging.getLogger(__name__).info('socket: stored claims for sid=%s user=%s', sid, user_id)
            except Exception:
                pass
            # join personal room for notifications
            join_room(f"user:{user_id}")
            # optionally emit a connected ack
            emit('connected', {'userId': user_id})
    except Exception:
        # ignore invalid token (no personal room)
        return


@socketio.on('disconnect')
def handle_disconnect():
    try:
        sid = request.sid
        if sid and sid in _connected_claims:
            _connected_claims.pop(sid, None)
    except Exception:
        pass

@socketio.on('join_room')
def on_join_room(data):
    """
    Client requests to join a room channel to receive real-time strokes & events.
    Data: {roomId: "<roomId>"}
    """
    token = None
    token_source = None
    if isinstance(data, dict) and data.get('token'):
        token = data.get('token')
        token_source = 'payload'
    if not token:
        token = request.args.get('token')
        if token:
            token_source = 'query'
    user_id = None
    username = None
    claims = None
    # Try token from payload first, then request args, then cached claims for this socket sid
    if token:
        try:
            claims = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
            user_id = claims.get('sub')
            username = claims.get('username')
            logging.getLogger(__name__).info('socket: decoded claims from %s for user=%s', token_source, user_id)
        except Exception:
            user_id = None
            username = None
    # If still no claims, attempt to use cached claims keyed by sid
    if not claims:
        try:
            sid = request.sid
            cached = _connected_claims.get(sid)
            if cached:
                claims = cached
                user_id = claims.get('sub')
                username = claims.get('username')
                logging.getLogger(__name__).info('socket: using cached claims for sid=%s user=%s', sid, user_id)
        except Exception:
            pass
    room_id = data.get('roomId')
    if not room_id:
        return
    room = rooms_coll.find_one({"_id": ObjectId(room_id)})
    try:
        sid = request.sid
    except Exception:
        sid = request.environ.get('socketio.sid')
    logging.getLogger(__name__).info('socket: join_room request sid=%s room=%s token_present=%s user=%s username=%s', sid, room_id, bool(token), user_id, username)
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
    # DEBUG: always emit a room-level debug event so we can confirm broadcasts
    try:
        debug_payload = {'roomId': room_id, 'sid': sid, 'userId': user_id, 'username': username}
        logging.getLogger(__name__).info('socket: debug broadcast to room %s payload=%s', room_id, debug_payload)
        emit('user_joined_debug', debug_payload, room=f"room:{room_id}")
    except Exception:
        pass
    # If we know the username, broadcast a user_joined event to the room channel
    try:
        # Prefer username from decoded claims; fallback to userId string if necessary
        username_to_emit = username or (user_id if user_id else None)
        had_cached = False
        try:
            cached = _connected_claims.get(sid)
            had_cached = bool(cached)
        except Exception:
            cached = None
        if username_to_emit:
            members_cursor = shares_coll.find({'roomId': str(room['_id'])}, {'username': 1})
            members = [m.get('username') for m in members_cursor if m and m.get('username')]
            payload = {'roomId': room_id, 'userId': user_id, 'username': username_to_emit, 'members': members}
            logging.getLogger(__name__).info('socket: emitting user_joined to room %s payload=%s sid=%s had_cached_claims=%s', room_id, payload, sid, had_cached)
            # Broadcast to the room (including the sender)
            emit('user_joined', payload, room=f"room:{room_id}")
            # Also send a small debug event directly back to the requester so we can confirm
            # delivery to this specific socket during debugging sessions. Include useful debug info.
            try:
                emit('server_debug', {'action': 'emitted_user_joined', 'sid': sid, 'had_cached_claims': had_cached, 'payload': payload}, room=None)
            except Exception:
                pass
    except Exception:
        logging.getLogger(__name__).exception('socket: error while attempting to emit user_joined for room %s', room_id)

@socketio.on('leave_room')
def on_leave_room(data):
    room_id = data.get('roomId')
    if room_id:
        leave_room(f"room:{room_id}")
        emit('left_room', {'roomId': room_id})
        try:
            token = request.args.get('token')
            username_to_emit = None
            if token:
                try:
                    claims = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
                    username_to_emit = claims.get('username') or claims.get('sub')
                except Exception:
                    username_to_emit = None
            if username_to_emit:
                members_cursor = shares_coll.find({'roomId': room_id}, {'username': 1})
                members = [m.get('username') for m in members_cursor if m and m.get('username')]
                payload = {'roomId': room_id, 'username': username_to_emit, 'members': members}
                logging.getLogger(__name__).info('socket: emitting user_left to room %s payload=%s', room_id, payload)
                emit('user_left', payload, room=f"room:{room_id}")
        except Exception:
            pass
