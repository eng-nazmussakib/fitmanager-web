import type { HttpResponse } from '@angular/common/http';

import type { StaffRole } from '@core/models/branch.model';
import type {
    Complaint,
    ComplaintStatus,
    IncidentDetail,
    IncidentListItem,
    MyFeedback,
    OwnSanction,
    Policy,
    PolicyDetail,
    Rateable,
    Sanction,
    SanctionLevel,
    TrainerAverage
} from '@core/models/governance.model';

import { recordAudit } from '../audit';
import { shortDate } from '../domain/access-rules';
import {
    allowedLevels,
    appealDeadline,
    banScopes,
    type GiverRole,
    giverRole,
    LEVEL_LABEL,
    mayDecideAppeal,
    mayLift,
    strikes,
    suggestLevel
} from '../domain/ladder';
import { daysSince, memberPolicies, sanctionState } from '../governance';
import { type Ctx, fail, ok, qStr, type Route, str } from '../http';
import { idx } from '../queries';
import { addDaysIso } from '../seed/clock';
import { commit, db, newOid } from '../store';
import type { ComplaintRow, IncidentRow, MemberRow, PolicyRow, PolicyVersionRow, SanctionRow } from '../types';
import { branchMember } from './members.handlers';

/**
 * Governance in demo mode: the API's policies, discipline and feedback routes (fitmanager-api
 * src/features/policies, discipline, feedback) on the mock's tables, with the same rules and messages.
 */

const branchName = (oid: string): string => db().branches.find(b => b.oid === oid)?.name ?? '';
const isHq = (ctx: Ctx): boolean => ctx.branch?.kind === 'HQ';
const fileUrl = (oid: string): string | null => db().files?.find(f => f.oid === oid && f.status === 'ready')?.url ?? null;
const STAFF_ROLES: StaffRole[] = ['BRANCH_MANAGER', 'FRONT_DESK', 'TRAINER'];

/** The member signed in to the portal, with a context at their home branch (for the audit row). */
function portalHome(ctx: Ctx): { m: MemberRow; c: Ctx } {
    const oid = ctx.user?.member?.oid;
    const m = oid ? idx().members.get(oid) : undefined;
    if (!m) fail(404, 'Member not found');
    return { m, c: { ...ctx, branch: db().branches.find(b => b.oid === m.branch_oid) ?? null } };
}

/* ---------- policies ---------- */

function versionsOf(policyOid: string): PolicyVersionRow[] {
    return db()
        .policyVersions.filter(v => v.policy_oid === policyOid)
        .sort((a, b) => b.version - a.version);
}

function policyWire(p: PolicyRow): Policy {
    const versions = versionsOf(p.oid);
    const current = versions[0];
    const { clauses, ...head } = current;
    return {
        ...p,
        current: { ...head, clauses },
        required_version: (versions.find(v => v.mode === 'accept_again') ?? current).version,
        versions: versions.map(({ clauses: _c, ...v }) => v)
    };
}

function readClauses(ctx: Ctx): { number: string; heading: string; body: string }[] {
    const list = ctx.body['clauses'] as { number?: string; heading?: string; body?: string }[] | undefined;
    if (!Array.isArray(list) || !list.length) fail(400, 'A policy has at least one clause');
    const out = list.map((c, i) => ({ number: str(c.number) || String(i + 1), heading: str(c.heading), body: str(c.body) }));
    if (out.some(c => c.heading.length < 2 || c.body.length < 2)) fail(400, 'Each clause needs a heading and its text');
    if (new Set(out.map(c => c.number)).size !== out.length) fail(400, 'Each clause needs its own number');
    return out;
}

function putVersion(
    ctx: Ctx,
    policyOid: string,
    version: number,
    mode: PolicyVersionRow['mode'],
    note: string | null,
    clauses: ReturnType<typeof readClauses>
): void {
    const oid = newOid('polv');
    commit({
        t: 'put',
        table: 'policyVersions',
        row: {
            oid,
            policy_oid: policyOid,
            version,
            mode,
            change_note: note,
            published_on: ctx.now.date,
            published_by_name: ctx.user?.name ?? null,
            clauses: clauses.map(c => ({ oid: newOid('cl'), ...c }))
        } satisfies PolicyVersionRow
    });
}

function createPolicy(ctx: Ctx): HttpResponse<unknown> {
    const slug = str(ctx.body['slug']).toLowerCase();
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) fail(400, 'slug: Lower-case words joined by dashes');
    if (db().policies.some(p => p.slug === slug)) fail(409, 'Another policy has this web address');
    const title = str(ctx.body['title']);
    if (title.length < 3) fail(400, 'title: Required');
    const clauses = readClauses(ctx);
    const oid = newOid('pol');
    const row: PolicyRow = {
        oid,
        slug,
        title,
        summary: str(ctx.body['summary']) || null,
        required: ctx.body['required'] === true,
        public: ctx.body['public'] === true,
        sort_order: Number(ctx.body['sort_order'] ?? 0) || 0,
        active: true,
        updated_at: ctx.now.iso
    };
    commit({ t: 'put', table: 'policies', row });
    putVersion(ctx, oid, 1, 'accept_again', null, clauses);
    recordAudit(ctx, 'create', 'policy', slug, null, { title, version: 1, clauses: clauses.length });
    return ok(policyWire(row), 'Policy published');
}

function policyRow(oid: string): PolicyRow {
    const p = db().policies.find(x => x.oid === oid);
    if (!p) fail(404, 'Policy not found');
    return p;
}

function updatePolicy(ctx: Ctx): HttpResponse<unknown> {
    const p = policyRow(ctx.params[0]);
    const patch: Partial<PolicyRow> = { updated_at: ctx.now.iso };
    if ('title' in ctx.body) patch.title = str(ctx.body['title']);
    if ('summary' in ctx.body) patch.summary = str(ctx.body['summary']) || null;
    for (const k of ['required', 'public', 'active'] as const) if (k in ctx.body) patch[k] = ctx.body[k] === true;
    if ('sort_order' in ctx.body) patch.sort_order = Number(ctx.body['sort_order']) || 0;
    const before = { ...p };
    commit({ t: 'patch', table: 'policies', oid: p.oid, patch });
    recordAudit(ctx, 'update', 'policy', p.slug, before, policyRow(p.oid));
    return ok(policyWire(policyRow(p.oid)), 'Policy saved');
}

function publishVersion(ctx: Ctx): HttpResponse<unknown> {
    const p = policyRow(ctx.params[0]);
    const mode = str(ctx.body['mode']) as PolicyVersionRow['mode'];
    if (mode !== 'accept_again' && mode !== 'wording_only') fail(400, 'Accept again, or wording only');
    const clauses = readClauses(ctx);
    const next = versionsOf(p.oid)[0].version + 1;
    putVersion(ctx, p.oid, next, mode, str(ctx.body['change_note']) || null, clauses);
    commit({ t: 'patch', table: 'policies', oid: p.oid, patch: { updated_at: ctx.now.iso } });
    recordAudit(ctx, 'publish', 'policy_version', `${p.slug}/v${next}`, null, { version: next, mode });
    return ok(policyWire(policyRow(p.oid)), 'New version published');
}

function getPolicy(ctx: Ctx): HttpResponse<unknown> {
    const p = policyWire(policyRow(ctx.params[0]));
    const want = Number(qStr(ctx, 'version')) || null;
    const row = want ? versionsOf(p.oid).find(v => v.version === want) : versionsOf(p.oid)[0];
    if (!row) fail(404, 'No such version');
    return ok({ ...p, shown: row } satisfies PolicyDetail);
}

