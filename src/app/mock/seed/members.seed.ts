import type { Branch } from '@core/models/branch.model';
import type { Gender } from '@core/models/member.model';
import type { Invoice, PaymentRecord } from '@core/models/payment.model';
import type { Plan } from '@core/models/plan.model';
import type { PaymentMethod, Subscription } from '@core/models/subscription.model';

import { endDate } from '../domain/pricing';
import type { MemberRow, MockDb } from '../types';
import { addDaysIso, at } from './clock';
import { seededSuspended, seedSuspension } from './governance.seed';
import { AREAS, FEMALE_NAMES, FEMALE_ONLY_LAST, HEALTH_FLAGS, LAST_NAMES, MALE_NAMES, MOBILE_PREFIXES, RELATIONS } from './names';
import { toRef } from './organisation.seed';
import { Rng } from './prng';

/** Members per branch. */
export const MEMBER_COUNTS: Record<string, number> = { GUL: 250, DHA: 180, UTT: 140 };

/** Gulshan members with fixed situations, for the demo script (check-in outcomes, renewals, overrides). */
export const SCRIPTED: { code: string; name: string; gender: Gender; story: 'ok' | 'expired' | 'dues' | 'frozen' | 'suspended' | 'pending' | 'expiring' }[] = [
    { code: 'MEM-GUL-000001', name: 'Rahim Uddin', gender: 'Male', story: 'ok' },
    { code: 'MEM-GUL-000002', name: 'Karim Ahmed', gender: 'Male', story: 'expired' },
    { code: 'MEM-GUL-000003', name: 'Nusrat Jahan', gender: 'Female', story: 'dues' },
    { code: 'MEM-GUL-000004', name: 'Farhana Akter', gender: 'Female', story: 'frozen' },
    { code: 'MEM-GUL-000005', name: 'Tanvir Hasan', gender: 'Male', story: 'suspended' },
    { code: 'MEM-GUL-000006', name: 'Sadia Islam', gender: 'Female', story: 'expiring' },
    { code: 'MEM-GUL-000007', name: 'Arif Hossain', gender: 'Male', story: 'pending' }
];

interface Ctx {
    rng: Rng;
    db: MockDb;
    today: string;
}

function nextInvoiceNumber(db: MockDb, branch: Branch, date: string): string {
    const key = `invoice:${branch.code}`;
    const n = (db.counters[key] = (db.counters[key] ?? 0) + 1);
    return `INV-${branch.code}-${date.slice(0, 4)}-${String(n).padStart(5, '0')}`;
}

const METHODS: [PaymentMethod, number][] = [
    ['cash', 42],
    ['bkash', 30],
    ['card', 14],
    ['nagad', 9],
    ['bank', 5]
];
const DESK_NAMES: Record<string, string> = { GUL: 'Lamia Haque', DHA: 'Mim Sarker', UTT: 'Tanjila Biswas' };

export function reference(rng: Rng, method: PaymentMethod): string | null {
    if (method === 'cash') return null;
    const alnum = (n: number): string => Array.from({ length: n }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[rng.int(0, 31)]).join('');
    if (method === 'bkash') return `BK${alnum(8)}`;
    if (method === 'nagad') return `NG${alnum(8)}`;
    if (method === 'card') return `POS-${rng.int(100000, 999999)}`;
    return `TRX${rng.int(10000000, 99999999)}`;
}

