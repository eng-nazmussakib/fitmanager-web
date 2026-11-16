import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { AuthService } from '@core/auth/auth.service';
import { ApiService } from '@core/http/api.service';
import { MAX_VAT_RATE, type OrgSettings, type OrgSettingsUpdate, vatPercent } from '@core/models/settings.model';
import { revealErrors } from '@core/utils/form.utils';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';
import { TakaPipe } from '@shared/pipes/taka.pipe';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { AlertComponent, CardComponent, CardFooterDirective, SkeletonComponent } from '@shared/ui/display/display';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { NumberInputComponent } from '@shared/ui/forms/number-input.component';

import { SiteGroupsCardComponent } from './site-groups-card.component';

/** A sample sale for the live preview: a ৳3,000 plan. */
const SAMPLE = 3000;

/**
 * `/hq/settings`: organisation-wide settings owned by HQ: VAT (D-037) and what the public site shows (D-040). The rate applies to every quote and
 * sale from the moment it is saved; invoices already issued keep the rate they carry.
 */
@Component({
    selector: 'app-hq-settings-page',
    imports: [
        ReactiveFormsModule,
        PageHeaderComponent,
        AppDatePipe,
        TakaPipe,
        ButtonComponent,
        AlertComponent,
        CardComponent,
        CardFooterDirective,
        SkeletonComponent,
        FieldComponent,
        InputDirective,
        NumberInputComponent,
        SiteGroupsCardComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <app-page-header subtitle="Settings that apply to every branch." title="Settings" />
        @if (settings.value(); as s) {
            <form class="grid max-w-2xl gap-5" novalidate [formGroup]="form" (ngSubmit)="save()">
                <fm-card subtitle="Charged on memberships and admission fees, after any discount." title="VAT">
                    <div class="grid gap-4 sm:grid-cols-2">
                        <fm-field hint="0 if the gym is not VAT-registered." label="VAT rate (%)" required>
                            <fm-number-input formControlName="vat_percent" [max]="maxPercent" [min]="0" />
                        </fm-field>
                        <fm-field hint="Printed on invoices. Leave empty if not registered." label="VAT BIN">
                            <input autocomplete="off" fmInput formControlName="vat_bin" inputmode="numeric" placeholder="000000000-0000" />
                        </fm-field>
                    </div>
                    <p class="mt-4 text-sm text-fg-muted" aria-live="polite">
                        @if (previewVat() > 0) {
                            A {{ sample | taka: 0 }} plan comes to {{ sample + previewVat() | taka: 0 }} ({{ previewVat() | taka: 0 }} VAT).
                        } @else {
                            No VAT is charged: a {{ sample | taka: 0 }} plan costs {{ sample | taka: 0 }}.
                        }
                    </p>
                    <fm-alert class="mt-4 block" tone="info">
                        A new rate applies to quotes and sales from the moment you save. Invoices already issued keep the rate printed on them.
                    </fm-alert>
                    @if (s.updated_at) {
                        <p class="mt-3 text-xs text-fg-subtle">Last changed by {{ s.updated_by }} on {{ s.updated_at | appDate: 'dd MMM yyyy, h:mm a' }}.</p>
                    }
                    @if (canEdit) {
                        <footer fmCardFooter>
                            <button type="button" fmButton [disabled]="form.pristine || saving()" (click)="reset(s)">Undo changes</button>
                            <button type="submit" fmButton variant="primary" [disabled]="form.pristine" [loading]="saving()">Save</button>
                        </footer>
                    }
                </fm-card>
            </form>
            <app-site-groups-card class="mt-5 block max-w-2xl" />
        } @else {
            <fm-skeleton class="max-w-2xl" height="16rem" />
        }
    `
})
export class HqSettingsPageComponent {
    private readonly _api = inject(ApiService);
    private readonly _fb = inject(NonNullableFormBuilder);

    protected readonly sample = SAMPLE;
    protected readonly maxPercent = MAX_VAT_RATE * 100;
    protected readonly canEdit = inject(AuthService).can('update', 'Settings');
    protected readonly saving = signal(false);
    protected readonly settings = rxResource({ stream: () => this._api.get<OrgSettings>('/v1/hq/settings') });

    protected readonly form = this._fb.group({
        vat_percent: [0, [Validators.required, Validators.min(0), Validators.max(this.maxPercent)]],
        vat_bin: ['', Validators.pattern(/^[0-9-]{9,20}$/)]
    });

    private readonly _percent = toSignal(this.form.controls.vat_percent.valueChanges, { initialValue: 0 });
    protected readonly previewVat = computed(() => Math.round((SAMPLE * (Number(this._percent()) || 0)) / 100));

    constructor() {
        if (!this.canEdit) this.form.disable();
        effect(() => {
            const s = this.settings.value();
            if (s) this.reset(s);
        });
    }

    protected reset(s: OrgSettings): void {
        this.form.reset({ vat_percent: Number(vatPercent(s.vat_rate)), vat_bin: s.vat_bin ?? '' });
    }

    protected save(): void {
        if (this.form.invalid) {
            revealErrors(this.form);
            return;
        }
        const v = this.form.getRawValue();
        const body: OrgSettingsUpdate = { vat_rate: Math.round(Number(v.vat_percent) * 100) / 10000, vat_bin: v.vat_bin.trim() || null };
        this.saving.set(true);
        this._api.patch<OrgSettings>('/v1/hq/settings', body).subscribe({
            next: s => {
                this.saving.set(false);
                this.settings.set(s);
            },
            error: () => this.saving.set(false)
        });
    }
}
