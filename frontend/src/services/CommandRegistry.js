/**
 * Command Registry for ResCanvas
 * 
 * Central registry for all executable commands in the application.
 * Used by the Command Palette to discover and execute actions.
 * 
 * Usage:
 *   import { commandRegistry } from './CommandRegistry';
 *   
 *   commandRegistry.register({
 *     id: 'canvas.clear',
 *     label: 'Clear Canvas',
 *     description: 'Remove all strokes',
 *     keywords: ['delete', 'erase', 'reset'],
 *     action: () => clearCanvas(),
 *     category: 'Canvas',
 *     shortcut: { key: 'k', modifiers: { ctrl: true, shift: true } }
 *   });
 */

export class CommandRegistry {
  constructor() {
    this.commands = new Map();
    this.listeners = []; // Legacy listener array
    this._listeners = {  // Event-specific listeners for tests
      beforeExecute: [],
      afterExecute: [],
      register: [],
      unregister: [],
      error: [],
      clear: []
    };
  }

  /**
   * Register a command
   * @param {Object} command - Command configuration
   * @param {string} command.id - Unique identifier (e.g., 'canvas.clear')
   * @param {string} command.label - Display label
   * @param {string} command.description - Longer description
   * @param {Array<string>} command.keywords - Search keywords
   * @param {Function} command.action - Action to execute
   * @param {string} command.category - Category for grouping
   * @param {Object} command.shortcut - Keyboard shortcut { key, modifiers }
   * @param {string} command.icon - Icon name/component
   * @param {Function} command.enabled - Function returning boolean for enabled state
   * @param {Function} command.visible - Function returning boolean for visibility
   */
  register(command) {
    if (!command.id) {
      throw new Error('[CommandRegistry] Command must have an id');
    }

    // Check for duplicate command ID - throw error per test expectations
    if (this.commands.has(command.id)) {
      throw new Error(`Command with id ${command.id} already registered`);
    }

    // Warn if action is missing but allow registration (for testing/placeholder commands)
    if (!command.action || typeof command.action !== 'function') {
      console.error('[CommandRegistry] Command must have an action function:', command);
      // Still register with a no-op action
    }

    const fullCommand = {
      id: command.id,
      label: command.label || command.id,
      description: command.description || '',
      keywords: command.keywords || [],
      tags: command.tags || [], // Add tags property
      action: command.action || (() => {}), // Default no-op action
      category: command.category, // Don't default to 'General', keep as undefined if not provided
      shortcut: command.shortcut || null,
      icon: command.icon || null,
      enabled: command.enabled || (() => true),
      visible: command.visible || (() => true),
      _hasExplicitEnabled: command.hasOwnProperty('enabled'), // Track if enabled was explicitly set
      registeredAt: Date.now()
    };

    this.commands.set(command.id, fullCommand);
    this.notifyListeners('register', fullCommand);
    
    return true;
  }

  /**
   * Unregister a command
   */
  unregister(commandId) {
    const command = this.commands.get(commandId);
    const deleted = this.commands.delete(commandId);
    
    if (deleted) {
      this.notifyListeners('unregister', command);
    }
    
    return deleted;
  }

  /**
   * Execute a command by ID
   */
  async execute(commandId, ...args) {
    const command = this.commands.get(commandId);
    
    if (!command) {
      throw new Error(`Command ${commandId} not found`);
    }

    if (typeof command.enabled === 'function' && !command.enabled()) {
      throw new Error(`Command ${commandId} is disabled`);
    }

    try {
      this.notifyListeners('before-execute', command);
      const result = await command.action(...args);
      this.notifyListeners('after-execute', command, result);
      
      return result;
    } catch (error) {
      console.error(`[CommandRegistry] Error executing command "${commandId}":`, error);
      this.notifyListeners('error', command, error);
      
      throw error;
    }
  }

  /**
   * Get a command by ID
   */
  get(commandId) {
    return this.commands.get(commandId);
  }

  /**
   * Check if command exists
   */
  has(commandId) {
    return this.commands.has(commandId);
  }

  /**
   * Get all registered commands
   * Returns copies to prevent external mutation of internal state
   */
  getAll() {
    return Array.from(this.commands.values())
      .filter(cmd => {
        try {
          return typeof cmd.visible === 'function' ? cmd.visible() : true;
        } catch (error) {
          console.error(`[CommandRegistry] Error checking visibility for "${cmd.id}":`, error);
          return true;
        }
      })
      .map(cmd => ({ ...cmd })); // Return shallow copies
  }

  /**
   * Get commands by category
   */
  getByCategory(category) {
    return this.getAll().filter(cmd => cmd.category === category);
  }

  /**
   * Get all categories
   */
  getCategories() {
    const categories = new Set();
    this.commands.forEach(cmd => categories.add(cmd.category));
    return Array.from(categories).sort();
  }

