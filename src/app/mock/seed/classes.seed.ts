import type { Booking, ClassSession, ClassType } from '@core/models/class.model';

import type { MockDb, RuleRow } from '../types';
import { addDaysIso, at, weekdayOf, weekStart } from './clock';
import { Rng } from './prng';

/** HQ class types (D-080): the same as the API's seed (fitmanager-infra/db/seeds/demo/005_scheduling.sql). */
export const CLASS_TYPES: ClassType[] = [
    { oid: 'ct-hiit', name: 'HIIT', color: 'red', minutes: 45, description: 'Short, hard intervals for fitness and fat loss.', sort_order: 1, active: true },
    { oid: 'ct-yoga', name: 'Yoga', color: 'teal', minutes: 60, description: 'Mobility, balance and breathing, for every level.', sort_order: 2, active: true },
    {
        oid: 'ct-spin',
        name: 'Spin',
        color: 'orange',
        minutes: 45,
        description: 'Indoor cycling to music, paced by the instructor.',
        sort_order: 3,
        active: true
    },
    { oid: 'ct-zumba', name: 'Zumba', color: 'pink', minutes: 60, description: 'Dance cardio: easy to follow, hard to stop.', sort_order: 4, active: true },
    {
        oid: 'ct-strength',
        name: 'Strength circuit',
        color: 'blue',
        minutes: 50,
        description: 'Full-body strength stations with free weights and machines.',
        sort_order: 5,
        active: true
    },
    {
        oid: 'ct-boxing',
        name: 'Boxing fit',
        color: 'amber',
        minutes: 50,
        description: 'Pad work and conditioning; gloves provided.',
        sort_order: 6,
        active: true
    },
    { oid: 'ct-pilates', name: 'Pilates', color: 'violet', minutes: 55, description: 'Core strength and posture on the mat.', sort_order: 7, active: true },
    {
        oid: 'ct-ladies',
        name: 'Ladies cardio',
        color: 'green',
        minutes: 45,
        description: 'A ladies-only cardio class with a female trainer.',
        sort_order: 8,
        active: true
    }
];

/** [branch, weekdays (0 = Sun), start, type, room, capacity, ladies only, trainer]: the API seed's weekly rules. */
const RULES: [string, number[], string, string, string, number, boolean, string][] = [
    ['GUL', [6, 1, 3], '07:00', 'ct-hiit', 'Studio A', 20, false, 'tr-gul-4'],
    ['GUL', [0, 2, 4], '07:00', 'ct-yoga', 'Studio B', 18, false, 'tr-gul-3'],
    ['GUL', [6, 0, 1, 2, 3, 4], '10:30', 'ct-ladies', 'Studio A', 16, true, 'tr-gul-5'],
    ['GUL', [6, 2, 4], '18:00', 'ct-spin', 'Spin room', 14, false, 'tr-gul-2'],
    ['GUL', [0, 1, 3], '18:00', 'ct-zumba', 'Studio A', 24, false, 'tr-gul-5'],
    ['GUL', [6, 0, 1, 2, 3, 4], '19:30', 'ct-strength', 'Studio B', 16, false, 'tr-gul-1'],
    ['GUL', [1, 3], '20:00', 'ct-boxing', 'Studio A', 14, false, 'tr-gul-4'],
    ['GUL', [5], '17:00', 'ct-yoga', 'Studio B', 18, false, 'tr-gul-3'],
    ['GUL', [5], '18:30', 'ct-hiit', 'Studio A', 20, false, 'tr-gul-4'],
    ['GUL', [2, 4], '08:30', 'ct-pilates', 'Studio B', 12, false, 'tr-gul-3'],
    ['DHA', [6, 1, 3], '07:00', 'ct-hiit', 'Studio A', 20, false, 'tr-dha-4'],
    ['DHA', [0, 2, 4], '07:00', 'ct-yoga', 'Studio B', 18, false, 'tr-dha-2'],
    ['DHA', [6, 0, 1, 2, 3, 4], '10:30', 'ct-ladies', 'Studio A', 16, true, 'tr-dha-2'],
    ['DHA', [6, 2, 4], '18:00', 'ct-spin', 'Spin room', 14, false, 'tr-dha-3'],
    ['DHA', [0, 1, 3], '18:00', 'ct-zumba', 'Studio A', 24, false, 'tr-dha-2'],
    ['DHA', [6, 0, 1, 2, 3, 4], '19:30', 'ct-strength', 'Studio B', 16, false, 'tr-dha-1'],
    ['DHA', [1, 3], '20:00', 'ct-boxing', 'Studio A', 14, false, 'tr-dha-4'],
    ['DHA', [5], '17:00', 'ct-yoga', 'Studio B', 18, false, 'tr-dha-2'],
    ['DHA', [5], '18:30', 'ct-hiit', 'Studio A', 20, false, 'tr-dha-4'],
    ['DHA', [2, 4], '08:30', 'ct-pilates', 'Studio B', 12, false, 'tr-dha-2'],
    ['UTT', [6, 1, 3], '07:00', 'ct-hiit', 'Studio A', 20, false, 'tr-utt-1'],
    ['UTT', [0, 2, 4], '07:00', 'ct-yoga', 'Studio B', 18, false, 'tr-utt-4'],
    ['UTT', [6, 0, 1, 2, 3, 4], '10:30', 'ct-ladies', 'Studio A', 16, true, 'tr-utt-2'],
    ['UTT', [6, 2, 4], '18:00', 'ct-spin', 'Spin room', 14, false, 'tr-utt-3'],
    ['UTT', [0, 1, 3], '18:00', 'ct-zumba', 'Studio A', 24, false, 'tr-utt-2'],
    ['UTT', [6, 0, 1, 2, 3, 4], '19:30', 'ct-strength', 'Studio B', 16, false, 'tr-utt-3'],
    ['UTT', [5], '17:00', 'ct-yoga', 'Studio B', 18, false, 'tr-utt-4'],
    ['UTT', [5], '18:30', 'ct-hiit', 'Studio A', 20, false, 'tr-utt-1']
];

