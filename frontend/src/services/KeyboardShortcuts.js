/**
 * Keyboard Shortcut Manager for ResCanvas
 * 
 * Handles registration, execution, and conflict detection of keyboard shortcuts.
 * Supports modifier keys (Ctrl/Cmd, Shift, Alt) and prevents conflicts with
 * input elements.
 * 
 * Usage:
 *   const manager = new KeyboardShortcutManager();
 *   manager.register('k', { ctrl: true }, () => openCommandPalette(), 'Open Command Palette');
 *   manager.enable();
 */

export class KeyboardShortcutManager {
  constructor() {
    this.shortcuts = new Map();
    this.enabled = true;
    this.activeModifiers = { ctrl: false, shift: false, alt: false };
    this.conflictWarnings = [];
  }

  /**
   * Register a keyboard shortcut
   * @param {string} key - The key to bind (e.g., 'k', 'Enter', 'Escape')
   * @param {Object} modifiers - Modifier keys { ctrl, shift, alt }
   * @param {Function} action - Callback function to execute
   * @param {string} description - Human-readable description
   * @param {string} category - Category for grouping (e.g., 'Tools', 'Edit')
   * @param {boolean} allowInInput - Allow execution even in input fields
   */
  register(key, modifiers = {}, action, description, category = 'General', allowInInput = false) {
    const shortcutKey = this.getShortcutKey(key, modifiers);
    
    // Warn about conflicts
    if (this.shortcuts.has(shortcutKey)) {
      const existing = this.shortcuts.get(shortcutKey);
      console.warn(`[KeyboardShortcuts] Conflict detected: ${shortcutKey} already bound to "${existing.description}". Overwriting with "${description}".`);
      this.conflictWarnings.push({
        key: shortcutKey,
        existing: existing.description,
        new: description
      });
    }

    this.shortcuts.set(shortcutKey, {
      key,
      modifiers,
      action,
      description,
      category,
      allowInInput,
      enabled: true,
      registeredAt: Date.now()
    });

    return shortcutKey;
  }

  /**
   * Unregister a keyboard shortcut
   */
  unregister(key, modifiers = {}) {
    const shortcutKey = this.getShortcutKey(key, modifiers);
    return this.shortcuts.delete(shortcutKey);
  }

