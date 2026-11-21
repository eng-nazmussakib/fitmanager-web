import { averageCost, type PosLineInput, posQuote, returnAmount } from './pos-pricing';

// The API's cases (fitmanager-api src/features/pos/pos-pricing.test.ts), D-102.
const line = (over: Partial<PosLineInput> = {}): PosLineInput => ({
    product_oid: 'p1',
    code: 'PRD-000005',
    name: 'Protein bar, 60 g',
    unit_price: 180,
    qty: 1,
    vat_rate: 0.15,
    discount: 0,
    discount_reason: null,
    ...over
});

describe('posQuote', () => {
    it.each([
        ['exclusive: VAT on top', false, [line({ qty: 3 })], { subtotal: 540, discount: 0, vat: 81, total: 621 }],
        ['inclusive: VAT inside', true, [line({ qty: 3 })], { subtotal: 540, discount: 0, vat: 70, total: 540 }],
        [
            'a line discount before VAT',
            false,
            [line({ qty: 2, discount: 60, discount_reason: 'Damaged box' })],
            { subtotal: 360, discount: 60, vat: 45, total: 345 }
        ],
        ['a discount never passes the line', false, [line({ discount: 500, discount_reason: 'x' })], { subtotal: 180, discount: 180, vat: 0, total: 0 }],
        [
            'each line at its own rate',
            false,
            [line({ qty: 2 }), line({ product_oid: 'p2', name: 'Bottled water, 500 ml', unit_price: 30, qty: 4, vat_rate: 0.05 })],
            { subtotal: 480, discount: 0, vat: 60, total: 540 }
        ]
    ])('%s', (_name, inclusive, lines, expected) => {
        expect(posQuote(lines, inclusive)).toMatchObject(expected);
    });

    it('labels a line with its quantity and drops the reason of a line with no discount', () => {
        const q = posQuote([line({ qty: 2 }), line({ product_oid: 'p2', discount_reason: 'stale' })], false);
        expect(q.lines.map(l => l.label)).toEqual(['Protein bar, 60 g × 2', 'Protein bar, 60 g']);
        expect(q.lines[1].discount_reason).toBeNull();
    });
});

describe('returnAmount', () => {
    it('gives back the whole line in any number of goes', () => {
        const l = { qty: 3, total: 100 };
        const parts = [returnAmount(l, 0, 1), returnAmount(l, 1, 1), returnAmount(l, 2, 1)];
        expect(parts).toEqual([33, 34, 33]);
        expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
        expect(returnAmount(l, 0, 3)).toBe(100);
    });
});

describe('averageCost', () => {
    it.each([
        ['from empty', 0, 0, 10, 3000, 3000],
        ['weighted', 4, 3000, 6, 3200, 3120],
        ['to the paisa', 1, 100, 2, 101, 100.67],
        ['going out leaves it', 5, 3120, -2, 0, 3120]
    ])('%s', (_name, onHand, avg, qty, cost, expected) => {
        expect(averageCost(onHand, avg, qty, cost)).toBe(expected);
    });
});
