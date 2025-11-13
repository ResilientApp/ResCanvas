def get_bot_reply(message: str, room_id: str, user_id: str):
    """
    Generate a bot reply based on the user's message.
    
    Args:
        message: The user's message to the bot
        room_id: The room ID where the message was sent
        user_id: The ID of the user sending the message
        
    Returns:
        A string reply from the bot
    """
    if message.lower() == 'hello':
        return 'Hello Vincent, this is your ResCanvas bot!'
    else:
        return 'I can only say hello for now, next step is to call gpt-4o-mini to get some real responses.'
