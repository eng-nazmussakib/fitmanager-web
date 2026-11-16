/**
 * Membership pricing: plan price, admission fee, discount or promo code, VAT. PURE TypeScript, ported to the
 * API in phase 2. All amounts are whole taka; rounding happens once per line, here, never in the UI.
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
    today: string;
    vat_rate: number;
    promos: Promo[];
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
    const v = Math.max(0, input.discount.value || 0);
    if (input.discount.kind === 'amount' && v) {
        discount = Math.round(v);
        label = 'Discount';
    } else if (input.discount.kind === 'percent' && v) {
        discount = Math.round((input.price * Math.min(v, 100)) / 100);
        label = `Discount (${Math.min(v, 100)}%)`;
    } else if (promo) {
        discount = Math.round(promo.amount ?? (input.price * (promo.percent ?? 0)) / 100);
        label = `Promo ${promo.code}: ${promo.label}`;
    }
    discount = Math.min(discount, subtotal);

    const taxable = subtotal - discount;
    const vat = Math.round(taxable * input.vat_rate);
    return {
        plan_name: input.plan_name,
        start_date: input.start_date,
        end_date: endDate(input.start_date, input.months),
        lines,
        subtotal,
        discount,
        discount_label: label,
        vat_rate: input.vat_rate,
        vat,
        total: taxable + vat,
        promo_error: promoError
    };
}
