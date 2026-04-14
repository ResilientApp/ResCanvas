import React, { useState } from 'react';
import { Button, TextareaAutosize, Box, CircularProgress } from '@mui/material';
import { useAIAssistant } from '../../hooks/useAIAssistant';


export default function PromptInput({
  show = false,
  placeholder = 'Describe what to draw…',
  getVisibleCanvasBounds,
  addAIGeneratedObjects,
  showLocalSnack,
}) {

  const { textToDrawing, aiAssistLoading } = useAIAssistant();
  const [text, setText] = useState('');

  const handleSubmit = async () => {
  if (!text.trim() || aiAssistLoading) return;

  try {
    const canvasState = getVisibleCanvasBounds?.() || {};
    console.info("[AI] prompt submitted", {
      promptLength: text.trim().length,
      hasCanvasState: Object.keys(canvasState).length > 0,
    });
    const resp = await textToDrawing(text.trim(), canvasState);
    const payload = typeof resp === "string" ? JSON.parse(resp) : resp;

    // New event-driven path
    if (payload && Array.isArray(payload.items)) {
      console.info("[AI] drawing payload received", {
        itemCount: payload.items.length,
      });
      window.dispatchEvent(
        new CustomEvent("rescanvas:ai-drawing-generated", {
          detail: payload,
        })
      );

      showLocalSnack("AI objects rendered to canvas.");
      setText("");
      return;
    }

    // Backward-compatible fallback
    if (payload && Array.isArray(payload.objects) && addAIGeneratedObjects) {
      await addAIGeneratedObjects(payload.objects);
      showLocalSnack("AI objects rendered to canvas.");
      setText("");
      return;
    }

    console.error("Unexpected AI payload:", payload);
    showLocalSnack("An error occurred while generating the sketch.");
  } catch (e) {
    console.error(e);
    showLocalSnack("Failed to generate sketch.");
  }
};

  const handleKeyDownPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setText('');
    }
  };

  return (
    <Box
      sx={{
        position: 'absolute',
        bottom: show? 50 : -100,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        borderRadius: 2,
        boxShadow: 2,
        padding: '8px 12px',
        zIndex: 10,
        transitionDuration: '.4s'
      }}
    >
      <TextareaAutosize
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDownPress}
        disabled={aiAssistLoading}
        minRows={1}
        style={{
          width: 'auto',
          minWidth: 450,
          resize: 'none',
          border: 'none',
          outline: 'none',
          fontSize: '14px',
          padding: '8px',
          background: 'transparent',
          fontFamily: 'inherit',
        }}
      />
      <Button
        variant="contained"
        onClick={handleSubmit}
        disabled={!text.trim() || aiAssistLoading}
        sx={{
          cursor: 'pointer',
          minWidth: 100,
          height: 36,
          color: '#17635a',      
          fontWeight: 600,
          backgroundColor: '#25D8C5',
          '&:hover': {
            backgroundColor: '#1FCBB9'
          }
        }}
      >
        {aiAssistLoading ? (
          <CircularProgress size={20} sx={{ color: 'white' }} />
        ) : (
          'Generate'
        )}
      </Button>
    </Box>
  );
}