/** One subscription with its invoice and payments. `paidRatio` < 1 leaves dues. */
function addSubscription(
    c: Ctx,
    member: MemberRow,
    branch: Branch,
    plan: Plan,
    start: string,
    admission: boolean,
    paidRatio: number,
    payDelayDays = 0
): Subscription {
    const { db, rng } = c;
    const end = endDate(start, plan.months);
    const lines = [{ label: plan.name, amount: plan.price }];
    if (admission) lines.push({ label: 'Admission fee', amount: plan.admission_fee });
    const subtotal = lines.reduce((s, l) => s + l.amount, 0);
    const discount = rng.chance(0.12) ? Math.round((plan.price * rng.pick([5, 10, 15])) / 100) : 0;
    const vatRate = db.settings.vat_rate;
    const vat = Math.round((subtotal - discount) * vatRate);
    const total = subtotal - discount + vat;
    const paid = paidRatio >= 1 ? total : Math.round((total * paidRatio) / 50) * 50;
    const invoiceOid = `inv-${db.invoices.length + 1}`;
    const issued = at(start <= c.today ? start : c.today, rng.int(7 * 60, 21 * 60));
    const payments: PaymentRecord[] = [];
    if (paid > 0) {
        const method = rng.weighted(METHODS);
        payments.push({
            oid: `pay-${invoiceOid}-1`,
            invoice_oid: invoiceOid,
            amount: paid,
            method,
            reference: reference(rng, method),
            received_at: payDelayDays ? at(addDaysIso(start, payDelayDays), rng.int(8 * 60, 21 * 60)) : issued,
            received_by: DESK_NAMES[branch.code] ?? 'Front desk'
        });
    }
    const invoice: Invoice = {
        oid: invoiceOid,
        number: nextInvoiceNumber(db, branch, start),
        branch: toRef(branch),
        member_oid: member.oid,
        member_name: member.name,
        member_code: member.code,
        member_phone: member.phone,
        issued_at: issued,
        lines,
        subtotal,
        discount,
        vat_rate: vatRate,
        vat_bin: db.settings.vat_bin,
        vat,
        total,
        paid,
        due: total - paid,
        status: paid >= total ? 'Paid' : paid > 0 ? 'Partial' : 'Due',
        payments
    };
    db.invoices.push(invoice);
    const sub: Subscription = {
        oid: `sub-${db.subscriptions.length + 1}`,
        member_oid: member.oid,
        plan_oid: plan.oid,
        plan_name: plan.name,
        start_date: start,
        end_date: end,
        status: 'Active',
        total,
        paid,
        due: total - paid,
        invoice_oid: invoiceOid,
        freezes: [],
        created_at: issued
    };
    db.subscriptions.push(sub);
    return sub;
}

function phone(rng: Rng, used: Set<string>): string {
    for (;;) {
        const p = `${rng.pick(MOBILE_PREFIXES)}${String(rng.int(0, 99_999_999)).padStart(8, '0')}`;
        if (!used.has(p)) {
            used.add(p);
            return p;
        }
    }
}

function memberName(rng: Rng, gender: Gender): string {
    const first = gender === 'Male' ? rng.pick(MALE_NAMES) : rng.pick(FEMALE_NAMES);
    let last = rng.pick(LAST_NAMES);
    while (gender === 'Male' && FEMALE_ONLY_LAST.has(last)) last = rng.pick(LAST_NAMES);
    return `${first} ${last}`;
}

/** Morning, lunchtime or evening regulars, in minutes after midnight (Dhaka). */
function habit(rng: Rng): number {
    const slot = rng.weighted([
        ['morning', 34],
        ['midday', 14],
        ['evening', 52]
    ] as const);
    if (slot === 'morning') return rng.int(6 * 60, 9 * 60);
    if (slot === 'midday') return rng.int(11 * 60, 14 * 60);
    return rng.int(17 * 60, 21 * 60 + 30);
}

/**
 * Members with 12+ months of history: subscriptions chained renewal after renewal (some lapse and rejoin with an
 * admission fee, some stop), each with an invoice and payments; a few owe money, a few are frozen today.
 */