function clauses(): HttpResponse<unknown> {
    const d = db();
    const out = d.policies
        .filter(p => p.active)
        .sort((a, b) => a.sort_order - b.sort_order)
        .flatMap(p => {
            const v = versionsOf(p.oid)[0];
            return v.clauses.map(c => ({
                oid: c.oid,
                policy_title: p.title,
                version: v.version,
                number: c.number,
                heading: c.heading,
                label: `${p.title} v${v.version} §${c.number}: ${c.heading}`
            }));
        });
    return ok(out);
}

/** Records acceptance of the current version of each policy named (or each not accepted yet). */
function accept(ctx: Ctx, m: MemberRow, method: 'portal' | 'paper', only: { policyOids?: string[]; versionOid?: string }): number {
    const list = memberPolicies(m, ctx.now.date);
    let chosen = list.filter(p => p.accepted_version !== p.current_version);
    if (only.policyOids) chosen = chosen.filter(p => only.policyOids!.includes(p.policy_oid));
    if (only.versionOid) {
        const p = list.find(x => x.current_version_oid === only.versionOid);
        if (!p) fail(409, 'This is not the current version. Reload the page to read the new one.');
        chosen = chosen.filter(x => x.policy_oid === p.policy_oid);
    }
    for (const p of chosen) {
        commit({
            t: 'put',
            table: 'acceptances',
            row: {
                oid: newOid('acc'),
                branch_oid: m.branch_oid,
                member_oid: m.oid,
                policy_oid: p.policy_oid,
                version_oid: p.current_version_oid,
                version: p.current_version,
                method,
                recorded_by_name: method === 'paper' ? (ctx.user?.name ?? null) : null,
                accepted_at: ctx.now.iso
            }
        });
    }
    if (chosen.length) recordAudit(ctx, 'accept', 'policy_acceptance', m.code, null, { method, policies: chosen.map(p => `${p.slug} v${p.current_version}`) });
    return chosen.length;
}

/** Called by the members handler when the desk ticks "signed the policies on paper". */
export function acceptAllOnPaper(ctx: Ctx, m: MemberRow): void {
    accept(ctx, m, 'paper', {});
}

function publicList(): HttpResponse<unknown> {
    return ok(
        db()
            .policies.filter(p => p.public && p.active)
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(p => {
                const v = versionsOf(p.oid)[0];
                return { slug: p.slug, title: p.title, summary: p.summary, version: v.version, published_on: v.published_on };
            })
    );
}

function publicOne(ctx: Ctx): HttpResponse<unknown> {
    const p = db().policies.find(x => x.slug === ctx.params[0] && x.public && x.active);
    if (!p) fail(404, 'Policy not found');
    const versions = versionsOf(p.oid);
    const v = versions[0];
    return ok({
        slug: p.slug,
        title: p.title,
        summary: p.summary,
        version: v.version,
        published_on: v.published_on,
        clauses: v.clauses.map(({ number, heading, body }) => ({ number, heading, body })),
        history: versions.map(x => ({ version: x.version, mode: x.mode, change_note: x.change_note, published_on: x.published_on }))
    });
}

/* ---------- discipline ---------- */

interface Caller {
    username: string;
    role: StaffRole;
    giver: GiverRole;
}

function caller(ctx: Ctx): Caller {
    const role = ctx.user?.assignments.find(a => a.branch.oid === ctx.branch?.oid)?.role;
    if (!role || !ctx.account) fail(403, 'Choose a branch first');
    return { username: ctx.account.username, role, giver: giverRole(role, isHq(ctx)) };
}

function visibleIncident(ctx: Ctx, c: Caller, i: IncidentRow): boolean {
    if (i.staff_username === c.username) return false;
    if (c.giver === 'hq') return true;
    return (i.branch_oid === ctx.branch?.oid || i.member_branch_oid === ctx.branch?.oid) && !i.hq_only;
}

const sanctionsOf = (incidentOid: string): SanctionRow[] =>
    db()
        .sanctions.filter(s => s.incident_oid === incidentOid)
        .sort((a, b) => a.given_on.localeCompare(b.given_on));

/** Whether the sanction is about the same person (a member, or a staff member by username). */
const samePerson = (s: SanctionRow, who: { member_oid?: string | null; staff_username?: string | null }): boolean =>
    (!!who.member_oid && s.member_oid === who.member_oid) || (!!who.staff_username && s.staff_username === who.staff_username);

function strikesFor(
    i: Pick<IncidentRow, 'member_oid' | 'staff_username'>,
    today: string
): { list: { level: SanctionLevel; starts_on: string; overturned: boolean; branch_name: string }[]; suggestion: SanctionLevel } {
    const rows = db()
        .sanctions.filter(s => samePerson(s, i))
        .map(s => ({ level: s.level, starts_on: s.starts_on, overturned: !!s.overturned_at, branch_name: branchName(s.branch_oid) }))
        .sort((a, b) => b.starts_on.localeCompare(a.starts_on));
    const list = strikes(rows, today);
    return { list, suggestion: suggestLevel(list.length) };
}

function sanctionWire(s: SanctionRow, today: string, c: Caller | null): Sanction {
    const state = sanctionState(s, today);
    const hqOnly = db().incidents.find(i => i.oid === s.incident_oid)?.hq_only ?? false;
    return {
        oid: s.oid,
        incident_oid: s.incident_oid,
        level: s.level,
        state,
        starts_on: s.starts_on,
        ends_on: s.ends_on,
        scope: s.scope,
        reason: s.reason,
        suggested_level: s.suggested_level,
        choice_reason: s.choice_reason,
        given_by_name: s.given_by_name,
        given_role: s.given_role,
        given_on: s.given_on,
        branch_name: branchName(s.branch_oid),
        membership_cancelled: s.membership_cancelled,
        lifted: s.lifted,
        overturned_at: s.overturned_at,
        appeal: s.appeal
            ? {
                  ...s.appeal,
                  can_decide:
                      c !== null &&
                      s.appeal.status === 'open' &&
                      mayDecideAppeal(c.giver, { level: s.level, given_by: s.given_by, hq_only: hqOnly }, c.username)
              }
            : null,
        appeal_deadline: appealDeadline(s.given_on),
        can_lift: c !== null && state === 'in_force' && mayLift(c.giver, { level: s.level, scope: s.scope, given_role: s.given_role, hq_only: hqOnly })
    };
}

function listItem(i: IncidentRow, today: string): IncidentListItem {
    const steps = sanctionsOf(i.oid);
    const latest = steps.at(-1);
    const staffOid = i.staff_username ? (db().accounts.find(a => a.username === i.staff_username)?.user.user_id ?? i.staff_username) : null;
    return {
        oid: i.oid,
        branch: { oid: i.branch_oid, name: branchName(i.branch_oid) },
        subject: { kind: i.subject_kind, member_oid: i.member_oid, staff_oid: staffOid, name: i.subject_name, code: i.subject_code, role: i.subject_role },
        occurred_at: i.occurred_at,
        category: i.category,
        summary: i.summary,
        clause_label: i.clause_label,
        hq_only: i.hq_only,
        reported_by_name: i.reported_by_name,
        reported_role: i.reported_role,
        closed: i.closed_at !== null,
        latest: latest ? { level: latest.level, state: sanctionState(latest, today) } : null,
        steps: steps.length,
        open_appeal: steps.some(s => s.appeal?.status === 'open'),
        created_at: i.created_at
    };
}

function detail(ctx: Ctx, c: Caller, i: IncidentRow): IncidentDetail {
    const today = ctx.now.date;
    const { list, suggestion } = strikesFor(i, today);
    const open = i.closed_at === null;
    return {
        ...listItem(i, today),
        description: i.description,
        witnesses: i.witnesses,
        internal_notes: i.internal_notes,
        evidence: i.evidence_file_oids.flatMap(oid => {
            const f = db().files?.find(x => x.oid === oid && x.status === 'ready');
            return f ? [{ oid: f.oid, name: f.name, content_type: f.content_type, url: fileUrl(f.oid) ?? '' }] : [];
        }),
        sanctions: sanctionsOf(i.oid).map(s => sanctionWire(s, today, c)),
        strikes: list.map(s => ({ level: s.level, starts_on: s.starts_on, branch_name: s.branch_name })),
        suggestion,
        actions: {
            levels: open ? allowedLevels(c.giver, { hq_only: i.hq_only, about_caller: i.staff_username === c.username }) : [],
            ban_scopes: open ? banScopes(c.giver) : [],
            can_edit: c.giver === 'hq' || (c.giver === 'manager' && !i.hq_only)
        }
    };
}

