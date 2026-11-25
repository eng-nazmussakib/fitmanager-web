import type { HttpResponse } from '@angular/common/http';

import { type Ctx, fail, ok, type Route } from '../http';
import { memberMessages, memberReader, newReads, type Reader, staffInbox } from '../inbox';
import { idx } from '../queries';
import { commit, db } from '../store';
import type { MemberRow } from '../types';

/**
 * The bell in demo mode: the member's messages and the staff inbox, derived from the mock's data
 * (mock/inbox.ts), with read marks stored.
 */
function me(ctx: Ctx): MemberRow {
    const oid = ctx.user?.member?.oid;
    const m = oid ? idx().members.get(oid) : undefined;
    if (!m) fail(404, 'Member not found');
    return m;
}

function oidsOf(ctx: Ctx): string[] | undefined {
    const v = ctx.body['oids'];
    if (v === undefined) return undefined;
    if (!Array.isArray(v) || v.some(x => typeof x !== 'string')) fail(400, 'Unknown message');
    return v as string[];
}

function read(reader: Reader, unread: string[], ctx: Ctx): void {
    const rows = newReads(reader, unread, oidsOf(ctx), new Date(ctx.now.iso).toISOString());
    if (rows.length) commit({ t: 'reads.add', rows });
}

/* ---------- members ---------- */

function myMessages(ctx: Ctx): HttpResponse<unknown> {
    return ok(memberMessages(db(), me(ctx), ctx.now.date, ctx.now.iso).slice(0, 50));
}

const myUnread = (ctx: Ctx): string[] =>
    memberMessages(db(), me(ctx), ctx.now.date, ctx.now.iso)
        .filter(n => !n.read_at)
        .map(n => n.oid);

function myCount(ctx: Ctx): HttpResponse<unknown> {
    return ok({ unread: myUnread(ctx).length });
}

function myRead(ctx: Ctx): HttpResponse<unknown> {
    read(memberReader(db(), me(ctx)), myUnread(ctx), ctx);
    return ok({ unread: myUnread(ctx).length });
}

/* ---------- staff ---------- */

function box(ctx: Ctx): ReturnType<typeof staffInbox> {
    if (!ctx.branch || !ctx.account) fail(403, 'Choose a branch first');
    return staffInbox(db(), ctx.branch, ctx.ability, ctx.account.username, ctx.now.iso);
}

function inboxRead(ctx: Ctx): HttpResponse<unknown> {
    const before = box(ctx);
    read(
        { key: `u:${ctx.account?.username ?? ''}`, reads: true },
        before.items.filter(m => !m.read_at).map(m => m.oid),
        ctx
    );
    return ok({ unread: box(ctx).unread });
}

export const INBOX_ROUTES: Route[] = [
    { method: 'GET', path: /^\/v1\/inbox$/, scope: 'staff', handler: ctx => ok(box(ctx)) },
    { method: 'GET', path: /^\/v1\/inbox\/count$/, scope: 'staff', handler: ctx => ok({ unread: box(ctx).unread }) },
    { method: 'POST', path: /^\/v1\/inbox\/read$/, scope: 'staff', handler: inboxRead },
    { method: 'GET', path: /^\/v1\/me\/notifications\/count$/, scope: 'member', can: ['read', 'Portal'], handler: myCount },
    { method: 'POST', path: /^\/v1\/me\/notifications\/read$/, scope: 'member', can: ['update', 'Portal'], handler: myRead },
    { method: 'GET', path: /^\/v1\/me\/notifications$/, scope: 'member', can: ['read', 'Portal'], handler: myMessages }
];
