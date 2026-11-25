import { TENANT } from '../src/app/config/tenant';
import { expect, test } from './fixtures';

test.describe('Public landing page', () => {
    test('shows the hero and main sections, and is indexable', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByRole('heading', { level: 1 })).toContainText('Fitness Goals');
        for (const name of ['Our Services', 'Our Plans', 'Our Facilities', 'What Our Customers Say', 'Meet Our Trainers', 'Our Branches', 'Our Gallery']) {
            await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
        }
        await expect(page).toHaveTitle(new RegExp(`\\| ${TENANT.brand.name}$`));
        await expect(page).not.toHaveTitle(/FitManager/);
        await expect(page.getByRole('contentinfo')).toContainText('Powered by FitManager');
        await expect(page.getByRole('contentinfo')).toContainText(`© ${new Date().getFullYear()} ${TENANT.brand.name}`);
        await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /fitness goals/i);
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/$/);
    });

    test('plans switch between monthly, 3-month, 6-month and annual prices', async ({ page }) => {
        await page.goto('/');
        const plans = page.locator('#plans');
        const duo = plans.locator('article').filter({ hasText: '2 Persons' });
        await expect(duo).toContainText('৳5,500/month');
        await plans.getByRole('button', { name: '3 Months' }).click();
        await expect(plans.getByRole('button', { name: '3 Months' })).toHaveAttribute('aria-pressed', 'true');
        await expect(duo).toContainText('৳15,500/3 months');
        await expect(duo).toContainText('৳5,167 a month');
        await plans.getByRole('button', { name: '6 Months' }).click();
        await expect(duo).toContainText('৳30,000/6 months');
        await plans.getByRole('button', { name: 'Annually' }).click();
        await expect(duo).toContainText('৳55,000/year');
        await expect(duo).toContainText('Save 17%');
    });

    test('Sign Up opens the join page; Choose This Plan fills in the plan and period', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('form input[type="email"]')).toHaveCount(0);

        await page.getByRole('banner').getByRole('link', { name: 'Sign Up' }).click();
        await expect(page).toHaveURL(/\/auth\/sign-up$/);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Join ${TENANT.brand.name}`);

        await page.goto('/');
        const plans = page.locator('#plans');
        await plans.getByRole('button', { name: '6 Months' }).click();
        await plans.locator('article').filter({ hasText: '2 Persons' }).getByRole('link', { name: 'Choose This Plan' }).click();
        await expect(page).toHaveURL(/\/auth\/sign-up\?plan=duo&period=half-yearly$/);
        await expect(page.getByLabel('Plan')).toHaveValue('duo');
        await expect(page.getByRole('radio', { name: '6 Months ৳30,000' })).toBeChecked();
        await expect(page.getByText('Duo · 6 Months')).toBeVisible();
    });

    test('hero, branch cards and footer lead to sign-up and login', async ({ page }) => {
        await page.goto('/');
        await page.getByRole('link', { name: 'Start Your Journey' }).click();
        await expect(page).toHaveURL(/\/auth\/sign-up$/);

        await page.goto('/');
        const uttara = page.locator('#branches').getByRole('listitem', { name: 'Uttara branch' });
        await uttara.getByRole('link', { name: 'Join Uttara' }).click();
        await expect(page).toHaveURL(/\/auth\/sign-up\?branch=Uttara$/);
        await expect(page.getByLabel('Branch')).toHaveValue('Uttara');

        await page.goto('/');
        await page.locator('#branches').getByRole('link', { name: 'Member login' }).first().click();
        await expect(page).toHaveURL(/\/auth\/sign-in$/);
        await page.getByRole('link', { name: 'Create an account' }).click();
        await expect(page).toHaveURL(/\/auth\/sign-up$/);
        await page.getByRole('link', { name: 'Sign in' }).click();
        await expect(page).toHaveURL(/\/auth\/sign-in$/);

        await page.goto('/');
        await page.getByRole('contentinfo').getByRole('link', { name: 'Join our community' }).click();
        await expect(page).toHaveURL(/\/auth\/sign-up$/);
    });

    test('sign-up checks the form, then confirms the request', async ({ page }) => {
        await page.goto('/auth/sign-up');
        await page.getByRole('button', { name: 'Create account' }).click();
        await expect(page.getByText('This field is required.').first()).toBeVisible();
        await expect(page.getByText('Please accept the terms to continue.')).toBeVisible();

        await page.getByLabel('Full name').fill('Rahim Uddin');
        await page.getByLabel('Mobile number').fill('12345');
        await expect(page.getByText('Enter a valid Bangladeshi mobile number')).toBeVisible();
        await page.getByLabel('Mobile number').fill('01712345678');
        await page.getByLabel('Branch').selectOption('Dhanmondi');
        await page.getByLabel('Plan').selectOption('group');
        // Click the chip (its label): the radio itself is visually hidden.
        await page
            .locator('label')
            .filter({ has: page.getByRole('radio', { name: /3 Months/ }) })
            .click();
        await expect(page.getByRole('radio', { name: /3 Months/ })).toBeChecked();
        await page.getByLabel('Password', { exact: true }).fill('Strong@123');
        await page.getByLabel('Confirm password').fill('Strong@124');
        await page.getByLabel('Confirm password').blur();
        await expect(page.getByText('The passwords do not match.')).toBeVisible();
        await page.getByLabel('Confirm password').fill('Strong@123');
        await page.getByRole('checkbox', { name: /I agree/ }).check();
        await page.getByRole('button', { name: 'Create account' }).click();

        await expect(page.getByRole('heading', { level: 1 })).toHaveText("You're almost in, Rahim!");
        await expect(page.getByText('Visit the Dhanmondi front desk')).toBeVisible();
    });

    test('lists each branch with its opening, ladies and combined hours', async ({ page }) => {
        await page.goto('/');
        const branches = page.locator('#branches');
        await expect(branches.getByRole('heading', { name: 'Our Branches' })).toBeVisible();
        for (const name of ['Gulshan', 'Dhanmondi', 'Uttara']) {
            const card = branches.getByRole('listitem', { name: `${name} branch` });
            await expect(card.getByRole('heading', { name })).toBeVisible();
            await expect(card).toContainText('Opening Hours');
            await expect(card).toContainText('Sat–Thu: 7 AM – 11 PM');
            await expect(card).toContainText('Friday: 4 PM – 9 PM');
            await expect(card).toContainText('Ladies Hour');
            await expect(card).toContainText('Sat–Thu: 12 PM – 3 PM');
            await expect(card).toContainText('Sat–Thu: 7 AM – 12 PM & 3 PM – 11 PM');
        }
    });

    test('header pins to the top after scrolling and highlights the section being read', async ({ page }) => {
        await page.goto('/');
        const header = page.locator('.site-header');
        await expect(header).not.toHaveClass(/is-stuck/);

        await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Membership' }).click();
        await expect(header).toHaveClass(/is-stuck/);
        await expect(header).toHaveCSS('position', 'fixed');
        await expect(page.getByRole('navigation', { name: 'Main' }).locator('.nav-underline.is-active')).toHaveCount(1);
        await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Membership' }).locator('.nav-underline')).toHaveClass(
            /is-active/
        );
        await expect(page.getByRole('heading', { name: 'Our Plans' })).toBeInViewport();

        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        await expect(header).not.toHaveClass(/is-stuck/);
    });

    test('theme switcher recolours the whole app and remembers the choice', async ({ page }) => {
        await page.goto('/');
        const brandPrimary = (): Promise<string> => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim());
        const before = await brandPrimary();

        await page.getByRole('button', { name: 'Change colour theme' }).click();
        const ocean = page.getByRole('radio', { name: 'Ocean' });
        await ocean.click();
        await expect(ocean).toHaveAttribute('aria-checked', 'true');
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean');
        await expect(page.locator('html')).toHaveAttribute('data-tint', '');
        expect(await brandPrimary()).not.toBe(before);

        await page.goto('/auth/sign-in');
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean');
    });

    test('the FAQ is hidden', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('#faq')).toHaveCount(0);
        await expect(page.getByRole('navigation', { name: 'Footer' }).getByRole('link', { name: 'FAQ' })).toHaveCount(0);
    });

    test('header lists the sections: four, then the rest under More; Login works', async ({ page }) => {
        await page.goto('/');
        const nav = page.getByRole('navigation', { name: 'Main' });
        for (const name of ['Home', 'Programs', 'Membership', 'Facilities']) await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
        await expect(nav.getByRole('link', { name: 'Gallery' })).toHaveCount(0);
        await nav.getByRole('button', { name: 'More' }).click();
        for (const name of ['Reviews', 'Trainers', 'Blog', 'Branches', 'Gallery']) await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
        await nav.getByRole('link', { name: 'Branches' }).click();
        await expect(page).toHaveURL(/#branches$/);
        await expect(page.getByRole('heading', { name: 'Our Branches' })).toBeInViewport();
        await expect(nav.getByRole('button', { name: 'More' }).locator('.nav-underline')).toHaveClass(/is-active/);

        await page.getByRole('banner').getByRole('link', { name: 'Login' }).click();
        await expect(page).toHaveURL(/\/auth\/sign-in/);
    });

    test('View All opens the trainers page; Learn More lands on that trainer', async ({ page }) => {
        await page.goto('/');
        await page.locator('#trainers').getByRole('link', { name: 'View All' }).click();
        await expect(page).toHaveURL(/\/trainers$/);
        await expect(page.getByRole('heading', { level: 1 })).toContainText('Trainers');
        await expect(page.getByRole('heading', { name: 'Sam Cole' })).toBeVisible();

        await page.goto('/');
        await page.locator('#trainers').getByRole('link', { name: 'Learn More' }).nth(1).click();
        await expect(page).toHaveURL(/\/trainers#michael-harris$/);
        await expect(page.locator('#michael-harris')).toBeInViewport();
    });

    test('blog page filters posts by category, and the filter is in the URL', async ({ page }) => {
        await page.goto('/');
        await page.locator('#blog').getByRole('link', { name: 'View All' }).click();
        await expect(page).toHaveURL(/\/blog$/);
        const filter = page.getByRole('navigation', { name: 'Blog categories' });
        const posts = page.getByRole('main').getByRole('heading', { level: 2 });
        await expect(posts).toHaveCount(5);

        await filter.getByRole('link', { name: /Nutrition/ }).click();
        await expect(page).toHaveURL(/\/blog\?category=Nutrition$/);
        await expect(filter.getByRole('link', { name: /Nutrition/ })).toHaveAttribute('aria-current', 'true');
        await expect(posts).toHaveCount(1);
        await expect(posts.first()).toHaveText('The Ultimate Guide To A Balanced Diet');

        await filter.getByRole('link', { name: /All/ }).click();
        await expect(posts).toHaveCount(5);
    });

    test('gallery page filters by branch and opens a photo in the lightbox', async ({ page }) => {
        await page.goto('/');
        await page.locator('#gallery').getByRole('link', { name: 'View All' }).click();
        await expect(page).toHaveURL(/\/gallery$/);
        const photos = page.getByRole('button', { name: /^Open photo/ });
        await expect(photos).toHaveCount(12);

        await page
            .getByRole('navigation', { name: 'Gallery categories' })
            .getByRole('link', { name: /Uttara/ })
            .click();
        await expect(page).toHaveURL(/category=Uttara/);
        await expect(photos).toHaveCount(4);

        await photos.first().click();
        const dialog = page.getByRole('dialog', { name: 'Photo' });
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText('1 / 4');
        await dialog.getByRole('button', { name: 'Next photo' }).click();
        await expect(dialog).toContainText('2 / 4');
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
    });

    test('footer has app shortcuts and the info pages (offers, policies)', async ({ page }) => {
        await page.goto('/');
        const footer = page.getByRole('navigation', { name: 'Footer' });
        await expect(footer.getByRole('heading', { name: 'Apps' })).toBeVisible();
        await expect(footer.getByRole('heading', { name: 'Info' })).toBeVisible();
        await footer.getByRole('link', { name: 'Member Portal' }).click();
        await expect(page).toHaveURL(/\/auth\/sign-in/);

        await page.goto('/');
        await page.getByRole('navigation', { name: 'Footer' }).getByRole('link', { name: 'Offers' }).click();
        await expect(page).toHaveURL(/\/offers$/);
        await expect(page.getByRole('heading', { level: 1 })).toContainText('Offers');
        await expect(page.getByRole('heading', { name: 'Student discount' })).toBeVisible();
        await expect(page).toHaveTitle(new RegExp(`Offers & promotions \\| ${TENANT.brand.name}$`));

        // The policies are HQ's, from the API.
        await page.goto('/policies/privacy-policy');
        await expect(page.getByRole('heading', { level: 1 })).toContainText('Privacy policy');
        await expect(page.getByText(/Last updated/)).toBeVisible();
    });
});

test.describe('Offer pop-up', () => {
    test.use({ promoSnoozed: false });

    test('opens on the landing page, closes, and stays closed on the next visit', async ({ page }) => {
        await page.goto('/');
        const dialog = page.getByRole('dialog', { name: /No Admission/ });
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole('link', { name: 'Claim Offer' })).toHaveAttribute('href', '/auth/sign-up');
        await dialog.getByRole('button', { name: 'Close offer' }).click();
        await expect(dialog).toBeHidden();

        await page.reload();
        await page.waitForTimeout(2500);
        await expect(page.getByRole('dialog', { name: /No Admission/ })).toBeHidden();
    });

    test('Claim Offer opens sign-up', async ({ page }) => {
        await page.goto('/');
        await page
            .getByRole('dialog', { name: /No Admission/ })
            .getByRole('link', { name: 'Claim Offer' })
            .click();
        await expect(page).toHaveURL(/\/auth\/sign-up$/);
    });
});