const ROOMS: [string, number][] = [
    ['Studio A', 24],
    ['Studio B', 18],
    ['Spin room', 14],
    ['PT area', 4]
];
const LOCKER_COUNT: Record<string, number> = { GUL: 30, DHA: 20, UTT: 12 };

const minutesOf = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** The session one rule makes on one day: the oid is fixed, so making it again (on read, after a reload) finds it. */
export function sessionFor(d: MockDb, rule: RuleRow, date: string): ClassSession {
    const type = d.classTypes.find(t => t.oid === rule.class_type_oid) ?? CLASS_TYPES[0];
    const trainer = d.trainers.find(t => t.oid === rule.trainer_oid);
    const room = d.rooms.find(r => r.oid === rule.room_oid);
    const start = minutesOf(rule.start_time);
    return {
        oid: `cs-${rule.oid}-${date}`,
        branch_oid: rule.branch_oid,
        schedule_oid: rule.oid,
        type_oid: type.oid,
        type_name: type.name,
        color: type.color,
        title: type.name,
        trainer_oid: rule.trainer_oid,
        trainer_name: trainer?.name ?? 'Trainer',
        room_oid: rule.room_oid,
        room: room?.name ?? 'Room',
        starts_at: at(date, start),
        ends_at: at(date, start + rule.minutes),
        capacity: rule.capacity,
        booked: 0,
        waitlist: 0,
        ladies_only: rule.ladies_only,
        detached: false,
        cancelled: false,
        cancel_reason: null
    };
}

/**
 * Makes the sessions of the branch's active rules from `from` to `to` (Dhaka dates) that do not exist yet, and
 * counts their bookings: the API's `materialise`, run when the timetable is read (D-075).
 */
export function materialise(d: MockDb, branchOid: string, from: string, to: string): void {
    const have = new Set(d.sessions.filter(s => s.branch_oid === branchOid).map(s => s.oid));
    for (const rule of d.rules) {
        if (rule.branch_oid !== branchOid || !rule.active) continue;
        for (let date = from > rule.valid_from ? from : rule.valid_from; date <= to && (!rule.valid_to || date <= rule.valid_to); date = addDaysIso(date, 1)) {
            if (!rule.weekdays.includes(weekdayOf(date))) continue;
            const s = sessionFor(d, rule, date);
            if (have.has(s.oid)) continue;
            const list = d.bookings.filter(b => b.session_oid === s.oid);
            s.booked = list.filter(b => b.status === 'Booked' || b.status === 'Attended' || b.status === 'NoShow').length;
            s.waitlist = list.filter(b => b.status === 'Waitlist').length;
            d.sessions.push(s);
            have.add(s.oid);
        }
    }
}

