import { setupServer } from 'msw/node';
import { rest } from 'msw';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:10010';

export const handlers = [
  rest.post(`${API_BASE}/auth/register`, (req, res, ctx) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res(
        ctx.status(400),
        ctx.json({ error: 'Username and password required' })
      );
    }

    return res(
      ctx.status(201),
      ctx.json({
        user: {
          _id: '507f1f77bcf86cd799439011',
          username,
          createdAt: new Date().toISOString(),
        },
      })
    );
  }),

  rest.post(`${API_BASE}/auth/login`, (req, res, ctx) => {
    const { username, password } = req.body;

    if (username === 'testuser' && password === 'Test123!') {
      return res(
        ctx.status(200),
        ctx.json({
          token: 'mock-jwt-token',
          user: {
            _id: '507f1f77bcf86cd799439011',
            username: 'testuser',
          },
        })
      );
    }

    return res(
      ctx.status(401),
      ctx.json({ error: 'Invalid credentials' })
    );
  }),

  rest.get(`${API_BASE}/auth/me`, (req, res, ctx) => {
    const authHeader = req.headers.get('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res(
        ctx.status(401),
        ctx.json({ error: 'Unauthorized' })
      );
    }

    return res(
      ctx.status(200),
      ctx.json({
        _id: '507f1f77bcf86cd799439011',
        username: 'testuser',
        createdAt: new Date().toISOString(),
      })
    );
  }),

  rest.post(`${API_BASE}/auth/logout`, (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({ message: 'Logged out successfully' })
    );
  }),

  rest.get(`${API_BASE}/rooms`, (req, res, ctx) => {
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      return res(
        ctx.status(401),
        ctx.json({ error: 'Unauthorized' })
      );
    }

    return res(
      ctx.status(200),
      ctx.json({
        rooms: [
          {
            id: 'room-1',
            name: 'Test Room 1',
            type: 'public',
            createdBy: '507f1f77bcf86cd799439011',
          },
          {
            id: 'room-2',
            name: 'Test Room 2',
            type: 'private',
            createdBy: '507f1f77bcf86cd799439011',
          },
        ],
      })
    );
  }),

  rest.post(`${API_BASE}/rooms`, (req, res, ctx) => {
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      return res(
        ctx.status(401),
        ctx.json({ error: 'Unauthorized' })
      );
    }

    const { name, type } = req.body;

    return res(
      ctx.status(201),
      ctx.json({
        room: {
          id: `room-${Date.now()}`,
          name,
          type: type || 'public',
          createdBy: '507f1f77bcf86cd799439011',
          createdAt: new Date().toISOString(),
          members: ['507f1f77bcf86cd799439011'],
        },
      })
    );
  }),

  rest.get(`${API_BASE}/rooms/:roomId`, (req, res, ctx) => {
    const { roomId } = req.params;
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      return res(
        ctx.status(401),
        ctx.json({ error: 'Unauthorized' })
      );
    }

    return res(
      ctx.status(200),
      ctx.json({
        id: roomId,
        name: 'Test Room',
        type: 'public',
        createdBy: '507f1f77bcf86cd799439011',
        members: ['507f1f77bcf86cd799439011'],
      })
    );
  }),

  rest.get(`${API_BASE}/rooms/:roomId/strokes`, (req, res, ctx) => {
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      return res(
        ctx.status(401),
        ctx.json({ error: 'Unauthorized' })
      );
    }

    return res(
      ctx.status(200),
      ctx.json({
        strokes: [
          {
            id: 'stroke-1',
            drawingId: 'drawing-1',
            user: 'testuser',
            color: '#FF0000',
            lineWidth: 5,
            pathData: [[10, 20], [30, 40]],
            timestamp: Date.now(),
            brushStyle: 'round',
            order: 1,
          },
        ],
      })
    );
  }),

  rest.post(`${API_BASE}/rooms/:roomId/strokes`, (req, res, ctx) => {
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      return res(
        ctx.status(401),
        ctx.json({ error: 'Unauthorized' })
      );
    }

    return res(
      ctx.status(201),
      ctx.json({
        status: 'success',
        stroke: req.body.stroke,
      })
    );
  }),

  rest.post(`${API_BASE}/rooms/:roomId/undo`, (req, res, ctx) => {
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      return res(
        ctx.status(401),
        ctx.json({ error: 'Unauthorized' })
      );
    }

    return res(
      ctx.status(200),
      ctx.json({ success: true })
    );
  }),

  rest.post(`${API_BASE}/rooms/:roomId/redo`, (req, res, ctx) => {
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      return res(
        ctx.status(401),
        ctx.json({ error: 'Unauthorized' })
      );
    }

    return res(
      ctx.status(200),
      ctx.json({ success: true })
    );
  }),
];

export const server = setupServer(...handlers);
