/**
 * Basic smoke test for Analytics page
 * Verifies that the analytics page loads without runtime errors
 */

const { test, expect } = require('@playwright/test');

test.describe('Analytics Page', () => {
  test('should load without errors', async ({ page }) => {
    // Track console errors
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Track page errors
    const pageErrors = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    // Navigate to analytics page
    await page.goto('http://localhost:10008/analytics');

    // Wait for the page to load
    await page.waitForLoadState('networkidle');

    // Wait for the analytics dashboard title to appear
    await expect(page.locator('h2:has-text("Analytics Dashboard")')).toBeVisible({ timeout: 10000 });

    // Wait a bit for any async operations to complete
    await page.waitForTimeout(2000);

    // Check that we don't have the specific errors mentioned in the issue
    const hasSimulationError = consoleErrors.some(err => 
      err.includes('Cannot access \'simulation\' before initialization')
    );
    const hasJSONParseError = consoleErrors.some(err => 
      err.includes('Unexpected token \'<\', "<!DOCTYPE "... is not valid JSON')
    );

    expect(hasSimulationError, 'Should not have simulation initialization error').toBe(false);
    expect(hasJSONParseError, 'Should not have JSON parse error').toBe(false);

    // Check for general page errors
    expect(pageErrors.length, `Page should not have errors. Found: ${pageErrors.join(', ')}`).toBe(0);

    // Verify key elements are present
    await expect(page.locator('button:has-text("Generate Insights")')).toBeVisible();
    
    console.log('Analytics page loaded successfully!');
  });

  test('should display analytics data', async ({ page }) => {
    await page.goto('http://localhost:10008/analytics');
    
    // Wait for the dashboard to load
    await expect(page.locator('h2:has-text("Analytics Dashboard")')).toBeVisible({ timeout: 10000 });
    
    // Wait for data to load (spinner should disappear)
    await page.waitForSelector('text=Overview Statistics', { timeout: 15000 });
    
    // Verify overview card is displayed
    await expect(page.locator('text=Overview Statistics')).toBeVisible();
    
    console.log('Analytics data displayed successfully!');
  });

  test('should generate insights when button is clicked', async ({ page }) => {
    await page.goto('http://localhost:10008/analytics');
    
    // Wait for the dashboard to load
    await expect(page.locator('h2:has-text("Analytics Dashboard")')).toBeVisible({ timeout: 10000 });
    
    // Click the Generate Insights button
    await page.click('button:has-text("Generate Insights")');
    
    // Wait for insights to appear
    await page.waitForSelector('text=AI Insights Summary', { timeout: 10000 });
    
    // Verify insights are displayed
    await expect(page.locator('text=AI Insights Summary')).toBeVisible();
    await expect(page.locator('text=Recommendation')).toBeVisible();
    
    console.log('Insights generated successfully!');
  });
});