function incidentIn(ctx: Ctx, c: Caller, oid: string): IncidentRow {
    const i = db().incidents.find(x => x.oid === oid);
    if (!i || !visibleIncident(ctx, c, i)) fail(404, 'Case not found');
    return i;
}

function listIncidents(ctx: Ctx): HttpResponse<unknown> {
    const c = caller(ctx);
    const status = qStr(ctx, 'status');
    const kind = qStr(ctx, 'kind');
    const appeal = qStr(ctx, 'appeal');
    const q = qStr(ctx, 'q').toLowerCase();
    const rows = db()
        .incidents.filter(i => visibleIncident(ctx, c, i))
        .filter(i => !status || (status === 'open') === (i.closed_at === null))
        .filter(i => !kind || i.subject_kind === kind)
        .filter(i => !q || `${i.subject_name} ${i.subject_code} ${i.summary}`.toLowerCase().includes(q))
        .filter(i => appeal !== 'open' || sanctionsOf(i.oid).some(s => s.appeal?.status === 'open'))
        .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
        .map(i => listItem(i, ctx.now.date));
    return ok(rows);
}

function staffSubjects(ctx: Ctx): HttpResponse<unknown> {
    const c = caller(ctx);
    const at = qStr(ctx, 'branch_oid') || ctx.branch!.oid;
    return ok(
        db()
            .accounts.filter(a => a.user.kind === 'staff' && a.username !== c.username && a.status !== 'Inactive')
            .flatMap(a => {
                const role = a.user.assignments.find(x => x.branch.oid === at)?.role;
                return role && STAFF_ROLES.includes(role) ? [{ oid: a.user.user_id, name: a.user.name, username: a.username, role }] : [];
            })
            .sort((a, b) => a.name.localeCompare(b.name))
    );
}

function createIncident(ctx: Ctx): HttpResponse<unknown> {
    const c = caller(ctx);
    const d = db();
    const branchOid = isHq(ctx) ? str(ctx.body['branch_oid']) : ctx.branch!.oid;
    if (!d.branches.some(b => b.oid === branchOid && b.kind === 'BRANCH')) fail(400, 'Choose the branch where it happened');
    const occurred = str(ctx.body['occurred_at']);
    if (!occurred || Date.parse(occurred) > Date.now() + 5 * 60_000) fail(400, 'An incident cannot be in the future');
    if (daysSince(occurred, ctx.now.date) > 30) fail(400, 'Record an incident within 30 days');
    const summary = str(ctx.body['summary']);
    const description = str(ctx.body['description']);
    if (summary.length < 3 || description.length < 3) fail(400, 'Say what happened');
    const kind = str(ctx.body['subject_kind']);
    let member: MemberRow | null = null;
    let staff: { username: string; name: string; role: StaffRole } | null = null;
    if (kind === 'member') {
        member = idx().byCode.get(str(ctx.body['member_code']).toUpperCase()) ?? null;
        if (!member || member.anonymised) fail(404, 'No member with this code');
    } else {
        const a = d.accounts.find(x => x.user.user_id === str(ctx.body['staff_oid']));
        if (a?.username === c.username) fail(400, 'Someone else records a case about you');
        const role = a?.user.assignments.find(x => x.branch.oid === branchOid)?.role;
        if (!a || !role || !STAFF_ROLES.includes(role)) fail(404, 'No such staff member at this branch');
        staff = { username: a.username, name: a.user.name, role };
    }
    const clauseOid = str(ctx.body['clause_oid']) || null;
    let clauseLabel: string | null = null;
    if (clauseOid) {
        const v = d.policyVersions.find(x => x.clauses.some(cl => cl.oid === clauseOid));
        const cl = v?.clauses.find(x => x.oid === clauseOid);
        if (!v || !cl) fail(400, 'Unknown clause');
        clauseLabel = `${d.policies.find(p => p.oid === v.policy_oid)?.title} v${v.version} §${cl.number}: ${cl.heading}`;
    }
    const evidence = (ctx.body['evidence_file_oids'] as string[] | undefined) ?? [];
    for (const f of evidence)
        if (!d.files?.some(x => x.oid === f && x.kind === 'incident_evidence' && x.status === 'ready')) fail(400, 'Upload the file first');
    const hqOnly = staff?.role === 'BRANCH_MANAGER';
    const row: IncidentRow = {
        oid: newOid('inc'),
        branch_oid: branchOid,
        subject_kind: member ? 'member' : 'staff',
        member_oid: member?.oid ?? null,
        member_branch_oid: member?.branch_oid ?? null,
        staff_username: staff?.username ?? null,
        subject_name: member?.name ?? staff!.name,
        subject_code: member?.code ?? staff!.username,
        subject_role: staff?.role ?? null,
        occurred_at: occurred,
        category: str(ctx.body['category']) as IncidentRow['category'],
        summary,
        description,
        clause_oid: clauseOid,
        clause_label: clauseLabel,
        witnesses: str(ctx.body['witnesses']) || null,
        internal_notes: str(ctx.body['internal_notes']) || null,
        evidence_file_oids: evidence,
        hq_only: hqOnly,
        reported_by: c.username,
        reported_by_name: ctx.user?.name ?? null,
        reported_role: c.giver,
        closed_at: null,
        created_at: ctx.now.iso
    };
    commit({ t: 'put', table: 'incidents', row });
    recordAudit(ctx, 'create', 'incident', row.subject_code, null, { category: row.category, summary, clause: clauseLabel, hq_only: hqOnly });
    if (hqOnly && c.giver !== 'hq') return ok({ oid: row.oid, hq_only: true, sent_to_hq: true }, 'Recorded and sent to HQ');
    return ok(detail(ctx, c, row), 'Incident recorded');
}

function updateIncident(ctx: Ctx): HttpResponse<unknown> {
    const c = caller(ctx);
    const i = incidentIn(ctx, c, ctx.params[0]);
    if (!(c.giver === 'hq' || (c.giver === 'manager' && !i.hq_only))) fail(403, 'HQ handles this case');
    const patch: Partial<IncidentRow> = {};
    if ('witnesses' in ctx.body) patch.witnesses = str(ctx.body['witnesses']) || null;
    if ('internal_notes' in ctx.body) patch.internal_notes = str(ctx.body['internal_notes']) || null;
    if (Array.isArray(ctx.body['evidence_file_oids'])) patch.evidence_file_oids = ctx.body['evidence_file_oids'] as string[];
    if ('closed' in ctx.body) patch.closed_at = ctx.body['closed'] === true ? (i.closed_at ?? ctx.now.iso) : null;
    commit({ t: 'patch', table: 'incidents', oid: i.oid, patch });
    recordAudit(ctx, 'update', 'incident', i.subject_code, null, { closed: patch.closed_at !== undefined ? patch.closed_at !== null : undefined });
    return ok(detail(ctx, c, incidentIn(ctx, c, i.oid)), 'Case saved');
}

function setAccountStatus(username: string, status: 'Active' | 'Inactive'): void {
    const a = db().accounts.find(x => x.username === username);
    if (a) commit({ t: 'account.put', account: { ...a, status } });
}

