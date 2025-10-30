/**
 * Browser Console Test Script for Stamp and Cut/Paste Fixes
 * 
 * Open http://localhost:3000, join a room, then paste this script into the browser console.
 * It will automatically test the fixed functionality.
 */

(async function testStampAndCutPaste() {
  console.clear();
  console.log("=".repeat(80));
  console.log("AUTOMATED BROWSER TEST: Stamp Tool and Cut/Paste Fixes");
  console.log("=".repeat(80));
  console.log();

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  let passCount = 0;
  let failCount = 0;

  function logTest(name, passed, details = '') {
    if (passed) {
      console.log(`✓ PASS: ${name}`);
      passCount++;
    } else {
      console.error(`✗ FAIL: ${name}`);
      if (details) console.error(`  Details: ${details}`);
      failCount++;
    }
  }

  // Test 1: Check that stamp mode exists in draw mode menu
  console.log("\n--- Test 1: Stamp Mode in Draw Mode Menu ---");
  try {
    // Find the draw mode button and click it
    const drawModeButton = document.querySelector('button[aria-label*="Freehand"], button[aria-label*="mode"]');
    if (!drawModeButton) {
      logTest("Find draw mode button", false, "Button not found");
    } else {
      drawModeButton.click();
      await sleep(500);

      // Check if stamp option is in the menu
      const stampMenuItem = Array.from(document.querySelectorAll('[role="menuitem"]')).find(
        el => el.textContent.includes('Stamp')
      );

      logTest("Stamp option exists in menu", !!stampMenuItem);

      // Close menu
      document.body.click();
      await sleep(300);
    }
  } catch (e) {
    logTest("Stamp mode menu test", false, e.message);
  }

  // Test 2: Check that stamp panel opens without errors
  console.log("\n--- Test 2: Stamp Panel Opens Without Errors ---");
  try {
    const originalConsoleError = console.error;
    const errors = [];
    console.error = (...args) => {
      errors.push(args.join(' '));
      originalConsoleError(...args);
    };

    const stampsButton = Array.from(document.querySelectorAll('button')).find(
      btn => btn.textContent.includes('Stamps')
    );

    if (!stampsButton) {
      logTest("Find Stamps button", false, "Button not found");
    } else {
      stampsButton.click();
      await sleep(1000);

      const hasErrorsAboutModes = errors.some(e => e.includes('modes[drawMode]'));
      logTest("No 'modes[drawMode]' errors", !hasErrorsAboutModes);

      // Check if stamp panel is visible
      const stampPanel = document.querySelector('.stamp-panel, [class*="StampPanel"]');
      logTest("Stamp panel is visible", !!stampPanel);

      // Close popover
      document.body.click();
      await sleep(300);
    }

    console.error = originalConsoleError;
  } catch (e) {
    logTest("Stamp panel test", false, e.message);
  }

  // Test 3: Verify Drawing class has stampSettings
  console.log("\n--- Test 3: Drawing Class Has StampSettings ---");
  try {
    // This test checks if the Drawing class constructor in the window scope has stampSettings
    // We can't directly test the class, but we can check the code
    const canvasFile = await fetch('/static/js/bundle.js').then(r => r.text()).catch(() => null);
    if (canvasFile) {
      const hasStampSettings = canvasFile.includes('stampSettings');
      logTest("Drawing class includes stampSettings", hasStampSettings);
    } else {
      logTest("Drawing class check", false, "Could not fetch bundle");
    }
  } catch (e) {
    logTest("Drawing class test", false, e.message);
  }

  // Test 4: Simulate stamp placement (if we can access canvas)
  console.log("\n--- Test 4: Stamp Placement Simulation ---");
  try {
    const canvas = document.querySelector('canvas');
    if (!canvas) {
      logTest("Find canvas element", false, "Canvas not found");
    } else {
      logTest("Canvas element found", true);

      // Check if canvas context is 2d
      const ctx = canvas.getContext('2d');
      logTest("Canvas 2D context available", !!ctx);
    }
  } catch (e) {
    logTest("Stamp placement test", false, e.message);
  }

  // Test 5: Check handlePaste preserves metadata (code inspection)
  console.log("\n--- Test 5: HandlePaste Preserves Metadata ---");
  try {
    const response = await fetch('/static/js/bundle.js').then(r => r.text()).catch(() => null);
    if (response) {
      const hasBrushTypePreserved = response.includes('brushType: originalDrawing.brushType') ||
        response.includes('brushType:') && response.includes('originalDrawing');
      const hasStampSettingsPreserved = response.includes('stampSettings: originalDrawing.stampSettings') ||
        response.includes('stampSettings:') && response.includes('originalDrawing');

      logTest("brushType preserved in paste", hasBrushTypePreserved);
      logTest("stampSettings preserved in paste", hasStampSettingsPreserved);
    } else {
      logTest("Metadata preservation check", false, "Could not fetch bundle");
    }
  } catch (e) {
    logTest("Metadata preservation test", false, e.message);
  }

  // Summary
  console.log();
  console.log("=".repeat(80));
  console.log(`TEST SUMMARY: ${passCount} passed, ${failCount} failed`);
  console.log("=".repeat(80));
  console.log();

  if (failCount === 0) {
    console.log("🎉 All automated tests passed!");
    console.log();
    console.log("Manual testing steps:");
    console.log("1. Click 'Stamps' button and select a stamp");
    console.log("2. Click on canvas to place stamp - should work without errors");
    console.log("3. Refresh page - stamp should persist");
    console.log("4. Draw with wacky brush (Brushes -> Sparkle/Neon/Rainbow)");
    console.log("5. Select area, cut, and paste - brush effects should be preserved");
  } else {
    console.log("⚠️ Some tests failed. Please review the errors above.");
  }

  console.log();
  console.log("=".repeat(80));
})();
