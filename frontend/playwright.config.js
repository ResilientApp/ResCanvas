const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 45000, // Increased from 30s to 45s for multi-user tests
  retries: process.env.CI ? 2 : 1, // More retries in CI
  // Use more workers for parallel execution
  // In CI: use 2 workers, locally: use 50% of CPU cores (max 4)
  workers: process.env.CI ? 2 : Math.min(4, Math.floor(require('os').cpus().length / 2)) || 1,

  reporter: process.env.CI
    ? [['html', { outputFolder: 'playwright-report' }], ['github'], ['list']]
    : 'list',

  use: {
    baseURL: process.env.APP_BASE || 'http://localhost:10008',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15000, // Increased action timeout
    video: process.env.CI ? 'retain-on-failure' : 'off',
  },

  maxFailures: process.env.CI ? 5 : undefined,

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});