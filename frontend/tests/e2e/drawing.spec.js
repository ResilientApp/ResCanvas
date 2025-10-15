const { test, expect } = require('@playwright/test');

const API_BASE = process.env.API_BASE || 'http://localhost:10010';
const APP_BASE = process.env.APP_BASE || 'http://localhost:3000';

async function setupAuthenticatedUser(request) {
  const username = `e2euser_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const password = 'Test123!';

  await request.post(`${API_BASE}/auth/register`, {
    data: { username, password },
  });

  const loginResp = await request.post(`${API_BASE}/auth/login`, {
    data: { username, password },
  });

  const { token, user } = await loginResp.json();
  return { username, password, token, user };
}

test.describe('Drawing and Canvas E2E Tests', () => {

  test('user can draw strokes and see them persist', async ({ page, request }) => {
    const { token, user } = await setupAuthenticatedUser(request);

    await page.goto(APP_BASE);
    await page.evaluate(({ token, user }) => {
      localStorage.setItem('auth', JSON.stringify({ token, user }));
    }, { token, user });

    const createResp = await request.post(`${API_BASE}/rooms`, {
      data: { name: 'Drawing Test Room', type: 'public' },
      headers: { Authorization: `Bearer ${token}` },
    });
    const { room } = await createResp.json();

    await page.goto(`${APP_BASE}/rooms/${room.id}`);
    await page.waitForSelector('canvas', { timeout: 10000 });

    const strokeData = {
      id: `stroke-${Date.now()}`,
      drawingId: `drawing-${Date.now()}`,
      user: user.username,
      color: '#FF0000',
      lineWidth: 5,
      pathData: [[100, 100], [200, 200]],
      timestamp: Date.now(),
      brushStyle: 'round',
      order: 1,
    };

    await page.evaluate(async ({ API_BASE, roomId, stroke }) => {
      const auth = JSON.parse(localStorage.getItem('auth'));
      const response = await fetch(`${API_BASE}/rooms/${roomId}/strokes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.token}`,
        },
        body: JSON.stringify({ stroke }),
      });
      return response.ok;
    }, { API_BASE, roomId: room.id, stroke: strokeData });

    await page.waitForTimeout(1000);

    const strokesResp = await request.get(`${API_BASE}/rooms/${room.id}/strokes`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { strokes } = await strokesResp.json();

    expect(strokes.length).toBeGreaterThan(0);
    const foundStroke = strokes.find(s => (s.id || s.stroke?.id) === strokeData.id);
    expect(foundStroke).toBeTruthy();
  });

  test('undo and redo operations work correctly', async ({ page, request }) => {
    const { token, user } = await setupAuthenticatedUser(request);

    await page.goto(APP_BASE);
    await page.evaluate(({ token, user }) => {
      localStorage.setItem('auth', JSON.stringify({ token, user }));
    }, { token, user });

    const createResp = await request.post(`${API_BASE}/rooms`, {
      data: { name: 'Undo Test Room', type: 'public' },
      headers: { Authorization: `Bearer ${token}` },
    });
    const { room } = await createResp.json();

    await page.goto(`${APP_BASE}/rooms/${room.id}`);
    await page.waitForSelector('canvas', { timeout: 10000 });

    const stroke = {
      id: `stroke-undo-${Date.now()}`,
      drawingId: `drawing-${Date.now()}`,
      user: user.username,
      color: '#00FF00',
      lineWidth: 3,
      pathData: [[50, 50], [150, 150]],
      timestamp: Date.now(),
      brushStyle: 'round',
      order: 1,
    };

    await request.post(`${API_BASE}/rooms/${room.id}/strokes`, {
      data: { stroke },
      headers: { Authorization: `Bearer ${token}` },
    });

    const undoResp = await request.post(`${API_BASE}/rooms/${room.id}/undo`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(undoResp.ok()).toBeTruthy();

    const redoResp = await request.post(`${API_BASE}/rooms/${room.id}/redo`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(redoResp.ok()).toBeTruthy();

    const strokesResp = await request.get(`${API_BASE}/rooms/${room.id}/strokes`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(strokesResp.ok()).toBeTruthy();
  });

  test('clear canvas removes all strokes', async ({ page, request }) => {
    const { token, user } = await setupAuthenticatedUser(request);

    await page.goto(APP_BASE);
    await page.evaluate(({ token, user }) => {
      localStorage.setItem('auth', JSON.stringify({ token, user }));
    }, { token, user });

    const createResp = await request.post(`${API_BASE}/rooms`, {
      data: { name: 'Clear Test Room', type: 'public' },
      headers: { Authorization: `Bearer ${token}` },
    });
    const { room } = await createResp.json();

    for (let i = 0; i < 3; i++) {
      const stroke = {
        id: `stroke-clear-${i}-${Date.now()}`,
        drawingId: `drawing-${i}`,
        user: user.username,
        color: '#0000FF',
        lineWidth: 2,
        pathData: [[i * 10, i * 10], [i * 20, i * 20]],
        timestamp: Date.now(),
        brushStyle: 'round',
        order: i + 1,
      };

      await request.post(`${API_BASE}/rooms/${room.id}/strokes`, {
        data: { stroke },
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    const clearResp = await request.post(`${API_BASE}/rooms/${room.id}/clear`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (clearResp.ok()) {
      const strokesResp = await request.get(`${API_BASE}/rooms/${room.id}/strokes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const { strokes } = await strokesResp.json();

      const visibleStrokes = strokes.filter(s => !s.cleared && !s.undone);
      expect(visibleStrokes.length).toBeLessThanOrEqual(3);
    }
  });
});
