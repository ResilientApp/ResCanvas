/**
 * Flicker Prevention Test for Undo/Redo and Multi-User Drawing
 * 
 * This test verifies that:
 * 1. Undo/redo operations don't cause strokes to flicker
 * 2. Multi-user drawing doesn't cause flickering during refresh
 * 3. Canvas updates are smooth and seamless
 * 
 * Run with: npx playwright test tests/e2e/no-flicker.spec.js
 */

const { test, expect } = require('@playwright/test');

const API_BASE = process.env.API_BASE || 'http://localhost:10010';
const APP_BASE = process.env.APP_BASE || 'http://localhost:3000';

async function setupAuthenticatedUser(request) {
  const username = `noflicker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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

async function captureCanvasPixels(page) {
  return await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let nonEmptyPixels = 0;
    for (let i = 0; i < imageData.data.length; i += 4) {
      const alpha = imageData.data[i + 3];
      if (alpha > 0) nonEmptyPixels++;
    }
    return nonEmptyPixels;
  });
}

test.describe('No Flicker Tests', () => {

  test('undo operation should not cause visible flickering', async ({ page, request }) => {
    const { token, user } = await setupAuthenticatedUser(request);

    await page.goto(APP_BASE);
    await page.evaluate(({ token, user }) => {
      localStorage.setItem('auth', JSON.stringify({ token, user }));
    }, { token, user });

    const createResp = await request.post(`${API_BASE}/rooms`, {
      data: { name: 'Undo Flicker Test', type: 'public' },
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
      await page.mouse.move(box.x + 150 + (i * 60), box.y + 150);
      await page.mouse.down();
      for (let j = 0; j <= 5; j++) {
        await page.mouse.move(box.x + 150 + (i * 60) + j * 15, box.y + 150 + j * 15);
      }
      await page.mouse.up();
      await page.waitForTimeout(100);
    }

    // Wait for all strokes to be submitted and confirmed
    await page.waitForTimeout(3000);

    // Capture baseline pixels
    const baselinePixels = await captureCanvasPixels(page);
    console.log(`Baseline pixels: ${baselinePixels}`);
    expect(baselinePixels).toBeGreaterThan(0);

    // Monitor canvas during undo operation
    const pixelSnapshots = [];

    // Start monitoring
    const monitoringPromise = (async () => {
      for (let i = 0; i < 15; i++) {
        const pixels = await captureCanvasPixels(page);
        if (pixels !== null) {
          pixelSnapshots.push({ time: Date.now(), pixels, phase: i < 5 ? 'before-undo' : 'during-undo' });
        }
        await page.waitForTimeout(100);
      }
    })();

    // Trigger undo after a short delay
    await page.waitForTimeout(500);

    // Find and click undo button
    try {
      // Try various selectors for undo button
      const undoSelectors = [
        '[aria-label*="undo" i]',
        '[data-testid*="undo" i]',
        'button:has-text("Undo")',
        '[title*="undo" i]'
      ];

      let undoClicked = false;
      for (const selector of undoSelectors) {
        const button = page.locator(selector).first();
        if (await button.count() > 0 && await button.isVisible()) {
          await button.click();
          undoClicked = true;
          console.log(`Undo button clicked using selector: ${selector}`);
          break;
        }
      }

      if (!undoClicked) {
        // Fallback: use keyboard shortcut
        await page.keyboard.press('Control+Z');
        console.log('Undo triggered via keyboard shortcut');
      }
    } catch (e) {
      console.log('Using keyboard shortcut for undo:', e.message);
      await page.keyboard.press('Control+Z');
    }

    await monitoringPromise;

    // Analyze for flickering
    let flickerEvents = 0;
    for (let i = 1; i < pixelSnapshots.length - 1; i++) {
      const prev = pixelSnapshots[i - 1].pixels;
      const curr = pixelSnapshots[i].pixels;
      const next = pixelSnapshots[i + 1].pixels;

      // Detect significant drop and recovery (flicker pattern)
      if (curr < prev * 0.5 && next > curr * 1.8) {
        flickerEvents++;
        console.log(`Flicker detected at snapshot ${i}: ${prev} -> ${curr} -> ${next}`);
      }
    }

    console.log(`Total snapshots: ${pixelSnapshots.length}, Flicker events: ${flickerEvents}`);

    // Should have zero flickering
    expect(flickerEvents).toBe(0);
  });

  test('redo operation should not cause visible flickering', async ({ page, request }) => {
    const { token, user } = await setupAuthenticatedUser(request);

    await page.goto(APP_BASE);
    await page.evaluate(({ token, user }) => {
      localStorage.setItem('auth', JSON.stringify({ token, user }));
    }, { token, user });

    const createResp = await request.post(`${API_BASE}/rooms`, {
      data: { name: 'Redo Flicker Test', type: 'public' },
      headers: { Authorization: `Bearer ${token}` },
    });
    const { room } = await createResp.json();

    await page.goto(`${APP_BASE}/rooms/${room.id}`);
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1000);

    const canvas = await page.locator('canvas').first();
    const box = await canvas.boundingBox();

    // Draw 2 strokes
    for (let i = 0; i < 2; i++) {
      await page.mouse.move(box.x + 180 + (i * 70), box.y + 180);
      await page.mouse.down();
      await page.mouse.move(box.x + 230 + (i * 70), box.y + 230);
      await page.mouse.up();
      await page.waitForTimeout(150);
    }

    await page.waitForTimeout(3000);

    // Undo first
    await page.keyboard.press('Control+Z');
    await page.waitForTimeout(1500);

    // Monitor during redo
    const pixelSnapshots = [];

    const monitoringPromise = (async () => {
      for (let i = 0; i < 15; i++) {
        const pixels = await captureCanvasPixels(page);
        if (pixels !== null) {
          pixelSnapshots.push({ time: Date.now(), pixels });
        }
        await page.waitForTimeout(100);
      }
    })();

    await page.waitForTimeout(500);
    await page.keyboard.press('Control+Y');

    await monitoringPromise;

    // Analyze for flickering
    let flickerEvents = 0;
    for (let i = 1; i < pixelSnapshots.length - 1; i++) {
      const prev = pixelSnapshots[i - 1].pixels;
      const curr = pixelSnapshots[i].pixels;
      const next = pixelSnapshots[i + 1].pixels;

      if (curr < prev * 0.5 && next > curr * 1.8) {
        flickerEvents++;
        console.log(`Flicker detected at snapshot ${i}: ${prev} -> ${curr} -> ${next}`);
      }
    }

    console.log(`Redo test - Total snapshots: ${pixelSnapshots.length}, Flicker events: ${flickerEvents}`);
    expect(flickerEvents).toBe(0);
  });

  test('remote user strokes should not cause flickering', async ({ browser, request }) => {
    // Setup two users
    const user1 = await setupAuthenticatedUser(request);
    const user2 = await setupAuthenticatedUser(request);

    // Create room as user1
    const createResp = await request.post(`${API_BASE}/rooms`, {
      data: { name: 'Multi-User Flicker Test', type: 'public' },
      headers: { Authorization: `Bearer ${user1.token}` },
    });
    const { room } = await createResp.json();

    // Open two browser contexts
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();

    const context2 = await browser.newContext();
    const page2 = await context2.newPage();

    // Login both users
    await page1.goto(APP_BASE);
    await page1.evaluate(({ token, user }) => {
      localStorage.setItem('auth', JSON.stringify({ token, user }));
    }, user1);
    await page1.goto(`${APP_BASE}/rooms/${room.id}`);
    await page1.waitForSelector('canvas', { timeout: 10000 });

    await page2.goto(APP_BASE);
    await page2.evaluate(({ token, user }) => {
      localStorage.setItem('auth', JSON.stringify({ token, user }));
    }, user2);
    await page2.goto(`${APP_BASE}/rooms/${room.id}`);
    await page2.waitForSelector('canvas', { timeout: 10000 });

    await page1.waitForTimeout(1500);
    await page2.waitForTimeout(1500);

    // User 1 monitors for flicker
    const pixelSnapshots = [];

    const monitoringPromise = (async () => {
      for (let i = 0; i < 25; i++) {
        const pixels = await captureCanvasPixels(page1);
        if (pixels !== null) {
          pixelSnapshots.push({ time: Date.now(), pixels });
        }
        await page1.waitForTimeout(100);
      }
    })();

    // User 2 draws strokes while user 1 monitors
    await page2.waitForTimeout(500);

    const canvas2 = await page2.locator('canvas').first();
    const box2 = await canvas2.boundingBox();

    for (let i = 0; i < 4; i++) {
      await page2.mouse.move(box2.x + 200 + (i * 50), box2.y + 200);
      await page2.mouse.down();
      await page2.mouse.move(box2.x + 240 + (i * 50), box2.y + 240);
      await page2.mouse.up();
      await page2.waitForTimeout(200);
    }

    await monitoringPromise;

    // Analyze for flickering on user 1's canvas
    let flickerEvents = 0;
    for (let i = 1; i < pixelSnapshots.length - 1; i++) {
      const prev = pixelSnapshots[i - 1].pixels;
      const curr = pixelSnapshots[i].pixels;
      const next = pixelSnapshots[i + 1].pixels;

      // Flicker: significant drop followed by recovery
      if (curr < prev * 0.6 && next > curr * 1.5) {
        flickerEvents++;
        console.log(`Multi-user flicker at snapshot ${i}: ${prev} -> ${curr} -> ${next}`);
      }
    }

    console.log(`Multi-user test - Snapshots: ${pixelSnapshots.length}, Flicker events: ${flickerEvents}`);

    await context1.close();
    await context2.close();

    // Should have minimal to no flickering
    expect(flickerEvents).toBeLessThanOrEqual(1);
  });
});
