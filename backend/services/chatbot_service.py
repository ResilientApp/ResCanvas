"""
AI-powered chatbot service for ResCanvas using OpenAI's GPT API.
"""

import openai
import os
import json
import logging
from datetime import datetime
from .prompt_templates import RESCANVAS_SYSTEM_PROMPT
from .canvas_service import clear_canvas
from .db import chat_history_coll

logger = logging.getLogger(__name__)


def get_chat_history(room_id: str, limit: int = 50):
    """
    Retrieve chat history for a room from MongoDB.
    
    Args:
        room_id: The room ID to get history for
        limit: Maximum number of messages to retrieve (default 50)
        
    Returns:
        List of chat messages sorted by timestamp (oldest first)
    """
    try:
        # Query chat history, sorted by timestamp descending, limit results
        messages = list(chat_history_coll.find(
            {"roomId": room_id},
            {"_id": 0, "sender": 1, "message": 1, "timestamp": 1}
        ).sort("timestamp", -1).limit(limit))
        
        # Reverse to get chronological order (oldest first)
        messages.reverse()
        
        return messages
    except Exception as e:
        logger.exception(f"Error retrieving chat history for room {room_id}")
        return []


def get_bot_reply(message: str, room_id: str, user_id: str, canvas_context: dict = None):
    """
    Generate a bot reply using OpenAI's GPT API with tool calling support.
    
    Args:
        message: The user's message to the bot
        room_id: The room ID where the message was sent
        user_id: The ID of the user sending the message
        canvas_context: Current canvas state (object count, active users, etc.)
        
    Returns:
        A string reply from the bot
    """
    # Authentication: Check for OpenAI API key
    api_key = os.environ.get('OPENAI_API_KEY')
    if not api_key:
        return 'AI service is not configured.'
    
    # Context Construction: Use real canvas context or fallback to defaults
    if canvas_context is None:
        canvas_context = {
            'room_id': room_id,
            'active_users': [],
            'object_count': 0
        }
    
    # Message Construction: Build the messages list
    messages = [
        {
            "role": "system",
            "content": RESCANVAS_SYSTEM_PROMPT
        },
        {
            "role": "system",
            "content": f"Current Canvas Context: {json.dumps(canvas_context)}"
        },
        {
            "role": "user",
            "content": message
        }
    ]
    
    # Tool Definitions: Define available tools for the AI
    tools = [
        {
            "type": "function",
            "function": {
                "name": "clear_canvas",
                "description": "Clears all drawings and strokes from the current canvas. Use this when the user explicitly asks to clear or delete everything.",
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            }
        }
    ]
    
    try:
        # Save user message to database
        timestamp = datetime.utcnow()
        try:
            chat_history_coll.insert_one({
                "roomId": room_id,
                "userId": user_id,
                "sender": "user",
                "message": message,
                "timestamp": timestamp
            })
        except Exception as e:
            logger.exception(f"Error saving user message to chat history: {e}")
        
        # API Call: Initialize OpenAI client and make the request with tools
        client = openai.Client(api_key=api_key)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            tools=tools
        )
        
        # Tool Call Handling: Check if the AI wants to call a tool
        message_response = response.choices[0].message
        
        bot_reply = None
        
        if message_response.tool_calls:
            # Process each tool call
            for tool_call in message_response.tool_calls:
                if tool_call.function.name == "clear_canvas":
                    # Execute the clear canvas function
                    result = clear_canvas(room_id)
                    
                    if result.get("success"):
                        bot_reply = f"I have cleared the canvas for you. All {result.get('deleted_count', 0)} strokes have been removed."
                    else:
                        bot_reply = f"I attempted to clear the canvas, but encountered an error: {result.get('error', 'Unknown error')}"
            
            # If we processed tool calls but didn't return, fall back to a generic message
            if bot_reply is None:
                bot_reply = "I've processed your request."
        else:
            # Extract response content if no tool calls
            bot_reply = message_response.content
        
        # Save bot reply to database
        try:
            chat_history_coll.insert_one({
                "roomId": room_id,
                "userId": "bot",
                "sender": "bot",
                "message": bot_reply,
                "timestamp": datetime.utcnow()
            })
        except Exception as e:
            logger.exception(f"Error saving bot reply to chat history: {e}")
        
        return bot_reply
    
    except Exception as e:
        # Graceful error handling
        logger.exception(f"Error in get_bot_reply: {e}")
        bot_reply = f"I'm having trouble processing your request right now. Please try again later."
        
        # Try to save error response to history
        try:
            chat_history_coll.insert_one({
                "roomId": room_id,
                "userId": "bot",
                "sender": "bot",
                "message": bot_reply,
                "timestamp": datetime.utcnow()
            })
        except Exception:
            pass
        
        return bot_reply
