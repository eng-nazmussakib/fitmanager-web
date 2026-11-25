import AxeBuilder from '@axe-core/playwright';

import { expect, freshDemo, sidebar, signIn, test } from './fixtures';

/** The website on the mock API: HQ writes a post with a live preview; the public page shows it. */
test.describe('Website content', () => {
    test.beforeEach(async ({ page }) => {
        await freshDemo(page);
    });

    test('HQ writes a post in Markdown with a live preview, publishes it, and it is on the blog', async ({ page }) => {
        await page.goto('/auth/sign-in');
        await signIn(page, 'admin.hq', 'Admin@123');
        await page.goto('/hq/website');
        await expect(page.getByRole('heading', { level: 1, name: 'Website' })).toBeVisible();
        await expect(page.getByRole('list', { name: 'Posts' }).getByText('Draft')).toBeVisible();
        await expect(page.getByRole('list', { name: 'Posts' }).getByText('Scheduled')).toBeVisible();

        await page.getByRole('button', { name: 'New post' }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByLabel('Title').fill('Rowing for beginners');
        await expect(dialog.getByLabel('Address')).toHaveValue('rowing-for-beginners');
        await dialog.getByLabel('Excerpt').fill('How to row with your legs, not your arms, from the first stroke.');
        await dialog.getByLabel('Text').fill('## Legs first\n\nPush with **your legs**.\n\n<script>alert(1)</script>');
        const preview = dialog.getByRole('region', { name: 'Preview' });
        await expect(preview.getByRole('heading', { name: 'Legs first' })).toBeVisible();
        await expect(preview.locator('strong')).toHaveText('your legs');
        await expect(preview).toContainText('<script>alert(1)</script>');
        await dialog.getByRole('button', { name: 'Publish' }).click();
        await page.getByRole('option', { name: 'Publish now' }).click();
        await dialog.getByRole('button', { name: 'Save' }).click();
        await expect(page.getByRole('list', { name: 'Posts' }).getByText('Rowing for beginners')).toBeVisible();

        await page.goto('/blog');
        await page.getByRole('link', { name: 'Rowing for beginners' }).click();
        await expect(page).toHaveURL(/\/blog\/rowing-for-beginners$/);
        await expect(page.getByRole('heading', { level: 1, name: 'Rowing for beginners' })).toBeVisible();
        await expect(page.getByRole('heading', { level: 2, name: 'Legs first' })).toBeVisible();
        const results = await new AxeBuilder({ page }).include('main').analyze();
        expect(results.violations).toEqual([]);
    });

    test('the public pages read the database: a post, the running offers, a branch description', async ({ page }) => {
        await page.goto('/blog/the-benefits-of-hiit-training');
        await expect(page.getByRole('heading', { level: 2, name: 'Why it works' })).toBeVisible();
        await page.goto('/blog/stretching-after-every-session');
        await expect(page.getByRole('heading', { level: 1, name: 'Post not found' })).toBeVisible();
        await page.goto('/offers');
        await expect(page.getByRole('heading', { name: 'Refer a friend' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Eid special' })).toHaveCount(0);
        await page.goto('/branches/dhanmondi');
        await expect(page.getByText(/has the boxing ring/)).toBeVisible();
    });

    test('a branch manager edits only their branch page', async ({ page }) => {
        await page.goto('/auth/sign-in');
        await signIn(page, 'manager.gulshan', 'Manager@123');
        await sidebar(page).getByRole('link', { name: 'Website' }).click();
        await expect(page.getByRole('tab', { name: /Blog/ })).toHaveCount(0);
        await page.getByRole('tab', { name: 'Branch page' }).click();
        const text = page.getByLabel('About the branch');
        await expect(text).toHaveValue(/Our first branch/);
        await text.fill('Two floors in Gulshan 2, open from 6 am.');
        await page.getByRole('button', { name: 'Save' }).click();
        await expect(page.getByText('Branch page saved')).toBeVisible();
        await page.goto('/branches/gulshan');
        await expect(page.getByText('Two floors in Gulshan 2, open from 6 am.')).toBeVisible();
    });
});
