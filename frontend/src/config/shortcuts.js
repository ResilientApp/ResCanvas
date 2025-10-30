/**
 * Default Keyboard Shortcuts Configuration for ResCanvas
 * 
 * Defines all keyboard shortcuts for the application.
 * These will be registered with the KeyboardShortcutManager on app initialization.
 * 
 * Categories:
 * - Tools: Drawing tool selection
 * - Edit: Clipboard and history operations
 * - View: Zoom, pan, and display controls
 * - Canvas: Canvas-specific operations
 * - Commands: Meta commands (palette, help, settings)
 * - Selection: Selection manipulation
 */

export const DEFAULT_SHORTCUTS = [
  // ==================== TOOLS ====================
  {
    id: 'tool.pen',
    key: 'p',
    modifiers: {},
    label: 'Select Pen Tool',
    description: 'Switch to pen/brush tool for drawing',
    category: 'Tools',
    keywords: ['draw', 'brush', 'pencil']
  },
  {
    id: 'tool.eraser',
    key: 'e',
    modifiers: {},
    label: 'Select Eraser',
    description: 'Switch to eraser tool',
    category: 'Tools',
    keywords: ['erase', 'delete', 'remove']
  },
  {
    id: 'tool.text',
    key: 't',
    modifiers: {},
    label: 'Select Text Tool',
    description: 'Switch to text tool for adding labels',
    category: 'Tools',
    keywords: ['text', 'label', 'type']
  },
  {
    id: 'tool.rectangle',
    key: 'r',
    modifiers: {},
    label: 'Select Rectangle',
    description: 'Draw rectangles and squares',
    category: 'Tools',
    keywords: ['rect', 'square', 'box']
  },
  {
    id: 'tool.circle',
    key: 'c',
    modifiers: {},
    label: 'Select Circle',
    description: 'Draw circles and ellipses',
    category: 'Tools',
    keywords: ['circle', 'ellipse', 'oval']
  },
  {
    id: 'tool.line',
    key: 'l',
    modifiers: {},
    label: 'Select Line',
    description: 'Draw straight lines',
    category: 'Tools',
    keywords: ['line', 'straight']
  },
  {
    id: 'tool.arrow',
    key: 'a',
    modifiers: {},
    label: 'Select Arrow',
    description: 'Draw arrows and connectors',
    category: 'Tools',
    keywords: ['arrow', 'pointer', 'connector']
  },
  {
    id: 'tool.fill',
    key: 'f',
    modifiers: {},
    label: 'Select Fill Bucket',
    description: 'Fill areas with color',
    category: 'Tools',
    keywords: ['fill', 'bucket', 'paint']
  },
  {
    id: 'tool.selection',
    key: 'v',
    modifiers: {},
    label: 'Select Selection Tool',
    description: 'Select and manipulate objects',
    category: 'Tools',
    keywords: ['select', 'move', 'transform']
  },
  {
    id: 'tool.hand',
    key: 'h',
    modifiers: {},
    label: 'Select Hand/Pan Tool',
    description: 'Pan around the canvas',
    category: 'Tools',
    keywords: ['hand', 'pan', 'move']
  },

  // ==================== EDIT ====================
  {
    id: 'edit.undo',
    key: 'z',
    modifiers: { ctrl: true },
    label: 'Undo',
    description: 'Undo the last action',
    category: 'Edit',
    keywords: ['undo', 'revert', 'back']
  },
  {
    id: 'edit.redo',
    key: 'z',
    modifiers: { ctrl: true, shift: true },
    label: 'Redo',
    description: 'Redo the last undone action',
    category: 'Edit',
    keywords: ['redo', 'forward', 'repeat']
  },
  {
    id: 'edit.copy',
    key: 'c',
    modifiers: { ctrl: true },
    label: 'Copy',
    description: 'Copy selected elements to clipboard',
    category: 'Edit',
    keywords: ['copy', 'duplicate', 'clipboard']
  },
  {
    id: 'edit.cut',
    key: 'x',
    modifiers: { ctrl: true },
    label: 'Cut',
    description: 'Cut selected elements to clipboard',
    category: 'Edit',
    keywords: ['cut', 'remove', 'clipboard']
  },
  {
    id: 'edit.paste',
    key: 'v',
    modifiers: { ctrl: true },
    label: 'Paste',
    description: 'Paste from clipboard',
    category: 'Edit',
    keywords: ['paste', 'insert', 'clipboard']
  },
  {
    id: 'edit.duplicate',
    key: 'd',
    modifiers: { ctrl: true },
    label: 'Duplicate',
    description: 'Duplicate selected elements',
    category: 'Edit',
    keywords: ['duplicate', 'copy', 'clone']
  },
  {
    id: 'edit.selectAll',
    key: 'a',
    modifiers: { ctrl: true },
    label: 'Select All',
    description: 'Select all elements on canvas',
    category: 'Edit',
    keywords: ['select', 'all']
  },
  {
    id: 'edit.delete',
    key: 'Delete',
    modifiers: {},
    label: 'Delete',
    description: 'Delete selected elements',
    category: 'Edit',
    keywords: ['delete', 'remove', 'erase']
  },
  {
    id: 'edit.delete.alt',
    key: 'Backspace',
    modifiers: {},
    label: 'Delete (Backspace)',
    description: 'Delete selected elements',
    category: 'Edit',
    keywords: ['delete', 'remove', 'erase']
  },

  // ==================== VIEW ====================
  {
    id: 'view.zoomIn',
    key: '=',
    modifiers: { ctrl: true },
    label: 'Zoom In',
    description: 'Zoom in on the canvas',
    category: 'View',
    keywords: ['zoom', 'in', 'magnify', 'larger']
  },
  {
    id: 'view.zoomIn.alt',
    key: '+',
    modifiers: { ctrl: true },
    label: 'Zoom In (+)',
    description: 'Zoom in on the canvas',
    category: 'View',
    keywords: ['zoom', 'in', 'magnify', 'larger']
  },
  {
    id: 'view.zoomOut',
    key: '-',
    modifiers: { ctrl: true },
    label: 'Zoom Out',
    description: 'Zoom out on the canvas',
    category: 'View',
    keywords: ['zoom', 'out', 'smaller']
  },
  {
    id: 'view.zoomReset',
    key: '0',
    modifiers: { ctrl: true },
    label: 'Reset Zoom',
    description: 'Reset zoom to 100%',
    category: 'View',
    keywords: ['zoom', 'reset', '100%', 'actual']
  },
  {
    id: 'view.fitToScreen',
    key: '1',
    modifiers: { ctrl: true },
    label: 'Fit to Screen',
    description: 'Fit entire canvas to screen',
    category: 'View',
    keywords: ['fit', 'screen', 'zoom', 'all']
  },
  {
    id: 'view.fullscreen',
    key: 'f',
    modifiers: { ctrl: true, shift: true },
    label: 'Toggle Fullscreen',
    description: 'Enter or exit fullscreen mode',
    category: 'View',
    keywords: ['fullscreen', 'maximize', 'full']
  },
  {
    id: 'view.toggleGrid',
    key: 'g',
    modifiers: { ctrl: true },
    label: 'Toggle Grid',
    description: 'Show or hide the grid',
    category: 'View',
    keywords: ['grid', 'guides', 'toggle']
  },
  {
    id: 'view.toggleRulers',
    key: 'r',
    modifiers: { ctrl: true },
    label: 'Toggle Rulers',
    description: 'Show or hide rulers',
    category: 'View',
    keywords: ['rulers', 'guides', 'toggle']
  },

  // ==================== CANVAS ====================
  {
    id: 'canvas.clear',
    key: 'k',
    modifiers: { ctrl: true, shift: true },
    label: 'Clear Canvas',
    description: 'Remove all strokes from canvas',
    category: 'Canvas',
    keywords: ['clear', 'delete', 'reset', 'erase']
  },
  {
    id: 'canvas.export',
    key: 's',
    modifiers: { ctrl: true, shift: true },
    label: 'Export Canvas',
    description: 'Export canvas as image',
    category: 'Canvas',
    keywords: ['export', 'save', 'download', 'image']
  },
  {
    id: 'canvas.share',
    key: 'i',
    modifiers: { ctrl: true, shift: true },
    label: 'Share Canvas',
    description: 'Share canvas with collaborators',
    category: 'Canvas',
    keywords: ['share', 'invite', 'collaborate']
  },
  {
    id: 'canvas.settings',
    key: ',',
    modifiers: { ctrl: true },
    label: 'Canvas Settings',
    description: 'Open canvas settings',
    category: 'Canvas',
    keywords: ['settings', 'preferences', 'configure']
  },

  // ==================== SELECTION ====================
  {
    id: 'selection.bringForward',
    key: ']',
    modifiers: { ctrl: true },
    label: 'Bring Forward',
    description: 'Move selection one layer forward',
    category: 'Selection',
    keywords: ['layer', 'forward', 'up', 'order']
  },
  {
    id: 'selection.sendBackward',
    key: '[',
    modifiers: { ctrl: true },
    label: 'Send Backward',
    description: 'Move selection one layer backward',
    category: 'Selection',
    keywords: ['layer', 'backward', 'down', 'order']
  },
  {
    id: 'selection.bringToFront',
    key: ']',
    modifiers: { ctrl: true, shift: true },
    label: 'Bring to Front',
    description: 'Move selection to top layer',
    category: 'Selection',
    keywords: ['layer', 'front', 'top', 'order']
  },
  {
    id: 'selection.sendToBack',
    key: '[',
    modifiers: { ctrl: true, shift: true },
    label: 'Send to Back',
    description: 'Move selection to bottom layer',
    category: 'Selection',
    keywords: ['layer', 'back', 'bottom', 'order']
  },
  {
    id: 'selection.group',
    key: 'g',
    modifiers: { ctrl: true },
    label: 'Group Selection',
    description: 'Group selected elements',
    category: 'Selection',
    keywords: ['group', 'combine']
  },
  {
    id: 'selection.ungroup',
    key: 'g',
    modifiers: { ctrl: true, shift: true },
    label: 'Ungroup Selection',
    description: 'Ungroup selected elements',
    category: 'Selection',
    keywords: ['ungroup', 'separate']
  },

  // ==================== COMMANDS ====================
  {
    id: 'commands.palette',
    key: 'k',
    modifiers: { ctrl: true },
    label: 'Command Palette',
    description: 'Open command palette',
    category: 'Commands',
    keywords: ['palette', 'search', 'commands', 'actions']
  },
  {
    id: 'commands.shortcuts',
    key: '/',
    modifiers: { ctrl: true },
    label: 'Keyboard Shortcuts',
    description: 'Show keyboard shortcuts help',
    category: 'Commands',
    keywords: ['shortcuts', 'help', 'keyboard', 'keys']
  },
  {
    id: 'commands.shortcuts.alt',
    key: '?',
    modifiers: { ctrl: true },
    label: 'Keyboard Shortcuts (?)',
    description: 'Show keyboard shortcuts help',
    category: 'Commands',
    keywords: ['shortcuts', 'help', 'keyboard', 'keys']
  },
  {
    id: 'commands.cancel',
    key: 'Escape',
    modifiers: {},
    label: 'Cancel',
    description: 'Cancel current action or close dialog',
    category: 'Commands',
    keywords: ['cancel', 'escape', 'close', 'exit']
  }
];

