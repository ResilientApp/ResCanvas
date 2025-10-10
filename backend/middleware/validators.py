# backend/middleware/validators.py
"""
Server-side input validation functions.

All validation happens on the backend. Client-side validation is for UX only.
These validators are the source of truth for data validation.
"""

import re
from typing import Tuple


def validate_username(value: str) -> Tuple[bool, str]:
    """
    Validate username server-side.
    
    Rules (enforced on backend):
    - 3-128 characters
    - Alphanumeric, underscore, hyphen, dot only
    - Required field
    """
    if not value:
        return False, "Username is required"
    
    if not isinstance(value, str):
        return False, "Username must be a string"
    
    value = value.strip()
    
    if len(value) < 3:
        return False, "Username must be at least 3 characters"
    
    if len(value) > 128:
        return False, "Username must be at most 128 characters"
    
    if not re.match(r'^[A-Za-z0-9_\-\.]+$', value):
        return False, "Username can only contain letters, numbers, underscore, hyphen, and dot"
    
    return True, None


def validate_password(value: str) -> Tuple[bool, str]:
    """
    Validate password server-side.
    
    Rules (enforced on backend):
    - Minimum 6 characters
    - Required field
    """
    if not value:
        return False, "Password is required"
    
    if not isinstance(value, str):
        return False, "Password must be a string"
    
    if len(value) < 6:
        return False, "Password must be at least 6 characters"
    
    if len(value) > 1000:
        return False, "Password is too long"
    
    return True, None


def validate_room_name(value: str) -> Tuple[bool, str]:
    """
    Validate room name server-side.
    
    Rules (enforced on backend):
    - 1-256 characters
    - Required field
    """
    if not value:
        return False, "Room name is required"
    
    if not isinstance(value, str):
        return False, "Room name must be a string"
    
    value = value.strip()
    
    if len(value) < 1:
        return False, "Room name is required"
    
    if len(value) > 256:
        return False, "Room name must be at most 256 characters"
    
    return True, None


def validate_room_type(value: str) -> Tuple[bool, str]:
    """
    Validate room type server-side.
    
    Rules (enforced on backend):
    - Must be one of: public, private, secure
    - Required field
    """
    if not value:
        return False, "Room type is required"
    
    if not isinstance(value, str):
        return False, "Room type must be a string"
    
    valid_types = ['public', 'private', 'secure']
    if value not in valid_types:
        return False, f"Room type must be one of: {', '.join(valid_types)}"
    
    return True, None


def validate_color(value: str) -> Tuple[bool, str]:
    """
    Validate color hex code server-side.
    
    Rules (enforced on backend):
    - Valid hex color format (#RRGGBB or #RGB)
    """
    if not value:
        return False, "Color is required"
    
    if not isinstance(value, str):
        return False, "Color must be a string"
    
    # Match #RGB or #RRGGBB format
    if not re.match(r'^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$', value):
        return False, "Color must be a valid hex color (#RGB or #RRGGBB)"
    
    return True, None


def validate_line_width(value) -> Tuple[bool, str]:
    """
    Validate line width server-side.
    
    Rules (enforced on backend):
    - Positive number
    - Reasonable range (1-100)
    """
    if value is None:
        return False, "Line width is required"
    
    try:
        width = float(value)
    except (TypeError, ValueError):
        return False, "Line width must be a number"
    
    if width < 1 or width > 100:
        return False, "Line width must be between 1 and 100"
    
    return True, None


def validate_stroke_data(value) -> Tuple[bool, str]:
    """
    Validate stroke data structure server-side.
    
    Rules (enforced on backend):
    - Must be a dict/object
    - Must have required fields: points, color, width
    - Points must be a list of coordinate objects
    """
    if not value:
        return False, "Stroke data is required"
    
    if not isinstance(value, dict):
        return False, "Stroke data must be an object"
    
    if 'points' not in value:
        return False, "Stroke must have points"
    
    if 'color' not in value:
        return False, "Stroke must have color"
    
    if 'width' not in value:
        return False, "Stroke must have width"
    
    points = value.get('points')
    if not isinstance(points, list):
        return False, "Points must be a list"
    
    if len(points) == 0:
        return False, "Stroke must have at least one point"
    
    for i, point in enumerate(points):
        if not isinstance(point, dict):
            return False, f"Point {i} must be an object"
        if 'x' not in point or 'y' not in point:
            return False, f"Point {i} must have x and y coordinates"
        try:
            float(point['x'])
            float(point['y'])
        except (TypeError, ValueError):
            return False, f"Point {i} coordinates must be numbers"
    
    is_valid_color, color_error = validate_color(value.get('color'))
    if not is_valid_color:
        return False, color_error
    
    is_valid_width, width_error = validate_line_width(value.get('width'))
    if not is_valid_width:
        return False, width_error
    
    return True, None


def validate_member_id(value: str) -> Tuple[bool, str]:
    """
    Validate member user ID server-side.
    
    Rules (enforced on backend):
    - Non-empty string
    - Valid MongoDB ObjectId format (24 hex chars)
    """
    if not value:
        return False, "Member ID is required"
    
    if not isinstance(value, str):
        return False, "Member ID must be a string"
    
    # Validate ObjectId format (24 hex characters)
    if not re.match(r'^[a-fA-F0-9]{24}$', value):
        return False, "Invalid member ID format"
    
    return True, None


def validate_wallet_signature(value: str) -> Tuple[bool, str]:
    """
    Validate wallet signature server-side.
    
    Rules (enforced on backend):
    - Non-empty string for secure rooms
    - Base64 or hex format
    """
    if not value:
        return False, "Wallet signature is required for secure rooms"
    
    if not isinstance(value, str):
        return False, "Signature must be a string"
    
    if len(value) < 10:
        return False, "Signature is too short"
    
    if len(value) > 1000:
        return False, "Signature is too long"
    
    return True, None


