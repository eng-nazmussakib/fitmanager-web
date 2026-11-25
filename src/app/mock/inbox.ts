import type { AppAbility } from '@core/auth/ability';
import type { Branch } from '@core/models/branch.model';
import { LEVEL_LABEL } from '@core/models/governance.model';
import { INBOX_RULES, type StaffMessage, type StaffMessageKind } from '@core/models/inbox.model';
import type { MemberNotification } from '@core/models/member.model';

import { taka } from './business';
import { shortDate } from './domain/access-rules';
import { memberPolicies } from './governance';
import { addDaysIso, at } from './seed/clock';
import type { MemberRow, MockDb, ReadRow } from './types';

/**
 * The bell in demo mode (phase 7b, D-108). Like the receipts before it, every message is DERIVED from the mock's data
 * each time it is read (so whatever the demo does shows up at once), with the API's wording; only the read marks
 * are stored (`reads`). As in seed 108, what is older than 3 days before the seed day counts as read: by staff, and
 * by members with a portal account. Read messages older than 180 days are not listed.
 */
export const RETENTION_DAYS = 180;

export interface Reader {
    /** `m:<member oid>` or `u:<username>`. */
    key: string;
    /** Whether the seed's "read up to 3 days ago" applies (a member without a portal account never reads). */
    reads: boolean;
}

const readKey = (reader: string, message: string): string => `${reader}|${message}`;

function readAt(d: MockDb, reader: Reader, oid: string, created: string): string | null {
    const row = d.reads.find(r => r.oid === readKey(reader.key, oid));
    if (row) return row.read_at;
    if (reader.reads && time(created) < time(at(addDaysIso(d.seedDay, -3), 0))) return new Date(time(created) + 6 * 3600_000).toISOString();
    return null;
}

/** Times come with different offsets (+06:00, Z): compare them as instants. */
const time = (iso: string): number => new Date(iso).getTime();

function listed<T extends { created_at: string; read_at: string | null }>(rows: T[], nowIso: string): T[] {
    const cutoff = time(nowIso) - RETENTION_DAYS * 86_400_000;
    return rows.filter(r => !r.read_at || time(r.created_at) > cutoff).sort((a, b) => time(b.created_at) - time(a.created_at));
}

export const memberReader = (d: MockDb, m: MemberRow): Reader => ({ key: `m:${m.oid}`, reads: d.accounts.some(a => a.user.member?.oid === m.oid) });

/* ---------- a member's messages ---------- */

const clip = (s: string, n: number): string => (s.length <= n ? s : `${s.slice(0, Math.max(s.slice(0, n).lastIndexOf(' '), n - 20)).trimEnd()}…`);

