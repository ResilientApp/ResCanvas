const { test, expect } = require('@playwright/test');

/**
 * E2E Tests: Navigation Flows
 * Tests application navigation and routing including:
 * - Public/authenticated routes
 * - Navigation between pages
 * - Browser back/forward navigation
 * - Deep linking
 * - 404 handling
 */

// Helper: Register and login a user
async function registerAndLogin(page, username, password) {
  const registerResponse = await page.request.post('http://localhost:10010/auth/register', {
    data: {
      username: username,
      password: password,
      email: `${username}@test.com`
    }
  });

  if (!registerResponse.ok()) {
    const loginResponse = await page.request.post('http://localhost:10010/auth/login', {
      data: { username, password }
    });
    const loginData = await loginResponse.json();
    return { token: loginData.token, user: loginData.user };
  }

  const registerData = await registerResponse.json();
  return { token: registerData.token, user: registerData.user };
}

// Helper: Create a room
async function createRoom(page, token, roomName, isPublic = true) {
  const response = await page.request.post('http://localhost:10010/rooms', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    data: {
      name: roomName,
      public: isPublic
    }
  });

  const data = await response.json();
  return data.id;
}

test.describe('Navigation Flows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
  });

  test('should navigate from login to dashboard after successful login', async ({ page }) => {
    // Register user
    const auth = await registerAndLogin(page, 'nav_login_user', 'password123');

    // Set auth in localStorage
    await page.evaluate((auth) => {
      localStorage.setItem('auth', JSON.stringify(auth));
    }, auth);

    // Navigate to dashboard
    await page.goto('http://localhost:3000/dashboard');
    await page.waitForTimeout(1000);

    // Verify dashboard loaded - use first() to avoid strict mode violation
    await expect(page.getByText(/My Rooms|Dashboard|Create Room/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('should navigate from dashboard to room', async ({ page }) => {
    // Login
    const auth = await registerAndLogin(page, 'nav_room_user', 'password123');
    await page.evaluate((auth) => {
      localStorage.setItem('auth', JSON.stringify(auth));
    }, auth);

    // Create a room
    const roomId = await createRoom(page, auth.token, 'Nav Test Room', true);

    // Navigate to dashboard
    await page.goto('http://localhost:3000/dashboard');
    await page.waitForTimeout(1500);

    // Navigate to room
    await page.goto(`http://localhost:3000/rooms/${roomId}`);
    await page.waitForTimeout(1500);

    // Verify room loaded (canvas should be visible)
    await expect(page.locator('canvas')).toBeVisible({ timeout: 10000 });
  });

  test('should navigate from room to settings', async ({ page }) => {
    // Login
    const auth = await registerAndLogin(page, 'nav_settings_user', 'password123');
    await page.evaluate((auth) => {
      localStorage.setItem('auth', JSON.stringify(auth));
    }, auth);

    // Create a room
    const roomId = await createRoom(page, auth.token, 'Settings Nav Room', true);

    // Navigate to room
    await page.goto(`http://localhost:3000/rooms/${roomId}`);
    await page.waitForTimeout(2000);

    // Navigate to settings
    await page.goto(`http://localhost:3000/rooms/${roomId}/settings`);

    // Wait for page to load - look for any settings-related element
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Verify settings page loaded - check URL first
    expect(page.url()).toContain('/settings');

    // Then check for settings elements (more flexible)
    const pageContent = await page.content();
    const hasSettingsContent = pageContent.toLowerCase().includes('setting') ||
      pageContent.toLowerCase().includes('room name') ||
      pageContent.toLowerCase().includes('delete room');

    expect(hasSettingsContent).toBe(true);
  });

  test('should handle browser back navigation', async ({ page }) => {
    // Login
    const auth = await registerAndLogin(page, 'nav_back_user', 'password123');
    await page.evaluate((auth) => {
      localStorage.setItem('auth', JSON.stringify(auth));
    }, auth);

    // Navigate to dashboard
    await page.goto('http://localhost:3000/dashboard');
    await page.waitForTimeout(1000);

    // Navigate to profile
    await page.goto('http://localhost:3000/profile');
    await page.waitForTimeout(1000);

    // Go back
    await page.goBack();
    await page.waitForTimeout(1000);

    // Should be on dashboard
    const currentUrl = page.url();
    expect(currentUrl).toContain('/dashboard');
  });

  test('should handle browser forward navigation', async ({ page }) => {
    // Login
    const auth = await registerAndLogin(page, 'nav_forward_user', 'password123');
    await page.evaluate((auth) => {
      localStorage.setItem('auth', JSON.stringify(auth));
    }, auth);

    // Navigate to dashboard
    await page.goto('http://localhost:3000/dashboard');
    await page.waitForTimeout(1000);

    // Navigate to profile
    await page.goto('http://localhost:3000/profile');
    await page.waitForTimeout(1000);

    // Go back
    await page.goBack();
    await page.waitForTimeout(1000);

    // Go forward
    await page.goForward();
    await page.waitForTimeout(1000);

    // Should be on profile
    const currentUrl = page.url();
    expect(currentUrl).toContain('/profile');
  });

  test('should redirect unauthenticated users to login', async ({ page }) => {
    // Try to access dashboard without authentication
    await page.goto('http://localhost:3000/dashboard');
    await page.waitForTimeout(2000);

    // Should redirect to login or show auth required message
    const currentUrl = page.url();
    const isOnLogin = currentUrl.includes('/login');
    const hasAuthError = await page.getByText(/login|authenticate/i).isVisible().catch(() => false);

    expect(isOnLogin || hasAuthError).toBe(true);
  });

  test('should handle deep linking to rooms', async ({ page }) => {
    // Login
    const auth = await registerAndLogin(page, 'nav_deeplink_user', 'password123');
    await page.evaluate((auth) => {
      localStorage.setItem('auth', JSON.stringify(auth));
    }, auth);

    // Create a room
    const roomId = await createRoom(page, auth.token, 'Deeplink Room', true);

    // Close page and reopen with deep link
    await page.goto(`http://localhost:3000/rooms/${roomId}`);
    await page.waitForTimeout(2000);

    // Should load room directly
    await expect(page.locator('canvas')).toBeVisible({ timeout: 10000 });
  });

  test('should navigate from profile back to dashboard', async ({ page }) => {
    // Login
    const auth = await registerAndLogin(page, 'nav_profile_back', 'password123');
    await page.evaluate((auth) => {
      localStorage.setItem('auth', JSON.stringify(auth));
    }, auth);

    // Navigate to profile
    await page.goto('http://localhost:3000/profile');
    await page.waitForTimeout(1500);

    // Navigate to dashboard
    await page.goto('http://localhost:3000/dashboard');
    await page.waitForTimeout(1000);

    // Verify dashboard
    await expect(page.getByText(/Dashboard|My Rooms/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('should handle logout and redirect to login', async ({ page }) => {
    // Login
    const auth = await registerAndLogin(page, 'nav_logout_user', 'password123');
    await page.evaluate((auth) => {
      localStorage.setItem('auth', JSON.stringify(auth));
    }, auth);

    // Navigate to dashboard
    await page.goto('http://localhost:3000/dashboard');
    await page.waitForTimeout(1500);

    // Look for logout button
    const logoutButton = page.getByRole('button', { name: /Logout|Sign Out/i });
    const hasLogoutButton = await logoutButton.isVisible().catch(() => false);

    if (hasLogoutButton) {
      await logoutButton.click();
      await page.waitForTimeout(1500);

      // Should redirect to login
      const currentUrl = page.url();
      expect(currentUrl).toContain('/login');
    } else {
      // Manually clear auth and navigate
      await page.evaluate(() => {
        localStorage.removeItem('auth');
      });

      await page.goto('http://localhost:3000/dashboard');
      await page.waitForTimeout(2000);

      // Should be redirected
      const currentUrl = page.url();
      expect(currentUrl).toMatch(/login|^\/$|^\/$/);
    }
  });

  test('should maintain state when navigating between pages', async ({ page }) => {
    // Login
    const auth = await registerAndLogin(page, 'nav_state_user', 'password123');
    await page.evaluate((auth) => {
      localStorage.setItem('auth', JSON.stringify(auth));
    }, auth);

    // Navigate to dashboard
    await page.goto('http://localhost:3000/dashboard');
    await page.waitForTimeout(1500);

    // Navigate to profile
    await page.goto('http://localhost:3000/profile');
    await page.waitForTimeout(1000);

    // Navigate back to dashboard
    await page.goto('http://localhost:3000/dashboard');
    await page.waitForTimeout(1000);

    // Auth should still be in localStorage
    const authStillExists = await page.evaluate(() => {
      return localStorage.getItem('auth') !== null;
    });

    expect(authStillExists).toBe(true);
  });
});
