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
 * @returns {Promise<{reply: string}>} - The bot's reply
 */
export const postChatMessage = async (roomId, message, history = []) => {
  const body = { message, history };
  return apiClient.post(`/rooms/${roomId}/chatbot/message`, body);
};
