import type { HttpResponse } from '@angular/common/http';

import type { Action, Subject } from '@core/auth/ability';
import type { MemberDocument, MemberNotification } from '@core/models/member.model';
import type { CashClosing, Invoice, PaymentRecord } from '@core/models/payment.model';
import type { PaymentMethod, Subscription } from '@core/models/subscription.model';
import { environment } from '@env/environment';

import { recordAudit } from '../audit';
import { daysBetween, shortDate } from '../domain/access-rules';
import { endDate, quote } from '../domain/pricing';
import { type Ctx, fail, num, ok, type Route, str } from '../http';
import { idx, memberState } from '../queries';
import { addDaysIso, dateOf } from '../seed/clock';
import { toRef } from '../seed/organisation.seed';
import { commit, db, newOid } from '../store';
import type { FileRow, MemberRow } from '../types';
import { branchMember } from './members.handlers';
import { memberTraining } from './training.handlers';

/**
 * Phase 2's new actions, as the API answers them (fitmanager-api: members, sales, files, portal, join):
 * transfer, anonymise, portal access, cancel, upgrade, refund, closing the day, uploads, documents and
 * messages. The rules match the API's (D-063, D-064, D-067, D-068, D-069); the demo keeps everything in memory.
 */

const METHODS: PaymentMethod[] = ['cash', 'card', 'bkash', 'nagad', 'bank'];
const reasonOf = (ctx: Ctx): string => {
    const reason = str(ctx.body['reason']);
    if (reason.length < 3) fail(400, 'Give a reason (at least 3 characters).');
    return reason;
};
const manager = (ctx: Ctx, subject: 'Member' | 'Subscription' | 'Payment', action: 'manage' | 'update' = 'manage'): void => {
    if (!ctx.ability.can(action, subject)) fail(403, 'You do not have permission to do this');
};

/* ---------- files (D-058, D-069) ---------- */

/** Bytes the mock was sent, by file, until "complete" turns them into an object URL (this session only). */
const uploads = new Map<string, Blob>();

/** The bytes sent for a file, taken once on completion (the portal's own uploads, training.handlers.ts). */
export function takeUpload(oid: string): Blob | undefined {
    const blob = uploads.get(oid);
    uploads.delete(oid);
    return blob;
}
const MB = 1024 * 1024;
const IMAGES = ['image/jpeg', 'image/png', 'image/webp'];
/** The API's FILE_RULES and KIND_RULES (files.service.ts, files.routes.ts): types, size, who may upload, and where. */
const RULES: Record<FileRow['kind'], { types: readonly string[]; max: number; label: string; can: [Action, Subject]; hq: boolean }> = {
    member_photo: { types: IMAGES, max: 2 * MB, label: 'A photo is a JPEG, PNG or WebP of at most 2 MB', can: ['create', 'Member'], hq: false },
    member_document: {
        types: ['application/pdf', 'image/jpeg', 'image/png'],
        max: 5 * MB,
        label: 'A document is a PDF, JPEG or PNG of at most 5 MB',
        can: ['create', 'Member'],
        hq: false
    },
    trainer_photo: { types: IMAGES, max: 2 * MB, label: 'A photo is a JPEG, PNG or WebP of at most 2 MB', can: ['update', 'Trainer'], hq: false },
    exercise_photo: {
        types: IMAGES,
        max: 300 * 1024,
        label: 'An exercise photo is a JPEG, PNG or WebP of at most 300 KB',
        can: ['create', 'Exercise'],
        hq: true
    },
    exercise_video: {
        types: ['video/mp4', 'video/webm'],
        max: 8 * MB,
        label: 'An exercise video is an MP4 or WebM of at most 8 MB',
        can: ['create', 'Exercise'],
        hq: true
    },
    measurement_photo: {
        types: IMAGES,
        max: 300 * 1024,
        label: 'A progress photo is a JPEG, PNG or WebP of at most 300 KB',
        can: ['create', 'Measurement'],
        hq: false
    },
    incident_evidence: {
        types: [...IMAGES, 'application/pdf'],
        max: 2 * MB,
        label: 'Evidence is a photo (JPEG, PNG or WebP) or a PDF of at most 2 MB',
        can: ['create', 'Incident'],
        hq: false
    },
    complaint_photo: {
        types: IMAGES,
        max: 300 * 1024,
        label: 'A complaint photo is a JPEG, PNG or WebP of at most 300 KB',
        can: ['create', 'Complaint'],
        hq: false
    },
    // Phase 6 (D-098, D-099): HQ's product photos; a machine's photo (the register's keepers); a ticket's photo (anyone who raises one).
    product_photo: { types: IMAGES, max: 300 * 1024, label: 'A product photo is a JPEG, PNG or WebP of at most 300 KB', can: ['update', 'Product'], hq: true },
    equipment_photo: {
        types: IMAGES,
        max: 300 * 1024,
        label: 'An equipment photo is a JPEG, PNG or WebP of at most 300 KB',
        can: ['update', 'Equipment'],
        hq: false
    },
    ticket_photo: { types: IMAGES, max: 300 * 1024, label: 'A ticket photo is a JPEG, PNG or WebP of at most 300 KB', can: ['create', 'Equipment'], hq: false }
};
/** The API's `FILE_STORAGE_LIMIT_MB` default (D-074): every branch's files together, inside R2's free 10 GB. */
const FILE_STORAGE_LIMIT_BYTES = 6144 * 1024 * 1024;

