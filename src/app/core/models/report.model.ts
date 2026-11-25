/**
 * Reports and exports: the wire contract of `GET /v1/reports/:key`,
 * `GET /v1/hq/reports/:key`, `GET /v1/trainers/:oid/numbers` and `POST /v1/exports/*`. Every report has the
 * same shape, so one component renders and exports any of them.
 */

export type ReportKey = 'revenue' | 'dues' | 'members' | 'attendance' | 'classes' | 'trainers' | 'shop' | 'operations';

export const REPORTS: { key: ReportKey; title: string; description: string }[] = [
    { key: 'revenue', title: 'Revenue', description: 'Invoiced and received, by plan, by payment method and from the shop' },
    { key: 'dues', title: 'Dues', description: 'What members still owe, and how old it is' },
    { key: 'members', title: 'Members', description: 'New, renewed, lapsed and expiring' },
    { key: 'attendance', title: 'Attendance', description: 'Visits and busy hours' },
    { key: 'classes', title: 'Classes', description: 'How full they are, and no-shows' },
    { key: 'trainers', title: 'Trainers', description: 'PT sessions and classes per trainer' },
    { key: 'shop', title: 'Shop margin', description: 'Sales, cost and margin at average cost' },
    { key: 'operations', title: 'Stock, equipment and feedback', description: 'Stock value, equipment spend, complaints and NPS' }
];

export type ReportUnit = 'money' | 'count' | 'percent' | 'number' | 'minutes' | 'text' | 'date';
export type ReportCell = string | number | null;

export interface ReportColumn {
    key: string;
    label: string;
    unit: ReportUnit;
}

export interface ReportKpi {
    key: string;
    label: string;
    unit: ReportUnit;
    value: number | null;
    /** The previous period of the same length (`compare=1`); null when not asked or "as of now". */
    previous: number | null;
    /** By branch code. */
    by_branch: Record<string, number | null>;
    hint: string | null;
}

export interface ReportTable {
    key: string;
    title: string;
    note: string | null;
    columns: ReportColumn[];
    rows: Record<string, ReportCell>[];
    total: Record<string, ReportCell> | null;
}

export interface ReportChart {
    key: string;
    title: string;
    kind: 'line' | 'bar' | 'heatmap';
    unit: ReportUnit;
    categories: string[];
    series: { name: string; data: (number | null)[] }[];
}

export interface ReportBranch {
    oid: string;
    code: string;
    name: string;
}

export interface Report {
    key: ReportKey | 'trainer';
    title: string;
    from: string;
    to: string;
    previous: { from: string; to: string } | null;
    branches: ReportBranch[];
    kpis: ReportKpi[];
    charts: ReportChart[];
    tables: ReportTable[];
    notes: string[];
}

export type ExportFormat = 'xlsx' | 'pdf';
export type ExportKind = 'members' | 'payments' | 'stock' | 'audit';

/** One page of `POST /v1/exports/:kind`. `total` is on the first page only. */
export interface ExportPage {
    columns: ReportColumn[];
    rows: Record<string, ReportCell>[];
    next: string | null;
    total: number | null;
}

/** The most rows one export may hold. */
export const EXPORT_LIMIT = 50_000;
