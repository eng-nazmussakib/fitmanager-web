import type { HttpResponse } from '@angular/common/http';

import type { StaffRole } from '@core/models/branch.model';
import type { AuditEntry, StaffAssignmentInput, StaffMember, StaffPlacement } from '@core/models/staff.model';

import { type Actor, assignableRoles, fitsBranch, mayAssign, mayManage } from '../domain/staff-policy';
import { type Ctx, fail, ok, qStr, type Route, str } from '../http';
import { toRef } from '../seed/organisation.seed';
import { type MockAccount, ROLE_RULES } from '../seed/staff.seed';
import { commit, db } from '../store';

/**
 * Staff management, the audit log, sessions and the password change: the same contract and the same
 * rules as the API (`/v1/hq/staff`, `/v1/branch/staff`, `/v1/*\/audit`, `/v1/auth/sessions`,
 * `/v1/auth/change-password`). Every staff change appends an audit entry, as the API does.
 */
const ROLES: StaffRole[] = ['OWNER', 'HQ_ADMIN', 'BRANCH_MANAGER', 'FRONT_DESK', 'TRAINER'];
const USERNAME = /^[a-z0-9][a-z0-9._-]{2,49}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function actorOf(ctx: Ctx): Actor {
    const a = ctx.user?.assignments.find(x => x.branch.oid === ctx.branch?.oid);
    if (!ctx.user || !a) fail(403, 'Choose a branch first');
    return { oid: ctx.user.user_id, role: a.role, branch: { oid: a.branch.oid, kind: a.branch.kind } };
}

/** Explicit rows only: an every-branch account lists its HQ row (the mock seeds the owner at each branch too). */
function placements(a: MockAccount): StaffPlacement[] {
    const rows = a.user.all_branches ? a.user.assignments.filter(x => x.branch.kind === 'HQ') : a.user.assignments;
    // The demo has no closed branches, so every placement is at an active one.
    return rows.map(x => ({
        branch_oid: x.branch.oid,
        branch_code: x.branch.code,
        branch_name: x.branch.name,
        branch_kind: x.branch.kind,
        branch_status: 'Active',
        role: x.role
    }));
}

function view(a: MockAccount, actor: Actor): StaffMember {
    const assignments = placements(a);
    return {
        oid: a.user.user_id,
        username: a.username,
        name: a.user.name,
        email: a.user.email ?? null,
        status: a.status ?? 'Active',
        all_branches: a.user.all_branches,
        must_change_password: a.user.must_change_password ?? false,
        created_at: a.created_at ?? `${db().seedDay}T03:00:00.000Z`,
        updated_at: a.created_at ?? `${db().seedDay}T03:00:00.000Z`,
        assignments,
        manageable: a.user.user_id !== actor.oid && mayManage(actor, { all_branches: a.user.all_branches, assignments })
    };
}

const staffAccounts = (): MockAccount[] => db().accounts.filter(a => a.user.kind === 'staff');
const assignedHere = (a: MockAccount, actor: Actor): boolean => placements(a).some(p => p.branch_oid === actor.branch.oid);

function find(ctx: Ctx, actor: Actor, onlyHere: boolean): MockAccount {
    const a = staffAccounts().find(x => x.user.user_id === ctx.params[0]);
    if (!a || (onlyHere && !assignedHere(a, actor))) fail(404, 'No such staff member');
    return a;
}

/** A person the actor may change; never themselves. */
function manageable(ctx: Ctx, actor: Actor, onlyHere: boolean): MockAccount {
    const a = find(ctx, actor, onlyHere);
    if (a.user.user_id === actor.oid) fail(403, 'You cannot do this to your own account');
    if (!mayManage(actor, { all_branches: a.user.all_branches, assignments: placements(a) })) fail(403, 'You may not manage this staff member');
    return a;
}

