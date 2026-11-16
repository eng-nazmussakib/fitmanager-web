import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '@core/auth/auth.service';
import { BranchContextService } from '@core/branch/branch-context.service';
import { STAFF_ROLE_LABELS } from '@core/models/branch.model';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { IconComponent } from '@shared/ui/icon/icon.component';
import { MenuComponent, MenuItemDirective, MenuTriggerDirective } from '@shared/ui/menu/menu';

/**
 * Switches the console between the branches the user works at, keeping the current section
 * (`/console/gulshan/members/42` → `/console/dhanmondi/members`). HQ staff also get "HQ overview".
 * The branch is in the URL (D-014), so this is only a set of links.
 */
@Component({
    selector: 'app-branch-switcher',
    imports: [RouterLink, ButtonComponent, IconComponent, MenuComponent, MenuItemDirective, MenuTriggerDirective],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <button class="max-w-56 min-w-0" fmButton variant="ghost" [attr.aria-label]="'Branch: ' + label() + '. Switch branch'" [fmMenuTrigger]="menu">
            <fm-icon [name]="active()?.kind === 'HQ' ? 'building-2' : 'store'" />
            <span class="truncate">{{ label() }}</span>
            @if (options().length > 1) {
                <fm-icon class="text-fg-subtle" name="chevrons-up-down" size="1rem" />
            }
        </button>
        <fm-menu #menu label="Switch branch" placement="bottom-start">
            @if (hq(); as hq) {
                <a fmMenuItem routerLink="/hq/dashboard" [attr.aria-current]="active()?.kind === 'HQ' ? 'true' : null">
                    <fm-icon name="building-2" size="1rem" />
                    <span class="flex-1">HQ overview</span>
                    @if (active()?.kind === 'HQ') {
                        <fm-icon name="check" size="1rem" />
                    }
                </a>
                <div class="fm-menu-sep" role="separator"></div>
            }
            <p class="fm-menu-label" aria-hidden="true">Branches</p>
            @for (o of options(); track o.branch.oid) {
                <a fmMenuItem [attr.aria-current]="o.branch.oid === active()?.oid ? 'true' : null" [routerLink]="linkFor(o.branch.slug)">
                    <fm-icon name="store" size="1rem" />
                    <span class="min-w-0 flex-1">
                        <span class="block truncate">{{ o.branch.name }}</span>
                        <span class="block text-xs text-fg-subtle">{{ roleLabel(o.role) }}</span>
                    </span>
                    @if (o.branch.oid === active()?.oid) {
                        <fm-icon name="check" size="1rem" />
                    }
                </a>
            }
        </fm-menu>
    `
})
export class BranchSwitcherComponent {
    private readonly _auth = inject(AuthService);
    private readonly _router = inject(Router);

    protected readonly active = inject(BranchContextService).active;
    protected readonly options = computed(() => this._auth.user()?.assignments.filter(a => a.branch.kind === 'BRANCH') ?? []);
    protected readonly hq = computed(() => this._auth.user()?.assignments.find(a => a.branch.kind === 'HQ') ?? null);
    protected readonly label = computed(() => {
        const b = this.active();
        return !b ? 'Choose branch' : b.kind === 'HQ' ? 'HQ overview' : b.name;
    });

    protected roleLabel(role: keyof typeof STAFF_ROLE_LABELS): string {
        return STAFF_ROLE_LABELS[role];
    }

    /** Same section at another branch; ids are dropped (they belong to the old branch). */
    protected linkFor(slug: string): string[] {
        const parts = this._router.url.split('?')[0].split('/').filter(Boolean);
        const section = parts[0] === 'console' ? (parts[2] ?? 'dashboard') : 'dashboard';
        return ['/console', slug, section];
    }
}
