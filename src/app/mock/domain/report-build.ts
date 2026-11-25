import type { Report, ReportBranch, ReportCell, ReportChart, ReportColumn, ReportKpi, ReportTable, ReportUnit } from '@core/models/report.model';

const addDays = (date: string, n: number): string => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/**
 * A copy of the API's `features/reports/reports.build.ts` (keep the two the same), for the mock's reports.
 * The one shape every report answers, so the web renders and exports any of them with one component.
 * Reports are built from **components**: plain sums per branch (an amount, a count, a capacity). Every figure is a
 * function of components, so a ratio (fill rate, margin %, NPS) is worked out again from the summed components
 * for a total or for HQ, never averaged from the branches' ratios.
 */

export type Unit = ReportUnit;
export type Comp = Record<string, number>;
export type Cell = ReportCell;
export type Row = Record<string, Cell>;
export type Column = ReportColumn;
export type Kpi = ReportKpi;
export type Table = ReportTable;
export type Chart = ReportChart;
export type { Report, ReportBranch };

export interface Range {
    from: string;
    to: string;
}

/** A figure worked out from components. `null` when it cannot be (a rate with nothing to divide by). */
export type Measure = (c: Comp) => number | null;

export interface Figure {
    key: string;
    label: string;
    unit: Unit;
    value: Measure;
    hint?: string;
    /** A figure as it stands now (stock value, open tickets): no previous period to compare with. */
    current?: boolean;
}

/** Two decimals at most: money and rates leave the API without float noise. */
export const round2 = (v: number | null): number | null => (v === null ? null : Math.round(v * 100) / 100);

/** Component `k`, 0 when absent. */
export const c =
    (k: string): Measure =>
    x =>
        x[k] ?? 0;

/** `100 × a ÷ b`, one decimal; null when b is 0. */
export const pct =
    (a: string, b: string): Measure =>
    x =>
        (x[b] ?? 0) > 0 ? Math.round((1000 * (x[a] ?? 0)) / (x[b] ?? 0)) / 10 : null;

/** `a ÷ b`, one decimal; null when b is 0. */
export const ratio =
    (a: string, b: string): Measure =>
    x =>
        (x[b] ?? 0) > 0 ? Math.round((10 * (x[a] ?? 0)) / (x[b] ?? 0)) / 10 : null;

/** The value at `k`, made with `make()` and stored the first time. */
export function upsert<K, V>(m: Map<K, V>, k: K, make: () => V): V {
    let value = m.get(k);
    if (value === undefined) {
        value = make();
        m.set(k, value);
    }
    return value;
}

export function addComp(into: Comp, from: Comp): Comp {
    for (const [k, v] of Object.entries(from)) into[k] = (into[k] ?? 0) + v;
    return into;
}

export function sumComp(parts: Iterable<Comp>): Comp {
    const out: Comp = {};
    for (const p of parts) addComp(out, p);
    return out;
}

/** Adds up rows of several kinds into components per branch. */
export function merge(...sets: { branch_oid: string; comp: Comp }[][]): Map<string, Comp> {
    const out = new Map<string, Comp>();
    for (const set of sets) for (const r of set) out.set(r.branch_oid, addComp(out.get(r.branch_oid) ?? {}, r.comp));
    return out;
}

/** The period of the same length just before `r`. */
export function previousRange(r: Range): Range {
    const days = daysBetween(r.from, r.to) + 1;
    return { from: addDays(r.from, -days), to: addDays(r.from, -1) };
}

/** KPI tiles from components per branch (and the previous period's, if any). */
export function kpis(figures: Figure[], branches: ReportBranch[], byBranch: Map<string, Comp>, previous: Map<string, Comp> | null): Kpi[] {
    const total = sumComp(byBranch.values());
    const prevTotal = previous ? sumComp(previous.values()) : null;
    return figures.map(f => ({
        key: f.key,
        label: f.label,
        unit: f.unit,
        value: round2(f.value(total)),
        previous: prevTotal && !f.current ? round2(f.value(prevTotal)) : null,
        by_branch: Object.fromEntries(branches.map(b => [b.code, round2(f.value(byBranch.get(b.oid) ?? {}))])),
        hint: f.hint ?? null
    }));
}

