const { test, expect } = require('@playwright/test');

const API_BASE = process.env.API_BASE || 'http://localhost:10010';
const APP_BASE = process.env.APP_BASE || 'http://localhost:3000';

test.describe('Authentication E2E Tests', () => {

  test('complete user registration and login flow', async ({ page, request }) => {
    const username = `e2euser_${Date.now()}`;
    const password = 'Test123!';

    await page.goto(`${APP_BASE}/register`);
    await page.waitForSelector('input[name="username"]', { timeout: 5000 });

    await page.fill('input[name="username"]', username);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');

    await page.waitForURL('**/dashboard', { timeout: 10000 });
    expect(page.url()).toContain('/dashboard');

    await page.goto(`${APP_BASE}/login`);
    await page.fill('input[name="username"]', username);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');

    await page.waitForURL('**/dashboard');
    expect(page.url()).toContain('/dashboard');
  });

  test('login with invalid credentials fails', async ({ page }) => {
    await page.goto(`${APP_BASE}/login`);

    await page.fill('input[name="username"]', 'nonexistent');
    await page.fill('input[name="password"]', 'WrongPass123!');
    await page.click('button[type="submit"]');

    await page.waitForTimeout(1000);

    const errorMessage = await page.locator('text=/invalid|error|incorrect/i').first();
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });

  test('logout clears session', async ({ page, request }) => {
    const username = `e2elogout_${Date.now()}`;
    const password = 'Test123!';

    await request.post(`${API_BASE}/auth/register`, {
      data: { username, password },
    });

    const loginResp = await request.post(`${API_BASE}/auth/login`, {
      data: { username, password },
    });
    const { token, user } = await loginResp.json();

    await page.goto(APP_BASE);
    await page.evaluate(({ token, user }) => {
      localStorage.setItem('auth', JSON.stringify({ token, user }));
    }, { token, user });

    await page.goto(`${APP_BASE}/dashboard`);
    await page.waitForURL('**/dashboard');

    const logoutButton = page.locator('button:has-text("Logout"), button:has-text("Log out")').first();
    if (await logoutButton.isVisible()) {
      await logoutButton.click();
      await page.waitForURL('**/login', { timeout: 5000 });
      expect(page.url()).toContain('/login');
    }
  });
});