function giveSanction(ctx: Ctx): HttpResponse<unknown> {
    const c = caller(ctx);
    const today = ctx.now.date;
    const i = incidentIn(ctx, c, ctx.params[0]);
    if (i.closed_at) fail(409, 'This case is closed. Reopen it first.');
    const level = str(ctx.body['level']) as SanctionLevel;
    const levels = allowedLevels(c.giver, { hq_only: i.hq_only, about_caller: i.staff_username === c.username });
    if (!levels.includes(level)) {
        fail(
            403,
            i.hq_only
                ? 'HQ handles cases about a branch manager.'
                : levels.length
                  ? `You can give a ${levels.map(l => LEVEL_LABEL[l].toLowerCase()).join(' or ')}. Ask a branch manager for more.`
                  : 'You cannot give a step on this case.'
        );
    }
    const reason = str(ctx.body['reason']);
    if (reason.length < 3) fail(400, 'reason: At least 3 characters');
    const { suggestion } = strikesFor(i, today);
    const choice = str(ctx.body['choice_reason']) || null;
    if (level !== suggestion && !choice) fail(400, `The suggested step is a ${LEVEL_LABEL[suggestion].toLowerCase()}. Say why you chose another.`);
    let startsOn = today;
    let endsOn: string | null = null;
    let scope: SanctionRow['scope'] = null;
    if (level === 'suspension') {
        startsOn = str(ctx.body['starts_on']) || today;
        endsOn = str(ctx.body['ends_on']) || null;
        if (!endsOn) fail(400, 'A suspension needs an end date');
        if (startsOn < today || startsOn > addDaysIso(today, 30)) fail(400, 'Start a suspension today or within 30 days');
        if (endsOn < startsOn || endsOn > addDaysIso(startsOn, 89)) fail(400, 'A suspension lasts 1 to 90 days');
    }
    if (level === 'ban') {
        scope = (str(ctx.body['scope']) as 'branch' | 'all') || 'branch';
        if (!banScopes(c.giver).includes(scope)) fail(403, 'Only HQ bans at every branch.');
        const already = db().sanctions.some(
            s => s.level === 'ban' && !s.lifted && !s.overturned_at && samePerson(s, i) && (s.scope === 'all' || s.branch_oid === i.branch_oid)
        );
        if (already) fail(409, `${i.subject_name} is already banned here.`);
    }
    let cancelled = false;
    if (level === 'ban' && i.member_oid && (scope === 'all' || i.branch_oid === i.member_branch_oid)) {
        for (const s of db().subscriptions.filter(x => x.member_oid === i.member_oid && x.kind !== 'pt' && !x.cancelled_at && x.end_date >= today)) {
            const end = s.start_date > today ? addDaysIso(s.start_date, -1) : addDaysIso(today, -1);
            commit({ t: 'subscription.end', oid: s.oid, end_date: end, reason: `Banned: ${reason}`, at: ctx.now.iso, upgraded_to: null });
            recordAudit(ctx, 'cancel', 'subscription', i.subject_code, { end_date: s.end_date }, { end_date: end });
            cancelled = true;
        }
    }
    const row: SanctionRow = {
        oid: newOid('san'),
        branch_oid: i.branch_oid,
        incident_oid: i.oid,
        member_oid: i.member_oid,
        member_branch_oid: i.member_branch_oid,
        staff_username: i.staff_username,
        level,
        starts_on: startsOn,
        ends_on: endsOn,
        scope,
        reason,
        suggested_level: suggestion,
        choice_reason: level === suggestion ? null : choice,
        given_by: c.username,
        given_by_name: ctx.user?.name ?? '',
        given_role: c.giver,
        given_on: today,
        membership_cancelled: cancelled,
        lifted: null,
        overturned_at: null,
        appeal: null
    };
    commit({ t: 'put', table: 'sanctions', row });
    // Staff: a ban deactivates the account at every branch; a suspension is checked at sign-in.
    if (i.staff_username && level === 'ban') setAccountStatus(i.staff_username, 'Inactive');
    recordAudit(ctx, 'sanction', 'sanction', i.subject_code, null, { level, suggested: suggestion, reason, starts_on: startsOn, ends_on: endsOn, scope });
    return ok(detail(ctx, c, i), 'Step recorded');
}

function sanctionIn(ctx: Ctx, c: Caller, oid: string): { s: SanctionRow; i: IncidentRow } {
    const s = db().sanctions.find(x => x.oid === oid || x.appeal?.oid === oid);
    if (!s) fail(404, 'Not found');
    return { s, i: incidentIn(ctx, c, s.incident_oid) };
}

function liftBan(ctx: Ctx): HttpResponse<unknown> {
    const c = caller(ctx);
    const { s, i } = sanctionIn(ctx, c, ctx.params[0]);
    if (s.level !== 'ban' || sanctionState(s, ctx.now.date) !== 'in_force') fail(409, 'Only a ban in force can be lifted.');
    if (!mayLift(c.giver, { level: s.level, scope: s.scope, given_role: s.given_role, hq_only: i.hq_only })) fail(403, 'HQ lifts this ban.');
    const reason = str(ctx.body['reason']);
    if (reason.length < 3) fail(400, 'reason: At least 3 characters');
    commit({ t: 'patch', table: 'sanctions', oid: s.oid, patch: { lifted: { at: ctx.now.iso, by: ctx.user?.name ?? '', reason } } });
    if (s.staff_username) setAccountStatus(s.staff_username, 'Active');
    recordAudit(ctx, 'lift', 'sanction', i.subject_code, { level: 'ban', scope: s.scope }, { reason });
    return ok(detail(ctx, c, i), 'Ban lifted');
}

function decideAppeal(ctx: Ctx): HttpResponse<unknown> {
    const c = caller(ctx);
    const { s, i } = sanctionIn(ctx, c, ctx.params[0]);
    if (s.appeal?.status !== 'open') fail(409, 'This appeal is already decided.');
    if (!mayDecideAppeal(c.giver, { level: s.level, given_by: s.given_by, hq_only: i.hq_only }, c.username))
        fail(403, s.given_by === c.username ? 'Someone other than you decides an appeal against your own step.' : 'HQ decides this appeal.');
    const decision = str(ctx.body['decision']) as 'upheld' | 'rejected';
    if (decision !== 'upheld' && decision !== 'rejected') fail(400, 'Uphold or reject');
    const note = str(ctx.body['note']);
    if (note.length < 3) fail(400, 'note: At least 3 characters');
    const patch: Partial<SanctionRow> = {
        appeal: { ...s.appeal, status: decision, decided_by_name: ctx.user?.name ?? null, decision_note: note, decided_at: ctx.now.iso }
    };
    if (decision === 'upheld') patch.overturned_at = ctx.now.iso;
    commit({ t: 'patch', table: 'sanctions', oid: s.oid, patch });
    if (decision === 'upheld' && s.staff_username && s.level === 'ban' && !s.lifted) setAccountStatus(s.staff_username, 'Active');
    recordAudit(ctx, decision === 'upheld' ? 'uphold' : 'reject', 'appeal', i.subject_code, { status: 'open' }, { status: decision, note });
    return ok(detail(ctx, c, i), decision === 'upheld' ? 'Appeal upheld' : 'Appeal rejected');
}

function memberDiscipline(ctx: Ctx): HttpResponse<unknown> {
    const c = caller(ctx);
    const m = branchMember(ctx, ctx.params[0]);
    const today = ctx.now.date;
    const incidents = db().incidents.filter(i => i.member_oid === m.oid && visibleIncident(ctx, c, i));
    const { list, suggestion } = strikesFor({ member_oid: m.oid, staff_username: null }, today);
    return ok({
        incidents: incidents.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).map(i => listItem(i, today)),
        sanctions: incidents
            .flatMap(i => sanctionsOf(i.oid))
            .sort((a, b) => b.given_on.localeCompare(a.given_on))
            .map(s => sanctionWire(s, today, c)),
        strikes: list.length,
        suggestion
    });
}

