import type { Action, Subject } from '@core/auth/ability';

/**
 * The staff inbox behind the console's bell (phase 7b, D-108 b): what a branch manager or HQ must act on. A message
 * is addressed to a branch (or HQ) and shown there to whoever holds its kind's permission.
 */
export type StaffMessageKind =
    | 'po_submitted'
    | 'po_approved'
    | 'po_rejected'
    | 'transfer_requested'
    | 'transfer_sent'
    | 'transfer_rejected'
    | 'ticket_urgent'
    | 'complaint_escalated'
    | 'appeal_filed';

/** Who sees each kind (the API's `INBOX_RULES`): the permission at the branch the message is addressed to. */
export const INBOX_RULES: Record<StaffMessageKind, [Action, Subject]> = {
    po_submitted: ['update', 'PurchaseOrder'],
    po_approved: ['update', 'PurchaseOrder'],
    po_rejected: ['update', 'PurchaseOrder'],
    transfer_requested: ['update', 'Transfer'],
    transfer_sent: ['update', 'Transfer'],
    transfer_rejected: ['update', 'Transfer'],
    ticket_urgent: ['update', 'Equipment'],
    complaint_escalated: ['manage', 'Complaint'],
    appeal_filed: ['manage', 'Incident']
};

/** `GET /v1/inbox` items. */
export interface StaffMessage {
    oid: string;
    kind: StaffMessageKind;
    subject: string;
    body: string;
    /** The console page, relative to `/console/:branch` or `/hq` (`stock?tab=orders`, `incidents/<oid>`). */
    link: string;
    from_branch_oid: string;
    from_branch_name: string;
    created_at: string;
    read_at: string | null;
}

export interface Inbox {
    items: StaffMessage[];
    unread: number;
}

/** `GET /v1/inbox/count`, `/v1/me/notifications/count`, and the answer of the `…/read` calls. */
export interface UnreadCount {
    unread: number;
}