/** Like the API: ready files plus pending uploads, across every branch; 409 when `adding` would pass the limit. */
function checkStorage(adding: number): void {
    const used = (db().files ?? []).filter(f => f.status === 'ready' || f.status === 'pending').reduce((sum, f) => sum + (f.size_bytes ?? 0), 0);
    if (used + adding > FILE_STORAGE_LIMIT_BYTES) {
        fail(
            409,
            `File storage is full (${Math.round(used / MB)} of ${Math.round(FILE_STORAGE_LIMIT_BYTES / MB)} MB used). Delete old documents, or ask the owner to raise the limit.`
        );
    }
}

function startUpload(ctx: Ctx): HttpResponse<unknown> {
    const kind = str(ctx.body['kind']) as FileRow['kind'];
    const rule = RULES[kind] as (typeof RULES)[keyof typeof RULES] | undefined;
    if (!rule) fail(400, 'Unknown kind of file');
    if ((ctx.branch?.kind === 'HQ' && !rule.hq) || !ctx.ability.can(...rule.can)) fail(403, 'You do not have permission to do this');
    const type = str(ctx.body['content_type']).toLowerCase();
    if (!rule.types.includes(type)) fail(415, rule.label);
    if (num(ctx.body['size']) > rule.max) fail(413, rule.label);
    const memberOid = str(ctx.body['member_oid']) || null;
    if (memberOid) branchMember(ctx, memberOid);
    if (memberOid && kind === 'member_document' && (db().files ?? []).filter(f => f.member_oid === memberOid && f.kind === kind).length >= 10) {
        fail(409, 'A member has at most 10 documents. Delete one first.');
    }
    checkStorage(num(ctx.body['size']));
    const oid = newOid('file');
    commit({
        t: 'file.add',
        row: {
            oid,
            branch_oid: ctx.branch!.oid,
            member_oid: memberOid,
            kind,
            name: str(ctx.body['name']),
            content_type: type,
            size_bytes: num(ctx.body['size']),
            status: 'pending',
            url: null,
            created_at: ctx.now.iso,
            created_by_name: ctx.user?.name ?? null
        }
    });
    return ok(
        {
            file: { oid, status: 'pending' },
            upload: {
                url: `${environment.apiBaseUrl}/v1/files/${oid}/content?token=mock`,
                method: 'PUT',
                headers: { 'Content-Type': type },
                expires_at: ctx.now.iso
            }
        },
        'Upload the file to the URL given'
    );
}

