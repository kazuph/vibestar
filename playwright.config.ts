import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Vibestar E2E tests
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  // Test directory
  testDir: './e2e',

  // Run tests in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Use single worker for email tests (Mailpit is a shared resource)
  workers: 1,

  // Reporter to use
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],

  // Shared settings for all projects
  use: {
    // Base URL for relative paths in tests
    baseURL: 'http://localhost:15173',

    // Collect trace on first retry
    trace: 'on-first-retry',

    // Take screenshot on failure
    screenshot: 'only-on-failure',

    // Record video always for evidence
    video: 'on',
  },

  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Add more browsers as needed:
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  // Output directory for test artifacts
  outputDir: 'test-results/',

  // Global timeout for each test
  timeout: 30 * 1000,

  // Timeout for each expect() assertion
  expect: {
    timeout: 5 * 1000,
  },

  // Run local dev server before starting tests
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:15173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
