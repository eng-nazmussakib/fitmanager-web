import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';

import type { Plan } from '@core/models/plan.model';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { TakaPipe } from '@shared/pipes/taka.pipe';
import { BadgeComponent, CardComponent, SkeletonComponent } from '@shared/ui/display/display';

import { ConsoleService } from '../console.service';

/** The plans this branch sells: HQ templates at the branch's prices (only HQ edits plans). */
@Component({
    selector: 'app-branch-plans-page',
    imports: [PageHeaderComponent, TakaPipe, BadgeComponent, CardComponent, SkeletonComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <app-page-header subtitle="HQ plan templates at this branch's prices. Prices exclude VAT." title="Plans" />
        @if (tiers(); as tiers) {
            <div class="grid gap-4 lg:grid-cols-3">
                @for (t of tiers; track t.name) {
                    <fm-card [subtitle]="t.plans[0].persons === 1 ? '1 person' : t.plans[0].persons + ' persons'" [title]="t.name">
                        <dl class="grid gap-2 text-sm">
                            @for (p of t.plans; track p.oid) {
                                <div class="flex justify-between gap-3 border-b border-border pb-2">
                                    <dt class="text-fg-muted">{{ p.period_label }}</dt>
                                    <dd class="font-semibold tabular-nums">{{ p.price | taka: 0 }}</dd>
                                </div>
                            }
                        </dl>
                        <p class="mt-3 text-xs text-fg-subtle">
                            Admission fee {{ t.plans[0].admission_fee | taka: 0 }} · code {{ t.plans[0].code.split('-').slice(0, 2).join('-') }}
                        </p>
                        @if (t.plans[0].featured) {
                            <fm-badge class="mt-2" tone="primary">Featured on the website</fm-badge>
                        }
                    </fm-card>
                }
            </div>
        } @else {
            <fm-skeleton height="12rem" />
        }
    `
})
export class BranchPlansPageComponent {
    private readonly _service = inject(ConsoleService);
    private readonly _plans = rxResource({ stream: () => this._service.plans() });

    protected readonly tiers = computed(() => {
        const plans = this._plans.value();
        if (!plans) return null;
        const map = new Map<string, Plan[]>();
        for (const p of plans) (map.get(p.tier_name) ?? map.set(p.tier_name, []).get(p.tier_name)!).push(p);
        return [...map].map(([name, list]) => ({ name, plans: list }));
    });
}
