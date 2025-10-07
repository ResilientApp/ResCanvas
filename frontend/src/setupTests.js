// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Test environment canvas polyfill: some components call canvas.getContext('2d')
// during mount; in Jest's jsdom this can be null. Provide a minimal mock
// to prevent TypeError during tests. This is a safe, test-only shim and
// does not affect production code.
if (typeof HTMLCanvasElement !== 'undefined' && !HTMLCanvasElement.prototype.getContext) {
	HTMLCanvasElement.prototype.getContext = function () {
		return {
			clearRect: () => {},
			getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
			putImageData: () => {},
			toDataURL: () => '',
			drawImage: () => {},
			fillRect: () => {},
			stroke: () => {},
			beginPath: () => {},
			moveTo: () => {},
			lineTo: () => {},
			arc: () => {},
			fill: () => {},
			strokeStyle: '',
			fillStyle: '',
			lineWidth: 1,
			translate: () => {},
			scale: () => {},
		};
	};
}
