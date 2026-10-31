// @ts-check

/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  testDir: '.',
  testMatch: '**/*.e2e.js',
  timeout: 30_000,
  retries: 0,
  workers: 1,

  use: {
    baseURL: `http://127.0.0.1:${process.env.E2E_PORT || 3210}`,
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [
    {
      name: 'api',
      testMatch: '**/*.api.e2e.js',
    },
    {
      name: 'ui',
      testMatch: '**/*.ui.e2e.js',
    },
  ],

  webServer: {
    command: 'node e2e/server-harness.js',
    port: Number(process.env.E2E_PORT) || 3210,
    reuseExistingServer: true,
    timeout: 10_000,
  },
};

module.exports = config;
