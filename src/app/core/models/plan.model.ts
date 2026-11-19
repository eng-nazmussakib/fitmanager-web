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
    sort_order: number;
    active: boolean;
    /** Branches with an active plan from this template. */
    branches_using: number;
}
