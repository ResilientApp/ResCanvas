import logging
from datetime import datetime
from bson import ObjectId
from services.db import notifications_coll, users_coll
from services.socketio_service import push_to_user
from services.room_auth_service import is_notification_allowed

logger = logging.getLogger(__name__)

def create_notification(recipient_id: str, notification_type: str, message: str, metadata: dict = None):
    """
    Create a notification for a user.
    
    Args:
        recipient_id: User ID to notify
        notification_type: Type of notification (e.g., 'room_invite', 'room_share')
        message: Notification message
        metadata: Additional metadata (e.g., roomId, senderId)
    """
    try:
        if not is_notification_allowed(recipient_id, notification_type):
            logger.debug(f"Notification {notification_type} blocked by user preferences for {recipient_id}")
            return None
        
        notification = {
            "userId": recipient_id,
            "type": notification_type,
            "message": message,
            "metadata": metadata or {},
            "read": False,
            "createdAt": datetime.utcnow()
        }
        
        result = notifications_coll.insert_one(notification)
        notification["_id"] = result.inserted_id
        
        try:
            push_to_user(recipient_id, "new_notification", notification)
        except Exception as e:
            logger.error(f"Failed to push notification via socket: {e}")
        
        return notification
    except Exception as e:
        logger.error(f"Error creating notification: {e}")
        return None

def mark_notification_read(notification_id: str, user_id: str):
    """Mark a notification as read."""
    try:
        notifications_coll.update_one(
            {"_id": ObjectId(notification_id), "userId": user_id},
            {"$set": {"read": True}}
        )
        return True
    except Exception as e:
        logger.error(f"Error marking notification as read: {e}")
        return False

def get_user_notifications(user_id: str, unread_only: bool = False):
    """Get all notifications for a user."""
    try:
        query = {"userId": user_id}
        if unread_only:
            query["read"] = False
        
        notifications = list(notifications_coll.find(query).sort("createdAt", -1))
        return notifications
    except Exception as e:
        logger.error(f"Error fetching notifications: {e}")
        return []

def delete_notification(notification_id: str, user_id: str):
    """Delete a notification."""
    try:
        notifications_coll.delete_one(
            {"_id": ObjectId(notification_id), "userId": user_id}
        )
        return True
    except Exception as e:
        logger.error(f"Error deleting notification: {e}")
        return False