function receive(ctx: Ctx): HttpResponse<unknown> {
    const body = ctx.body as unknown;
    if (!(body instanceof Blob)) fail(400, 'No file received');
    uploads.set(ctx.params[0] ?? '', body);
    return ok(null, 'Uploaded');
}

function complete(ctx: Ctx): HttpResponse<unknown> {
    const row = (db().files ?? []).find(f => f.oid === ctx.params[0] && f.branch_oid === ctx.branch!.oid);
    if (!row) fail(404, 'File not found');
    const blob = uploads.get(row.oid);
    if (!blob && !row.url) fail(409, 'The file has not arrived yet. Upload it, then try again.');
    if (blob) {
        row.url = URL.createObjectURL(blob);
        row.status = 'ready';
        uploads.delete(row.oid);
        recordAudit(ctx, 'create', 'file', row.oid, null, { ...row });
    }
    return ok({ ...row }, 'File saved');
}

/** A photo's link, for a member being created or edited with `photo_file_oid`. */
export function photoUrl(ctx: Ctx, fileOid: string): string {
    const row = (db().files ?? []).find(f => f.oid === fileOid && f.branch_oid === ctx.branch?.oid && f.status === 'ready' && f.kind === 'member_photo');
    if (!row?.url) fail(400, 'Upload the photo first');
    return row.url;
}

function documents(ctx: Ctx): HttpResponse<unknown> {
    const m = branchMember(ctx, ctx.params[0] ?? '');
    const rows: MemberDocument[] = (db().files ?? [])
        .filter(f => f.member_oid === m.oid && f.kind === 'member_document' && f.status === 'ready')
        .map(f => ({
            oid: f.oid,
            name: f.name,
            content_type: f.content_type,
            size_bytes: f.size_bytes,
            created_at: f.created_at,
            created_by_name: f.created_by_name,
            url: f.url ?? ''
        }));
    return ok(rows);
}

/* ---------- members (D-064, D-068) ---------- */

function transfer(ctx: Ctx): HttpResponse<unknown> {
    manager(ctx, 'Member');
    const m = branchMember(ctx, ctx.params[0] ?? '');
    const to = db().branches.find(b => b.oid === str(ctx.body['to_branch_oid']) && b.kind === 'BRANCH');
    if (!to) fail(400, 'Choose an open branch');
    if (to.oid === m.branch_oid) fail(400, 'The member is already at this branch');
    const reason = reasonOf(ctx);
    const dues = memberState(m, ctx.now.date).dues;
    if (dues > 0) fail(409, `Clear the dues of ৳${dues.toLocaleString('en-IN')} before the transfer.`);
    if (idx().openCheckIn.has(m.oid)) fail(409, 'Check the member out first');
    commit({ t: 'member.update', oid: m.oid, patch: { branch_oid: to.oid } });
    memberTraining.move(m.oid, to.oid, ctx.now.date);
    recordAudit(ctx, 'transfer_out', 'member', m.code, { branch_oid: ctx.branch!.oid }, { to: { oid: to.oid, name: to.name }, reason });
    return ok({ oid: m.oid, code: m.code, branch_oid: to.oid, branch_name: to.name }, `${m.code} moved to ${to.name}`);
}

function anonymise(ctx: Ctx): HttpResponse<unknown> {
    manager(ctx, 'Member');
    const m = branchMember(ctx, ctx.params[0] ?? '');
    if (m.anonymised) fail(409, 'Already anonymised');
    if (str(ctx.body['confirm_code']).toUpperCase() !== m.code) fail(400, `Type the member code ${m.code} to confirm`);
    memberTraining.remove(m.oid);
    commit({
        t: 'member.update',
        oid: m.oid,
        patch: {
            name: 'Anonymised member',
            phone: null,
            email: null,
            address: null,
            date_of_birth: null,
            emergency_contact: null,
            health_flags: [],
            health_declared: false,
            photo_url: null,
            notes: null,
            anonymised: true,
            portal: false
        }
    });
    recordAudit(ctx, 'anonymise', 'member', m.code, null, { anonymised: true });
    return ok({ oid: m.oid, anonymised: true }, 'Personal data removed');
}

