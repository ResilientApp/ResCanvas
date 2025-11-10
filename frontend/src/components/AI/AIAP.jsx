// import React from 'react';
// import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import ListItemSecondaryAction from '@mui/material/ListItemSecondaryAction';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import CloseIcon from '@mui/icons-material/Close';
import CheckIcon from '@mui/icons-material/Check';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PromptInput from './PromptInput';

export default function AIAssistantPanel({
  open,
  onClose,
  onSubmitPrompt,
  isBusy,
  error,
  suggestions,
  onAcceptSuggestion,
  onDiscardSuggestion,
  model,
  onModelChange,
  examplePrompts = [
    'draw a blue rectangle center',
    'scatter 5 small stars top-right',
    'smooth this sketch into a circle',
  ],
}) {
  const handleSubmit = (text) => {
    if (!text || isBusy) return;
    onSubmitPrompt?.(text.trim());
  };

  const renderSuggestionPreview = (s) => {
    if (s?.previewSvg) {
      return (
        <Box
          sx={{
            border: '1px solid', borderColor: 'divider', borderRadius: 1,
            overflow: 'hidden', width: '100%', height: 120,
            '& svg': { width: '100%', height: '100%' },
          }}
          dangerouslySetInnerHTML={{ __html: s.previewSvg }}
        />
      );
    }
    if (s?.previewUrl) {
      return (
        <Box
          component="img"
          alt={s.title || 'AI suggestion'}
          src={s.previewUrl}
          sx={{
            display: 'block', width: '100%', height: 120, objectFit: 'contain',
            border: '1px solid', borderColor: 'divider', borderRadius: 1,
            backgroundColor: 'background.default',
          }}
        />
      );
    }
    return (
      <Paper
        variant="outlined"
        sx={{
          width: '100%', height: 120, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          borderStyle: 'dashed',
        }}
      >
        <Typography variant="caption" color="text.secondary">No preview</Typography>
      </Paper>
    );
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: 420, maxWidth: '100vw' } }}
    >
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <SmartToyIcon fontSize="small" />
        <Typography variant="h6" sx={{ flex: 1 }}>AI Assistant</Typography>
        <Tooltip title="Close">
          <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
        </Tooltip>
      </Box>

      <Divider />

      <Box sx={{ p: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="body2" color="text.secondary">Model</Typography>
          <Select
            size="small"
            value={model || 'gpt-4.1-mini'}
            onChange={(e) => onModelChange?.(e.target.value)}
          >
            <MenuItem value="gpt-4.1-mini">gpt-4.1-mini</MenuItem>
            <MenuItem value="gpt-4o-mini">gpt-4o-mini</MenuItem>
            <MenuItem value="ollama/llava">ollama/llava</MenuItem>
          </Select>
        </Stack>

        <PromptInput
          onSubmit={handleSubmit}
          disabled={isBusy}
          loading={isBusy}
          placeholder="Describe what to draw or fix…"
          examples={examplePrompts}
        />

        {error && <Alert severity="error" sx={{ mt: 2 }}>{String(error)}</Alert>}

        {isBusy && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2 }}>
            <CircularProgress size={18} />
            <Typography variant="body2">Thinking…</Typography>
          </Stack>
        )}
      </Box>

      <Divider />

      <Box sx={{ p: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Typography variant="subtitle2">Suggestions</Typography>
          <Chip size="small" label={suggestions?.length || 0} />
        </Stack>

        <List dense disablePadding>
          {(suggestions || []).map((s) => (
            <ListItem key={s.id} sx={{ display: 'block', mb: 1 }}>
              <Stack spacing={1}>
                {renderSuggestionPreview(s)}
                <Stack direction="row" alignItems="center" spacing={1}>
                  <ListItemText
                    primary={s.title || 'Suggestion'}
                    secondary={s.subtitle || s.summary || s.type}
                    primaryTypographyProps={{ variant: 'body2' }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                  <ListItemSecondaryAction>
                    <Tooltip title="Insert to canvas">
                      <IconButton size="small" onClick={() => onAcceptSuggestion?.(s)}>
                        <CheckIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Discard">
                      <IconButton size="small" onClick={() => onDiscardSuggestion?.(s.id)}>
                        <DeleteOutlineIcon />
                      </IconButton>
                    </Tooltip>
                  </ListItemSecondaryAction>
                </Stack>
              </Stack>
            </ListItem>
          ))}
        </List>

        {!suggestions?.length && (
          <Typography variant="caption" color="text.secondary">
            No suggestions yet — try a prompt above.
          </Typography>
        )}
      </Box>
    </Drawer>
  );
}

// AIAssistantPanel.propTypes = {
//   open: PropTypes.bool,
//   onClose: PropTypes.func,
//   onSubmitPrompt: PropTypes.func,
//   isBusy: PropTypes.bool,
//   error: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
//   suggestions: PropTypes.arrayOf(
//     PropTypes.shape({
//       id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
//       title: PropTypes.string,
//       subtitle: PropTypes.string,
//       type: PropTypes.string,
//       previewSvg: PropTypes.string,
//       previewUrl: PropTypes.string,
//       payload: PropTypes.any,
//     })
//   ),
//   onAcceptSuggestion: PropTypes.func,
//   onDiscardSuggestion: PropTypes.func,
//   model: PropTypes.string,
//   onModelChange: PropTypes.func,
//   examplePrompts: PropTypes.arrayOf(PropTypes.string),
// };


/* 
<AIAssistantPanel
    open={aiOpen}
    onClose={() => setAiOpen(false)}
    // onSubmitPrompt={handleSubmitPrompt}
    isBusy={aiBusy}
    error={aiError}
    suggestions={aiSuggestions}
    // onAcceptSuggestion={handleAcceptSuggestion}
    // onDiscardSuggestion={handleDiscardSuggestion}
    model={aiModel}
    onModelChange={setAiModel}
/>
*/