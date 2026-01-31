from flask import request
from flask import current_app
from flask_socketio import join_room, leave_room, emit
from services.socketio import socketio
from services.db import rooms_coll, shares_coll, users_coll
from services.analytics_service import ingest_event
from services.metrics import metrics
import logging
from config import JWT_SECRET
import jwt
from bson import ObjectId

_connected_claims = {}
_active_rooms = set()  # Track which rooms have active users
_room_users = {}  # Track users per room for active_users gauge

@socketio.on('connect')
def handle_connect():
    token = request.args.get('token')
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
        return
    try:
        claims = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
        user_id = claims.get('sub')
        if user_id:
            try:
                    sid = request.sid
                    _connected_claims[sid] = claims
                    logging.getLogger(__name__).info('socket: stored claims for sid=%s user=%s', sid, user_id)
            except Exception:
                pass
            join_room(f"user:{user_id}")
            emit('connected', {'userId': user_id})
            
            # Track socket connections
            metrics.increment("socket_connections_total")
            metrics.inc_gauge("socket_connected_clients")
    except Exception:
        return


# Track which SID is in which rooms for cleanup on disconnect
_sid_rooms = {}  # sid -> set of room_ids
_sid_user = {}   # sid -> user_id

@socketio.on('disconnect')
def handle_disconnect():
    try:
        sid = request.sid
        user_id = None
        
        # Get user info before cleanup
        if sid and sid in _connected_claims:
            claims = _connected_claims.pop(sid, None)
            if claims:
                user_id = claims.get('sub')
        
        # Also check _sid_user
        if sid in _sid_user:
            user_id = _sid_user.pop(sid, None)
        
        # Clean up room tracking for this session
        if sid in _sid_rooms:
            rooms_to_leave = _sid_rooms.pop(sid, set())
            for room_id in rooms_to_leave:
                if room_id in _room_users and user_id:
                    _room_users[room_id].discard(user_id)
                    # If room is now empty, remove from active rooms
                    if len(_room_users[room_id]) == 0:
                        _active_rooms.discard(room_id)
                        del _room_users[room_id]
            
            # Update gauges after cleanup
            metrics.set_gauge("active_rooms", len(_active_rooms))
            total_users = sum(len(users) for users in _room_users.values())
            metrics.set_gauge("active_users", total_users)
        
        # Track socket disconnection
        metrics.increment("socket_disconnections_total")
        metrics.dec_gauge("socket_connected_clients")
        
    except Exception:
        logging.getLogger(__name__).exception('socket: error in disconnect handler')

@socketio.on('join_room')
def on_join_room(data):
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
    if token:
        try:
            claims = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
            user_id = claims.get('sub')
            username = claims.get('username')
            logging.getLogger(__name__).info('socket: decoded claims from %s for user=%s', token_source, user_id)
        except Exception:
            user_id = None
            username = None
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
    if room.get('type') in ('private','secure'):
        if not user_id:
            return
        # Check if user is owner OR has a share record
        is_owner = room.get('ownerId') == user_id
        share = shares_coll.find_one({'roomId': str(room['_id']), 'userId': user_id})
        if not is_owner and not share:
            return
    join_room(f"room:{room_id}")
    emit('joined_room', {'roomId': room_id})
    
    # Track active rooms and users for metrics
    try:
        sid = request.sid
        _active_rooms.add(room_id)
        if room_id not in _room_users:
            _room_users[room_id] = set()
        if user_id:
            _room_users[room_id].add(user_id)
            # Track this session's room membership for cleanup on disconnect
            if sid not in _sid_rooms:
                _sid_rooms[sid] = set()
            _sid_rooms[sid].add(room_id)
            _sid_user[sid] = user_id
        # Update gauges
        metrics.set_gauge("active_rooms", len(_active_rooms))
        total_users = sum(len(users) for users in _room_users.values())
        metrics.set_gauge("active_users", total_users)
    except Exception:
        pass
    
    try:
        debug_payload = {'roomId': room_id, 'sid': sid, 'userId': user_id, 'username': username}
        logging.getLogger(__name__).info('socket: debug broadcast to room %s payload=%s', room_id, debug_payload)
        emit('user_joined_debug', debug_payload, room=f"room:{room_id}")
    except Exception:
        pass
    try:
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
            emit('user_joined', payload, room=f"room:{room_id}")
            try:
                # record join event for analytics (anonymized inside service)
                ingest_event({
                    'roomId': room_id,
                    'userId': user_id,
                    'eventType': 'join',
                    'payload': {'username': username_to_emit}
                })
            except Exception:
                pass
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
        
        # Update active rooms/users metrics
        try:
            token = request.args.get('token')
            user_id = None
            if token:
                try:
                    claims = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
                    user_id = claims.get('sub')
                except Exception:
                    pass
            
            # Remove user from room tracking
            if room_id in _room_users and user_id:
                _room_users[room_id].discard(user_id)
                # If room is now empty, remove from active rooms
                if len(_room_users[room_id]) == 0:
                    _active_rooms.discard(room_id)
                    del _room_users[room_id]
            
            # Update gauges
            metrics.set_gauge("active_rooms", len(_active_rooms))
            total_users = sum(len(users) for users in _room_users.values())
            metrics.set_gauge("active_users", total_users)
        except Exception:
            pass
        
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
                try:
                    ingest_event({
                        'roomId': room_id,
                        'userId': None,  # leave events can be anonymous
                        'eventType': 'leave',
                        'payload': {'username': username_to_emit}
                    })
                except Exception:
                    pass
        except Exception:
            pass