/** What the person sees: the sanction, the clause and the reason. */
function ownWire(s: SanctionRow, today: string): OwnSanction {
    const state = sanctionState(s, today);
    const deadline = appealDeadline(s.given_on);
    const i = db().incidents.find(x => x.oid === s.incident_oid);
    return {
        oid: s.oid,
        level: s.level,
        state,
        starts_on: s.starts_on,
        ends_on: s.ends_on,
        scope: s.scope,
        branch_name: branchName(s.branch_oid),
        reason: s.reason,
        clause_label: i?.clause_label ?? null,
        given_on: s.given_on,
        appeal: s.appeal
            ? {
                  status: s.appeal.status,
                  body: s.appeal.body,
                  filed_at: s.appeal.filed_at,
                  decision_note: s.appeal.decision_note,
                  decided_at: s.appeal.decided_at
              }
            : null,
        appeal_deadline: deadline,
        can_appeal: !s.appeal && state !== 'overturned' && today <= deadline
    };
}

function ownRecord(who: { member_oid?: string; username?: string }, today: string): OwnSanction[] {
    return db()
        .sanctions.filter(s => samePerson(s, { member_oid: who.member_oid, staff_username: who.username }))
        .sort((a, b) => b.given_on.localeCompare(a.given_on))
        .map(s => ownWire(s, today));
}

function fileAppeal(ctx: Ctx, who: { member_oid?: string; username?: string }): HttpResponse<unknown> {
    const s = db().sanctions.find(x => x.oid === ctx.params[0] && samePerson(x, { member_oid: who.member_oid, staff_username: who.username }));
    if (!s) fail(404, 'Not found');
    if (s.appeal) fail(409, 'You have already appealed this.');
    const own = ownWire(s, ctx.now.date);
    if (!own.can_appeal) fail(409, `Appeals are filed within 7 days, by ${shortDate(own.appeal_deadline)}.`);
    const body = str(ctx.body['body']);
    if (body.length < 10) fail(400, 'body: At least 10 characters');
    commit({
        t: 'patch',
        table: 'sanctions',
        oid: s.oid,
        patch: {
            appeal: {
                oid: newOid('apl'),
                body,
                status: 'open',
                filed_at: ctx.now.iso,
                filed_by_name: ctx.user?.name ?? '',
                decided_by_name: null,
                decision_note: null,
                decided_at: null
            }
        }
    });
    const i = db().incidents.find(x => x.oid === s.incident_oid);
    recordAudit({ ...ctx, branch: db().branches.find(b => b.oid === s.branch_oid) ?? null }, 'appeal', 'appeal', i?.subject_code ?? s.oid, null, {
        level: s.level
    });
    return ok(
        ownWire(
            db().sanctions.find(x => x.oid === s.oid)!,
            ctx.now.date
        ),
        'Appeal sent'
    );
}

/* ---------- complaints ---------- */

const DAY_MS = 86_400_000;

function effectiveStatus(c: ComplaintRow, now: number): ComplaintStatus {
    if (c.status === 'resolved' && c.resolved_at && now - Date.parse(c.resolved_at) > 7 * DAY_MS) return 'closed';
    return c.status;
}

function complaintWire(c: ComplaintRow, now: number, member = false): Complaint {
    const hours = db().settings.complaint_response_hours;
    const status = effectiveStatus(c, now);
    const created = Date.parse(c.created_at);
    return {
        oid: c.oid,
        code: c.code,
        branch: { oid: c.branch_oid, name: branchName(c.branch_oid) },
        member_oid: c.member_oid,
        member_code: c.member_code,
        member_name: c.member_name,
        category: c.category,
        subject: c.subject,
        body: c.body,
        photo_url: c.photo_file_oid ? fileUrl(c.photo_file_oid) : null,
        named_staff_name: c.named_staff_name,
        hq_only: member ? false : c.hq_only,
        filed_via: c.filed_via,
        status,
        overdue: c.status === 'open' && !c.first_response_at && now > created + hours * 3_600_000,
        due_at: new Date(created + hours * 3_600_000).toISOString(),
        first_response_at: c.first_response_at,
        resolution: c.resolution,
        resolved_at: c.resolved_at,
        escalated: c.escalated,
        member_accepted_at: c.member_accepted_at,
        closes_at: status === 'resolved' && c.resolved_at ? new Date(Date.parse(c.resolved_at) + 7 * DAY_MS).toISOString() : null,
        can_respond: status === 'resolved' && !!c.resolved_at && now - Date.parse(c.resolved_at) <= 7 * DAY_MS,
        created_at: c.created_at,
        updates: c.updates
    };
}

function visibleComplaint(ctx: Ctx, c: ComplaintRow): boolean {
    if (c.named_staff === ctx.account?.username) return false;
    return isHq(ctx) || (c.branch_oid === ctx.branch?.oid && !c.hq_only);
}

function complaintIn(ctx: Ctx, oid: string): ComplaintRow {
    const c = db().complaints.find(x => x.oid === oid);
    if (!c) fail(404, 'Complaint not found');
    if (!visibleComplaint(ctx, c))
        fail(
            c.named_staff === ctx.account?.username ? 403 : 404,
            c.named_staff === ctx.account?.username ? 'You do not have permission to do this' : 'Complaint not found'
        );
    return c;
}

function listComplaints(ctx: Ctx): HttpResponse<unknown> {
    const now = Date.now();
    const status = qStr(ctx, 'status');
    const rows = db()
        .complaints.filter(c => visibleComplaint(ctx, c))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map(c => complaintWire(c, now))
        .filter(c => !status || (status === 'active' ? c.status !== 'closed' : c.status === status))
        .filter(c => qStr(ctx, 'overdue') !== '1' || c.overdue)
        .filter(c => qStr(ctx, 'escalated') !== '1' || c.escalated !== null);
    return ok(rows);
}

function branchStaff(branchOid: string): { oid: string; name: string; role: StaffRole; username: string }[] {
    return db().accounts.flatMap(a => {
        const role = a.user.kind === 'staff' && a.status !== 'Inactive' ? a.user.assignments.find(x => x.branch.oid === branchOid)?.role : undefined;
        return role && STAFF_ROLES.includes(role) ? [{ oid: a.user.user_id, name: a.user.name, role, username: a.username }] : [];
    });
}

function newComplaint(ctx: Ctx, branchOid: string, member: { oid: string | null; code: string | null; name: string }, via: 'portal' | 'desk'): ComplaintRow {
    const d = db();
    const category = str(ctx.body['category']) as ComplaintRow['category'];
    const subject = str(ctx.body['subject']);
    const body = str(ctx.body['body']);
    if (subject.length < 3) fail(400, 'subject: At least 3 characters');
    if (body.length < 10) fail(400, 'body: At least 10 characters');
    const namedOid = str(ctx.body['named_staff_oid']);
    const named = namedOid ? branchStaff(branchOid).find(s => s.oid === namedOid) : undefined;
    if (namedOid && !named) fail(400, 'No such staff member at this branch');
    if (via === 'desk' && named?.username === ctx.account?.username) fail(400, 'Ask a colleague to file a complaint about you.');
    const code = d.branches.find(b => b.oid === branchOid)!.code;
    const seq = (d.counters[`complaint:${code}`] ?? 0) + 1;
    const row: ComplaintRow = {
        oid: newOid('cmp'),
        branch_oid: branchOid,
        code: `CMP-${code}-${String(seq).padStart(5, '0')}`,
        member_oid: member.oid,
        member_code: member.code,
        member_name: member.name,
        category,
        subject,
        body,
        photo_file_oid: str(ctx.body['photo_file_oid']) || null,
        named_staff: named?.username ?? null,
        named_staff_name: named?.name ?? null,
        hq_only: named?.role === 'BRANCH_MANAGER',
        filed_via: via,
        status: 'open',
        first_response_at: null,
        resolution: null,
        resolved_at: null,
        escalated: null,
        member_accepted_at: null,
        created_at: ctx.now.iso,
        updates: []
    };
    d.counters[`complaint:${code}`] = seq;
    commit({ t: 'put', table: 'complaints', row });
    return row;
}

