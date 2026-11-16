import { expect, type Page, test as base } from '@playwright/test';

import { TENANT } from '../src/app/config/tenant';

/**
 * Rules (from the IB portals' smoke-test guide):
 * - Sign in through the real form. Never inject a token: that stays green when login is broken.
 * - Select by role + accessible name (what a screen reader sees), never by data-testid.
 *   An element you cannot find by role usually has no accessible name: fix the component, not the test.
 * - Reach a screen the way a user does (sidebar), except in tests that are ABOUT deep links and guards.
 */
export const test = base.extend<{ promoSnoozed: boolean }>({
    /**
     * The landing page's offer pop-up opens over the page and would block other tests' clicks, so tests start with it
     * dismissed. A test about the pop-up sets `test.use({ promoSnoozed: false })`.
     */
    promoSnoozed: [true, { option: true }],
    page: async ({ page, promoSnoozed }, use) => {
        const id = TENANT.landing?.promo?.id;
        if (promoSnoozed && id) {
            await page.addInitScript(promoId => {
                try {
                    localStorage.setItem('app.promo', JSON.stringify({ id: promoId, until: Date.now() + 86_400_000 }));
                } catch {
                    /* storage unavailable */
                }
            }, id);
        }
        await use(page);
    }
});

export { expect };

export async function signIn(page: Page, username: string, password: string): Promise<void> {
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
}

export function sidebar(page: Page): ReturnType<Page['getByRole']> {
    return page.getByRole('complementary', { name: 'Sidebar' }).getByRole('navigation', { name: 'Main' });
}

/** Fast mode (almost no artificial latency) and a fresh demo dataset for every test. */
export async function freshDemo(page: Page): Promise<void> {
    await page.addInitScript(() => {
        try {
            if (!sessionStorage.getItem('e2e.init')) {
                localStorage.removeItem('fm.mock.v1');
                sessionStorage.setItem('e2e.init', '1');
            }
            localStorage.setItem('fm.mock.fast', 'true');
        } catch {
            /* storage unavailable */
        }
    });
}
