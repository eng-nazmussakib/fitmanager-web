import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { BranchContextService } from '@core/branch/branch-context.service';
import { STAFF_ROLE_LABELS } from '@core/models/branch.model';
import type { MenuGroup } from '@core/models/menu.model';
import { BreakpointService } from '@core/platform/breakpoint.service';
import { StorageService } from '@core/services/storage.service';
import { TenantService } from '@core/tenant/tenant.service';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogComponent } from '@shared/ui/dialog/dialog.component';
import { AvatarComponent } from '@shared/ui/display/display';
import { IconComponent } from '@shared/ui/icon/icon.component';
import { MenuComponent, MenuItemDirective, MenuTriggerDirective } from '@shared/ui/menu/menu';
import { BreadcrumbComponent } from '@shared/ui/navigation/breadcrumb.component';
import { TooltipDirective } from '@shared/ui/tooltip/tooltip.directive';

import { BranchSwitcherComponent } from './branch-switcher.component';
import { CONSOLE_MENU } from './console.menu';
import { HQ_MENU } from './hq.menu';

const COLLAPSED_KEY = 'app.sidebar-collapsed';

/**
 * Frame of the branch console (`/console/:branch`) and the HQ console (`/hq`), chosen by `data.area`.
 * - Sidebar: "FitManager" at the top (the software, not the gym, D-019), the menu filtered by the role at the
 *   active branch; collapsible to icons on desktop, a drawer on phones and tablets.
 * - Top bar: menu button, branch switcher, breadcrumb, user menu.
 * Client-rendered only (never indexed). Uses semantic tokens, so it works in light and dark mode.
 */
@Component({
    selector: 'app-console-layout',
    imports: [
        NgTemplateOutlet,
        RouterOutlet,
        RouterLink,
        RouterLinkActive,
        AvatarComponent,
        ButtonComponent,
        DialogComponent,
        IconComponent,
        MenuComponent,
        MenuItemDirective,
        MenuTriggerDirective,
        BreadcrumbComponent,
        TooltipDirective,
        BranchSwitcherComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'block min-h-dvh bg-bg text-fg' },
    template: `
        <a class="fm-btn fm-btn-primary fixed top-2 left-2 z-[100] -translate-y-20 focus:translate-y-0" href="#main">Skip to content</a>
        <ng-template #nav let-compact="compact">
            <nav class="flex flex-col gap-5 px-3 py-4" aria-label="Main">
                @for (group of menu(); track group.group) {
                    <div>
                        @if (!compact) {
                            <p class="mb-1.5 px-3 text-[0.6875rem] font-semibold tracking-wider text-fg-subtle uppercase">{{ group.group }}</p>
                        }
                        <ul class="flex flex-col gap-0.5">
                            @for (item of group.items; track item.route) {
                                <li>
                                    <a
                                        #rla="routerLinkActive"
                                        class="fm-focusable flex h-10 items-center gap-3 rounded-[var(--radius-control)] px-3 text-sm font-medium text-fg-muted no-underline transition-colors hover:bg-surface-sunken hover:text-fg"
                                        ariaCurrentWhenActive="page"
                                        routerLinkActive="bg-accent-soft! text-accent!"
                                        tooltipPlacement="right-start"
                                        [attr.aria-label]="compact ? item.label : null"
                                        [class.justify-center]="compact"
                                        [fmTooltip]="compact ? item.label : null"
                                        [routerLink]="base() + '/' + item.route"
                                        (click)="navOpen.set(false)"
                                    >
                                        <fm-icon size="1.25rem" [name]="item.icon" />
                                        @if (!compact) {
                                            <span class="truncate">{{ item.label }}</span>
                                        }
                                    </a>
                                </li>
                            }
                        </ul>
                    </div>
                }
            </nav>
        </ng-template>

        <div class="lg:flex">
            <!-- Desktop sidebar -->
            <aside
                class="sticky top-0 hidden h-dvh shrink-0 flex-col overflow-y-auto border-r border-border bg-surface transition-[width] duration-200 lg:flex"
                aria-label="Sidebar"
                [style.width]="collapsed() ? '4.75rem' : '16rem'"
            >
                <div class="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4" [class.justify-center]="collapsed()">
                    <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary-500 text-white" aria-hidden="true">
                        <fm-icon name="dumbbell" />
                    </span>
                    @if (!collapsed()) {
                        <span class="text-lg font-bold tracking-tight">{{ product }}</span>
                    } @else {
                        <span class="fm-sr-only">{{ product }}</span>
                    }
                </div>
                <ng-container *ngTemplateOutlet="nav; context: { compact: collapsed() }" />
                <div class="mt-auto border-t border-border p-3">
                    <button
                        block
                        fmButton
                        variant="ghost"
                        [attr.aria-label]="collapsed() ? 'Expand sidebar' : 'Collapse sidebar'"
                        [fmTooltip]="collapsed() ? 'Expand sidebar' : null"
                        (click)="toggleCollapsed()"
                    >
                        <fm-icon [name]="collapsed() ? 'panel-left-open' : 'panel-left-close'" />
                        @if (!collapsed()) {
                            <span>Collapse</span>
                        }
                    </button>
                </div>
            </aside>

            <div class="flex min-h-dvh min-w-0 flex-1 flex-col">
                <header
                    class="sticky top-0 z-[var(--z-sticky)] flex h-14 shrink-0 items-center gap-1 border-b border-border bg-surface/90 px-2 backdrop-blur sm:gap-2 sm:px-4"
                >
                    <button
                        class="lg:hidden"
                        aria-label="Open menu"
                        fmButton
                        iconOnly
                        variant="ghost"
                        [attr.aria-expanded]="navOpen()"
                        (click)="navOpen.set(true)"
                    >
                        <fm-icon name="menu" />
                    </button>
                    <app-branch-switcher />
                    <fm-breadcrumb class="ml-2 hidden min-w-0 truncate xl:block" />
                    <span class="flex-1"></span>
                    <button
                        class="gap-2 px-1.5 sm:px-2"
                        fmButton
                        variant="ghost"
                        [attr.aria-label]="'Account: ' + (user()?.name ?? '')"
                        [fmMenuTrigger]="userMenu"
                    >
                        <fm-avatar size="2rem" [name]="user()?.name ?? '?'" [src]="user()?.photo_url" />
                        <span class="hidden min-w-0 text-left leading-tight md:block">
                            <span class="block max-w-40 truncate text-sm text-fg">{{ user()?.name }}</span>
                            <span class="block text-xs text-fg-subtle">{{ roleLabel() }}</span>
                        </span>
                    </button>
                    <fm-menu #userMenu label="Account">
                        <p class="fm-menu-label" aria-hidden="true">{{ user()?.name }}</p>
                        <a fmMenuItem routerLink="/account/password">
                            <fm-icon name="lock" size="1rem" />
                            Password and sessions
                        </a>
                        <div class="fm-menu-sep" role="separator"></div>
                        <button danger fmMenuItem (click)="signOut()">
                            <fm-icon name="log-out" size="1rem" />
                            Sign out
                        </button>
                    </fm-menu>
                </header>

                <main id="main" class="mx-auto w-full max-w-[90rem] flex-1 px-4 py-5 sm:px-6 lg:py-6" tabindex="-1">
                    <router-outlet />
                </main>
            </div>
        </div>

        <!-- Phones and tablets: the same menu in a drawer -->
        <fm-dialog size="nav" [title]="product" [(open)]="navOpen">
            <ng-container *ngTemplateOutlet="nav; context: { compact: false }" />
        </fm-dialog>
    `
})
export class ConsoleLayoutComponent {
    private readonly _auth = inject(AuthService);
    private readonly _storage = inject(StorageService);
    private readonly _breakpoints = inject(BreakpointService);
    private readonly _route = inject(ActivatedRoute);
    private readonly _router = inject(Router);

