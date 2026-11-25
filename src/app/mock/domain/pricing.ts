/**
 * Membership pricing: plan price, admission fee, discount or promo code, VAT, with the VAT-inclusive mode
 *. A pure function, the same code as the API's (fitmanager-api src/features/pricing/pricing.ts): keep
 * them in step. Every amount is whole taka; rounding happens once per line, here, never in the UI.
 *
 * - Exclusive (`vat_inclusive: false`): VAT = round(taxable × rate), added on top: total = taxable + VAT.
 * - Inclusive (`vat_inclusive: true`): the prices already contain VAT: total = taxable, and the VAT inside it is
 *   round(taxable × rate ÷ (1 + rate)), shown as "of which VAT".
 */
import type { DiscountKind, Quote } from '@core/models/subscription.model';

export interface Promo {
    code: string;
    label: string;
    percent?: number;
    amount?: number;
    /** Waives the admission fee (the "no admission fee this month" offer). */
    waive_admission?: boolean;
    /** Valid from/to, `yyyy-MM-dd`, inclusive. */
    from: string;
    to: string;
}

export interface PriceInput {
    plan_name: string;
    price: number;
    months: number;
    admission_fee: number;
    charge_admission: boolean;
    discount: { kind: DiscountKind; value: number; code?: string };
    start_date: string;
    /** Today in Dhaka, `yyyy-MM-dd` (promo validity). */
    today: string;
    vat_rate: number;
    vat_inclusive: boolean;
    promos: readonly Promo[];
}

/**
 * Last day of a membership of `months` starting on `start`: the day before the same date `months` later
 * (15 Nov + 1 month → 14 Dec). When that month is shorter (31 Jan + 1 month), it ends on its last day (28 Feb).
 */
export function endDate(start: string, months: number): string {
    const [y, m, d] = start.split('-').map(Number);
    const targetMonth = m - 1 + months;
    const lastDay = new Date(Date.UTC(y, targetMonth + 1, 0)).getUTCDate();
    const end = new Date(Date.UTC(y, targetMonth, Math.min(d, lastDay)));
    if (d <= lastDay) end.setUTCDate(end.getUTCDate() - 1);
    return end.toISOString().slice(0, 10);
}

export function quote(input: PriceInput): Quote {
    const lines: Quote['lines'] = [{ label: input.plan_name, amount: input.price }];
    let promoError: string | null = null;
    let promo: Promo | undefined;
    if (input.discount.kind === 'promo') {
        const code = (input.discount.code ?? '').trim().toUpperCase();
        promo = input.promos.find(p => p.code === code);
        if (!promo) promoError = 'This promo code does not exist.';
        else if (input.today < promo.from || input.today > promo.to) {
            promoError = 'This promo code has expired.';
            promo = undefined;
        }
    }
    const admission = input.charge_admission && !promo?.waive_admission ? input.admission_fee : 0;
    if (admission) lines.push({ label: 'Admission fee', amount: admission });
    const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);

    let discount = 0;
    let label: string | null = null;
    const value = Math.max(0, input.discount.value || 0);
    if (input.discount.kind === 'amount' && value) {
        discount = Math.round(value);
        label = 'Discount';
    } else if (input.discount.kind === 'percent' && value) {
        discount = Math.round((input.price * Math.min(value, 100)) / 100);
        label = `Discount (${Math.min(value, 100)}%)`;
    } else if (promo) {
        discount = Math.round(promo.amount ?? (input.price * (promo.percent ?? 0)) / 100);
        label = `Promo ${promo.code}: ${promo.label}`;
    }
    discount = Math.min(discount, subtotal);

    const taxable = subtotal - discount;
    const vat = input.vat_inclusive ? Math.round((taxable * input.vat_rate) / (1 + input.vat_rate)) : Math.round(taxable * input.vat_rate);
    return {
        plan_name: input.plan_name,
        start_date: input.start_date,
        end_date: endDate(input.start_date, input.months),
        lines,
        subtotal,
        discount,
        discount_label: label,
        discount_percent: input.price > 0 ? Math.round((discount / input.price) * 10000) / 100 : 0,
        vat_rate: input.vat_rate,
        vat_inclusive: input.vat_inclusive,
        vat,
        total: input.vat_inclusive ? taxable : taxable + vat,
        promo_code: promo ? promo.code : null,
        promo_error: promoError
    };
}

/**
 * What an invoice still owes, and its status. A refund never creates dues: after a full refund (nothing
 * kept) the invoice owes nothing, because the plan was taken back; after a partial refund the plan carries on and
 * the member owes only what was never paid (`total − payments received`, the refund not counted).
 * `paidIn` is the sum of the payments, `refunded` the sum of the refunds.
 */
export function invoiceDue(total: number, paidIn: number, refunded: number): number {
    if (refunded > 0 && paidIn - refunded <= 0) return 0;
    return Math.max(0, total - paidIn);
}

export function invoiceStatus(total: number, paidIn: number, refunded: number): 'Paid' | 'Partial' | 'Due' | 'Refunded' {
    if (refunded > 0 && paidIn - refunded <= 0) return 'Refunded';
    if (invoiceDue(total, paidIn, refunded) === 0) return 'Paid';
    return paidIn > 0 ? 'Partial' : 'Due';
}