function checkAssignments(actor: Actor, list: StaffAssignmentInput[], allBranches: boolean): void {
    if (!list.length) fail(400, 'Give at least one assignment');
    if (new Set(list.map(a => a.branch_oid)).size !== list.length) fail(400, 'One role per branch');
    for (const a of list) {
        const b = db().branches.find(x => x.oid === a.branch_oid);
        if (!b) fail(400, 'Unknown branch');
        if (!ROLES.includes(a.role)) fail(400, 'Unknown role');
        if (!fitsBranch(a.role, b.kind)) fail(400, b.kind === 'HQ' ? 'HQ takes an HQ role (OWNER or HQ_ADMIN)' : 'A branch takes a branch role');
        if (!mayAssign(actor, { branch_oid: b.oid, branch_kind: b.kind, role: a.role })) fail(403, `You may not assign ${a.role} there`);
    }
    if (allBranches) {
        if (!(actor.branch.kind === 'HQ' && actor.role === 'OWNER')) fail(403, 'Only an owner gives access to every branch');
        if (!list.some(a => db().branches.find(b => b.oid === a.branch_oid)?.kind === 'HQ')) fail(400, 'Every-branch access needs an HQ assignment');
    }
}

/** The account with these explicit assignments; an every-branch account also reaches every other branch with its HQ role. */
function withAssignments(a: MockAccount, list: StaffAssignmentInput[], allBranches: boolean): MockAccount {
    const branches = db().branches;
    const explicit = list.map(x => {
        const b = branches.find(br => br.oid === x.branch_oid)!;
        return { branch: toRef(b), role: x.role, rules: ROLE_RULES[x.role] };
    });
    const hq = explicit.find(x => x.branch.kind === 'HQ');
    const implied =
        allBranches && hq
            ? branches
                  .filter(b => b.kind === 'BRANCH' && !list.some(x => x.branch_oid === b.oid))
                  .map(b => ({ branch: toRef(b), role: hq.role, rules: hq.rules }))
            : [];
    return { ...a, user: { ...a.user, all_branches: allBranches, assignments: [...explicit, ...implied] } };
}

function audit(ctx: Ctx, action: string, oid: string, before?: StaffMember, after?: unknown): void {
    const b = ctx.branch!;
    const row: AuditEntry = {
        oid: `aud-${db().audit.length + 1}-${Date.now()}`,
        branch_oid: b.oid,
        branch_code: b.code,
        branch_name: b.name,
        actor_oid: ctx.user?.user_id ?? null,
        actor_name: ctx.user?.name ?? null,
        action,
        entity: 'staff',
        entity_key: oid,
        before: before ? strip(before) : null,
        after: after && typeof after === 'object' && 'manageable' in after ? strip(after as StaffMember) : (after ?? null),
        request_id: null,
        created_at: ctx.now.iso
    };
    commit({ t: 'audit.add', row });
}

const strip = ({ manageable: _m, ...rest }: StaffMember): Omit<StaffMember, 'manageable'> => rest;

function password(v: unknown): string {
    const p = typeof v === 'string' ? v : '';
    if (p.length < 8) fail(400, 'password: Use at least 8 characters');
    if (!/\p{L}/u.test(p) || !/\d/.test(p)) fail(400, 'password: Include at least one letter and one digit');
    return p;
}

function emailOf(v: unknown): string | null {
    if (v === null || v === undefined) return null;
    const e = str(v);
    if (e && !EMAIL.test(e)) fail(400, 'email: Enter a valid email address');
    return e || null;
}

