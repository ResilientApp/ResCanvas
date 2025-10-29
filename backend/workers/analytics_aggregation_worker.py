"""
Simple aggregation worker for analytics events.
This script can be invoked periodically or run as a long-lived background process
to summarize raw events into per-room aggregates.
"""
import time
import logging
from services.db import analytics_coll, analytics_aggregates_coll, mongo_client
from pymongo import UpdateOne
from collections import Counter, defaultdict

logger = logging.getLogger(__name__)


def extract_stroke_data(room_id):
    """
    Extract actual stroke data from canvasCache.strokes collection.
    Returns stroke count, colors, users, and heatmap coordinates.
    """
    try:
        from collections import Counter, defaultdict
        from services.db import mongo_client
        
        actual_stroke_count = 0
        color_counter = Counter()
        users = set()
        all_points = []
        min_x, min_y = float('inf'), float('inf')
        max_x, max_y = float('-inf'), float('-inf')
        
        # Query for strokes in this room - check both top-level and nested roomId
        query = {
            '$or': [
                {'roomId': room_id},  # Top-level roomId (encrypted or old format)
                {'transactions.0.value.asset.data.stroke.roomId': room_id}  # Nested in transactions
            ]
        }
        
        cursor = mongo_client['canvasCache']['strokes'].find(query)
        
        for doc in cursor:
            try:
                tx = doc.get('transactions', [{}])[0]
                asset_data = tx.get('value', {}).get('asset', {}).get('data', {})
                stroke = asset_data.get('stroke', {})
                
                actual_stroke_count += 1
                
                # Extract color
                color = stroke.get('color')
                if color:
                    color_counter[color] += 1
                
                # Extract user
                user = stroke.get('user')
                if user:
                    users.add(user)
                
                # Extract coordinates
                path_data = stroke.get('pathData', [])
                if path_data and len(path_data) > 0:
                    for point in path_data:
                        if len(point) >= 2:
                            try:
                                x, y = float(point[0]), float(point[1])
                                all_points.append((x, y))
                                min_x = min(min_x, x)
                                min_y = min(min_y, y)
                                max_x = max(max_x, x)
                                max_y = max(max_y, y)
                            except (ValueError, TypeError):
                                # Skip points with invalid coordinates
                                continue
            except Exception as e:
                logger.warning(f"Error extracting data from stroke: {e}")
                continue
        
        # Generate heatmap points
        heatmap_points = []
        if all_points:
            # Normalize coordinates to 0-1 range
            width = max_x - min_x if max_x > min_x else 1
            height = max_y - min_y if max_y > min_y else 1
            
            # Create heatmap points with intensity based on density
            # Use a grid to aggregate nearby points
            grid_size = 20  # 20x20 grid
            grid = defaultdict(int)
            
            for x, y in all_points:
                norm_x = (x - min_x) / width
                norm_y = (y - min_y) / height
                grid_x = int(norm_x * grid_size)
                grid_y = int(norm_y * grid_size)
                grid[(grid_x, grid_y)] += 1
            
            # Convert grid to heatmap points
            max_intensity = max(grid.values()) if grid else 1
            
            for (gx, gy), count in grid.items():
                heatmap_points.append({
                    'x': (gx + 0.5) / grid_size,  # Center of grid cell
                    'y': (gy + 0.5) / grid_size,
                    'intensity': min(1.0, count / max(max_intensity * 0.3, 1))  # Scale intensity
                })
            
            # Sort by intensity and limit to top 100 points for performance
            heatmap_points.sort(key=lambda p: p['intensity'], reverse=True)
            heatmap_points = heatmap_points[:100]
        
        return {
            'stroke_count': actual_stroke_count,
            'colors': color_counter,
            'users': users,
            'heatmap_points': heatmap_points
        }
        
    except Exception as e:
        logger.exception(f"Failed to extract stroke data for room {room_id}")
        return {
            'stroke_count': 0,
            'colors': Counter(),
            'users': set(),
            'heatmap_points': []
        }


def aggregate_once(batch_limit=1000):
    # Pull recent unprocessed events. For simplicity we process events by ts window.
    docs = list(analytics_coll.find({}).sort([('ts', -1)]).limit(batch_limit))
    if not docs:
        return 0

    rooms = defaultdict(list)
    for d in docs:
        room_id = d.get('roomId')
        # Skip events with invalid roomId (None, empty, or non-string)
        if room_id and isinstance(room_id, str):
            rooms[room_id].append(d)

    ops = []
    for room, events in rooms.items():
        # Get analytics event data
        event_strokes = sum(1 for e in events if e.get('eventType') == 'stroke_created')
        active_users_from_events = len({e.get('anonUserId') for e in events if e.get('anonUserId')})
        pair_counter = Counter()
        timestamps = [e.get('ts') for e in events if e.get('ts')]
        
        for e in events:
            payload = e.get('payload') or {}
            # collaboration pairs (simple heuristic in payload)
            if payload.get('from') and payload.get('to'):
                pair = (payload.get('from'), payload.get('to'))
                pair_counter[pair] += 1

        # Extract real stroke data from the database
        stroke_data = extract_stroke_data(room)
        
        # Use actual stroke count from database, fallback to events if DB query fails
        total_strokes = stroke_data['stroke_count'] if stroke_data['stroke_count'] > 0 else event_strokes
        
        # Use actual colors from strokes
        top_colors = [c for c, _ in stroke_data['colors'].most_common(10)]
        
        # Use actual user count from strokes
        active_users = len(stroke_data['users']) if stroke_data['users'] else active_users_from_events

        agg = {
            'roomId': room,
            'total_strokes': total_strokes,
            'active_users': active_users,
            'top_colors': top_colors,
            'collaboration_pairs': [ [a,b,count] for (a,b),count in pair_counter.most_common(10) ],
            'heatmap_points': stroke_data['heatmap_points'],  # Real coordinates from stroke data
            'first_ts': min(timestamps) if timestamps else None,
            'last_ts': max(timestamps) if timestamps else None,
            'avg_stroke_rate': (total_strokes / ((max(timestamps)-min(timestamps))/1000)) if total_strokes and len(timestamps) > 1 and max(timestamps) != min(timestamps) else total_strokes,
        }

        # basic anomaly score: high stroke rate or many distinct anon users
        agg['anomaly_score'] = float(min(1.0, (agg['avg_stroke_rate'] / 100.0) + (agg['active_users'] / 100.0)))

        ops.append(UpdateOne({'roomId': room}, {'$set': agg}, upsert=True))

    if ops:
        analytics_aggregates_coll.bulk_write(ops)
    return len(docs)


def run_loop(sleep_secs=10):
    logger.info('Starting analytics aggregation worker loop')
    try:
        while True:
            n = aggregate_once()
            if n == 0:
                time.sleep(sleep_secs)
            else:
                # brief pause to avoid tight loops
                time.sleep(1)
    except KeyboardInterrupt:
        logger.info('Worker stopped')


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    run_loop()
