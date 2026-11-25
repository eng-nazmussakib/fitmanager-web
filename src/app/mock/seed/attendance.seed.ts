import type { MockDb } from '../types';
import { addDaysIso, at, weekdayOf } from './clock';
import { seededSuspended } from './governance.seed';
import { openingHours } from './organisation.seed';
import { Rng } from './prng';

/** Friday is the weekend: fewer visits, later. */
const WEEKDAY_FACTOR = [1, 1, 1, 0.95, 0.9, 0.55, 1.05];

/**
 * 92 days of check-ins (three months of history for the reports) following each member's habit (morning, midday or evening regulars) and the branch's
 * opening hours. Today's visits stop at the current time; people who came in within the last ~80 minutes are
 * still inside (no check-out), which feeds the live occupancy.
 */
export function seedAttendance(db: MockDb, today: string, nowMinutes: number): void {
    const rng = new Rng(60);
    const subsByMember = new Map<string, { start_date: string; end_date: string; freezes: { from: string; to: string }[] }[]>();
    for (const s of db.subscriptions) (subsByMember.get(s.member_oid) ?? subsByMember.set(s.member_oid, []).get(s.member_oid)!).push(s);
    const desk: Record<string, string> = { 'br-gul': 'Lamia Haque', 'br-dha': 'Mim Sarker', 'br-utt': 'Tanjila Biswas' };
    const hoursOf = new Map(db.branches.map(b => [b.oid, openingHours(b.name)]));
    let n = 0;
    for (let d = 91; d >= 0; d--) {
        const date = addDaysIso(today, -d);
        const wd = weekdayOf(date);
        for (const m of db.members) {
            if (m.pending || seededSuspended(db, m)) continue;
            const hours = hoursOf.get(m.branch_oid)?.find(h => h.days.includes(wd));
            if (!hours) continue;
            const open = toMin(hours.open);
            const close = toMin(hours.close);
            const sub = subsByMember.get(m.oid)?.find(s => s.start_date <= date && date <= s.end_date);
            if (!sub || sub.freezes.some(f => f.from <= date && date <= f.to)) continue;
            if (!rng.chance(m.regularity * WEEKDAY_FACTOR[wd])) continue;
            let start = Math.round(rng.around(m.habit_minutes, 35, open, close - 45));
            if (wd === 5) start = Math.max(start, open + rng.int(0, 120));
            if (d === 0 && start > nowMinutes) continue;
            const stay = rng.int(45, 115);
            const end = Math.min(start + stay, close);
            const inside = d === 0 && end > nowMinutes;
            db.checkIns.push({
                oid: `ci-${++n}`,
                branch_oid: m.branch_oid,
                member_oid: m.oid,
                in_at: at(date, start),
                out_at: inside ? null : at(date, end),
                override: null,
                by: desk[m.branch_oid] ?? 'Front desk'
            });
        }
    }
    db.checkIns.sort((a, b) => (a.in_at < b.in_at ? -1 : 1));
    db.counters['checkin'] = n;
}

function toMin(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
}
