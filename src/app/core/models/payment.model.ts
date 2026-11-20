import type { BranchRef } from './branch.model';
import type { PaymentMethod } from './subscription.model';

export interface PaymentRecord {
    oid: string;
    invoice_oid: string;
    /** A refund is its own row, never an edit (D-067 a). */
    kind?: 'payment' | 'refund';
    amount: number;
    method: PaymentMethod;
    reference: string | null;
    received_at: string;
    received_by: string;
    reason?: string | null;
    approved_by?: string | null;
}

export type InvoiceStatus = 'Paid' | 'Partial' | 'Due' | 'Refunded';

export interface Invoice {
    oid: string;
    /** "INV-GUL-2026-00123" */
    number: string;
    /** A sale, an upgrade, or a locker rental (D-082). */
    kind?: 'sale' | 'upgrade' | 'locker';
    branch: BranchRef;
    member_oid: string;
    member_name: string;
    member_code: string;
    /** Null once the member was anonymised (D-068 c). */
    member_phone: string | null;
    issued_at: string;
    lines: { label: string; amount: number }[];
    subtotal: number;
    discount: number;
    /** The VAT rate in force when the invoice was issued (OrgSettings.vat_rate then). */
    vat_rate: number;
    /** Whether the prices included VAT then (D-057). */
    vat_inclusive?: boolean;
    /** The seller's VAT BIN at the time, if registered. */
    vat_bin: string | null;
    vat: number;
    total: number;
    /** Payments less refunds. */
    paid: number;
    refunded?: number;
    due: number;
    status: InvoiceStatus;
    payments: PaymentRecord[];
}

/** `POST /v1/payments`: pay towards an invoice's dues. */
export interface PaymentRequest {
    invoice_oid: string;
    method: PaymentMethod;
    amount: number;
    reference?: string | null;
}

/** `GET /v1/cash-closing/today`: what the front desk counts at the end of the day. */
export interface CashClosing {
    date: string;
    by_method: { method: PaymentMethod; count: number; amount: number }[];
    total: number;
    invoices: number;
    new_members: number;
    renewals: number;
    /** What each staff member took today, and their closing if done (D-061: the daily count per person). */
    by_staff?: {
        staff_oid: string;
        name: string;
        cash: number;
        total: number;
        closed: { counted_cash: number; expected_cash: number; difference: number; note: string | null; at: string } | null;
    }[];
}

/** `POST /v1/invoices/:oid/refund`. */
export interface RefundRequest {
    amount?: number;
    method: PaymentMethod;
    reference?: string | null;
    reason: string;
}
