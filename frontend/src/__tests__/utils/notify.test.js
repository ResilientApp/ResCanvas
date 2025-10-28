
import notify from '../../utils/notify';

describe('notify', () => {
  let dispatchEventSpy;
  let consoleWarnSpy;

  beforeEach(() => {
    dispatchEventSpy = jest.spyOn(window, 'dispatchEvent');
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should dispatch custom event with message and default duration', () => {
    const message = 'Test notification';
    notify(message);

    expect(dispatchEventSpy).toHaveBeenCalledTimes(1);

    const event = dispatchEventSpy.mock.calls[0][0];
    expect(event.type).toBe('rescanvas:notify');
    expect(event.detail.message).toBe(message);
    expect(event.detail.duration).toBe(4000);
  });

  it('should dispatch custom event with custom duration', () => {
    const message = 'Custom duration notification';
    const duration = 2000;
    notify(message, duration);

    expect(dispatchEventSpy).toHaveBeenCalledTimes(1);

    const event = dispatchEventSpy.mock.calls[0][0];
    expect(event.type).toBe('rescanvas:notify');
    expect(event.detail.message).toBe(message);
    expect(event.detail.duration).toBe(duration);
  });

  it('should convert non-string messages to strings', () => {
    notify(123);

    const event = dispatchEventSpy.mock.calls[0][0];
    expect(event.detail.message).toBe('123');
    expect(typeof event.detail.message).toBe('string');
  });

  it('should handle object messages by converting to string', () => {
    const obj = { error: 'test' };
    notify(obj);

    const event = dispatchEventSpy.mock.calls[0][0];
    expect(typeof event.detail.message).toBe('string');
    expect(event.detail.message).toContain('object');
  });

  it('should handle null message', () => {
    notify(null);

    const event = dispatchEventSpy.mock.calls[0][0];
    expect(event.detail.message).toBe('null');
  });

  it('should handle undefined message', () => {
    notify(undefined);

    const event = dispatchEventSpy.mock.calls[0][0];
    expect(event.detail.message).toBe('undefined');
  });

  it('should handle empty string message', () => {
    notify('');

    const event = dispatchEventSpy.mock.calls[0][0];
    expect(event.detail.message).toBe('');
  });

  it('should fallback to console.warn if dispatchEvent fails', () => {
    dispatchEventSpy.mockImplementation(() => {
      throw new Error('dispatchEvent failed');
    });

    const message = 'Test message';
    notify(message);

    expect(consoleWarnSpy).toHaveBeenCalledWith('NOTIFY:', message);
  });

  it('should fallback to console.warn if window.dispatchEvent is not a function', () => {
    const originalDispatchEvent = window.dispatchEvent;
    const originalConsoleWarn = console.warn;

    const warnCalls = [];
    console.warn = jest.fn((...args) => warnCalls.push(args));

    window.dispatchEvent = undefined;

    const message = 'No dispatchEvent';
    notify(message);

    expect(warnCalls.length).toBeGreaterThanOrEqual(1);
    if (warnCalls.length > 0) {
      expect(warnCalls[0]).toEqual(['NOTIFY:', message]);
    }

    window.dispatchEvent = originalDispatchEvent;
    console.warn = originalConsoleWarn;
  });

  it('should create CustomEvent with correct detail structure', () => {
    const message = 'Structure test';
    const duration = 5000;
    notify(message, duration);

    const event = dispatchEventSpy.mock.calls[0][0];
    expect(event).toBeInstanceOf(CustomEvent);
    expect(event.detail).toEqual({
      message,
      duration
    });
  });

  it('should handle very long messages', () => {
    const longMessage = 'a'.repeat(10000);
    notify(longMessage);

    const event = dispatchEventSpy.mock.calls[0][0];
    expect(event.detail.message).toBe(longMessage);
    expect(event.detail.message.length).toBe(10000);
  });

  it('should handle special characters in message', () => {
    const message = 'Test <script>alert("xss")</script> & special chars: 你好';
    notify(message);

    const event = dispatchEventSpy.mock.calls[0][0];
    expect(event.detail.message).toBe(message);
  });

  it('should handle zero duration', () => {
    notify('Zero duration', 0);

    const event = dispatchEventSpy.mock.calls[0][0];
    expect(event.detail.duration).toBe(0);
  });

  it('should handle negative duration', () => {
    notify('Negative duration', -1000);

    const event = dispatchEventSpy.mock.calls[0][0];
    expect(event.detail.duration).toBe(-1000);
  });

  it('should handle boolean message', () => {
    notify(true);

    const event = dispatchEventSpy.mock.calls[0][0];
    expect(event.detail.message).toBe('true');
  });

  it('should handle array message', () => {
    notify([1, 2, 3]);

    const event = dispatchEventSpy.mock.calls[0][0];
    expect(typeof event.detail.message).toBe('string');
    expect(event.detail.message).toContain('1');
  });

  it('should not throw errors when called multiple times', () => {
    expect(() => {
      notify('First');
      notify('Second');
      notify('Third');
    }).not.toThrow();

    expect(dispatchEventSpy).toHaveBeenCalledTimes(3);
  });

  it('should handle concurrent notifications', () => {
    notify('Notification 1', 1000);
    notify('Notification 2', 2000);
    notify('Notification 3', 3000);

    expect(dispatchEventSpy).toHaveBeenCalledTimes(3);

    const events = dispatchEventSpy.mock.calls.map(call => call[0]);
    expect(events[0].detail.message).toBe('Notification 1');
    expect(events[1].detail.message).toBe('Notification 2');
    expect(events[2].detail.message).toBe('Notification 3');
  });
});
