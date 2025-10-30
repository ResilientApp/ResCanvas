/**
 * @jest-environment jsdom
 */

import { CommandRegistry } from '../CommandRegistry';

describe('CommandRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new CommandRegistry();
  });

  describe('register', () => {
    it('should register a new command', () => {
      const command = {
        id: 'test.command',
        label: 'Test Command',
        action: jest.fn()
      };

      registry.register(command);

      const all = registry.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe('test.command');
    });

    it('should throw error for duplicate command ID', () => {
      const command1 = { id: 'test.command', label: 'First', action: jest.fn() };
      const command2 = { id: 'test.command', label: 'Second', action: jest.fn() };

      registry.register(command1);

      expect(() => registry.register(command2)).toThrow('Command with id test.command already registered');
    });

    it('should use id as label if label not provided', () => {
      const command = { id: 'test.command', action: jest.fn() };

      registry.register(command);

      const all = registry.getAll();
      expect(all[0].label).toBe('test.command');
    });

    it('should default to empty arrays for keywords and tags', () => {
      const command = { id: 'test.command', action: jest.fn() };

      registry.register(command);

      const all = registry.getAll();
      expect(all[0].keywords).toEqual([]);
      expect(all[0].tags).toEqual([]);
    });
  });

  describe('unregister', () => {
    it('should remove a registered command', () => {
      registry.register({ id: 'test.command', action: jest.fn() });

      expect(registry.getAll()).toHaveLength(1);

      registry.unregister('test.command');

      expect(registry.getAll()).toHaveLength(0);
    });

    it('should do nothing when unregistering non-existent command', () => {
      expect(() => registry.unregister('non.existent')).not.toThrow();
    });
  });

  describe('execute', () => {
    it('should execute registered command', async () => {
      const action = jest.fn().mockResolvedValue('result');
      registry.register({ id: 'test.command', action });

      const result = await registry.execute('test.command');

      expect(action).toHaveBeenCalled();
      expect(result).toBe('result');
    });

    it('should throw error for non-existent command', async () => {
      await expect(registry.execute('non.existent')).rejects.toThrow('Command non.existent not found');
    });

    it('should not execute disabled command', async () => {
      const action = jest.fn();
      registry.register({
        id: 'test.command',
        action,
        enabled: () => false
      });

      await expect(registry.execute('test.command')).rejects.toThrow('Command test.command is disabled');
      expect(action).not.toHaveBeenCalled();
    });

    it('should call onBeforeExecute and onAfterExecute listeners', async () => {
      const action = jest.fn().mockResolvedValue('result');
      const beforeListener = jest.fn();
      const afterListener = jest.fn();

      registry.on('beforeExecute', beforeListener);
      registry.on('afterExecute', afterListener);

      registry.register({ id: 'test.command', action });

      await registry.execute('test.command');

      expect(beforeListener).toHaveBeenCalledWith(expect.objectContaining({ id: 'test.command' }));
      expect(afterListener).toHaveBeenCalledWith(expect.objectContaining({ id: 'test.command' }), 'result');
    });

    it('should call onError listener when action throws', async () => {
      const error = new Error('Test error');
      const action = jest.fn().mockRejectedValue(error);
      const errorListener = jest.fn();

      registry.on('error', errorListener);
      registry.register({ id: 'test.command', action });

      await expect(registry.execute('test.command')).rejects.toThrow('Test error');
      expect(errorListener).toHaveBeenCalledWith(expect.objectContaining({ id: 'test.command' }), error);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      registry.register({
        id: 'edit.undo',
        label: 'Undo',
        description: 'Undo last action',
        keywords: ['revert', 'back'],
        category: 'Edit'
      });

      registry.register({
        id: 'edit.redo',
        label: 'Redo',
        description: 'Redo last undone action',
        keywords: ['forward', 'again'],
        category: 'Edit'
      });

      registry.register({
        id: 'canvas.clear',
        label: 'Clear Canvas',
        description: 'Remove all strokes',
        keywords: ['delete', 'erase', 'reset'],
        category: 'Canvas'
      });
    });

    it('should search by label', () => {
      const results = registry.search('undo');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('edit.undo');
    });

    it('should search by description', () => {
      const results = registry.search('remove all');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe('canvas.clear');
    });

    it('should search by keywords', () => {
      const results = registry.search('revert');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('edit.undo');
    });

    it('should be case-insensitive', () => {
      const results = registry.search('UNDO');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('edit.undo');
    });

    it('should return empty array for no matches', () => {
      const results = registry.search('nonexistent');

      expect(results).toEqual([]);
    });

    it('should return all commands for empty query', () => {
      const results = registry.search('');

      expect(results).toHaveLength(3);
    });

    it('should filter out invisible commands', () => {
      registry.register({
        id: 'hidden.command',
        label: 'Hidden',
        visible: () => false
      });

      const results = registry.search('');

      expect(results).toHaveLength(3); // Should not include hidden command
    });

    it('should match partial words', () => {
      const results = registry.search('cle');

      expect(results.some(r => r.id === 'canvas.clear')).toBe(true);
    });

    it('should match across multiple fields', () => {
      const results = registry.search('clear');

      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.id === 'canvas.clear')).toBe(true);
    });
  });

  describe('getByCategory', () => {
    beforeEach(() => {
      registry.register({ id: 'edit.undo', label: 'Undo', category: 'Edit' });
      registry.register({ id: 'edit.redo', label: 'Redo', category: 'Edit' });
      registry.register({ id: 'canvas.clear', label: 'Clear', category: 'Canvas' });
    });

    it('should return commands by category', () => {
      const editCommands = registry.getByCategory('Edit');

      expect(editCommands).toHaveLength(2);
      expect(editCommands.every(c => c.category === 'Edit')).toBe(true);
    });

    it('should return empty array for non-existent category', () => {
      const results = registry.getByCategory('NonExistent');

      expect(results).toEqual([]);
    });

    it('should handle undefined category', () => {
      registry.register({ id: 'no.category', label: 'No Category' });

      const results = registry.getByCategory(undefined);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('no.category');
    });
  });

  describe('getAll', () => {
    it('should return all registered commands', () => {
      registry.register({ id: 'cmd1', label: 'Command 1' });
      registry.register({ id: 'cmd2', label: 'Command 2' });
      registry.register({ id: 'cmd3', label: 'Command 3' });

      const all = registry.getAll();

      expect(all).toHaveLength(3);
    });

    it('should return empty array when no commands registered', () => {
      expect(registry.getAll()).toEqual([]);
    });

    it('should return copies, not references to internal state', () => {
      registry.register({ id: 'cmd1', label: 'Command 1' });

      const all = registry.getAll();
      all[0].label = 'Modified';

      const allAgain = registry.getAll();
      expect(allAgain[0].label).toBe('Command 1'); // Original unchanged
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      registry.register({ id: 'edit.undo', category: 'Edit', enabled: () => true });
      registry.register({ id: 'edit.redo', category: 'Edit', enabled: () => false });
      registry.register({ id: 'canvas.clear', category: 'Canvas', visible: () => false });
      registry.register({ id: 'tools.pen', category: 'Tools' });
    });

    it('should return correct command count', () => {
      const stats = registry.getStats();
      expect(stats.total).toBe(4);
    });

    it('should count enabled commands', () => {
      const stats = registry.getStats();
      expect(stats.enabled).toBe(1);
    });

    it('should count disabled commands', () => {
      const stats = registry.getStats();
      expect(stats.disabled).toBe(1);
    });

    it('should count categories', () => {
      const stats = registry.getStats();
      expect(stats.categories).toBe(3);
    });
  });

  describe('event listeners', () => {
    it('should register event listeners', () => {
      const listener = jest.fn();

      registry.on('beforeExecute', listener);

      expect(registry._listeners.beforeExecute).toContain(listener);
    });

    it('should call multiple listeners', async () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      registry.on('beforeExecute', listener1);
      registry.on('beforeExecute', listener2);

      registry.register({ id: 'test.command', action: jest.fn() });

      await registry.execute('test.command');

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('should handle listener errors gracefully', async () => {
      const errorListener = jest.fn(() => {
        throw new Error('Listener error');
      });
      const action = jest.fn();

      registry.on('beforeExecute', errorListener);
      registry.register({ id: 'test.command', action });

      // Should not throw, execution continues
      await expect(registry.execute('test.command')).resolves.toBeUndefined();
      expect(action).toHaveBeenCalled();
    });
  });

  describe('batch registration', () => {
    it('should register multiple commands at once', () => {
      const commands = [
        { id: 'cmd1', label: 'Command 1' },
        { id: 'cmd2', label: 'Command 2' },
        { id: 'cmd3', label: 'Command 3' }
      ];

      commands.forEach(cmd => registry.register(cmd));

      expect(registry.getAll()).toHaveLength(3);
    });
  });

  describe('enabled/visible conditions', () => {
    it('should evaluate enabled condition dynamically', () => {
      let isEnabled = true;
      registry.register({
        id: 'test.command',
        action: jest.fn(),
        enabled: () => isEnabled
      });

      const command1 = registry.getAll()[0];
      expect(command1.enabled()).toBe(true);

      isEnabled = false;

      const command2 = registry.getAll()[0];
      expect(command2.enabled()).toBe(false);
    });

    it('should evaluate visible condition dynamically', () => {
      let isVisible = true;
      registry.register({
        id: 'test.command',
        action: jest.fn(),
        visible: () => isVisible
      });

      expect(registry.search('').length).toBe(1);

      isVisible = false;

      expect(registry.search('').length).toBe(0);
    });

    it('should default enabled to true', () => {
      registry.register({ id: 'test.command', action: jest.fn() });

      const command = registry.getAll()[0];
      expect(command.enabled()).toBe(true);
    });

    it('should default visible to true', () => {
      registry.register({ id: 'test.command', action: jest.fn() });

      const command = registry.getAll()[0];
      expect(command.visible()).toBe(true);
    });
  });

  describe('clear', () => {
    it('should remove all commands', () => {
      registry.register({ id: 'cmd1', label: 'Command 1' });
      registry.register({ id: 'cmd2', label: 'Command 2' });

      expect(registry.getAll()).toHaveLength(2);

      registry.clear();

      expect(registry.getAll()).toHaveLength(0);
    });
  });
});
