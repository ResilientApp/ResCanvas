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

  test('post-undo multi-user drawing should not cause flicker ping-pong', async ({ browser, request }) => {
    // This test addresses the specific reported issue:
    // After User1 performs undo/redo, when User1 draws a stroke, User2 sees it flicker
    // Then when User2 draws, User1 sees that stroke flicker, creating a ping-pong effect

    // Setup two users
    const user1 = await setupAuthenticatedUser(request);
    const user2 = await setupAuthenticatedUser(request);

    // Create room as User1
    const createResp = await request.post(`${API_BASE}/rooms`, {
      data: { name: 'Post-Undo Flicker Test', type: 'public' },
      headers: { Authorization: `Bearer ${user1.token}` },
    });
    const { room } = await createResp.json();

    // Setup User1 page
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    await page1.goto(APP_BASE);
    await page1.evaluate(({ token, user }) => {
      localStorage.setItem('auth', JSON.stringify({ token, user }));
    }, { token: user1.token, user: user1.user });
    await page1.goto(`${APP_BASE}/rooms/${room.id}`);
    await page1.waitForSelector('canvas', { timeout: 10000 });
    await page1.waitForTimeout(1000);

    // Setup User2 page
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await page2.goto(APP_BASE);
    await page2.evaluate(({ token, user }) => {
      localStorage.setItem('auth', JSON.stringify({ token, user }));
    }, { token: user2.token, user: user2.user });
    await page2.goto(`${APP_BASE}/rooms/${room.id}`);
    await page2.waitForSelector('canvas', { timeout: 10000 });
    await page2.waitForTimeout(1000);

    const canvas1 = await page1.locator('canvas').first();
    const canvas2 = await page2.locator('canvas').first();
    const box1 = await canvas1.boundingBox();
    const box2 = await canvas2.boundingBox();

    // Step 1: User1 draws 2 initial strokes
    console.log('Step 1: User1 draws 2 strokes');
    for (let i = 0; i < 2; i++) {
      await page1.mouse.move(box1.x + 100 + (i * 50), box1.y + 100);
      await page1.mouse.down();
      for (let j = 0; j <= 3; j++) {
        await page1.mouse.move(box1.x + 100 + (i * 50) + j * 10, box1.y + 100 + j * 10);
      }
      await page1.mouse.up();
      await page1.waitForTimeout(200);
    }
    await page1.waitForTimeout(2000); // Wait for backend persistence

    // Verify both users see the strokes
    const user1PixelsAfterDraw = await captureCanvasPixels(page1);
    const user2PixelsAfterDraw = await captureCanvasPixels(page2);
    console.log(`After initial draw - User1 pixels: ${user1PixelsAfterDraw}, User2 pixels: ${user2PixelsAfterDraw}`);
    expect(user1PixelsAfterDraw).toBeGreaterThan(0);
    expect(user2PixelsAfterDraw).toBeGreaterThan(0);

    // Step 2: User1 performs undo
    console.log('Step 2: User1 performs undo');
    await page1.click('button[aria-label="Undo"], button:has-text("Undo")').catch(() => {
      return page1.keyboard.press('Control+Z');
    });
    await page1.waitForTimeout(1500); // Wait for undo to propagate

    // Step 3: User1 draws a new stroke (this is where flickering was reported)
    console.log('Step 3: User1 draws new stroke after undo - monitoring User2 for flicker');

    // Start monitoring User2's canvas for flicker
    const user2Snapshots = [];
    const monitoringPromise = (async () => {
      for (let i = 0; i < 20; i++) {
        const pixels = await captureCanvasPixels(page2);
        if (pixels !== null) {
          user2Snapshots.push({ time: Date.now(), pixels, phase: 'user1-draws-post-undo' });
        }
        await page2.waitForTimeout(100);
      }
    })();

    // User1 draws
    await page1.mouse.move(box1.x + 250, box1.y + 150);
    await page1.mouse.down();
    for (let j = 0; j <= 5; j++) {
      await page1.mouse.move(box1.x + 250 + j * 12, box1.y + 150 + j * 12);
    }
    await page1.mouse.up();

    await monitoringPromise;
    await page1.waitForTimeout(1000);

    // Analyze User2's snapshots for flicker
    let user2FlickerEvents = 0;
    for (let i = 1; i < user2Snapshots.length; i++) {
      const prev = user2Snapshots[i - 1].pixels;
      const curr = user2Snapshots[i].pixels;
      const dropPercent = prev > 0 ? ((prev - curr) / prev) * 100 : 0;

      if (dropPercent > 50) { // Significant drop
        const next = user2Snapshots[i + 1]?.pixels || curr;
        const recoverPercent = curr > 0 ? ((next - curr) / curr) * 100 : 0;
        if (recoverPercent > 30) { // Recovery detected = flicker
          user2FlickerEvents++;
          console.log(`User2 FLICKER at snapshot ${i}: ${prev} -> ${curr} -> ${next} (drop ${dropPercent.toFixed(1)}%, recover ${recoverPercent.toFixed(1)}%)`);
        }
      }
    }

    console.log(`User2 flicker events during User1's post-undo draw: ${user2FlickerEvents}`);

    // Step 4: User2 draws a stroke (this is where User1 was seeing flicker)
    console.log('Step 4: User2 draws stroke - monitoring User1 for flicker');

    // Start monitoring User1's canvas for flicker
    const user1Snapshots = [];
    const monitoring2Promise = (async () => {
      for (let i = 0; i < 20; i++) {
        const pixels = await captureCanvasPixels(page1);
        if (pixels !== null) {
          user1Snapshots.push({ time: Date.now(), pixels, phase: 'user2-draws' });
        }
        await page1.waitForTimeout(100);
      }
    })();

    // User2 draws
    await page2.mouse.move(box2.x + 350, box2.y + 200);
    await page2.mouse.down();
    for (let j = 0; j <= 5; j++) {
      await page2.mouse.move(box2.x + 350 + j * 12, box2.y + 200 + j * 12);
    }
    await page2.mouse.up();

    await monitoring2Promise;
    await page1.waitForTimeout(1000);

    // Analyze User1's snapshots for flicker
    let user1FlickerEvents = 0;
    for (let i = 1; i < user1Snapshots.length; i++) {
      const prev = user1Snapshots[i - 1].pixels;
      const curr = user1Snapshots[i].pixels;
      const dropPercent = prev > 0 ? ((prev - curr) / prev) * 100 : 0;

      if (dropPercent > 50) {
        const next = user1Snapshots[i + 1]?.pixels || curr;
        const recoverPercent = curr > 0 ? ((next - curr) / curr) * 100 : 0;
        if (recoverPercent > 30) {
          user1FlickerEvents++;
          console.log(`User1 FLICKER at snapshot ${i}: ${prev} -> ${curr} -> ${next} (drop ${dropPercent.toFixed(1)}%, recover ${recoverPercent.toFixed(1)}%)`);
        }
      }
    }

    console.log(`User1 flicker events during User2's draw: ${user1FlickerEvents}`);

    // Verify final state
    const user1FinalPixels = await captureCanvasPixels(page1);
    const user2FinalPixels = await captureCanvasPixels(page2);
    console.log(`Final state - User1 pixels: ${user1FinalPixels}, User2 pixels: ${user2FinalPixels}`);

    // Both users should have content
    expect(user1FinalPixels).toBeGreaterThan(0);
    expect(user2FinalPixels).toBeGreaterThan(0);

    // NO flickering should occur in either direction
    console.log(`\n=== FLICKER SUMMARY ===`);
    console.log(`User2 flicker (when User1 drew post-undo): ${user2FlickerEvents}`);
    console.log(`User1 flicker (when User2 drew): ${user1FlickerEvents}`);
    console.log(`Total flicker events: ${user2FlickerEvents + user1FlickerEvents}`);

    expect(user2FlickerEvents).toBe(0);
    expect(user1FlickerEvents).toBe(0);

    // Cleanup
    await context1.close();
    await context2.close();
  });
});

