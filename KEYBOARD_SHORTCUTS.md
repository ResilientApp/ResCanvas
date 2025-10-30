# Keyboard Shortcuts & Command Palette

## Overview

ResCanvas now features a comprehensive keyboard shortcuts system and VS Code-style command palette for power users to work efficiently without mouse/toolbar interactions.

## Features

### ⌨️ Keyboard Shortcuts

- **Tools**: Single-key shortcuts (P, E, R, C, L, A) for quick tool switching
- **Edit**: Ctrl+Z/Ctrl+Shift+Z for undo/redo
- **Canvas**: Ctrl+R refresh, Ctrl+Shift+K clear
- **Commands**: Ctrl+K command palette, Ctrl+/ shortcuts help

### 🎯 Command Palette (Ctrl+K)

VS Code-style quick access to all commands:
- Fuzzy search with keyword matching
- Keyboard navigation (↑↓ arrows, Enter to select)
- Recent commands tracking
- Category grouping
- Shortcut display for each command

### 📖 Keyboard Shortcuts Help (Ctrl+/)

Comprehensive shortcut reference:
- Organized by category (Tools, Edit, Canvas, Commands)
- Tab navigation between categories
- Search/filter functionality
- Platform-specific display (⌘ for Mac, Ctrl for Windows/Linux)

## Usage

### Opening Dialogs

```javascript
// Command Palette
Press: Ctrl+K (Cmd+K on Mac)

// Shortcuts Help
Press: Ctrl+/ (Cmd+/ on Mac)

// Cancel/Close
Press: Escape
```

### Available Shortcuts

#### Tools (No modifiers)
- `P` - Pen tool
- `E` - Eraser
- `R` - Rectangle
- `C` - Circle
- `L` - Line
- `A` - Arrow

#### Edit Operations
- `Ctrl+Z` - Undo
- `Ctrl+Shift+Z` - Redo

#### Canvas Operations
- `Ctrl+R` - Refresh canvas
- `Ctrl+Shift+K` - Clear canvas
- `Ctrl+,` - Canvas settings (if available)

#### Commands
- `Ctrl+K` - Command palette
- `Ctrl+/` - Keyboard shortcuts help
- `Escape` - Cancel current action

## Architecture

### Core Services

#### KeyboardShortcutManager (`frontend/src/services/KeyboardShortcuts.js`)

Manages registration and execution of keyboard shortcuts:

```javascript
import { KeyboardShortcutManager } from '../services/KeyboardShortcuts';

const manager = new KeyboardShortcutManager();

// Register a shortcut
manager.register(
  'k',                           // key
  { ctrl: true },                // modifiers
  () => openCommandPalette(),    // action
  'Open Command Palette',        // description
  'Commands'                     // category
);

// Handle key events
document.addEventListener('keydown', (e) => manager.handleKeyDown(e));
```

Features:
- Conflict detection and warnings
- Input field detection (shortcuts disabled in text inputs)
- Platform-aware display (⌘/Ctrl)
- Enable/disable shortcuts dynamically
- Category grouping

#### CommandRegistry (`frontend/src/services/CommandRegistry.js`)

Central registry for all executable commands:

```javascript
import { commandRegistry } from '../services/CommandRegistry';

// Register a command
commandRegistry.register({
  id: 'canvas.clear',
  label: 'Clear Canvas',
  description: 'Remove all strokes from canvas',
  keywords: ['delete', 'erase', 'reset'],
  action: () => clearCanvas(),
  category: 'Canvas',
  shortcut: { key: 'k', modifiers: { ctrl: true, shift: true } },
  enabled: () => editingEnabled  // Optional condition
});

// Execute command
await commandRegistry.execute('canvas.clear');

// Search commands
const results = commandRegistry.search('clear');
```

Features:
- Command search with keyword matching
- Enabled/visible state functions
- Event listeners for execution tracking
- Category organization
- Batch registration

### Components

#### CommandPalette (`frontend/src/components/CommandPalette.jsx`)

VS Code-style command search and execution:

```jsx
<CommandPalette
  open={commandPaletteOpen}
  onClose={() => setCommandPaletteOpen(false)}
  commands={commandRegistry.getAll()}
  onExecute={(command) => command.action()}
/>
```

Features:
- Fuzzy search with keyword matching
- Keyboard navigation (↑↓, Enter, Escape)
- Recent commands tracking (localStorage)
- Category headers
- Shortcut display
- Empty state messaging

#### KeyboardShortcutsHelp (`frontend/src/components/KeyboardShortcutsHelp.jsx`)

Comprehensive shortcuts reference:

```jsx
<KeyboardShortcutsHelp
  open={shortcutsHelpOpen}
  onClose={() => setShortcutsHelpOpen(false)}
  shortcuts={manager.getAllShortcuts()}
/>
```

Features:
- Tab navigation by category
- Search/filter shortcuts
- Platform-specific key display
- Quick tips section
- Responsive design

### Configuration

#### Default Shortcuts (`frontend/src/config/shortcuts.js`)

Centralized shortcut definitions:

```javascript
export const DEFAULT_SHORTCUTS = [
  {
    id: 'tool.pen',
    key: 'p',
    modifiers: {},
    label: 'Select Pen Tool',
    description: 'Switch to pen/brush tool for drawing',
    category: 'Tools',
    keywords: ['draw', 'brush', 'pencil']
  },
  // ... more shortcuts
];
```

