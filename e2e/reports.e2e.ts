import AxeBuilder from '@axe-core/playwright';

import { expect, freshDemo, sidebar, signIn, test } from './fixtures';

/** Phase 7a (D-106, D-107) on the mock API: reports, their exports, and a trainer's own numbers. */
test.describe('Reports', () => {
    test.beforeEach(async ({ page }) => {
        await freshDemo(page);
    });

    test('the branch manager reads the revenue, switches report and range, and exports a table as Excel', async ({ page }) => {
        await page.goto('/auth/sign-in');
        await signIn(page, 'manager.gulshan', 'Manager@123');
        await sidebar(page).getByRole('link', { name: 'Reports' }).click();
        await expect(page.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible();
        await expect(page.getByRole('region', { name: 'Key figures' }).getByText('Net received')).toBeVisible();
        await expect(page.getByRole('heading', { name: 'By payment method' })).toBeVisible();
        await expect(page.getByRole('rowheader', { name: 'bKash' })).toBeVisible();

        const download = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Export By payment method' }).click();
        await page.getByRole('menuitem', { name: /Excel/ }).click();
        expect((await download).suggestedFilename()).toMatch(/^revenue-by_method-.*\.xlsx$/);

        await page.getByRole('button', { name: 'Classes', exact: true }).click();
        await page.getByRole('radio', { name: 'Last month' }).click();
        await expect(page).toHaveURL(/report=classes/);
        await expect(page.getByRole('region', { name: 'Key figures' }).getByText('Fill rate')).toBeVisible();
        await page.getByText('Compare with the previous period').click();
        await expect(page.getByText(/vs .* before/).first()).toBeVisible();

        const results = await new AxeBuilder({ page }).include('main').analyze();
        expect(results.violations).toEqual([]);
    });

    test('HQ compares the branches', async ({ page }) => {
        await page.goto('/auth/sign-in');
        await signIn(page, 'owner', 'Owner@123');
        await page.goto('/hq/reports?report=attendance');
        await expect(page.getByRole('columnheader', { name: 'Dhanmondi' }).first()).toBeVisible();
        await expect(page.getByRole('columnheader', { name: 'Uttara' }).first()).toBeVisible();
        await expect(page.getByText('Busy hours')).toBeVisible();
    });

    test('the desk has no reports and no exports', async ({ page }) => {
        await page.goto('/auth/sign-in');
        await signIn(page, 'desk.gulshan', 'Desk@123');
        await expect(sidebar(page).getByRole('link', { name: 'Members' })).toBeVisible();
        await expect(sidebar(page).getByRole('link', { name: 'Reports' })).toHaveCount(0);
        await sidebar(page).getByRole('link', { name: 'Members' }).click();
        await expect(page.getByRole('heading', { level: 1, name: 'Members' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Export the member list' })).toHaveCount(0);
    });

    test('a manager exports the member list', async ({ page }) => {
        await page.goto('/auth/sign-in');
        await signIn(page, 'manager.gulshan', 'Manager@123');
        await sidebar(page).getByRole('link', { name: 'Members' }).click();
        const download = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Export the member list' }).click();
        await page.getByRole('menuitem', { name: 'PDF' }).click();
        expect((await download).suggestedFilename()).toMatch(/^members-.*\.pdf$/);
        await expect(page.getByText(/rows saved as PDF/)).toBeVisible();
    });

    test('a trainer sees their own numbers on their profile, counts only', async ({ page }) => {
        await page.goto('/auth/sign-in');
        await signIn(page, 'trainer.gulshan', 'Trainer@123');
        await sidebar(page).getByRole('link', { name: 'Trainers' }).click();
        await page
            .getByRole('link', { name: /Sam Cole/ })
            .first()
            .click();
        await expect(page.getByRole('heading', { name: 'Numbers' })).toBeVisible();
        await expect(page.getByText('Classes taught')).toBeVisible();
        await expect(page.getByText(/Counts only/).first()).toBeVisible();
    });
});
