// Example comprehensive Canvas component test suite
// This file demonstrates best practices for frontend testing

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Canvas from '../../../src/components/Canvas';
import { BrowserRouter } from 'react-router-dom';

// Mock dependencies
jest.mock('../../../src/services/socket', () => ({
  connectSocket: jest.fn(),
  disconnectSocket: jest.fn(),
  emitDrawing: jest.fn(),
  onDrawingReceived: jest.fn(),
}));

jest.mock('../../../src/api/strokes', () => ({
  postStroke: jest.fn(),
  getStrokes: jest.fn(),
  clearCanvas: jest.fn(),
}));

const mockSocket = require('../../../src/services/socket');
const mockStrokesAPI = require('../../../src/api/strokes');

describe('Canvas Component', () => {
  let mockRoom;
  let mockUser;

  beforeEach(() => {
    mockRoom = {
      id: 'test-room-123',
      name: 'Test Room',
      type: 'public',
      ownerId: 'user-123',
    };

    mockUser = {
      id: 'user-123',
      username: 'testuser',
    };

    // Reset all mocks
    jest.clearAllMocks();

    // Setup default mock responses
    mockStrokesAPI.getStrokes.mockResolvedValue({
      status: 'ok',
      strokes: [],
    });

    mockStrokesAPI.postStroke.mockResolvedValue({
      status: 'ok',
    });
  });

  const renderCanvas = (props = {}) => {
    return render(
      <BrowserRouter>
        <Canvas
          room={mockRoom}
          user={mockUser}
          {...props}
        />
      </BrowserRouter>
    );
  };

  describe('Rendering', () => {
    test('renders canvas element', () => {
      renderCanvas();
      const canvas = screen.getByRole('img'); // Canvas has img role
      expect(canvas).toBeInTheDocument();
    });

    test('renders drawing tools', () => {
      renderCanvas();
      expect(screen.getByLabelText(/pencil/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/line/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/rectangle/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/circle/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/eraser/i)).toBeInTheDocument();
    });

    test('renders color picker', () => {
      renderCanvas();
      const colorPicker = screen.getByLabelText(/color/i);
      expect(colorPicker).toBeInTheDocument();
    });

    test('renders brush size control', () => {
      renderCanvas();
      const brushSizeControl = screen.getByLabelText(/brush size|line width/i);
      expect(brushSizeControl).toBeInTheDocument();
    });

    test('renders undo/redo buttons', () => {
      renderCanvas();
      expect(screen.getByLabelText(/undo/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/redo/i)).toBeInTheDocument();
    });

    test('renders clear canvas button', () => {
      renderCanvas();
      expect(screen.getByLabelText(/clear canvas/i)).toBeInTheDocument();
    });
  });

  describe('Tool Selection', () => {
    test('selects pencil tool', () => {
      renderCanvas();
      const pencilButton = screen.getByLabelText(/pencil/i);
      fireEvent.click(pencilButton);
      expect(pencilButton).toHaveClass('selected');
    });

    test('changes active tool', () => {
      renderCanvas();
      const lineButton = screen.getByLabelText(/line/i);
      const rectangleButton = screen.getByLabelText(/rectangle/i);

      fireEvent.click(lineButton);
      expect(lineButton).toHaveClass('selected');

      fireEvent.click(rectangleButton);
      expect(rectangleButton).toHaveClass('selected');
      expect(lineButton).not.toHaveClass('selected');
    });
  });

  describe('Drawing Operations', () => {
    test('creates stroke on mouse down and move', async () => {
      renderCanvas();
      const canvas = screen.getByRole('img');

      // Simulate drawing
      fireEvent.mouseDown(canvas, { clientX: 100, clientY: 100 });
      fireEvent.mouseMove(canvas, { clientX: 150, clientY: 150 });
      fireEvent.mouseUp(canvas);

      await waitFor(() => {
        expect(mockStrokesAPI.postStroke).toHaveBeenCalledWith(
          mockRoom.id,
          expect.objectContaining({
            pathData: expect.any(Array),
            color: expect.any(String),
            lineWidth: expect.any(Number),
          })
        );
      });
    });

    test('applies selected color to stroke', async () => {
      renderCanvas();
      const colorPicker = screen.getByLabelText(/color/i);
      const canvas = screen.getByRole('img');

      // Change color
      fireEvent.change(colorPicker, { target: { value: '#FF0000' } });

      // Draw
      fireEvent.mouseDown(canvas, { clientX: 100, clientY: 100 });
      fireEvent.mouseMove(canvas, { clientX: 150, clientY: 150 });
      fireEvent.mouseUp(canvas);

      await waitFor(() => {
        expect(mockStrokesAPI.postStroke).toHaveBeenCalledWith(
          mockRoom.id,
          expect.objectContaining({
            color: '#FF0000',
          })
        );
      });
    });

    test('applies selected brush size', async () => {
      renderCanvas();
      const brushSizeControl = screen.getByLabelText(/brush size/i);
      const canvas = screen.getByRole('img');

      // Change brush size
      fireEvent.change(brushSizeControl, { target: { value: '10' } });

      // Draw
      fireEvent.mouseDown(canvas, { clientX: 100, clientY: 100 });
      fireEvent.mouseMove(canvas, { clientX: 150, clientY: 150 });
      fireEvent.mouseUp(canvas);

      await waitFor(() => {
        expect(mockStrokesAPI.postStroke).toHaveBeenCalledWith(
          mockRoom.id,
          expect.objectContaining({
            lineWidth: 10,
          })
        );
      });
    });
  });

  describe('Undo/Redo Operations', () => {
    test('undo button is disabled when no strokes', () => {
      renderCanvas();
      const undoButton = screen.getByLabelText(/undo/i);
      expect(undoButton).toBeDisabled();
    });

    test('redo button is disabled when redo stack is empty', () => {
      renderCanvas();
      const redoButton = screen.getByLabelText(/redo/i);
      expect(redoButton).toBeDisabled();
    });

    test('enables undo after drawing', async () => {
      renderCanvas();
      const canvas = screen.getByRole('img');
      const undoButton = screen.getByLabelText(/undo/i);

      // Draw a stroke
      fireEvent.mouseDown(canvas, { clientX: 100, clientY: 100 });
      fireEvent.mouseMove(canvas, { clientX: 150, clientY: 150 });
      fireEvent.mouseUp(canvas);

      await waitFor(() => {
        expect(undoButton).not.toBeDisabled();
      });
    });

    test('calls undo API on undo button click', async () => {
      // TODO: Mock undo API
      renderCanvas();
      const undoButton = screen.getByLabelText(/undo/i);

      // Assuming undo is enabled
      fireEvent.click(undoButton);

      // Add assertion when undo API is implemented
    });
  });

  describe('Clear Canvas', () => {
    test('shows confirmation dialog on clear', () => {
      renderCanvas();
      const clearButton = screen.getByLabelText(/clear canvas/i);

      fireEvent.click(clearButton);

      expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
    });

    test('calls clear API on confirmation', async () => {
      mockStrokesAPI.clearCanvas.mockResolvedValue({ status: 'ok' });

      renderCanvas();
      const clearButton = screen.getByLabelText(/clear canvas/i);

      fireEvent.click(clearButton);

      const confirmButton = screen.getByText(/confirm|yes/i);
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockStrokesAPI.clearCanvas).toHaveBeenCalledWith(mockRoom.id);
      });
    });
  });

  describe('Socket Integration', () => {
    test('connects socket on mount', () => {
      renderCanvas();
      expect(mockSocket.connectSocket).toHaveBeenCalled();
    });

    test('disconnects socket on unmount', () => {
      const { unmount } = renderCanvas();
      unmount();
      expect(mockSocket.disconnectSocket).toHaveBeenCalled();
    });

    test('receives and renders remote strokes', async () => {
      const remoteStroke = {
        id: 'remote-stroke-1',
        drawingId: 'drawing-1',
        user: 'otheruser',
        color: '#00FF00',
        lineWidth: 3,
        pathData: [[50, 50], [100, 100]],
      };

      // Setup socket mock to call callback
      mockSocket.onDrawingReceived.mockImplementation((callback) => {
        callback(remoteStroke);
      });

      renderCanvas();

      // Verify that the stroke is rendered (would need to check canvas context)
      // This is a simplified test - actual implementation would verify canvas rendering
      await waitFor(() => {
        expect(mockSocket.onDrawingReceived).toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling', () => {
    test('handles API errors gracefully', async () => {
      mockStrokesAPI.postStroke.mockRejectedValue(new Error('Network error'));

      renderCanvas();
      const canvas = screen.getByRole('img');

      // Draw
      fireEvent.mouseDown(canvas, { clientX: 100, clientY: 100 });
      fireEvent.mouseMove(canvas, { clientX: 150, clientY: 150 });
      fireEvent.mouseUp(canvas);

      await waitFor(() => {
        expect(screen.getByText(/error|failed/i)).toBeInTheDocument();
      });
    });

    test('handles socket disconnection', async () => {
      // Mock socket disconnect
      mockSocket.connectSocket.mockImplementation(() => {
        throw new Error('Connection failed');
      });

      renderCanvas();

      await waitFor(() => {
        expect(screen.getByText(/connection lost|disconnected/i)).toBeInTheDocument();
      });
    });
  });

  describe('Loading States', () => {
    test('shows loading indicator while fetching initial strokes', () => {
      mockStrokesAPI.getStrokes.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      renderCanvas();

      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    test('hides loading indicator after strokes loaded', async () => {
      mockStrokesAPI.getStrokes.mockResolvedValue({
        status: 'ok',
        strokes: [],
      });

      renderCanvas();

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    test('canvas has proper ARIA labels', () => {
      renderCanvas();
      const canvas = screen.getByRole('img');
      expect(canvas).toHaveAttribute('aria-label', expect.stringMatching(/canvas|drawing/i));
    });

    test('all tools have accessible names', () => {
      renderCanvas();
      const tools = ['pencil', 'line', 'rectangle', 'circle', 'eraser'];

      tools.forEach((tool) => {
        expect(screen.getByLabelText(new RegExp(tool, 'i'))).toBeInTheDocument();
      });
    });

    test('keyboard navigation works for tools', () => {
      renderCanvas();
      const pencilButton = screen.getByLabelText(/pencil/i);

      pencilButton.focus();
      expect(document.activeElement).toBe(pencilButton);

      fireEvent.keyDown(pencilButton, { key: 'Enter' });
      expect(pencilButton).toHaveClass('selected');
    });
  });
});