/** A row from SQL for a breakdown: one branch, one value of the dimension, its components. */
export interface GroupRow {
    branch_oid: string;
    dim: string;
    comp: Comp;
}

export interface PivotDef {
    key: string;
    title: string;
    note?: string;
    dim: Column;
    measures: Figure[];
    /** The measure that gets a column per branch at HQ (the others show the total). */
    primary: string;
    /** Row order: by the primary measure (largest first), or as `order` lists the dimension's values. */
    order?: string[];
    /** At most this many rows (the rest are left out; the totals still count them). */
    limit?: number;
}

/**
 * A breakdown table. At a branch: the dimension and every measure. At HQ (several branches): the dimension, the
 * primary measure per branch, its total, then the other measures in total. A totals row at the end.
 */
export function pivot(def: PivotDef, branches: ReportBranch[], rows: GroupRow[]): Table {
    const byDim = new Map<string, Map<string, Comp>>();
    for (const r of rows) {
        const m = upsert(byDim, r.dim, () => new Map<string, Comp>());
        m.set(r.branch_oid, addComp(m.get(r.branch_oid) ?? {}, r.comp));
    }
    const primary = def.measures.find(m => m.key === def.primary) ?? def.measures[0];
    if (!primary) throw new Error(`pivot ${def.key}: no measures`);
    const many = branches.length > 1;
    const columns: Column[] = [def.dim];
    if (many) {
        for (const b of branches) columns.push({ key: `b_${b.code}`, label: b.name, unit: primary.unit });
        columns.push({ key: primary.key, label: `${primary.label}, total`, unit: primary.unit });
        for (const m of def.measures) if (m.key !== primary.key) columns.push({ key: m.key, label: m.label, unit: m.unit });
    } else {
        for (const m of def.measures) columns.push({ key: m.key, label: m.label, unit: m.unit });
    }
    const line = (dim: string, per: Map<string, Comp>): Row => {
        const total = sumComp(per.values());
        const row: Row = { [def.dim.key]: dim };
        if (many) for (const b of branches) row[`b_${b.code}`] = round2(primary.value(per.get(b.oid) ?? {}));
        for (const m of def.measures) row[m.key] = round2(m.value(total));
        return row;
    };
    let out = [...byDim.entries()].map(([dim, per]) => line(dim, per));
    const order = def.order;
    if (order) {
        const at = (d: Cell): number => {
            const i = order.indexOf(String(d));
            return i < 0 ? order.length : i;
        };
        out.sort((a, b) => at(a[def.dim.key] ?? null) - at(b[def.dim.key] ?? null));
    } else {
        out.sort((a, b) => Number(b[primary.key] ?? 0) - Number(a[primary.key] ?? 0) || String(a[def.dim.key]).localeCompare(String(b[def.dim.key])));
    }
    if (def.limit) out = out.slice(0, def.limit);
    const all = new Map<string, Comp>();
    for (const per of byDim.values()) for (const [b, comp] of per) all.set(b, addComp(all.get(b) ?? {}, comp));
    const total = rows.length ? { ...line('Total', all) } : null;
    return { key: def.key, title: def.title, note: def.note ?? null, columns, rows: out, total };
}

/** A list (members owing, trainers): rows as they are; at HQ a Branch column first. */
export function list(
    key: string,
    title: string,
    columns: Column[],
    rows: (Row & { branch_oid?: string })[],
    branches: ReportBranch[],
    note?: string,
    total?: Row | null
): Table {
    const many = branches.length > 1;
    const name = new Map(branches.map(b => [b.oid, b.name]));
    return {
        key,
        title,
        note: note ?? null,
        columns: many ? [{ key: 'branch', label: 'Branch', unit: 'text' }, ...columns] : columns,
        rows: rows.map(row => {
            const { branch_oid: branchOid, ...r } = row;
            return many ? { branch: name.get(branchOid ?? '') ?? '', ...r } : r;
        }),
        total: total ?? null
    };
}

/* ---------- time series ---------- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (iso: string): string => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1] ?? ''}`;

export interface Buckets {
    /** Up to 62 days: one per day; up to 200: weeks ending on the last day; longer: calendar months. */
    size: 'day' | 'week' | 'month';
    labels: string[];
    /** The bucket a Dhaka day falls in (-1 outside the range). */
    of: (day: string) => number;
}

