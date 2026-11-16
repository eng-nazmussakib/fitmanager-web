import type { BranchRef } from './branch.model';
import type { PaymentMethod } from './subscription.model';

export interface PaymentRecord {
    oid: string;
    invoice_oid: string;
    amount: number;
    method: PaymentMethod;
    reference: string | null;
    received_at: string;
    received_by: string;
}

export type InvoiceStatus = 'Paid' | 'Partial' | 'Due';

export interface Invoice {
    oid: string;
    /** "INV-GUL-2026-00123" */
    number: string;
    branch: BranchRef;
    member_oid: string;
    member_name: string;
    member_code: string;
    member_phone: string;
    issued_at: string;
    lines: { label: string; amount: number }[];
    subtotal: number;
    discount: number;
    /** The VAT rate in force when the invoice was issued (OrgSettings.vat_rate then). */
    vat_rate: number;
    /** The seller's VAT BIN at the time, if registered. */
    vat_bin: string | null;
    vat: number;
    total: number;
    paid: number;
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
}
