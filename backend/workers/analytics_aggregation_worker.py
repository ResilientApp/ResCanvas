"""
Simple aggregation worker for analytics events.
This script can be invoked periodically or run as a long-lived background process
to summarize raw events into per-room aggregates.
"""
import time
import logging
from services.db import analytics_coll, analytics_aggregates_coll
from pymongo import UpdateOne
from collections import Counter, defaultdict

logger = logging.getLogger(__name__)


def aggregate_once(batch_limit=1000):
    # Pull recent unprocessed events. For simplicity we process events by ts window.
    docs = list(analytics_coll.find({}).sort([('ts', -1)]).limit(batch_limit))
    if not docs:
        return 0

    rooms = defaultdict(list)
    for d in docs:
        rooms[d.get('roomId')].append(d)

    ops = []
    for room, events in rooms.items():
        total_strokes = sum(1 for e in events if e.get('eventType') == 'stroke_created')
        active_users = len({e.get('anonUserId') for e in events if e.get('anonUserId')})
        color_counter = Counter()
        pair_counter = Counter()
        timestamps = [e.get('ts') for e in events if e.get('ts')]
        for e in events:
            payload = e.get('payload') or {}
            if payload.get('color'):
                color_counter[payload.get('color')] += 1
            # collaboration pairs (simple heuristic in payload)
            if payload.get('from') and payload.get('to'):
                pair = (payload.get('from'), payload.get('to'))
                pair_counter[pair] += 1

        agg = {
            'roomId': room,
            'total_strokes': total_strokes,
            'active_users': active_users,
            'top_colors': [c for c, _ in color_counter.most_common(10)],
            'collaboration_pairs': [ [a,b,count] for (a,b),count in pair_counter.most_common(10) ],
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
