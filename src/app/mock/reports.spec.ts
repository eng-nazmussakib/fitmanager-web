import { REPORTS } from '@core/models/report.model';

import { pivot, previousRange, series } from './domain/report-build';
import { mockReport, mockTrainerReport } from './reports';
import { addDaysIso } from './seed/clock';
import { seed } from './seed/seed';

const today = '2026-11-19';
const db = seed(today, 12 * 60);
const GUL = 'br-gul';
const ALL = ['br-gul', 'br-dha', 'br-utt'];
const last = (days: number) => ({ from: addDaysIso(today, -(days - 1)), to: today });
const kpi = (r: ReturnType<typeof mockReport>, key: string) => r.kpis.find(k => k.key === key);

/** Reports in demo mode: the API's report definitions over the mock's data, with three months of history. */
describe('the reports in demo mode', () => {
    it('answers every report at a branch and across the branches', () => {
        for (const { key } of REPORTS) {
            const one = mockReport(key, [GUL], last(30), true, db);
            expect(one.branches.map(b => b.code)).toEqual(['GUL']);
            expect(one.previous).toEqual(previousRange(last(30)));
            const all = mockReport(key, ALL, last(30), false, db);
            expect(all.branches.map(b => b.code)).toEqual(['DHA', 'GUL', 'UTT']);
        }
    });

    it('has three months of history: money, visits, classes and the shop in every month', () => {
        for (const back of [80, 50, 20]) {
            const r = { from: addDaysIso(today, -back), to: addDaysIso(today, -back + 9) };
            expect(kpi(mockReport('revenue', [GUL], r, false, db), 'received')?.value).toBeGreaterThan(0);
            expect(kpi(mockReport('attendance', [GUL], r, false, db), 'visits')?.value).toBeGreaterThan(50);
            expect(kpi(mockReport('classes', [GUL], r, false, db), 'attended')?.value).toBeGreaterThan(20);
        }
        // Shop history runs from 92 to 31 days back (then the cases), at every branch.
        for (const b of ALL)
            expect(kpi(mockReport('shop', [b], { from: addDaysIso(today, -90), to: addDaysIso(today, -40) }, false, db), 'sales')?.value).toBeGreaterThan(20);
    });

    it('totals at HQ are the sums of the branches, and rates are worked out again, not averaged', () => {
        const all = mockReport('classes', ALL, last(90), false, db);
        const fill = kpi(all, 'fill');
        const parts = ALL.map(b => mockReport('classes', [b], last(90), false, db));
        expect(kpi(all, 'attended')?.value).toBe(parts.reduce((s, r) => s + (kpi(r, 'attended')?.value ?? 0), 0));
        const booked = parts.reduce((s, r) => s + Number(r.tables[0]?.total?.['booked'] ?? 0), 0);
        const places = parts.reduce((s, r) => s + Number(r.tables[0]?.total?.['capacity'] ?? 0), 0);
        expect(fill?.value).toBe(Math.round((1000 * booked) / places) / 10);
        expect(Object.keys(fill?.by_branch ?? {}).sort()).toEqual(['DHA', 'GUL', 'UTT']);
    });

    it('the shop margin is sales without VAT less the cost at average cost', () => {
        const r = mockReport('shop', [GUL], last(90), false, db);
        const net = kpi(r, 'net_sales')?.value ?? 0;
        const cost = kpi(r, 'cost')?.value ?? 0;
        expect(net).toBeGreaterThan(cost);
        expect(kpi(r, 'margin')?.value).toBeCloseTo(net - cost, 2);
    });

    it('a trainer’s own numbers: PT and classes, no commission', () => {
        const r = mockTrainerReport(GUL, 'tr-gul-1', last(90), db);
        expect(r.title).toBe('Sam Cole');
        expect(kpi(r, 'classes')?.value).toBeGreaterThan(0);
        expect(r.notes[0]).toMatch(/Counts only/);
    });
});

describe('the report builder (the API’s, copied)', () => {
    const branches = [
        { oid: 'a', code: 'A', name: 'Alpha' },
        { oid: 'b', code: 'B', name: 'Beta' }
    ];
    it('a breakdown at HQ: a column per branch for the main measure, its total, and a totals row', () => {
        const t = pivot(
            {
                key: 't',
                title: 'T',
                dim: { key: 'plan', label: 'Plan', unit: 'text' },
                measures: [
                    { key: 'sold', label: 'Sold', unit: 'count', value: x => x['sold'] ?? 0 },
                    { key: 'money', label: 'Money', unit: 'money', value: x => x['money'] ?? 0 }
                ],
                primary: 'sold'
            },
            branches,
            [
                { branch_oid: 'a', dim: 'Monthly', comp: { sold: 2, money: 100 } },
                { branch_oid: 'b', dim: 'Monthly', comp: { sold: 1, money: 50 } },
                { branch_oid: 'b', dim: 'Yearly', comp: { sold: 3, money: 900 } }
            ]
        );
        expect(t.columns.map(c => c.key)).toEqual(['plan', 'b_A', 'b_B', 'sold', 'money']);
        expect(t.rows).toEqual([
            { plan: 'Monthly', b_A: 2, b_B: 1, sold: 3, money: 150 },
            { plan: 'Yearly', b_A: 0, b_B: 3, sold: 3, money: 900 }
        ]);
        expect(t.total).toEqual({ plan: 'Total', b_A: 2, b_B: 4, sold: 6, money: 1050 });
    });

    it('a series by day up to 62 days, by week up to 200, then by month', () => {
        const def = {
            key: 's',
            title: 'S',
            kind: 'bar' as const,
            unit: 'count' as const,
            measures: [{ key: 'n', label: 'N', unit: 'count' as const, value: (x: Record<string, number>) => x['n'] ?? 0 }]
        };
        const rows = [{ branch_oid: 'a', day: '2026-11-01', comp: { n: 2 } }];
        expect(series(def, { from: '2026-11-01', to: '2026-11-30' }, branches.slice(0, 1), rows).categories).toHaveLength(30);
        expect(series(def, { from: '2026-08-01', to: '2026-11-30' }, branches.slice(0, 1), rows).categories).toHaveLength(18);
        const year = series(def, { from: '2025-12-01', to: '2026-11-30' }, branches, rows);
        expect(year.categories).toHaveLength(12);
        expect(year.series.map(x => x.name)).toEqual(['Alpha', 'Beta']);
        expect(year.series[0]?.data[11]).toBe(2);
    });
});