function list(ctx: Ctx, onlyHere: boolean): HttpResponse<unknown> {
    const actor = actorOf(ctx);
    const q = qStr(ctx, 'q').toLowerCase();
    const role = qStr(ctx, 'role');
    const status = qStr(ctx, 'status');
    const branch = onlyHere ? actor.branch.oid : qStr(ctx, 'branch_oid');
    const rows = staffAccounts()
        .filter(a => !branch || placements(a).some(p => p.branch_oid === branch))
        .filter(a => !role || placements(a).some(p => p.role === role && (!branch || p.branch_oid === branch)))
        .filter(a => !status || (a.status ?? 'Active') === status)
        .filter(a => !q || [a.user.name, a.username, a.user.email ?? ''].some(s => s.toLowerCase().includes(q)))
        .map(a => view(a, actor))
        .sort((x, y) => x.name.localeCompare(y.name));
    const here = { oid: actor.branch.oid, kind: 'BRANCH' as const };
    const branches = (
        onlyHere
            ? db().branches.filter(b => b.oid === actor.branch.oid)
            : [...db().branches].sort((x, y) => (x.kind === y.kind ? x.name.localeCompare(y.name) : x.kind === 'HQ' ? -1 : 1))
    ).map(b => ({
        oid: b.oid,
        code: b.code,
        name: b.name,
        kind: b.kind
    }));
    return ok({ rows, branches, assignable_roles: { hq: assignableRoles(actor, { oid: '', kind: 'HQ' }), branch: assignableRoles(actor, here) } });
}

function create(ctx: Ctx, onlyHere: boolean): HttpResponse<unknown> {
    const actor = actorOf(ctx);
    const username = str(ctx.body['username']).toLowerCase();
    if (!USERNAME.test(username)) fail(400, 'username: 3–50 characters: letters, digits, dots, dashes or underscores');
    if (db().accounts.some(a => a.username === username)) fail(409, 'This username is taken');
    const name = str(ctx.body['name']);
    if (!name) fail(400, 'name: Enter a name');
    const pass = password(ctx.body['password']);
    const list = onlyHere
        ? [{ branch_oid: actor.branch.oid, role: ctx.body['role'] as StaffRole }]
        : ((Array.isArray(ctx.body['assignments']) ? ctx.body['assignments'] : []) as StaffAssignmentInput[]);
    const allBranches = !onlyHere && ctx.body['all_branches'] === true;
    checkAssignments(actor, list, allBranches);
    const blank: MockAccount = {
        username,
        password: pass,
        status: 'Active',
        created_at: ctx.now.iso,
        user: {
            user_id: `u-${username}`,
            username,
            name,
            email: emailOf(ctx.body['email']),
            must_change_password: true,
            kind: 'staff',
            photo_url: null,
            rules: [],
            all_branches: allBranches,
            assignments: [],
            member: null
        }
    };
    const account = withAssignments(blank, list, allBranches);
    commit({ t: 'account.put', account });
    const after = view(account, actor);
    audit(ctx, 'create', after.oid, undefined, after);
    return ok(after, `${name} added`);
}

/** Runs one change on a manageable person and records it. */
function change(
    ctx: Ctx,
    onlyHere: boolean,
    action: string,
    edit: (a: MockAccount, actor: Actor) => MockAccount,
    message: (m: StaffMember) => string
): HttpResponse<unknown> {
    const actor = actorOf(ctx);
    const current = manageable(ctx, actor, onlyHere);
    const before = view(current, actor);
    const next = edit(current, actor);
    commit({ t: 'account.put', account: next });
    const after = view(next, actor);
    audit(ctx, action, after.oid, before, after);
    return ok(after, message(after));
}

