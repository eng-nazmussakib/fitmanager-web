import { expect, freshDemo, sidebar, signIn, test } from './fixtures';

test.describe('Branch scoping and permissions (CASL)', () => {
    test.beforeEach(async ({ page }) => freshDemo(page));

    test('front desk: no Reports or Dashboard-only HQ, and HQ URLs are denied', async ({ page }) => {
        await page.goto('/auth/sign-in');
        await signIn(page, 'desk.gulshan', 'Desk@123');
        await expect(sidebar(page).getByRole('link', { name: 'Check-in' })).toBeVisible();
        await expect(sidebar(page).getByRole('link', { name: 'Reports' })).toHaveCount(0);
        await page.goto('/hq/dashboard');
        await expect(page).toHaveURL(/\/forbidden$/);
        await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible();
    });

    test('a branch the user does not work at is denied', async ({ page }) => {
        await page.goto('/auth/sign-in');
        await signIn(page, 'desk.gulshan', 'Desk@123');
        await expect(sidebar(page)).toBeVisible();
        await page.goto('/console/uttara/members');
        await expect(page).toHaveURL(/\/forbidden$/);
    });

    test('one person at two branches switches between them; the menu follows the role there', async ({ page }) => {
        await page.goto('/auth/sign-in');
        await signIn(page, 'desk.uttara', 'Desk@123');
        await expect(page).toHaveURL(/\/console\/uttara\/check-in/);
        await page.getByRole('button', { name: /^Branch: Uttara/ }).click();
        await page.getByRole('menuitem', { name: /Dhanmondi/ }).click();
        await expect(page).toHaveURL(/\/console\/dhanmondi\/check-in/);
        await expect(page.getByRole('button', { name: /^Branch: Dhanmondi/ })).toBeVisible();
    });
});

test.describe('HQ settings: VAT', () => {
    test.beforeEach(async ({ page }) => freshDemo(page));

    test('the owner changes the VAT rate; the public prices note follows it', async ({ page }) => {
        await page.goto('/auth/sign-in');
        await signIn(page, 'owner', 'Owner@123');
        await expect(sidebar(page)).toBeVisible();
        await page.goto('/hq/dashboard');
        await sidebar(page).getByRole('link', { name: 'Settings' }).click();
        const rate = page.getByLabel('VAT rate (%)');
        await expect(rate).toHaveValue('15');
        await rate.fill('7.5');
        await expect(page.getByText('(৳225 VAT)')).toBeVisible();
        await page.getByRole('button', { name: 'Save' }).click();
        await expect(page.getByText('Settings saved')).toBeVisible();
        await expect(page.getByText(/Last changed by Kamrul Chowdhury/)).toBeVisible();

        await page.goto('/plans');
        await expect(page.getByText('Prices exclude VAT (7.5 %).')).toBeVisible();
    });

    test('front desk cannot open HQ settings', async ({ page }) => {
        await page.goto('/auth/sign-in');
        await signIn(page, 'desk.gulshan', 'Desk@123');
        await expect(sidebar(page)).toBeVisible();
        await page.goto('/hq/settings');
        await expect(page).toHaveURL(/\/forbidden$/);
    });
});

test.describe('HQ settings: website sections and pages (D-040)', () => {
    test.beforeEach(async ({ page }) => freshDemo(page));

    test('blog { section: off, page: on }, then the page off too; required groups are locked', async ({ page }) => {
        await page.goto('/auth/sign-in');
        await signIn(page, 'owner', 'Owner@123');
        await expect(sidebar(page)).toBeVisible();
        await page.goto('/hq/settings');
        await expect(page.getByRole('listitem', { name: 'Key numbers' })).toHaveCount(0);
        const membership = page.getByRole('listitem', { name: 'Membership' });
        await expect(membership.getByRole('switch', { name: 'Home page section' })).toBeDisabled();
        await expect(membership.getByRole('switch', { name: 'Page /plans' })).toBeDisabled();
        const blog = page.getByRole('listitem', { name: 'Blog' });
        await blog.getByRole('switch', { name: 'Home page section' }).click();
        await expect(page.getByText('Blog: section hidden, page shown')).toBeVisible();

        // Section off, page on: gone from the home page, the menu links to /blog instead, and /blog opens.
        await page.goto('/');
        await expect(page.locator('#plans')).toHaveCount(1);
        // The key numbers belong to the home group (D-042): shown with it, and not listed as a group of their own.
        await expect(page.getByRole('region', { name: 'Key figures' })).toBeVisible();
        await expect(page.locator('#blog')).toHaveCount(0);
        await page.goto('/blog');
        await expect(page).toHaveURL(/\/blog$/);

        await page.goto('/hq/settings');
        await page.getByRole('listitem', { name: 'Blog' }).getByRole('switch', { name: 'Page /blog' }).click();
        await expect(page.getByText('Blog: section hidden, page hidden')).toBeVisible();
        // Both off: /blog sends visitors to the top of the home page.
        await page.goto('/blog');
        await expect(page).toHaveURL(/\/#top$/);
    });
});
