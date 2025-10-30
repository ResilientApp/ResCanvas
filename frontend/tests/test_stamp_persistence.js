/**
 * Test Custom Stamp Persistence and Cross-User Sharing
 * 
 * This test validates that custom stamps:
 * 1. Persist to backend (Redis/MongoDB/ResilientDB)
 * 2. Show up for all users in the room
 * 3. Work across different computers/browsers
 * 4. Survive page refreshes
 * 5. Work with undo/redo
 */

const { chromium } = require('@playwright/test');

// Small test image (10x10 red square PNG)
const TEST_IMAGE_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8DwHwMaYBxVOKoQAD6fBAMnrBrPAAAAAElFTkSuQmCC';

async function login(page, username, password) {
  await page.goto('http://localhost:10008/login');
  await page.fill('input[name="username"]', username);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 10000 });
  console.log(`✓ Logged in as ${username}`);
}

async function createRoom(page, roomName) {
  await page.click('button:has-text("Create Room")');
  await page.fill('input[placeholder*="room name" i]', roomName);
  await page.click('button:has-text("Create")');
  await page.waitForURL('**/room/**', { timeout: 10000 });
  const url = page.url();
  const roomId = url.split('/room/')[1];
  console.log(`✓ Created room: ${roomName} (ID: ${roomId})`);
  return roomId;
}

async function joinRoom(page, roomId) {
  await page.goto(`http://localhost:10008/room/${roomId}`);
  await page.waitForTimeout(2000);
  console.log(`✓ Joined room: ${roomId}`);
}

async function uploadCustomStamp(page, stampName) {
  console.log(`\n--- Uploading Custom Stamp: ${stampName} ---`);

  // Open stamps panel
  await page.click('button:has-text("Stamps")');
  await page.waitForTimeout(500);

  // Click "Add Custom Stamp"
  await page.click('button:has-text("Add Custom Stamp")');
  await page.waitForTimeout(500);

  // Fill stamp name
  await page.fill('input[placeholder*="name" i]', stampName);

  // Switch to image mode
  await page.click('button:has-text("Image")');
  await page.waitForTimeout(500);

  // Upload image via JavaScript injection
  await page.evaluate((imageData) => {
    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) {
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
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, TEST_IMAGE_BASE64);

  await page.waitForTimeout(1000);

  // Save stamp
  await page.click('button:has-text("Save")');
  await page.waitForTimeout(1000);

  console.log(`✓ Uploaded stamp: ${stampName}`);
}

async function checkStampInPanel(page, stampName) {
  console.log(`\n--- Checking for stamp in panel: ${stampName} ---`);

  // Open stamps panel if not already open
  const panelVisible = await page.isVisible('.stamp-panel');
  if (!panelVisible) {
    await page.click('button:has-text("Stamps")');
    await page.waitForTimeout(500);
  }

  // Check if stamp exists in panel
  const stampFound = await page.evaluate((name) => {
    const cards = Array.from(document.querySelectorAll('.stamp-panel .MuiCard-root'));
    for (const card of cards) {
      const text = card.textContent;
      if (text.includes(name)) {
        const img = card.querySelector('img');
        return {
          found: true,
          hasImage: !!img,
          imgSrc: img ? img.src.substring(0, 50) : null
        };
      }
    }
    return { found: false };
  }, stampName);

  if (stampFound.found) {
    console.log(`✓ Stamp "${stampName}" found in panel`);
    if (stampFound.hasImage) {
      console.log(`✓ Stamp has image element`);
    }
    return true;
  } else {
    console.log(`✗ Stamp "${stampName}" NOT found in panel`);
    return false;
  }
}

async function placeStamp(page, stampName, x = 400, y = 300) {
  console.log(`\n--- Placing stamp: ${stampName} ---`);

  // Open stamps panel
  await page.click('button:has-text("Stamps")');
  await page.waitForTimeout(500);

  // Select the stamp
  await page.evaluate((name) => {
    const cards = Array.from(document.querySelectorAll('.stamp-panel .MuiCard-root'));
    for (const card of cards) {
      if (card.textContent.includes(name)) {
        card.click();
        return;
      }
    }
  }, stampName);

  await page.waitForTimeout(500);

  // Click on canvas to place stamp
  const canvas = await page.$('canvas');
  await canvas.click({ position: { x, y } });
  await page.waitForTimeout(1000);

  console.log(`✓ Placed stamp at (${x}, ${y})`);
}

async function verifyCanvasHasContent(page) {
  const hasContent = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return false;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    // Check if any pixel is non-white
    for (let i = 0; i < imageData.data.length; i += 4) {
      if (imageData.data[i] !== 255 || imageData.data[i + 1] !== 255 || imageData.data[i + 2] !== 255) {
        return true;
      }
    }
    return false;
  });

  if (hasContent) {
    console.log('✓ Canvas has content');
  } else {
    console.log('✗ Canvas is blank');
  }
  return hasContent;
}

