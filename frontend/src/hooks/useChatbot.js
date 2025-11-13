import { useState, useCallback } from 'react';
import { postChatMessage } from '../api/chatbotApi';

/**
 * Custom hook for managing chatbot interactions
 * 
 * Manages conversation state and handles sending/receiving messages
 * with the AI chatbot service.
 * 
 * @returns {Object} Chatbot state and functions
 * @returns {Array} messages - Array of chat messages with sender and text
 * @returns {boolean} isLoading - Whether a message is currently being processed
 * @returns {Function} sendMessage - Function to send a message to the bot
 */
export const useChatbot = () => {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Send a message to the chatbot
   * 
   * @param {string} userMessage - The user's message text
   * @param {string} roomId - The room ID where the conversation is happening
   */
  const sendMessage = useCallback(async (userMessage, roomId) => {
    setIsLoading(true);

    // Add user message to chat immediately
    setMessages(prev => [...prev, { sender: 'user', text: userMessage }]);

    try {
      // Send message to backend API
      console.log('[Chatbot] Sending message:', { roomId, userMessage });
      const response = await postChatMessage(roomId, userMessage, messages);
      console.log('[Chatbot] Received response:', response);
      const botReply = response.reply;

      // Add bot's reply to chat
      setMessages(prev => [...prev, { sender: 'bot', text: botReply }]);
    } catch (error) {
      console.error('[Chatbot] API error:', error);
      console.error('[Chatbot] Error details:', {
        message: error.message,
        status: error.status,
        data: error.data,
        stack: error.stack
      });
      
      // Add error message to chat for user visibility
      setMessages(prev => [
        ...prev,
        {
          sender: 'bot',
          text: 'Sorry, I encountered an error. Please try again.',
          isError: true
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [messages]);

  return {
    messages,
    isLoading,
    sendMessage
  };
};
