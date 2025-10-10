# Quick local simulation of get_strokes filtering logic

def simulate_get_strokes(items, redis_clear=None, mongo_clear=None, start=None, end=None):
    # items: list of stroke dicts with ts
    # redis_clear: int or None
    # mongo_clear: int or None
    clear_after = 0
    if redis_clear is not None:
        clear_after = redis_clear
    elif mongo_clear is not None:
        clear_after = mongo_clear

    history_mode = bool(start is not None or end is not None)
    start_ts = start
    end_ts = end

    out = []
    for it in items:
        st_ts = it.get('ts')
        if st_ts is None:
            continue
        if not history_mode and st_ts <= clear_after:
            continue
        if history_mode:
            if start_ts is not None and st_ts < start_ts:
                continue
            if end_ts is not None and st_ts > end_ts:
                continue
        out.append(it)
    return out

if __name__ == '__main__':
    items = [
        {'id':'A','ts':1000},
        {'id':'B','ts':2000},
        {'id':'C','ts':3000},
        {'id':'D','ts':4000},
        {'id':'E','ts':5000},
    ]
    print('No clear, normal mode:', [s['id'] for s in simulate_get_strokes(items)])
    print('Clear at 3500, normal mode:', [s['id'] for s in simulate_get_strokes(items, redis_clear=3500)])
    print('Clear at 3500, history full range:', [s['id'] for s in simulate_get_strokes(items, redis_clear=3500, start=0, end=10000)])
    print('Redis flushed, mongo clear 3500, normal mode:', [s['id'] for s in simulate_get_strokes(items, redis_clear=None, mongo_clear=3500)])
    print('Redis flushed, mongo clear 3500, history full:', [s['id'] for s in simulate_get_strokes(items, redis_clear=None, mongo_clear=3500, start=0, end=10000)])