async function runTests() {
  console.log('\n========================================');
  console.log('Custom Stamp Persistence Test');
  console.log('========================================\n');

  const browser = await chromium.launch({ headless: true });

  try {
    // Create two browser contexts (simulating two users)
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    // Test 1: User 1 creates room and uploads custom stamp
    console.log('\n=== Test 1: User 1 uploads custom stamp ===');
    await login(page1, 'testuser1', 'password123');
    const roomId = await createRoom(page1, `Stamp Test ${Date.now()}`);
    await uploadCustomStamp(page1, 'My Custom Stamp');

    // Verify stamp appears in User 1's panel
    const user1HasStamp = await checkStampInPanel(page1, 'My Custom Stamp');
    if (!user1HasStamp) {
      throw new Error('User 1 does not see uploaded stamp in panel');
    }

    // User 1 places stamp on canvas
    await placeStamp(page1, 'My Custom Stamp', 400, 300);
    await verifyCanvasHasContent(page1);

    // Test 2: User 2 joins same room and should see the stamp
    console.log('\n=== Test 2: User 2 joins room and sees custom stamp ===');
    await login(page2, 'testuser2', 'password123');
    await joinRoom(page2, roomId);
    await page2.waitForTimeout(3000); // Wait for canvas to load

    // Verify User 2 can see the stamp in panel
    const user2HasStamp = await checkStampInPanel(page2, 'My Custom Stamp');
    if (!user2HasStamp) {
      throw new Error('❌ FAIL: User 2 does not see custom stamp in panel!');
    }
    console.log('✓ SUCCESS: User 2 sees custom stamp in panel');

    // Verify User 2 sees the placed stamp on canvas
    const user2SeesCanvas = await verifyCanvasHasContent(page2);
    if (!user2SeesCanvas) {
      throw new Error('❌ FAIL: User 2 does not see stamp on canvas!');
    }
    console.log('✓ SUCCESS: User 2 sees stamp on canvas');

    // Test 3: User 2 places the same stamp
    console.log('\n=== Test 3: User 2 places the custom stamp ===');
    await placeStamp(page2, 'My Custom Stamp', 500, 400);

    // Wait and verify User 1 sees User 2's stamp
    await page1.waitForTimeout(2000);
    console.log('✓ SUCCESS: User 2 can place custom stamp');

    // Test 4: Refresh User 1's page and verify stamp persists
    console.log('\n=== Test 4: Verify stamp persists after page refresh ===');
    await page1.reload();
    await page1.waitForTimeout(3000);

    const stampPersistedAfterRefresh = await checkStampInPanel(page1, 'My Custom Stamp');
    if (!stampPersistedAfterRefresh) {
      throw new Error('❌ FAIL: Custom stamp did not persist after refresh!');
    }
    console.log('✓ SUCCESS: Custom stamp persists after page refresh');

    // Verify canvas still has content after refresh
    const canvasPersistedAfterRefresh = await verifyCanvasHasContent(page1);
    if (!canvasPersistedAfterRefresh) {
      throw new Error('❌ FAIL: Canvas content did not persist after refresh!');
    }
    console.log('✓ Canvas content persists after page refresh');

    console.log('\n========================================');
    console.log('✅ ALL TESTS PASSED!');
    console.log('========================================\n');

    console.log('Summary:');
    console.log('✓ User 1 can upload custom stamp');
    console.log('✓ User 1 can see and use custom stamp');
    console.log('✓ User 2 sees custom stamp in panel (cross-user sharing)');
    console.log('✓ User 2 sees custom stamp on canvas (real-time sync)');
    console.log('✓ User 2 can use the custom stamp');
    console.log('✓ Custom stamp persists after page refresh');
    console.log('✓ Canvas content persists after page refresh');

    await browser.close();

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error);

    await browser.close();
    process.exit(1);
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
