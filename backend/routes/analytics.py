from flask import Blueprint, request, jsonify
from services.db import analytics_aggregates_coll
from services.analytics_service import query_recent
from services.insights_generator import generate_insights
import logging

analytics_bp = Blueprint('analytics_bp', __name__)
logger = logging.getLogger(__name__)


@analytics_bp.route('/api/analytics/recent', methods=['GET'])
def recent_events():
    room = request.args.get('roomId')
    limit = int(request.args.get('limit', '100'))
    docs = query_recent(room, limit=limit)
    # convert ObjectId to str if needed
    def clean(d):
        d = dict(d)
        d.pop('_id', None)
        return d
    return jsonify([clean(d) for d in docs])


@analytics_bp.route('/api/analytics/overview', methods=['GET'])
def overview():
    room = request.args.get('roomId')
    q = {} if not room else {"roomId": str(room)}
    ag = analytics_aggregates_coll.find_one(q) or {}
    ag.pop('_id', None)
    return jsonify(ag)


@analytics_bp.route('/api/analytics/insights', methods=['POST'])
def insights():
    data = request.get_json() or {}
    room = data.get('roomId')
    q = {} if not room else {"roomId": str(room)}
    ag = analytics_aggregates_coll.find_one(q) or {}
    try:
        res = generate_insights(ag)
        return jsonify(res)
    except Exception:
        logger.exception('Failed to generate insights')
        return jsonify({"error": "failed"}), 500


@analytics_bp.route('/api/analytics/health', methods=['GET'])
def health():
    return jsonify({"ok": True})