export function seedMembers(db: MockDb, today: string): void {
    const rng = new Rng(20261115);
    const ctx: Ctx = { rng, db, today };
    const phones = new Set<string>();
    for (const branch of db.branches.filter(b => b.kind === 'BRANCH')) {
        const plans = db.plans.filter(p => p.branch_oid === branch.oid);
        const plan = (tier: string, period: string): Plan => plans.find(p => p.tier === tier && p.period === period)!;
        const trainers = db.trainers.filter(t => t.branch_oid === branch.oid);
        const count = MEMBER_COUNTS[branch.code] ?? 100;
        db.counters[`member:${branch.code}`] = 0;

        for (let i = 0; i < count; i++) {
            const seq = (db.counters[`member:${branch.code}`] = i + 1);
            const scripted = branch.code === 'GUL' ? SCRIPTED[i] : undefined;
            const gender: Gender = scripted?.gender ?? (rng.chance(0.64) ? 'Male' : 'Female');
            const name = scripted?.name ?? memberName(rng, gender);
            // Newer members are more common: the gym has grown.
            const joinedDaysAgo = scripted ? (scripted.story === 'pending' ? 1 : 300) : Math.floor(Math.pow(rng.next(), 1.6) * 900) + 2;
            const member: MemberRow = {
                oid: `mem-${branch.code.toLowerCase()}-${seq}`,
                code: `MEM-${branch.code}-${String(seq).padStart(6, '0')}`,
                branch_oid: branch.oid,
                name,
                phone: phone(rng, phones),
                gender,
                email: rng.chance(0.55) ? `${name.toLowerCase().replace(/\s+/g, '.')}${rng.int(1, 99)}@example.com` : null,
                date_of_birth: `${rng.int(1975, 2006)}-${String(rng.int(1, 12)).padStart(2, '0')}-${String(rng.int(1, 28)).padStart(2, '0')}`,
                address: `House ${rng.int(1, 120)}, Road ${rng.int(1, 40)}, ${rng.pick(AREAS[branch.code] ?? ['Dhaka'])}`,
                emergency_contact: { name: memberName(rng, rng.chance(0.5) ? 'Male' : 'Female'), phone: phone(rng, phones), relation: rng.pick(RELATIONS) },
                health_flags: rng.chance(0.18) ? [rng.pick(HEALTH_FLAGS.filter(f => gender === 'Female' || f !== 'Pregnancy'))] : [],
                health_declared: true,
                photo_url: null,
                joined_on: addDaysIso(today, -joinedDaysAgo),
                pending: scripted?.story === 'pending',
                trainer_oid: rng.chance(0.35) && trainers.length ? rng.pick(trainers).oid : null,
                notes: null,
                regularity: rng.around(0.42, 0.25, 0.08, 0.85),
                habit_minutes: habit(rng)
            };
            db.members.push(member);
            if (member.pending) continue;

            if (scripted) {
                seedScripted(ctx, member, branch, plan, scripted.story);
                continue;
            }

            // History starts at most ~13 months back (12 months of payments).
            let start = member.joined_on < addDaysIso(today, -395) ? addDaysIso(today, -rng.int(330, 395)) : member.joined_on;
            let first = member.joined_on >= addDaysIso(today, -395);
            const tier = rng.weighted([
                ['single', 82],
                ['duo', 14],
                ['group', 4]
            ] as const);
            for (let guard = 0; guard < 40 && start <= today; guard++) {
                const period = rng.weighted([
                    ['monthly', 46],
                    ['quarterly', 29],
                    ['half-yearly', 15],
                    ['annual', 10]
                ] as const);
                const isCurrent = endDate(start, plan(tier, period).months) >= today;
                // Most pay in full; a few recent ones are part-paid (dues).
                const partial = isCurrent && rng.chance(0.11);
                const sub = addSubscription(ctx, member, branch, plan(tier, period), start, first, partial ? rng.pick([0.4, 0.5, 0.7]) : 1);
                first = false;
                if (isCurrent) break;
                // Renew on time (most), after a lapse (rejoin with admission), or stop.
                const r = rng.next();
                if (r < 0.1) break;
                if (r < 0.22) {
                    start = addDaysIso(sub.end_date, rng.int(10, 75));
                    first = true;
                } else start = addDaysIso(sub.end_date, rng.chance(0.7) ? 1 : rng.int(2, 6));
            }
        }
        // A few active members are frozen today (travel, illness).
        const active = db.subscriptions.filter(
            s =>
                s.start_date <= today &&
                s.end_date >= today &&
                s.member_oid.startsWith(`mem-${branch.code.toLowerCase()}-`) &&
                Number(s.member_oid.split('-')[2]) > SCRIPTED.length
        );
        for (let k = 0; k < Math.max(2, Math.round(active.length * 0.03)); k++) {
            const s = rng.pick(active);
            if (s.freezes.length) continue;
            const from = addDaysIso(today, -rng.int(1, 10));
            const to = addDaysIso(from, rng.int(14, 30));
            s.freezes.push({ from, to, reason: rng.pick(['Travelling abroad', 'Illness', 'Exams', 'Family event']) });
            s.end_date = addDaysIso(s.end_date, 1 + Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000));
        }
        // One suspended member per branch besides the scripted one.
        const candidate = db.members.find(m => m.branch_oid === branch.oid && !m.pending && !seededSuspended(db, m) && Number(m.oid.split('-')[2]) > 20);
        if (candidate && branch.code !== 'GUL')
            seedSuspension(
                db,
                candidate,
                branch.code as 'DHA' | 'UTT',
                addDaysIso(today, -6),
                10,
                'Repeated warnings about dropping weights near others.',
                'Dropped weights again after warnings'
            );
    }
}

