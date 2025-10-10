"""MongoDB document parsing utilities for canvas data."""

def try_int(v, default=None):
    """Safe int conversion supporting bytes and Mongo numeric wrappers."""
    try:
        if v is None:
            return default
        if isinstance(v, (bytes, bytearray)):
            v = v.decode()
        if isinstance(v, dict) and "$numberLong" in v:
            return int(v["$numberLong"])
        if isinstance(v, str) and v.isdigit():
            return int(v)
        if isinstance(v, (int, float)):
            return int(v)
    except Exception:
        return default
    return default

def extract_number(v, default=0):
    """Extract number from various MongoDB number formats."""
    try:
        if v is None:
            return default
        if isinstance(v, dict) and '$numberLong' in v:
            return int(v['$numberLong'])
        if isinstance(v, (int, float)):
            return int(v)
        if isinstance(v, str) and v.isdigit():
            return int(v)
    except Exception:
        pass
    return default

def extract_number_long(v):
    """Extract $numberLong value from MongoDB documents."""
    if not v:
        return None
    if isinstance(v, dict) and "$numberLong" in v:
        try:
            return int(v["$numberLong"])
        except Exception:
            return None
    if isinstance(v, (int, float)):
        return int(v)
    return None

def parse_inner_value_to_dict(maybe_str):
    """Parse inner value that might be a JSON string."""
    import json
    if not maybe_str:
        return {}
    if isinstance(maybe_str, dict):
        return maybe_str
    if isinstance(maybe_str, str):
        try:
            return json.loads(maybe_str)
        except Exception:
            return {}
    return {}

def find_ts_in_doc(doc):
    """Find the best timestamp in a MongoDB document."""
    if not doc or not isinstance(doc, dict):
        return None
    
    try:
        txs = doc.get("transactions") or []
        if not isinstance(txs, list):
            return None
        
        for tx in reversed(txs):
            if not isinstance(tx, dict):
                continue
            
            val = tx.get("value") or {}
            if not isinstance(val, dict):
                continue
            
            asset = val.get("asset") or {}
            if isinstance(asset, dict):
                asset_data = asset.get("data") or {}
                if isinstance(asset_data, dict):
                    for key in ("timestamp", "ts", "order"):
                        cand = asset_data.get(key)
                        result = extract_number_long(cand)
                        if result is not None:
                            return result
            
            metadata = val.get("metadata") or {}
            if isinstance(metadata, dict):
                for key in ("timestamp", "ts"):
                    cand = metadata.get(key)
                    result = extract_number_long(cand)
                    if result is not None:
                        return result
        
        meta_block = doc.get("metadata") or {}
        if isinstance(meta_block, dict):
            for key in ("timestamp", "ts"):
                cand = meta_block.get(key)
                result = extract_number_long(cand)
                if result is not None:
                    return result
    except Exception:
        pass
    
    return None

def extract_user_and_inner_value(doc):
    """Extract user and inner value from a MongoDB document."""
    if not doc or not isinstance(doc, dict):
        return None, {}
    
    txs = doc.get("transactions") or []
    if not isinstance(txs, list):
        return None, {}
    
    user = None
    inner_val = {}
    
    for tx in reversed(txs):
        if not isinstance(tx, dict):
            continue
        
        val = tx.get("value") or {}
        if not isinstance(val, dict):
            continue
        
        asset = val.get("asset") or {}
        if isinstance(asset, dict):
            asset_data = asset.get("data") or {}
            if isinstance(asset_data, dict):
                if not user:
                    user = asset_data.get("user")
                if not inner_val:
                    iv = asset_data.get("value") or asset_data.get("pathData")
                    inner_val = parse_inner_value_to_dict(iv)
                if user and inner_val:
                    break
    
    return user, inner_val

def normalize_numberlong_in_obj(o):
    """Recursively normalize $numberLong fields in an object."""
    if isinstance(o, dict):
        if "$numberLong" in o:
            try:
                return int(o["$numberLong"])
            except Exception:
                return o
        return {k: normalize_numberlong_in_obj(v) for k, v in o.items()}
    elif isinstance(o, list):
        return [normalize_numberlong_in_obj(item) for item in o]
    else:
        return o

def id_repr(doc):
    """Safe representation of a document _id for logging."""
    try:
        if not doc:
            return '<no-doc>'
        _id = doc.get('_id') if isinstance(doc, dict) else None
        return str(_id) if _id is not None else '<no-id>'
    except Exception:
        return '<invalid-id>'
