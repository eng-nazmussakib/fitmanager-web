import type { Booking, ClassSession, ClassType } from '@core/models/class.model';

import type { MockDb } from '../types';
import { addDaysIso, at, weekdayOf, weekStart } from './clock';
import { Rng } from './prng';

export const CLASS_TYPES: ClassType[] = [
    { oid: 'ct-hiit', name: 'HIIT', color: 'red', minutes: 45 },
    { oid: 'ct-yoga', name: 'Yoga', color: 'teal', minutes: 60 },
    { oid: 'ct-spin', name: 'Spin', color: 'orange', minutes: 45 },
    { oid: 'ct-zumba', name: 'Zumba', color: 'pink', minutes: 60 },
    { oid: 'ct-strength', name: 'Strength circuit', color: 'blue', minutes: 50 },
    { oid: 'ct-boxing', name: 'Boxing fit', color: 'amber', minutes: 50 },
    { oid: 'ct-pilates', name: 'Pilates', color: 'violet', minutes: 55 },
    { oid: 'ct-ladies', name: 'Ladies cardio', color: 'green', minutes: 45 }
];

/** [weekday (0 = Sun), start "HH:mm", type, room, capacity, ladies only] — one weekly timetable, shifted per branch. */
const TIMETABLE: [number[], string, string, string, number, boolean?][] = [
    [[6, 1, 3], '07:00', 'ct-hiit', 'Studio A', 20],
    [[0, 2, 4], '07:00', 'ct-yoga', 'Studio B', 18],
    [[6, 0, 1, 2, 3, 4], '10:30', 'ct-ladies', 'Studio A', 16, true],
    [[6, 2, 4], '18:00', 'ct-spin', 'Spin room', 14],
    [[0, 1, 3], '18:00', 'ct-zumba', 'Studio A', 24],
    [[6, 0, 1, 2, 3, 4], '19:30', 'ct-strength', 'Studio B', 16],
    [[1, 3], '20:00', 'ct-boxing', 'Studio A', 14],
    [[5], '17:00', 'ct-yoga', 'Studio B', 18],
    [[5], '18:30', 'ct-hiit', 'Studio A', 20],
    [[2, 4], '08:30', 'ct-pilates', 'Studio B', 12]
];

/** Sessions for last week, this week and next two weeks (Saturday to Friday), with bookings and waitlists. */
export function seedClasses(db: MockDb, today: string): void {
    const rng = new Rng(5);
    db.classTypes = CLASS_TYPES;
    const first = addDaysIso(weekStart(today), -7);
    let bookingId = 0;
    for (const branch of db.branches.filter(b => b.kind === 'BRANCH')) {
        const trainers = db.trainers.filter(t => t.branch_oid === branch.oid);
        const women = trainers.filter(t => t.gender === 'Female');
        const members = db.members.filter(m => m.branch_oid === branch.oid && !m.pending && !m.suspended);
        for (let d = 0; d < 28; d++) {
            const date = addDaysIso(first, d);
            const wd = weekdayOf(date);
            for (const [days, time, typeOid, room, capacity, ladies] of TIMETABLE) {
                if (!days.includes(wd)) continue;
                // Uttara is the smallest branch: no Pilates or Boxing.
                if (branch.code === 'UTT' && (typeOid === 'ct-pilates' || typeOid === 'ct-boxing')) continue;
                const type = CLASS_TYPES.find(t => t.oid === typeOid)!;
                const pool = ladies ? women : trainers;
                const trainer = pool[(d + time.length + typeOid.length) % pool.length] ?? trainers[0];
                const [h, m] = time.split(':').map(Number);
                const startMin = h * 60 + m;
                const session: ClassSession = {
                    oid: `cs-${branch.code.toLowerCase()}-${date}-${time.replace(':', '')}`,
                    branch_oid: branch.oid,
                    type_oid: type.oid,
                    type_name: type.name,
                    color: type.color,
                    title: type.name,
                    trainer_oid: trainer.oid,
                    trainer_name: trainer.name,
                    room,
                    starts_at: at(date, startMin),
                    ends_at: at(date, startMin + type.minutes),
                    capacity,
                    booked: 0,
                    waitlist: 0,
                    ladies_only: !!ladies
                };
                const eligible = ladies ? members.filter(x => x.gender === 'Female') : members;
                const demand = Math.round(capacity * rng.around(0.78, 0.3, 0.2, 1.35));
                const chosen = new Set<string>();
                while (chosen.size < Math.min(demand, eligible.length)) chosen.add(rng.pick(eligible).oid);
                // The demo member always has a couple of bookings this week and next.
                if (branch.code === 'GUL' && !ladies && (typeOid === 'ct-strength' || typeOid === 'ct-spin') && date >= today) chosen.add('mem-gul-1');
                let i = 0;
                for (const memberOid of chosen) {
                    const member = db.members.find(x => x.oid === memberOid)!;
                    const status: Booking['status'] = i < capacity ? (date < today ? (rng.chance(0.86) ? 'Attended' : 'NoShow') : 'Booked') : 'Waitlist';
                    db.bookings.push({
                        oid: `bk-${++bookingId}`,
                        session_oid: session.oid,
                        member_oid: member.oid,
                        member_name: member.name,
                        member_code: member.code,
                        status,
                        booked_at: at(addDaysIso(date, -rng.int(0, 4)), rng.int(7 * 60, 22 * 60))
                    });
                    i++;
                }
                session.booked = Math.min(chosen.size, capacity);
                session.waitlist = Math.max(0, chosen.size - capacity);
                db.sessions.push(session);
            }
        }
    }
    db.counters['booking'] = bookingId;
}
