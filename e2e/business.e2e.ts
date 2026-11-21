import AxeBuilder from '@axe-core/playwright';

import { expect, freshDemo, sidebar, signIn, test } from './fixtures';

/** Phase 6 (D-098 to D-102) on the mock API: the shop, stock, purchase orders and the equipment register. */
test.describe('Business', () => {
    test.beforeEach(async ({ page }) => {
        const dhakaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
        await page.clock.install({ time: new Date(`${dhakaDate}T16:00:00+06:00`) });
        await page.clock.resume();
        await freshDemo(page);
    });

    test('the desk sells two protein bars to a walk-in; the stock goes down and the sale is listed', async ({ page }) => {
        await page.goto('/auth/sign-in');
        await signIn(page, 'desk.gulshan', 'Desk@123');
        await sidebar(page).getByRole('link', { name: 'Shop', exact: true }).click();
        await expect(page.getByRole('heading', { level: 1, name: 'Shop' })).toBeVisible();
        const bar = page.getByRole('button', { name: 'Add Protein bar, 60 g' });
        await expect(bar).toContainText('89 left');
        await bar.click();
        await bar.click();
        // 2 × 180 + 15 % VAT, per line.
        await expect(page.getByRole('button', { name: /^Sell · ৳414/ })).toBeEnabled();
        await page.getByRole('button', { name: /^Sell/ }).click();
        await expect(page.getByText('Sold and paid')).toBeVisible();
        await expect(page.getByText(/INV-GUL-\d{4}-\d{5}/)).toBeVisible();
        await page.getByRole('button', { name: 'Next sale' }).click();
        await expect(page.getByRole('button', { name: 'Add Protein bar, 60 g' })).toContainText('87 left');
        // A discount is a branch manager's: the desk has no discount field.
        await expect(page.getByPlaceholder('Why (with a discount)')).toHaveCount(0);
        await page.getByRole('link', { name: 'Sales and returns' }).click();
        await expect(page.getByText('Walk-in customer · 1 item').first()).toBeVisible();
    });

    test('the branch manager sees the low stock and its ledger, and reports a fault that puts a machine out of order', async ({ page }) => {
        await page.goto('/auth/sign-in');
        await signIn(page, 'manager.gulshan', 'Manager@123');
        await sidebar(page).getByRole('link', { name: 'Stock' }).click();
        await page.getByText('Low only').click();
        await expect(page.getByRole('row', { name: /Resistance band set/ })).toContainText('Out');
        await page.getByRole('row', { name: /Lifting gloves/ }).click();
        await expect(page.getByRole('heading', { name: 'Ledger' })).toBeVisible();
        await expect(page.getByText('Received').first()).toBeVisible();
        await sidebar(page).getByRole('link', { name: 'Equipment' }).click();
        await page.getByRole('button', { name: /^Leg press/ }).click();
        await page.getByRole('button', { name: 'Report a fault' }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByLabel('What is wrong').fill('The cable is fraying near the pulley.');
        await dialog.getByText('Out of order: put a sign on it').click();
        await dialog.getByRole('button', { name: 'Raise ticket' }).click();
        await expect(page.getByRole('button', { name: /^Leg press/ })).toContainText('Out of order');
    });

    test('HQ approves the pending purchase order', async ({ page }) => {
        await page.goto('/auth/sign-in');
        await signIn(page, 'admin.hq', 'Admin@123');
        await page.goto('/hq/purchase-orders');
        const pending = page.getByRole('button', { name: /Waiting for HQ/ });
        await expect(pending).toHaveCount(1);
        await pending.click();
        await expect(page.getByRole('heading', { level: 2, name: /^PO-GUL-/ })).toBeVisible();
        await page.getByRole('button', { name: 'Approve', exact: true }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Approve', exact: true }).click();
        // The only pending order is approved: none waits for HQ now.
        await expect(page.getByRole('button', { name: /Waiting for HQ/ })).toHaveCount(0);
    });

    for (const [name, path, user, password] of [
        ['shop', '/console/gulshan/pos', 'desk.gulshan', 'Desk@123'],
        ['stock', '/console/gulshan/stock', 'manager.gulshan', 'Manager@123'],
        ['equipment register', '/console/gulshan/equipment', 'manager.gulshan', 'Manager@123'],
        ['catalogue', '/hq/catalogue', 'admin.hq', 'Admin@123']
    ] as const) {
        test(`axe: no serious or critical issues on the ${name}`, async ({ page }) => {
            await page.goto('/auth/sign-in');
            await signIn(page, user, password);
            await page.goto(path);
            await page.waitForLoadState('networkidle');
            const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
            const bad = results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
            expect(bad.map(v => `${v.id}: ${v.nodes.length} × ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
        });
    }
});
