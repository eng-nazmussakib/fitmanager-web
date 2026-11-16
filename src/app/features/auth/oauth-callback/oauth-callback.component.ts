import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { map, switchMap } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { OAuthService } from '@core/auth/oauth/oauth.service';
import { APP } from '@core/constants/app.constants';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { SpinnerComponent } from '@shared/ui/display/display';
import { EmptyStateComponent } from '@shared/ui/feedback/empty-state.component';

/**
 * `redirect_uri` target: /auth/callback?code=…&state=… (or ?error=…).
 * The query params arrive as signal inputs (withComponentInputBinding), the exchange runs as an rxResource,
 * and on success the page is REPLACED in history, so Back never lands on a spent authorization code.
 */
@Component({
    selector: 'app-oauth-callback',
    imports: [RouterLink, ButtonComponent, SpinnerComponent, EmptyStateComponent],
    template: `
        <div class="flex min-h-dvh items-center justify-center bg-bg p-4 text-fg">
            @if (session.error(); as err) {
                <fm-empty-state icon="circle-alert" size="lg" title="Sign-in failed" [description]="err.message">
                    <a fmButton variant="primary" [routerLink]="loginRoute">Back to sign in</a>
                </fm-empty-state>
            } @else {
                <p class="flex items-center gap-3 text-fg-muted">
                    <fm-spinner label="Signing you in" />
                    Signing you in…
                </p>
            }
        </div>
    `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class OAuthCallbackComponent {
    private readonly _oauth = inject(OAuthService);
    private readonly _auth = inject(AuthService);
    private readonly _router = inject(Router);

    protected readonly loginRoute = APP.LOGIN_ROUTE;

    readonly code = input<string>();
    readonly state = input<string>();
    readonly error = input<string>();

    protected readonly session = rxResource({
        params: () => ({ code: this.code(), state: this.state(), error: this.error() }),
        stream: ({ params }) =>
            this._oauth.completeLogin(params).pipe(switchMap(({ tokens, returnUrl }) => this._auth.completeOAuthLogin(tokens).pipe(map(() => returnUrl))))
    });

    constructor() {
        effect(() => {
            // hasValue() first: since Angular 20, reading value() of a resource in the error state THROWS.
            if (this.session.hasValue()) void this._router.navigateByUrl(safeReturnUrl(this.session.value()), { replaceUrl: true });
        });
    }
}

/** Same rule as the sign-in page: only same-app paths. */
function safeReturnUrl(url: string): string {
    return url.startsWith('/') && !url.startsWith('//') ? url : APP.HOME_ROUTE;
}
