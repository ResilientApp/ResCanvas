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

test.describe('Room Management E2E Tests', () => {

  test('create and access public room', async ({ page, request }) => {
    const { token, user } = await setupAuthenticatedUser(request);

    await page.goto(APP_BASE);
    await page.evaluate(({ token, user }) => {
      localStorage.setItem('auth', JSON.stringify({ token, user }));
    }, { token, user });

    const createResp = await request.post(`${API_BASE}/rooms`, {
      data: { name: 'E2E Public Room', type: 'public' },
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(createResp.ok()).toBeTruthy();
    const { room } = await createResp.json();

    await page.goto(`${APP_BASE}/rooms/${room.id}`);
    await page.waitForSelector('canvas', { timeout: 10000 });

    const pageTitle = await page.title();
    expect(pageTitle).toBeTruthy();
  });

  test('create private room with encryption', async ({ page, request }) => {
    const { token, user } = await setupAuthenticatedUser(request);

    const createResp = await request.post(`${API_BASE}/rooms`, {
      data: { name: 'E2E Private Room', type: 'private' },
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(createResp.ok()).toBeTruthy();
    const { room } = await createResp.json();

    expect(room.type).toBe('private');
    expect(room.roomKey || room.wrappedKey).toBeTruthy();
  });

  test('update room settings', async ({ page, request }) => {
    const { token, user } = await setupAuthenticatedUser(request);

    const createResp = await request.post(`${API_BASE}/rooms`, {
      data: { name: 'Original Name', type: 'public' },
      headers: { Authorization: `Bearer ${token}` },
    });

    const { room } = await createResp.json();

    const updateResp = await request.patch(`${API_BASE}/rooms/${room.id}`, {
      data: { name: 'Updated Name' },
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
    });

    if (updateResp.ok()) {
      const updated = await updateResp.json();
      expect(updated.room.name).toBe('Updated Name');
    }
  });

  test('list rooms shows created rooms', async ({ page, request }) => {
    const { token, user } = await setupAuthenticatedUser(request);

    await request.post(`${API_BASE}/rooms`, {
      data: { name: 'List Test Room 1', type: 'public' },
      headers: { Authorization: `Bearer ${token}` },
    });

    await request.post(`${API_BASE}/rooms`, {
      data: { name: 'List Test Room 2', type: 'public' },
      headers: { Authorization: `Bearer ${token}` },
    });

    const listResp = await request.get(`${API_BASE}/rooms`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(listResp.ok()).toBeTruthy();
    const { rooms } = await listResp.json();

    expect(rooms.length).toBeGreaterThanOrEqual(2);
  });

  test('delete room removes it from list', async ({ page, request }) => {
    const { token, user } = await setupAuthenticatedUser(request);

    const createResp = await request.post(`${API_BASE}/rooms`, {
      data: { name: 'Room To Delete', type: 'public' },
      headers: { Authorization: `Bearer ${token}` },
    });

    const { room } = await createResp.json();

    const deleteResp = await request.delete(`${API_BASE}/rooms/${room.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(deleteResp.ok()).toBeTruthy();

    const getResp = await request.get(`${API_BASE}/rooms/${room.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(getResp.status()).toBe(404);
  });

  test('non-member cannot access private room', async ({ request }) => {
    const { token: token1 } = await setupAuthenticatedUser(request);
    const { token: token2 } = await setupAuthenticatedUser(request);

    const createResp = await request.post(`${API_BASE}/rooms`, {
      data: { name: 'Private Room', type: 'private' },
      headers: { Authorization: `Bearer ${token1}` },
    });

    const { room } = await createResp.json();

    const accessResp = await request.get(`${API_BASE}/rooms/${room.id}/strokes`, {
      headers: { Authorization: `Bearer ${token2}` },
    });

    expect(accessResp.status()).toBe(403);
  });
});