/** Everything the API would have written for `m` that is still listed, newest first, with the read state. */
export function memberMessages(d: MockDb, m: MemberRow, today: string, nowIso: string): MemberNotification[] {
    const channel = m.email ? 'email' : m.phone ? 'sms' : 'log';
    const status = m.email || m.phone ? 'logged' : 'skipped';
    const rows: Omit<MemberNotification, 'read_at'>[] = [];
    const add = (oid: string, kind: MemberNotification['kind'], subject: string, body: string, createdAt: string): void => {
        rows.push({ oid, kind, channel, subject, body, status, created_at: createdAt });
    };
    for (const inv of d.invoices.filter(x => x.member_oid === m.oid)) {
        if (inv.kind === 'pos') {
            // A shop receipt (D-108 a): what they bought, paid at the till, and what went on the account.
            const paid = inv.payments.filter(p => p.kind !== 'refund' && p.received_at === inv.issued_at).reduce((s, p) => s + p.amount, 0);
            const items = inv.lines.filter(l => l.qty !== undefined).map(l => l.label);
            add(
                `n-shop-${inv.oid}`,
                'shop_receipt',
                `Shop receipt ${inv.number}`,
                `Dear ${m.name}, thank you for shopping with us: ${items.join(', ')}. Total ${taka(inv.total)}${paid > 0 ? `, paid ${taka(paid)}` : ''}${
                    inv.total > paid ? `, ${taka(inv.total - paid)} added to your account` : ''
                }.`,
                inv.issued_at
            );
            continue;
        }
        for (const p of inv.payments.filter(x => x.kind !== 'refund'))
            add(
                `n-${p.oid}`,
                'receipt',
                `Receipt for ${inv.number}`,
                `Dear ${m.name}, we received ৳${p.amount.toLocaleString('en-IN')} towards ${inv.number}. Thank you.`,
                p.received_at
            );
    }
    for (const s of d.subscriptions.filter(x => x.member_oid === m.oid && x.kind !== 'pt')) {
        for (const [days, kind] of [
            [7, 'expiry_7d'],
            [1, 'expiry_1d']
        ] as const) {
            const day = addDaysIso(s.end_date, -days);
            if (day > today || s.cancelled_at) continue;
            add(
                `n-${s.oid}-${kind}`,
                kind,
                days === 1 ? 'Your membership ends tomorrow' : 'Your membership ends in 7 days',
                `Dear ${m.name}, your ${s.plan_name} plan ends on ${shortDate(s.end_date)}. Renew at the front desk to keep training.`,
                `${day}T00:05:00+06:00`
            );
        }
    }
    for (const r of d.messages.filter(x => x.member_oid === m.oid)) add(r.oid, r.kind, r.subject, r.body, r.created_at);

    // Phase 7b: replies to the member's complaints, sanctions and appeals decided, policies still to accept.
    for (const c of d.complaints.filter(x => x.member_oid === m.oid))
        for (const u of c.updates.filter(x => x.author === 'staff' && !x.body.startsWith('Escalated to HQ:')))
            add(
                `n-cu-${u.oid}`,
                'complaint_reply',
                u.status === 'resolved' ? `Resolved: ${c.subject}` : `A reply about ${c.subject}`,
                `Dear ${m.name}, ${u.author_name} wrote about your complaint ${c.code}: ${clip(u.body, 280)}${
                    u.status === 'resolved' ? ' Accept the resolution in the portal, or ask HQ to look at it within 7 days.' : ''
                }`,
                u.at
            );
    for (const s of d.sanctions.filter(x => x.member_oid === m.oid)) {
        const branch = d.branches.find(b => b.oid === s.branch_oid)?.name ?? '';
        const what =
            s.level === 'suspension' && s.ends_on
                ? `a suspension from ${shortDate(s.starts_on)} to ${shortDate(s.ends_on)}`
                : s.level === 'ban'
                  ? `a ban ${s.scope === 'all' ? 'from every branch' : `from ${branch}`}${s.membership_cancelled ? '; your membership there is cancelled' : ''}`
                  : `a ${LEVEL_LABEL[s.level].toLowerCase()}`;
        add(
            `n-san-${s.oid}`,
            'sanction',
            `${LEVEL_LABEL[s.level]} at ${branch}`,
            `Dear ${m.name}, you were given ${what}. Reason: ${s.reason.replace(/[.!?]\s*$/, '')}. You can appeal under My record in the portal by ${shortDate(addDaysIso(s.given_on, 7))}.`,
            at(s.given_on, 12 * 60)
        );
        const a = s.appeal;
        if (a?.decided_at && a.status !== 'open')
            add(
                `n-apl-${a.oid}`,
                'appeal_decided',
                a.status === 'upheld' ? 'Your appeal was upheld' : 'Your appeal was not upheld',
                `Dear ${m.name}, ${
                    a.status === 'upheld'
                        ? `your appeal was upheld: the ${LEVEL_LABEL[s.level].toLowerCase()} no longer counts`
                        : `the ${LEVEL_LABEL[s.level].toLowerCase()} stands`
                }. ${a.decision_note ?? ''}`,
                a.decided_at
            );
    }
    if (!m.pending && !m.anonymised)
        for (const p of memberPolicies(m, today, d).filter(x => x.state === 'due' || x.state === 'overdue'))
            add(
                `n-pol-${p.policy_oid}-${p.required_version}`,
                'policy_to_accept',
                p.required_version > 1 ? `${p.title} has changed` : `Please accept: ${p.title}`,
                `Dear ${m.name}, please read and accept the ${p.title}${
                    p.blocks_on ? ` by ${shortDate(p.blocks_on)}, or check-in pauses from that day` : ''
                }. It is under Policies in the portal, or ask at the front desk.`,
                at(p.blocks_on ? addDaysIso(p.blocks_on, -d.settings.policy_grace_days) : today, 9 * 60)
            );

    const reader = memberReader(d, m);
    return listed(
        rows.map(r => ({ ...r, read_at: readAt(d, reader, r.oid, r.created_at) })),
        nowIso
    );
}