function portalAccess(ctx: Ctx): HttpResponse<unknown> {
    if (!ctx.ability.can('update', 'Member')) fail(403, 'You do not have permission to do this');
    const m = branchMember(ctx, ctx.params[0] ?? '');
    const password = str(ctx.body['password']);
    if (password.length < 8 || !/\p{L}/u.test(password) || !/\d/.test(password)) fail(400, 'Use at least 8 characters, with a letter and a digit');
    if (m.anonymised) fail(409, 'This member was anonymised');
    if (memberState(m, ctx.now.date).status === 'Pending') fail(409, 'The membership starts with the first sale; give portal access after it.');
    const reset = !!m.portal;
    commit({ t: 'member.update', oid: m.oid, patch: { portal: true } });
    recordAudit(ctx, reset ? 'reset_portal_password' : 'grant_portal', 'member', m.code, null, { username: m.code, must_change_password: true });
    return ok(
        { username: m.code, must_change_password: true, reset },
        reset ? 'Portal password reset: the member sets a new one at sign-in' : `Portal access given: username ${m.code}`
    );
}

/** The member's in-app messages (D-075): receipts, and the expiry reminders that have fallen due. */
function messages(ctx: Ctx): HttpResponse<unknown> {
    const m = branchMember(ctx, ctx.params[0] ?? '');
    const channel = m.email ? 'email' : m.phone ? 'sms' : 'log';
    const status = m.email || m.phone ? 'logged' : 'skipped';
    const rows: MemberNotification[] = [];
    for (const inv of idx().invoices.get(m.oid) ?? [])
        for (const p of inv.payments.filter(x => x.kind !== 'refund'))
            rows.push({
                oid: `n-${p.oid}`,
                kind: 'receipt',
                channel,
                subject: `Receipt for ${inv.number}`,
                body: `Dear ${m.name}, we received ৳${p.amount.toLocaleString('en-IN')} towards ${inv.number}. Thank you.`,
                status,
                created_at: p.received_at
            });
    for (const s of idx().subs.get(m.oid) ?? []) {
        for (const [days, kind] of [
            [7, 'expiry_7d'],
            [1, 'expiry_1d']
        ] as const) {
            const day = addDaysIso(s.end_date, -days);
            if (day > ctx.now.date || s.cancelled_at) continue;
            rows.push({
                oid: `n-${s.oid}-${kind}`,
                kind,
                channel,
                subject: days === 1 ? 'Your membership ends tomorrow' : 'Your membership ends in 7 days',
                body: `Dear ${m.name}, your ${s.plan_name} plan ends on ${shortDate(s.end_date)}. Renew at the front desk to keep training.`,
                status,
                created_at: `${day}T00:05:00+06:00`
            });
        }
    }
    for (const r of db().messages.filter(x => x.member_oid === m.oid))
        rows.push({ oid: r.oid, kind: r.kind, channel, subject: r.subject, body: r.body, status, created_at: r.created_at });
    return ok(rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 50));
}

/* ---------- plans and money (D-067) ---------- */

function subscriptionAt(ctx: Ctx): { sub: Subscription; member: MemberRow } {
    const sub = db().subscriptions.find(s => s.oid === ctx.params[0]);
    if (!sub) fail(404, 'Subscription not found');
    const member = branchMember(ctx, sub.member_oid);
    return { sub, member };
}

function cancel(ctx: Ctx): HttpResponse<unknown> {
    manager(ctx, 'Subscription', 'update');
    const { sub, member } = subscriptionAt(ctx);
    if (sub.cancelled_at || sub.end_date < ctx.now.date) fail(409, 'This plan is not running.');
    const reason = reasonOf(ctx);
    const end = sub.start_date > ctx.now.date ? addDaysIso(sub.start_date, -1) : addDaysIso(ctx.now.date, -1);
    commit({ t: 'subscription.end', oid: sub.oid, end_date: end, reason, at: ctx.now.iso, upgraded_to: null });
    const after = db().subscriptions.find(x => x.oid === sub.oid);
    recordAudit(ctx, 'cancel', 'subscription', member.code, null, { ...after });
    return ok(after, 'Plan ended');
}

