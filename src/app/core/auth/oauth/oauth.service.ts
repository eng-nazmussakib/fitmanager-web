import { HttpClient, HttpContext, HttpHeaders, HttpParams } from '@angular/common/http';
import { DOCUMENT, inject, Injectable } from '@angular/core';
import { map, Observable, throwError } from 'rxjs';

import { NOTIFY, NotifyMode, SKIP_AUTH } from '@core/http/http-context.tokens';
import { AuthTokens } from '@core/models/user.model';
import { environment } from '@env/environment';
import { AuthConfig } from '@env/environment.model';

import { createPkcePair, randomString } from './pkce';

type OAuthConfig = Extract<AuthConfig, { type: 'oauth' }>;

/** RFC 6749 §5.1 token response. Identity comes from the profile endpoint, never from the token (IB). */
interface TokenResponse {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
}

/**
 * One in-flight authorization: written right before the redirect, read once on return.
 * sessionStorage: scoped to this tab and gone when it closes, so it never outlives the flow.
 */
const FLOW_KEY = 'app.oauth.flow';

interface PendingFlow {
    verifier: string;
    state: string;
    returnUrl: string;
}

export class OAuthError extends Error {}

/**
 * OAuth 2.0 authorization-code + PKCE client. AuthService owns the session; this class only talks to the
 * identity provider. Works against Keycloak and against an in-house OAuth server with the same code:
 * the only difference, the refresh request's client authentication, is `tokenAuthStyle` in the environment.
 */
@Injectable({ providedIn: 'root' })
export class OAuthService {
    private readonly _http = inject(HttpClient);
    private readonly _document = inject(DOCUMENT);

    /** Full-page redirect to the identity provider. The router cannot navigate to another origin. */
    async startLogin(returnUrl: string): Promise<void> {
        const config = oauthConfig();
        const { verifier, challenge } = await createPkcePair();
        const state = randomString(32);
        sessionStorage.setItem(FLOW_KEY, JSON.stringify({ verifier, state, returnUrl } satisfies PendingFlow));

        const params = new URLSearchParams({
            response_type: 'code',
            client_id: config.clientId,
            redirect_uri: this._redirectUri(config),
            scope: config.scope.join(' '),
            state,
            code_challenge: challenge,
            code_challenge_method: 'S256'
        });
        this._document.location.assign(`${config.authorizationUrl}?${params.toString()}`);
    }

    /** Back from the identity provider: check `state` (CSRF), then trade the code + verifier for tokens. */
    completeLogin(callback: { code?: string; state?: string; error?: string }): Observable<{ tokens: AuthTokens; returnUrl: string }> {
        const flow = readFlow();
        sessionStorage.removeItem(FLOW_KEY); // single use, whatever happens next
        if (callback.error) return throwError(() => new OAuthError(callback.error));
        if (!callback.code) return throwError(() => new OAuthError('No authorization code in the callback URL'));
        if (!flow || callback.state !== flow.state) return throwError(() => new OAuthError('State mismatch. Start the sign-in again.'));

        const config = oauthConfig();
        // The code exchange sends client_id in the body. Both server types accept that, which is exactly why a
        // wrong tokenAuthStyle only shows up later, on the first refresh.
        const body = new HttpParams({
            fromObject: {
                grant_type: 'authorization_code',
                code: callback.code,
                code_verifier: flow.verifier,
                redirect_uri: this._redirectUri(config),
                client_id: config.clientId
            }
        });
        return this._token(body, new HttpHeaders(), 'errors').pipe(map(tokens => ({ tokens, returnUrl: flow.returnUrl })));
    }

    refresh(refreshToken: string): Observable<AuthTokens> {
        const config = oauthConfig();
        let body = new HttpParams().set('grant_type', 'refresh_token').set('refresh_token', refreshToken);
        let headers = new HttpHeaders();
        if (config.tokenAuthStyle === 'basic') headers = headers.set('Authorization', `Basic ${btoa(`${config.clientId}:`)}`);
        else body = body.set('client_id', config.clientId);
        return this._token(body, headers, 'none');
    }

    private _token(body: HttpParams, headers: HttpHeaders, notify: NotifyMode): Observable<AuthTokens> {
        // An HttpParams body is sent as application/x-www-form-urlencoded, which RFC 6749 requires.
        return this._http
            .post<TokenResponse>(oauthConfig().tokenUrl, body, { headers, context: new HttpContext().set(SKIP_AUTH, true).set(NOTIFY, notify) })
            .pipe(map(res => ({ access_token: res.access_token, refresh_token: res.refresh_token ?? '' })));
    }

    private _redirectUri(config: OAuthConfig): string {
        return new URL(config.redirectPath, this._document.baseURI).href;
    }
}

function oauthConfig(): OAuthConfig {
    if (environment.auth.type !== 'oauth') throw new OAuthError('environment.auth.type is not "oauth"');
    return environment.auth;
}

function readFlow(): PendingFlow | null {
    try {
        return JSON.parse(sessionStorage.getItem(FLOW_KEY) ?? 'null') as PendingFlow | null;
    } catch {
        return null;
    }
}
