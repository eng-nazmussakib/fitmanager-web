import { HttpParams, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '@env/environment';
import { AuthConfig } from '@env/environment.model';

import { OAuthError, OAuthService } from './oauth.service';

const OAUTH: Extract<AuthConfig, { type: 'oauth' }> = {
    type: 'oauth',
    clientId: 'web',
    authorizationUrl: 'https://sso.test/auth',
    tokenUrl: 'https://sso.test/token',
    redirectPath: 'auth/callback',
    scope: ['openid'],
    tokenAuthStyle: 'body'
};
const FLOW_KEY = 'app.oauth.flow';

describe('OAuthService', () => {
    const original = environment.auth;
    let service: OAuthService;
    let http: HttpTestingController;

    beforeEach(() => {
        TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
        service = TestBed.inject(OAuthService);
        http = TestBed.inject(HttpTestingController);
        sessionStorage.clear();
    });

    afterEach(() => {
        http.verify();
        environment.auth = original;
    });

    describe('refresh: tokenAuthStyle', () => {
        it("'body' (Keycloak public client): client_id in the body, no Authorization header", () => {
            environment.auth = { ...OAUTH, tokenAuthStyle: 'body' };
            service.refresh('rt-1').subscribe();
            const req = http.expectOne(OAUTH.tokenUrl);
            const body = req.request.body as HttpParams;
            expect(body.get('grant_type')).toBe('refresh_token');
            expect(body.get('client_id')).toBe('web');
            expect(req.request.headers.has('Authorization')).toBe(false);
            req.flush({ access_token: 'a', refresh_token: 'r' });
        });

        it("'basic' (in-house server): Basic base64(clientId + ':') header, no client_id in the body", () => {
            environment.auth = { ...OAUTH, tokenAuthStyle: 'basic' };
            service.refresh('rt-1').subscribe();
            const req = http.expectOne(OAUTH.tokenUrl);
            expect(req.request.headers.get('Authorization')).toBe(`Basic ${btoa('web:')}`);
            expect((req.request.body as HttpParams).has('client_id')).toBe(false);
            req.flush({ access_token: 'a', refresh_token: 'r' });
        });
    });

    describe('completeLogin', () => {
        beforeEach(() => (environment.auth = OAUTH));

        it('rejects a callback whose state does not match the one stored before the redirect (CSRF)', () => {
            sessionStorage.setItem(FLOW_KEY, JSON.stringify({ verifier: 'v', state: 'expected', returnUrl: '/home' }));
            let error: unknown;
            service.completeLogin({ code: 'c', state: 'forged' }).subscribe({ error: (e: unknown) => (error = e) });
            expect(error).toBeInstanceOf(OAuthError);
            http.expectNone(OAUTH.tokenUrl);
        });

        it('exchanges the code with the stored verifier, then forgets the flow', () => {
            sessionStorage.setItem(FLOW_KEY, JSON.stringify({ verifier: 'the-verifier', state: 's1', returnUrl: '/examples/crud' }));
            let result: unknown;
            service.completeLogin({ code: 'the-code', state: 's1' }).subscribe(r => (result = r));

            const req = http.expectOne(OAUTH.tokenUrl);
            const body = req.request.body as HttpParams;
            expect(body.get('grant_type')).toBe('authorization_code');
            expect(body.get('code')).toBe('the-code');
            expect(body.get('code_verifier')).toBe('the-verifier');
            req.flush({ access_token: 'at', refresh_token: 'rt' });

            expect(result).toEqual({ tokens: { access_token: 'at', refresh_token: 'rt' }, returnUrl: '/examples/crud' });
            expect(sessionStorage.getItem(FLOW_KEY)).toBeNull();
        });

        it('surfaces an error sent back by the identity provider', () => {
            sessionStorage.setItem(FLOW_KEY, JSON.stringify({ verifier: 'v', state: 's1', returnUrl: '/' }));
            let error: unknown;
            service.completeLogin({ error: 'access_denied', state: 's1' }).subscribe({ error: (e: unknown) => (error = e) });
            expect((error as OAuthError).message).toBe('access_denied');
        });
    });
});