function upgrade(ctx: Ctx): HttpResponse<unknown> {
    manager(ctx, 'Subscription', 'update');
    const { sub, member } = subscriptionAt(ctx);
    if (sub.cancelled_at || sub.start_date > ctx.now.date || sub.end_date < ctx.now.date) fail(409, 'Only a running plan can be upgraded.');
    const plan = db().plans.find(p => p.oid === str(ctx.body['plan_oid']) && p.branch_oid === ctx.branch!.oid && p.sellable);
    if (!plan) fail(404, 'Plan not found at this branch');
    if (plan.oid === sub.plan_oid) fail(400, 'That is the plan the member already has.');
    const old = db().invoices.find(i => i.oid === sub.invoice_oid);
    if (plan.price < (old?.lines[0]?.amount ?? 0))
        fail(409, 'Plans can only be upgraded to the same or a higher price. To move down, end this plan and sell a new one.');
    const unused = daysBetween(ctx.now.date, sub.end_date) + 1;
    const credit = Math.round(((old?.paid ?? 0) * unused) / (daysBetween(sub.start_date, sub.end_date) + 1));
    const settings = db().settings;
    const q = quote({
        plan_name: plan.name,
        price: plan.price,
        months: plan.months,
        admission_fee: 0,
        charge_admission: false,
        discount: { kind: 'amount', value: credit },
        start_date: ctx.now.date,
        today: ctx.now.date,
        vat_rate: settings.vat_rate,
        vat_inclusive: settings.vat_inclusive,
        promos: []
    });
    const label = credit ? `Credit: ${unused} unused days of ${sub.plan_name}` : 'Discount';
    const pay = (ctx.body['payment'] as { method?: PaymentMethod; amount?: number; reference?: string } | undefined) ?? {};
    const amount = Math.round(num(pay.amount));
    if (amount < 0 || amount > q.total) fail(400, `The payment must be between ৳0 and ৳${q.total.toLocaleString('en-IN')}.`);
    const branch = db().branches.find(b => b.oid === ctx.branch!.oid)!;
    const seq = (db().counters[`invoice:${branch.code}`] ?? 0) + 1;
    const invoiceOid = newOid('inv');
    const payments: PaymentRecord[] = amount
        ? [
              {
                  oid: newOid('pay'),
                  invoice_oid: invoiceOid,
                  kind: 'payment',
                  amount,
                  method: pay.method ?? 'cash',
                  reference: str(pay.reference) || null,
                  received_at: ctx.now.iso,
                  received_by: ctx.user!.name
              }
          ]
        : [];
    const invoice: Invoice = {
        oid: invoiceOid,
        number: `INV-${branch.code}-${ctx.now.date.slice(0, 4)}-${String(seq).padStart(5, '0')}`,
        branch: toRef(branch),
        member_oid: member.oid,
        member_name: member.name,
        member_code: member.code,
        member_phone: member.phone,
        issued_at: ctx.now.iso,
        lines: q.discount ? [...q.lines, { label, amount: -q.discount }] : q.lines,
        subtotal: q.subtotal,
        discount: q.discount,
        vat_rate: q.vat_rate,
        vat_inclusive: q.vat_inclusive,
        vat_bin: settings.vat_bin,
        vat: q.vat,
        total: q.total,
        paid: amount,
        due: q.total - amount,
        status: amount >= q.total ? 'Paid' : amount > 0 ? 'Partial' : 'Due',
        payments
    };
    const next = {
        oid: newOid('sub'),
        member_oid: member.oid,
        plan_oid: plan.oid,
        plan_name: plan.name,
        start_date: ctx.now.date,
        end_date: endDate(ctx.now.date, plan.months),
        status: 'Active' as const,
        total: q.total,
        paid: amount,
        due: q.total - amount,
        invoice_oid: invoiceOid,
        freezes: [],
        created_at: ctx.now.iso,
        freezable: plan.freezable
    };
    commit({
        t: 'subscription.end',
        oid: sub.oid,
        end_date: addDaysIso(ctx.now.date, -1),
        reason: `Upgraded to ${plan.name}`,
        at: ctx.now.iso,
        upgraded_to: next.oid
    });
    commit({ t: 'subscription.create', sub: next, invoice, invoiceSeq: seq });
    recordAudit(ctx, 'upgrade', 'subscription', `${member.code}/${invoice.number}`, null, { subscription: next, invoice, credit });
    return ok({ subscription: next, invoice, credit }, `Upgraded to ${plan.name}`);
}

