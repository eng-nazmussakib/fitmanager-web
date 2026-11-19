import { HttpErrorResponse, HttpParams, HttpRequest, HttpResponse } from '@angular/common/http';

import { type Action, type AppAbility, createAppAbility, type Subject } from '@core/auth/ability';
import type { Branch } from '@core/models/branch.model';
import type { CurrentUser } from '@core/models/user.model';

import type { DhakaNow } from './seed/clock';
import type { MockAccount } from './seed/staff.seed';

/** What a handler gets: the parsed request plus the caller, as the API's middleware will resolve them. */
export interface Ctx {
    req: HttpRequest<unknown>;
    params: string[];
    query: HttpParams;
    body: Record<string, unknown>;
    account: MockAccount | null;
    user: CurrentUser | null;
    /** From `X-Branch-Id`, checked against the user's assignments (scope 'branch' and 'hq'). */
    branch: Branch | null;
    ability: AppAbility;
    now: DhakaNow;
}

export type Handler = (ctx: Ctx) => HttpResponse<unknown>;

export interface Route {
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    path: RegExp;
    handler: Handler;
    /**
     * public: no token. user: any signed-in user. branch: staff with `X-Branch-Id` of a BRANCH they work at.
     * hq: staff with an HQ assignment (`X-Branch-Id` = the HQ row). member: members only (portal).
     */
    scope: 'public' | 'user' | 'branch' | 'hq' | 'member';
    can?: [Action, Subject];
}

/** Thrown by handlers; the interceptor turns it into an HTTP error with the API's envelope. */
export class MockError extends Error {
    constructor(
        readonly status: number,
        message: string
    ) {
        super(message);
    }
}

export function fail(status: number, message: string): never {
    throw new MockError(status, message);
}

export function ok<T>(data: T, message = 'Success'): HttpResponse<unknown> {
    return new HttpResponse({ status: 200, body: { code: 200, message, data } });
}

export function httpError(status: number, message: string, errors?: { path: string; message: string }[]): HttpErrorResponse {
    return new HttpErrorResponse({ status, statusText: message, error: { code: status, message, data: null, ...(errors ? { errors } : {}) } });
}

export function abilityFor(user: CurrentUser | null, branch: Branch | null): AppAbility {
    const assignment = branch ? user?.assignments.find(a => a.branch.oid === branch.oid) : undefined;
    return createAppAbility([...(user?.rules ?? []), ...(assignment?.rules ?? [])]);
}

/** Query string helpers. */
export function qStr(ctx: Ctx, key: string): string {
    return (ctx.query.get(key) ?? '').trim();
}

export function qInt(ctx: Ctx, key: string, fallback: number): number {
    const n = Number(ctx.query.get(key));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function str(v: unknown): string {
    return typeof v === 'string' ? v.trim() : '';
}

export function num(v: unknown): number {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
}

export function page<T>(rows: T[], ctx: Ctx, defaultSize = 10): { rows: T[]; count: number; page: number; size: number } {
    const size = Math.min(qInt(ctx, 'size', defaultSize), 100);
    const p = qInt(ctx, 'page', 1);
    return { rows: rows.slice((p - 1) * size, p * size), count: rows.length, page: p, size };
}

export function sortBy<T>(rows: T[], ctx: Ctx, allowed: (keyof T)[]): T[] {
    const key = qStr(ctx, 'sort_by') as keyof T;
    if (!allowed.includes(key)) return rows;
    const dir = qStr(ctx, 'sort_order') === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => {
        const x = a[key];
        const y = b[key];
        if (x === y) return 0;
        if (x === null || x === undefined) return 1;
        if (y === null || y === undefined) return -1;
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { numeric: true })) * dir;
    });
}
