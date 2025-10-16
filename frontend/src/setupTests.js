// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Mock HTMLCanvasElement for Canvas tests
// This must be set up before any canvas elements are created
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  writable: true,
  configurable: true,
  value: jest.fn(function(contextId) {
    if (contextId === '2d') {
      return {
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        lineCap: 'round',
        lineJoin: 'round',
        globalAlpha: 1,
        globalCompositeOperation: 'source-over',
        imageSmoothingEnabled: true,
        fillRect: jest.fn(),
        clearRect: jest.fn(),
        getImageData: jest.fn(() => ({
          data: new Uint8ClampedArray(4),
          width: 1,
          height: 1,
        })),
        putImageData: jest.fn(),
        createImageData: jest.fn(() => ({
          data: new Uint8ClampedArray(4),
          width: 1,
          height: 1,
        })),
        setTransform: jest.fn(),
        resetTransform: jest.fn(),
        drawImage: jest.fn(),
        save: jest.fn(),
        restore: jest.fn(),
        beginPath: jest.fn(),
        moveTo: jest.fn(),
        lineTo: jest.fn(),
        closePath: jest.fn(),
        stroke: jest.fn(),
        fill: jest.fn(),
        arc: jest.fn(),
        rect: jest.fn(),
        translate: jest.fn(),
        scale: jest.fn(),
        rotate: jest.fn(),
        measureText: jest.fn(() => ({ width: 0 })),
        fillText: jest.fn(),
        strokeText: jest.fn(),
        clip: jest.fn(),
        quadraticCurveTo: jest.fn(),
        bezierCurveTo: jest.fn(),
        arcTo: jest.fn(),
        ellipse: jest.fn(),
        isPointInPath: jest.fn(() => false),
        isPointInStroke: jest.fn(() => false),
        createLinearGradient: jest.fn(() => ({
          addColorStop: jest.fn(),
        })),
        createRadialGradient: jest.fn(() => ({
          addColorStop: jest.fn(),
        })),
        createPattern: jest.fn(),
        canvas: this,
      };
    }
    return null;
  }),
});
