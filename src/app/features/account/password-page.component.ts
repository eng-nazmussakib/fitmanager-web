import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { API } from '@core/constants/api-endpoints';
import { APP } from '@core/constants/app.constants';
import { ApiService } from '@core/http/api.service';
import { ignoreHandledApiError } from '@core/http/api-error';
import type { UserSession } from '@core/models/staff.model';
import { revealErrors } from '@core/utils/form.utils';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { AlertComponent, BadgeComponent, CardComponent, CardFooterDirective, SkeletonComponent } from '@shared/ui/display/display';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';

/** The API's rule (`src/auth/password-policy.ts`): 8–200 characters, a letter and a digit. */
function passwordRule(c: AbstractControl<string>): ValidationErrors | null {
    const v = c.value;
    if (!v) return null;
    if (v.length < 8) return { minlength: { requiredLength: 8 } };
    if (!/\p{L}/u.test(v) || !/\d/.test(v)) return { pattern: 'Include at least one letter and one digit' };
    return null;
}

/**
 * `/account/password`: change your own password, and see or end your sessions. While a temporary password is set
 * (D-054: a new account or an admin reset), every other page sends the user here, and the API refuses everything
 * else until it is changed.
 */
@Component({
    selector: 'app-password-page',
    imports: [
        ReactiveFormsModule,
        RouterLink,
        AppDatePipe,
        ButtonComponent,
        AlertComponent,
        BadgeComponent,
        CardComponent,
        CardFooterDirective,
        SkeletonComponent,
        FieldComponent,
        InputDirective
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <main class="grid min-h-dvh place-items-start justify-center bg-bg px-4 py-10 sm:place-items-center">
            <div class="grid w-full max-w-md gap-5">
                <form novalidate [formGroup]="form" (ngSubmit)="save()">
                    <fm-card
                        [subtitle]="forced() ? 'You signed in with a temporary password. Choose your own to continue.' : ''"
                        [title]="forced() ? 'Set your password' : 'Change password'"
                    >
                        <div class="grid gap-4">
                            <fm-field required [label]="forced() ? 'Temporary password' : 'Current password'">
                                <input type="password" autocomplete="current-password" fmInput formControlName="current" />
                            </fm-field>
                            <fm-field hint="At least 8 characters, with a letter and a digit." label="New password" required>
                                <input type="password" autocomplete="new-password" fmInput formControlName="next" />
                            </fm-field>
                            <fm-field label="Repeat the new password" required [error]="mismatch() ? 'The two passwords differ' : null">
                                <input type="password" autocomplete="new-password" fmInput formControlName="repeat" />
                            </fm-field>
                            <fm-alert tone="info">Changing it signs you out on every other device.</fm-alert>
                        </div>
                        <footer fmCardFooter>
                            @if (forced()) {
                                <button type="button" fmButton variant="ghost" (click)="auth.logout()">Sign out</button>
                            } @else {
                                <a fmButton [routerLink]="home">Back</a>
                            }
                            <button type="submit" fmButton variant="primary" [loading]="saving()">Save password</button>
                        </footer>
                    </fm-card>
                </form>

                @if (!forced()) {
                    <fm-card subtitle="Where you are signed in. End a session you do not recognise." title="Your sessions">
                        @if (sessions.value(); as list) {
                            <ul class="grid gap-3">
                                @for (s of list; track s.id) {
                                    <li class="flex items-start justify-between gap-3 text-sm">
                                        <div class="min-w-0">
                                            <p class="truncate font-medium">{{ device(s.user_agent) }}</p>
                                            <p class="text-xs text-fg-subtle">
                                                Signed in {{ s.signed_in_at | appDate: 'dd MMM yyyy, h:mm a' }} · last active
                                                {{ s.last_used_at | appDate: 'dd MMM, h:mm a' }}
                                            </p>
                                        </div>
                                        @if (s.current) {
                                            <fm-badge tone="success">This device</fm-badge>
                                        } @else {
                                            <button fmButton size="sm" variant="ghost" (click)="end(s)">Sign out</button>
                                        }
                                    </li>
                                }
                            </ul>
                        } @else {
                            <fm-skeleton height="4rem" />
                        }
                    </fm-card>
                }
            </div>
        </main>
    `
})
export class PasswordPageComponent {
    protected readonly auth = inject(AuthService);
    private readonly _api = inject(ApiService);
    private readonly _router = inject(Router);

    /** Bound from `?returnUrl=`. */
    readonly returnUrl = input<string>();

    protected readonly home = APP.HOME_ROUTE;
    protected readonly saving = signal(false);
    protected readonly forced = computed(() => this.auth.user()?.must_change_password ?? false);
    protected readonly form = inject(NonNullableFormBuilder).group({
        current: ['', Validators.required],
        next: ['', [Validators.required, passwordRule]],
        repeat: ['', Validators.required]
    });
    protected readonly mismatch = signal(false);
    protected readonly sessions = rxResource({
        params: () => (this.forced() ? undefined : true),
        stream: () => this._api.get<UserSession[]>(API.AUTH.SESSIONS)
    });

    protected save(): void {
        const { current, next, repeat } = this.form.getRawValue();
        this.mismatch.set(!!repeat && next !== repeat);
        if (this.form.invalid || this.mismatch()) {
            revealErrors(this.form);
            return;
        }
        this.saving.set(true);
        this.auth
            .changePassword(current, next)
            .pipe(finalize(() => this.saving.set(false)))
            .subscribe({
                next: () => {
                    this.form.reset();
                    void this._router.navigateByUrl(this._safeReturnUrl());
                },
                error: ignoreHandledApiError
            });
    }

    protected end(s: UserSession): void {
        this._api.delete(`${API.AUTH.SESSIONS}/${s.id}`).subscribe({ next: () => this.sessions.reload(), error: ignoreHandledApiError });
    }

    /** A readable device name from the user agent. */
    protected device(ua: string | null): string {
        if (!ua) return 'Unknown device';
        const browser = ua.includes('Edg/')
            ? 'Edge'
            : ua.includes('Chrome/')
              ? 'Chrome'
              : ua.includes('Firefox/')
                ? 'Firefox'
                : ua.includes('Safari/')
                  ? 'Safari'
                  : null;
        const os = ua.includes('Android')
            ? 'Android'
            : /iPhone|iPad/.test(ua)
              ? 'iOS'
              : ua.includes('Windows')
                ? 'Windows'
                : ua.includes('Mac OS X')
                  ? 'macOS'
                  : ua.includes('Linux')
                    ? 'Linux'
                    : null;
        return browser && os ? `${browser} on ${os}` : ua.slice(0, 60);
    }

    /** Only same-app paths, and never back to this page. */
    private _safeReturnUrl(): string {
        const url = this.returnUrl();
        return url && url.startsWith('/') && !url.startsWith('//') && !url.startsWith(APP.PASSWORD_ROUTE) ? url : APP.HOME_ROUTE;
    }
}
