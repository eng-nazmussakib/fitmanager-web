import type { Booking } from '@core/models/class.model';

import type { MockDb } from '../types';
import { materialise } from './classes.seed';
import { addDaysIso, at, dateOf, weekStart } from './clock';
import { seededSuspended } from './governance.seed';
import { Rng } from './prng';

/** The portal's demo member keeps an NPS card and sessions to rate (governance's cases). */
const PORTAL_MEMBER = 'MEM-GUL-000001';

/**
 * Three months of history for the reports, like the database seed 107: the timetable from 92 days back to
 * where `seedClasses` starts (last week), booked by the branch's members (attended, cancelled, and no-shows only
 * before 30 days back, so no one is paused for no-shows); NPS answers from a third of the members, once;
 * and one attended class in ten rated. Visits reach back 92 days in `seedAttendance`, and the shop's sales in
 * `seedBusiness`. Deterministic.
 */
export function seedReportHistory(db: MockDb, today: string): void {
    const rng = new Rng(107);
    const start = addDaysIso(today, -92);
    const end = addDaysIso(addDaysIso(weekStart(today), -7), -1);
    let bookingId = db.counters['booking'] ?? db.bookings.length;
    const before = new Set(db.sessions.map(s => s.oid));
    for (const branch of db.branches.filter(b => b.kind === 'BRANCH')) {
        materialise(db, branch.oid, start, end);
        const members = db.members.filter(m => m.branch_oid === branch.oid && !m.pending && !seededSuspended(db, m));
        const covered = (oid: string, date: string): boolean => db.subscriptions.some(s => s.member_oid === oid && s.start_date <= date && date <= s.end_date);
        for (const session of db.sessions.filter(s => s.branch_oid === branch.oid && !before.has(s.oid))) {
            const date = dateOf(session.starts_at);
            const eligible = members.filter(m => (!session.ladies_only || m.gender === 'Female') && covered(m.oid, date));
            const want = Math.min(eligible.length, Math.round(session.capacity * rng.around(0.62, 0.25, 0.2, 1)));
            const chosen = new Set<string>();
            while (chosen.size < want) chosen.add(rng.pick(eligible).oid);
            for (const oid of chosen) {
                const m = db.members.find(x => x.oid === oid)!;
                const roll = rng.next();
                const status: Booking['status'] = roll < 0.07 && date < addDaysIso(today, -30) ? 'NoShow' : roll < 0.15 ? 'Cancelled' : 'Attended';
                const booking: Booking = {
                    oid: `bk-${++bookingId}`,
                    session_oid: session.oid,
                    member_oid: m.oid,
                    member_name: m.name,
                    member_code: m.code,
                    status,
                    source: rng.chance(0.6) ? 'portal' : 'desk',
                    booked_at: at(addDaysIso(date, -rng.int(0, 4)), rng.int(7 * 60, 22 * 60))
                };
                db.bookings.push(booking);
                // One attended class in ten is rated, a day or two later.
                if (status === 'Attended' && rng.chance(0.1) && m.code !== PORTAL_MEMBER)
                    db.ratings.push({
                        oid: `rt-h${bookingId}`,
                        branch_oid: branch.oid,
                        member_oid: m.oid,
                        member_name: m.name,
                        kind: 'class',
                        booking_oid: booking.oid,
                        pt_session_oid: null,
                        trainer_oid: session.trainer_oid,
                        trainer_name: session.trainer_name,
                        label: session.title,
                        session_at: session.starts_at,
                        score: rng.int(3, 5),
                        comment: null,
                        created_at: at(addDaysIso(date, rng.int(1, 2)), 21 * 60)
                    });
            }
            session.booked = [...chosen].filter((_, i) => i < session.capacity).length;
            session.waitlist = 0;
        }
    }
    db.counters['booking'] = bookingId;

    // NPS: a third of the members, once, 30 to 75 days after joining, inside the 92 days (Uttara a little less happy).
    const comments = [
        'Great trainers.',
        'Too crowded in the evening.',
        'Clean and friendly.',
        'The showers need fixing.',
        'Good value for money.',
        'Love the classes.'
    ];
    let n = 0;
    const answered = new Set(db.nps.map(x => x.member_oid));
    for (const m of db.members) {
        // The scripted cases (the portal member's card, governance's answers) stay as they are.
        if (m.pending || answered.has(m.oid) || m.code === PORTAL_MEMBER || !rng.chance(1 / 3)) continue;
        const day = addDaysIso(m.joined_on, 30 + rng.int(0, 45));
        if (day < start || day >= today) continue;
        const base = db.branches.find(b => b.oid === m.branch_oid)?.code === 'UTT' ? 6 : 7;
        const score = Math.max(0, Math.min(10, base + rng.int(0, 4) - (rng.chance(1 / 7) ? 5 : 0)));
        db.nps.push({
            oid: `nps-h${++n}`,
            branch_oid: m.branch_oid,
            member_oid: m.oid,
            score,
            comment: rng.chance(0.25) ? rng.pick(comments) : null,
            created_at: at(day, 20 * 60)
        });
    }
}
