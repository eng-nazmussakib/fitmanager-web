import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import type { Observable } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { ApiService } from '@core/http/api.service';
import type { Plan, PlanTemplate } from '@core/models/plan.model';
import { DashboardService } from '@features/dashboard/dashboard.service';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { TakaPipe } from '@shared/pipes/taka.pipe';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { BadgeComponent, CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { DatePickerComponent } from '@shared/ui/forms/date-picker.component';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { NumberInputComponent } from '@shared/ui/forms/number-input.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';
import { SwitchComponent } from '@shared/ui/forms/switch.component';

/** `GET /v1/hq/promos`. */
export interface PromoCode {
    code: string;
    label: string;
    percent: number | null;
    amount: number | null;
    waive_admission: boolean;
    valid_from: string;
    valid_to: string;
    active: boolean;
}

type Effect = 'percent' | 'amount' | 'waive';

/**
 * `/hq/plans`: HQ's price list (only HQ changes prices). Templates (tier × period, `freezable`), each
 * branch's price and admission fee for them, and promo codes. Every save is audited at HQ.
 */
@Component({
    selector: 'app-hq-plans-page',
    imports: [
        FormsModule,
        PageHeaderComponent,
        TakaPipe,
        ButtonComponent,
        BadgeComponent,
        CardComponent,
        SkeletonComponent,
        DatePickerComponent,
        FieldComponent,
        InputDirective,
        NumberInputComponent,
        SelectComponent,
        SwitchComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <app-page-header subtitle="HQ sets every branch's prices. Changes apply to new sales; sold memberships keep their price." title="Plans and prices" />

        <fm-card class="mb-5 block" flush subtitle="A template is a tier and a period. Switching one off stops it at every branch." title="Plan templates">
            @if (templates.value(); as list) {
                <div class="overflow-x-auto">
                    <table class="fm-table">
                        <caption class="fm-sr-only">Plan templates</caption>
                        <thead>
                            <tr>
                                <th scope="col">Plan</th>
                                <th class="fm-num" scope="col">Persons</th>
                                <th class="fm-num" scope="col">Base price</th>
                                <th class="fm-num" scope="col">Branches</th>
                                <th scope="col">Can freeze</th>
                                <th scope="col">On sale</th>
                            </tr>
                        </thead>
                        <tbody>
                            @for (t of list; track t.oid) {
                                <tr>
                                    <td class="font-medium">{{ t.tier_name }} · {{ t.period_label }}</td>
                                    <td class="fm-num">{{ t.persons }}</td>
                                    <td class="fm-num">{{ t.base_price | taka: 0 }}</td>
                                    <td class="fm-num">{{ t.branches_using }}</td>
                                    <td>
                                        <fm-switch
                                            [disabled]="!canEditTemplates"
                                            [ngModel]="t.freezable"
                                            (ngModelChange)="saveTemplate(t, { freezable: $event })"
                                        >
                                            <span class="fm-sr-only">{{ t.tier_name }} {{ t.period_label }} can freeze</span>
                                        </fm-switch>
                                    </td>
                                    <td>
                                        <fm-switch [disabled]="!canEditTemplates" [ngModel]="t.active" (ngModelChange)="saveTemplate(t, { active: $event })">
                                            <span class="fm-sr-only">{{ t.tier_name }} {{ t.period_label }} on sale</span>
                                        </fm-switch>
                                    </td>
                                </tr>
                            }
                        </tbody>
                    </table>
                </div>
            } @else {
                <fm-skeleton height="10rem" />
            }
        </fm-card>

        <fm-card class="mb-5 block" flush subtitle="The price and admission fee each branch charges." title="Branch prices">
            <div class="max-w-xs px-4 pb-3" fmCardActions>
                <fm-select
                    ariaLabel="Branch"
                    placeholder="Choose a branch"
                    [ngModel]="branchOid()"
                    [options]="branchOptions()"
                    (ngModelChange)="branchOid.set($event)"
                />
            </div>
            @if (plans.value(); as list) {
                <div class="overflow-x-auto">
                    <table class="fm-table">
                        <caption class="fm-sr-only">Prices at the chosen branch</caption>
                        <thead>
                            <tr>
                                <th scope="col">Plan</th>
                                <th scope="col">Code</th>
                                <th class="fm-num" scope="col">Price</th>
                                <th class="fm-num" scope="col">Admission</th>
                                <th scope="col">On sale</th>
                                <th scope="col"><span class="fm-sr-only">Save</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            @for (p of list; track p.oid) {
                                <tr>
                                    <td class="font-medium">
                                        {{ p.name }}
                                        @if (!p.template_active) {
                                            <fm-badge class="ms-2" tone="warning">Template off</fm-badge>
                                        }
                                    </td>
                                    <td class="text-fg-subtle">{{ p.code }}</td>
                                    <td class="fm-num">
                                        <fm-number-input
                                            alignEnd
                                            taka
                                            [disabled]="!canEditPlans"
                                            [min]="0"
                                            [ngModel]="draft(p).price"
                                            (ngModelChange)="edit(p, 'price', $event)"
                                        />
                                    </td>
                                    <td class="fm-num">
                                        <fm-number-input
                                            alignEnd
                                            taka
                                            [disabled]="!canEditPlans"
                                            [min]="0"
                                            [ngModel]="draft(p).admission_fee"
                                            (ngModelChange)="edit(p, 'admission_fee', $event)"
                                        />
                                    </td>
                                    <td>
                                        <fm-switch [disabled]="!canEditPlans" [ngModel]="p.active" (ngModelChange)="savePlan(p, { active: $event })">
                                            <span class="fm-sr-only">{{ p.name }} on sale</span>
                                        </fm-switch>
                                    </td>
                                    <td>
                                        @if (changed(p)) {
                                            <button fmButton size="sm" variant="primary" [loading]="saving() === p.oid" (click)="savePlan(p, draft(p))">
                                                Save
                                            </button>
                                        }
                                    </td>
                                </tr>
                            }
                        </tbody>
                    </table>
                </div>
            } @else if (branchOid()) {
                <fm-skeleton height="10rem" />
            }
        </fm-card>

        <fm-card flush subtitle="Each code does one thing: a percent off, an amount off, or no admission fee." title="Promo codes">
            @if (promos.value(); as list) {
                <div class="overflow-x-auto">
                    <table class="fm-table">
                        <caption class="fm-sr-only">Promo codes</caption>
                        <thead>
                            <tr>
                                <th scope="col">Code</th>
                                <th scope="col">Offer</th>
                                <th scope="col">Valid</th>
                                <th scope="col">Active</th>
                            </tr>
                        </thead>
                        <tbody>
                            @for (p of list; track p.code) {
                                <tr>
                                    <td class="font-medium">{{ p.code }}</td>
                                    <td>
                                        {{ p.label }}
                                        <span class="text-fg-subtle">· {{ effectText(p) }}</span>
                                    </td>
                                    <td>{{ p.valid_from }} to {{ p.valid_to }}</td>
                                    <td>
                                        <fm-switch [disabled]="!canEditTemplates" [ngModel]="p.active" (ngModelChange)="savePromo(p.code, { active: $event })">
                                            <span class="fm-sr-only">{{ p.code }} active</span>
                                        </fm-switch>
                                    </td>
                                </tr>
                            }
                        </tbody>
                    </table>
                </div>
            }
            @if (canEditTemplates) {
                <form class="grid gap-4 border-t border-border p-4 sm:grid-cols-3" (ngSubmit)="createPromo()">
                    <fm-field label="Code" required>
                        <input name="code" fmInput maxlength="20" placeholder="EID20" [(ngModel)]="newCode" />
                    </fm-field>
                    <fm-field class="sm:col-span-2" label="Label" required>
                        <input name="label" fmInput maxlength="80" placeholder="Eid offer: 20% off" [(ngModel)]="newLabel" />
                    </fm-field>
                    <fm-field label="Offer">
                        <fm-select name="effect" ariaLabel="Offer" [options]="effectOptions" [(ngModel)]="newEffect" />
                    </fm-field>
                    @if (newEffect !== 'waive') {
                        <fm-field required [label]="newEffect === 'percent' ? 'Percent off' : 'Taka off'">
                            <fm-number-input name="value" [min]="1" [taka]="newEffect === 'amount'" [(ngModel)]="newValue" />
                        </fm-field>
                    } @else {
                        <div></div>
                    }
                    <div></div>
                    <fm-field label="From" required>
                        <fm-date-picker name="from" [(ngModel)]="newFrom" />
                    </fm-field>
                    <fm-field label="To" required>
                        <fm-date-picker name="to" [(ngModel)]="newTo" />
                    </fm-field>
                    <div class="flex items-end">
                        <button
                            type="submit"
                            fmButton
                            variant="primary"
                            [disabled]="!newCode.trim() || !newLabel.trim() || !newFrom || !newTo"
                            [loading]="saving() === 'promo'"
                        >
                            Add code
                        </button>
                    </div>
                </form>
            }
        </fm-card>
    `
})
export class HqPlansPageComponent {
    private readonly _api = inject(ApiService);
    private readonly _auth = inject(AuthService);
    private readonly _dashboard = inject(DashboardService);

    protected readonly canEditTemplates = this._auth.can('update', 'PlanTemplate');
    protected readonly canEditPlans = this._auth.can('update', 'Plan');
    protected readonly saving = signal<string | null>(null);

    protected readonly templates = rxResource({ stream: () => this._api.get<PlanTemplate[]>('/v1/hq/plan-templates') });
    protected readonly promos = rxResource({ stream: () => this._api.get<PromoCode[]>('/v1/hq/promos') });
    private readonly _branches = rxResource({ stream: () => this._dashboard.branches() });
    protected readonly branchOptions = computed<SelectOption<string>[]>(() =>
        (this._branches.value() ?? []).filter(b => b.kind === 'BRANCH').map(b => ({ value: b.oid, label: b.name }))
    );
    protected readonly branchOid = signal<string | null>(null);
    protected readonly plans = rxResource({
        params: () => this.branchOid() ?? undefined,
        stream: ({ params }) => this._api.get<Plan[]>('/v1/hq/plans', { branch_oid: params })
    });

    /** Unsaved price edits, by plan. */
    private readonly _drafts = signal<Record<string, { price: number; admission_fee: number }>>({});

    protected readonly effectOptions: SelectOption<Effect>[] = [
        { value: 'percent', label: 'Percent off the plan' },
        { value: 'amount', label: 'Taka off' },
        { value: 'waive', label: 'No admission fee' }
    ];
    protected newCode = '';
    protected newLabel = '';
    protected newEffect: Effect = 'percent';
    protected newValue: number | null = 10;
    protected newFrom: string | null = null;
    protected newTo: string | null = null;

    protected draft(p: Plan): { price: number; admission_fee: number } {
        return this._drafts()[p.oid] ?? { price: p.price, admission_fee: p.admission_fee };
    }

    protected changed(p: Plan): boolean {
        const d = this._drafts()[p.oid];
        return !!d && (d.price !== p.price || d.admission_fee !== p.admission_fee);
    }

    protected edit(p: Plan, key: 'price' | 'admission_fee', value: number | null): void {
        this._drafts.update(all => ({ ...all, [p.oid]: { ...this.draft(p), [key]: value ?? 0 } }));
    }

    protected effectText(p: PromoCode): string {
        if (p.percent !== null) return `${p.percent}% off`;
        if (p.amount !== null) return `৳${p.amount.toLocaleString('en-IN')} off`;
        return 'no admission fee';
    }

    protected saveTemplate(t: PlanTemplate, patch: Partial<Pick<PlanTemplate, 'active' | 'freezable'>>): void {
        this._run(t.oid, this._api.patch<PlanTemplate>(`/v1/hq/plan-templates/${t.oid}`, patch), () => {
            this.templates.reload();
            this.plans.reload();
        });
    }

    protected savePlan(p: Plan, patch: Partial<Pick<Plan, 'price' | 'admission_fee' | 'active'>>): void {
        this._run(p.oid, this._api.patch<Plan>(`/v1/hq/plans/${p.oid}`, patch), () => {
            this._drafts.update(({ [p.oid]: _gone, ...rest }) => rest);
            this.plans.reload();
            this.templates.reload();
        });
    }

    protected savePromo(code: string, patch: Partial<PromoCode>): void {
        this._run(code, this._api.patch<PromoCode>(`/v1/hq/promos/${code}`, patch), () => this.promos.reload());
    }

    protected createPromo(): void {
        const effect =
            this.newEffect === 'waive'
                ? { waive_admission: true }
                : this.newEffect === 'percent'
                  ? { percent: this.newValue ?? 0 }
                  : { amount: this.newValue ?? 0 };
        const body = { code: this.newCode.trim().toUpperCase(), label: this.newLabel.trim(), ...effect, valid_from: this.newFrom, valid_to: this.newTo };
        this._run('promo', this._api.post<PromoCode>('/v1/hq/promos', body), () => {
            this.newCode = '';
            this.newLabel = '';
            this.promos.reload();
        });
    }

    private _run(key: string, call: Observable<unknown>, done: () => void): void {
        this.saving.set(key);
        call.subscribe({
            next: () => {
                this.saving.set(null);
                done();
            },
            // The interceptor shows the error; reload so a switch flips back to what is stored.
            error: () => {
                this.saving.set(null);
                this.templates.reload();
                this.plans.reload();
                this.promos.reload();
            }
        });
    }
}
