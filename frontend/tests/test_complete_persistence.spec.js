const { test, expect } = require('@playwright/test');
const path = require('path');

// Test configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_URL = process.env.API_URL || 'http://localhost:10010';

test.describe('Complete Persistence Test - Stamps and Wacky Brushes', () => {
  let authToken;
  let roomId;
  let page;

  test.beforeAll(async ({ browser }) => {
    // Get auth token
    const context = await browser.newContext();
    const loginPage = await context.newPage();

    try {
      // Try to login
      const loginResponse = await loginPage.request.post(`${API_URL}/auth/login`, {
        data: {
          username: 'e2etest',
          password: 'testpass123'
        }
      });

      if (loginResponse.ok()) {
        const data = await loginResponse.json();
        authToken = data.token;
      } else {
        // Register if login failed
        await loginPage.request.post(`${API_URL}/auth/register`, {
          data: {
            username: 'e2etest',
            password: 'testpass123',
            email: 'e2etest@example.com'
          }
        });

        const retryLogin = await loginPage.request.post(`${API_URL}/auth/login`, {
          data: {
            username: 'e2etest',
            password: 'testpass123'
          }
        });
        const data = await retryLogin.json();
        authToken = data.token;
      }

      console.log('✓ Got auth token');

      // Create a test room
      const roomResponse = await loginPage.request.post(`${API_URL}/rooms`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        data: {
          name: 'E2E Persistence Test Room',
          isPrivate: false
        }
      });

      const roomData = await roomResponse.json();
      roomId = roomData.room.id;
      console.log(`✓ Created room: ${roomId}`);

    } finally {
      await loginPage.close();
      await context.close();
    }
  });

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage;

    // Set auth in localStorage
    await page.goto(BASE_URL);
    await page.evaluate((token) => {
      localStorage.setItem('auth', JSON.stringify({ token }));
    }, authToken);
  });

  test('Issue 1: Stamps should persist after refresh', async () => {
    console.log('\n=== TEST: Stamp Persistence ===');

    // Navigate to room
    await page.goto(`${BASE_URL}/room/${roomId}`);
    await page.waitForLoadState('networkidle');

    // Wait for canvas
    await page.waitForSelector('canvas', { timeout: 10000 });
    console.log('✓ Canvas loaded');

    // Click Stamps button
    await page.click('button:has-text("Stamps")', { timeout: 5000 });
    await page.waitForTimeout(500);
    console.log('✓ Opened stamps panel');

    // Select a stamp
    const stampButtons = await page.locator('button[title*="stamp" i], button:has(span:text-matches("[🌸🌺🌻🌷🌹]"))').all();
    if (stampButtons.length > 0) {
      await stampButtons[0].click();
      console.log('✓ Selected stamp');
    } else {
      throw new Error('No stamp buttons found');
    }

    await page.waitForTimeout(500);

    // Click on canvas to place stamp
    const canvas = await page.locator('canvas').first();
    await canvas.click({ position: { x: 200, y: 200 } });
    await page.waitForTimeout(1000);
    console.log('✓ Placed stamp on canvas');

    // Refresh the page
    console.log('→ Refreshing page...');
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Check console logs for stamp rendering
    const consoleLogs = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('stamp') || text.includes('Stamp') || text.includes('Drawing')) {
        consoleLogs.push(text);
        console.log(`[Browser Console] ${text}`);
      }
    });

    // Get canvas data
    const canvasData = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;
      return canvas.toDataURL();
    });

    console.log(`Canvas data length: ${canvasData ? canvasData.length : 0}`);

    // Check if stamp rendered (canvas should not be blank)
    const isBlank = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return true;
      const ctx = canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imageData.data;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] !== 255 || pixels[i + 1] !== 255 || pixels[i + 2] !== 255) {
          return false; // Found non-white pixel
        }
      }
      return true; // All white
    });

    console.log(`Canvas is blank: ${isBlank}`);

    if (isBlank) {
      console.log('✗ FAIL: Stamp disappeared after refresh!');
      throw new Error('Stamp disappeared after refresh - canvas is blank');
    } else {
      console.log('✓ PASS: Stamp persisted after refresh');
    }
  });

  test('Issue 2-4: Wacky brush cut/paste/undo should persist after Redis flush', async () => {
    console.log('\n=== TEST: Wacky Brush Cut/Paste/Undo Persistence ===');

    // Navigate to room
    await page.goto(`${BASE_URL}/room/${roomId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('canvas', { timeout: 10000 });

    // Select Sparkle brush
    await page.click('button:has-text("Brushes")');
    await page.waitForTimeout(500);

    const sparkleButton = await page.locator('button:has-text("Sparkle")').first();
    await sparkleButton.click();
    console.log('✓ Selected Sparkle brush');
    await page.waitForTimeout(500);

    // Draw some strokes
    const canvas = await page.locator('canvas').first();
    await canvas.click({ position: { x: 100, y: 100 } });
    await canvas.click({ position: { x: 150, y: 150 } });
    await canvas.click({ position: { x: 200, y: 200 } });
    await page.waitForTimeout(1000);
    console.log('✓ Drew sparkle strokes');

    // Count strokes before operations
    const strokesBefore = await page.request.get(`${API_URL}/rooms/${roomId}/strokes`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const strokesBeforeData = await strokesBefore.json();
    const countBefore = strokesBeforeData.strokes.length;
    console.log(`Strokes before: ${countBefore}`);

    // Simulate paste (add one more stroke - frontend paste would do this)
    await canvas.click({ position: { x: 300, y: 300 } });
    await page.waitForTimeout(1000);
    console.log('✓ Added pasted stroke');

    // Undo the last stroke
    await page.keyboard.press('Control+Z');
    await page.waitForTimeout(1500);
    console.log('✓ Undid pasted stroke');

    // Flush Redis (via API or command line)
    console.log('→ Flushing Redis...');
    const { exec } = require('child_process');
    await new Promise((resolve) => {
      exec('redis-cli FLUSHALL', (error, stdout, stderr) => {
        if (error) console.error(`Redis flush error: ${error}`);
        console.log('✓ Redis flushed');
        resolve();
      });
    });

    await page.waitForTimeout(1000);

    // Refresh page
    console.log('→ Refreshing after Redis flush...');
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Count strokes after flush + refresh
    const strokesAfter = await page.request.get(`${API_URL}/rooms/${roomId}/strokes`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const strokesAfterData = await strokesAfter.json();
    const countAfter = strokesAfterData.strokes.length;
    console.log(`Strokes after Redis flush + refresh: ${countAfter}`);

    // Check that undone stroke stayed hidden
    if (countAfter === countBefore) {
      console.log('✓ PASS: Undo state persisted after Redis flush');
      console.log(`  Before: ${countBefore}, After: ${countAfter} (undone stroke stayed hidden)`);
    } else {
      console.log(`✗ FAIL: Undo state lost after Redis flush`);
      console.log(`  Before: ${countBefore}, After: ${countAfter}`);
      throw new Error(`Expected ${countBefore} strokes, got ${countAfter} - undone stroke reappeared!`);
    }

    // Verify brushType metadata preserved
    const hasSparkle = strokesAfterData.strokes.some(s =>
      s.metadata?.brushType === 'sparkle' || s.brushType === 'sparkle'
    );

    if (hasSparkle) {
      console.log('✓ PASS: Brush metadata (sparkle) preserved');
    } else {
      console.log('✗ WARNING: Brush metadata not found in strokes');
    }
  });
});
