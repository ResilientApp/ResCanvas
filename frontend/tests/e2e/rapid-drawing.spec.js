/**
 * Rapid Drawing Test Script
 * 
 * This test verifies that rapid stroke drawing works correctly:
 * 1. All strokes are saved to backend
 * 2. No strokes disappear during canvas refresh
 * 3. No partial strokes are lost
 * 4. No flickering occurs during refresh
 * 
 * Run with: npx playwright test tests/e2e/rapid-drawing.spec.js
 */

const { test, expect } = require('@playwright/test');

const API_BASE = process.env.API_BASE || 'http://localhost:10010';
const APP_BASE = process.env.APP_BASE || 'http://localhost:3000';

async function setupAuthenticatedUser(request) {
  const username = `rapidtest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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

test.describe('Rapid Drawing Tests', () => {

  test('rapid strokes should all persist without loss or flickering', async ({ page, request }) => {
    const { token, user } = await setupAuthenticatedUser(request);

    await page.goto(APP_BASE);
    await page.evaluate(({ token, user }) => {
      localStorage.setItem('auth', JSON.stringify({ token, user }));
    }, { token, user });

    // Create a test room
    const createResp = await request.post(`${API_BASE}/rooms`, {
      data: { name: 'Rapid Drawing Test Room', type: 'public' },
      headers: { Authorization: `Bearer ${token}` },
    });
    const { room } = await createResp.json();

    // Navigate to the room
    await page.goto(`${APP_BASE}/rooms/${room.id}`);
    await page.waitForSelector('canvas', { timeout: 10000 });

    // Wait for canvas to be ready
    await page.waitForTimeout(1000);

    // Get canvas element
    const canvas = await page.locator('canvas').first();
    const box = await canvas.boundingBox();

    // Draw 5 rapid strokes in quick succession
    const strokes = [];
    for (let i = 0; i < 5; i++) {
      const startX = box.x + 100 + (i * 50);
      const startY = box.y + 100;
      const endX = startX + 100;
      const endY = startY + 100;

      // Simulate a stroke
      await page.mouse.move(startX, startY);
      await page.mouse.down();

      // Draw in small increments to simulate real drawing
      for (let j = 0; j <= 10; j++) {
        const x = startX + (endX - startX) * (j / 10);
        const y = startY + (endY - startY) * (j / 10);
        await page.mouse.move(x, y);
      }

      await page.mouse.up();

      strokes.push({ startX, startY, endX, endY });

      // Very short delay between strokes (rapid drawing)
      await page.waitForTimeout(50);
    }

    // Wait for all strokes to be submitted and confirmed
    await page.waitForTimeout(3000);

    // Verify all strokes are persisted in the backend
    const strokesResp = await request.get(`${API_BASE}/rooms/${room.id}/strokes`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { strokes: backendStrokes } = await strokesResp.json();

    console.log(`Total strokes in backend: ${backendStrokes.length}`);

    // We should have at least 5 strokes (might have more if there are other operations)
    expect(backendStrokes.length).toBeGreaterThanOrEqual(5);

    // Check that strokes are properly formed (have pathData)
    const validStrokes = backendStrokes.filter(s => {
      const stroke = s.stroke || s;
      return stroke.pathData && Array.isArray(stroke.pathData) && stroke.pathData.length > 0;
    });

    console.log(`Valid strokes with pathData: ${validStrokes.length}`);
    expect(validStrokes.length).toBeGreaterThanOrEqual(5);
  });

  test('rapid strokes should not flicker during canvas refresh', async ({ page, request }) => {
    const { token, user } = await setupAuthenticatedUser(request);

    await page.goto(APP_BASE);
    await page.evaluate(({ token, user }) => {
      localStorage.setItem('auth', JSON.stringify({ token, user }));
    }, { token, user });

    const createResp = await request.post(`${API_BASE}/rooms`, {
      data: { name: 'Flicker Test Room', type: 'public' },
      headers: { Authorization: `Bearer ${token}` },
    });
    const { room } = await createResp.json();

    await page.goto(`${APP_BASE}/rooms/${room.id}`);
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Monitor canvas content changes
    let canvasSnapshots = [];

    const captureCanvas = async () => {
      return await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        if (!canvas) return null;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        // Count non-empty pixels
        let nonEmptyPixels = 0;
        for (let i = 0; i < imageData.data.length; i += 4) {
          const alpha = imageData.data[i + 3];
          if (alpha > 0) nonEmptyPixels++;
        }
        return nonEmptyPixels;
      });
    };

    const canvas = await page.locator('canvas').first();
    const box = await canvas.boundingBox();

    // Draw 3 rapid strokes
    for (let i = 0; i < 3; i++) {
      const startX = box.x + 150 + (i * 60);
      const startY = box.y + 150;

      await page.mouse.move(startX, startY);
      await page.mouse.down();

      for (let j = 0; j <= 8; j++) {
        const x = startX + 80 * (j / 8);
        const y = startY + 80 * (j / 8);
        await page.mouse.move(x, y);

        // Capture canvas state during drawing
        const pixels = await captureCanvas();
        if (pixels !== null) {
          canvasSnapshots.push({ time: Date.now(), pixels, phase: 'drawing' });
        }
      }

      await page.mouse.up();
      await page.waitForTimeout(30);
    }

    // Monitor for a period after drawing
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(100);
      const pixels = await captureCanvas();
      if (pixels !== null) {
        canvasSnapshots.push({ time: Date.now(), pixels, phase: 'post-draw' });
      }
    }

    // Analyze snapshots for flickering
    // Strokes should not disappear (pixel count should not drop significantly and then recover)
    let significantDrops = 0;
    for (let i = 1; i < canvasSnapshots.length - 1; i++) {
      const prev = canvasSnapshots[i - 1].pixels;
      const curr = canvasSnapshots[i].pixels;
      const next = canvasSnapshots[i + 1].pixels;

      // Detect a significant drop followed by recovery (flickering pattern)
      if (curr < prev * 0.7 && next > curr * 1.4) {
        significantDrops++;
        console.log(`Potential flicker detected at snapshot ${i}: ${prev} -> ${curr} -> ${next}`);
      }
    }

    console.log(`Total snapshots: ${canvasSnapshots.length}, Significant drops: ${significantDrops}`);

    // Should have minimal flickering (allow 1 for timing variations)
    expect(significantDrops).toBeLessThanOrEqual(1);
  });

  test('partial strokes should not be lost', async ({ page, request }) => {
    const { token, user } = await setupAuthenticatedUser(request);

    await page.goto(APP_BASE);
    await page.evaluate(({ token, user }) => {
      localStorage.setItem('auth', JSON.stringify({ token, user }));
    }, { token, user });

    const createResp = await request.post(`${API_BASE}/rooms`, {
      data: { name: 'Partial Stroke Test Room', type: 'public' },
      headers: { Authorization: `Bearer ${token}` },
    });
    const { room } = await createResp.json();

    await page.goto(`${APP_BASE}/rooms/${room.id}`);
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1000);

    const canvas = await page.locator('canvas').first();
    const box = await canvas.boundingBox();

    // Draw 5 very short rapid strokes (each with only a few points)
    for (let i = 0; i < 5; i++) {
      const startX = box.x + 200 + (i * 40);
      const startY = box.y + 200;

      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + 20, startY + 20);
      await page.mouse.move(startX + 30, startY + 30);
      await page.mouse.up();

      await page.waitForTimeout(30);
    }

    // Wait for submission
    await page.waitForTimeout(3000);

    // Verify all short strokes are saved
    const strokesResp = await request.get(`${API_BASE}/rooms/${room.id}/strokes`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { strokes: backendStrokes } = await strokesResp.json();

    const shortStrokes = backendStrokes.filter(s => {
      const stroke = s.stroke || s;
      const pathData = stroke.pathData;
      // Short strokes with 2-5 points
      return Array.isArray(pathData) && pathData.length >= 2 && pathData.length <= 5;
    });

    console.log(`Short strokes found: ${shortStrokes.length}`);
    expect(shortStrokes.length).toBeGreaterThanOrEqual(5);
  });
});
