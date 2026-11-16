import { isPlatformBrowser } from '@angular/common';
import { DOCUMENT, effect, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';

import { TENANT } from '@config/tenant';
import type { ThemeConfig } from '@config/tenant.model';
import { STORAGE_KEYS } from '@core/constants/app.constants';
import { brandInitials, faviconSvg } from '@core/tenant/brand';

import { StorageService } from './storage.service';

export type Theme = 'light' | 'dark';

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
const SURFACES = [950, 900, 800, 700];

/** The theme a first visit uses: `defaultTheme`, else the first one. */
export const DEFAULT_THEME: ThemeConfig = TENANT.themes.find(t => t.id === TENANT.defaultTheme) ?? TENANT.themes[0];

/**
 * The app's look, shared by the landing page, sign-in and the consoles:
 * - the colour theme (`TENANT.themes`), written to CSS variables on <html> that `styles.css` turns into the
 *   primary / secondary / surface tokens;
 * - light or dark mode for the consoles and portal: Tailwind's `.dark` class (see `@custom-variant dark` in styles.css).
 * Both choices persist in localStorage. The inline script in index.html applies both before the first paint, so a
 * prerendered page never flashes the default theme (`STORAGE_KEYS.PALETTE_VARS`).
 *
 * Server-safe: on the server the CSS variables and attributes are still written to DOCUMENT (they end up in the
 * rendered HTML), while storage, the favicon and view transitions are browser-only.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
    private readonly _document = inject(DOCUMENT);
    private readonly _storage = inject(StorageService);
    private readonly _browser = isPlatformBrowser(inject(PLATFORM_ID));
    private readonly _theme = signal<Theme>(
        TENANT.features.darkMode === false ? 'light' : (this._storage.get<Theme>(STORAGE_KEYS.THEME) ?? this._systemTheme())
    );
    private readonly _palette = signal<ThemeConfig>(TENANT.themes.find(t => t.id === this._storage.get<string>(STORAGE_KEYS.PALETTE)) ?? DEFAULT_THEME);

    readonly theme = this._theme.asReadonly();
    /** The active colour theme. */
    readonly palette = this._palette.asReadonly();
    readonly palettes = TENANT.themes;

    constructor() {
        this._applyPalette(this._palette());
        // Until the user picks a mode, it follows the system setting and nothing is stored.
        effect(() => this._document.documentElement.classList.toggle('dark', this._theme() === 'dark'));
    }

    toggle(): void {
        this.set(this._theme() === 'dark' ? 'light' : 'dark');
    }

    set(theme: Theme): void {
        if (TENANT.features.darkMode === false) return;
        this._theme.set(theme);
        this._storage.set(STORAGE_KEYS.THEME, theme);
    }

    /** Switch the colour theme. Cross-fades with a view transition where the browser supports it and motion is welcome. */
    setPalette(id: string): void {
        const next = TENANT.themes.find(t => t.id === id);
        if (!next || next.id === this._palette().id) return;
        this._storage.set(STORAGE_KEYS.PALETTE, next.id);
        const apply = (): void => {
            this._palette.set(next);
            this._applyPalette(next);
        };
        const doc = this._document as Document & { startViewTransition?: (update: () => void) => unknown };
        const calm = !this._browser || (this._document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true);
        if (doc.startViewTransition && !calm) doc.startViewTransition(apply);
        else apply();
    }

    private _applyPalette(t: ThemeConfig): void {
        const root = this._document.documentElement;
        const style = root.style;
        const put = (name: string, value: string | undefined): void => {
            if (value) style.setProperty(name, value);
            else style.removeProperty(name);
        };

        put('--brand-primary', t.primary);
        put('--brand-secondary', t.secondary);
        SHADES.forEach((shade, i) => {
            put(`--primary-${shade}`, t.primaryShades?.[i]);
            put(`--secondary-${shade}`, t.secondaryShades?.[i]);
        });
        put('--primary-hover', t.primaryStates?.hover);
        put('--primary-pressed', t.primaryStates?.pressed);
        put('--secondary-hover', t.secondaryStates?.hover);
        put('--secondary-pressed', t.secondaryStates?.pressed);
        SURFACES.forEach((level, i) => put(`--surface-${level}`, t.surfaces?.[i]));

        root.setAttribute('data-theme', t.id);
        root.toggleAttribute('data-tint', !!t.tintPhotos);
        this._document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.surfaces?.[1] ?? t.primary);
        if (!this._browser) return;
        this._applyFavicon(t);
        // The next start-up loader (index.html) uses these colours, so it matches the chosen theme.
        this._storage.set(STORAGE_KEYS.SPLASH, { primary: t.primaryShades?.[5] ?? t.primary, bg: t.surfaces?.[1] ?? '#1b1b1b' });
        // And the inline script there re-applies the theme's variables before the first paint (no flash on a
        // prerendered page, which always carries the default theme). Only the variables this function just set.
        const vars: Record<string, string> = {};
        for (let i = 0; i < style.length; i++) {
            const name = style.item(i);
            if (/^--(brand|primary|secondary|surface)-/.test(name)) vars[name] = style.getPropertyValue(name);
        }
        this._storage.set(STORAGE_KEYS.PALETTE_VARS, { id: t.id, tint: !!t.tintPhotos, vars });
    }

    private _systemTheme(): Theme {
        if (!this._browser) return 'light';
        return this._document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    /** Browser icon: the brand logo, else its initials or a dumbbell (`brand.mark`) on the theme's main colour. */
    private _applyFavicon(t: ThemeConfig): void {
        const head = this._document.head;
        if (!head) return;
        let link = head.querySelector<HTMLLinkElement>('link[rel="icon"]');
        if (!link) {
            link = this._document.createElement('link');
            link.rel = 'icon';
            head.appendChild(link);
        }
        const brand = TENANT.brand;
        link.type = brand.logo ? '' : 'image/svg+xml';
        link.href = brand.logo ?? faviconSvg(brandInitials(brand), t.primaryShades?.[5] ?? t.primary, brand.mark);
    }
}