/** Full refund within 3 days, unused: the desk. Anything else: a manager (D-067 a). */
function refund(ctx: Ctx): HttpResponse<unknown> {
    const inv = db().invoices.find(i => i.oid === ctx.params[0]);
    if (inv?.branch.oid !== ctx.branch!.oid) fail(404, 'Invoice not found');
    if (inv.paid <= 0) fail(409, 'Nothing has been paid on this invoice.');
    const amount = ctx.body['amount'] === undefined ? inv.paid : Math.round(num(ctx.body['amount']));
    if (amount < 1 || amount > inv.paid) fail(400, `A refund is between ৳1 and ৳${inv.paid.toLocaleString('en-IN')}.`);
    const method = (str(ctx.body['method']) || 'cash') as PaymentMethod;
    if (!METHODS.includes(method)) fail(400, 'Choose how the money goes back');
    const reason = reasonOf(ctx);
    const full = amount === inv.paid;
    const policy =
        full && daysBetween(dateOf(inv.issued_at), ctx.now.date) <= 3 && !db().checkIns.some(c => c.member_oid === inv.member_oid && c.in_at >= inv.issued_at);
    if (!policy && !ctx.ability.can('manage', 'Payment'))
        fail(403, 'Only a full refund within 3 days of the sale, before the member has trained, can be done at the desk. Ask a branch manager.');
    const payment: PaymentRecord = {
        oid: newOid('ref'),
        invoice_oid: inv.oid,
        kind: 'refund',
        amount,
        method,
        reference: str(ctx.body['reference']) || null,
        reason,
        approved_by: ctx.user!.name,
        received_at: ctx.now.iso,
        received_by: ctx.user!.name
    };
    commit({ t: 'payment.create', invoice_oid: inv.oid, payment });
    const sub = db().subscriptions.find(s => s.invoice_oid === inv.oid);
    if (full && sub && !sub.cancelled_at) {
        const end = sub.start_date > ctx.now.date ? addDaysIso(sub.start_date, -1) : addDaysIso(ctx.now.date, -1);
        commit({ t: 'subscription.end', oid: sub.oid, end_date: end, reason: `Refunded: ${reason}`, at: ctx.now.iso, upgraded_to: null });
    }
    recordAudit(ctx, 'refund', 'invoice', inv.number, null, { amount, reason, policy });
    return ok(
        db().invoices.find(i => i.oid === inv.oid),
        'Refund recorded'
    );
}

