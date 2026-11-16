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
    active: boolean;
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
    branches_using: number;
}
