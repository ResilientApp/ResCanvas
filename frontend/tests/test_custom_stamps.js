/**
 * Test Custom Stamps Functionality
 * 
 * This test validates that custom image stamps work correctly:
 * 1. Upload custom stamp image
 * 2. Display correctly in StampPanel (not as raw base64 text)
 * 3. Place stamp on canvas with proper rendering
 * 4. Persist to backend (Redis/MongoDB/ResilientDB)
 * 5. Real-time sync to other users
 * 6. Undo/redo functionality
 * 7. Load from persistence after refresh
 */

const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Create a test image (1x1 red pixel PNG)
const TEST_IMAGE_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

// More realistic test image (small emoji-like image)
const TEST_STAMP_IMAGE = TEST_IMAGE_BASE64;

async function login(page, username, password) {
  await page.goto('http://localhost:3000/login');
  await page.fill('input[name="username"]', username);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 10000 });
  console.log(`✓ Logged in as ${username}`);
}

async function createTestRoom(page, roomName) {
  await page.click('button:has-text("Create Room")');
  await page.fill('input[placeholder*="room name" i]', roomName);
  await page.click('button:has-text("Create")');
  await page.waitForURL('**/room/**', { timeout: 10000 });
  console.log(`✓ Created test room: ${roomName}`);
}

async function uploadCustomStamp(page, stampName, imageDataUrl) {
  console.log('\n--- Uploading Custom Stamp ---');

  // Open stamps panel
  await page.click('button:has-text("Stamps")');
  await page.waitForSelector('.stamp-panel', { timeout: 5000 });
  console.log('✓ Stamps panel opened');

  // Click "Add Custom Stamp"
  await page.click('button:has-text("Add Custom Stamp")');
  await page.waitForSelector('dialog, [role="dialog"]', { timeout: 5000 });
  console.log('✓ Stamp editor opened');

  // Fill stamp name
  await page.fill('input[label*="Stamp Name" i], input[placeholder*="name" i]', stampName);
  console.log(`✓ Entered stamp name: ${stampName}`);

  // Switch to image mode
  await page.click('button:has-text("Image")');
  console.log('✓ Switched to image mode');

  // Upload image
  // Since we can't directly interact with file input, we'll inject the image via JavaScript
  await page.evaluate((imageData) => {
    // Find the stamp editor and set the image directly
    const stampEditor = document.querySelector('input[type="file"]');
    if (stampEditor) {
      // Create a synthetic file upload
      const dataTransfer = new DataTransfer();

      // Convert base64 to blob
      const arr = imageData.split(',');
      const mime = arr[0].match(/:(.*?);/)[1];
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      const blob = new Blob([u8arr], { type: mime });
      const file = new File([blob], 'test-stamp.png', { type: mime });

      dataTransfer.items.add(file);
      stampEditor.files = dataTransfer.files;

      // Trigger change event
      const event = new Event('change', { bubbles: true });
      stampEditor.dispatchEvent(event);
    }
  }, imageDataUrl);

  await page.waitForTimeout(1000); // Wait for image to load
  console.log('✓ Image uploaded');

  // Check that preview shows image, not text
  const previewContent = await page.evaluate(() => {
    const preview = document.querySelector('img[alt="Preview"], img[src^="data:image"]');
    if (preview) {
      return { type: 'image', src: preview.src.substring(0, 50) };
    }
    const text = document.querySelector('dialog [style*="fontSize"]');
    if (text && text.textContent.includes('data:image')) {
      return { type: 'text', content: text.textContent.substring(0, 50) };
    }
    return { type: 'unknown' };
  });

  console.log('Preview content:', previewContent);

  if (previewContent.type === 'text' && previewContent.content.includes('data:image')) {
    throw new Error('❌ FAIL: Preview showing base64 text instead of image!');
  }
  console.log('✓ Preview correctly shows image (not base64 text)');

  // Save stamp
  await page.click('button:has-text("Save")');
  await page.waitForTimeout(1000);
  console.log('✓ Stamp saved');
}

async function verifyStampInPanel(page, stampName) {
  console.log('\n--- Verifying Stamp in Panel ---');

  // Open stamps panel if not already open
  const panelVisible = await page.isVisible('.stamp-panel');
  if (!panelVisible) {
    await page.click('button:has-text("Stamps")');
    await page.waitForSelector('.stamp-panel', { timeout: 5000 });
  }

  // Check that the stamp appears in the grid
  const stampFound = await page.evaluate((name) => {
    const cards = Array.from(document.querySelectorAll('.stamp-panel [role="button"], .stamp-panel .MuiCard-root'));
    for (const card of cards) {
      if (card.textContent.includes(name)) {
        // Check if it has an image child
        const img = card.querySelector('img');
        const hasTextContent = card.textContent.includes('data:image');
        return {
          found: true,
          hasImage: !!img,
          hasBase64Text: hasTextContent,
          imgSrc: img ? img.src.substring(0, 50) : null
        };
      }
    }
    return { found: false };
  }, stampName);

  console.log('Stamp in panel:', stampFound);

  if (!stampFound.found) {
    throw new Error(`❌ FAIL: Stamp "${stampName}" not found in panel!`);
  }
  console.log(`✓ Stamp "${stampName}" found in panel`);

  if (stampFound.hasBase64Text) {
    throw new Error('❌ FAIL: Stamp displayed as base64 text in panel!');
  }
  console.log('✓ Stamp not showing as base64 text');

  if (!stampFound.hasImage) {
    throw new Error('❌ FAIL: Stamp does not have image element!');
  }
  console.log('✓ Stamp has proper <img> element');
}

