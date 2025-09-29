#!/usr/bin/env python3
"""
Debug the correct canvas counter Redis key
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

import requests
import json
from services.db import redis_client
from services.canvas_counter import get_canvas_draw_count

def debug_correct_counter():
    print("=== CORRECT CANVAS COUNTER DEBUG ===")
    
    print("\n1. Before Redis flush")
    correct_key = redis_client.get('res-canvas-draw-count')
    wrong_key = redis_client.get('canvas-draw-count')
    count_func = get_canvas_draw_count()
    
    print(f"   'res-canvas-draw-count': {correct_key}")
    print(f"   'canvas-draw-count': {wrong_key}")
    print(f"   get_canvas_draw_count(): {count_func}")
    
    print("\n2. After Redis flush")
    redis_client.flushall()
    
    # Try getting count after flush
    try:
        count_after_flush = get_canvas_draw_count()
        print(f"   get_canvas_draw_count() after flush: {count_after_flush}")
    except Exception as e:
        print(f"   get_canvas_draw_count() after flush: ERROR - {e}")
    
    # Check if the key exists
    correct_key_after = redis_client.get('res-canvas-draw-count')
    print(f"   'res-canvas-draw-count' after flush: {correct_key_after}")

if __name__ == "__main__":
    debug_correct_counter()