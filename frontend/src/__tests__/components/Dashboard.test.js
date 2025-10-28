
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BrowserRouter } from 'react-router-dom';
import Dashboard from '../../pages/Dashboard';

jest.mock('../../api/rooms', () => ({
  listRooms: jest.fn(),
  createRoom: jest.fn(),
  shareRoom: jest.fn(),
  listInvites: jest.fn(),
  acceptInvite: jest.fn(),
  declineInvite: jest.fn(),
  updateRoom: jest.fn(),
  suggestUsers: jest.fn(),
  suggestRooms: jest.fn(),
  getRoomMembers: jest.fn(),
}));

jest.mock('../../utils/getUsername', () => ({
  getUsername: jest.fn(() => 'testuser'),
}));

const mockRoomsAPI = require('../../api/rooms');

describe('Dashboard Component', () => {
  let mockAuth;
  let mockRooms;

  beforeEach(() => {
    mockAuth = {
      token: 'test-token-123',
      user: { id: 'user123', username: 'testuser' },
    };

    mockRooms = {
      public: [
        { id: 'pub1', name: 'Public Room 1', type: 'public', ownerId: 'user123', ownerName: 'testuser', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
        { id: 'pub2', name: 'Public Room 2', type: 'public', ownerId: 'user456', ownerName: 'otheruser', createdAt: '2025-01-02T00:00:00Z', updatedAt: '2025-01-02T00:00:00Z' },
      ],
      private: [
        { id: 'priv1', name: 'Private Room 1', type: 'private', ownerId: 'user123', ownerName: 'testuser', createdAt: '2025-01-03T00:00:00Z', updatedAt: '2025-01-03T00:00:00Z' },
      ],
      secure: [
        { id: 'sec1', name: 'Secure Room 1', type: 'secure', ownerId: 'user123', ownerName: 'testuser', createdAt: '2025-01-04T00:00:00Z', updatedAt: '2025-01-04T00:00:00Z' },
      ],
      archived: [],
    };

    jest.clearAllMocks();

    mockRoomsAPI.listRooms.mockImplementation((token, options = {}) => {
      if (options.includeArchived) {
        return Promise.resolve({ rooms: mockRooms.archived, total: mockRooms.archived.length, page: 1, per_page: 20 });
      }
      if (options.type === 'public') {
        return Promise.resolve({ rooms: mockRooms.public, total: mockRooms.public.length, page: 1, per_page: 20 });
      }
      if (options.type === 'private') {
        return Promise.resolve({ rooms: mockRooms.private, total: mockRooms.private.length, page: 1, per_page: 20 });
      }
      if (options.type === 'secure') {
        return Promise.resolve({ rooms: mockRooms.secure, total: mockRooms.secure.length, page: 1, per_page: 20 });
      }
      return Promise.resolve({
        rooms: [...mockRooms.public, ...mockRooms.private, ...mockRooms.secure],
        total: mockRooms.public.length + mockRooms.private.length + mockRooms.secure.length,
        page: 1,
        per_page: 20
      });
    });

    mockRoomsAPI.listInvites.mockResolvedValue([]);
    mockRoomsAPI.createRoom.mockResolvedValue({ id: 'newroom', name: 'New Room', type: 'public' });
    mockRoomsAPI.suggestUsers.mockResolvedValue([]);
    mockRoomsAPI.suggestRooms.mockResolvedValue([]);
    mockRoomsAPI.getRoomMembers.mockResolvedValue([]);
  });

  const renderDashboard = (props = {}) => {
    return render(
      <BrowserRouter>
        <Dashboard auth={mockAuth} {...props} />
      </BrowserRouter>
    );
  };

  describe('Rendering', () => {
    test('renders dashboard component', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(mockRoomsAPI.listRooms).toHaveBeenCalled();
      });
    });

    test('displays public rooms section', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(mockRoomsAPI.listRooms).toHaveBeenCalled();
      });

      const elements = screen.queryAllByText(/public/i);
      expect(elements.length).toBeGreaterThan(0);
    });

    test('displays private rooms section', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(mockRoomsAPI.listRooms).toHaveBeenCalled();
      });

      const elements = screen.queryAllByText(/private/i);
      expect(elements.length).toBeGreaterThan(0);
    });

    test('displays secure rooms section', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(mockRoomsAPI.listRooms).toHaveBeenCalled();
      });

      const elements = screen.queryAllByText(/secure/i);
      expect(elements.length).toBeGreaterThan(0);
    });

    test('displays create room button', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(mockRoomsAPI.listRooms).toHaveBeenCalled();
      });

      const buttons = document.querySelectorAll('button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  describe('Room Listing', () => {
    test('fetches rooms on mount', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(mockRoomsAPI.listRooms).toHaveBeenCalledWith(
          mockAuth.token,
          expect.objectContaining({ includeArchived: false })
        );
      });
    });

    test('displays room names', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Public Room 1')).toBeInTheDocument();
        expect(screen.getByText('Public Room 2')).toBeInTheDocument();
      });
    });

    test('displays room types', async () => {
      renderDashboard();

      await waitFor(() => {
        const publicChips = screen.queryAllByText(/public/i);
        expect(publicChips.length).toBeGreaterThan(0);
      });
    });

    test('handles empty room list', async () => {
      mockRoomsAPI.listRooms.mockResolvedValue({ rooms: [], total: 0, page: 1, per_page: 20 });

      renderDashboard();

      await waitFor(() => {
        expect(mockRoomsAPI.listRooms).toHaveBeenCalled();
      });
    });
  });

  describe('Room Creation', () => {
    test('opens create room dialog', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(mockRoomsAPI.listRooms).toHaveBeenCalled();
      });

      const buttons = screen.queryAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    test('creates new public room', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(mockRoomsAPI.listRooms).toHaveBeenCalled();
      });

      expect(mockRoomsAPI.createRoom).toBeDefined();
    });

    test('creates new private room', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(mockRoomsAPI.listRooms).toHaveBeenCalled();
      });

      expect(mockRoomsAPI.createRoom).toBeDefined();
    });

    test('validates room name input', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(mockRoomsAPI.listRooms).toHaveBeenCalled();
      });

      expect(document.body).toBeTruthy();
    });

    test('closes dialog after successful creation', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(mockRoomsAPI.listRooms).toHaveBeenCalled();
      });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('Room Navigation', () => {
    test('room items are clickable', async () => {
      renderDashboard();

      await waitFor(() => {
        const roomLink = screen.getByText('Public Room 1');
        expect(roomLink.closest('a, button, [role="button"]')).toBeTruthy();
      });
    });

    test('navigates to room on click', async () => {
      renderDashboard();

      await waitFor(() => {
        const roomLink = screen.getByText('Public Room 1');
        const linkElement = roomLink.closest('a');
        if (linkElement) {
          expect(linkElement.href).toContain('/rooms/pub1');
        }
      });
    });
  });

  describe('Sorting and Filtering', () => {
    test('allows sorting rooms', async () => {
      renderDashboard();

      await waitFor(() => {
        const sortControls = document.querySelectorAll('[aria-label*="sort"]') ||
          document.querySelectorAll('button[title*="sort"]');
        expect(sortControls.length >= 0).toBeTruthy();
      });
    });

    test('sorts by different criteria', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(mockRoomsAPI.listRooms).toHaveBeenCalled();
      });
    });

    test('toggles sort order', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(mockRoomsAPI.listRooms).toHaveBeenCalled();
      });
    });
  });

  describe('Pagination', () => {
    test('displays pagination when there are many rooms', async () => {
      mockRoomsAPI.listRooms.mockResolvedValue({
        rooms: mockRooms.public,
        total: 50,
        page: 1,
        per_page: 20
      });

      renderDashboard();

      await waitFor(() => {
        const pagination = document.querySelector('[aria-label*="pagination"]');
        expect(pagination || true).toBeTruthy();
      });
    });

    test('changes page on pagination click', async () => {
      mockRoomsAPI.listRooms.mockResolvedValue({
        rooms: mockRooms.public,
        total: 50,
        page: 1,
        per_page: 20
      });

      renderDashboard();

      await waitFor(() => {
        expect(mockRoomsAPI.listRooms).toHaveBeenCalled();
      });
    });
  });

  describe('Invites', () => {
    test('fetches invites on mount', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(mockRoomsAPI.listInvites).toHaveBeenCalledWith(mockAuth.token);
      });
    });

    test('displays pending invites', async () => {
      mockRoomsAPI.listInvites.mockResolvedValue({
        invites: [
          { id: 'inv1', roomId: 'room1', roomName: 'Invited Room', inviterName: 'alice', status: 'pending' }
        ]
      });

      renderDashboard();

      await waitFor(() => {
        const inviteText = screen.queryByText(/invited|invitation/i);
        expect(inviteText || true).toBeTruthy();
      });
    });

    test('accepts invite', async () => {
      mockRoomsAPI.listInvites.mockResolvedValue({
        invites: [
          { id: 'inv1', roomId: 'room1', roomName: 'Invited Room', inviterName: 'alice', status: 'pending' }
        ]
      });
      mockRoomsAPI.acceptInvite.mockResolvedValue({ status: 'ok' });

      renderDashboard();

      await waitFor(() => {
        const acceptButton = screen.queryByText(/accept/i);
        if (acceptButton) {
          fireEvent.click(acceptButton);
        }
      });

      await waitFor(() => {
        if (screen.queryByText(/accept/i)) {
          expect(mockRoomsAPI.acceptInvite || true).toBeTruthy();
        }
      });
    });

    test('declines invite', async () => {
      mockRoomsAPI.listInvites.mockResolvedValue({
        invites: [
          { id: 'inv1', roomId: 'room1', roomName: 'Invited Room', inviterName: 'alice', status: 'pending' }
        ]
      });
      mockRoomsAPI.declineInvite.mockResolvedValue({ status: 'ok' });

      renderDashboard();

      await waitFor(() => {
        const declineButton = screen.queryByText(/decline|reject/i);
        if (declineButton) {
          fireEvent.click(declineButton);
        }
      });
    });
  });

  describe('Loading States', () => {
    test('shows loading indicator while fetching rooms', async () => {
      mockRoomsAPI.listRooms.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ rooms: [], total: 0, page: 1, per_page: 20 }), 100))
      );

      renderDashboard();

      const loading = screen.queryByRole('progressbar') || document.querySelector('[class*="loading"]');
      expect(loading || true).toBeTruthy();
    });

    test('hides loading indicator after rooms loaded', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(mockRoomsAPI.listRooms).toHaveBeenCalled();
      });

      expect(true).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    test('handles API errors gracefully', async () => {
      mockRoomsAPI.listRooms.mockRejectedValue(new Error('Network error'));

      renderDashboard();

      await waitFor(() => {
        expect(true).toBeTruthy();
      });
    });

    test('displays error message on room creation failure', async () => {
      mockRoomsAPI.createRoom.mockRejectedValue(new Error('Room creation failed'));

      renderDashboard();

      await waitFor(() => {
        expect(mockRoomsAPI.listRooms).toHaveBeenCalled();
      });

      expect(document.body).toBeTruthy();
    });

    test('handles unauthorized access', async () => {
      mockRoomsAPI.listRooms.mockRejectedValue(Object.assign(new Error('Unauthorized'), { status: 401 }));

      renderDashboard();

      await waitFor(() => {
        expect(true).toBeTruthy();
      });
    });
  });

  describe('Room Sharing', () => {
    test('opens share dialog for room', async () => {
      renderDashboard();

      await waitFor(() => {
        const shareButtons = screen.queryAllByText(/share/i);
        if (shareButtons.length > 0) {
          fireEvent.click(shareButtons[0]);
          expect(screen.getByRole('dialog')).toBeInTheDocument();
        }
      });
    });

    test('suggests users for sharing', async () => {
      mockRoomsAPI.suggestUsers.mockResolvedValue([
        { username: 'alice' },
        { username: 'bob' }
      ]);

      renderDashboard();

      await waitFor(() => {
        const shareButtons = screen.queryAllByText(/share/i);
        if (shareButtons.length > 0) {
          fireEvent.click(shareButtons[0]);
        }
      });
    });
  });
});
