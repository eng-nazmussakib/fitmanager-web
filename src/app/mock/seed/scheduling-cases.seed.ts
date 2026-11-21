import type { Booking } from '@core/models/class.model';
import type { Invoice } from '@core/models/payment.model';
import type { Subscription } from '@core/models/subscription.model';

import type { MemberRow, MockDb, PtRow } from '../types';
import { addDaysIso, at, dateOf } from './clock';
import { seededSuspended } from './governance.seed';
import { toRef } from './organisation.seed';

/**
 * Phase 3's showcase cases in demo mode (D-072): the same list as the database's seeds/showcase/103_scheduling_cases.sql.
 * Runs after `seedClasses`, on the Gulshan members with a running membership (Rahim Uddin, mem-gul-1, is the demo
 * member's portal account).
 */
export function seedSchedulingCases(db: MockDb, today: string): void {
    const gul = db.branches.find(b => b.code === 'GUL')!;
    const running = (m: MemberRow): boolean =>
        !m.pending &&
        !seededSuspended(db, m) &&
        db.subscriptions.some(s => s.member_oid === m.oid && s.kind !== 'pt' && s.start_date <= today && today <= s.end_date && !s.freezes.length);
    const active = db.members.filter(m => m.branch_oid === gul.oid && running(m));
    const rahim = db.members.find(m => m.oid === 'mem-gul-1')!;
    const [a, b, c, e] = active.filter(m => m.oid !== rahim.oid && m.gender === 'Male');
    const [f1, f2] = active.filter(m => m.gender === 'Female');
    if (!a || !b || !c || !e || !f1 || !f2) return;
    let seq = 0;
    const id = (prefix: string): string => `${prefix}-case-${++seq}`;

    // Trainers: clients, days off, a profile hidden from the website.
    for (const m of [rahim, a, b]) m.trainer_oid = 'tr-gul-1';
    f1.trainer_oid = 'tr-gul-3';
    db.leave.push({ oid: id('lv'), trainer_oid: 'tr-gul-2', from_date: addDaysIso(today, 5), to_date: addDaysIso(today, 6), reason: 'Family wedding' });
    const hidden = db.trainers.find(t => t.oid === 'tr-utt-4');
    if (hidden) hidden.public = false;

    // Bookings in each status.
    const sessionOn = (type: string, date: string): string | undefined =>
        db.sessions.find(s => s.branch_oid === gul.oid && s.type_oid === type && dateOf(s.starts_at) === date)?.oid;
    const nearest = (type: string, date: string, ahead: boolean): string | undefined => {
        for (let k = 0; k < 4; k++) {
            const oid = sessionOn(type, addDaysIso(date, ahead ? k : -k));
            if (oid) return oid;
        }
        return undefined;
    };
    const book = (session: string | undefined, m: MemberRow, status: Booking['status'], late = false): string | undefined => {
        if (!session || db.bookings.some(x => x.session_oid === session && x.member_oid === m.oid && x.status !== 'Cancelled')) return undefined;
        const oid = id('bk');
        db.bookings.push({
            oid,
            session_oid: session,
            member_oid: m.oid,
            member_name: m.name,
            member_code: m.code,
            status,
            late_cancel: late,
            source: 'desk',
            booked_at: at(addDaysIso(today, -3), 600)
        });
        return oid;
    };
    book(nearest('ct-ladies', addDaysIso(today, 2), true), f2, 'Cancelled');
    book(nearest('ct-ladies', addDaysIso(today, -1), false), f2, 'Cancelled', true);
    // Three no-shows in a week: f1's booking is paused.
    book(nearest('ct-ladies', addDaysIso(today, -3), false), f1, 'NoShow');
    book(nearest('ct-yoga', addDaysIso(today, -4), false), f1, 'NoShow');
    book(nearest('ct-pilates', addDaysIso(today, -6), false), f1, 'NoShow');

    // A full one-off class tomorrow (2 places) with a waitlist, and a waitlist promotion message.
    const room = db.rooms.find(r => r.branch_oid === gul.oid && r.name === 'PT area')!;
    const tomorrow = addDaysIso(today, 1);
    db.sessions.push({
        oid: 'cs-case-oneoff',
        branch_oid: gul.oid,
        schedule_oid: null,
        type_oid: 'ct-hiit',
        type_name: 'HIIT',
        color: 'red',
        title: 'HIIT',
        trainer_oid: 'tr-gul-4',
        trainer_name: 'Shakib Hasan',
        room_oid: room.oid,
        room: room.name,
        starts_at: at(tomorrow, 13 * 60),
        ends_at: at(tomorrow, 13 * 60 + 45),
        capacity: 2,
        booked: 2,
        waitlist: 1,
        ladies_only: false,
        detached: true,
        cancelled: false,
        cancel_reason: null
    });
    book('cs-case-oneoff', a, 'Booked');
    book('cs-case-oneoff', b, 'Booked');
    book('cs-case-oneoff', c, 'Waitlist');
    db.messages.push({
        oid: id('msg'),
        member_oid: b.oid,
        kind: 'waitlist_promoted',
        subject: 'You are in: HIIT',
        body: `Dear ${b.name}, a place came free and you are now booked for HIIT tomorrow at 1:00 pm in PT area.`,
        created_at: at(today, 9 * 60)
    });

    // A cancelled class (members told) and a class moved on its own.
    const zumba = db.sessions.find(s => s.oid === nearest('ct-zumba', addDaysIso(today, 2), true));
    if (zumba) {
        book(zumba.oid, e, 'Cancelled');
        zumba.cancelled = true;
        zumba.cancel_reason = 'Trainer unwell';
        db.messages.push({
            oid: id('msg'),
            member_oid: e.oid,
            kind: 'class_cancelled',
            subject: `Cancelled: Zumba on ${dateOf(zumba.starts_at)}`,
            body: `Dear ${e.name}, Zumba is cancelled (Trainer unwell). Your booking is cancelled too.`,
            created_at: at(today, 8 * 60)
        });
    }
    const moved = db.sessions.find(s => s.oid === nearest('ct-pilates', addDaysIso(today, 3), true));
    if (moved) {
        moved.starts_at = at(dateOf(moved.starts_at), 9 * 60);
        moved.ends_at = at(dateOf(moved.ends_at), 9 * 60 + 55);
        moved.detached = true;
    }

    // Maintenance: the spin room in four days, locker L05 now; L30 not in use.
    const spin = db.rooms.find(r => r.branch_oid === gul.oid && r.name === 'Spin room')!;
    const day4 = addDaysIso(today, 4);
    db.blocks.push({
        oid: id('mb'),
        branch_oid: gul.oid,
        room_oid: spin.oid,
        locker_oid: null,
        starts_at: at(day4, 0),
        ends_at: at(day4, 23 * 60 + 59),
        reason: 'Bikes serviced',
        created_by_name: 'Ashraf Siddique'
    });
    const lockerOid = (n: string): string => db.lockers.find(l => l.branch_oid === gul.oid && l.number === n)!.oid;
    db.blocks.push({
        oid: id('mb'),
        branch_oid: gul.oid,
        room_oid: null,
        locker_oid: lockerOid('L05'),
        starts_at: at(addDaysIso(today, -1), 9 * 60),
        ends_at: at(addDaysIso(today, 6), 21 * 60),
        reason: 'Broken hinge',
        created_by_name: 'Ashraf Siddique'
    });
    db.lockers.find(l => l.oid === lockerOid('L30'))!.active = false;

    // Money: an invoice per PT package and locker rental, paid in cash.
    let invoiceSeq = db.counters['invoice:GUL'] ?? 0;
    const invoice = (m: MemberRow, label: string, amount: number, day: string, kind: Invoice['kind']): string => {
        const oid = id('inv');
        const vat = Math.round(amount * db.settings.vat_rate);
        db.invoices.push({
            oid,
            number: `INV-GUL-${day.slice(0, 4)}-${String(++invoiceSeq).padStart(5, '0')}`,
            kind,
            branch: toRef(gul),
            member_oid: m.oid,
            member_name: m.name,
            member_code: m.code,
            member_phone: m.phone,
            issued_at: at(day, 10 * 60),
            lines: [{ label, amount }],
            subtotal: amount,
            discount: 0,
            vat_rate: db.settings.vat_rate,
            vat_inclusive: db.settings.vat_inclusive,
            vat_bin: db.settings.vat_bin,
            vat,
            total: amount + vat,
            paid: amount + vat,
            due: 0,
            status: 'Paid',
            payments: [
                {
                    oid: id('pay'),
                    invoice_oid: oid,
                    amount: amount + vat,
                    method: 'cash',
                    reference: null,
                    received_at: at(day, 10 * 60),
                    received_by: 'Lamia Haque'
                }
            ]
        });
        return oid;
    };
    const pt = (m: MemberRow, code: string, start: string): Subscription => {
        const plan = db.plans.find(p => p.code === code)!;
        const sub: Subscription = {
            oid: id('sub'),
            member_oid: m.oid,
            plan_oid: plan.oid,
            plan_name: plan.name,
            start_date: start,
            end_date: addDaysIso(start, plan.months * 30 - 1),
            status: 'Active',
            total: plan.price,
            paid: plan.price,
            due: 0,
            invoice_oid: '',
            freezes: [],
            created_at: at(start, 10 * 60),
            freezable: false,
            kind: 'pt',
            sessions: plan.sessions
        };
        sub.invoice_oid = invoice(m, plan.name, plan.price, start, 'sale');
        db.subscriptions.push(sub);
        return sub;
    };
    const session = (m: MemberRow, sub: Subscription, day: string, minutes: number, status: PtRow['status'], extra: Partial<PtRow> = {}): string => {
        const oid = id('pt');
        db.ptSessions.push({
            oid,
            branch_oid: gul.oid,
            trainer_oid: 'tr-gul-1',
            trainer_name: 'Sam Cole',
            member_oid: m.oid,
            member_code: m.code,
            member_name: m.name,
            subscription_oid: sub.oid,
            room_oid: null,
            room_name: null,
            starts_at: at(day, minutes),
            ends_at: at(day, minutes + 60),
            status,
            charged: true,
            cancelled_by: null,
            cancel_reason: null,
            notes: null,
            source: 'desk',
            ...extra
        });
        return oid;
    };
    // Rahim (the portal member): a package in use, with every kind of session.
    const pack = pt(rahim, 'GUL-PT-8', addDaysIso(today, -12));
    session(rahim, pack, addDaysIso(today, -9), 8 * 60, 'Completed', { notes: 'Squat technique; goblet squats 3x10 at 16 kg.' });
    session(rahim, pack, addDaysIso(today, -5), 8 * 60, 'Completed', { notes: 'Deadlift from blocks 4x6 at 40 kg. Good bracing.' });
    session(rahim, pack, addDaysIso(today, -1), 17 * 60, 'Cancelled', { charged: false, cancelled_by: 'trainer', cancel_reason: 'Trainer at a competition' });
    session(rahim, pack, addDaysIso(today, 2), 8 * 60, 'Booked');
    db.messages.push(
        {
            oid: id('msg'),
            member_oid: rahim.oid,
            kind: 'pt_cancelled',
            subject: 'PT cancelled',
            body: `Dear ${rahim.name}, your PT session with Sam Cole is cancelled (Trainer at a competition). The session is back on your package.`,
            created_at: at(addDaysIso(today, -2), 12 * 60)
        },
        {
            oid: id('msg'),
            member_oid: rahim.oid,
            kind: 'pt_booked',
            subject: 'PT with Sam Cole',
            body: `Dear ${rahim.name}, your PT session with Sam Cole is on ${addDaysIso(today, 2)} at 8:00 am.`,
            created_at: at(addDaysIso(today, -1), 12 * 60)
        }
    );
    // A package used up, and one with a no-show and a late cancel by the member.
    session(a, pt(a, 'GUL-PT-1', addDaysIso(today, -8)), addDaysIso(today, -6), 18 * 60, 'Completed', { notes: 'Assessment and a plan to follow.' });
    const second = pt(b, 'GUL-PT-8', addDaysIso(today, -10));
    session(b, second, addDaysIso(today, -4), 7 * 60, 'NoShow');
    session(b, second, addDaysIso(today, -1), 9 * 60, 'Cancelled', { cancelled_by: 'member', cancel_reason: 'Overslept' });

    // Lockers: rented, ending this week, expired, ended early.
    const rent = (n: string, m: MemberRow, start: string, months: number, ended: string | null = null): void => {
        const locker = db.lockers.find(l => l.oid === lockerOid(n))!;
        db.rentals.push({
            oid: id('rn'),
            branch_oid: gul.oid,
            locker_oid: locker.oid,
            member_oid: m.oid,
            member_code: m.code,
            member_name: m.name,
            start_date: start,
            end_date: addDaysIso(start, months * 30 - 1),
            months,
            invoice_oid: invoice(m, `Locker ${n} (${locker.size}) · ${months} month${months === 1 ? '' : 's'}`, locker.monthly_fee * months, start, 'locker'),
            ended_on: ended
        });
    };
    rent('L01', rahim, addDaysIso(today, -20), 3);
    rent('L02', a, addDaysIso(today, -26), 1);
    rent('L03', f2, addDaysIso(today, -70), 1);
    rent('L04', e, addDaysIso(today, -15), 2, addDaysIso(today, -2));
    db.counters['invoice:GUL'] = invoiceSeq;
}
