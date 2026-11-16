import { TestBed } from '@angular/core/testing';

import { TENANT } from '@config/tenant';
import { STORAGE_KEYS } from '@core/constants/app.constants';

import { DEFAULT_THEME, ThemeService } from './theme.service';

describe('ThemeService colour themes', () => {
    const root = document.documentElement;
    const css = (name: string): string => root.style.getPropertyValue(name);

    beforeEach(() => {
        localStorage.clear();
        root.removeAttribute('style');
        root.removeAttribute('data-tint');
    });

    it('applies the default theme at startup, with its exact shades and surfaces', () => {
        const theme = TestBed.inject(ThemeService);
        expect(theme.palette().id).toBe(DEFAULT_THEME.id);
        expect(css('--brand-primary')).toBe(DEFAULT_THEME.primary);
        expect(css('--primary-50')).toBe(DEFAULT_THEME.primaryShades?.[0] ?? '');
        expect(css('--surface-900')).toBe(DEFAULT_THEME.surfaces?.[1] ?? '');
        expect(root.getAttribute('data-theme')).toBe(DEFAULT_THEME.id);
    });

    it('switches theme: new accents, mixed shades for a theme without exact ones, photo tint on, choice saved', () => {
        const other = TENANT.themes.find(t => t.id !== DEFAULT_THEME.id && !t.primaryShades && t.tintPhotos);
        expect(other).toBeDefined();
        const theme = TestBed.inject(ThemeService);

        theme.setPalette(other!.id);

        expect(theme.palette().id).toBe(other!.id);
        expect(css('--brand-primary')).toBe(other!.primary);
        expect(css('--brand-secondary')).toBe(other!.secondary);
        expect(css('--primary-50')).toBe(''); // falls back to the color-mix in styles.css
        expect(root.hasAttribute('data-tint')).toBe(true);
        expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.PALETTE) ?? 'null')).toBe(other!.id);
    });

    it('restores the saved theme and ignores an unknown id', () => {
        const other = TENANT.themes.find(t => t.id !== DEFAULT_THEME.id)!;
        localStorage.setItem(STORAGE_KEYS.PALETTE, JSON.stringify(other.id));
        const theme = TestBed.inject(ThemeService);
        expect(theme.palette().id).toBe(other.id);

        theme.setPalette('no-such-theme');
        expect(theme.palette().id).toBe(other.id);
    });
});