## Integration

### Canvas Component

The Canvas component registers all shortcuts on mount:

```javascript
// In Canvas.js
useEffect(() => {
  const manager = new KeyboardShortcutManager();
  
  // Register commands
  commandRegistry.register({
    id: 'edit.undo',
    label: 'Undo',
    action: undo,
    shortcut: { key: 'z', modifiers: { ctrl: true } }
  });
  
  // Register keyboard shortcuts
  manager.register('z', { ctrl: true }, undo, 'Undo', 'Edit');
  
  // Add global listener
  const handleKeyDown = (e) => manager.handleKeyDown(e);
  document.addEventListener('keydown', handleKeyDown);
  
  return () => {
    document.removeEventListener('keydown', handleKeyDown);
    manager.clear();
  };
}, [dependencies]);
```

### Adding New Shortcuts

1. **Define the action function** in your component
2. **Add command to registry** in the useEffect hook:

```javascript
commandRegistry.register({
  id: 'feature.myAction',
  label: 'My Action',
  description: 'Description of what it does',
  keywords: ['search', 'terms'],
  action: myActionFunction,
  category: 'Feature',
  shortcut: { key: 'm', modifiers: { ctrl: true } },
  enabled: () => someCondition  // Optional
});
```

3. **Register keyboard shortcut**:

```javascript
manager.register(
  'm',
  { ctrl: true },
  myActionFunction,
  'My Action',
  'Feature'
);
```

## Best Practices

### 1. Use Descriptive Labels
```javascript
// Good
label: 'Clear Canvas'
description: 'Remove all strokes from canvas'

// Bad
label: 'Clear'
description: 'Clears stuff'
```

### 2. Add Keywords for Searchability
```javascript
keywords: ['delete', 'erase', 'reset', 'remove']  // Good
keywords: []  // Bad
```

### 3. Check Conditions Before Execution
```javascript
action: () => {
  if (!editingEnabled) {
    showSnackbar('Action disabled in view-only mode');
    return;
  }
  performAction();
}
```

### 4. Provide Feedback
```javascript
action: () => {
  setDrawMode('pen');
  showSnackbar('Pen tool selected');  // User feedback
}
```

### 5. Avoid Input Field Conflicts
The KeyboardShortcutManager automatically disables shortcuts when typing in input fields. For special cases:

```javascript
manager.register(
  'enter',
  {},
  submitForm,
  'Submit Form',
  'Actions',
  false  // allowInInput = false (default)
);
```

## Testing

### Manual Testing Checklist

- [ ] Ctrl+K opens command palette
- [ ] Ctrl+/ opens shortcuts help
- [ ] Escape closes dialogs
- [ ] Tool shortcuts (P, E, R, C, L, A) switch tools
- [ ] Ctrl+Z / Ctrl+Shift+Z perform undo/redo
- [ ] Ctrl+R refreshes canvas
- [ ] Shortcuts disabled when typing in text fields
- [ ] Command palette search works
- [ ] Recent commands are tracked
- [ ] Arrow keys navigate command palette
- [ ] Enter executes selected command

### Unit Tests

```javascript
// Example test for KeyboardShortcutManager
import { KeyboardShortcutManager } from '../services/KeyboardShortcuts';

test('registers and executes shortcut', () => {
  const manager = new KeyboardShortcutManager();
  const mockAction = jest.fn();
  
  manager.register('k', { ctrl: true }, mockAction);
  
  const event = new KeyboardEvent('keydown', {
    key: 'k',
    ctrlKey: true
  });
  
  manager.handleKeyDown(event);
  
  expect(mockAction).toHaveBeenCalled();
});
```

## Troubleshooting

### Shortcuts Not Working

1. **Check console for conflicts**: The manager logs conflicts when registering duplicate shortcuts
2. **Verify enabledcondition**: Commands with `enabled: () => false` won't execute
3. **Check input focus**: Shortcuts are disabled in text inputs by default
4. **Inspect event listeners**: Ensure the global keydown listener is attached

### Command Palette Empty

1. **Verify command registration**: Check `commandRegistry.getAll()` in console
2. **Check visible conditions**: Commands with `visible: () => false` won't appear
3. **Clear browser cache**: Recent commands stored in localStorage may cause issues

### Platform-Specific Issues

- **Mac**: Uses `⌘` (Command) key instead of Ctrl
- **Detection**: Based on `navigator.platform.toUpperCase().indexOf('MAC')`
- **Both supported**: `event.ctrlKey || event.metaKey` handles both

## Future Enhancements

- [ ] User-customizable shortcut mappings
- [ ] Macro recording (repeat action sequences)
- [ ] Vim-mode keybindings
- [ ] Quick command history (Ctrl+P style)
- [ ] Contextual command suggestions
- [ ] Shortcut conflict resolution UI
- [ ] Export/import shortcut configurations
- [ ] Workspace-specific shortcuts

## Resources

- **VS Code Shortcuts**: Inspiration for command palette UX
- **Figma Shortcuts**: Reference for design tool workflows
- **Material-UI**: Component library used for dialogs
- **Web Keyboard API**: MDN documentation for key events