function routesFor(level: 'hq' | 'branch'): Route[] {
    const onlyHere = level === 'branch';
    const base = `\\/v1\\/${level}\\/staff`;
    const one = new RegExp(`^${base}\\/([\\w.-]+)$`);
    const sub = (name: string): RegExp => new RegExp(`^${base}\\/([\\w.-]+)\\/${name}$`);
    const scope = level;
    return [
        { method: 'GET', path: new RegExp(`^${base}$`), scope, can: ['read', 'Staff'], handler: ctx => list(ctx, onlyHere) },
        { method: 'POST', path: new RegExp(`^${base}$`), scope, can: ['manage', 'Staff'], handler: ctx => create(ctx, onlyHere) },
        { method: 'GET', path: one, scope, can: ['read', 'Staff'], handler: ctx => ok(view(find(ctx, actorOf(ctx), onlyHere), actorOf(ctx))) },
        {
            method: 'PATCH',
            path: one,
            scope,
            can: ['manage', 'Staff'],
            handler: ctx =>
                change(
                    ctx,
                    onlyHere,
                    'update',
                    a => {
                        const name = 'name' in ctx.body ? str(ctx.body['name']) : a.user.name;
                        if (!name) fail(400, 'name: Enter a name');
                        const email = 'email' in ctx.body ? emailOf(ctx.body['email']) : (a.user.email ?? null);
                        return { ...a, user: { ...a.user, name, email } };
                    },
                    () => 'Saved'
                )
        },
        {
            method: 'POST',
            path: sub('deactivate'),
            scope,
            can: ['manage', 'Staff'],
            handler: ctx =>
                change(
                    ctx,
                    onlyHere,
                    'deactivate',
                    a => ({ ...a, status: 'Inactive' }),
                    m => `${m.name} is deactivated and signed out`
                )
        },
        {
            method: 'POST',
            path: sub('activate'),
            scope,
            can: ['manage', 'Staff'],
            handler: ctx =>
                change(
                    ctx,
                    onlyHere,
                    'activate',
                    a => ({ ...a, status: 'Active' }),
                    m => `${m.name} is active again`
                )
        },
        {
            method: 'POST',
            path: sub('reset-password'),
            scope,
            can: ['manage', 'Staff'],
            handler: ctx => {
                const pass = password(ctx.body['password']);
                change(
                    ctx,
                    onlyHere,
                    'reset_password',
                    a => ({ ...a, password: pass, user: { ...a.user, must_change_password: true } }),
                    m => m.name
                );
                return ok(null, 'Temporary password set. They must change it when they sign in.');
            }
        },
        {
            method: 'POST',
            path: sub('sign-out'),
            scope,
            can: ['manage', 'Staff'],
            handler: ctx => {
                change(
                    ctx,
                    onlyHere,
                    'sign_out',
                    a => a,
                    m => m.name
                );
                return ok(null, 'Signed out on every device');
            }
        }
    ];
}

/** `GET …/audit`: newest first, filters as in the API; the cursor is the index of the next row. */
/** The audit rows the log's filters match, newest first (the screens page through them; the export too). */
export function auditMatches(ctx: Ctx, level: 'hq' | 'branch'): AuditEntry[] {
    const reach = level === 'hq' ? (ctx.user?.assignments.map(a => a.branch.oid) ?? []) : [ctx.branch!.oid];
    const branch = qStr(ctx, 'branch_oid');
    if (branch && !reach.includes(branch)) fail(403, 'You do not work at this branch');
    const from = qStr(ctx, 'from');
    const to = qStr(ctx, 'to');
    if (from && to && from > to) fail(400, '`from` must not be after `to`');
    const day = (iso: string): string => new Date(new Date(iso).getTime() + 6 * 3600_000).toISOString().slice(0, 10); // Dhaka, UTC+6
    const filters: [string, (r: AuditEntry) => boolean][] = [
        ['actor_oid', r => r.actor_oid === qStr(ctx, 'actor_oid')],
        ['action', r => r.action === qStr(ctx, 'action')],
        ['entity', r => r.entity === qStr(ctx, 'entity')],
        ['entity_key', r => r.entity_key === qStr(ctx, 'entity_key')]
    ];
    return [...db().audit]
        .reverse()
        .filter(r => (branch ? r.branch_oid === branch : reach.includes(r.branch_oid)))
        .filter(r => filters.every(([key, test]) => !qStr(ctx, key) || test(r)))
        .filter(r => (!from || day(r.created_at) >= from) && (!to || day(r.created_at) <= to));
}