/** The day's takings with each staff member's share and closing (`GET /v1/cash-closing/today` adds `by_staff`). */
export function staffTakings(ctx: Ctx): NonNullable<CashClosing['by_staff']> {
    const staff = new Map<string, { staff_oid: string; name: string; cash: number; total: number }>();
    for (const inv of db().invoices.filter(i => i.branch.oid === ctx.branch!.oid))
        for (const p of inv.payments.filter(x => dateOf(x.received_at) === ctx.now.date)) {
            const e = staff.get(p.received_by) ?? { staff_oid: p.received_by, name: p.received_by, cash: 0, total: 0 };
            const signed = p.kind === 'refund' ? -p.amount : p.amount;
            e.total += signed;
            if (p.method === 'cash') e.cash += signed;
            staff.set(p.received_by, e);
        }
    const closings = (db().closings ?? []).filter(c => c.branch_oid === ctx.branch!.oid && c.day === ctx.now.date);
    for (const c of closings) if (!staff.has(c.staff_name)) staff.set(c.staff_name, { staff_oid: c.staff_oid, name: c.staff_name, cash: 0, total: 0 });
    return [...staff.values()].map(s => {
        const c = closings.find(x => x.staff_name === s.name);
        return {
            ...s,
            closed: c
                ? { counted_cash: c.counted_cash, expected_cash: c.expected_cash, difference: c.counted_cash - c.expected_cash, note: c.note, at: c.at }
                : null
        };
    });
}

function closeDay(ctx: Ctx): HttpResponse<unknown> {
    if (!ctx.ability.can('create', 'Payment')) fail(403, 'You do not have permission to do this');
    const counted = Math.round(num(ctx.body['counted_cash']));
    if (counted < 0) fail(400, 'Cannot be negative');
    const name = ctx.user!.name;
    if ((db().closings ?? []).some(c => c.branch_oid === ctx.branch!.oid && c.day === ctx.now.date && c.staff_name === name))
        fail(409, 'You have already closed today.');
    const expected = staffTakings(ctx).find(s => s.name === name)?.cash ?? 0;
    const note = str(ctx.body['note']) || null;
    commit({
        t: 'closing.add',
        row: {
            branch_oid: ctx.branch!.oid,
            day: ctx.now.date,
            staff_oid: ctx.user!.user_id,
            staff_name: name,
            expected_cash: expected,
            counted_cash: counted,
            note,
            at: ctx.now.iso
        }
    });
    recordAudit(ctx, 'close', 'cash_closing', `${ctx.now.date}/${name}`, null, { expected_cash: expected, counted_cash: counted });
    return ok({ day: ctx.now.date, expected_cash: expected, counted_cash: counted, difference: counted - expected, note }, 'Day closed');
}

export const PHASE2_ROUTES: Route[] = [
    { method: 'POST', path: /^\/v1\/files$/, scope: 'staff', handler: startUpload },
    { method: 'PUT', path: /^\/v1\/files\/([\w-]+)\/content$/, scope: 'public', handler: receive },
    { method: 'POST', path: /^\/v1\/files\/([\w-]+)\/complete$/, scope: 'staff', handler: complete },
    { method: 'GET', path: /^\/v1\/members\/([\w-]+)\/documents$/, scope: 'branch', can: ['read', 'Member'], handler: documents },
    { method: 'GET', path: /^\/v1\/members\/([\w-]+)\/notifications$/, scope: 'branch', can: ['read', 'Member'], handler: messages },
    { method: 'POST', path: /^\/v1\/members\/([\w-]+)\/transfer$/, scope: 'branch', can: ['read', 'Member'], handler: transfer },
    { method: 'POST', path: /^\/v1\/members\/([\w-]+)\/anonymise$/, scope: 'branch', can: ['read', 'Member'], handler: anonymise },
    { method: 'POST', path: /^\/v1\/members\/([\w-]+)\/portal-access$/, scope: 'branch', can: ['read', 'Member'], handler: portalAccess },
    { method: 'POST', path: /^\/v1\/subscriptions\/([\w-]+)\/cancel$/, scope: 'branch', can: ['read', 'Subscription'], handler: cancel },
    { method: 'POST', path: /^\/v1\/subscriptions\/([\w-]+)\/upgrade$/, scope: 'branch', can: ['read', 'Subscription'], handler: upgrade },
    { method: 'POST', path: /^\/v1\/invoices\/([\w-]+)\/refund$/, scope: 'branch', can: ['create', 'Payment'], handler: refund },
    { method: 'POST', path: /^\/v1\/cash-closing$/, scope: 'branch', can: ['read', 'CashClosing'], handler: closeDay }
];
