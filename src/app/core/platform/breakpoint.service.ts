import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, DOCUMENT, inject, Injectable, PLATFORM_ID, Signal, signal } from '@angular/core';

/** Tailwind's breakpoints, as media queries. */
export const BREAKPOINTS = {
    mobile: '(max-width: 767.98px)',
    tablet: '(min-width: 768px) and (max-width: 1023.98px)',
    desktop: '(min-width: 1024px)'
} as const;

/**
 * Media queries as signals, safe on the server (replaces `BreakpointObserver` from @angular/cdk/layout, D-007).
 * In the browser each query follows `matchMedia`; on the server it holds its initial value, so prerendered HTML is
 * the mobile-first default and the browser corrects it after hydration.
 */
@Injectable({ providedIn: 'root' })
export class BreakpointService {
    private readonly _window = inject(DOCUMENT).defaultView;
    private readonly _browser = isPlatformBrowser(inject(PLATFORM_ID));
    private readonly _destroyRef = inject(DestroyRef);
    private readonly _cache = new Map<string, Signal<boolean>>();

    /** true below 768px (Tailwind `md`). */
    readonly isMobile = this.matches(BREAKPOINTS.mobile);
    /** true from 1024px (Tailwind `lg`). */
    readonly isDesktop = this.matches(BREAKPOINTS.desktop);
    readonly prefersReducedMotion = this.matches('(prefers-reduced-motion: reduce)');

    /** A signal that is true while `query` matches. One listener per distinct query, shared by every caller. */
    matches(query: string, initialValue = false): Signal<boolean> {
        const cached = this._cache.get(query);
        if (cached) return cached;
        const state = signal(initialValue);
        const mql = this._browser ? this._window?.matchMedia?.(query) : undefined;
        if (mql) {
            state.set(mql.matches);
            const onChange = (e: MediaQueryListEvent): void => state.set(e.matches);
            mql.addEventListener('change', onChange);
            this._destroyRef.onDestroy(() => mql.removeEventListener('change', onChange));
        }
        const readonly = state.asReadonly();
        this._cache.set(query, readonly);
        return readonly;
    }
}