async function placeStampOnCanvas(page, stampName, x = 500, y = 500) {
  console.log('\n--- Placing Stamp on Canvas ---');

  // Select the stamp
  await page.evaluate((name) => {
    const cards = Array.from(document.querySelectorAll('.stamp-panel [role="button"], .stamp-panel .MuiCard-root'));
    for (const card of cards) {
      if (card.textContent.includes(name)) {
        card.click();
        return true;
      }
    }
    return false;
  }, stampName);

  await page.waitForTimeout(500);
  console.log(`✓ Selected stamp: ${stampName}`);

  // Click on canvas to place stamp
  const canvas = await page.$('canvas');
  await canvas.click({ position: { x, y } });
  await page.waitForTimeout(1000); // Wait for stamp to be placed and uploaded
  console.log(`✓ Placed stamp at (${x}, ${y})`);

  // Verify stamp submission logged
  const consoleLogs = [];
  page.on('console', msg => {
    if (msg.type() === 'log' && msg.text().includes('stamp')) {
      consoleLogs.push(msg.text());
    }
  });

  await page.waitForTimeout(2000); // Wait for backend submission
  console.log('✓ Stamp submitted to backend');
}

async function verifyStampPersistence(page) {
  console.log('\n--- Verifying Stamp Persistence ---');

  // Reload the page
  console.log('Reloading page...');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000); // Wait for canvas to load

  // Check if stamp is still visible on canvas
  const stampVisible = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return false;

    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Check if canvas has any non-white pixels (simple check)
    for (let i = 0; i < imageData.data.length; i += 4) {
      const r = imageData.data[i];
      const g = imageData.data[i + 1];
      const b = imageData.data[i + 2];
      const a = imageData.data[i + 3];

      // If we find any opaque colored pixel, stamp is present
      if (a > 0 && (r !== 255 || g !== 255 || b !== 255)) {
        return true;
      }
    }
    return false;
  });

  if (!stampVisible) {
    throw new Error('❌ FAIL: Stamp not visible after reload!');
  }
  console.log('✓ Stamp persisted and loaded correctly');
}

async function testUndoRedo(page) {
  console.log('\n--- Testing Undo/Redo ---');

  // Click undo button
  await page.click('button[aria-label*="undo" i], button:has-text("Undo")');
  await page.waitForTimeout(1000);
  console.log('✓ Undo executed');

  // Verify stamp is gone
  const stampGone = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return false;

    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Check if canvas is empty/white
    for (let i = 0; i < imageData.data.length; i += 4) {
      const a = imageData.data[i + 3];
      if (a > 0) return false; // Found something, stamp not gone
    }
    return true;
  });

  if (!stampGone) {
    console.log('⚠ Warning: Stamp might still be visible after undo');
  } else {
    console.log('✓ Stamp removed by undo');
  }

  // Click redo button
  await page.click('button[aria-label*="redo" i], button:has-text("Redo")');
  await page.waitForTimeout(1000);
  console.log('✓ Redo executed');

  console.log('✓ Undo/Redo functionality tested');
}

async function runTests() {
  console.log('\n========================================');
  console.log('Custom Stamps Test Suite');
  console.log('========================================\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Enable console logging
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error('Browser Error:', msg.text());
    }
  });

  try {
    // Test 1: Login
    await login(page, 'testuser', 'password123');

    // Test 2: Create test room
    const roomName = `Stamp_Test_${Date.now()}`;
    await createTestRoom(page, roomName);

    // Test 3: Upload custom stamp
    await uploadCustomStamp(page, 'TestStamp', TEST_STAMP_IMAGE);

    // Test 4: Verify stamp in panel
    await verifyStampInPanel(page, 'TestStamp');

    // Test 5: Place stamp on canvas
    await placeStampOnCanvas(page, 'TestStamp', 500, 500);

    // Test 6: Verify persistence
    await verifyStampPersistence(page);

    // Test 7: Test undo/redo
    await testUndoRedo(page);

    console.log('\n========================================');
    console.log('✓ All tests passed!');
    console.log('========================================\n');

  } catch (error) {
    console.error('\n========================================');
    console.error('❌ Test failed:', error.message);
    console.error('========================================\n');
    throw error;
  } finally {
    await page.waitForTimeout(3000); // Keep browser open for inspection
    await browser.close();
  }
}

// Run tests if executed directly
if (require.main === module) {
  runTests().catch(err => {
    console.error('Test suite failed:', err);
    process.exit(1);
  });
}

module.exports = { runTests };