/* ---------- the staff inbox ---------- */

/** Every inbox message there is (all branches and HQ), each with the branch it is addressed to. */
function allStaffMessages(d: MockDb): (Omit<StaffMessage, 'read_at'> & { to: string })[] {
    const hq = d.branches.find(b => b.kind === 'HQ')?.oid ?? '';
    const name = (oid: string): string => d.branches.find(b => b.oid === oid)?.name ?? '';
    const out: (Omit<StaffMessage, 'read_at'> & { to: string })[] = [];
    const add = (to: string, from: string, oid: string, kind: StaffMessageKind, subject: string, body: string, link: string, createdAt: string): void => {
        out.push({ oid, to, kind, subject, body, link, from_branch_oid: from, from_branch_name: name(from), created_at: createdAt });
    };
    for (const o of d.purchaseOrders) {
        add(
            hq,
            o.branch_oid,
            `sm-po-${o.oid}`,
            'po_submitted',
            `${name(o.branch_oid)}: ${o.code} waits for approval`,
            `${o.raised_by_name} raised ${o.code} to ${o.supplier_name}, ${taka(o.lines.reduce((s, l) => s + l.qty * l.unit_cost, 0))}. Approve or reject it.`,
            'purchase-orders',
            o.raised_at
        );
        if (o.decided_at) {
            const rejected = o.status === 'rejected';
            add(
                o.branch_oid,
                hq,
                `sm-pod-${o.oid}`,
                rejected ? 'po_rejected' : 'po_approved',
                `${o.code} ${rejected ? 'rejected' : 'approved'}`,
                rejected
                    ? `HQ rejected ${o.code} to ${o.supplier_name}: ${o.decision_note ?? ''}`
                    : `HQ approved ${o.code} to ${o.supplier_name}. Send it to the supplier, then receive the delivery.`,
                'stock?tab=orders',
                o.decided_at
            );
        }
    }
    for (const t of d.transfers) {
        const n = t.lines.length;
        add(
            t.from_branch_oid,
            t.to_branch_oid,
            `sm-trq-${t.oid}`,
            'transfer_requested',
            `${name(t.to_branch_oid)} asks for stock: ${t.code}`,
            `${t.requested_by_name} asked for ${n} product${n === 1 ? '' : 's'}. Send what you can, or reject it.`,
            'stock?tab=transfers',
            t.requested_at
        );
        if (t.sent_at)
            add(
                t.to_branch_oid,
                t.from_branch_oid,
                `sm-trs-${t.oid}`,
                'transfer_sent',
                `${t.code} is on its way from ${name(t.from_branch_oid)}`,
                `${t.sent_by_name ?? name(t.from_branch_oid)} sent ${t.code}. Receive it when it arrives, and note any shortfall.`,
                'stock?tab=transfers',
                t.sent_at
            );
        if (t.status === 'rejected' && t.closed_at)
            add(
                t.to_branch_oid,
                t.from_branch_oid,
                `sm-trr-${t.oid}`,
                'transfer_rejected',
                `${name(t.from_branch_oid)} rejected ${t.code}`,
                `${name(t.from_branch_oid)} cannot send ${t.code}: ${t.closing_note ?? ''}`,
                'stock?tab=transfers',
                t.closed_at
            );
    }
    for (const k of d.tickets.filter(x => x.priority === 'urgent')) {
        const e = d.equipment.find(x => x.oid === k.equipment_oid);
        add(
            k.branch_oid,
            k.branch_oid,
            `sm-tk-${k.oid}`,
            'ticket_urgent',
            `Urgent: ${e?.name ?? 'equipment'} (${k.code})`,
            `${k.raised_by_name} raised an urgent ticket${k.out_of_order ? ', and took it out of use' : ''}: ${k.description}`,
            'equipment?tab=tickets',
            k.raised_at
        );
    }
    for (const c of d.complaints.filter(x => x.escalated)) {
        const e = c.escalated!;
        const by = e.by === 'member' ? c.member_name : (c.updates.find(u => u.body.startsWith('Escalated to HQ:'))?.author_name ?? 'The branch manager');
        const subject = `Escalated to HQ: ${c.code} ${c.subject}`;
        const body = `${by} escalated complaint ${c.code} at ${name(c.branch_oid)}: ${clip(e.reason, 280)}`;
        add(hq, c.branch_oid, `sm-ce-hq-${c.oid}`, 'complaint_escalated', subject, body, `complaints?open=${c.oid}`, e.at);
        if (e.by === 'member') add(c.branch_oid, c.branch_oid, `sm-ce-br-${c.oid}`, 'complaint_escalated', subject, body, `complaints?open=${c.oid}`, e.at);
    }
    for (const s of d.sanctions.filter(x => x.appeal)) {
        const a = s.appeal!;
        const i = d.incidents.find(x => x.oid === s.incident_oid);
        const atBranch = s.level !== 'ban' && !i?.hq_only && (s.given_role === 'desk' || s.given_role === 'trainer');
        const label = LEVEL_LABEL[s.level];
        add(
            atBranch ? s.branch_oid : hq,
            s.branch_oid,
            `sm-ap-${s.oid}`,
            'appeal_filed',
            `Appeal: ${label} for ${i?.subject_code ?? 'a case'}`,
            `${a.filed_by_name} appealed the ${label.toLowerCase()} given by ${s.given_by_name || 'staff'}. Decide it on the case.`,
            `incidents/${s.incident_oid}`,
            a.filed_at
        );
    }
    return out;
}

/** The inbox at `branch` (a branch, or HQ) for `username`: the kinds their ability there allows, newest first. */
export function staffInbox(d: MockDb, branch: Branch, ability: AppAbility, username: string, nowIso: string): { items: StaffMessage[]; unread: number } {
    const kinds = new Set((Object.keys(INBOX_RULES) as StaffMessageKind[]).filter(k => ability.can(...INBOX_RULES[k])));
    const reader: Reader = { key: `u:${username}`, reads: true };
    const mine = allStaffMessages(d)
        .filter(m => m.to === branch.oid && kinds.has(m.kind))
        .map(({ to: _to, ...m }) => ({ ...m, read_at: readAt(d, reader, m.oid, m.created_at) }));
    return { items: listed(mine, nowIso).slice(0, 50), unread: mine.filter(m => !m.read_at).length };
}

/** The read marks to store: the unread messages named in `oids`, or every unread one when it is omitted. */
export function newReads(reader: Reader, unreadOids: readonly string[], oids: readonly string[] | undefined, at: string): ReadRow[] {
    const wanted = oids ? new Set(oids) : null;
    return unreadOids.filter(o => !wanted || wanted.has(o)).map(o => ({ oid: readKey(reader.key, o), read_at: at }));
}
