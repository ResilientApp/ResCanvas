# routes/get_canvas_data_room.py
from flask import Blueprint, request, jsonify
from services.db import strokes_coll
import json

get_canvas_room_bp = Blueprint('get_canvas_room', __name__)

@get_canvas_room_bp.route('/getCanvasDataRoom', methods=['GET'])
def get_canvas_data_room():
    roomId = request.args.get('roomId')
    # optional start/end params to filter by ts
    try:
        start = int(request.args.get('start')) if request.args.get('start') else None
    except:
        start = None
    try:
        end = int(request.args.get('end')) if request.args.get('end') else None
    except:
        end = None
    query = {'roomId': roomId} if roomId else {}
    if start is not None or end is not None:
        query['ts'] = {}
        if start is not None: query['ts']['$gte'] = start
        if end is not None: query['ts']['$lte'] = end
    items = list(strokes_coll.find(query).sort('ts', 1))
    out = []
    for it in items:
        if 'blob' in it:
            out.append({'encrypted': it['blob']})
        elif 'stroke' in it:
            out.append(it['stroke'])
    return jsonify({'status':'ok','strokes': out})
