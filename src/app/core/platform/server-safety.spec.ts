import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { TENANT } from '@config/tenant';
import { STORAGE_KEYS } from '@core/constants/app.constants';
import { StorageService } from '@core/services/storage.service';
import { DEFAULT_THEME, ThemeService } from '@core/services/theme.service';

import { BreakpointService } from './breakpoint.service';

/** The core services must render on the server (prerendering, SSR): no storage, no matchMedia, no favicon work. */
describe('server-safe services (PLATFORM_ID = server)', () => {
    beforeEach(() => {
        localStorage.clear();
        localStorage.setItem(STORAGE_KEYS.PALETTE, JSON.stringify(TENANT.themes.at(-1)!.id));
        TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'server' }] });
    });

    it('StorageService reads nothing and writes nothing', () => {
        const storage = TestBed.inject(StorageService);
        expect(storage.get(STORAGE_KEYS.PALETTE)).toBeNull();
        storage.set('k', 1);
        expect(localStorage.getItem('k')).toBeNull();
    });

    it('ThemeService renders the default theme into the document, light mode, without touching storage', () => {
        const before = localStorage.length;
        const theme = TestBed.inject(ThemeService);
        expect(theme.palette().id).toBe(DEFAULT_THEME.id);
        expect(theme.theme()).toBe('light');
        expect(document.documentElement.style.getPropertyValue('--brand-primary')).toBe(DEFAULT_THEME.primary);
        expect(localStorage.length).toBe(before);
    });

    it('BreakpointService keeps the initial value (mobile-first markup)', () => {
        const bp = TestBed.inject(BreakpointService);
        expect(bp.isMobile()).toBe(false);
        expect(bp.matches('(min-width: 1px)', true)()).toBe(true);
    });
});
