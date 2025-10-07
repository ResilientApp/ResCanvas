// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Test environment canvas polyfill: some components call canvas.getContext('2d')
// during mount; in Jest's jsdom getContext throws "Not implemented". To avoid
// calling jsdom's unimplemented function (which logs errors to the virtual
// console), provide a minimal mock implementation unconditionally in tests.
// This stays test-only and does not affect production code.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = function (type) {
    if (type !== '2d') return null;

    // Minimal 2D context mock used only by tests
    return {
      clearRect: () => { },
      getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: () => { },
      toDataURL: () => '',
      drawImage: () => { },
      fillRect: () => { },
      stroke: () => { },
      beginPath: () => { },
      moveTo: () => { },
      lineTo: () => { },
      arc: () => { },
      fill: () => { },
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 1,
      translate: () => { },
      scale: () => { },
      measureText: () => ({ width: 0 }),
    };
  };
}