function createComplaint(ctx: Ctx): HttpResponse<unknown> {
    const memberOid = str(ctx.body['member_oid']);
    const m = memberOid ? branchMember(ctx, memberOid) : null;
    const name = m?.name ?? str(ctx.body['member_name']);
    if (!m && name.length < 2) fail(400, 'Choose the member, or give the person’s name');
    const row = newComplaint(ctx, ctx.branch!.oid, { oid: m?.oid ?? null, code: m?.code ?? null, name }, 'desk');
    recordAudit(ctx, 'create', 'complaint', row.code, null, { via: 'desk', category: row.category });
    if (row.hq_only && !isHq(ctx)) return ok({ oid: row.oid, sent_to_hq: true }, 'Complaint filed and sent to HQ');
    return ok(complaintWire(row, Date.now()), 'Complaint filed');
}

function putComplaint(c: ComplaintRow): void {
    commit({ t: 'put', table: 'complaints', row: structuredClone(c) });
}

function replyComplaint(ctx: Ctx): HttpResponse<unknown> {
    const c = structuredClone(complaintIn(ctx, ctx.params[0]));
    const now = Date.now();
    const status = effectiveStatus(c, now);
    if (status === 'closed') fail(409, 'This complaint is closed.');
    const body = str(ctx.body['body']);
    if (body.length < 2) fail(400, 'body: Required');
    const asked = str(ctx.body['status']) as 'in_progress' | 'resolved' | '';
    const next: ComplaintStatus = asked || (status === 'open' ? 'in_progress' : status);
    c.updates.push({
        oid: newOid('cu'),
        author: 'staff',
        author_name: ctx.user?.name ?? 'Staff',
        body,
        status: next === status ? null : next,
        at: ctx.now.iso
    });
    c.status = next;
    c.first_response_at ??= ctx.now.iso;
    if (next === 'resolved') Object.assign(c, { resolution: body, resolved_at: ctx.now.iso });
    putComplaint(c);
    recordAudit(ctx, next === 'resolved' ? 'resolve' : 'reply', 'complaint', c.code, { status }, { status: next });
    return ok(complaintWire(c, now), next === 'resolved' ? 'Marked resolved' : 'Reply sent');
}

function escalate(ctx: Ctx, c: ComplaintRow, by: 'manager' | 'member', reason: string): void {
    const status = effectiveStatus(c, Date.now());
    const next: ComplaintStatus = status === 'resolved' || status === 'open' ? 'in_progress' : status;
    c.escalated = { at: ctx.now.iso, by, reason };
    c.updates.push({
        oid: newOid('cu'),
        author: by === 'member' ? 'member' : 'staff',
        author_name: ctx.user?.name ?? c.member_name,
        body: `Escalated to HQ: ${reason}`,
        status: next === status ? null : next,
        at: ctx.now.iso
    });
    c.status = next;
    putComplaint(c);
    recordAudit(ctx, 'escalate', 'complaint', c.code, { status }, { status: next, by, reason });
}

function escalateComplaint(ctx: Ctx): HttpResponse<unknown> {
    if (isHq(ctx)) fail(409, 'HQ already has it.');
    const c = structuredClone(complaintIn(ctx, ctx.params[0]));
    if (c.escalated) fail(409, 'This complaint is already with HQ.');
    if (effectiveStatus(c, Date.now()) === 'closed') fail(409, 'This complaint is closed.');
    const reason = str(ctx.body['reason']);
    if (reason.length < 3) fail(400, 'reason: At least 3 characters');
    escalate(ctx, c, 'manager', reason);
    return ok(complaintWire(c, Date.now()), 'Sent to HQ');
}

function myComplaint(m: MemberRow, oid: string): ComplaintRow {
    const c = db().complaints.find(x => x.oid === oid && x.member_oid === m.oid);
    if (!c) fail(404, 'Complaint not found');
    return structuredClone(c);
}

function memberAction(ctx: Ctx, kind: 'reply' | 'accept' | 'escalate'): HttpResponse<unknown> {
    const { m, c: hc } = portalHome(ctx);
    const c = myComplaint(m, ctx.params[0]);
    const now = Date.now();
    const view = complaintWire(c, now, true);
    if (view.status === 'closed') fail(409, 'This complaint is closed.');
    if (kind === 'reply') {
        const body = str(ctx.body['body']);
        if (body.length < 2) fail(400, 'body: Required');
        c.updates.push({ oid: newOid('cu'), author: 'member', author_name: c.member_name, body, status: null, at: ctx.now.iso });
        putComplaint(c);
        recordAudit(hc, 'reply', 'complaint', c.code, null, { by: 'member' });
        return ok(complaintWire(c, now, true), 'Reply sent');
    }
    if (!view.can_respond) fail(409, 'There is no resolution to answer yet.');
    if (kind === 'accept') {
        c.updates.push({ oid: newOid('cu'), author: 'member', author_name: c.member_name, body: 'Accepted the resolution', status: 'closed', at: ctx.now.iso });
        Object.assign(c, { status: 'closed', member_accepted_at: ctx.now.iso });
        putComplaint(c);
        recordAudit(hc, 'accept', 'complaint', c.code, { status: 'resolved' }, { status: 'closed' });
        return ok(complaintWire(c, now, true), 'Thanks: the complaint is closed');
    }
    if (c.escalated?.by === 'member') fail(409, 'You have already sent this to HQ.');
    const reason = str(ctx.body['reason']);
    if (reason.length < 3) fail(400, 'reason: At least 3 characters');
    escalate(hc, c, 'member', reason);
    return ok(complaintWire(c, now, true), 'Sent to HQ');
}

/* ---------- NPS and ratings ---------- */

function rateable(m: MemberRow, nowIso: string): Rateable[] {
    const d = db();
    const from = new Date(Date.now() - 7 * DAY_MS).toISOString();
    const nowMs = Date.parse(nowIso);
    const sessions = new Map(d.sessions.map(s => [s.oid, s]));
    const classes = d.bookings.flatMap(b => {
        const s = sessions.get(b.session_oid);
        if (!s || b.member_oid !== m.oid || b.status !== 'Attended' || Date.parse(s.starts_at) < Date.parse(from) || Date.parse(s.starts_at) > nowMs) return [];
        if (d.ratings.some(r => r.booking_oid === b.oid)) return [];
        return [
            {
                kind: 'class' as const,
                booking_oid: b.oid,
                pt_session_oid: null,
                label: s.title,
                trainer_oid: s.trainer_oid,
                trainer_name: s.trainer_name,
                at: s.starts_at
            }
        ];
    });
    const pt = d.ptSessions.flatMap(p =>
        p.member_oid === m.oid &&
        p.status === 'Completed' &&
        Date.parse(p.starts_at) >= Date.parse(from) &&
        Date.parse(p.starts_at) <= nowMs &&
        !d.ratings.some(r => r.pt_session_oid === p.oid)
            ? [
                  {
                      kind: 'pt' as const,
                      booking_oid: null,
                      pt_session_oid: p.oid,
                      label: 'PT session',
                      trainer_oid: p.trainer_oid,
                      trainer_name: p.trainer_name,
                      at: p.starts_at
                  }
              ]
            : []
    );
    return [...classes, ...pt].sort((a, b) => b.at.localeCompare(a.at)).map(r => ({ ...r, until: addDaysIso(r.at.slice(0, 10), 7) }));
}

function npsDue(m: MemberRow, today: string): boolean {
    if (m.pending || daysSince(m.joined_on, today) < 30) return false;
    const last = db()
        .nps.filter(r => r.member_oid === m.oid)
        .map(r => r.created_at.slice(0, 10))
        .sort()
        .at(-1);
    return !last || daysSince(last, today) >= 90;
}

