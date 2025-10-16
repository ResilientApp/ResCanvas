"""
API v1: Notification Endpoints

Versioned notification API for external applications.
All routes are prefixed with /api/v1/notifications

Endpoints:
- GET /api/v1/notifications - List user's notifications
- DELETE /api/v1/notifications - Clear all notifications
- POST /api/v1/notifications/<id>/mark-read - Mark notification as read
- DELETE /api/v1/notifications/<id> - Delete specific notification
- GET /api/v1/notifications/preferences - Get notification preferences
- PATCH /api/v1/notifications/preferences - Update notification preferences
"""

from flask import Blueprint
from routes.rooms import (
    list_notifications,
    clear_notifications,
    mark_notification_read,
    delete_notification,
    notification_preferences
)

# Create v1 notifications blueprint with /api/v1/notifications prefix
notifications_v1_bp = Blueprint('notifications_v1', __name__, url_prefix='/api/v1/notifications')

# Notification management
notifications_v1_bp.add_url_rule('', 'list_notifications', list_notifications, methods=['GET'])
notifications_v1_bp.add_url_rule('', 'clear_notifications', clear_notifications, methods=['DELETE'])
notifications_v1_bp.add_url_rule('/<nid>/mark-read', 'mark_notification_read', mark_notification_read, methods=['POST'])
notifications_v1_bp.add_url_rule('/<nid>', 'delete_notification', delete_notification, methods=['DELETE'])
notifications_v1_bp.add_url_rule('/preferences', 'notification_preferences', notification_preferences, methods=['GET', 'PATCH'])
