/**
 * Simple brush test - to be run in browser console
 * This helps debug what's happening with brush state
 */

// Test 1: Check if current brush type is being set
console.log("=== BRUSH TEST ===");

// Check if brushEngine exists on the Canvas component
const canvasComponents = document.querySelectorAll('[class*="Canvas"]');
console.log("Found canvas components:", canvasComponents.length);

// Check if toolbar is working
const brushButtons = document.querySelectorAll('[class*="brush"]');
console.log("Found brush-related elements:", brushButtons.length);

// Test basic drawing state
console.log("Window ResCanvas state test:");
if (window.ResCanvas) {
  console.log("ResCanvas global found:", window.ResCanvas);
} else {
  console.log("No ResCanvas global found");
}

// Check for React dev tools
if (window.React) {
  console.log("React found");
} else {
  console.log("React not found in global scope");
}