/**
 * Get shortcuts grouped by category
 */
export function getShortcutsByCategory() {
  const grouped = {};
  
  DEFAULT_SHORTCUTS.forEach(shortcut => {
    if (!grouped[shortcut.category]) {
      grouped[shortcut.category] = [];
    }
    grouped[shortcut.category].push(shortcut);
  });
  
  return grouped;
}

/**
 * Get shortcut by ID
 */
export function getShortcutById(id) {
  return DEFAULT_SHORTCUTS.find(s => s.id === id);
}

/**
 * Check if key combination is registered
 */
export function hasShortcut(key, modifiers) {
  return DEFAULT_SHORTCUTS.some(s => 
    s.key === key &&
    s.modifiers.ctrl === modifiers.ctrl &&
    s.modifiers.shift === modifiers.shift &&
    s.modifiers.alt === modifiers.alt
  );
}

/**
 * Format shortcut for display
 */
export function formatShortcutDisplay(shortcut) {
  const parts = [];
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  
  if (shortcut.modifiers.ctrl) parts.push(isMac ? '⌘' : 'Ctrl');
  if (shortcut.modifiers.shift) parts.push(isMac ? '⇧' : 'Shift');
  if (shortcut.modifiers.alt) parts.push(isMac ? '⌥' : 'Alt');
  
  const displayKey = shortcut.key.length === 1 
    ? shortcut.key.toUpperCase() 
    : shortcut.key;
  parts.push(displayKey);
  
  return parts.join(' + ');
}
