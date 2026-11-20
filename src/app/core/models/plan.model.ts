/** A membership (time-based) or a PT package (D-079). */
export type PlanKind = 'membership' | 'pt';

/** A plan the branch sells (`GET /v1/plans`), made from an HQ template (`GET /v1/hq/plan-templates`). */
export interface Plan {
    oid: string;
    branch_oid: string;
    template_oid: string;
    code: string;
    /** "Single · 3 Months" */
    name: string;
    tier: string;
    tier_name: string;
    period: string;
    period_label: string;
    months: number;
    price: number;
    admission_fee: number;
    /** People covered: 1, 2 or 4. */
    persons: number;
    features: string[];
    featured: boolean;
    /** From the template: whether this plan may be frozen (D-063). */
    freezable: boolean;
    /** A membership, or a package of PT sessions sold with one (D-079). */
    kind: PlanKind;
    /** PT sessions in the package; null for a membership. */
    sessions: number | null;
    /** The plan's own switch. */
    active: boolean;
    /** The template's switch; the desk sells a plan only when both are on (`sellable`). */
    template_active: boolean;
    sellable: boolean;
}

export interface PlanTemplate {
    oid: string;
    tier: string;
    tier_name: string;
    period: string;
    period_label: string;
    months: number;
    base_price: number;
    persons: number;
    features: string[];
    featured: boolean;
    freezable: boolean;
    kind: PlanKind;
    sessions: number | null;
    sort_order: number;
    active: boolean;
    /** Branches with an active plan from this template. */
    branches_using: number;
}
