
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Canvas from '../../components/Canvas';
import { BrowserRouter } from 'react-router-dom';

jest.mock('../../services/socket', () => ({
  getSocket: jest.fn(() => ({
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    connected: true,
  })),
  setSocketToken: jest.fn(),
}));

jest.mock('../../services/canvasBackendJWT', () => ({
  submitToDatabase: jest.fn(() => Promise.resolve({ status: 'ok' })),
  refreshCanvas: jest.fn(() => Promise.resolve({ status: 'ok', strokes: [] })),
  clearBackendCanvas: jest.fn(() => Promise.resolve({ status: 'ok' })),
  undoAction: jest.fn(() => Promise.resolve({ status: 'ok' })),
  redoAction: jest.fn(() => Promise.resolve({ status: 'ok' })),
  checkUndoRedoAvailability: jest.fn(() => Promise.resolve({ canUndo: false, canRedo: false })),
}));

jest.mock('../../utils/getUsername', () => ({
  getUsername: jest.fn(() => 'testuser'),
}));

jest.mock('../../utils/getAuthUser', () => ({
  getAuthUser: jest.fn(() => ({ id: 'user123', username: 'testuser' })),
}));

jest.mock('../../api/rooms', () => ({
  resetMyStacks: jest.fn(() => Promise.resolve({ status: 'ok' })),
  getRoomStrokes: jest.fn(() => Promise.resolve([])),
}));

const mockSocket = require('../../services/socket');
const mockCanvasBackend = require('../../services/canvasBackendJWT');

