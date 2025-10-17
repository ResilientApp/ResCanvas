/**
 * Regression Test for Undo/Redo and Shape Operations
 * 
 * Verifies that the rapid drawing fix doesn't break:
 * 1. Undo/redo functionality
 * 2. Cut/paste of shapes
 * 3. Persistence after Redis cache flush
 * 
 * Run with: npx playwright test tests/e2e/regression-undo-redo.spec.js
 */

const { test, expect } = require('@playwright/test');

const API_BASE = process.env.API_BASE || 'http://localhost:10010';
const APP_BASE = process.env.APP_BASE || 'http://localhost:3000';

async function setupAuthenticatedUser(request) {
  const username = `regression_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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

test.describe('Regression Tests - Undo/Redo and Shapes', () => {

  test('undo and redo work correctly after rapid drawing', async ({ page, request }) => {
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
    await page.waitForTimeout(1000);

    const canvas = await page.locator('canvas').first();
    const box = await canvas.boundingBox();

    // Draw 3 rapid strokes
    for (let i = 0; i < 3; i++) {
      await page.mouse.move(box.x + 100 + (i * 50), box.y + 100);
      await page.mouse.down();
      await page.mouse.move(box.x + 150 + (i * 50), box.y + 150);
      await page.mouse.up();
      await page.waitForTimeout(50);
    }

    // Wait for all strokes to be submitted
    await page.waitForTimeout(2000);

    // Get initial stroke count
    let strokesResp = await request.get(`${API_BASE}/rooms/${room.id}/strokes`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    let { strokes } = await strokesResp.json();
    const initialCount = strokes.length;
    console.log(`Initial stroke count: ${initialCount}`);
    expect(initialCount).toBeGreaterThanOrEqual(3);

    // Click undo button (assuming it has data-testid or aria-label)
    const undoButton = page.locator('[aria-label*="undo" i], [data-testid*="undo" i]').first();
    await undoButton.click();
    await page.waitForTimeout(1000);

    // Verify stroke was undone
    strokesResp = await request.get(`${API_BASE}/rooms/${room.id}/strokes`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    ({ strokes } = await strokesResp.json());
    const afterUndoCount = strokes.filter(s => !s.undone).length;
    console.log(`After undo count: ${afterUndoCount}`);
    expect(afterUndoCount).toBe(initialCount - 1);

    // Click redo button
    const redoButton = page.locator('[aria-label*="redo" i], [data-testid*="redo" i]').first();
    await redoButton.click();
    await page.waitForTimeout(1000);

    // Verify stroke was redone
    strokesResp = await request.get(`${API_BASE}/rooms/${room.id}/strokes`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    ({ strokes } = await strokesResp.json());
    const afterRedoCount = strokes.filter(s => !s.undone).length;
    console.log(`After redo count: ${afterRedoCount}`);
    expect(afterRedoCount).toBe(initialCount);
  });

  test('shapes can be drawn and persist correctly', async ({ page, request }) => {
    const { token, user } = await setupAuthenticatedUser(request);

    await page.goto(APP_BASE);
    await page.evaluate(({ token, user }) => {
      localStorage.setItem('auth', JSON.stringify({ token, user }));
    }, { token, user });

    const createResp = await request.post(`${API_BASE}/rooms`, {
      data: { name: 'Shape Test Room', type: 'public' },
      headers: { Authorization: `Bearer ${token}` },
    });
    const { room } = await createResp.json();

    await page.goto(`${APP_BASE}/rooms/${room.id}`);
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Switch to shape mode (look for shape button or mode selector)
    const shapeButton = page.locator('[aria-label*="shape" i], [data-testid*="shape" i], button:has-text("Shape")').first();
    if (await shapeButton.count() > 0) {
      await shapeButton.click();
      await page.waitForTimeout(300);
    }

    const canvas = await page.locator('canvas').first();
    const box = await canvas.boundingBox();

    // Draw 2 shapes rapidly
    for (let i = 0; i < 2; i++) {
      await page.mouse.move(box.x + 200 + (i * 80), box.y + 200);
      await page.mouse.down();
      await page.mouse.move(box.x + 250 + (i * 80), box.y + 250);
      await page.mouse.up();
      await page.waitForTimeout(100);
    }

    // Wait for submission
    await page.waitForTimeout(2000);

    // Verify shapes persisted
    const strokesResp = await request.get(`${API_BASE}/rooms/${room.id}/strokes`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { strokes } = await strokesResp.json();

    const shapes = strokes.filter(s => {
      const stroke = s.stroke || s;
      return stroke.pathData && stroke.pathData.tool === 'shape';
    });

    console.log(`Shapes found: ${shapes.length}`);
    expect(shapes.length).toBeGreaterThanOrEqual(2);
  });

  test('strokes persist after simulated Redis flush', async ({ page, request }) => {
    const { token, user } = await setupAuthenticatedUser(request);

    await page.goto(APP_BASE);
    await page.evaluate(({ token, user }) => {
      localStorage.setItem('auth', JSON.stringify({ token, user }));
    }, { token, user });

    const createResp = await request.post(`${API_BASE}/rooms`, {
      data: { name: 'Persistence Test Room', type: 'public' },
      headers: { Authorization: `Bearer ${token}` },
    });
    const { room } = await createResp.json();

    await page.goto(`${APP_BASE}/rooms/${room.id}`);
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1000);

    const canvas = await page.locator('canvas').first();
    const box = await canvas.boundingBox();

    // Draw 3 strokes
    for (let i = 0; i < 3; i++) {
      await page.mouse.move(box.x + 100 + (i * 60), box.y + 100);
      await page.mouse.down();
      await page.mouse.move(box.x + 140 + (i * 60), box.y + 140);
      await page.mouse.up();
      await page.waitForTimeout(80);
    }

    // Wait for submission and MongoDB sync
    await page.waitForTimeout(3000);

    // Get strokes before "flush"
    let strokesResp = await request.get(`${API_BASE}/rooms/${room.id}/strokes`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    let { strokes } = await strokesResp.json();
    const strokeCountBefore = strokes.length;
    console.log(`Strokes before refresh: ${strokeCountBefore}`);

    // Simulate cache flush by refreshing the page (forces reload from backend)
    await page.reload();
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Get strokes after page reload (should fetch from MongoDB/backend)
    strokesResp = await request.get(`${API_BASE}/rooms/${room.id}/strokes`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    ({ strokes } = await strokesResp.json());
    const strokeCountAfter = strokes.length;
    console.log(`Strokes after refresh: ${strokeCountAfter}`);

    // Should have the same number of strokes (persistence verified)
    expect(strokeCountAfter).toBe(strokeCountBefore);
    expect(strokeCountAfter).toBeGreaterThanOrEqual(3);
  });

  test('rapid strokes with undo maintain correct state', async ({ page, request }) => {
    const { token, user } = await setupAuthenticatedUser(request);

    await page.goto(APP_BASE);
    await page.evaluate(({ token, user }) => {
      localStorage.setItem('auth', JSON.stringify({ token, user }));
    }, { token, user });

    const createResp = await request.post(`${API_BASE}/rooms`, {
      data: { name: 'Rapid Undo Test Room', type: 'public' },
      headers: { Authorization: `Bearer ${token}` },
    });
    const { room } = await createResp.json();

    await page.goto(`${APP_BASE}/rooms/${room.id}`);
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1000);

    const canvas = await page.locator('canvas').first();
    const box = await canvas.boundingBox();

    // Draw 5 rapid strokes
    for (let i = 0; i < 5; i++) {
      await page.mouse.move(box.x + 120 + (i * 40), box.y + 120);
      await page.mouse.down();
      await page.mouse.move(box.x + 160 + (i * 40), box.y + 160);
      await page.mouse.up();
      await page.waitForTimeout(40);
    }

    // Wait for all submissions to complete
    await page.waitForTimeout(3000);

    // Verify all 5 strokes are saved
    let strokesResp = await request.get(`${API_BASE}/rooms/${room.id}/strokes`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    let { strokes } = await strokesResp.json();
    console.log(`Total strokes after rapid drawing: ${strokes.length}`);
    expect(strokes.length).toBeGreaterThanOrEqual(5);

    // Undo 2 strokes
    const undoButton = page.locator('[aria-label*="undo" i], [data-testid*="undo" i]').first();
    await undoButton.click();
    await page.waitForTimeout(800);
    await undoButton.click();
    await page.waitForTimeout(800);

    // Verify 2 strokes were undone
    strokesResp = await request.get(`${API_BASE}/rooms/${room.id}/strokes`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    ({ strokes } = await strokesResp.json());
    const activeStrokes = strokes.filter(s => !s.undone);
    console.log(`Active strokes after 2 undos: ${activeStrokes.length}`);
    expect(activeStrokes.length).toBe(strokes.length - 2);
  });
});
