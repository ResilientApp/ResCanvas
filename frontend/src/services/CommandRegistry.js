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
    this.listeners = [];
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
      console.error('[CommandRegistry] Command must have an id:', command);
      return false;
    }

    if (!command.action || typeof command.action !== 'function') {
      console.error('[CommandRegistry] Command must have an action function:', command);
      return false;
    }

    if (this.commands.has(command.id)) {
      console.warn(`[CommandRegistry] Command "${command.id}" already registered. Overwriting.`);
    }

    const fullCommand = {
      id: command.id,
      label: command.label || command.id,
      description: command.description || '',
      keywords: command.keywords || [],
      action: command.action,
      category: command.category || 'General',
      shortcut: command.shortcut || null,
      icon: command.icon || null,
      enabled: command.enabled || (() => true),
      visible: command.visible || (() => true),
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
      console.warn(`[CommandRegistry] Command "${commandId}" not found`);
      return { success: false, error: 'Command not found' };
    }

    if (typeof command.enabled === 'function' && !command.enabled()) {
      console.warn(`[CommandRegistry] Command "${commandId}" is disabled`);
      return { success: false, error: 'Command is disabled' };
    }

    try {
      this.notifyListeners('before-execute', command);
      const result = await command.action(...args);
      this.notifyListeners('after-execute', command, result);
      
      return { success: true, result };
    } catch (error) {
      console.error(`[CommandRegistry] Error executing command "${commandId}":`, error);
      this.notifyListeners('error', command, error);
      
      return { success: false, error: error.message };
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
   */
  getAll() {
    return Array.from(this.commands.values()).filter(cmd => {
      try {
        return typeof cmd.visible === 'function' ? cmd.visible() : true;
      } catch (error) {
        console.error(`[CommandRegistry] Error checking visibility for "${cmd.id}":`, error);
        return true;
      }
    });
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
   * Searches in label, description, keywords, and category
   */
  search(query) {
    if (!query || query.trim() === '') {
      return this.getAll();
    }

    const normalizedQuery = query.toLowerCase().trim();
    const words = normalizedQuery.split(/\s+/);

    return this.getAll().filter(cmd => {
      const searchText = [
        cmd.label,
        cmd.description,
        cmd.category,
        ...cmd.keywords
      ].join(' ').toLowerCase();

      // Match all words in the query
      return words.every(word => searchText.includes(word));
    }).sort((a, b) => {
      // Prioritize exact label matches
      const aLabelMatch = a.label.toLowerCase().includes(normalizedQuery);
      const bLabelMatch = b.label.toLowerCase().includes(normalizedQuery);
      
      if (aLabelMatch && !bLabelMatch) return -1;
      if (!aLabelMatch && bLabelMatch) return 1;
      
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
   * Register a listener for registry events
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
    this.listeners.forEach(listener => {
      try {
        listener(event, ...args);
      } catch (error) {
        console.error('[CommandRegistry] Error in listener:', error);
      }
    });
  }

  /**
   * Get registry statistics
   */
  getStats() {
    const all = this.getAll();
    return {
      total: all.length,
      byCategory: this.getCategories().reduce((acc, cat) => {
        acc[cat] = this.getByCategory(cat).length;
        return acc;
      }, {}),
      withShortcuts: this.getCommandsWithShortcuts().length,
      enabled: all.filter(cmd => cmd.enabled()).length,
      visible: all.length // Already filtered by getAll()
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