export function buckets(r: Range): Buckets {
    const days = daysBetween(r.from, r.to) + 1;
    if (days <= 62) {
        return {
            size: 'day',
            labels: Array.from({ length: days }, (_, i) => dayLabel(addDays(r.from, i))),
            of: d => (d < r.from || d > r.to ? -1 : daysBetween(r.from, d))
        };
    }
    if (days <= 200) {
        // Weeks end on the last day, so the newest point is a whole week; the first one may be short.
        const n = Math.ceil(days / 7);
        const shift = n * 7 - days;
        return {
            size: 'week',
            labels: Array.from({ length: n }, (_, i) => dayLabel(i === 0 ? r.from : addDays(r.from, i * 7 - shift))),
            of: d => (d < r.from || d > r.to ? -1 : Math.floor((daysBetween(r.from, d) + shift) / 7))
        };
    }
    const first = r.from.slice(0, 7);
    const months: string[] = [];
    for (let m = first; m <= r.to.slice(0, 7);) {
        months.push(m);
        const [y = 0, mo = 1] = m.split('-').map(Number);
        m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
    }
    return {
        size: 'month',
        labels: months.map(m => `${MONTHS[Number(m.slice(5, 7)) - 1] ?? ''} ${m.slice(0, 4)}`),
        of: d => (d < r.from || d > r.to ? -1 : months.indexOf(d.slice(0, 7)))
    };
}

/** A row from SQL for a time series: one branch, one Dhaka day, its components. */
export interface DayRow {
    branch_oid: string;
    day: string;
    comp: Comp;
}

export interface SeriesDef {
    key: string;
    title: string;
    kind: 'line' | 'bar';
    unit: Unit;
    /** At a branch: one series each. At HQ: the first one, a series per branch. */
    measures: Figure[];
}

export function series(def: SeriesDef, r: Range, branches: ReportBranch[], rows: DayRow[]): Chart {
    const b = buckets(r);
    const many = branches.length > 1;
    const cells = new Map<string, Comp[]>();
    for (const row of rows) {
        const i = b.of(row.day);
        if (i < 0) continue;
        const key = many ? row.branch_oid : '*';
        const cell = upsert(cells, key, () => b.labels.map((): Comp => ({})))[i];
        if (cell) addComp(cell, row.comp);
    }
    const empty = (): Comp[] => b.labels.map(() => ({}));
    const first = def.measures[0];
    if (!first) throw new Error(`series ${def.key}: no measures`);
    const out = many
        ? branches.map(br => ({ name: br.name, data: (cells.get(br.oid) ?? empty()).map(x => round2(first.value(x))) }))
        : def.measures.map(m => ({ name: m.label, data: (cells.get('*') ?? empty()).map(x => round2(m.value(x))) }));
    return {
        key: def.key,
        title: many ? `${def.title} (${first.label}, by branch)` : def.title,
        kind: def.kind,
        unit: def.unit,
        categories: b.labels,
        series: out
    };
}

/** Sums the day rows of each branch into its components. */
export function totalsByBranch(rows: (DayRow | GroupRow)[]): Map<string, Comp> {
    const out = new Map<string, Comp>();
    for (const r of rows) out.set(r.branch_oid, addComp(out.get(r.branch_oid) ?? {}, r.comp));
    return out;
}

/** Turns SQL rows `{ branch_oid, day|dim, …numbers }` into component rows. */
export function toDayRows(rows: ({ branch_oid: string; day: string } & Record<string, unknown>)[]): DayRow[] {
    return rows.map(row => {
        const { branch_oid: branchOid, day, ...rest } = row;
        return { branch_oid: branchOid, day, comp: numbers(rest) };
    });
}

export function toGroupRows(rows: ({ branch_oid: string; dim: string } & Record<string, unknown>)[]): GroupRow[] {
    return rows.map(row => {
        const { branch_oid: branchOid, dim, ...rest } = row;
        return { branch_oid: branchOid, dim, comp: numbers(rest) };
    });
}

function numbers(o: Record<string, unknown>): Comp {
    const out: Comp = {};
    for (const [k, v] of Object.entries(o)) if (typeof v === 'number') out[k] = v;
    return out;
}
