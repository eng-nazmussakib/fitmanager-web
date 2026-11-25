import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideEye, lucideEyeOff, lucideLoaderCircle, lucideLock, lucideUser } from '@ng-icons/lucide';
import { finalize } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { APP } from '@core/constants/app.constants';
import { ignoreHandledApiError } from '@core/http/api-error';
import { TenantService } from '@core/tenant/tenant.service';
import { revealErrors } from '@core/utils/form.utils';
import { environment } from '@env/environment';
import { DemoAccountsService } from '@features/demo/demo-accounts';
import { AuthShellComponent } from '@layout/auth-shell/auth-shell.component';
import { ErrorMessagePipe } from '@shared/pipes/error-message.pipe';

@Component({
    selector: 'app-sign-in',
    imports: [ReactiveFormsModule, RouterLink, NgIcon, ErrorMessagePipe, AuthShellComponent],
    viewProviders: [provideIcons({ lucideEye, lucideEyeOff, lucideLoaderCircle, lucideLock, lucideUser })],
    templateUrl: './sign-in.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SignInComponent {
    private readonly _auth = inject(AuthService);
    private readonly _router = inject(Router);
    private readonly _destroyRef = inject(DestroyRef);
    protected readonly loading = signal(false);
    /** Set on the first submit: from then on every invalid field shows its error. */
    protected readonly submitted = signal(false);
    protected readonly showPassword = signal(false);
    protected readonly forgotHint = signal(false);
    protected readonly brandName = inject(TenantService).name;
    /** There is a public sign-up page (only with a landing page). */
    protected readonly hasSignUp = !!inject(TenantService).config.landing;
    /** The mock API's demo accounts are listed only in mock builds. */
    protected readonly demo = environment.useMockApi;
    /** The hosted demo: a way in without an account, through the guest picker on /demo. */
    protected readonly guestAccess = !environment.useMockApi && environment.guestAccess;
    protected readonly demoAccounts = toSignal(inject(DemoAccountsService).accounts(), { initialValue: [] });

    /** Bound from `?returnUrl=` by withComponentInputBinding(). */
    readonly returnUrl = input<string>();

    /**
     * Typed reactive form: `form.getRawValue()` is `{ username: string; password: string }`, not `any`.
     * NonNullableFormBuilder makes `reset()` go back to '' instead of null.
     */
    protected readonly form = inject(NonNullableFormBuilder).group({
        username: ['', [Validators.required]],
        password: ['', [Validators.required, Validators.minLength(6)]]
    });

    /** A field shows its error once it was left (touched) or the form was submitted. */
    protected showError(name: 'username' | 'password'): boolean {
        const control = this.form.controls[name];
        return control.invalid && (control.touched || this.submitted());
    }

    protected submit(): void {
        this.submitted.set(true);
        if (this.form.invalid) {
            revealErrors(this.form);
            return;
        }
        this.loading.set(true);
        this._auth
            .login(this.form.getRawValue())
            .pipe(
                finalize(() => this.loading.set(false)),
                takeUntilDestroyed(this._destroyRef)
            )
            .subscribe({ next: () => void this._router.navigateByUrl(this._safeReturnUrl()), error: ignoreHandledApiError });
    }

    /** Only same-app paths. Never redirect to `?returnUrl=https://evil.example`. */
    private _safeReturnUrl(): string {
        const url = this.returnUrl();
        return url && url.startsWith('/') && !url.startsWith('//') ? url : APP.HOME_ROUTE;
    }
}