/** Rooms, lockers, weekly rules and trainer availability: the API seed's facilities. */
export function seedFacilities(db: MockDb): void {
    db.classTypes = CLASS_TYPES.map(t => ({ ...t }));
    for (const b of db.branches.filter(x => x.kind === 'BRANCH')) {
        const code = b.code.toLowerCase();
        for (const [name, capacity] of ROOMS)
            db.rooms.push({
                oid: `rm-${code}-${name.toLowerCase().replace(/\s+/g, '-')}`,
                branch_oid: b.oid,
                name,
                capacity: name === 'PT area' && b.code === 'UTT' ? 3 : capacity,
                active: true
            });
        for (let n = 1; n <= (LOCKER_COUNT[b.code] ?? 0); n++) {
            const size = n % 5 === 0 ? 'L' : n % 2 === 0 ? 'M' : 'S';
            db.lockers.push({
                oid: `lk-${code}-${n}`,
                branch_oid: b.oid,
                number: `L${String(n).padStart(2, '0')}`,
                size,
                monthly_fee: size === 'L' ? 800 : size === 'M' ? 500 : 300,
                active: true
            });
        }
    }
    RULES.forEach(([branchCode, weekdays, start, type, roomName, capacity, ladies, trainer], i) => {
        const branch = db.branches.find(b => b.code === branchCode)!;
        const room = db.rooms.find(r => r.branch_oid === branch.oid && r.name === roomName)!;
        db.rules.push({
            oid: `rl-${i + 1}`,
            branch_oid: branch.oid,
            class_type_oid: type,
            trainer_oid: trainer,
            room_oid: room.oid,
            weekdays,
            start_time: start,
            minutes: CLASS_TYPES.find(t => t.oid === type)?.minutes ?? 60,
            capacity,
            ladies_only: ladies,
            valid_from: '2026-01-01',
            valid_to: null,
            active: true
        });
    });
    for (const t of db.trainers)
        for (const weekday of [6, 0, 1, 2, 3, 4])
            for (const [start, end] of [
                ['07:00', '12:00'],
                ['16:00', '21:00']
            ])
                db.availability.push({
                    oid: `av-${t.oid}-${weekday}-${start}`,
                    branch_oid: t.branch_oid,
                    trainer_oid: t.oid,
                    weekday,
                    start_time: start,
                    end_time: end
                });
}

/** Sessions for last week, this week and the next two (Saturday to Friday), with bookings and waitlists. */
export function seedClasses(db: MockDb, today: string): void {
    const rng = new Rng(5);
    const first = addDaysIso(weekStart(today), -7);
    const last = addDaysIso(first, 27);
    let bookingId = 0;
    for (const branch of db.branches.filter(b => b.kind === 'BRANCH')) {
        materialise(db, branch.oid, first, last);
        const members = db.members.filter(m => m.branch_oid === branch.oid && !m.pending && !m.suspended);
        for (const session of db.sessions.filter(s => s.branch_oid === branch.oid)) {
            const date = session.starts_at.slice(0, 10);
            const eligible = session.ladies_only ? members.filter(x => x.gender === 'Female') : members;
            const demand = Math.round(session.capacity * rng.around(0.78, 0.3, 0.2, 1.35));
            const chosen = new Set<string>();
            while (chosen.size < Math.min(demand, eligible.length)) chosen.add(rng.pick(eligible).oid);
            // The demo member always has a couple of bookings this week and next.
            if (branch.code === 'GUL' && !session.ladies_only && (session.type_oid === 'ct-strength' || session.type_oid === 'ct-spin') && date >= today)
                chosen.add('mem-gul-1');
            let i = 0;
            for (const memberOid of chosen) {
                const member = db.members.find(x => x.oid === memberOid)!;
                const status: Booking['status'] =
                    i < session.capacity ? (date < today ? (rng.chance(0.86) ? 'Attended' : 'NoShow') : 'Booked') : date < today ? 'Cancelled' : 'Waitlist';
                db.bookings.push({
                    oid: `bk-${++bookingId}`,
                    session_oid: session.oid,
                    member_oid: member.oid,
                    member_name: member.name,
                    member_code: member.code,
                    status,
                    source: rng.chance(0.6) ? 'portal' : 'desk',
                    booked_at: at(addDaysIso(date, -rng.int(0, 4)), rng.int(7 * 60, 22 * 60))
                });
                i++;
            }
            session.booked = Math.min(chosen.size, session.capacity);
            session.waitlist = date < today ? 0 : Math.max(0, chosen.size - session.capacity);
        }
    }
    db.counters['booking'] = bookingId;
}