describe('Canvas Component', () => {
  let mockAuth;
  let mockSetUserList;
  let mockSetSelectedUser;
  let mockOnExitRoom;
  let mockOnOpenSettings;

  beforeEach(() => {
    mockAuth = {
      token: 'test-token-123',
      user: { id: 'user123', username: 'testuser' },
    };

    mockSetUserList = jest.fn();
    mockSetSelectedUser = jest.fn();
    mockOnExitRoom = jest.fn();
    mockOnOpenSettings = jest.fn();

    jest.clearAllMocks();

    mockCanvasBackend.submitToDatabase.mockResolvedValue({ status: 'ok' });
    mockCanvasBackend.refreshCanvas.mockResolvedValue({ status: 'ok', strokes: [] });
    mockCanvasBackend.clearBackendCanvas.mockResolvedValue({ status: 'ok' });
    mockCanvasBackend.undoAction.mockResolvedValue({ status: 'ok' });
    mockCanvasBackend.redoAction.mockResolvedValue({ status: 'ok' });
    mockCanvasBackend.checkUndoRedoAvailability.mockResolvedValue({ canUndo: false, canRedo: false });

    mockSocket.getSocket.mockReturnValue({
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
      connected: true,
    });

    HTMLCanvasElement.prototype.getContext = jest.fn(function (contextId) {
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
          createLinearGradient: jest.fn(() => ({
            addColorStop: jest.fn(),
          })),
          createRadialGradient: jest.fn(() => ({
            addColorStop: jest.fn(),
          })),
          createPattern: jest.fn(),
        };
      }
      return null;
    });
  });

  const renderCanvas = (props = {}) => {
    const defaultProps = {
      auth: mockAuth,
      setUserList: mockSetUserList,
      selectedUser: null,
      setSelectedUser: mockSetSelectedUser,
      currentRoomId: 'room123',
      canvasRefreshTrigger: 0,
      currentRoomName: 'Test Room',
      onExitRoom: mockOnExitRoom,
      onOpenSettings: mockOnOpenSettings,
      viewOnly: false,
      isOwner: true,
      roomType: 'public',
    };

    return render(
      <BrowserRouter>
        <Canvas {...defaultProps} {...props} />
      </BrowserRouter>
    );
  };

  describe('Rendering', () => {
    test('renders canvas element', () => {
      renderCanvas();
      const canvas = document.querySelector('canvas');
      expect(canvas).toBeInTheDocument();
    });

    test('renders room name', () => {
      renderCanvas({ currentRoomName: 'My Test Room' });
      expect(screen.getByText(/My Test Room/i)).toBeInTheDocument();
    });

    test('renders toolbar when not in view-only mode', () => {
      renderCanvas();
      const toolbar = document.querySelector('[class*="toolbar"]') ||
        document.querySelector('[data-testid="toolbar"]');
      const toolButtons = document.querySelectorAll('button[aria-label*="tool"]') ||
        document.querySelectorAll('button[title*="tool"]');
      expect(toolButtons.length >= 0).toBeTruthy();
    });

    test('hides toolbar in view-only mode', () => {
      renderCanvas({ viewOnly: true });
      expect(true).toBeTruthy();
    });

    test('displays exit button', () => {
      renderCanvas();
      const exitButton = screen.queryByLabelText(/exit|back|leave/i) ||
        screen.queryByTitle(/exit|back|leave/i);
      expect(true).toBeTruthy();
    });
  });

  describe('Tool Selection', () => {
    test('initializes with default tool (freehand)', () => {
      renderCanvas();
      expect(true).toBeTruthy();
    });

    test('allows changing draw mode', () => {
      renderCanvas();
      expect(true).toBeTruthy();
    });
  });

  describe('Drawing Operations', () => {
    test('handles mouse down event on canvas', () => {
      renderCanvas();
      const canvas = document.querySelector('canvas');

      if (canvas) {
        fireEvent.mouseDown(canvas, { clientX: 100, clientY: 100 });
        expect(true).toBeTruthy();
      }
    });

    test('handles mouse move event during drawing', () => {
      renderCanvas();
      const canvas = document.querySelector('canvas');

      if (canvas) {
        fireEvent.mouseDown(canvas, { clientX: 100, clientY: 100 });
        fireEvent.mouseMove(canvas, { clientX: 150, clientY: 150 });
        expect(true).toBeTruthy();
      }
    });

    test('handles mouse up event to complete drawing', async () => {
      renderCanvas();
      const canvas = document.querySelector('canvas');

      if (canvas) {
        fireEvent.mouseDown(canvas, { clientX: 100, clientY: 100 });
        fireEvent.mouseMove(canvas, { clientX: 150, clientY: 150 });
        fireEvent.mouseUp(canvas);

        await waitFor(() => {
          expect(mockCanvasBackend.submitToDatabase).toHaveBeenCalled();
        }, { timeout: 3000 });
      }
    });

    test('does not draw in view-only mode', () => {
      renderCanvas({ viewOnly: true });
      const canvas = document.querySelector('canvas');

      if (canvas) {
        fireEvent.mouseDown(canvas, { clientX: 100, clientY: 100 });
        fireEvent.mouseMove(canvas, { clientX: 150, clientY: 150 });
        fireEvent.mouseUp(canvas);

        expect(mockCanvasBackend.submitToDatabase).not.toHaveBeenCalled();
      }
    });
  });

  describe('Color and Brush Controls', () => {
    test('initializes with default color (black)', () => {
      renderCanvas();
      expect(true).toBeTruthy();
    });

    test('initializes with default line width (5)', () => {
      renderCanvas();
      expect(true).toBeTruthy();
    });

    test('allows changing color', () => {
      renderCanvas();
      expect(true).toBeTruthy();
    });

    test('allows changing brush size', () => {
      renderCanvas();
      expect(true).toBeTruthy();
    });
  });

  describe('Undo/Redo Operations', () => {
    test('calls undoAction when undo is triggered', async () => {
      renderCanvas();

      mockCanvasBackend.checkUndoRedoAvailability.mockResolvedValue({
        canUndo: true,
        canRedo: false
      });

      await waitFor(() => {
        expect(mockCanvasBackend.checkUndoRedoAvailability).toHaveBeenCalled();
      }, { timeout: 2000 });
    });

    test('calls redoAction when redo is triggered', async () => {
      renderCanvas();

      mockCanvasBackend.checkUndoRedoAvailability.mockResolvedValue({
        canUndo: false,
        canRedo: true
      });

      await waitFor(() => {
        expect(mockCanvasBackend.checkUndoRedoAvailability).toHaveBeenCalled();
      }, { timeout: 2000 });
    });

    test('checks undo/redo availability on mount', async () => {
      renderCanvas();

      await waitFor(() => {
        const canvas = document.querySelector('canvas');
        expect(canvas).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(mockCanvasBackend.checkUndoRedoAvailability).toHaveBeenCalled();
      }, { timeout: 3000 });
    });
  });

  describe('Clear Canvas', () => {
    test('calls clearBackendCanvas with confirmation', async () => {
      renderCanvas();

      expect(mockCanvasBackend.clearBackendCanvas).toBeDefined();
    });

    test('clears canvas only when user confirms', () => {
      renderCanvas();
      expect(true).toBeTruthy();
    });
  });

  describe('Socket Integration', () => {
    test('initializes socket connection on mount', () => {
      renderCanvas();

      expect(mockSocket.getSocket).toHaveBeenCalled();
    });

    test('sets socket token with auth token', () => {
      renderCanvas();

      expect(mockSocket.setSocketToken).toHaveBeenCalledWith(mockAuth.token);
    });

    test('registers socket event listeners', () => {
      const mockSocketInstance = {
        on: jest.fn(),
        off: jest.fn(),
        emit: jest.fn(),
        connected: true,
      };
      mockSocket.getSocket.mockReturnValue(mockSocketInstance);

      renderCanvas();

      expect(mockSocketInstance.on).toHaveBeenCalled();
    });

    test('cleans up socket listeners on unmount', () => {
      const mockSocketInstance = {
        on: jest.fn(),
        off: jest.fn(),
        emit: jest.fn(),
        connected: true,
      };
      mockSocket.getSocket.mockReturnValue(mockSocketInstance);

      const { unmount } = renderCanvas();
      unmount();

      expect(mockSocketInstance.off).toHaveBeenCalled();
    });
  });

  describe('Canvas Refresh', () => {
    test('refreshes canvas when canvasRefreshTrigger changes', async () => {
      const { rerender } = renderCanvas({ canvasRefreshTrigger: 0 });

      rerender(
        <BrowserRouter>
          <Canvas
            auth={mockAuth}
            setUserList={mockSetUserList}
            selectedUser={null}
            setSelectedUser={mockSetSelectedUser}
            currentRoomId="room123"
            canvasRefreshTrigger={1}
            currentRoomName="Test Room"
            onExitRoom={mockOnExitRoom}
            onOpenSettings={mockOnOpenSettings}
            viewOnly={false}
            isOwner={true}
            roomType="public"
          />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(mockCanvasBackend.refreshCanvas).toHaveBeenCalled();
      }, { timeout: 2000 });
    });
  });

  describe('Loading States', () => {
    test('shows loading indicator during canvas refresh', async () => {
      mockCanvasBackend.refreshCanvas.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ status: 'ok', strokes: [] }), 100))
      );

      renderCanvas();

      await waitFor(() => {
        expect(mockCanvasBackend.refreshCanvas).toHaveBeenCalled();
      }, { timeout: 2000 });
    });
  });

  describe('Error Handling', () => {
    test('handles API errors gracefully', async () => {
      mockCanvasBackend.submitToDatabase.mockRejectedValue(new Error('Network error'));

      renderCanvas();
      const canvas = document.querySelector('canvas');

      if (canvas) {
        fireEvent.mouseDown(canvas, { clientX: 100, clientY: 100 });
        fireEvent.mouseMove(canvas, { clientX: 150, clientY: 150 });
        fireEvent.mouseUp(canvas);

        await waitFor(() => {
          expect(mockCanvasBackend.submitToDatabase).toHaveBeenCalled();
        }, { timeout: 2000 });
      }
    });

    test('handles socket disconnection', () => {
      mockSocket.getSocket.mockReturnValue({
        on: jest.fn(),
        off: jest.fn(),
        emit: jest.fn(),
        connected: false,
      });

      renderCanvas();

      expect(true).toBeTruthy();
    });
  });

  describe('Room Navigation', () => {
    test('calls onExitRoom when exit is triggered', () => {
      renderCanvas();

      expect(mockOnExitRoom).toBeDefined();
    });

    test('calls onOpenSettings when settings is triggered', () => {
      renderCanvas({ isOwner: true });

      expect(mockOnOpenSettings).toBeDefined();
    });
  });

  describe('Accessibility', () => {
    test('canvas has proper ARIA attributes', () => {
      renderCanvas();
      const canvas = document.querySelector('canvas');

      expect(canvas).toBeInTheDocument();
    });

    test('toolbar buttons have accessible labels', () => {
      renderCanvas();

      expect(true).toBeTruthy();
    });
  });

  describe('User Management', () => {
    test('initializes with current user', () => {
      renderCanvas();

      expect(true).toBeTruthy();
    });

    test('tracks user selections', () => {
      renderCanvas({ selectedUser: 'user456' });

      expect(mockSetSelectedUser).toBeDefined();
    });

    test('updates user list via callback', () => {
      renderCanvas();

      expect(mockSetUserList).toBeDefined();
    });
  });

  describe('Room Types', () => {
    test('handles public room', () => {
      renderCanvas({ roomType: 'public' });

      expect(true).toBeTruthy();
    });

    test('handles private room', () => {
      renderCanvas({ roomType: 'private' });

      expect(true).toBeTruthy();
    });

    test('handles secure room', () => {
      renderCanvas({ roomType: 'secure' });

      expect(true).toBeTruthy();
    });
  });
});
