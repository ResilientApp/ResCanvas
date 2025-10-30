import React, { useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Box,
  Typography,
  Table,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  Paper,
  Tabs,
  Tab,
  InputAdornment,
  TextField
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import '../styles/KeyboardShortcuts.css';

/**
 * Keyboard Shortcuts Help Dialog
 * 
 * Displays all available keyboard shortcuts organized by category.
 * Features:
 * - Categorized display
 * - Tab navigation between categories
 * - Search/filter shortcuts
 * - Platform-specific key display (Cmd vs Ctrl)
 * 
 * @param {boolean} open - Whether the dialog is open
 * @param {function} onClose - Callback when dialog closes
 * @param {Array} shortcuts - Array of shortcut objects from KeyboardShortcutManager
 */
export function KeyboardShortcutsHelp({ open, onClose, shortcuts = [] }) {
  const [selectedTab, setSelectedTab] = React.useState(0);
  const [searchQuery, setSearchQuery] = React.useState('');

  // Group shortcuts by category
  const groupedShortcuts = useMemo(() => {
    const filtered = searchQuery
      ? shortcuts.filter(shortcut => 
          shortcut.label?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          shortcut.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          shortcut.category?.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : shortcuts;

    return filtered.reduce((acc, shortcut) => {
      const category = shortcut.category || 'General';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(shortcut);
      return acc;
    }, {});
  }, [shortcuts, searchQuery]);

  const categories = Object.keys(groupedShortcuts).sort();
  const currentCategory = categories[selectedTab] || categories[0];

  // Format shortcut for display
  const formatShortcut = (shortcut) => {
    const parts = [];
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    
    if (shortcut.modifiers?.ctrl) parts.push(isMac ? '⌘' : 'Ctrl');
    if (shortcut.modifiers?.shift) parts.push(isMac ? '⇧' : 'Shift');
    if (shortcut.modifiers?.alt) parts.push(isMac ? '⌥' : 'Alt');
    
    const displayKey = shortcut.key?.length === 1 
      ? shortcut.key.toUpperCase() 
      : shortcut.key;
    parts.push(displayKey);
    
    return parts.join(' + ');
  };

  // Reset state when dialog closes
  React.useEffect(() => {
    if (!open) {
      setSearchQuery('');
      setSelectedTab(0);
    }
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          maxHeight: '80vh'
        }
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', pr: 6 }}>
        <KeyboardIcon sx={{ mr: 1.5, color: 'primary.main' }} />
        <Typography variant="h6" component="span">
          Keyboard Shortcuts
        </Typography>
        <IconButton
          onClick={onClose}
          sx={{
            position: 'absolute',
            right: 8,
            top: 8,
            color: 'text.secondary'
          }}
          aria-label="close"
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <Box sx={{ px: 3, pb: 2 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search shortcuts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            )
          }}
          sx={{ maxWidth: 400 }}
        />
      </Box>

      {categories.length === 0 ? (
        <DialogContent>
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <KeyboardIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
            <Typography variant="body1" color="text.secondary">
              No shortcuts found
            </Typography>
            {searchQuery && (
              <Typography variant="caption" color="text.disabled">
                Try a different search term
              </Typography>
            )}
          </Box>
        </DialogContent>
      ) : (
        <>
          <Tabs
            value={selectedTab}
            onChange={(e, newValue) => setSelectedTab(newValue)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              borderBottom: 1,
              borderColor: 'divider',
              px: 2
            }}
          >
            {categories.map((category, index) => (
              <Tab
                key={category}
                label={`${category} (${groupedShortcuts[category].length})`}
                sx={{ textTransform: 'none', fontWeight: 500 }}
              />
            ))}
          </Tabs>

          <DialogContent sx={{ px: 3, py: 2 }}>
            {categories.map((category, index) => (
              <Box
                key={category}
                role="tabpanel"
                hidden={selectedTab !== index}
                sx={{ display: selectedTab === index ? 'block' : 'none' }}
              >
                {groupedShortcuts[category]?.length > 0 ? (
                  <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
                    <Table size="small">
                      <TableBody>
                        {groupedShortcuts[category].map((shortcut, idx) => (
                          <TableRow
                            key={`${shortcut.shortcutKey || idx}`}
                            sx={{
                              '&:last-child td': { border: 0 },
                              '&:hover': {
                                bgcolor: 'action.hover'
                              }
                            }}
                          >
                            <TableCell sx={{ py: 1.5, width: '60%' }}>
                              <Typography variant="body2" fontWeight={500}>
                                {shortcut.label || shortcut.description}
                              </Typography>
                              {shortcut.description && shortcut.label && (
                                <Typography variant="caption" color="text.secondary" display="block">
                                  {shortcut.description}
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell align="right" sx={{ py: 1.5 }}>
                              <Chip
                                label={formatShortcut(shortcut)}
                                size="small"
                                variant="outlined"
                                sx={{
                                  fontFamily: 'monospace',
                                  fontSize: '0.75rem',
                                  fontWeight: 500,
                                  borderColor: 'primary.main',
                                  color: 'primary.main',
                                  bgcolor: 'primary.light',
                                  opacity: 0.8
                                }}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Paper>
                ) : (
                  <Box sx={{ py: 4, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                      No shortcuts in this category
                    </Typography>
                  </Box>
                )}
              </Box>
            ))}

            {/* Quick Tips Section */}
            <Box sx={{ mt: 3, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
              <Typography variant="subtitle2" gutterBottom fontWeight={600}>
                💡 Quick Tips
              </Typography>
              <Typography variant="caption" component="div" color="text.secondary" sx={{ mb: 0.5 }}>
                • Press <strong>Ctrl/Cmd + K</strong> to open the command palette for quick access
              </Typography>
              <Typography variant="caption" component="div" color="text.secondary" sx={{ mb: 0.5 }}>
                • Use <strong>Escape</strong> to cancel any ongoing action or close dialogs
              </Typography>
              <Typography variant="caption" component="div" color="text.secondary" sx={{ mb: 0.5 }}>
                • Shortcuts work globally except when typing in text fields
              </Typography>
              <Typography variant="caption" component="div" color="text.secondary">
                • Tool shortcuts (P, E, T, etc.) are single keys without modifiers
              </Typography>
            </Box>

            {/* Platform Notice */}
            <Box sx={{ mt: 2, textAlign: 'center' }}>
              <Typography variant="caption" color="text.disabled">
                {navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? (
                  <>Displaying Mac keyboard shortcuts (⌘ = Command, ⌥ = Option, ⇧ = Shift)</>
                ) : (
                  <>Displaying Windows/Linux keyboard shortcuts</>
                )}
              </Typography>
            </Box>
          </DialogContent>
        </>
      )}
    </Dialog>
  );
}

export default KeyboardShortcutsHelp;
