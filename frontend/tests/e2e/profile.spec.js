const { test, expect } = require('@playwright/test');

/**
 * E2E Tests: Profile Page
 * Tests user profile management including:
 * - Viewing profile page
 * - Changing password (success and validation)
 * - Managing notification preferences
 * - Error handling and validation
 * - Navigation flows
 */

// Helper: Register and login a user via UI (single flow)
// API-based registration for tests that need reliable user creation
async function registerAndLogin(page, username, password) {
  const registerResponse = await page.request.post('http://localhost:10010/auth/register', {
    data: { username, password }
  });

  if (!registerResponse.ok()) {
    const loginResponse = await page.request.post('http://localhost:10010/auth/login', {
      data: { username, password }
    });
    const loginData = await loginResponse.json();
    await page.goto('http://localhost:3000/');
    await page.evaluate((data) => {
      localStorage.setItem('auth', JSON.stringify({ token: data.token, user: data.user }));
    }, loginData);
    await page.goto('http://localhost:3000/dashboard');
    await page.waitForLoadState('networkidle');
    return;
  }

  const registerData = await registerResponse.json();
  await page.goto('http://localhost:3000/');
  await page.evaluate((data) => {
    localStorage.setItem('auth', JSON.stringify({ token: data.token, user: data.user }));
  }, registerData);
  await page.goto('http://localhost:3000/dashboard');
  await page.waitForLoadState('networkidle');
}

// UI-based registration for tests that test the login flow itself
async function registerAndLoginViaUI(page, username, password) {
  await page.goto('http://localhost:3000/register');
  await page.getByLabel(/username/i).fill(username);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /register/i }).click();

  await page.waitForURL(url => url.toString().includes('/dashboard') || url.toString().includes('/register'), { timeout: 10000 }).catch(() => { });

  if (page.url().includes('/dashboard')) {
    return;
  }

  await page.goto('http://localhost:3000/login');
  await page.getByLabel(/username/i).fill(username);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /login|sign in/i }).click();

  await page.waitForURL(url => url.toString().includes('/dashboard'), { timeout: 15000 });
}



test.describe('Profile Page', () => {


  test('should display profile page after login', async ({ page }) => {
    // Register and login via UI
    await registerAndLoginViaUI(page, 'profile_view_user', 'password123');

    // Navigate to profile page
    await page.goto('http://localhost:3000/profile');

    // Verify profile page elements are visible
    await expect(page.getByText('Profile & Preferences')).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel('New password')).toBeVisible();
    await expect(page.getByRole('button', { name: /Change Password/i })).toBeVisible();
    await expect(page.getByText('Notification Preferences')).toBeVisible();
  });

  test('should validate password length', async ({ page }) => {
    // Register and login via UI
    await registerAndLoginViaUI(page, 'profile_validate_user', 'password123');

    // Navigate to profile page
    await page.goto('http://localhost:3000/profile');

    // Try to change password with too short password
    await page.getByLabel('New password').fill('short');
    await page.getByRole('button', { name: /Change Password/i }).click();

    // Should show validation error
    await expect(page.getByText(/Password must be at least 6 characters/i)).toBeVisible({ timeout: 5000 });
  });

  test('should require password to be entered', async ({ page }) => {
    // Register and login via UI
    await registerAndLoginViaUI(page, 'profile_empty_pwd_user', 'password123');

    // Navigate to profile page
    await page.goto('http://localhost:3000/profile');

    // Try to change password without entering one
    await page.getByRole('button', { name: /Change Password/i }).click();

    // Should show validation error
    await expect(page.getByText(/Password must be at least 6 characters/i)).toBeVisible({ timeout: 5000 });
  });

  test('should load and display notification preferences', async ({ page }) => {
    // Register and login via UI
    await registerAndLoginViaUI(page, 'profile_prefs_user', 'password123');

    // Navigate to profile page
    await page.goto('http://localhost:3000/profile');

    // Wait for preferences to load
    await page.waitForTimeout(2000);

    // Verify notification preferences section exists
    await expect(page.getByText('Notification Preferences')).toBeVisible();

    // Check that preference switches are visible
    // The component should render switches for: invite, share_added, ownership_transfer, removed, invite_response, member_left
    const switches = await page.locator('input[type="checkbox"]').count();
    expect(switches).toBeGreaterThan(0);
  });

  test('should toggle notification preferences', async ({ page }) => {
    // Register and login via UI
    await registerAndLoginViaUI(page, 'profile_toggle_user', 'password123');

    // Navigate to profile page
    await page.goto('http://localhost:3000/profile');

    // Get first preference switch
    const firstSwitch = await page.locator('input[type="checkbox"]').first();
    const initialState = await firstSwitch.isChecked();

    // Toggle the switch
    await firstSwitch.click();
    await page.waitForTimeout(500);

    // Verify state changed
    const newState = await firstSwitch.isChecked();
    expect(newState).toBe(!initialState);

    // Should show success message
    await expect(page.getByText('Preferences saved')).toBeVisible({ timeout: 5000 });
  });

  test('should handle navigation to and from profile page', async ({ page }) => {
    // Register and login via UI
    await registerAndLoginViaUI(page, 'profile_nav_user', 'password123');

    // Navigate to profile (via URL)
    await page.goto('http://localhost:3000/profile');

    // Verify profile page loaded
    await expect(page.getByText('Profile & Preferences')).toBeVisible({ timeout: 10000 });

    // Navigate back to dashboard
    await page.goto('http://localhost:3000/dashboard');

    // Verify dashboard loaded - use specific unique text
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10000 });
  });

  test('should show loading state for preferences', async ({ page }) => {
    // Register and login via UI
    await registerAndLoginViaUI(page, 'profile_loading_user', 'password123');

    // Navigate to profile page
    await page.goto('http://localhost:3000/profile');

    // Should initially show loading text or have no switches visible
    // Check for either loading text or that switches haven't loaded yet
    const hasLoadingText = await page.getByText(/Loading preferences/i).isVisible().catch(() => false);
    const switchCount = await page.locator('input[type="checkbox"]').count();

    // Either loading text is shown OR switches haven't rendered yet
    expect(hasLoadingText || switchCount === 0).toBe(true);

    // Wait for preferences to load
    await page.waitForTimeout(2000);

    // Now switches should be visible
    const finalSwitchCount = await page.locator('input[type="checkbox"]').count();
    expect(finalSwitchCount).toBeGreaterThan(0);
  });

  test('should require authentication to access profile', async ({ page }) => {
    // Try to access profile without authentication
    await page.goto('http://localhost:3000/profile');

    // Should either redirect to login or show not authenticated message
    await page.waitForTimeout(2000);

    // Check if redirected to login or if page shows auth required
    const currentUrl = page.url();
    const isOnLogin = currentUrl.includes('/login');
    const hasAuthError = await page.getByText(/Not authenticated|Please log in/i).isVisible().catch(() => false);

    // One of these should be true
    expect(isOnLogin || hasAuthError).toBe(true);
  });
});
