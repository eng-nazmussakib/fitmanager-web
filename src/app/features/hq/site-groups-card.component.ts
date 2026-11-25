import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';

import { AuthService } from '@core/auth/auth.service';
import { ApiService } from '@core/http/api.service';
import type { SiteGroup, SiteGroupUpdate } from '@core/models/settings.model';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';
import { BadgeComponent, CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { SwitchComponent } from '@shared/ui/forms/switch.component';

/**
 * HQ settings: what the public site shows. One row per group, with a switch for its section on the home
 * page and one for its own page, where it has them: blog `{ section: off, page: on }` keeps /blog but drops it
 * from the home page. Required groups (home, programs, membership, facilities) have locked switches; the API and
 * the database refuse to switch them off anyway. Each switch saves at once.
 */
@Component({
    selector: 'app-site-groups-card',
    imports: [FormsModule, AppDatePipe, BadgeComponent, CardComponent, SkeletonComponent, SwitchComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <fm-card
            subtitle="Show or hide each part of the public site: its section on the home page and its own page. Required parts always show."
            title="Website"
        >
            @if (groups.value(); as list) {
                <!-- One grid for the whole list, rows on a subgrid, so the switches line up in columns from row to row. -->
                <ul class="divide-y divide-border sm:grid sm:grid-cols-[1fr_auto_auto] sm:gap-x-6" aria-label="Website sections and pages">
                    @for (g of list; track g.key) {
                        <li class="grid gap-2 py-3 sm:col-span-3 sm:grid-cols-subgrid sm:items-center" [attr.aria-label]="g.name">
                            <div>
                                <p class="flex items-center gap-2 font-medium">
                                    {{ g.name }}
                                    @if (g.required) {
                                        <fm-badge>Required</fm-badge>
                                    }
                                </p>
                                @if (g.updated_at && !g.required) {
                                    <p class="text-xs text-fg-subtle">Changed by {{ g.updated_by_name }}, {{ g.updated_at | appDate: 'dd MMM' }}</p>
                                }
                            </div>
                            @if (g.section !== null) {
                                <fm-switch
                                    [disabled]="g.required || !canEdit || busy() === g.key"
                                    [ngModel]="g.section"
                                    (ngModelChange)="save(g, { section: $event })"
                                >
                                    Home page section
                                </fm-switch>
                            } @else {
                                <span class="text-sm text-fg-subtle">No home page section</span>
                            }
                            @if (g.page !== null) {
                                <fm-switch
                                    [disabled]="g.required || !canEdit || busy() === g.key"
                                    [ngModel]="g.page"
                                    (ngModelChange)="save(g, { page: $event })"
                                >
                                    Page {{ g.page_path }}
                                </fm-switch>
                            } @else {
                                <span class="text-sm text-fg-subtle">No page of its own</span>
                            }
                        </li>
                    }
                </ul>
                <p class="mt-3 text-xs text-fg-subtle">
                    The site picks up a change within a minute. A hidden page sends visitors to its home page section, or to the top of the home page. On the
                    static (Cloudflare) site, pages built before the change still exist until the next build, but the browser applies the change as it loads.
                </p>
            } @else {
                <fm-skeleton height="16rem" />
            }
        </fm-card>
    `
})
export class SiteGroupsCardComponent {
    private readonly _api = inject(ApiService);

    protected readonly canEdit = inject(AuthService).can('update', 'Settings');
    protected readonly busy = signal<string | null>(null);
    protected readonly groups = rxResource({ stream: () => this._api.get<SiteGroup[]>('/v1/hq/site-groups') });

    protected save(group: SiteGroup, patch: SiteGroupUpdate): void {
        if (group.required || ((patch.section ?? group.section) === group.section && (patch.page ?? group.page) === group.page)) return;
        this.busy.set(group.key);
        // Success or refusal: reload, so every switch shows what is really saved.
        const done = (): void => {
            this.busy.set(null);
            this.groups.reload();
        };
        this._api.patch<SiteGroup>(`/v1/hq/site-groups/${group.key}`, patch).subscribe({ next: done, error: done });
    }
}