function myFeedback(ctx: Ctx, m: MemberRow): MyFeedback {
    return {
        nps_due: npsDue(m, ctx.now.date),
        rateable: rateable(m, ctx.now.iso),
        ratings: db()
            .ratings.filter(r => r.member_oid === m.oid)
            .sort((a, b) => b.session_at.localeCompare(a.session_at))
            .slice(0, 20)
            .map(r => ({
                oid: r.oid,
                kind: r.kind,
                label: r.label,
                trainer_name: r.trainer_name,
                session_at: r.session_at,
                score: r.score,
                comment: r.comment
            }))
    };
}

function npsScore(scores: number[]): number | null {
    if (!scores.length) return null;
    return Math.round(((scores.filter(s => s >= 9).length - scores.filter(s => s <= 6).length) / scores.length) * 100);
}

function feedbackReport(ctx: Ctx): HttpResponse<unknown> {
    const days = Number(qStr(ctx, 'days')) || 90;
    const from = new Date(Date.now() - days * DAY_MS).toISOString();
    const d = db();
    const inScope = (branchOid: string): boolean => isHq(ctx) || branchOid === ctx.branch!.oid;
    const ratings = d.ratings.filter(r => inScope(r.branch_oid) && r.created_at >= from);
    const averages = (rows: typeof ratings): TrainerAverage[] => {
        const by = new Map<string, typeof ratings>();
        for (const r of rows) if (r.trainer_oid) (by.get(r.trainer_oid) ?? by.set(r.trainer_oid, []).get(r.trainer_oid)!).push(r);
        const avg = (xs: number[]): number | null => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);
        return [...by.entries()]
            .map(([oid, list]) => {
                const cls = list.filter(r => r.kind === 'class').map(r => r.score);
                const pt = list.filter(r => r.kind === 'pt').map(r => r.score);
                return {
                    trainer_oid: oid,
                    trainer_name: list[0].trainer_name ?? '',
                    class_avg: avg(cls),
                    class_count: cls.length,
                    pt_avg: avg(pt),
                    pt_count: pt.length
                };
            })
            .sort((a, b) => a.trainer_name.localeCompare(b.trainer_name));
    };
    if (ctx.user?.assignments.find(a => a.branch.oid === ctx.branch?.oid)?.role === 'TRAINER') {
        const mine = ctx.account?.trainer_oid ?? null;
        const row = averages(ratings.filter(r => r.trainer_oid === mine))[0];
        return ok({
            days,
            trainer: mine
                ? (row ?? { trainer_oid: mine, trainer_name: ctx.user?.name ?? '', class_avg: null, class_count: 0, pt_avg: null, pt_count: 0 })
                : null
        });
    }
    const answers = d.nps.filter(r => inScope(r.branch_oid) && r.created_at >= from).sort((a, b) => b.created_at.localeCompare(a.created_at));
    const scored = answers.flatMap(a => (a.score === null ? [] : [a.score]));
    return ok({
        days,
        nps: {
            score: npsScore(scored),
            responses: scored.length,
            promoters: scored.filter(s => s >= 9).length,
            passives: scored.filter(s => s === 7 || s === 8).length,
            detractors: scored.filter(s => s <= 6).length,
            dismissed: answers.length - scored.length
        },
        answers: answers
            .filter(a => a.score !== null)
            .map(a => {
                const m = idx().members.get(a.member_oid);
                return {
                    oid: a.oid,
                    branch_name: branchName(a.branch_oid),
                    member_code: m?.code ?? '',
                    member_name: m?.name ?? '',
                    score: a.score!,
                    comment: a.comment,
                    created_at: a.created_at
                };
            }),
        ratings: ratings
            .sort((a, b) => b.session_at.localeCompare(a.session_at))
            .slice(0, 200)
            .map(r => ({
                oid: r.oid,
                branch_name: branchName(r.branch_oid),
                member_name: r.member_name,
                kind: r.kind,
                label: r.label,
                trainer_name: r.trainer_name,
                session_at: r.session_at,
                score: r.score,
                comment: r.comment
            })),
        trainers: averages(ratings)
    });
}

/* ---------- routes ---------- */

const portal = (fn: (ctx: Ctx, m: MemberRow, c: Ctx) => HttpResponse<unknown>) => (ctx: Ctx) => {
    const { m, c } = portalHome(ctx);
    return fn(ctx, m, c);
};

