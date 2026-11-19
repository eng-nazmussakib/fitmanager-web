import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { DashboardService } from '@features/dashboard/dashboard.service';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';
import { TakaPipe } from '@shared/pipes/taka.pipe';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { BadgeComponent, CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { IconComponent } from '@shared/ui/icon/icon.component';

/** `/hq/branches`: every branch (HQ is the `kind = 'HQ'` row, not listed), with a way into its console. */
@Component({
    selector: 'app-hq-branches-page',
    imports: [RouterLink, PageHeaderComponent, AppDatePipe, TakaPipe, ButtonComponent, BadgeComponent, CardComponent, SkeletonComponent, IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <app-page-header subtitle="Each branch is a tenant: its members, payments and check-ins stay separate." title="Branches" />
        @if (branches(); as list) {
            <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                @for (b of list; track b.oid) {
                    <fm-card [subtitle]="b.address ?? undefined" [title]="b.name">
                        <fm-badge fmCardActions>{{ b.code }}</fm-badge>
                        <dl class="grid grid-cols-2 gap-3 text-sm">
                            <div>
                                <dt class="text-fg-subtle">Opened</dt>
                                <dd>{{ b.opened_on | appDate: 'MMM yyyy' }}</dd>
                            </div>
                            <div>
                                <dt class="text-fg-subtle">Capacity</dt>
                                <dd>{{ b.capacity }} on the floor</dd>
                            </div>
                            <div>
                                <dt class="text-fg-subtle">Dues limit</dt>
                                <dd>{{ b.dues_limit | taka: 0 }}</dd>
                            </div>
                            <div>
                                <dt class="text-fg-subtle">Phone</dt>
                                <dd>{{ b.phone }}</dd>
                            </div>
                        </dl>
                        <p class="mt-3 text-xs text-fg-subtle">{{ b.facilities.join(' · ') }}</p>
                        <div class="mt-4 flex flex-wrap gap-2">
                            <a fmButton size="sm" variant="primary" [routerLink]="['/console', b.slug, 'dashboard']">
                                <fm-icon name="store" size="1rem" />
                                Open console
                            </a>
                            <a fmButton size="sm" variant="ghost" [routerLink]="['/branches', b.slug]">Public page</a>
                        </div>
                    </fm-card>
                }
            </div>
        } @else {
            <fm-skeleton height="12rem" />
        }
    `
})
export class HqBranchesPageComponent {
    private readonly _service = inject(DashboardService);
    private readonly _data = rxResource({ stream: () => this._service.branches() });

    protected readonly branches = computed(() => this._data.value()?.filter(b => b.kind === 'BRANCH') ?? null);
}
