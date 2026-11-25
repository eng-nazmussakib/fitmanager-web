import { productLines } from '../business';
import { seed } from './seed';

/** The business cases in the demo data, the same list as the database's showcase seed 106. */
describe('every business case in the demo data', () => {
    const today = '2026-11-19';
    const db = seed(today, 12 * 60);
    const GUL = 'br-gul';
    const on = (branch: string, n: number) => db.stock.find(s => s.oid === `${branch}:prd-${n}`);

    it('the catalogue: 13 products on sale, one switched off, six with a photo; four suppliers, one not used', () => {
        expect(db.products.filter(p => p.active)).toHaveLength(13);
        expect(db.products.filter(p => p.photo_file_oids.length)).toHaveLength(6);
        expect(db.products.find(p => p.code === 'PRD-000007')?.vat_rate).toBe(0.05);
        expect(db.suppliers.filter(s => !s.active).map(s => s.name)).toEqual(['Old Town Fitness Supply']);
    });

    it('equipment: in use, out of order, retired; tickets open, in progress, fixed and cannot be fixed', () => {
        const gul = db.equipment.filter(e => e.branch_oid === GUL);
        expect(new Set(gul.map(e => e.status))).toEqual(new Set(['in_use', 'out_of_order', 'retired']));
        expect(new Set(db.tickets.map(t => t.status))).toEqual(new Set(['open', 'in_progress', 'fixed', 'cannot_fix']));
        expect(db.equipment.find(e => e.name === 'Treadmill 3')?.status).toBe('out_of_order');
        expect(db.equipment.find(e => e.name === 'Spin bike 7')?.status).toBe('in_use');
    });

    it('purchase orders in every status, and the stock they brought in', () => {
        expect(new Set(db.purchaseOrders.filter(o => o.branch_oid === GUL).map(o => o.status))).toEqual(
            new Set(['pending', 'approved', 'rejected', 'sent', 'partial', 'received', 'cancelled'])
        );
        // The same counts as seed 106 leaves.
        expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map(n => on(GUL, n)?.on_hand)).toEqual([6, 3, 3, 7, 89, 30, 131, 8, 11, 15, 3, 0, 20]);
        expect(on(GUL, 5)?.avg_cost).toBe(112.64);
    });

    it('transfers in every status, one received with one short (an adjustment)', () => {
        expect(new Set(db.transfers.map(t => t.status))).toEqual(new Set(['requested', 'in_transit', 'received', 'rejected', 'cancelled']));
        expect(db.movements.filter(m => m.reason === 'shortfall')).toHaveLength(1);
        expect(new Set(db.movements.filter(m => m.kind === 'adjustment').map(m => m.reason))).toEqual(new Set(['damaged', 'expired', 'count', 'shortfall']));
    });

    it('POS: walk-ins, a member who paid, a member on account, a discount, and returns', () => {
        const pos = db.invoices.filter(i => i.kind === 'pos');
        expect(pos.filter(i => i.member_oid === null).length).toBeGreaterThan(5);
        expect(pos.find(i => i.member_code === 'MEM-GUL-000006')).toMatchObject({ status: 'Due', due: 690 });
        expect(pos.filter(i => i.member_code === 'MEM-GUL-000001').map(i => i.total)).toEqual([2646, 4313]);
        expect(pos.find(i => i.discount > 0)?.total).toBe(4485);
        expect(db.posReturns.map(r => r.amount)).toEqual([4830, 1093, 207]);
        expect(db.posReturns.some(r => r.lines.some(l => l.damaged))).toBe(true);
        // Every sale moved the stock (the reconciliation check).
        for (const i of pos) {
            const sold = -db.movements.filter(m => m.ref_oid === i.oid && m.kind === 'sold').reduce((s, m) => s + m.qty, 0);
            expect(sold).toBe(productLines(i).reduce((s, l) => s + l.qty, 0));
        }
    });

    it('the ledger runs in order: each move starts where the one before ended', () => {
        for (const s of db.stock) {
            const moves = db.movements.filter(m => `${m.branch_oid}:${m.product_oid}` === s.oid).sort((a, b) => a.seq - b.seq);
            moves.reduce((before, m) => {
                expect(m.on_hand_after).toBe(before + m.qty);
                return m.on_hand_after;
            }, 0);
            expect(moves.at(-1)?.on_hand_after).toBe(s.on_hand);
        }
    });
});