    protected readonly product = inject(TenantService).config.poweredBy?.name ?? 'FitManager';
    protected readonly user = this._auth.user;
    protected readonly branch = inject(BranchContextService).active;
    protected readonly navOpen = signal(false);
    protected readonly collapsed = signal(this._storage.get<boolean>(COLLAPSED_KEY) ?? false);

    private readonly _area = toSignal(this._route.data.pipe(map(d => (d['area'] as 'hq' | 'console' | undefined) ?? 'console')), {
        initialValue: 'console' as const
    });

    protected readonly base = computed(() => (this._area() === 'hq' ? '/hq' : `/console/${this.branch()?.slug ?? ''}`));
    /** Menu items the user may open at the active branch. */
    protected readonly menu = computed<MenuGroup[]>(() => {
        this._auth.ability();
        const source = this._area() === 'hq' ? HQ_MENU : CONSOLE_MENU;
        return source.map(g => ({ ...g, items: g.items.filter(i => !i.can || this._auth.can(...i.can)) })).filter(g => g.items.length);
    });
    protected readonly roleLabel = computed(() => {
        const a = this._auth.activeAssignment();
        return a ? `${STAFF_ROLE_LABELS[a.role]} · ${a.branch.kind === 'HQ' ? 'HQ' : a.branch.name}` : '';
    });

    constructor() {
        // The drawer closes on every navigation and when the screen grows past the drawer breakpoint.
        this._router.events
            .pipe(
                filter(e => e instanceof NavigationEnd),
                takeUntilDestroyed()
            )
            .subscribe(() => this.navOpen.set(false));
        effect(() => {
            if (this._breakpoints.isDesktop()) this.navOpen.set(false);
        });
    }

    protected toggleCollapsed(): void {
        this.collapsed.update(v => !v);
        this._storage.set(COLLAPSED_KEY, this.collapsed());
    }

    protected signOut(): void {
        this._auth.logout();
    }
}
