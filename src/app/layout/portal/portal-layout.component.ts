import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '@core/auth/auth.service';
import { LATER_FEATURES } from '@core/constants/later-features';
import { LogoComponent } from '@shared/components/logo/logo.component';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { AvatarComponent } from '@shared/ui/display/display';
import { IconComponent } from '@shared/ui/icon/icon.component';
import type { IconName } from '@shared/ui/icon/icons';
import { MenuComponent, MenuItemDirective, MenuTriggerDirective } from '@shared/ui/menu/menu';

interface PortalTab {
    label: string;
    icon: IconName;
    link: string;
    exact?: boolean;
}

const TABS: PortalTab[] = [
    { label: 'Home', icon: 'house', link: '/me', exact: true },
    // Classes, routines and progress stay in the demo until the API has them (D-070 c).
    ...(LATER_FEATURES
        ? ([
              { label: 'Classes', icon: 'calendar-days', link: '/me/bookings' },
              { label: 'Routine', icon: 'dumbbell', link: '/me/routine' },
              { label: 'Progress', icon: 'trending-up', link: '/me/progress' }
          ] satisfies PortalTab[])
        : []),
    { label: 'Payments', icon: 'receipt', link: '/me/payments' }
];

/**
 * The member portal (`/me`), mobile-first: a top bar with the gym's brand (members are the gym's customers; the
 * staff consoles carry FitManager, D-019), a bottom tab bar on phones, a sidebar from `lg`. Client-rendered only.
 */
@Component({
    selector: 'app-portal-layout',
    imports: [
        RouterOutlet,
        RouterLink,
        RouterLinkActive,
        LogoComponent,
        ButtonComponent,
        AvatarComponent,
        IconComponent,
        MenuComponent,
        MenuItemDirective,
        MenuTriggerDirective
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'block min-h-dvh bg-bg text-fg' },
    template: `
        <a class="fm-btn fm-btn-primary fixed top-2 left-2 z-[100] -translate-y-20 focus:translate-y-0" href="#main">Skip to content</a>
        <header class="sticky top-0 z-[var(--z-sticky)] border-b border-border bg-surface/90 backdrop-blur">
            <div class="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
                <a class="text-fg no-underline" aria-label="My membership, home" routerLink="/me"><app-logo size="sm" /></a>
                <span class="flex-1"></span>
                <button aria-label="Account" fmButton iconOnly variant="ghost" [fmMenuTrigger]="account">
                    <fm-avatar size="2rem" [name]="user()?.name ?? '?'" [src]="user()?.photo_url" />
                </button>
                <fm-menu #account label="Account">
                    <p class="fm-menu-label" aria-hidden="true">{{ user()?.name }} · {{ user()?.member?.code }}</p>
                    <div class="fm-menu-sep" role="separator"></div>
                    <button danger fmMenuItem (click)="auth.logout()">
                        <fm-icon name="log-out" size="1rem" />
                        Sign out
                    </button>
                </fm-menu>
            </div>
        </header>
        <div class="mx-auto flex max-w-6xl gap-6 px-4 lg:py-6">
            <nav class="sticky top-20 hidden h-fit w-52 shrink-0 lg:block" aria-label="Portal">
                <ul class="flex flex-col gap-0.5">
                    @for (t of tabs; track t.link) {
                        <li>
                            <a
                                class="fm-focusable flex h-10 items-center gap-3 rounded-[var(--radius-control)] px-3 text-sm font-medium text-fg-muted no-underline hover:bg-surface-sunken hover:text-fg"
                                ariaCurrentWhenActive="page"
                                routerLinkActive="bg-accent-soft! text-accent!"
                                [routerLink]="t.link"
                                [routerLinkActiveOptions]="{ exact: !!t.exact }"
                            >
                                <fm-icon size="1.25rem" [name]="t.icon" />
                                {{ t.label }}
                            </a>
                        </li>
                    }
                </ul>
            </nav>
            <main id="main" class="min-w-0 flex-1 pt-4 pb-24 lg:pt-0 lg:pb-6" tabindex="-1">
                <router-outlet />
            </main>
        </div>
        <!-- Bottom tab bar on phones and tablets -->
        <nav
            class="fixed inset-x-0 bottom-0 z-[var(--z-sticky)] border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
            aria-label="Portal"
        >
            <ul class="mx-auto grid max-w-lg grid-cols-5">
                @for (t of tabs; track t.link) {
                    <li>
                        <a
                            class="fm-focusable flex h-16 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium text-fg-subtle no-underline"
                            ariaCurrentWhenActive="page"
                            routerLinkActive="text-accent!"
                            [routerLink]="t.link"
                            [routerLinkActiveOptions]="{ exact: !!t.exact }"
                        >
                            <fm-icon size="1.375rem" [name]="t.icon" />
                            {{ t.label }}
                        </a>
                    </li>
                }
            </ul>
        </nav>
    `
})
export class PortalLayoutComponent {
    protected readonly auth = inject(AuthService);
    protected readonly user = this.auth.user;
    protected readonly tabs = TABS;
}
