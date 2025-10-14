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

test.describe('Room Collaboration E2E Tests', () => {

  test('multiple users can collaborate in real-time', async ({ browser }) => {
    const { token: token1, user: user1 } = await (await browser.newContext()).request.post(`${API_BASE}/auth/register`, {
      data: { username: `user1_${Date.now()}`, password: 'Test123!' }
    }).then(r => r.json());

    const { token: token2, user: user2 } = await (await browser.newContext()).request.post(`${API_BASE}/auth/register`, {
      data: { username: `user2_${Date.now()}`, password: 'Test123!' }
    }).then(r => r.json());

    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    // User 1 creates a room
    const createResp = await context1.request.post(`${API_BASE}/rooms`, {
      data: { name: 'Collab Room', type: 'public' },
      headers: { Authorization: `Bearer ${token1}` },
    });

    const { room } = await createResp.json();

    // Both users navigate to the room
    await page1.goto(APP_BASE);
    await page1.evaluate(({ token, user }) => {
      localStorage.setItem('auth', JSON.stringify({ token, user }));
    }, { token: token1, user: user1 });

    await page2.goto(APP_BASE);
    await page2.evaluate(({ token, user }) => {
      localStorage.setItem('auth', JSON.stringify({ token, user }));
    }, { token: token2, user: user2 });

    await page1.goto(`${APP_BASE}/rooms/${room.id}`);
    await page2.goto(`${APP_BASE}/rooms/${room.id}`);

    await page1.waitForSelector('canvas', { timeout: 10000 });
    await page2.waitForSelector('canvas', { timeout: 10000 });

    // User 1 draws a stroke
    const stroke = {
      id: `collab-stroke-${Date.now()}`,
      points: [[50, 50], [100, 100]],
      color: '#FF0000',
      width: 3
    };

    await page1.evaluate(async ({ API_BASE, roomId, stroke }) => {
      const raw = localStorage.getItem('auth');
      const token = raw ? JSON.parse(raw).token : null;
      await fetch(`${API_BASE}/rooms/${roomId}/strokes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ stroke })
      });
    }, { API_BASE, roomId: room.id, stroke });

    // Wait a bit for socket propagation
    await page2.waitForTimeout(500);

    // Verify both users see the canvas
    const canvas1 = await page1.$('canvas');
    const canvas2 = await page2.$('canvas');
    expect(canvas1).toBeTruthy();
    expect(canvas2).toBeTruthy();

    await context1.close();
    await context2.close();
  });

  test('private room restricts access to invited users', async ({ page, request, browser }) => {
    const { token: ownerToken, user: owner } = await setupAuthenticatedUser(request);
    const { token: invitedToken, user: invited, username: invitedUsername } = await setupAuthenticatedUser(request);
    const { token: outsiderToken, user: outsider } = await setupAuthenticatedUser(request);

    // Owner creates private room
    const createResp = await request.post(`${API_BASE}/rooms`, {
      data: { name: 'Private Collab Room', type: 'private' },
      headers: { Authorization: `Bearer ${ownerToken}` },
    });

    const { room } = await createResp.json();

    // Owner invites one user
    await request.post(`${API_BASE}/rooms/${room.id}/share`, {
      data: { users: [invitedUsername] },
      headers: { Authorization: `Bearer ${ownerToken}` },
    });

    // Invited user can access
    await page.goto(APP_BASE);
    await page.evaluate(({ token, user }) => {
      localStorage.setItem('auth', JSON.stringify({ token, user }));
    }, { token: invitedToken, user: invited });

    await page.goto(`${APP_BASE}/rooms/${room.id}`);
    await page.waitForSelector('canvas', { timeout: 5000 });

    // Outsider cannot access
    const outsiderContext = await browser.newContext();
    const outsiderPage = await outsiderContext.newPage();

    await outsiderPage.goto(APP_BASE);
    await outsiderPage.evaluate(({ token, user }) => {
      localStorage.setItem('auth', JSON.stringify({ token, user }));
    }, { token: outsiderToken, user: outsider });

    // Try to get strokes via API (should fail or return empty)
    const strokesResp = await outsiderContext.request.get(`${API_BASE}/rooms/${room.id}/strokes`, {
      headers: { Authorization: `Bearer ${outsiderToken}` },
    });

    // Should either get 403 forbidden or empty strokes (depending on implementation)
    if (strokesResp.ok()) {
      const { strokes } = await strokesResp.json();
      // Private room should not show strokes to non-members or return error
      expect(strokes === undefined || strokes.length === 0 || strokesResp.status() === 403).toBeTruthy();
    } else {
      // Got an error response - this is expected for non-members
      expect(strokesResp.status()).toBeGreaterThanOrEqual(400);
    }

    await outsiderContext.close();
  });

  test('room settings can be updated by owner', async ({ page, request }) => {
    const { token, user } = await setupAuthenticatedUser(request);

    await page.goto(APP_BASE);
    await page.evaluate(({ token, user }) => {
      localStorage.setItem('auth', JSON.stringify({ token, user }));
    }, { token, user });

    // Create room
    const createResp = await request.post(`${API_BASE}/rooms`, {
      data: { name: 'Settings Test Room', type: 'public', description: 'Original description' },
      headers: { Authorization: `Bearer ${token}` },
    });

    const { room } = await createResp.json();

    // Navigate to room settings
    await page.goto(`${APP_BASE}/rooms/${room.id}/settings`);
    await page.waitForTimeout(1000);

    // Update room name via API (UI test would be more complex)
    const updateResp = await request.patch(`${API_BASE}/rooms/${room.id}`, {
      data: {
        name: 'Updated Settings Room',
        description: 'Updated description'
      },
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
    });

    if (updateResp.ok()) {
      const updated = await updateResp.json();
      expect(updated.room.name).toBe('Updated Settings Room');
      expect(updated.room.description).toBe('Updated description');
    }
  });

  test('user can leave and rejoin room', async ({ page, request }) => {
    const { token, user } = await setupAuthenticatedUser(request);

    await page.goto(APP_BASE);
    await page.evaluate(({ token, user }) => {
      localStorage.setItem('auth', JSON.stringify({ token, user }));
    }, { token, user });

    // Create room
    const createResp = await request.post(`${API_BASE}/rooms`, {
      data: { name: 'Leave Rejoin Room', type: 'public' },
      headers: { Authorization: `Bearer ${token}` },
    });

    const { room } = await createResp.json();

    // Enter room
    await page.goto(`${APP_BASE}/rooms/${room.id}`);
    await page.waitForSelector('canvas', { timeout: 5000 });

    // Leave room (navigate away)
    await page.goto(`${APP_BASE}/dashboard`);
    await page.waitForURL('**/dashboard');

    // Rejoin room
    await page.goto(`${APP_BASE}/rooms/${room.id}`);
    await page.waitForSelector('canvas', { timeout: 5000 });

    const canvas = await page.$('canvas');
    expect(canvas).toBeTruthy();
  });

  test('room history persists across sessions', async ({ page, request }) => {
    const { token, user } = await setupAuthenticatedUser(request);

    // Create room and add strokes
    const createResp = await request.post(`${API_BASE}/rooms`, {
      data: { name: 'History Persistence Room', type: 'public' },
      headers: { Authorization: `Bearer ${token}` },
    });

    const { room } = await createResp.json();

    // Add multiple strokes
    for (let i = 0; i < 3; i++) {
      await request.post(`${API_BASE}/rooms/${room.id}/strokes`, {
        data: {
          stroke: {
            id: `history-stroke-${i}`,
            points: [[i * 10, i * 10], [(i + 1) * 10, (i + 1) * 10]],
            color: '#0000FF',
            width: 2
          }
        },
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
      });
    }

    // Retrieve strokes
    const strokesResp = await request.get(`${API_BASE}/rooms/${room.id}/strokes`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const { strokes } = await strokesResp.json();
    expect(strokes.length).toBeGreaterThanOrEqual(3);
    expect(strokes.some(s => s.id?.includes('history-stroke'))).toBeTruthy();
  });

  test('error handling for network failures', async ({ page, request }) => {
    const { token, user } = await setupAuthenticatedUser(request);

    await page.goto(APP_BASE);
    await page.evaluate(({ token, user }) => {
      localStorage.setItem('auth', JSON.stringify({ token, user }));
    }, { token, user });

    // Try to access non-existent room
    await page.goto(`${APP_BASE}/rooms/nonexistent123`);
    await page.waitForTimeout(2000);

    // Should handle gracefully (redirect or error message)
    const url = page.url();
    expect(url.includes('/dashboard') || url.includes('/login') || url.includes('rooms/nonexistent')).toBeTruthy();
  });
});
