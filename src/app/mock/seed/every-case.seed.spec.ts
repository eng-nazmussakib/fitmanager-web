import { addDaysIso } from './clock';
import { seed } from './seed';

/** D-072: the demo has one record for every phase 2 case, the same list as the database's showcase seed. */
describe('every case in the demo data', () => {
    const today = '2026-11-19';
    const db = seed(today, 12 * 60);
    const gul = db.branches.find(b => b.code === 'GUL')!;

    it('money: a full refund (nothing owed), a partial refund (still paid), every payment method', () => {
        const full = db.invoices.find(i => i.status === 'Refunded');
        expect(full).toMatchObject({ paid: 0, due: 0 });
        expect(db.invoices.find(i => (i.refunded ?? 0) > 0 && i.status === 'Paid')).toMatchObject({ due: 0, refunded: 1000 });
        const methods = new Set(db.invoices.flatMap(i => i.payments.map(p => p.method)));
        expect([...methods].sort()).toEqual(['bank', 'bkash', 'card', 'cash', 'nagad']);
    });

    it('plans: upgraded (with its credit line), ended early, taken back by the refund', () => {
        const old = db.subscriptions.find(s => s.upgraded_to);
        const next = db.subscriptions.find(s => s.oid === old?.upgraded_to);
        expect(next?.plan_name).toContain('Duo');
        expect(db.invoices.find(i => i.oid === next?.invoice_oid)?.lines.at(-1)?.label).toMatch(/^Credit: \d+ unused days of /);
        expect(db.subscriptions.find(s => s.cancel_reason === 'Moving abroad')?.end_date).toBe(addDaysIso(today, -3));
        expect(db.subscriptions.find(s => s.cancel_reason?.startsWith('Refunded:'))).toBeTruthy();
    });

    it('members: transferred in, anonymised, a web join request', () => {
        expect(db.members.find(m => m.branch_oid === gul.oid && m.code.startsWith('MEM-DHA-'))).toBeTruthy();
        const gone = db.members.find(m => m.anonymised);
        expect(gone).toMatchObject({ name: 'Anonymised member', phone: null, email: null });
        expect(db.invoices.filter(i => i.member_oid === gone?.oid).every(i => i.member_name === 'Anonymised member')).toBe(true);
        expect(db.members.find(m => m.pending && m.gender === null)?.notes).toMatch(/^Web join request/);
    });

    it('a document, and yesterday’s cash closings that match the cash taken (one ৳50 short, with a note)', () => {
        expect(db.files?.find(f => f.kind === 'member_document')?.url).toMatch(/^data:application\/pdf;base64,/);
        const closings = db.closings ?? [];
        expect(closings.length).toBeGreaterThan(0);
        expect(closings.every(c => c.day === addDaysIso(today, -1))).toBe(true);
        expect(closings.find(c => c.note)!.expected_cash - closings.find(c => c.note)!.counted_cash).toBe(50);
    });
});
