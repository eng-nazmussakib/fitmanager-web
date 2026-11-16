import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
    lucideCircleCheck,
    lucideEye,
    lucideEyeOff,
    lucideLoaderCircle,
    lucideLock,
    lucideMail,
    lucideMapPin,
    lucidePhone,
    lucideUser
} from '@ng-icons/lucide';
import { finalize } from 'rxjs';

import { APP } from '@core/constants/app.constants';
import { ignoreHandledApiError } from '@core/http/api-error';
import { revealErrors } from '@core/utils/form.utils';
import { planQuote, PublicSiteService } from '@features/public/public-site.service';
import { AuthShellComponent } from '@layout/auth-shell/auth-shell.component';
import { ErrorMessagePipe } from '@shared/pipes/error-message.pipe';
import { TakaPipe } from '@shared/pipes/taka.pipe';
import { AppValidators } from '@shared/validators/app.validators';

import { JoinRequestService } from './join-request.service';

type Field = 'fullName' | 'phone' | 'email' | 'branch' | 'plan' | 'password' | 'confirm' | 'agree';

/**
 * `/auth/sign-up?plan=…&period=…`: a visitor creates an account and asks to join a branch on a plan.
 * Branches, plans, periods and prices come from the brand config. "Choose This Plan" on the landing page fills in the
 * plan and period. Payment is taken at the front desk, which activates the membership.
 */
@Component({
    selector: 'app-sign-up',
    imports: [ReactiveFormsModule, RouterLink, NgIcon, ErrorMessagePipe, TakaPipe, AuthShellComponent],
    viewProviders: [
        provideIcons({ lucideCircleCheck, lucideEye, lucideEyeOff, lucideLoaderCircle, lucideLock, lucideMail, lucideMapPin, lucidePhone, lucideUser })
    ],
    templateUrl: './sign-up.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SignUpComponent implements OnInit {
    private readonly _site = inject(PublicSiteService);
    private readonly _join = inject(JoinRequestService);
    private readonly _destroyRef = inject(DestroyRef);

    protected readonly c = this._site.c;
    protected readonly brandName = this._site.brand;
    protected readonly branches = this.c.branches.items;
    protected readonly plans = this._site.plans;
    protected readonly periods = this.c.plans.periods;
    protected readonly loginRoute = APP.LOGIN_ROUTE;

    /** `?plan=` and `?period=` (from "Choose This Plan"), `?branch=` (from a branch card's "Join"). */
    readonly plan = input<string>();
    readonly branch = input<string>();
    readonly period = input<string>();

    protected readonly loading = signal(false);
    protected readonly submitted = signal(false);
    protected readonly showPassword = signal(false);
    /** The sent request, which switches the page to its confirmation. */
    protected readonly done = signal<{ id: string; name: string; branch: string } | null>(null);

    protected readonly form = inject(NonNullableFormBuilder).group(
        {
            fullName: ['', [Validators.required, Validators.minLength(3)]],
            phone: ['', [Validators.required, AppValidators.bdMobile]],
            email: ['', [Validators.email]],
            // One branch: chosen for the visitor, and the field is hidden.
            branch: [this.branches.length === 1 ? this.branches[0].name : '', [Validators.required]],
            // One plan: chosen for the visitor, and the field is hidden.
            plan: [this.plans.length === 1 ? this.plans[0].id : '', [Validators.required]],
            period: [this.periods[0]?.id ?? '', [Validators.required]],
            password: ['', [Validators.required, AppValidators.strongPassword]],
            confirm: ['', [Validators.required]],
            agree: [false, [Validators.requiredTrue]]
        },
        { validators: AppValidators.match('password', 'confirm') }
    );

    private readonly _value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
    /** Price of the chosen plan and period, for the summary. */
    protected readonly summary = computed(() => {
        const v = this._value();
        const plan = this.plans.find(p => p.id === v.plan);
        const period = this.periods.find(p => p.id === v.period);
        if (!plan || !period) return null;
        const quote = planQuote(plan, period, this.periods);
        return quote ? { plan, period, quote, branch: v.branch } : null;
    });

    ngOnInit(): void {
        const plan = this.plans.find(p => p.id === this.plan());
        const period = this.periods.find(p => p.id === this.period());
        const branch = this.branches.find(b => b.name === this.branch());
        this.form.patchValue({ ...(plan ? { plan: plan.id } : {}), ...(period ? { period: period.id } : {}), ...(branch ? { branch: branch.name } : {}) });
    }

    /** Whether a plan is sold for a period. */
    protected sold(planId: string, periodId: string): boolean {
        return this.plans.find(p => p.id === planId)?.prices[periodId] !== undefined;
    }

    /** Under a period: the chosen plan's price for it, or "Not offered", or nothing before a plan is chosen. */
    protected periodNote(periodId: string): string {
        const plan = this.plans.find(p => p.id === this._value().plan);
        if (!plan) return '';
        const price = plan.prices[periodId];
        return price === undefined ? 'Not offered' : `${this.c.currency.symbol}${price.toLocaleString('en-IN')}`;
    }

    protected showError(name: Field): boolean {
        const control = this.form.controls[name];
        return control.invalid && (control.touched || this.submitted());
    }

    protected mismatch(): boolean {
        const confirm = this.form.controls.confirm;
        return this.form.hasError('mismatch') && (confirm.touched || this.submitted());
    }

    protected submit(): void {
        this.submitted.set(true);
        if (this.form.invalid) {
            revealErrors(this.form);
            return;
        }
        const v = this.form.getRawValue();
        const rest = { fullName: v.fullName, phone: v.phone, branch: v.branch, plan: v.plan, period: v.period, password: v.password };
        this.loading.set(true);
        this._join
            .send({ ...rest, email: v.email || undefined })
            .pipe(
                finalize(() => this.loading.set(false)),
                takeUntilDestroyed(this._destroyRef)
            )
            .subscribe({ next: req => this.done.set({ id: req.id, name: rest.fullName.split(' ')[0], branch: rest.branch }), error: ignoreHandledApiError });
    }
}