export const GOVERNANCE_ROUTES: Route[] = [
    // Policies
    {
        method: 'GET',
        path: /^\/v1\/policies$/,
        scope: 'staff',
        can: ['read', 'Policy'],
        handler: ctx =>
            ok(
                db()
                    .policies.filter(p => qStr(ctx, 'all') === '1' || p.active)
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map(policyWire)
            )
    },
    { method: 'GET', path: /^\/v1\/policy-clauses$/, scope: 'staff', can: ['read', 'Policy'], handler: clauses },
    { method: 'GET', path: /^\/v1\/policies\/([\w-]+)$/, scope: 'staff', can: ['read', 'Policy'], handler: getPolicy },
    { method: 'POST', path: /^\/v1\/hq\/policies$/, scope: 'hq', can: ['create', 'Policy'], handler: createPolicy },
    { method: 'PATCH', path: /^\/v1\/hq\/policies\/([\w-]+)$/, scope: 'hq', can: ['update', 'Policy'], handler: updatePolicy },
    { method: 'POST', path: /^\/v1\/hq\/policies\/([\w-]+)\/versions$/, scope: 'hq', can: ['create', 'Policy'], handler: publishVersion },
    {
        method: 'GET',
        path: /^\/v1\/members\/([\w-]+)\/policies$/,
        scope: 'branch',
        can: ['read', 'Member'],
        handler: ctx => ok(memberPolicies(branchMember(ctx, ctx.params[0]), ctx.now.date))
    },
    {
        method: 'POST',
        path: /^\/v1\/members\/([\w-]+)\/policies\/accept$/,
        scope: 'branch',
        can: ['update', 'Member'],
        handler: ctx => {
            const m = branchMember(ctx, ctx.params[0]);
            const only = ctx.body['policy_oids'] as string[] | undefined;
            const n = accept(ctx, m, 'paper', only ? { policyOids: only } : {});
            return ok({ recorded: n, policies: memberPolicies(m, ctx.now.date) }, n ? `Signed on paper: ${n} recorded` : 'Nothing to record');
        }
    },
    { method: 'GET', path: /^\/v1\/me\/policies$/, scope: 'member', handler: portal((ctx, m) => ok(memberPolicies(m, ctx.now.date))) },
    { method: 'GET', path: /^\/v1\/me\/policies\/([\w-]+)$/, scope: 'member', handler: getPolicy },
    {
        method: 'POST',
        path: /^\/v1\/me\/policies\/accept$/,
        scope: 'member',
        can: ['update', 'Portal'],
        handler: portal((ctx, m, c) => {
            accept(c, m, 'portal', { versionOid: str(ctx.body['version_oid']) });
            return ok(memberPolicies(m, ctx.now.date), 'Accepted');
        })
    },
    { method: 'GET', path: /^\/v1\/public\/policies$/, scope: 'public', handler: publicList },
    { method: 'GET', path: /^\/v1\/public\/policies\/([\w-]+)$/, scope: 'public', handler: publicOne },

    // Discipline
    { method: 'GET', path: /^\/v1\/incidents$/, scope: 'staff', can: ['read', 'Incident'], handler: listIncidents },
    { method: 'GET', path: /^\/v1\/incidents\/staff$/, scope: 'staff', can: ['create', 'Incident'], handler: staffSubjects },
    {
        method: 'GET',
        path: /^\/v1\/incidents\/([\w-]+)$/,
        scope: 'staff',
        can: ['read', 'Incident'],
        handler: ctx => ok(detail(ctx, caller(ctx), incidentIn(ctx, caller(ctx), ctx.params[0])))
    },
    { method: 'POST', path: /^\/v1\/incidents$/, scope: 'staff', can: ['create', 'Incident'], handler: createIncident },
    { method: 'PATCH', path: /^\/v1\/incidents\/([\w-]+)$/, scope: 'staff', can: ['manage', 'Incident'], handler: updateIncident },
    { method: 'POST', path: /^\/v1\/incidents\/([\w-]+)\/sanctions$/, scope: 'staff', can: ['create', 'Incident'], handler: giveSanction },
    { method: 'POST', path: /^\/v1\/sanctions\/([\w-]+)\/lift$/, scope: 'staff', can: ['manage', 'Incident'], handler: liftBan },
    { method: 'POST', path: /^\/v1\/appeals\/([\w-]+)\/decide$/, scope: 'staff', can: ['manage', 'Incident'], handler: decideAppeal },
    { method: 'GET', path: /^\/v1\/members\/([\w-]+)\/discipline$/, scope: 'branch', can: ['read', 'Incident'], handler: memberDiscipline },
    {
        method: 'GET',
        path: /^\/v1\/my-record$/,
        scope: 'user',
        handler: ctx => {
            if (ctx.user?.kind !== 'staff') fail(403, 'Staff only');
            return ok(ownRecord({ username: ctx.account!.username }, ctx.now.date));
        }
    },
    {
        method: 'POST',
        path: /^\/v1\/my-record\/([\w-]+)\/appeal$/,
        scope: 'user',
        handler: ctx => {
            if (ctx.user?.kind !== 'staff') fail(403, 'Staff only');
            return fileAppeal(ctx, { username: ctx.account!.username });
        }
    },
    { method: 'GET', path: /^\/v1\/me\/record$/, scope: 'member', handler: portal((ctx, m) => ok(ownRecord({ member_oid: m.oid }, ctx.now.date))) },
    {
        method: 'POST',
        path: /^\/v1\/me\/record\/([\w-]+)\/appeal$/,
        scope: 'member',
        can: ['create', 'Portal'],
        handler: portal((ctx, m) => fileAppeal(ctx, { member_oid: m.oid }))
    },

    // Complaints
    { method: 'GET', path: /^\/v1\/complaints$/, scope: 'staff', can: ['read', 'Complaint'], handler: listComplaints },
    {
        method: 'GET',
        path: /^\/v1\/complaints\/([\w-]+)$/,
        scope: 'staff',
        can: ['read', 'Complaint'],
        handler: ctx => ok(complaintWire(complaintIn(ctx, ctx.params[0]), Date.now()))
    },
    { method: 'POST', path: /^\/v1\/complaints$/, scope: 'branch', can: ['create', 'Complaint'], handler: createComplaint },
    { method: 'POST', path: /^\/v1\/complaints\/([\w-]+)\/updates$/, scope: 'staff', can: ['update', 'Complaint'], handler: replyComplaint },
    { method: 'POST', path: /^\/v1\/complaints\/([\w-]+)\/escalate$/, scope: 'staff', can: ['manage', 'Complaint'], handler: escalateComplaint },
    {
        method: 'GET',
        path: /^\/v1\/me\/complaints$/,
        scope: 'member',
        handler: portal((_ctx, m) =>
            ok(
                db()
                    .complaints.filter(c => c.member_oid === m.oid)
                    .sort((a, b) => b.created_at.localeCompare(a.created_at))
                    .map(c => complaintWire(c, Date.now(), true))
            )
        )
    },
    {
        method: 'GET',
        path: /^\/v1\/me\/complaints\/staff$/,
        scope: 'member',
        handler: portal((_ctx, m) => ok(branchStaff(m.branch_oid).map(({ oid, name, role }) => ({ oid, name, role }))))
    },
    {
        method: 'POST',
        path: /^\/v1\/me\/complaints$/,
        scope: 'member',
        can: ['create', 'Portal'],
        handler: portal((_ctx, m, c) => {
            const row = newComplaint(c, m.branch_oid, { oid: m.oid, code: m.code, name: m.name }, 'portal');
            recordAudit(c, 'create', 'complaint', row.code, null, { via: 'portal', category: row.category });
            return ok(complaintWire(row, Date.now(), true), 'Complaint sent');
        })
    },
    { method: 'POST', path: /^\/v1\/me\/complaints\/([\w-]+)\/reply$/, scope: 'member', can: ['update', 'Portal'], handler: ctx => memberAction(ctx, 'reply') },
    {
        method: 'POST',
        path: /^\/v1\/me\/complaints\/([\w-]+)\/accept$/,
        scope: 'member',
        can: ['update', 'Portal'],
        handler: ctx => memberAction(ctx, 'accept')
    },
    {
        method: 'POST',
        path: /^\/v1\/me\/complaints\/([\w-]+)\/escalate$/,
        scope: 'member',
        can: ['update', 'Portal'],
        handler: ctx => memberAction(ctx, 'escalate')
    },

    // NPS and ratings
    { method: 'GET', path: /^\/v1\/feedback$/, scope: 'staff', can: ['read', 'Feedback'], handler: feedbackReport },
    { method: 'GET', path: /^\/v1\/me\/feedback$/, scope: 'member', handler: portal((ctx, m) => ok(myFeedback(ctx, m))) },
    {
        method: 'POST',
        path: /^\/v1\/me\/nps$/,
        scope: 'member',
        can: ['create', 'Portal'],
        handler: portal((ctx, m, c) => {
            if (!npsDue(m, ctx.now.date)) fail(409, 'Thanks, we already have your answer.');
            const score = ctx.body['score'] === null ? null : Number(ctx.body['score']);
            if (score !== null && !(Number.isInteger(score) && score >= 0 && score <= 10)) fail(400, 'score: 0 to 10');
            commit({
                t: 'put',
                table: 'nps',
                row: {
                    oid: newOid('nps'),
                    branch_oid: m.branch_oid,
                    member_oid: m.oid,
                    score,
                    comment: score === null ? null : str(ctx.body['comment']) || null,
                    created_at: ctx.now.iso
                }
            });
            recordAudit(c, score === null ? 'dismiss' : 'answer', 'nps_response', m.code, null, { score });
            return ok({ nps_due: false }, score === null ? 'Maybe later' : 'Thanks for your answer');
        })
    },
    {
        method: 'POST',
        path: /^\/v1\/me\/ratings$/,
        scope: 'member',
        can: ['create', 'Portal'],
        handler: portal((ctx, m, c) => {
            const score = Number(ctx.body['score']);
            if (!(Number.isInteger(score) && score >= 1 && score <= 5)) fail(400, 'score: 1 to 5');
            const booking = str(ctx.body['booking_oid']);
            const pt = str(ctx.body['pt_session_oid']);
            const target = rateable(m, ctx.now.iso).find(r => (booking ? r.booking_oid === booking : r.pt_session_oid === pt));
            if (!target) fail(409, 'You can rate a class you attended or a PT session you had, once, within 7 days.');
            commit({
                t: 'put',
                table: 'ratings',
                row: {
                    oid: newOid('rat'),
                    branch_oid: m.branch_oid,
                    member_oid: m.oid,
                    member_name: m.name,
                    kind: target.kind,
                    booking_oid: target.booking_oid,
                    pt_session_oid: target.pt_session_oid,
                    trainer_oid: target.trainer_oid,
                    trainer_name: target.trainer_name,
                    label: target.label,
                    session_at: target.at,
                    score,
                    comment: str(ctx.body['comment']) || null,
                    created_at: ctx.now.iso
                }
            });
            recordAudit(c, 'rate', 'rating', m.code, null, { kind: target.kind, label: target.label, score });
            return ok(myFeedback(ctx, m), 'Thanks for rating');
        })
    }
];
