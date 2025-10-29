"""
API v1 Parameter Adapters

These adapters translate between the generic API v1 parameter names
(canvasId, collectionId) and the internal implementation parameters.

This allows external applications to use generic terminology while maintaining
compatibility with the existing backend route handlers.
"""

from functools import wraps
from flask import request

def adapt_canvas_to_room(f):
    """
    Decorator that translates 'canvasId' route parameter to 'roomId'
    for compatibility with internal route handlers.
    
    Usage:
        @canvases_v1_bp.route('/<canvasId>/strokes')
        @adapt_canvas_to_room
        def get_strokes(roomId):  # Handler receives roomId
            ...
    """
    @wraps(f)
    def wrapper(*args, **kwargs):
        if 'canvasId' in kwargs:
            kwargs['roomId'] = kwargs.pop('canvasId')
        return f(*args, **kwargs)
    return wrapper

def adapt_collection_to_room(f):
    """
    Decorator that translates 'collectionId' route parameter to 'roomId'
    for compatibility with internal route handlers.
    """
    @wraps(f)
    def wrapper(*args, **kwargs):
        if 'collectionId' in kwargs:
            kwargs['roomId'] = kwargs.pop('collectionId')
        return f(*args, **kwargs)
    return wrapper

def adapt_member_param(f):
    """
    Decorator that translates 'userId' or 'username' route parameter
    to the format expected by permission update handlers.
    """
    @wraps(f)
    def wrapper(*args, **kwargs):
        if 'userId' in kwargs:
            kwargs['memberId'] = kwargs.pop('userId')
        return f(*args, **kwargs)
    return wrapper
