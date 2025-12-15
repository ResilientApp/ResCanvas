import React, { useState } from 'react';
import { Box, TextField, IconButton, CircularProgress } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';

/**
 * ChatInput - Input component for sending messages to the chatbot
 * 
 * @param {Function} onSend - Callback function to handle message submission
 * @param {boolean} isLoading - Whether a message is currently being processed
 */
const ChatInput = ({ onSend, isLoading }) => {
  const [inputText, setInputText] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (inputText.trim()) {
      onSend(inputText);
      setInputText('');
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit} className="chat-input-form">
      <TextField
        fullWidth
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        placeholder="Type your message..."
        disabled={isLoading}
        variant="outlined"
        size="small"
        sx={{
          '& .MuiOutlinedInput-root': {
            borderRadius: '20px',
          }
        }}
      />
      <IconButton
        type="submit"
        disabled={isLoading || !inputText.trim()}
        color="primary"
        sx={{
          ml: 1,
          backgroundColor: 'primary.main',
          color: 'white',
          '&:hover': {
            backgroundColor: 'primary.dark',
          },
          '&:disabled': {
            backgroundColor: 'grey.300',
          }
        }}
      >
        {isLoading ? (
          <CircularProgress size={24} color="inherit" />
        ) : (
          <SendIcon />
        )}
      </IconButton>
    </Box>
  );
};

export default ChatInput;
