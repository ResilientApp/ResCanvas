"""Slim canvas data route that delegates to service layer."""

from flask import Blueprint, jsonify, request
import logging
from services.canvas_counter import get_canvas_draw_count
from services.canvas_data_service import get_strokes_from_mongo

logger = logging.getLogger(__name__)

canvas_data_bp = Blueprint('canvas_data', __name__)

@canvas_data_bp.route('/getCanvasData', methods=['GET'])
def get_canvas_data():
    """
    Fetch canvas stroke data from MongoDB.
    
    Query parameters:
        - start_ts: Optional start timestamp filter
        - end_ts: Optional end timestamp filter
        - room_id: Optional room ID filter
    """
    try:
        res_canvas_draw_count = get_canvas_draw_count()
        logger.info(f"Canvas draw count from counter: {res_canvas_draw_count}")
    except Exception as e:
        logger.warning(f"Failed to get canvas draw count: {e}")
        res_canvas_draw_count = 0

    start_ts = request.args.get('start_ts')
    end_ts = request.args.get('end_ts')
    room_id = request.args.get('room_id')
    
    if start_ts:
        try:
            start_ts = int(start_ts)
        except Exception:
            start_ts = None
    
    if end_ts:
        try:
            end_ts = int(end_ts)
        except Exception:
            end_ts = None

    try:
        results = get_strokes_from_mongo(start_ts=start_ts, end_ts=end_ts, room_id=room_id)
        
        if room_id:
            results = [r for r in results if r.get('roomId') == room_id]
        
        logger.info(f"Returning {len(results)} strokes for room_id={room_id} range={start_ts}..{end_ts}")
        
        return jsonify({
            'status': 'ok',
            'count': res_canvas_draw_count,
            'data': results
        })
    except Exception as e:
        logger.exception(f"Error fetching canvas data: {e}")
        return jsonify({
            'status': 'error',
            'message': 'Failed to fetch canvas data',
            'count': res_canvas_draw_count,
            'data': []
        }), 500