  /**
   * Handle keydown events
   */
  handleKeyDown(event) {
    if (!this.enabled) return;

    // Determine modifiers
    const modifiers = {
      ctrl: event.ctrlKey || event.metaKey, // Support both Ctrl (Windows/Linux) and Cmd (Mac)
      shift: event.shiftKey,
      alt: event.altKey
    };

    const shortcutKey = this.getShortcutKey(event.key, modifiers);
    const shortcut = this.shortcuts.get(shortcutKey);

    if (shortcut && shortcut.enabled) {
      // Check if we should ignore (in input field)
      if (!shortcut.allowInInput && this.isInputElement(event.target)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      
      try {
        shortcut.action(event);
      } catch (error) {
        console.error(`[KeyboardShortcuts] Error executing shortcut "${shortcutKey}":`, error);
      }
    }
  }

  /**
   * Generate a unique key for the shortcut map
   */
  getShortcutKey(key, modifiers) {
    const parts = [];
    if (modifiers.ctrl) parts.push('Ctrl');
    if (modifiers.shift) parts.push('Shift');
    if (modifiers.alt) parts.push('Alt');
    
    // Normalize key name
    const normalizedKey = this.normalizeKey(key);
    parts.push(normalizedKey);
    
    return parts.join('+');
  }

  /**
   * Normalize key names for consistency
   */
  normalizeKey(key) {
    // Special keys that need normalization
    const keyMap = {
      ' ': 'Space',
      '+': 'Plus',
      '=': 'Equal',
      '-': 'Minus',
      '_': 'Underscore',
      '[': 'BracketLeft',
      ']': 'BracketRight',
      '{': 'BraceLeft',
      '}': 'BraceRight',
      '/': 'Slash',
      '\\': 'Backslash',
      ',': 'Comma',
      '.': 'Period',
      '<': 'Less',
      '>': 'Greater',
      '?': 'Question'
    };

    // Return mapped key or lowercase original
    return keyMap[key] || key.toLowerCase();
  }

  /**
   * Check if element is an input field where shortcuts should be disabled
   */
  isInputElement(element) {
    if (!element) return false;
    
    const tagName = element.tagName.toLowerCase();
    const inputTypes = ['text', 'password', 'email', 'search', 'tel', 'url', 'number'];
    
    // Check for input/textarea
    if (tagName === 'textarea') return true;
    if (tagName === 'input' && inputTypes.includes(element.type?.toLowerCase())) return true;
    
    // Check for contenteditable
    if (element.isContentEditable) return true;
    
    // Check for Material-UI input wrappers
    if (element.closest('.MuiInputBase-root') || 
        element.closest('[contenteditable="true"]')) {
      return true;
    }
    
    return false;
  }

  /**
   * Disable all shortcuts
   */
  disable() {
    this.enabled = false;
  }

  /**
   * Enable all shortcuts
   */
  enable() {
    this.enabled = true;
  }

  /**
   * Toggle enabled state
   */
  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  /**
   * Get all registered shortcuts
   */
  getAllShortcuts() {
    return Array.from(this.shortcuts.entries()).map(([key, shortcut]) => ({
      shortcutKey: key,
      ...shortcut
    }));
  }

  /**
   * Get shortcuts grouped by category
   */
  getShortcutsByCategory() {
    const shortcuts = this.getAllShortcuts();
    const grouped = {};
    
    shortcuts.forEach(shortcut => {
      if (!grouped[shortcut.category]) {
        grouped[shortcut.category] = [];
      }
      grouped[shortcut.category].push(shortcut);
    });
    
    return grouped;
  }

  /**
   * Get conflict warnings
   */
  getConflicts() {
    return this.conflictWarnings;
  }

  /**
   * Clear all registered shortcuts
   */
  clear() {
    this.shortcuts.clear();
    this.conflictWarnings = [];
  }

  /**
   * Format shortcut for display (e.g., "Ctrl + K")
   */
  formatShortcut(key, modifiers) {
    const parts = [];
    
    // Use platform-specific naming
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    
    if (modifiers.ctrl) parts.push(isMac ? '⌘' : 'Ctrl');
    if (modifiers.shift) parts.push(isMac ? '⇧' : 'Shift');
    if (modifiers.alt) parts.push(isMac ? '⌥' : 'Alt');
    
    // Capitalize key for display
    const displayKey = key.length === 1 ? key.toUpperCase() : key;
    parts.push(displayKey);
    
    return parts.join(' + ');
  }

  /**
   * Check if a shortcut is registered
   */
  has(key, modifiers = {}) {
    const shortcutKey = this.getShortcutKey(key, modifiers);
    return this.shortcuts.has(shortcutKey);
  }

  /**
   * Enable/disable specific shortcut
   */
  setShortcutEnabled(key, modifiers, enabled) {
    const shortcutKey = this.getShortcutKey(key, modifiers);
    const shortcut = this.shortcuts.get(shortcutKey);
    
    if (shortcut) {
      shortcut.enabled = enabled;
      return true;
    }
    
    return false;
  }
}

// Export singleton instance for convenience
export const keyboardShortcuts = new KeyboardShortcutManager();

// Export key constants for convenience
export const Keys = {
  ESCAPE: 'Escape',
  ENTER: 'Enter',
  SPACE: 'Space',
  TAB: 'Tab',
  BACKSPACE: 'Backspace',
  DELETE: 'Delete',
  ARROW_UP: 'ArrowUp',
  ARROW_DOWN: 'ArrowDown',
  ARROW_LEFT: 'ArrowLeft',
  ARROW_RIGHT: 'ArrowRight',
  HOME: 'Home',
  END: 'End',
  PAGE_UP: 'PageUp',
  PAGE_DOWN: 'PageDown'
};
