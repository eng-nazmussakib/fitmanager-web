import { TENANT } from '../src/app/config/tenant';
import { expect, freshDemo, sidebar, signIn, test } from './fixtures';

test.describe('Sign-in and landing pages per role', () => {
    test.beforeEach(async ({ page }) => freshDemo(page));

    test('sends a signed-out user to sign-in, then back to the page they asked for', async ({ page }) => {
        await page.goto('/console/gulshan/members');
        await expect(page).toHaveURL(/\/auth\/sign-in\?returnUrl=%2Fconsole%2Fgulshan%2Fmembers/);
        await signIn(page, 'manager.gulshan', 'Manager@123');
        await expect(page).toHaveURL(/\/console\/gulshan\/members/);
        await expect(page.getByRole('heading', { level: 1, name: 'Members' })).toBeVisible();
        await expect(page).toHaveTitle(`Members | ${TENANT.brand.name}`);
    });

    test('shows field errors on an empty submit and a server error for a wrong password', async ({ page }) => {
        await page.goto('/auth/sign-in');
        await page.getByRole('button', { name: 'Sign in' }).click();
        await expect(page.getByText('This field is required.')).toHaveCount(2);
        await signIn(page, 'owner', 'wrong-password', { fails: true });
        await expect(page.getByText('Invalid username or password')).toBeVisible();
        await expect(page).toHaveURL(/\/auth\/sign-in/);
    });

    for (const [role, landing, heading] of [
        ['Owner', /\/hq\/dashboard/, 'HQ dashboard'],
        ['Branch manager', /\/console\/gulshan\/dashboard/, 'Dashboard'],
        ['Front desk', /\/console\/gulshan\/check-in/, 'Check-in'],
        ['Trainer', /\/console\/gulshan\/classes/, 'Classes'],
        ['Member', /\/me$/, 'Hi, Rahim']
    ] as const) {
        test(`/demo: ${role} lands on ${heading}`, async ({ page }) => {
            await page.goto('/demo');
            await page.getByRole('button', { name: new RegExp(`^${role}`) }).click();
            await expect(page).toHaveURL(landing);
            await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
        });
    }

    test('the sidebar says FitManager (D-019) and signs out from the user menu', async ({ page }) => {
        await page.goto('/auth/sign-in');
        await signIn(page, 'manager.gulshan', 'Manager@123');
        await expect(page.getByRole('complementary', { name: 'Sidebar' }).getByText('FitManager')).toBeVisible();
        await page.getByRole('button', { name: /^Account/ }).click();
        await page.getByRole('menuitem', { name: 'Sign out' }).click();
        await expect(page).toHaveURL(/\/auth\/sign-in/);
        await expect(sidebar(page)).toHaveCount(0);
    });
});
