import type { Invoice } from './payment.model';
import type { PaymentMethod } from './subscription.model';

/** The UI kit's badge tones (shared/ui/display). */
type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

/**
 * The equipment register and its tickets, HQ's catalogue and suppliers, each
 * branch's stock and ledger, purchase orders, transfers between branches, and POS sales with their returns. The
 * shapes are the API's (fitmanager-api src/features/equipment, catalogue, stock, pos).
 */

/* ---------- equipment and tickets ---------- */

export const EQUIPMENT_CATEGORIES = ['cardio', 'strength', 'free_weights', 'benches_racks', 'functional', 'other'] as const;
export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number];
export const EQUIPMENT_CATEGORY_LABEL: Record<EquipmentCategory, string> = {
    cardio: 'Cardio',
    strength: 'Strength machines',
    free_weights: 'Free weights',
    benches_racks: 'Benches and racks',
    functional: 'Functional',
    other: 'Other'
};
export type EquipmentStatus = 'in_use' | 'out_of_order' | 'retired';
export const EQUIPMENT_STATUS: Record<EquipmentStatus, { label: string; tone: BadgeTone }> = {
    in_use: { label: 'In use', tone: 'success' },
    out_of_order: { label: 'Out of order', tone: 'danger' },
    retired: { label: 'Retired', tone: 'neutral' }
};
/** Worked out when read: no schedule, fine, due within 7 days, or due. */
export type ServiceState = 'none' | 'ok' | 'soon' | 'due';
export const SERVICE_STATE: Record<ServiceState, { label: string; tone: BadgeTone }> = {
    none: { label: 'No schedule', tone: 'neutral' },
    ok: { label: 'Serviced', tone: 'success' },
    soon: { label: 'Service soon', tone: 'warning' },
    due: { label: 'Service due', tone: 'danger' }
};

export interface Equipment {
    oid: string;
    name: string;
    category: EquipmentCategory;
    brand: string | null;
    model: string | null;
    serial: string | null;
    purchased_on: string | null;
    cost: number | null;
    warranty_until: string | null;
    in_warranty: boolean;
    room: { oid: string; name: string } | null;
    photo_file_oid: string | null;
    photo_url: string | null;
    status: EquipmentStatus;
    service_every_days: number | null;
    last_serviced_on: string | null;
    next_service_on: string | null;
    service: ServiceState;
    notes: string | null;
    retired_on: string | null;
    retired_reason: string | null;
    open_tickets: number;
    /** Repairs and services paid for so far. */
    spent: number;
}

export interface EquipmentDetail extends Equipment {
    tickets: Ticket[];
}

export interface EquipmentList {
    rows: Equipment[];
    counts: { in_use: number; out_of_order: number; retired: number; service_due: number };
}

export interface EquipmentInput {
    name: string;
    category: EquipmentCategory;
    brand?: string | null;
    model?: string | null;
    serial?: string | null;
    purchased_on?: string | null;
    cost?: number | null;
    warranty_until?: string | null;
    room_oid?: string | null;
    photo_file_oid?: string | null;
    service_every_days?: number | null;
    last_serviced_on?: string | null;
    notes?: string | null;
}

export type TicketPriority = 'low' | 'normal' | 'urgent';
export type TicketStatus = 'open' | 'in_progress' | 'fixed' | 'cannot_fix';
export const TICKET_STATUS: Record<TicketStatus, { label: string; tone: BadgeTone }> = {
    open: { label: 'Open', tone: 'warning' },
    in_progress: { label: 'In progress', tone: 'info' },
    fixed: { label: 'Fixed', tone: 'success' },
    cannot_fix: { label: 'Cannot be fixed', tone: 'danger' }
};
export const PRIORITY: Record<TicketPriority, { label: string; tone: BadgeTone }> = {
    low: { label: 'Low', tone: 'neutral' },
    normal: { label: 'Normal', tone: 'info' },
    urgent: { label: 'Urgent', tone: 'danger' }
};

export interface Ticket {
    oid: string;
    /** TKT-GUL-00001 */
    code: string;
    equipment: { oid: string; name: string };
    kind: 'repair' | 'service';
    description: string;
    photo_url: string | null;
    priority: TicketPriority;
    out_of_order: boolean;
    status: TicketStatus;
    technician: string | null;
    cost: number | null;
    resolution: string | null;
    raised_by_name: string;
    raised_at: string;
    updated_at: string;
    closed_at: string | null;
    closed_by_name: string | null;
}

export interface TicketInput {
    description: string;
    priority?: TicketPriority;
    out_of_order?: boolean;
    photo_file_oid?: string | null;
}

export interface TicketUpdate {
    status?: TicketStatus;
    priority?: TicketPriority;
    technician?: string | null;
    cost?: number | null;
    resolution?: string | null;
}

export interface ServiceInput {
    on?: string;
    technician: string;
    cost?: number | null;
    note?: string | null;
}

/* ---------- catalogue and suppliers ---------- */

