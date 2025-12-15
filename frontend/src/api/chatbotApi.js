/**
 * Chatbot API - Endpoints for interacting with the AI chatbot
 * 
 * Authentication: All endpoints require valid JWT token in Authorization header
 * Rate Limiting: 10 requests per minute per user
 */

import apiClient from './apiClient';

/**
 * Send a message to the chatbot
 * Backend: POST /rooms/{roomId}/chatbot/message
 * Middleware: @require_auth + @limiter.limit("10/minute")
 * 
 * @param {string} roomId - The room ID where the message is sent
 * @param {string} message - The user's message to the bot
 * @param {Array} history - Optional conversation history for context
 * @param {Object} canvasContext - Current canvas state (object count, active users, etc.)
 * @returns {Promise<{reply: string}>} - The bot's reply
 */
export const postChatMessage = async (roomId, message, history = [], canvasContext = null) => {
  const body = { message, history, canvas_context: canvasContext };
  return apiClient.post(`/rooms/${roomId}/chatbot/message`, body);
};

/**
 * Get chat history for a room
 * Backend: GET /rooms/{roomId}/chatbot/history
 * Middleware: @require_auth
 * 
 * @param {string} roomId - The room ID to get history for
 * @param {number} limit - Maximum number of messages to retrieve (default 50, max 100)
 * @returns {Promise<{history: Array}>} - Array of chat messages
 */
export const getChatHistory = async (roomId, limit = 50) => {
  return apiClient.get(`/rooms/${roomId}/chatbot/history?limit=${limit}`);
};
