import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  TextField,
  List,
  ListItem,
  ListItemText,
  Chip,
  Box,
  Typography,
  Divider,
  InputAdornment,
  Paper
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import '../styles/KeyboardShortcuts.css';

/**
 * Command Palette Component
 * 
 * VS Code-style command palette for quick action discovery and execution.
 * Features:
 * - Fuzzy search with keyword matching
 * - Keyboard navigation (arrow keys, Enter, Escape)
 * - Command categorization
 * - Shortcut display
 * - Recent commands tracking
 * 
 * @param {boolean} open - Whether the palette is open
 * @param {function} onClose - Callback when palette closes
 * @param {Array} commands - Array of command objects from CommandRegistry
 * @param {function} onExecute - Callback when command is executed
 */
export function CommandPalette({ open, onClose, commands = [], onExecute }) {
  const [search, setSearch] = useState('');
  const [filteredCommands, setFilteredCommands] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentCommands, setRecentCommands] = useState([]);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  // Load recent commands from localStorage
  useEffect(() => {
    if (open) {
      try {
        const stored = localStorage.getItem('rescanvas_recent_commands');
        if (stored) {
          setRecentCommands(JSON.parse(stored).slice(0, 5));
        }
      } catch (error) {
        console.error('[CommandPalette] Error loading recent commands:', error);
      }
    }
  }, [open]);

  // Filter commands based on search
  useEffect(() => {
    if (!commands || commands.length === 0) {
      setFilteredCommands([]);
      return;
    }

    if (!search || search.trim() === '') {
      // Show recent commands first, then all commands
      const recentCommandObjs = recentCommands
        .map(id => commands.find(cmd => cmd.id === id))
        .filter(Boolean);
      
      const otherCommands = commands.filter(cmd => 
        !recentCommands.includes(cmd.id)
      );
      
      setFilteredCommands([...recentCommandObjs, ...otherCommands]);
      setSelectedIndex(0);
      return;
    }

    const normalizedSearch = search.toLowerCase().trim();
    const searchWords = normalizedSearch.split(/\s+/);

    const filtered = commands
      .filter(cmd => {
        const searchText = [
          cmd.label,
          cmd.description,
          cmd.category,
          ...(cmd.keywords || [])
        ].join(' ').toLowerCase();

        // Match all search words
        return searchWords.every(word => searchText.includes(word));
      })
      .sort((a, b) => {
        // Prioritize exact label matches
        const aLabelMatch = a.label.toLowerCase().includes(normalizedSearch);
        const bLabelMatch = b.label.toLowerCase().includes(normalizedSearch);
        
        if (aLabelMatch && !bLabelMatch) return -1;
        if (!aLabelMatch && bLabelMatch) return 1;
        
        // Then by category match
        const aCategoryMatch = a.category.toLowerCase().includes(normalizedSearch);
        const bCategoryMatch = b.category.toLowerCase().includes(normalizedSearch);
        
        if (aCategoryMatch && !bCategoryMatch) return -1;
        if (!aCategoryMatch && bCategoryMatch) return 1;
        
        // Finally alphabetically
        return a.label.localeCompare(b.label);
      });

    setFilteredCommands(filtered);
    setSelectedIndex(0);
  }, [search, commands, recentCommands]);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setSearch('');
      setSelectedIndex(0);
      // Focus input after a short delay to ensure dialog is mounted
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 50);
    }
  }, [open]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && filteredCommands.length > 0) {
      const selectedElement = listRef.current.children[selectedIndex];
      if (selectedElement) {
        selectedElement.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth'
        });
      }
    }
  }, [selectedIndex, filteredCommands]);

  // Execute command
  const executeCommand = useCallback((command) => {
    if (!command) return;

    // Add to recent commands
    const newRecent = [
      command.id,
      ...recentCommands.filter(id => id !== command.id)
    ].slice(0, 5);
    
    setRecentCommands(newRecent);
    try {
      localStorage.setItem('rescanvas_recent_commands', JSON.stringify(newRecent));
    } catch (error) {
      console.error('[CommandPalette] Error saving recent commands:', error);
    }

    // Execute command
    if (onExecute) {
      onExecute(command);
    } else if (command.action) {
      try {
        command.action();
      } catch (error) {
        console.error('[CommandPalette] Error executing command:', error);
      }
    }

    // Close palette
    onClose();
  }, [onExecute, onClose, recentCommands]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((event) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setSelectedIndex(prev => 
          prev < filteredCommands.length - 1 ? prev + 1 : prev
        );
        break;
        
      case 'ArrowUp':
        event.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : prev);
        break;
        
      case 'Enter':
        event.preventDefault();
        if (filteredCommands[selectedIndex]) {
          executeCommand(filteredCommands[selectedIndex]);
        }
        break;
        
      case 'Escape':
        event.preventDefault();
        onClose();
        break;
        
      default:
        break;
    }
  }, [filteredCommands, selectedIndex, executeCommand, onClose]);

  // Format shortcut for display
  const formatShortcut = (command) => {
    if (!command.shortcut) return null;
    
    const { key, modifiers } = command.shortcut;
    const parts = [];
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    
    if (modifiers.ctrl) parts.push(isMac ? '⌘' : 'Ctrl');
    if (modifiers.shift) parts.push(isMac ? '⇧' : 'Shift');
    if (modifiers.alt) parts.push(isMac ? '⌥' : 'Alt');
    
    const displayKey = key.length === 1 ? key.toUpperCase() : key;
    parts.push(displayKey);
    
    return parts.join(' + ');
  };

  // Group commands by category for display
  const groupedCommands = filteredCommands.reduce((acc, cmd, idx) => {
    const prevCmd = idx > 0 ? filteredCommands[idx - 1] : null;
    const showCategoryHeader = !prevCmd || prevCmd.category !== cmd.category;
    
    acc.push({ command: cmd, showCategoryHeader, index: idx });
    return acc;
  }, []);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        className: 'command-palette-dialog',
        sx: {
          borderRadius: 2,
          maxHeight: '70vh'
        }
      }}
      TransitionProps={{
        onEntered: () => {
          if (inputRef.current) {
            inputRef.current.focus();
          }
        }
      }}
    >
      <Box sx={{ p: 2, pb: 0 }}>
        <TextField
          inputRef={inputRef}
          autoFocus
          fullWidth
          placeholder="Type a command or search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          variant="outlined"
          size="medium"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
            sx: {
              '& .MuiOutlinedInput-notchedOutline': {
                border: 'none',
                borderBottom: '1px solid',
                borderColor: 'divider',
                borderRadius: 0
              },
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: 'primary.main'
              },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor: 'primary.main',
                borderWidth: '2px'
              }
            }
          }}
          sx={{ mb: 1 }}
        />
        
        {filteredCommands.length > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ pl: 1 }}>
            {filteredCommands.length} command{filteredCommands.length !== 1 ? 's' : ''} found
          </Typography>
        )}
      </Box>

      <List
        ref={listRef}
        sx={{
          maxHeight: 'calc(70vh - 120px)',
          overflow: 'auto',
          py: 1,
          '&::-webkit-scrollbar': {
            width: '8px'
          },
          '&::-webkit-scrollbar-track': {
            background: 'transparent'
          },
          '&::-webkit-scrollbar-thumb': {
            background: 'rgba(0,0,0,0.2)',
            borderRadius: '4px'
          }
        }}
      >
        {groupedCommands.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <KeyboardIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              No commands found
            </Typography>
            <Typography variant="caption" color="text.disabled">
              Try a different search term
            </Typography>
          </Box>
        ) : (
          groupedCommands.map(({ command, showCategoryHeader, index }) => (
            <React.Fragment key={command.id}>
              {showCategoryHeader && (
                <>
                  {index > 0 && <Divider sx={{ my: 1 }} />}
                  <Box sx={{ px: 2, py: 0.5 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight="600">
                      {command.category}
                    </Typography>
                  </Box>
                </>
              )}
              
              <ListItem
                button
                selected={index === selectedIndex}
                onClick={() => executeCommand(command)}
                sx={{
                  py: 1.5,
                  px: 2,
                  cursor: 'pointer',
                  '&.Mui-selected': {
                    bgcolor: 'primary.light',
                    '&:hover': {
                      bgcolor: 'primary.light'
                    }
                  },
                  '&:hover': {
                    bgcolor: 'action.hover'
                  }
                }}
              >
                <ListItemText
                  primary={command.label}
                  secondary={command.description}
                  primaryTypographyProps={{
                    variant: 'body2',
                    fontWeight: 500
                  }}
                  secondaryTypographyProps={{
                    variant: 'caption',
                    color: 'text.secondary'
                  }}
                />
                {command.shortcut && (
                  <Chip
                    label={formatShortcut(command)}
                    size="small"
                    variant="outlined"
                    sx={{
                      ml: 2,
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      height: '24px'
                    }}
                  />
                )}
              </ListItem>
            </React.Fragment>
          ))
        )}
      </List>

      <Box sx={{ p: 1.5, borderTop: 1, borderColor: 'divider', bgcolor: 'background.default' }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', gap: 2 }}>
          <span><strong>↑↓</strong> Navigate</span>
          <span><strong>Enter</strong> Select</span>
          <span><strong>Esc</strong> Close</span>
        </Typography>
      </Box>
    </Dialog>
  );
}

export default CommandPalette;