export const PRODUCT_CATEGORIES = ['supplements', 'drinks', 'snacks', 'apparel', 'accessories', 'other'] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];
export const PRODUCT_CATEGORY_LABEL: Record<ProductCategory, string> = {
    supplements: 'Supplements',
    drinks: 'Drinks',
    snacks: 'Snacks',
    apparel: 'Apparel',
    accessories: 'Accessories',
    other: 'Other'
};
export const PRODUCT_UNITS = ['piece', 'bottle', 'pack', 'box', 'tub', 'pair'] as const;
export type ProductUnit = (typeof PRODUCT_UNITS)[number];

export interface Product {
    oid: string;
    /** PRD-000001 */
    code: string;
    name: string;
    category: ProductCategory;
    unit: ProductUnit;
    description: string | null;
    price: number;
    /** Null: the HQ rate in force. */
    vat_rate: number | null;
    vat_rate_applied: number;
    photos: { file_oid: string; url: string }[];
    supplier_oid: string | null;
    supplier_name: string | null;
    reorder_level: number;
    active: boolean;
    updated_at: string;
}

export interface ProductInput {
    name: string;
    category: ProductCategory;
    unit: ProductUnit;
    description?: string | null;
    price: number;
    vat_rate?: number | null;
    photo_file_oids?: string[];
    supplier_oid?: string | null;
    reorder_level?: number;
    active?: boolean;
}

export interface Supplier {
    oid: string;
    name: string;
    contact_name: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
    active: boolean;
    /** Products that name it as their usual supplier. */
    products: number;
    updated_at: string;
}

export type SupplierInput = Partial<Omit<Supplier, 'oid' | 'products' | 'updated_at'>> & { name: string };

/* ---------- stock ---------- */

export interface StockLevel {
    product_oid: string;
    code: string;
    name: string;
    category: ProductCategory;
    unit: ProductUnit;
    price: number;
    photo_url: string | null;
    on_hand: number;
    reorder_level: number;
    low: boolean;
    on_order: number;
    in_transit: number;
    /** Costs are the branch manager's and HQ's; null for the desk. */
    avg_cost: number | null;
    value: number | null;
    last_cost: number | null;
    last_moved_at: string | null;
}

export interface StockList {
    rows: StockLevel[];
    low: number;
    value: number | null;
}

export type MovementKind = 'received' | 'sold' | 'returned' | 'transfer_out' | 'transfer_in' | 'adjustment';
export const MOVEMENT_LABEL: Record<MovementKind, string> = {
    received: 'Received',
    sold: 'Sold',
    returned: 'Returned',
    transfer_out: 'Sent to a branch',
    transfer_in: 'From a branch',
    adjustment: 'Adjustment'
};
export type AdjustReason = 'damaged' | 'expired' | 'count' | 'shortfall' | 'other';
export const ADJUST_REASON_LABEL: Record<AdjustReason, string> = {
    damaged: 'Damaged',
    expired: 'Expired',
    count: 'Stock count',
    shortfall: 'Short on arrival',
    other: 'Other'
};

export interface Movement {
    oid: string;
    kind: MovementKind;
    qty: number;
    unit_cost: number | null;
    on_hand_after: number;
    avg_cost_after: number | null;
    reason: AdjustReason | null;
    note: string | null;
    ref_oid: string | null;
    ref_label: string | null;
    by_name: string;
    at: string;
}

export interface Ledger {
    product: StockLevel;
    movements: Movement[];
}

export interface StockElsewhere {
    product_oid: string;
    branch_oid: string;
    branch_name: string;
    on_hand: number;
}

export interface HqStock {
    branches: { oid: string; code: string; name: string }[];
    rows: {
        product_oid: string;
        code: string;
        name: string;
        category: ProductCategory;
        cells: { branch_oid: string; on_hand: number; reorder_level: number; low: boolean }[];
    }[];
    value: number;
}

/* ---------- purchase orders ---------- */

export type PoStatus = 'pending' | 'approved' | 'rejected' | 'sent' | 'partial' | 'received' | 'cancelled';
export const PO_STATUS: Record<PoStatus, { label: string; tone: BadgeTone }> = {
    pending: { label: 'Waiting for HQ', tone: 'warning' },
    approved: { label: 'Approved', tone: 'info' },
    rejected: { label: 'Rejected', tone: 'danger' },
    sent: { label: 'Sent to supplier', tone: 'info' },
    partial: { label: 'Partly received', tone: 'warning' },
    received: { label: 'Received', tone: 'success' },
    cancelled: { label: 'Cancelled', tone: 'neutral' }
};

