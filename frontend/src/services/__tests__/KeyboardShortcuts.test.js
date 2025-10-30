/**
 * @jest-environment jsdom
 */

import { KeyboardShortcutManager } from '../KeyboardShortcuts';

describe('KeyboardShortcutManager', () => {
  let manager;
  let originalPlatform;

  beforeEach(() => {
    manager = new KeyboardShortcutManager();
    // Save original platform
    originalPlatform = navigator.platform;
    // Mock console methods to avoid noise
    jest.spyOn(console, 'warn').mockImplementation(() => { });
    jest.spyOn(console, 'log').mockImplementation(() => { });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // Restore original platform
    Object.defineProperty(navigator, 'platform', {
      value: originalPlatform,
      configurable: true
    });
  });

  describe('register', () => {
    it('should register a new shortcut', () => {
      const action = jest.fn();
      const id = manager.register('k', { ctrl: true }, action, 'Test Shortcut', 'Test');

      expect(id).toBeDefined();
      expect(manager.getAllShortcuts()).toHaveLength(1);
    });

    it('should generate unique IDs for shortcuts', () => {
      const action1 = jest.fn();
      const action2 = jest.fn();

      const id1 = manager.register('k', { ctrl: true }, action1);
      const id2 = manager.register('p', {}, action2);

      expect(id1).not.toBe(id2);
    });

    it('should warn about conflicting shortcuts', () => {
      const action1 = jest.fn();
      const action2 = jest.fn();

      manager.register('k', { ctrl: true }, action1, 'First', 'Test');
      manager.register('k', { ctrl: true }, action2, 'Second', 'Test');

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Shortcut conflict detected')
      );
    });

    it('should handle shortcuts without modifiers', () => {
      const action = jest.fn();
      const id = manager.register('p', {}, action, 'Pen Tool', 'Tools');

      expect(id).toBeDefined();
      expect(manager.getAllShortcuts()[0].modifiers).toEqual({});
    });
  });

  describe('unregister', () => {
    it('should remove a registered shortcut', () => {
      const action = jest.fn();
      const id = manager.register('k', { ctrl: true }, action);

      expect(manager.getAllShortcuts()).toHaveLength(1);

      manager.unregister(id);

      expect(manager.getAllShortcuts()).toHaveLength(0);
    });

    it('should do nothing when unregistering non-existent ID', () => {
      expect(() => manager.unregister('non-existent')).not.toThrow();
    });
  });

  describe('handleKeyDown', () => {
    it('should execute action for matching shortcut', () => {
      const action = jest.fn();
      manager.register('k', { ctrl: true }, action);

      const event = new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true,
        bubbles: true
      });

      manager.handleKeyDown(event);

      expect(action).toHaveBeenCalled();
    });

    it('should not execute when modifiers do not match', () => {
      const action = jest.fn();
      manager.register('k', { ctrl: true, shift: true }, action);

      const event = new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true,
        shiftKey: false
      });

      manager.handleKeyDown(event);

      expect(action).not.toHaveBeenCalled();
    });

    it('should not execute when disabled', () => {
      const action = jest.fn();
      manager.register('k', { ctrl: true }, action);
      manager.disable();

      const event = new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true
      });

      manager.handleKeyDown(event);

      expect(action).not.toHaveBeenCalled();
    });

    it('should handle case-insensitive key matching', () => {
      const action = jest.fn();
      manager.register('k', { ctrl: true }, action);

      const event = new KeyboardEvent('keydown', {
        key: 'K',
        ctrlKey: true
      });

      manager.handleKeyDown(event);

      expect(action).toHaveBeenCalled();
    });

    it('should accept both Ctrl and Meta (Command) keys', () => {
      const action = jest.fn();
      manager.register('k', { ctrl: true }, action);

      // Test with metaKey (Command on Mac)
      const event = new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: true
      });

      manager.handleKeyDown(event);

      expect(action).toHaveBeenCalled();
    });

    it('should prevent default and stop propagation on match', () => {
      const action = jest.fn();
      manager.register('k', { ctrl: true }, action);

      const event = new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true
      });

      const preventDefaultSpy = jest.spyOn(event, 'preventDefault');
      const stopPropagationSpy = jest.spyOn(event, 'stopPropagation');

      manager.handleKeyDown(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(stopPropagationSpy).toHaveBeenCalled();
    });

    it('should ignore events in input elements', () => {
      const action = jest.fn();
      manager.register('k', { ctrl: true }, action);

      // Create a mock input element
      const input = document.createElement('input');
      document.body.appendChild(input);

      const event = new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true,
        bubbles: true
      });

      Object.defineProperty(event, 'target', { value: input, configurable: true });

      manager.handleKeyDown(event);

      expect(action).not.toHaveBeenCalled();

      document.body.removeChild(input);
    });

    it('should ignore events in textarea elements', () => {
      const action = jest.fn();
      manager.register('k', { ctrl: true }, action);

      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);

      const event = new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true
      });

      Object.defineProperty(event, 'target', { value: textarea, configurable: true });

      manager.handleKeyDown(event);

      expect(action).not.toHaveBeenCalled();

      document.body.removeChild(textarea);
    });

    it('should ignore events in contenteditable elements', () => {
      const action = jest.fn();
      manager.register('k', { ctrl: true }, action);

      const div = document.createElement('div');
      div.contentEditable = 'true';
      document.body.appendChild(div);

      const event = new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true
      });

      Object.defineProperty(event, 'target', { value: div, configurable: true });

      manager.handleKeyDown(event);

      expect(action).not.toHaveBeenCalled();

      document.body.removeChild(div);
    });
  });

  describe('formatShortcut', () => {
    it('should format shortcut with Ctrl modifier on Windows', () => {
      // Mock Windows platform
      Object.defineProperty(navigator, 'platform', {
        value: 'Win32',
        configurable: true
      });

      const formatted = manager.formatShortcut({ key: 'k', modifiers: { ctrl: true } });
      expect(formatted).toBe('Ctrl+K');
    });

    it('should format shortcut with Command symbol on Mac', () => {
      // Mock Mac platform
      Object.defineProperty(navigator, 'platform', {
        value: 'MacIntel',
        configurable: true
      });

      const formatted = manager.formatShortcut({ key: 'k', modifiers: { ctrl: true } });
      expect(formatted).toBe('⌘K');
    });

    it('should format multiple modifiers', () => {
      const formatted = manager.formatShortcut({
        key: 'k',
        modifiers: { ctrl: true, shift: true, alt: true }
      });

      expect(formatted).toContain('K');
      expect(formatted.split('+').length).toBe(4); // Ctrl+Shift+Alt+K
    });

    it('should handle shortcuts without modifiers', () => {
      const formatted = manager.formatShortcut({ key: 'p', modifiers: {} });
      expect(formatted).toBe('P');
    });

    it('should capitalize single letters', () => {
      const formatted = manager.formatShortcut({ key: 'a', modifiers: {} });
      expect(formatted).toBe('A');
    });
  });

  describe('getAllShortcuts', () => {
    it('should return all registered shortcuts', () => {
      manager.register('k', { ctrl: true }, jest.fn(), 'First', 'Test');
      manager.register('p', {}, jest.fn(), 'Second', 'Test');
      manager.register('z', { ctrl: true }, jest.fn(), 'Third', 'Edit');

      const shortcuts = manager.getAllShortcuts();

      expect(shortcuts).toHaveLength(3);
      expect(shortcuts[0].description).toBe('First');
      expect(shortcuts[1].description).toBe('Second');
      expect(shortcuts[2].description).toBe('Third');
    });

    it('should return empty array when no shortcuts registered', () => {
      expect(manager.getAllShortcuts()).toEqual([]);
    });
  });

  describe('getShortcutsByCategory', () => {
    it('should filter shortcuts by category', () => {
      manager.register('k', { ctrl: true }, jest.fn(), 'Command', 'Commands');
      manager.register('p', {}, jest.fn(), 'Tool', 'Tools');
      manager.register('z', { ctrl: true }, jest.fn(), 'Edit', 'Edit');

      const commands = manager.getShortcutsByCategory('Commands');
      expect(commands).toHaveLength(1);
      expect(commands[0].description).toBe('Command');

      const tools = manager.getShortcutsByCategory('Tools');
      expect(tools).toHaveLength(1);
      expect(tools[0].description).toBe('Tool');
    });

    it('should return empty array for non-existent category', () => {
      manager.register('k', { ctrl: true }, jest.fn(), 'Test', 'Test');

      expect(manager.getShortcutsByCategory('NonExistent')).toEqual([]);
    });
  });

  describe('enable/disable', () => {
    it('should enable shortcuts after being disabled', () => {
      const action = jest.fn();
      manager.register('k', { ctrl: true }, action);

      manager.disable();
      manager.enable();

      const event = new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true
      });

      manager.handleKeyDown(event);

      expect(action).toHaveBeenCalled();
    });

    it('should start enabled by default', () => {
      const action = jest.fn();
      manager.register('k', { ctrl: true }, action);

      const event = new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true
      });

      manager.handleKeyDown(event);

      expect(action).toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('should remove all shortcuts', () => {
      manager.register('k', { ctrl: true }, jest.fn());
      manager.register('p', {}, jest.fn());
      manager.register('z', { ctrl: true }, jest.fn());

      expect(manager.getAllShortcuts()).toHaveLength(3);

      manager.clear();

      expect(manager.getAllShortcuts()).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should handle special keys', () => {
      const action = jest.fn();
      manager.register('Enter', { ctrl: true }, action);

      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true
      });

      manager.handleKeyDown(event);

      expect(action).toHaveBeenCalled();
    });

    it('should handle slash key', () => {
      const action = jest.fn();
      manager.register('/', { ctrl: true }, action);

      const event = new KeyboardEvent('keydown', {
        key: '/',
        ctrlKey: true
      });

      manager.handleKeyDown(event);

      expect(action).toHaveBeenCalled();
    });

    it('should not throw on null action', () => {
      manager.register('k', { ctrl: true }, null);

      const event = new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true
      });

      expect(() => manager.handleKeyDown(event)).not.toThrow();
    });

    it('should handle multiple actions for same key with different modifiers', () => {
      const action1 = jest.fn();
      const action2 = jest.fn();

      manager.register('z', { ctrl: true }, action1, 'Undo', 'Edit');
      manager.register('z', { ctrl: true, shift: true }, action2, 'Redo', 'Edit');

      // Test Ctrl+Z
      const event1 = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        shiftKey: false
      });
      manager.handleKeyDown(event1);
      expect(action1).toHaveBeenCalled();
      expect(action2).not.toHaveBeenCalled();

      action1.mockClear();
      action2.mockClear();

      // Test Ctrl+Shift+Z
      const event2 = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        shiftKey: true
      });
      manager.handleKeyDown(event2);
      expect(action1).not.toHaveBeenCalled();
      expect(action2).toHaveBeenCalled();
    });
  });
});
