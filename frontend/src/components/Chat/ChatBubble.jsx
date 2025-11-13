import React from 'react';
import { Box, Paper, Typography, Avatar } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

/**
 * ChatBubble - Individual message bubble component
 * 
 * @param {Object} message - Message object containing sender and text
 * @param {string} message.sender - Either 'user' or 'bot'
 * @param {string} message.text - The message text content
 * @param {boolean} [message.isError] - Whether this is an error message
 */
const ChatBubble = ({ message }) => {
  const { sender, text, isError } = message;
  const isUser = sender === 'user';

  return (
    <Box
      className={`chat-bubble chat-bubble-${sender}`}
      sx={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        mb: 1.5,
        gap: 1
      }}
    >
      {!isUser && (
        <Avatar
          sx={{
            width: 32,
            height: 32,
            bgcolor: isError ? 'error.main' : 'primary.main'
          }}
        >
          {isError ? <ErrorOutlineIcon fontSize="small" /> : <SmartToyIcon fontSize="small" />}
        </Avatar>
      )}
      
      <Paper
        elevation={1}
        sx={{
          maxWidth: '70%',
          p: 1.5,
          borderRadius: 2,
          bgcolor: isUser ? 'primary.main' : isError ? 'error.light' : 'grey.100',
          color: isUser ? 'primary.contrastText' : 'text.primary',
          borderBottomRightRadius: isUser ? 4 : 16,
          borderBottomLeftRadius: isUser ? 16 : 4,
        }}
      >
        <Typography variant="body2" sx={{ wordWrap: 'break-word' }}>
          {text}
        </Typography>
      </Paper>

      {isUser && (
        <Avatar
          sx={{
            width: 32,
            height: 32,
            bgcolor: 'secondary.main'
          }}
        >
          <PersonIcon fontSize="small" />
        </Avatar>
      )}
    </Box>
  );
};

export default ChatBubble;