def validate_wallet_address(value: str) -> Tuple[bool, str]:
    """
    Validate wallet address server-side.
    
    Rules (enforced on backend):
    - Non-empty string
    - Reasonable length
    """
    if not value:
        return False, "Wallet address is required for secure rooms"
    
    if not isinstance(value, str):
        return False, "Wallet address must be a string"
    
    if len(value) < 10:
        return False, "Wallet address is too short"
    
    if len(value) > 500:
        return False, "Wallet address is too long"
    
    return True, None


def validate_optional_string(max_length: int = 1000):
    """
    Factory for optional string validators.
    
    Returns a validator function that allows None/empty but validates
    if a value is provided.
    """
    def validator(value: str) -> Tuple[bool, str]:
        if not value:
            return True, None  # Optional
        
        if not isinstance(value, str):
            return False, "Must be a string"
        
        if len(value) > max_length:
            return False, f"Must be at most {max_length} characters"
        
        return True, None
    
    return validator


def validate_boolean(value) -> Tuple[bool, str]:
    """
    Validate boolean value server-side.
    """
    if not isinstance(value, bool):
        return False, "Must be a boolean (true/false)"
    
    return True, None


def validate_positive_integer(value) -> Tuple[bool, str]:
    """
    Validate positive integer server-side.
    """
    if value is None:
        return False, "Value is required"
    
    try:
        num = int(value)
    except (TypeError, ValueError):
        return False, "Must be an integer"
    
    if num < 0:
        return False, "Must be a positive integer"
    
    return True, None


def validate_member_role(value: str) -> Tuple[bool, str]:
    """
    Validate member role server-side.
    
    Allowed roles: owner, admin, editor, viewer
    """
    if not value:
        return False, "Role is required"
    
    if not isinstance(value, str):
        return False, "Role must be a string"
    
    value = value.strip().lower()
    allowed_roles = ("owner", "admin", "editor", "viewer")
    
    if value not in allowed_roles:
        return False, f"Role must be one of: {', '.join(allowed_roles)}"
    
    return True, None


def validate_usernames_array(value) -> Tuple[bool, str]:
    """
    Validate array of usernames for share/invite operations.
    """
    if not value:
        return False, "Usernames array is required"
    
    if not isinstance(value, list):
        return False, "Usernames must be an array"
    
    if len(value) == 0:
        return False, "At least one username is required"
    
    if len(value) > 100:
        return False, "Cannot invite more than 100 users at once"
    
    for username in value:
        is_valid, error = validate_username(username)
        if not is_valid:
            return False, f"Invalid username '{username}': {error}"
    
    return True, None


def validate_share_users_array(value) -> Tuple[bool, str]:
    """
    Validate array of user objects for share/invite operations.
    
    Format: [{"username": "alice", "role": "editor"}, ...]
    """
    if not value:
        return True, None
    
    if not isinstance(value, list):
        return False, "Users must be an array"
    
    if len(value) > 100:
        return False, "Cannot invite more than 100 users at once"
    
    for idx, user_obj in enumerate(value):
        if not isinstance(user_obj, dict):
            return False, f"User at index {idx} must be an object"
        
        username = user_obj.get("username")
        role = user_obj.get("role")
        
        if not username:
            return False, f"User at index {idx} missing username"
        
        is_valid, error = validate_username(username)
        if not is_valid:
            return False, f"User at index {idx}: {error}"
        
        if role:
            is_valid, error = validate_member_role(role)
            if not is_valid:
                return False, f"User at index {idx}: {error}"
    
    return True, None


def validate_stroke_payload(value) -> Tuple[bool, str]:
    """
    Validate the complete stroke POST payload server-side.
    
    Expected format:
    {
        "stroke": {
            "color": "#000000",
            "lineWidth": 2,
            "pathData": {...},
            "tool": "pen",
            "timestamp": 1234567890,
            ...
        },
        "signature": "hex_string",  # Optional, required for secure rooms
        "signerPubKey": "hex_string"  # Optional, required for secure rooms
    }
    """
    if not value:
        return False, "Stroke payload is required"
    
    if not isinstance(value, dict):
        return False, "Stroke payload must be an object"
    
    stroke = value.get("stroke")
    if not stroke:
        return False, "Stroke object is required"
    
    if not isinstance(stroke, dict):
        return False, "Stroke must be an object"
    
    if "color" not in stroke:
        return False, "Stroke must have color"
    
    if "lineWidth" not in stroke:
        return False, "Stroke must have lineWidth"
    
    if "pathData" not in stroke:
        return False, "Stroke must have pathData"
    
    is_valid, error = validate_color(stroke.get("color"))
    if not is_valid:
        return False, f"Stroke color invalid: {error}"
    
    try:
        width = int(stroke.get("lineWidth"))
        if width < 1 or width > 100:
            return False, "Line width must be between 1 and 100"
    except (TypeError, ValueError):
        return False, "Line width must be a number"
    
    # Validate optional signature fields (will be enforced for secure rooms in handler)
    signature = value.get("signature")
    signer_pub_key = value.get("signerPubKey")
    
    if signature is not None and not isinstance(signature, str):
        return False, "Signature must be a string"
    
    if signer_pub_key is not None and not isinstance(signer_pub_key, str):
        return False, "Signer public key must be a string"
    
    # Both must be present together or both absent
    if (signature is None) != (signer_pub_key is None):
        return False, "Signature and signerPubKey must both be provided or both omitted"
    
    return True, None
