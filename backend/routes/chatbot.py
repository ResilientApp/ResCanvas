from flask import Blueprint, request, jsonify, g
from middleware.auth import require_auth
from middleware.rate_limit import limiter
from services.chatbot_service import get_bot_reply, get_chat_history
import logging

chatbot_bp = Blueprint('chatbot_bp', __name__)
logger = logging.getLogger(__name__)


@chatbot_bp.route('/rooms/<roomId>/chatbot/message', methods=['POST'])
@limiter.limit("10/minute")
@require_auth
def post_chat_message(roomId):
    """
    Handle chatbot messages in a room.
    
    Args:
        roomId: The room ID where the message is sent
        
    Request body:
        message (str): The user's message to the bot
        
    Returns:
        JSON response with the bot's reply
    """
    try:
        # Get the authenticated user ID
        user = g.current_user
        claims = g.token_claims
        user_id = claims["sub"]
        
        # Get the message from request body
        data = request.get_json()
        if not data or 'message' not in data:
            return jsonify({"error": "Missing 'message' field in request body"}), 400
        
        message = data.get('message')
        canvas_context = data.get('canvas_context', {})
        
        # Call the chatbot service
        reply_text = get_bot_reply(message, roomId, user_id, canvas_context)
        
        # Return the bot's reply
        return jsonify({"reply": reply_text})
        
    except Exception as e:
        logger.exception("Error processing chatbot message")
        return jsonify({"error": "Internal server error"}), 500


@chatbot_bp.route('/rooms/<roomId>/chatbot/history', methods=['GET'])
@require_auth
def get_room_chat_history(roomId):
    """
    Retrieve chat history for a room.
    
    Args:
        roomId: The room ID to get history for
        
    Query params:
        limit (int): Maximum number of messages to retrieve (default 50, max 100)
        
    Returns:
        JSON response with chat history
    """
    try:
        # Get limit from query params, default to 50, max 100
        limit = request.args.get('limit', 50, type=int)
        limit = min(limit, 100)  # Cap at 100 messages
        
        # Get chat history from service
        history = get_chat_history(roomId, limit)
        
        return jsonify({"history": history})
        
    except Exception as e:
        logger.exception("Error retrieving chat history")
        return jsonify({"error": "Internal server error"}), 500
