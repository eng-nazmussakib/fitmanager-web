import { ViewportScroller } from '@angular/common';
import {
    afterNextRender,
    ApplicationRef,
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    ElementRef,
    inject,
    Injector,
    signal,
    viewChild
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideChevronDown, lucideMail, lucideMapPin, lucideMenu, lucidePalette, lucidePhone, lucideSearch, lucideX } from '@ng-icons/lucide';
import { filter } from 'rxjs';

import type { PageLink } from '@config/tenant.model';
import { APP } from '@core/constants/app.constants';
import { ThemeService } from '@core/services/theme.service';
import { TenantService } from '@core/tenant/tenant.service';
import { PublicContentService } from '@features/public/public-content.service';
import { LinkTarget, PublicSiteService } from '@features/public/public-site.service';
import { LogoComponent } from '@shared/components/logo/logo.component';
import { ClickOutsideDirective } from '@shared/directives/click-outside.directive';
import { RevealDirective } from '@shared/directives/reveal.directive';

/** Space kept above a section after an in-page jump, so the sticky header does not cover its heading. */
const STICKY_OFFSET = 88;

/** Path without query or fragment: `/blog?category=x` → `/blog`. */
function pathOf(url: string): string {
    return url.split(/[?#]/)[0] || '/';
}

/**
 * Layout of the public site (`/`, `/trainers`, `/blog`, `/gallery`): header (pinned to the top once the page scrolls,
 * dropdown menus, search, mobile menu), footer, and the theme switcher. Content and links come from the brand config
 * through PublicSiteService. The menu underlines the current page, or on the landing page the section being read.
 */
@Component({
    selector: 'app-public-layout',
    imports: [RouterOutlet, RouterLink, NgIcon, LogoComponent, ClickOutsideDirective, RevealDirective],
    viewProviders: [provideIcons({ lucideCheck, lucideChevronDown, lucideMail, lucideMapPin, lucideMenu, lucidePalette, lucidePhone, lucideSearch, lucideX })],
    templateUrl: './public-layout.component.html',
    styleUrl: './public-layout.component.css',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'block', '(document:keydown.escape)': 'closeMenus()' }
})
export class PublicLayoutComponent {
    private readonly _router = inject(Router);
    private readonly _scroller = inject(ViewportScroller);
    private readonly _destroyRef = inject(DestroyRef);
    private readonly _injector = inject(Injector);
    private readonly _header = viewChild.required<ElementRef<HTMLElement>>('siteHeader');
    private readonly _stickSentinel = viewChild.required<ElementRef<HTMLElement>>('stickSentinel');
    private readonly _content = viewChild.required<ElementRef<HTMLElement>>('content');
    private _spy?: IntersectionObserver;
    /** Whether the app has been stable once (see the constructor). */
    private _stable = false;
    /** The fragment of a navigation that ended before the app was stable, to scroll to once it is. */
    private _lostFragment: string | null = null;

    protected readonly site = inject(PublicSiteService);
    protected readonly theme = inject(ThemeService);
    protected readonly themeSwitcher = inject(TenantService).themeSwitcher;
    /** The software credit ("Powered by …"), from the brand config. */
    protected readonly poweredBy = inject(TenantService).config.poweredBy;
    protected readonly year = new Date().getFullYear();
    protected readonly c = this.site.c;
    protected readonly loginRoute = APP.LOGIN_ROUTE;

    protected readonly openDropdown = signal<string | null>(null);
    protected readonly mobileMenuOpen = signal(false);
    protected readonly searchOpen = signal(false);
    protected readonly searchMiss = signal(false);
    protected readonly themeMenuOpen = signal(false);

    /** The header is pinned to the top once the page has scrolled past it. */
    protected readonly stuck = signal(false);
    /** Height the header leaves behind while pinned, so the page below does not jump. */
    protected readonly headerSpace = signal<number | null>(null);
    protected readonly path = signal(pathOf(this._router.url));
    /** Id of the landing section in the middle of the viewport (scroll-spy). */
    protected readonly activeSection = signal<string | null>(null);
    /** Menu item to underline: on a page, its item; on the landing page, Home at the top, then the section's item. */
    protected readonly activeNav = computed(() => {
        const path = this.path();
        if (path !== '/') return this.site.navItemFor(path) ?? this.site.navItemFor(path.slice(1));
        return this.site.navItemFor(this.stuck() ? (this.activeSection() ?? '') : 'top');
    });

    constructor() {
        this._scroller.setOffset([0, STICKY_OFFSET]);
        this._destroyRef.onDestroy(() => {
            this._scroller.setOffset([0, 0]);
            this._spy?.disconnect();
        });
        afterNextRender(() => {
            this._watchHeader();
            this._watchSections();
        });
        // The site groups' switches from the database. On the server this finishes before the HTML is written.
        inject(PublicContentService)
            .siteGroups()
            .pipe(takeUntilDestroyed())
            .subscribe(rows => {
                if (!rows) return;
                this.site.applyGroups(rows);
                afterNextRender(() => this._watchSections(), { injector: this._injector });
            });
        this._router.events
            .pipe(
                filter((e): e is NavigationEnd => e instanceof NavigationEnd),
                takeUntilDestroyed()
            )
            .subscribe(e => {
                this.path.set(pathOf(e.urlAfterRedirects));
                this.activeSection.set(null);
                this.closeMenus();
                afterNextRender(() => this._watchSections(), { injector: this._injector });
                // A link clicked while the app is still settling (id > 1: not the first navigation, whose #fragment
                // the browser scrolls to itself): the router drops its scroll then, so do it once the app is stable.
                if (!this._stable && e.id > 1) this._lostFragment = this._router.parseUrl(e.urlAfterRedirects).fragment;
            });
        // With hydration, Angular's router ignores scroll events until the app is stable (no pending tasks, such as
        // the site-groups request above). Without this, "Membership" clicked in the first moments changed the URL
        // to /#plans but did not scroll.
        void inject(ApplicationRef)
            .whenStable()
            .then(() => {
                this._stable = true;
                const fragment = this._lostFragment;
                this._lostFragment = null;
                if (fragment && this._router.parseUrl(this._router.url).fragment === fragment) this._scroller.scrollToAnchor(fragment);
            });
    }

    /** Router path and fragment for a configured link. */
    protected to(link: PageLink): LinkTarget {
        return this.site.target(link);
    }

    protected toggleDropdown(label: string): void {
        this.openDropdown.update(open => (open === label ? null : label));
    }

    protected closeMenus(): void {
        this.openDropdown.set(null);
        this.mobileMenuOpen.set(false);
        this.themeMenuOpen.set(false);
    }

    protected search(event: SubmitEvent): void {
        event.preventDefault();
        const value = new FormData(event.target as HTMLFormElement).get('q');
        const hit = this.site.search(typeof value === 'string' ? value : '');
        this.searchMiss.set(!hit);
        if (!hit) return;
        this.closeMenus();
        void this._router.navigate(['/'], { fragment: hit });
    }

    /** Browser only: pin the header after the first ~160px of scrolling. */
    private _watchHeader(): void {
        if (typeof IntersectionObserver === 'undefined') return;
        const sticky = new IntersectionObserver(([entry]) => {
            const pin = !entry.isIntersecting && entry.boundingClientRect.top < 0;
            if (pin === this.stuck()) return;
            if (pin) this.headerSpace.set(this._header().nativeElement.offsetHeight);
            this.stuck.set(pin);
            if (!pin) this.openDropdown.set(null);
        });
        sticky.observe(this._stickSentinel().nativeElement);
        this._destroyRef.onDestroy(() => sticky.disconnect());
    }

    /** Browser only: track the section crossing a thin band in the middle of the viewport (landing page sections). */
    private _watchSections(): void {
        if (typeof IntersectionObserver === 'undefined') return;
        this._spy?.disconnect();
        const visible = new Set<string>();
        this._spy = new IntersectionObserver(
            entries => {
                for (const e of entries) {
                    if (e.isIntersecting) visible.add(e.target.id);
                    else visible.delete(e.target.id);
                }
                this.activeSection.set([...visible].at(-1) ?? null);
            },
            { rootMargin: '-45% 0px -50% 0px' }
        );
        this._content()
            .nativeElement.querySelectorAll('section[id], #about')
            .forEach(el => this._spy?.observe(el));
    }
}
