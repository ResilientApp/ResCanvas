import React, { useEffect, useRef } from 'react';
import { Box, Typography, Paper } from '@mui/material';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ChatBubble from './ChatBubble';
import ChatInput from './ChatInput';
import '../../styles/Chat.css';

/**
 * AIAssistantChat - Main chat window component for AI assistant
 * 
 * @param {string} roomId - The room ID where the chat is happening
 * @param {Array} messages - Chat messages array (controlled from parent)
 * @param {boolean} isLoading - Loading state (controlled from parent)
 * @param {Function} onSendMessage - Callback to send message (controlled from parent)
 * @param {Object} canvasContext - Current canvas context (object count, active users, etc.)
 */
const AIAssistantChat = ({ roomId, messages, isLoading, onSendMessage, canvasContext }) => {
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (text) => {
    onSendMessage(text, roomId, canvasContext);
  };

  return (
    <Paper elevation={3} className="ai-assistant-chat">
      <Box className="chat-header">
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SmartToyIcon />
          AI Assistant
        </Typography>
      </Box>
      
      <Box className="chat-messages">
        {messages.length === 0 ? (
          <Box className="chat-empty-state">
            <Typography variant="body2" color="text.secondary">
              Start a conversation with the AI assistant!
            </Typography>
          </Box>
        ) : (
          messages.map((message, index) => (
            <ChatBubble key={index} message={message} />
          ))
        )}
        <div ref={messagesEndRef} />
      </Box>
      
      <ChatInput onSend={handleSend} isLoading={isLoading} />
    </Paper>
  );
};

export default AIAssistantChat;
