import { HttpResponse } from '@angular/common/http';

import { type Ctx, fail, ok, type Route, str } from '../http';
import { db, fastMode, resetDemo, setFastMode } from '../store';

/**
 * Mock tokens: `mock:<username>:<issued-ms>` (`:` because usernames contain dots), valid for ACCESS_TTL_MS, then a 401 and one refresh (watch the
 * Network tab: the auth interceptor refreshes once and retries).
 */
export const ACCESS_TTL_MS = 10 * 60_000;

export function issueTokens(username: string): { access_token: string; refresh_token: string } {
    return { access_token: `mock:${username}:${Date.now()}`, refresh_token: `mock-refresh:${username}` };
}

export function accountFromToken(header: string | null): ReturnType<typeof db>['accounts'][number] | null {
    const [scheme, token] = (header ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) return null;
    const [prefix, username, issuedAt] = token.split(':');
    if (prefix !== 'mock' || Date.now() - Number(issuedAt) > ACCESS_TTL_MS) return null;
    // A deactivated account's token stops working at once, as the API's profile check does.
    return db().accounts.find(a => a.username === username && a.status !== 'Inactive') ?? null;
}

function login(ctx: Ctx): HttpResponse<unknown> {
    const username = str(ctx.body['username']).toLowerCase();
    const account = db().accounts.find(a => a.username === username);
    if (!account || account.password !== ctx.body['password']) fail(400, 'Invalid username or password');
    if (account.status === 'Inactive') fail(403, 'This account is not active');
    return ok(issueTokens(account.username), 'Signed in');
}

function refresh(ctx: Ctx): HttpResponse<unknown> {
    const [prefix, username] = str(ctx.body['refresh_token']).split(':');
    if (prefix !== 'mock-refresh' || !db().accounts.some(a => a.username === username && a.status !== 'Inactive')) fail(401, 'Refresh token invalid');
    return ok(issueTokens(username), 'Token refreshed');
}

export const AUTH_ROUTES: Route[] = [
    { method: 'POST', path: /^\/v1\/auth\/login$/, scope: 'public', handler: login },
    { method: 'POST', path: /^\/v1\/auth\/refresh$/, scope: 'public', handler: refresh },
    { method: 'POST', path: /^\/v1\/auth\/logout$/, scope: 'public', handler: () => ok(null, 'Signed out') },
    { method: 'GET', path: /^\/v1\/auth\/me$/, scope: 'user', handler: ctx => ok(ctx.user) },
    // Demo controls (only the mock answers these; production has no demo banner).
    {
        method: 'POST',
        path: /^\/v1\/demo\/reset$/,
        scope: 'public',
        handler: () => {
            resetDemo();
            return ok(null, 'Demo data reset');
        }
    },
    { method: 'GET', path: /^\/v1\/demo\/settings$/, scope: 'public', handler: () => ok({ fast: fastMode() }) },
    {
        method: 'PUT',
        path: /^\/v1\/demo\/settings$/,
        scope: 'public',
        handler: ctx => {
            setFastMode(ctx.body['fast'] === true);
            return ok({ fast: fastMode() }, ctx.body['fast'] ? 'Fast mode on' : 'Fast mode off');
        }
    },
    {
        method: 'GET',
        path: /^\/v1\/demo\/accounts$/,
        scope: 'public',
        handler: () => ok(db().accounts.map(a => ({ username: a.username, password: a.password, name: a.user.name, kind: a.user.kind })))
    }
];
