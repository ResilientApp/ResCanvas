import { useState, useCallback, useEffect } from 'react';
import { postChatMessage, getChatHistory } from '../api/chatbotApi';

/**
 * Custom hook for managing chatbot interactions
 * 
 * Manages conversation state and handles sending/receiving messages
 * with the AI chatbot service. Loads chat history from backend on mount.
 * 
 * @param {string} roomId - The room ID to load history for
 * @returns {Object} Chatbot state and functions
 * @returns {Array} messages - Array of chat messages with sender and text
 * @returns {boolean} isLoading - Whether a message is currently being processed
 * @returns {Function} sendMessage - Function to send a message to the bot
 * @returns {Function} resetMessages - Function to clear all messages
 */
export const useChatbot = (roomId) => {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  /**
   * Load chat history from backend when roomId changes
   */
  useEffect(() => {
    if (!roomId || historyLoaded) return;

    const loadHistory = async () => {
      try {
        console.log('[Chatbot] Loading chat history for room:', roomId);
        const response = await getChatHistory(roomId, 50);
        const history = response.history || [];
        
        // Convert backend format to frontend format
        const formattedMessages = history.map(msg => ({
          sender: msg.sender,
          text: msg.message,
          timestamp: msg.timestamp
        }));
        
        setMessages(formattedMessages);
        setHistoryLoaded(true);
        console.log('[Chatbot] Loaded', formattedMessages.length, 'messages from history');
      } catch (error) {
        console.error('[Chatbot] Error loading chat history:', error);
        // Don't block the UI if history fails to load
        setHistoryLoaded(true);
      }
    };

    loadHistory();
  }, [roomId, historyLoaded]);

  /**
   * Reset/clear all chat messages
   */
  const resetMessages = useCallback(() => {
    setMessages([]);
    setHistoryLoaded(false);
  }, []);

  /**
   * Send a message to the chatbot
   * 
   * @param {string} userMessage - The user's message text
   * @param {string} roomId - The room ID where the conversation is happening
   * @param {Object} canvasContext - Current canvas state for context-aware responses
   */
  const sendMessage = useCallback(async (userMessage, roomId, canvasContext = null) => {
    setIsLoading(true);

    // Add user message to chat immediately
    setMessages(prev => [...prev, { sender: 'user', text: userMessage }]);

    try {
      // Send message to backend API with canvas context
      console.log('[Chatbot] Sending message:', { roomId, userMessage, canvasContext });
      const response = await postChatMessage(roomId, userMessage, messages, canvasContext);
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
    sendMessage,
    resetMessages
  };
};