export interface PurchaseOrder {
    oid: string;
    /** PO-GUL-2026-0001 */
    code: string;
    branch: { oid: string; name: string; code: string };
    supplier: { oid: string; name: string; phone: string | null; email: string | null; contact_name: string | null };
    status: PoStatus;
    note: string | null;
    total: number;
    raised_by_name: string;
    raised_at: string;
    decided_by_name: string | null;
    decided_at: string | null;
    decision_note: string | null;
    sent_at: string | null;
    closed_at: string | null;
    cancel_reason: string | null;
    lines: { oid: string; product_oid: string; code: string; name: string; qty: number; unit_cost: number; received: number; outstanding: number }[];
    ordered: number;
    received: number;
    deliveries?: {
        oid: string;
        received_on: string;
        note: string | null;
        by_name: string;
        at: string;
        lines: { line_oid: string; product_oid: string; qty: number; unit_cost: number; name: string }[];
    }[];
}

export interface PoInput {
    supplier_oid: string;
    note?: string | null;
    lines: { product_oid: string; qty: number; unit_cost: number }[];
}

export interface DeliveryInput {
    received_on?: string;
    note?: string | null;
    lines: { line_oid: string; qty: number; unit_cost?: number }[];
}

/* ---------- transfers ---------- */

export type TransferStatus = 'requested' | 'in_transit' | 'received' | 'rejected' | 'cancelled';
export const TRANSFER_STATUS: Record<TransferStatus, { label: string; tone: BadgeTone }> = {
    requested: { label: 'Requested', tone: 'warning' },
    in_transit: { label: 'In transit', tone: 'info' },
    received: { label: 'Received', tone: 'success' },
    rejected: { label: 'Rejected', tone: 'danger' },
    cancelled: { label: 'Cancelled', tone: 'neutral' }
};

export interface StockTransfer {
    oid: string;
    /** TRF-GUL-2026-0001, numbered at the branch that asked. */
    code: string;
    from: { oid: string; name: string };
    to: { oid: string; name: string };
    /** Which side the reader's branch is on. */
    direction: 'in' | 'out';
    status: TransferStatus;
    note: string | null;
    requested_by_name: string;
    requested_at: string;
    sent_by_name: string | null;
    sent_at: string | null;
    received_by_name: string | null;
    received_at: string | null;
    closing_note: string | null;
    closed_at: string | null;
    lines: {
        oid: string;
        product_oid: string;
        code: string;
        name: string;
        qty_requested: number;
        qty_sent: number | null;
        qty_received: number | null;
        unit_cost: number | null;
    }[];
}

export interface TransferInput {
    from_branch_oid: string;
    note?: string | null;
    lines: { product_oid: string; qty: number }[];
}

/* ---------- POS ---------- */

export interface PosProduct {
    oid: string;
    code: string;
    name: string;
    category: ProductCategory;
    unit: ProductUnit;
    price: number;
    vat_rate: number;
    photo_url: string | null;
    on_hand: number;
}

export interface CartLine {
    product_oid: string;
    qty: number;
    discount?: number;
    discount_reason?: string | null;
}

export interface PosLine {
    product_oid: string;
    code: string;
    name: string;
    unit_price: number;
    qty: number;
    vat_rate: number;
    discount: number;
    discount_reason: string | null;
    label: string;
    amount: number;
    net: number;
    vat: number;
    total: number;
}

export interface PosCustomer {
    member_oid: string | null;
    code: string;
    name: string;
    dues: number;
    dues_limit: number;
    dues_after: number;
    /** Charging this would take the member's dues over the branch's limit: allowed, with a warning. */
    over_limit: boolean;
}

export interface PosQuote {
    lines: PosLine[];
    subtotal: number;
    discount: number;
    vat: number;
    total: number;
    vat_inclusive: boolean;
    short: { product_oid: string; name: string; on_hand: number }[];
    customer: PosCustomer;
}

export interface PosSaleInput {
    member_oid: string | null;
    walk_in_name?: string | null;
    lines: CartLine[];
    payment: { method: PaymentMethod; amount: number; reference?: string | null };
}

export interface PosSaleResult {
    invoice: Invoice;
    charged: number;
    customer: PosCustomer;
}

/** A product line of a POS invoice, as stored on it. */
export interface PosInvoiceLine {
    label: string;
    amount: number;
    product_oid: string;
    code: string;
    qty: number;
    unit_price: number;
    vat_rate: number;
    discount: number;
    discount_reason: string | null;
    vat: number;
    total: number;
}

export interface PosReturnLine {
    index: number;
    product_oid: string;
    qty: number;
    damaged: boolean;
    amount: number;
}

export interface PosSale {
    invoice: Invoice;
    walk_in: boolean;
    items: (PosInvoiceLine & { index: number; returned: number; returnable: number })[];
    returns: { oid: string; invoice_oid: string; lines: PosReturnLine[]; amount: number; reason: string; by_name: string; at: string }[];
    returned_amount: number;
    /** The desk may take returns until this day; a manager after it. */
    desk_return_until: string;
    desk_may_return: boolean;
}

export interface PosReturnInput {
    lines: { index: number; qty: number; damaged?: boolean }[];
    method: PaymentMethod;
    reference?: string | null;
    reason: string;
}