function readAudit(ctx: Ctx, level: 'hq' | 'branch'): HttpResponse<unknown> {
    const rows = auditMatches(ctx, level);
    const limit = Math.min(Math.max(Number(qStr(ctx, 'limit')) || 50, 1), 100);
    const start = Number(qStr(ctx, 'before')) || 0;
    const pageRows = rows.slice(start, start + limit);
    return ok({ rows: pageRows, next: start + limit < rows.length ? String(start + limit) : null });
}

export const STAFF_ROUTES: Route[] = [
    ...routesFor('hq'),
    ...routesFor('branch'),
    {
        method: 'PUT',
        path: /^\/v1\/hq\/staff\/([\w.-]+)\/assignments$/,
        scope: 'hq',
        can: ['manage', 'Staff'],
        handler: ctx => {
            const list = (Array.isArray(ctx.body['assignments']) ? ctx.body['assignments'] : []) as StaffAssignmentInput[];
            const allBranches = ctx.body['all_branches'] === true;
            return change(
                ctx,
                false,
                'assign',
                (a, actor) => {
                    checkAssignments(actor, list, allBranches);
                    return withAssignments(a, list, allBranches);
                },
                () => 'Assignments saved'
            );
        }
    },
    {
        method: 'PUT',
        path: /^\/v1\/branch\/staff\/([\w.-]+)\/role$/,
        scope: 'branch',
        can: ['manage', 'Staff'],
        handler: ctx =>
            change(
                ctx,
                true,
                'assign',
                (a, actor) => {
                    const role = ctx.body['role'] as StaffRole;
                    checkAssignments(actor, [{ branch_oid: actor.branch.oid, role }], false);
                    const others = placements(a).filter(p => p.branch_oid !== actor.branch.oid);
                    return withAssignments(a, [...others, { branch_oid: actor.branch.oid, role }], false);
                },
                () => 'Role saved'
            )
    },
    {
        method: 'DELETE',
        path: /^\/v1\/branch\/staff\/([\w.-]+)$/,
        scope: 'branch',
        can: ['manage', 'Staff'],
        handler: ctx =>
            change(
                ctx,
                true,
                'unassign',
                (a, actor) => {
                    const rest = placements(a).filter(p => p.branch_oid !== actor.branch.oid);
                    return { ...a, user: { ...a.user, assignments: a.user.assignments.filter(x => rest.some(r => r.branch_oid === x.branch.oid)) } };
                },
                m => `${m.name} no longer works at this branch`
            )
    },
    { method: 'GET', path: /^\/v1\/hq\/audit$/, scope: 'hq', can: ['read', 'AuditLog'], handler: ctx => readAudit(ctx, 'hq') },
    { method: 'GET', path: /^\/v1\/branch\/audit$/, scope: 'branch', can: ['read', 'AuditLog'], handler: ctx => readAudit(ctx, 'branch') },
    {
        method: 'POST',
        path: /^\/v1\/auth\/change-password$/,
        scope: 'user',
        handler: ctx => {
            const a = ctx.account!;
            if (ctx.body['current_password'] !== a.password) fail(400, 'The current password is not correct');
            const next = typeof ctx.body['new_password'] === 'string' ? ctx.body['new_password'] : '';
            if (next === a.password) fail(400, 'new_password: Choose a password different from the current one');
            password(next);
            commit({ t: 'account.put', account: { ...a, password: next, user: { ...a.user, must_change_password: false } } });
            return ok({ access_token: `mock:${a.username}:${Date.now()}`, refresh_token: `mock-refresh:${a.username}` }, 'Password changed');
        }
    },
    {
        method: 'GET',
        path: /^\/v1\/auth\/sessions$/,
        scope: 'user',
        handler: ctx => ok([{ id: 'mock-session', signed_in_at: ctx.now.iso, last_used_at: ctx.now.iso, user_agent: 'This browser (demo)', current: true }])
    },
    { method: 'DELETE', path: /^\/v1\/auth\/sessions\/([\w-]+)$/, scope: 'user', handler: () => fail(404, 'No such session') }
];