function seedScripted(c: Ctx, m: MemberRow, branch: Branch, plan: (tier: string, period: string) => Plan, story: string): void {
    const { today } = c;
    m.regularity = 0.6;
    m.trainer_oid = 'tr-gul-1';
    if (story === 'ok') {
        // The portal's demo member: a history, a running quarterly plan, a trainer.
        addSubscription(c, m, branch, plan('single', 'quarterly'), addDaysIso(today, -270), true, 1);
        addSubscription(c, m, branch, plan('single', 'quarterly'), addDaysIso(today, -179), false, 1);
        addSubscription(c, m, branch, plan('single', 'quarterly'), addDaysIso(today, -88), false, 1);
        m.health_flags = ['Lower back pain'];
        m.email = 'rahim.uddin@example.com';
    } else if (story === 'expired') {
        // Renewal scenario: the last plan ended 3 days ago.
        addSubscription(c, m, branch, plan('single', 'monthly'), addDaysIso(today, -125), true, 1);
        const last = addSubscription(c, m, branch, plan('single', 'quarterly'), addDaysIso(today, -94), false, 1);
        last.end_date = addDaysIso(today, -3);
    } else if (story === 'dues') {
        addSubscription(c, m, branch, plan('single', 'quarterly'), addDaysIso(today, -40), true, 0.6);
        // Make the dues exactly ৳2,500 for the script.
        const inv = c.db.invoices[c.db.invoices.length - 1];
        inv.paid = inv.total - 2500;
        inv.due = 2500;
        inv.status = 'Partial';
        inv.payments[0].amount = inv.paid;
        const sub = c.db.subscriptions[c.db.subscriptions.length - 1];
        sub.paid = inv.paid;
        sub.due = 2500;
    } else if (story === 'frozen') {
        const sub = addSubscription(c, m, branch, plan('single', 'half-yearly'), addDaysIso(today, -60), true, 1);
        sub.freezes.push({ from: addDaysIso(today, -5), to: addDaysIso(today, 9), reason: 'Travelling abroad' });
        sub.end_date = addDaysIso(sub.end_date, 15);
    } else if (story === 'suspended') {
        addSubscription(c, m, branch, plan('single', 'monthly'), addDaysIso(today, -12), true, 1);
        // The third case in three weeks (the governance seed adds the first two, the evidence and an appeal).
        seedSuspension(
            c.db,
            m,
            'GUL',
            addDaysIso(today, -4),
            14,
            'Abusive language to another member (gym rules §3). Suspended for two weeks; your plan keeps running.',
            'Shouting at another member over a bench'
        );
    } else if (story === 'expiring') {
        addSubscription(c, m, branch, plan('duo', 'monthly'), addDaysIso(today, -27), true, 1);
    }
}
