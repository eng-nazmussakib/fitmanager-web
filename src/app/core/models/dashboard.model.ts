import type { BranchRef } from './branch.model';

export interface KpiSplit {
    branch: BranchRef;
    value: number;
}

export interface Kpi {
    id: 'active_members' | 'revenue' | 'dues' | 'check_ins_today' | 'new_members' | 'expiring_7d';
    label: string;
    value: number;
    /** ৳ amounts are formatted as money. */
    money: boolean;
    /** Change against the previous period of the same length, %; null when not comparable. */
    delta_pct: number | null;
    by_branch: KpiSplit[];
}

export interface AttentionItem {
    kind: 'dues' | 'suspended' | 'expiring';
    member_oid: string;
    member_name: string;
    member_code: string;
    branch: BranchRef;
    detail: string;
}

export interface BranchComparison {
    branch: BranchRef;
    members: number;
    revenue: number;
    dues: number;
    avg_daily_visits: number;
    retention_pct: number;
}

/** `GET /v1/hq/dashboard?from&to` and, for one branch, `GET /v1/dashboard?from&to`. */
export interface Dashboard {
    from: string;
    to: string;
    kpis: Kpi[];
    /** One series per branch: revenue per day (or per month for long ranges). */
    revenue_trend: { label: string; points: { x: string; y: number }[] }[];
    /** 7 × 17: average check-ins per weekday (Sat…Fri) and hour (06:00…22:00). */
    attendance_heatmap: { day: string; hours: number[] }[];
    comparison: BranchComparison[];
    attention: AttentionItem[];
}
