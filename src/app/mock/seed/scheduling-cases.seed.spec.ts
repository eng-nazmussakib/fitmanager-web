import { seed } from './seed';

/** The scheduling cases in the demo data, the same list as the database's showcase seed 103. */
describe('every scheduling case in the demo data', () => {
    const today = '2026-11-19';
    const db = seed(today, 12 * 60);

    it('bookings in each status, a late cancel, a full class with a waitlist, a cancelled and a moved class', () => {
        const statuses = new Set(db.bookings.map(b => b.status));
        expect([...statuses].sort()).toEqual(['Attended', 'Booked', 'Cancelled', 'NoShow', 'Waitlist']);
        expect(db.bookings.some(b => b.late_cancel)).toBe(true);
        expect(db.sessions.find(s => s.oid === 'cs-case-oneoff')).toMatchObject({ capacity: 2, booked: 2, waitlist: 1 });
        expect(db.sessions.some(s => s.cancelled && s.cancel_reason === 'Trainer unwell')).toBe(true);
        expect(db.sessions.some(s => s.detached && s.schedule_oid)).toBe(true);
    });

    it('PT: a package in use, one used up, every session status; the messages', () => {
        expect(new Set(db.ptSessions.map(p => p.status))).toEqual(new Set(['Completed', 'NoShow', 'Cancelled', 'Booked']));
        expect(db.ptSessions.some(p => p.status === 'Cancelled' && !p.charged && p.cancelled_by === 'trainer')).toBe(true);
        expect(db.ptSessions.some(p => p.status === 'Cancelled' && p.charged && p.cancelled_by === 'member')).toBe(true);
        expect(db.subscriptions.filter(s => s.kind === 'pt').map(s => s.sessions)).toEqual(expect.arrayContaining([8, 1]));
        expect(new Set(db.messages.filter(m => m.kind !== 'welcome').map(m => m.kind))).toEqual(
            new Set(['class_cancelled', 'waitlist_promoted', 'pt_booked', 'pt_cancelled'])
        );
    });

    it('trainers, lockers and maintenance', () => {
        expect(db.leave).toHaveLength(1);
        expect(db.trainers.some(t => t.public === false)).toBe(true);
        expect(db.members.filter(m => m.trainer_oid).length).toBeGreaterThan(3);
        expect(db.rentals.some(r => r.ended_on)).toBe(true);
        expect(db.rentals.some(r => r.end_date < today)).toBe(true);
        expect(db.blocks.map(b => (b.room_oid ? 'room' : 'locker')).sort()).toEqual(['locker', 'room']);
        expect(db.lockers.some(l => !l.active)).toBe(true);
        expect(db.invoices.some(i => i.kind === 'locker')).toBe(true);
    });
});
