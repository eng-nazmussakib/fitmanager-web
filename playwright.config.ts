import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end ("smoke") tests with Playwright, the IB portals' third test leg: does it work for a real user?
 *
 * A dev server starts automatically on the mock API, so no backend is needed.
 *
 *   npx playwright install chromium   # once per machine
 *   npm run e2e                        # or: npm run e2e:ui
 */
const CI = !!process.env['CI'];

export default defineConfig({
    testDir: 'e2e',
    testMatch: /.*\.e2e\.ts/, // not *.spec.ts: those are Vitest unit tests
    fullyParallel: true,
    forbidOnly: CI,
    retries: CI ? 1 : 0,
    reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
    use: { trace: 'retain-on-failure', ...devices['Desktop Chrome'] },
    projects: [
        { name: 'default', use: { baseURL: 'http://localhost:4300' } }
    ],
    webServer: [
        { command: 'npx ng serve --port 4300', url: 'http://localhost:4300', reuseExistingServer: !CI, timeout: 180_000 }
    ]
});
