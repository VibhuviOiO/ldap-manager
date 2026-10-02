import { defineConfig } from '@playwright/test';

/**
 * Audit harness for a RUNNING deployment (not the Vite dev server).
 *
 * Point it at any instance:
 *   AUDIT_BASE_URL=http://localhost:8000 npx playwright test -c playwright.audit.config.ts
 *
 * Driven across auth modes by scripts/e2e-auth-matrix.sh, which sets
 * EXPECTED_ROLE so the RBAC spec asserts the controls the role should see.
 */
const baseURL = process.env.AUDIT_BASE_URL || 'http://localhost:8000';

export default defineConfig({
  testDir: './tests/e2e/audit',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [['list'], ['json', { outputFile: 'test-results/audit.json' }]],
  use: {
    baseURL,
    // The bundled Playwright browsers are not installed here; use system Chrome.
    channel: 'chrome',
    screenshot: 'only-on-failure',
    trace: 'off',
    ignoreHTTPSErrors: true,
  },
});
