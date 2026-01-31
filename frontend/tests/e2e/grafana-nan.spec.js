/**
 * Playwright test to verify Grafana dashboard doesn't show NaN values
 */
const { test, expect } = require('@playwright/test');

test.describe('Grafana Dashboard NaN Verification', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Grafana dashboard
    await page.goto('http://localhost:3000/d/rescanvas-resdb-001/rescanvas-and-resilientdb-performance');
    
    // Wait for dashboard to load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000); // Extra time for metrics to load
  });

  test('should not display NaN in any stat panels', async ({ page }) => {
    // Wait for stat panels to be visible
    await page.waitForSelector('[data-testid*="stat"]', { timeout: 10000 }).catch(() => {
      console.log('No stat panels with testid found, checking by text content');
    });
    
    // Get all text content from the page
    const pageText = await page.textContent('body');
    
    // Check for NaN values (case-insensitive)
    const hasNaN = /\bNaN\b/i.test(pageText);
    
    // Take screenshot for verification
    await page.screenshot({ 
      path: 'test-results/grafana-no-nan-check.png', 
      fullPage: true 
    });
    
    if (hasNaN) {
      // Find specific panels with NaN for better debugging
      const panels = await page.locator('.react-grid-item').all();
      const nanPanels = [];
      
      for (const panel of panels) {
        const text = await panel.textContent().catch(() => '');
        if (/\bNaN\b/i.test(text)) {
          const title = await panel.locator('[data-testid*="header"], .panel-title').textContent().catch(() => 'Unknown panel');
          nanPanels.push(title);
        }
      }
      
      console.log('Panels with NaN:', nanPanels);
    }
    
    expect(hasNaN).toBe(false);
  });

  test('should display numeric values and no NaN in page content', async ({ page }) => {
    // Get full page text to check for numeric values
    const pageText = await page.textContent('body');
    
    // Take screenshot
    await page.screenshot({ 
      path: 'test-results/grafana-stat-values.png', 
      fullPage: true 
    });
    
    // Check for numeric values (stats should show 0, 10, 100%, etc.)
    const hasNumericValues = /\d+(\.\d+)?/.test(pageText);
    const nanMatches = (pageText.match(/\bNaN\b/gi) || []).length;
    
    console.log(`Page has numeric values: ${hasNumericValues}`);
    console.log(`NaN occurrences: ${nanMatches}`);
    
    // Page should have numeric values and no NaN
    expect(hasNumericValues).toBe(true);
    expect(nanMatches).toBe(0);
  });

  test('should have all panels loaded', async ({ page }) => {
    // Check that panels are rendered
    const panels = await page.locator('.react-grid-item').count();
    
    // Take screenshot
    await page.screenshot({ 
      path: 'test-results/grafana-all-panels.png', 
      fullPage: true 
    });
    
    console.log(`Dashboard has ${panels} panels`);
    
    // We expect at least 10 panels based on our dashboard
    expect(panels).toBeGreaterThanOrEqual(10);
  });

  test('should display "0" instead of "NaN" for empty metrics', async ({ page }) => {
    // Find all visible values and check none show NaN
    const allText = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('*'))
        .map(el => el.textContent)
        .join(' ');
    });
    
    // Count occurrences
    const nanMatches = (allText.match(/\bNaN\b/gi) || []).length;
    const zeroMatches = (allText.match(/\b0\b/g) || []).length;
    
    console.log(`NaN occurrences: ${nanMatches}`);
    console.log(`Zero occurrences: ${zeroMatches}`);
    
    // Take final screenshot
    await page.screenshot({ 
      path: 'test-results/grafana-final-check.png', 
      fullPage: true 
    });
    
    // No NaN should be visible
    expect(nanMatches).toBe(0);
  });
});
