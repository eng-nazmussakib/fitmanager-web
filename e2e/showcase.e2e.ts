import AxeBuilder from '@axe-core/playwright';

import { expect, freshDemo, test } from './fixtures';

/** The phase 0.5 demo script, end to end on the mock API (docs/demo-script.md). */
test.describe('Showcase script', () => {
    test.beforeEach(async ({ page }) => {
        // Check-in follows opening hours (closed after 11 PM, Fridays until 3 PM): pin the clock to 4 PM in Dhaka
        // today, when every branch is open, so the script does not depend on when the suite runs.
        const dhakaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
        // install(), not setFixedTime(): time keeps running (debounced searches and quotes need it).
        await page.clock.install({ time: new Date(`${dhakaDate}T16:00:00+06:00`) });
        await page.clock.resume();
        await freshDemo(page);
    });

    test('front desk: allowed, blocked when expired, renew with bKash, then allowed', async ({ page }) => {
        await page.goto('/demo');
        await page.getByRole('button', { name: /^Front desk/ }).click();
        await expect(page.getByRole('heading', { level: 1, name: 'Check-in' })).toBeVisible();
        const search = page.getByRole('combobox', { name: 'Member' });
        await expect(search).toBeFocused();

        // A scanner types the code and Enter.
        await search.fill('MEM-GUL-000001');
        await search.press('Enter');
        await expect(page.getByRole('region', { name: 'Allowed' }).getByText('Checked in')).toBeVisible();

        await search.fill('MEM-GUL-000002');
        await search.press('Enter');
        const blocked = page.getByRole('region', { name: 'Blocked' });
        await expect(blocked.getByText(/Subscription expired 3 days ago/)).toBeVisible();

        await blocked.getByRole('link', { name: 'Renew membership' }).click();
        await page.getByRole('button', { name: 'Next' }).click();
        await page.getByRole('radio', { name: /Single.*Monthly/ }).click();
        await page.getByRole('button', { name: 'Next' }).click();
        await page.getByRole('button', { name: 'Next' }).click();
        await page.getByRole('radio', { name: 'bKash' }).click();
        await page.getByRole('textbox', { name: 'Reference' }).fill('BK7Q2M9XKD');
        await page.getByRole('button', { name: 'Confirm sale' }).click();
        await expect(page.getByRole('status').filter({ hasText: 'Membership sold' }).first()).toBeVisible();
        await expect(page.getByRole('article', { name: /Invoice INV-GUL-/ })).toContainText('BK7Q2M9XKD');

        await page.getByRole('link', { name: 'Go to check-in' }).click();
        await page.getByRole('combobox', { name: 'Member' }).fill('MEM-GUL-000002');
        await page.getByRole('combobox', { name: 'Member' }).press('Enter');
        await expect(page.getByRole('region', { name: 'Allowed' }).getByText('Checked in')).toBeVisible();
    });

    test('manager: overrides "dues over limit" with a reason; it shows on the timeline', async ({ page }) => {
        await page.goto('/demo');
        await page.getByRole('button', { name: /^Branch manager/ }).click();
        // Let the sign-in finish before navigating, or the guard sends the page to /auth/sign-in.
        await page.waitForURL(/\/console\/gulshan\//);
        await page.goto('/console/gulshan/check-in');
        const search = page.getByRole('combobox', { name: 'Member' });
        await search.fill('MEM-GUL-000003');
        await search.press('Enter');
        await expect(page.getByText(/Dues ৳2,500 exceed the limit of ৳1,000/)).toBeVisible();
        await page.getByRole('button', { name: 'Override…' }).click();
        await page.getByRole('textbox', { name: 'Reason' }).fill('Promised to pay tomorrow');
        await page.getByRole('button', { name: 'Check in anyway' }).click();
        await expect(page.getByText('Checked in (override)')).toBeVisible();
        await page.goto('/console/gulshan/members/mem-gul-3?tab=timeline');
        await expect(page.getByText('Promised to pay tomorrow')).toBeVisible();
    });

    test('front desk cannot override', async ({ page }) => {
        await page.goto('/demo');
        await page.getByRole('button', { name: /^Front desk/ }).click();
        const search = page.getByRole('combobox', { name: 'Member' });
        await search.fill('MEM-GUL-000003');
        await search.press('Enter');
        await expect(page.getByRole('region', { name: 'Blocked' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Override…' })).toHaveCount(0);
    });

    test('keyboard: select, menu and dialog work without a mouse', async ({ page }) => {
        await page.goto('/dev/ui');
        // Select: open with ArrowDown, move, pick with Enter, focus returns to the trigger.
        const select = page.getByRole('button', { name: 'Select', exact: true });
        await select.focus();
        await page.keyboard.press('ArrowDown');
        await expect(page.getByRole('option', { name: /Single · Monthly/ })).toBeFocused();
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await expect(select).toBeFocused();
        await expect(select).toContainText('Duo · 3 Months');
        // Menu: Enter opens on the first item, Escape closes back to the trigger.
        const trigger = page.getByRole('button', { name: 'Menu' });
        await trigger.focus();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('menuitem', { name: 'Edit' })).toBeFocused();
        await page.keyboard.press('ArrowDown');
        await expect(page.getByRole('menuitem', { name: 'Duplicate' })).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(trigger).toBeFocused();
        // Dialog: Escape closes and focus returns.
        const open = page.getByRole('button', { name: 'Dialog', exact: true });
        await open.click();
        await expect(page.getByRole('dialog', { name: 'Dialog' })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog', { name: 'Dialog' })).toHaveCount(0);
        await expect(open).toBeFocused();
    });

    for (const [name, path, role] of [
        ['public branch page', '/branches/gulshan', null],
        ['console check-in', '/console/gulshan/check-in', 'Front desk'],
        ['HQ dashboard', '/hq/dashboard', 'Owner'],
        ['member portal', '/me', 'Member']
    ] as const) {
        test(`axe: no serious or critical issues on the ${name}`, async ({ page }) => {
            if (role) {
                await page.goto('/demo');
                await page.getByRole('button', { name: new RegExp(`^${role}`) }).click();
                await page.waitForURL(u => !u.pathname.startsWith('/demo'));
            }
            await page.goto(path);
            await page.waitForLoadState('networkidle');
            const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('.apexcharts-canvas').analyze();
            const bad = results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
            expect(bad.map(v => `${v.id}: ${v.nodes.length} × ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
        });
    }
});
