const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 45000, // Increased from 30s to 45s for multi-user tests
  retries: 1, // Retry once on failure
  workers: 3, // Reduced from 4 to 3 to avoid resource contention
  reporter: 'list',

  use: {
    baseURL: process.env.APP_BASE || 'http://localhost:10008',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15000, // Increased action timeout
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});