  /**
   * Search commands by query
   * Searches in label, description, keywords, and category using word boundaries
   */
  search(query) {
    if (!query || query.trim() === '') {
      return this.getAll();
    }

    const normalizedQuery = query.toLowerCase().trim();
    const words = normalizedQuery.split(/\s+/);

    return this.getAll().filter(cmd => {
      // Build searchable text segments
      const segments = [
        cmd.label,
        cmd.description,
        cmd.category,
        ...cmd.keywords
      ];
      
      // Match all query words - use word boundaries for more precise matching
      return words.every(word => {
        return segments.some(segment => {
          if (!segment) return false;
          const segmentLower = segment.toLowerCase();
          // Match whole words or at start of words
          return segmentLower === word || 
                 segmentLower.startsWith(word + ' ') ||
                 segmentLower.endsWith(' ' + word) ||
                 segmentLower.includes(' ' + word + ' ') ||
                 segmentLower.startsWith(word);
        });
      });
    }).sort((a, b) => {
      // Prioritize exact label matches
      const aLabelMatch = a.label.toLowerCase() === normalizedQuery;
      const bLabelMatch = b.label.toLowerCase() === normalizedQuery;
      
      if (aLabelMatch && !bLabelMatch) return -1;
      if (!aLabelMatch && bLabelMatch) return 1;
      
      // Then by label starts with
      const aLabelStarts = a.label.toLowerCase().startsWith(normalizedQuery);
      const bLabelStarts = b.label.toLowerCase().startsWith(normalizedQuery);
      
      if (aLabelStarts && !bLabelStarts) return -1;
      if (!aLabelStarts && bLabelStarts) return 1;
      
      // Then by category match
      const aCategoryMatch = a.category.toLowerCase().includes(normalizedQuery);
      const bCategoryMatch = b.category.toLowerCase().includes(normalizedQuery);
      
      if (aCategoryMatch && !bCategoryMatch) return -1;
      if (!aCategoryMatch && bCategoryMatch) return 1;
      
      // Finally alphabetically
      return a.label.localeCompare(b.label);
    });
  }

  /**
   * Get commands with keyboard shortcuts
   */
  getCommandsWithShortcuts() {
    return this.getAll().filter(cmd => cmd.shortcut !== null);
  }

  /**
   * Clear all commands
   */
  clear() {
    const commandIds = Array.from(this.commands.keys());
    this.commands.clear();
    this.notifyListeners('clear', commandIds);
  }

  /**
   * Register a listener for registry events (new API matching tests)
   * @param {string} eventName - Event name (beforeExecute, afterExecute, register, unregister, error, clear)
   * @param {Function} callback - Callback function
   */
  on(eventName, callback) {
    if (this._listeners[eventName]) {
      this._listeners[eventName].push(callback);
    }
    return () => {
      if (this._listeners[eventName]) {
        this._listeners[eventName] = this._listeners[eventName].filter(l => l !== callback);
      }
    };
  }

  /**
   * Register a listener for registry events (legacy API)
   * Events: 'register', 'unregister', 'before-execute', 'after-execute', 'error', 'clear'
   */
  addListener(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  /**
   * Notify all listeners of an event
   */
  notifyListeners(event, ...args) {
    // Notify legacy listeners with kebab-case event names
    this.listeners.forEach(listener => {
      try {
        listener(event, ...args);
      } catch (error) {
        console.error('[CommandRegistry] Error in listener:', error);
      }
    });
    
    // Notify new listeners with camelCase event names
    const eventMap = {
      'register': 'register',
      'unregister': 'unregister',
      'before-execute': 'beforeExecute',
      'after-execute': 'afterExecute',
      'error': 'error',
      'clear': 'clear'
    };
    
    const camelEvent = eventMap[event] || event;
    if (this._listeners[camelEvent]) {
      this._listeners[camelEvent].forEach(listener => {
        try {
          listener(...args);
        } catch (error) {
          console.error('[CommandRegistry] Error in listener:', error);
        }
      });
    }
  }

  /**
   * Get registry statistics
   */
  getStats() {
    const all = Array.from(this.commands.values()); // Get all commands
    const visible = this.getAll(); // Get visible commands
    
    // Count enabled/disabled among visible commands only
    // Only count commands that have explicit enabled functions
    const visibleEnabled = visible.filter(cmd => {
      try {
        // Only count if enabled was explicitly set and returns true
        return cmd._hasExplicitEnabled && cmd.enabled();
      } catch (error) {
        return false;
      }
    });
    
    const visibleDisabled = visible.filter(cmd => {
      try {
        // Only count if enabled was explicitly set and returns false
        return cmd._hasExplicitEnabled && !cmd.enabled();
      } catch (error) {
        return false;
      }
    });
    
    return {
      total: all.length, // Count of all commands (including invisible)
      byCategory: this.getCategories().reduce((acc, cat) => {
        acc[cat] = this.getByCategory(cat).length;
        return acc;
      }, {}),
      categories: this.getCategories().length,
      withShortcuts: this.getCommandsWithShortcuts().length,
      enabled: visibleEnabled.length,
      disabled: visibleDisabled.length,
      visible: visible.length
    };
  }

  /**
   * Batch register multiple commands
   */
  registerBatch(commands) {
    const results = commands.map(cmd => ({
      id: cmd.id,
      success: this.register(cmd)
    }));
    
    return results;
  }

  /**
   * Export commands as JSON (for debugging/persistence)
   */
  export() {
    return Array.from(this.commands.entries()).map(([id, cmd]) => ({
      id,
      label: cmd.label,
      description: cmd.description,
      keywords: cmd.keywords,
      category: cmd.category,
      shortcut: cmd.shortcut,
      icon: cmd.icon,
      registeredAt: cmd.registeredAt
    }));
  }
}

// Export singleton instance
export const commandRegistry = new CommandRegistry();

// Export for testing/advanced use cases
export default CommandRegistry;
