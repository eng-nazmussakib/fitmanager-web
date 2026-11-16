import { endDate, type PriceInput, type Promo, quote } from './pricing';

const PROMOS: Promo[] = [
    { code: 'NOADMISSION', label: 'No admission fee', waive_admission: true, from: '2026-11-01', to: '2026-11-30' },
    { code: 'STUDENT10', label: '10% student discount', percent: 10, from: '2026-01-01', to: '2026-12-31' },
    { code: 'OLD', label: 'Expired', amount: 500, from: '2025-01-01', to: '2025-12-31' }
];

function input(over: Partial<PriceInput> = {}): PriceInput {
    return {
        plan_name: 'Single · Monthly',
        price: 3000,
        months: 1,
        admission_fee: 2000,
        charge_admission: true,
        discount: { kind: 'none', value: 0 },
        start_date: '2026-11-15',
        today: '2026-11-15',
        vat_rate: 0.05,
        promos: PROMOS,
        ...over
    };
}

describe('pricing', () => {
    it.each([
        ['plan + admission + 5% VAT', input(), 5000, 0, 250, 5250],
        ['renewal: no admission', input({ charge_admission: false }), 3000, 0, 150, 3150],
        ['fixed discount', input({ charge_admission: false, discount: { kind: 'amount', value: 500 } }), 3000, 500, 125, 2625],
        ['percent discount applies to the plan only', input({ discount: { kind: 'percent', value: 10 } }), 5000, 300, 235, 4935],
        ['percent above 100 is capped', input({ charge_admission: false, discount: { kind: 'percent', value: 150 } }), 3000, 3000, 0, 0],
        ['discount never exceeds the subtotal', input({ charge_admission: false, discount: { kind: 'amount', value: 9999 } }), 3000, 3000, 0, 0],
        ['promo waives the admission fee', input({ discount: { kind: 'promo', value: 0, code: 'noadmission' } }), 3000, 0, 150, 3150],
        ['promo percent', input({ charge_admission: false, discount: { kind: 'promo', value: 0, code: 'STUDENT10' } }), 3000, 300, 135, 2835]
    ])('%s', (_name, i, subtotal, discount, vat, total) => {
        const q = quote(i);
        expect([q.subtotal, q.discount, q.vat, q.total]).toEqual([subtotal, discount, vat, total]);
        expect(q.promo_error).toBeNull();
    });

    it('rejects unknown and expired promo codes, and charges full price', () => {
        expect(quote(input({ discount: { kind: 'promo', value: 0, code: 'NOPE' } })).promo_error).toBe('This promo code does not exist.');
        const expired = quote(input({ discount: { kind: 'promo', value: 0, code: 'OLD' } }));
        expect(expired.promo_error).toBe('This promo code has expired.');
        expect(expired.total).toBe(5250);
    });

    it.each([
        ['2026-11-15', 1, '2026-12-14'],
        ['2026-01-31', 1, '2026-02-28'],
        ['2026-11-01', 12, '2027-10-31'],
        ['2026-08-31', 6, '2027-02-28']
    ])('a membership from %s for %i month(s) ends on %s', (start, months, end) => {
        expect(endDate(start, months)).toBe(end);
    });
});
