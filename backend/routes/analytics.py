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
    if room:
        # Return data for a specific room
        q = {"roomId": str(room)}
        ag = analytics_aggregates_coll.find_one(q) or {}
        ag.pop('_id', None)
        return jsonify(ag)
    else:
        # Return aggregated data across all rooms
        all_aggs = list(analytics_aggregates_coll.find({}))
        if not all_aggs:
            return jsonify({
                "total_strokes": 0,
                "active_users": 0,
                "total_rooms": 0,
                "top_colors": [],
                "collaboration_pairs": [],
                "heatmap_points": []
            })
        
        # Aggregate across all rooms
        total_strokes = sum(ag.get('total_strokes', 0) for ag in all_aggs)
        all_users = set()
        color_counter = {}
        collab_pairs = {}
        all_heatmap_points = []
        
        for ag in all_aggs:
            # Collect unique users across all rooms
            if ag.get('active_users'):
                all_users.add(ag.get('roomId'))  # Using roomId as proxy since we have anon users
            
            # Aggregate colors
            for color in ag.get('top_colors', []):
                color_counter[color] = color_counter.get(color, 0) + 1
            
            # Aggregate collaboration pairs
            for pair in ag.get('collaboration_pairs', []):
                if len(pair) >= 3:
                    key = (pair[0], pair[1])
                    collab_pairs[key] = collab_pairs.get(key, 0) + pair[2]
            
            # Collect heatmap points from all rooms
            room_heatmap = ag.get('heatmap_points', [])
            if room_heatmap:
                all_heatmap_points.extend(room_heatmap)
        
        # Sort and limit
        top_colors = sorted(color_counter.items(), key=lambda x: x[1], reverse=True)[:10]
        top_colors = [c for c, _ in top_colors]
        
        collab_pairs_list = sorted(collab_pairs.items(), key=lambda x: x[1], reverse=True)[:10]
        collab_pairs_list = [[a, b, count] for (a, b), count in collab_pairs_list]
        
        # Use real heatmap points from stroke data
        # Limit to top 200 most intense points across all rooms for performance
        all_heatmap_points.sort(key=lambda p: p.get('intensity', 0), reverse=True)
        heatmap_points = all_heatmap_points[:200]
        
        result = {
            "total_strokes": total_strokes,
            "active_users": sum(ag.get('active_users', 0) for ag in all_aggs),
            "total_rooms": len(all_aggs),
            "top_colors": top_colors,
            "collaboration_pairs": collab_pairs_list,
            "heatmap_points": heatmap_points
        }
        
        return jsonify(result)


@analytics_bp.route('/api/analytics/insights', methods=['POST'])
def insights():
    data = request.get_json() or {}
    room = data.get('roomId')
    
    if room:
        # Generate insights for a specific room
        q = {"roomId": str(room)}
        ag = analytics_aggregates_coll.find_one(q) or {}
    else:
        # Generate insights across all rooms
        all_aggs = list(analytics_aggregates_coll.find({}))
        if not all_aggs:
            ag = {}
        else:
            # Create aggregated data
            total_strokes = sum(ag.get('total_strokes', 0) for ag in all_aggs)
            color_counter = {}
            collab_pairs = {}
            
            for agg_doc in all_aggs:
                for color in agg_doc.get('top_colors', []):
                    color_counter[color] = color_counter.get(color, 0) + 1
                for pair in agg_doc.get('collaboration_pairs', []):
                    if len(pair) >= 3:
                        key = (pair[0], pair[1])
                        collab_pairs[key] = collab_pairs.get(key, 0) + pair[2]
            
            top_colors = sorted(color_counter.items(), key=lambda x: x[1], reverse=True)[:10]
            top_colors = [c for c, _ in top_colors]
            
            collab_pairs_list = sorted(collab_pairs.items(), key=lambda x: x[1], reverse=True)[:10]
            collab_pairs_list = [[a, b, count] for (a, b), count in collab_pairs_list]
            
            ag = {
                "total_strokes": total_strokes,
                "active_users": sum(agg_doc.get('active_users', 0) for agg_doc in all_aggs),
                "total_rooms": len(all_aggs),
                "top_colors": top_colors,
                "collaboration_pairs": collab_pairs_list,
                "avg_stroke_rate": sum(agg_doc.get('avg_stroke_rate', 0) for agg_doc in all_aggs) / len(all_aggs) if all_aggs else 0,
                "anomaly_score": sum(agg_doc.get('anomaly_score', 0) for agg_doc in all_aggs) / len(all_aggs) if all_aggs else 0
            }
    
    try:
        res = generate_insights(ag)
        return jsonify(res)
    except Exception:
        logger.exception('Failed to generate insights')
        return jsonify({"error": "failed"}), 500


@analytics_bp.route('/api/analytics/health', methods=['GET'])
def health():
    return jsonify({"ok": True})
