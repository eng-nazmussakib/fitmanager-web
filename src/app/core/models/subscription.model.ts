export type SubscriptionStatus = 'Active' | 'Upcoming' | 'Expired' | 'Frozen' | 'Cancelled';

export interface Freeze {
    from: string;
    to: string;
    reason: string;
}

export interface Subscription {
    oid: string;
    member_oid: string;
    plan_oid: string;
    plan_name: string;
    start_date: string;
    end_date: string;
    status: SubscriptionStatus;
    total: number;
    paid: number;
    due: number;
    invoice_oid: string;
    freezes: Freeze[];
    created_at: string;
}

export type DiscountKind = 'none' | 'amount' | 'percent' | 'promo';

/** `POST /v1/subscriptions/quote` and the body of `POST /v1/subscriptions`. */
export interface SubscriptionRequest {
    member_oid: string;
    plan_oid: string;
    start_date: string;
    discount: { kind: DiscountKind; value: number; code?: string };
    charge_admission: boolean;
    /** Only for `POST /v1/subscriptions`: the first payment (may be partial; the rest becomes dues). */
    payment?: { method: PaymentMethod; amount: number; reference?: string | null };
}

/** The live price summary. Every amount is computed by the API (mock/domain/pricing.ts), never in the UI. */
export interface Quote {
    plan_name: string;
    start_date: string;
    end_date: string;
    lines: { label: string; amount: number }[];
    subtotal: number;
    discount: number;
    discount_label: string | null;
    vat_rate: number;
    vat: number;
    total: number;
    /** Set when a promo code was rejected. */
    promo_error: string | null;
}

export type PaymentMethod = 'cash' | 'card' | 'bkash' | 'nagad' | 'bank';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
    cash: 'Cash',
    card: 'Card (POS)',
    bkash: 'bKash',
    nagad: 'Nagad',
    bank: 'Bank transfer'
};

/** bKash, Nagad, card and bank need the transaction reference (D-009). */
export const METHODS_NEEDING_REFERENCE: PaymentMethod[] = ['card', 'bkash', 'nagad', 'bank'];
