import AxeBuilder from '@axe-core/playwright';

import { expect, freshDemo, signIn, test } from './fixtures';

/** Phase 7b (D-108) on the mock API: the bell, the member's messages and the staff inbox. */
test.describe('The bell', () => {
    test.beforeEach(async ({ page }) => {
        await freshDemo(page);
    });

    test('a member sees the unread count, opens the messages, and the bell clears', async ({ page }) => {
        await page.goto('/auth/sign-in');
        await signIn(page, 'member.demo', 'Member@123');
        const bell = page.getByRole('link', { name: /^Messages, \d+ unread$/ });
        await expect(bell).toBeVisible();
        await bell.click();
        await expect(page.getByRole('heading', { level: 1, name: 'Messages' })).toBeVisible();
        await expect(page.getByRole('list', { name: 'Messages' }).getByText('New').first()).toBeVisible();
        await expect(page.getByRole('link', { name: 'Messages', exact: true }).first()).toBeVisible();
        await expect(page.getByTestId('bell-badge')).toHaveCount(0);
        const results = await new AxeBuilder({ page }).include('main').analyze();
        expect(results.violations).toEqual([]);
    });

    test('the branch manager opens an urgent ticket from the inbox', async ({ page }) => {
        await page.goto('/auth/sign-in');
        await signIn(page, 'manager.gulshan', 'Manager@123');
        await page.getByRole('link', { name: /^Messages, \d+ unread$/ }).click();
        await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible();
        await page
            .getByRole('list', { name: 'Messages' })
            .getByRole('button', { name: /Urgent: / })
            .first()
            .click();
        await expect(page).toHaveURL(/\/console\/gulshan\/equipment\?tab=tickets$/);
        await expect(page.getByRole('tab', { name: /Tickets/, selected: true })).toBeVisible();
    });

    test('HQ sees the orders waiting for approval, and marks everything read', async ({ page }) => {
        await page.goto('/auth/sign-in');
        await signIn(page, 'admin.hq', 'Admin@123');
        await page.goto('/hq/inbox');
        await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible();
        await expect(page.getByText(/waits for approval/).first()).toBeVisible();
        await page.getByRole('button', { name: 'Mark all read' }).click();
        await expect(page.getByRole('button', { name: 'Mark all read' })).toHaveCount(0);
        await expect(page.getByRole('link', { name: 'Messages', exact: true })).toBeVisible();
        const results = await new AxeBuilder({ page }).include('main').analyze();
        expect(results.violations).toEqual([]);
    });
});
