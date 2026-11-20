import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { AuthService } from '@core/auth/auth.service';
import { ApiService } from '@core/http/api.service';
import { MAX_FREEZE_DAYS, MAX_VAT_RATE, type OrgSettings, type OrgSettingsUpdate, vatPercent } from '@core/models/settings.model';
import { revealErrors } from '@core/utils/form.utils';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';
import { TakaPipe } from '@shared/pipes/taka.pipe';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { AlertComponent, CardComponent, CardFooterDirective, SkeletonComponent } from '@shared/ui/display/display';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { NumberInputComponent } from '@shared/ui/forms/number-input.component';
import { SwitchComponent } from '@shared/ui/forms/switch.component';

import { SiteGroupsCardComponent } from './site-groups-card.component';

/** A sample sale for the live preview: a ৳3,000 plan. */
const SAMPLE = 3000;

/**
 * `/hq/settings`: organisation-wide settings owned by HQ: VAT and its mode (D-037, D-057), the freeze rule (D-063, D-067 e)
 * and what the public site shows (D-040). The rate applies to every quote and
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
        SwitchComponent,
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
                    <fm-field class="mt-4 block" hint="Off: VAT is added on top of the price. On: the price already includes it.">
                        <fm-switch formControlName="vat_inclusive">Prices include VAT</fm-switch>
                    </fm-field>
                    <p class="mt-4 text-sm text-fg-muted" aria-live="polite">
                        @if (previewVat() > 0 && inclusive()) {
                            A {{ sample | taka: 0 }} plan costs {{ sample | taka: 0 }}, of which {{ previewVat() | taka: 0 }} is VAT.
                        } @else if (previewVat() > 0) {
                            A {{ sample | taka: 0 }} plan comes to {{ sample + previewVat() | taka: 0 }} ({{ previewVat() | taka: 0 }} VAT).
                        } @else {
                            No VAT is charged: a {{ sample | taka: 0 }} plan costs {{ sample | taka: 0 }}.
                        }
                    </p>
                    <fm-alert class="mt-4 block" tone="info">
                        A new rate applies to quotes and sales from the moment you save. Invoices already issued keep the rate printed on them.
                    </fm-alert>
                </fm-card>
                <fm-card subtitle="Every branch's timetable and the member portal follow these (D-081)." title="Class booking">
                    <div class="grid gap-4 sm:grid-cols-3">
                        <fm-field label="Opens, days ahead" required>
                            <fm-number-input formControlName="booking_open_days" [max]="60" [min]="1" />
                        </fm-field>
                        <fm-field label="Upcoming bookings per member" required>
                            <fm-number-input formControlName="booking_max_active" [max]="50" [min]="1" />
                        </fm-field>
                        <fm-field hint="Later counts as a missed class." label="Free cancel, hours before" required>
                            <fm-number-input formControlName="booking_cancel_hours" [max]="72" [min]="0" />
                        </fm-field>
                        <fm-field label="Missed classes that pause booking" required>
                            <fm-number-input formControlName="noshow_limit" [max]="20" [min]="1" />
                        </fm-field>
                        <fm-field label="Counted over, days" required>
                            <fm-number-input formControlName="noshow_window_days" [max]="365" [min]="1" />
                        </fm-field>
                        <fm-field label="Pause for, days" required>
                            <fm-number-input formControlName="noshow_block_days" [max]="90" [min]="1" />
                        </fm-field>
                    </div>
                    <p class="mt-3 text-sm text-fg-muted">
                        A late cancel or a no-show is a missed class. The same window applies to PT sessions a member cancels.
                    </p>
                </fm-card>
                <fm-card subtitle="Which plans may freeze is set on each plan template." title="Freezes">
                    <div class="grid gap-4 sm:grid-cols-3">
                        <fm-field label="Shortest (days)" required>
                            <fm-number-input formControlName="freeze_min_days" [max]="maxFreeze" [min]="1" />
                        </fm-field>
                        <fm-field label="Longest (days)" required>
                            <fm-number-input formControlName="freeze_max_days" [max]="maxFreeze" [min]="1" />
                        </fm-field>
                        <fm-field hint="0 turns freezes off." label="Freezes per plan" required>
                            <fm-number-input formControlName="freeze_max_count" [max]="12" [min]="0" />
                        </fm-field>
                    </div>
                    @if (rangeError()) {
                        <p class="mt-3 text-sm text-danger" role="alert">The shortest freeze must not be longer than the longest.</p>
                    }
                    <p class="mt-3 text-sm text-fg-muted">The frozen days are added to the end of the plan.</p>
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
        vat_bin: ['', Validators.pattern(/^[0-9-]{9,20}$/)],
        vat_inclusive: [false],
        freeze_min_days: [7, [Validators.required, Validators.min(1), Validators.max(MAX_FREEZE_DAYS)]],
        freeze_max_days: [60, [Validators.required, Validators.min(1), Validators.max(MAX_FREEZE_DAYS)]],
        freeze_max_count: [2, [Validators.required, Validators.min(0), Validators.max(12)]],
        booking_open_days: [7, [Validators.required, Validators.min(1), Validators.max(60)]],
        booking_max_active: [4, [Validators.required, Validators.min(1), Validators.max(50)]],
        booking_cancel_hours: [2, [Validators.required, Validators.min(0), Validators.max(72)]],
        noshow_limit: [3, [Validators.required, Validators.min(1), Validators.max(20)]],
        noshow_window_days: [30, [Validators.required, Validators.min(1), Validators.max(365)]],
        noshow_block_days: [7, [Validators.required, Validators.min(1), Validators.max(90)]]
    });
    protected readonly maxFreeze = MAX_FREEZE_DAYS;
    private readonly _value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
    protected readonly inclusive = computed(() => !!this._value().vat_inclusive);
    protected readonly rangeError = computed(() => Number(this._value().freeze_min_days) > Number(this._value().freeze_max_days));

    private readonly _percent = toSignal(this.form.controls.vat_percent.valueChanges, { initialValue: 0 });
    /** The same rounding as pricing: inclusive takes the VAT out of the price, exclusive adds it. */
    protected readonly previewVat = computed(() => {
        const rate = (Number(this._percent()) || 0) / 100;
        return Math.round(this.inclusive() ? (SAMPLE * rate) / (1 + rate) : SAMPLE * rate);
    });

    constructor() {
        if (!this.canEdit) this.form.disable();
        effect(() => {
            const s = this.settings.value();
            if (s) this.reset(s);
        });
    }

    protected reset(s: OrgSettings): void {
        this.form.reset({
            vat_percent: Number(vatPercent(s.vat_rate)),
            vat_bin: s.vat_bin ?? '',
            vat_inclusive: s.vat_inclusive,
            freeze_min_days: s.freeze_min_days,
            freeze_max_days: s.freeze_max_days,
            freeze_max_count: s.freeze_max_count,
            booking_open_days: s.booking_open_days,
            booking_max_active: s.booking_max_active,
            booking_cancel_hours: s.booking_cancel_hours,
            noshow_limit: s.noshow_limit,
            noshow_window_days: s.noshow_window_days,
            noshow_block_days: s.noshow_block_days
        });
    }

    protected save(): void {
        if (this.form.invalid || this.rangeError()) {
            revealErrors(this.form);
            return;
        }
        const v = this.form.getRawValue();
        const body: OrgSettingsUpdate = {
            vat_rate: Math.round(Number(v.vat_percent) * 100) / 10000,
            vat_bin: v.vat_bin.trim() || null,
            vat_inclusive: v.vat_inclusive,
            freeze_min_days: Number(v.freeze_min_days),
            freeze_max_days: Number(v.freeze_max_days),
            freeze_max_count: Number(v.freeze_max_count),
            booking_open_days: Number(v.booking_open_days),
            booking_max_active: Number(v.booking_max_active),
            booking_cancel_hours: Number(v.booking_cancel_hours),
            noshow_limit: Number(v.noshow_limit),
            noshow_window_days: Number(v.noshow_window_days),
            noshow_block_days: Number(v.noshow_block_days)
        };
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
