import {
    c,
    type Comp,
    type DayRow,
    type Figure,
    type GroupRow,
    kpis,
    list,
    merge,
    pct,
    pivot,
    type Range,
    ratio,
    type Report,
    type ReportBranch,
    type Row,
    series,
    sumComp,
    totalsByBranch
} from './report-build';

/**
 * A copy of the API's `features/reports/reports.defs.ts` (keep the two the same): what each of the eight reports
 * shows, from rows already loaded. The mock loads them from its tables in `mock/reports.ts`.
 */

export const REPORT_KEYS = ['revenue', 'dues', 'members', 'attendance', 'classes', 'trainers', 'shop', 'operations'] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

export const REPORT_TITLES: Record<ReportKey, string> = {
    revenue: 'Revenue',
    dues: 'Dues',
    members: 'Members',
    attendance: 'Attendance',
    classes: 'Classes',
    trainers: 'Trainers',
    shop: 'Shop margin',
    operations: 'Stock, equipment and feedback'
};

export type Built = Pick<Report, 'kpis' | 'charts' | 'tables'> & { notes?: string[] };

export interface Scope {
    branches: ReportBranch[];
    range: Range;
    previous: Range | null;
}

/** Words for the stored values a breakdown groups by (payment methods, categories). */
export const LABELS: Record<string, string> = {
    cash: 'Cash',
    card: 'Card',
    bkash: 'bKash',
    nagad: 'Nagad',
    bank: 'Bank transfer',
    cardio: 'Cardio',
    strength: 'Strength',
    free_weights: 'Free weights',
    benches_racks: 'Benches and racks',
    functional: 'Functional',
    supplements: 'Supplements',
    snacks: 'Snacks',
    drinks: 'Drinks',
    accessories: 'Accessories',
    apparel: 'Apparel',
    facilities: 'Facilities',
    equipment: 'Equipment',
    cleanliness: 'Cleanliness',
    staff: 'Staff',
    billing: 'Billing',
    classes: 'Classes',
    other: 'Other'
};

/** The rows with their dimension in words. */
const labelled = (rows: GroupRow[]): GroupRow[] => rows.map(r => ({ ...r, dim: LABELS[r.dim] ?? r.dim }));

/** Rows with a branch → components per branch (an empty dimension). */
export const byBranch = (rows: readonly ({ branch_oid: string } & Record<string, unknown>)[]): Map<string, Comp> =>
    merge(
        rows.map(row => {
            const { branch_oid: branchOid, ...rest } = row;
            return { branch_oid: branchOid, comp: numbers(rest) };
        })
    );

/** A map of components per branch as rows for `merge`. */
const fromMap = (m: Map<string, Comp>): { branch_oid: string; comp: Comp }[] => [...m].map(([branchOid, comp]) => ({ branch_oid: branchOid, comp }));

function numbers(o: Record<string, unknown>): Comp {
    const out: Comp = {};
    for (const [k, v] of Object.entries(o)) if (typeof v === 'number') out[k] = v;
    return out;
}

const money = (key: string, label: string, value = c(key), hint?: string): Figure => ({ key, label, unit: 'money', value, ...(hint ? { hint } : {}) });
const count = (key: string, label: string, value = c(key), hint?: string): Figure => ({ key, label, unit: 'count', value, ...(hint ? { hint } : {}) });
const percent = (key: string, label: string, value: Figure['value'], hint?: string): Figure => ({
    key,
    label,
    unit: 'percent',
    value,
    ...(hint ? { hint } : {})
});
const netReceived = (x: Comp): number => (x['received'] ?? 0) - (x['refunded'] ?? 0);

/* ---------- revenue ---------- */

export interface RevenueInput {
    days: DayRow[];
    previous: DayRow[] | null;
    bySource: GroupRow[];
    byMethod: GroupRow[];
}

export function revenue(s: Scope, x: RevenueInput): Built {
    const figures: Figure[] = [
        money('invoiced', 'Invoiced', c('invoiced'), 'Every invoice issued in the period, VAT included.'),
        money('received', 'Received'),
        money('refunded', 'Refunded'),
        money('net', 'Net received', netReceived),
        money('shop', 'Shop sales'),
        count('invoices', 'Invoices')
    ];
    return {
        kpis: kpis(figures, s.branches, totalsByBranch(x.days), x.previous ? totalsByBranch(x.previous) : null),
        charts: [
            series(
                {
                    key: 'received',
                    title: 'Received and invoiced',
                    kind: 'bar',
                    unit: 'money',
                    measures: [money('net', 'Net received', netReceived), money('invoiced', 'Invoiced')]
                },
                s.range,
                s.branches,
                x.days
            )
        ],
        tables: [
            pivot(
                {
                    key: 'by_source',
                    title: 'By plan and source',
                    note: 'Invoices issued in the period: each plan, locker rentals and the shop.',
                    dim: { key: 'source', label: 'Plan or source', unit: 'text' },
                    measures: [count('invoices', 'Invoices'), money('invoiced', 'Invoiced'), money('discount', 'Discounts'), money('vat', 'VAT')],
                    primary: 'invoiced'
                },
                s.branches,
                x.bySource
            ),
            pivot(
                {
                    key: 'by_method',
                    title: 'By payment method',
                    dim: { key: 'method', label: 'Method', unit: 'text' },
                    measures: [count('payments', 'Payments'), money('received', 'Received'), money('refunded', 'Refunded'), money('net', 'Net', netReceived)],
                    primary: 'net',
                    order: ['Cash', 'bKash', 'Nagad', 'Card', 'Bank transfer']
                },
                s.branches,
                labelled(x.byMethod)
            )
        ]
    };
}

/* ---------- dues ---------- */

export const DUE_AGES = ['0–30 days', '31–60 days', '61–90 days', 'Over 90 days'] as const;
export const dueAge = (days: number): string => (days <= 30 ? DUE_AGES[0] : days <= 60 ? DUE_AGES[1] : days <= 90 ? DUE_AGES[2] : DUE_AGES[3]);

export interface DuesInput {
    /** Per branch: due, invoices, members, over_30. */
    totals: Map<string, Comp>;
    previous: Map<string, Comp> | null;
    byAge: GroupRow[];
    largest: (Row & { branch_oid: string })[];
}

export function dues(s: Scope, x: DuesInput): Built {
    const figures: Figure[] = [
        money('due', 'Total due'),
        count('members', 'Members owing'),
        count('invoices', 'Invoices owing'),
        money('over_30', 'Due over 30 days'),
        percent('over_30_share', 'Share over 30 days', pct('over_30', 'due'))
    ];
    return {
        kpis: kpis(figures, s.branches, x.totals, x.previous),
        charts: [
            {
                key: 'by_age',
                title: 'Dues by age',
                kind: 'bar',
                unit: 'money',
                categories: [...DUE_AGES],
                series: (s.branches.length > 1 ? s.branches : [null]).map(b => ({
                    name: b?.name ?? 'Due',
                    data: DUE_AGES.map(a => x.byAge.filter(r => r.dim === a && (!b || r.branch_oid === b.oid)).reduce((t, r) => t + (r.comp['due'] ?? 0), 0))
                }))
            }
        ],
        tables: [
            pivot(
                {
                    key: 'by_age',
                    title: 'By age',
                    note: 'How long ago the invoice was issued.',
                    dim: { key: 'age', label: 'Age', unit: 'text' },
                    measures: [money('due', 'Due'), count('invoices', 'Invoices')],
                    primary: 'due',
                    order: [...DUE_AGES]
                },
                s.branches,
                x.byAge
            ),
            list(
                'largest',
                'Largest dues',
                [
                    { key: 'member_code', label: 'Member', unit: 'text' },
                    { key: 'member_name', label: 'Name', unit: 'text' },
                    { key: 'due', label: 'Due', unit: 'money' },
                    { key: 'invoices', label: 'Invoices', unit: 'count' },
                    { key: 'oldest', label: 'Oldest (days)', unit: 'count' }
                ],
                x.largest,
                s.branches,
                'The 25 members who owe the most.'
            )
        ],
        notes: [`Dues as they stood at the end of ${s.range.to}. A refund never creates dues.`]
    };
}

/* ---------- members ---------- */

export interface MembersInput {
    days: DayRow[];
    /** Per branch: active, lapsed, expiring at the end of the range. */
    state: Map<string, Comp>;
    previousDays: DayRow[] | null;
    previousState: Map<string, Comp> | null;
    plans: GroupRow[];
    expiring: (Row & { branch_oid: string })[];
}

export function members(s: Scope, x: MembersInput): Built {
    const figures: Figure[] = [
        count('active', 'Active members', c('active'), 'With a plan on the last day of the period.'),
        count('joined', 'New members'),
        count('renewals', 'Renewals'),
        count('lapsed', 'Lapsed', c('lapsed'), 'Their last plan ended in the period and nothing came after it.'),
        count('expiring', 'Expiring in 14 days'),
        percent(
            'retention',
            'Renewal rate',
            y => pct('renewals', 'ended')({ ...y, ended: (y['renewals'] ?? 0) + (y['lapsed'] ?? 0) }),
            'Renewals out of renewals plus lapsed.'
        )
    ];
    const totals = (days: DayRow[], state: Map<string, Comp>): Map<string, Comp> => merge(days, fromMap(state));
    return {
        kpis: kpis(figures, s.branches, totals(x.days, x.state), x.previousDays && x.previousState ? totals(x.previousDays, x.previousState) : null),
        charts: [
            series(
                {
                    key: 'growth',
                    title: 'New members and renewals',
                    kind: 'bar',
                    unit: 'count',
                    measures: [count('joined', 'New members'), count('renewals', 'Renewals')]
                },
                s.range,
                s.branches,
                x.days
            )
        ],
        tables: [
            pivot(
                {
                    key: 'plans',
                    title: 'Plans sold',
                    dim: { key: 'plan', label: 'Plan', unit: 'text' },
                    measures: [count('sold', 'Sold'), count('renewals', 'Renewals'), money('invoiced', 'Invoiced')],
                    primary: 'sold'
                },
                s.branches,
                x.plans
            ),
            list(
                'expiring',
                'Plans ending in the next 14 days',
                [
                    { key: 'member_code', label: 'Member', unit: 'text' },
                    { key: 'member_name', label: 'Name', unit: 'text' },
                    { key: 'plan', label: 'Plan', unit: 'text' },
                    { key: 'ends', label: 'Ends', unit: 'date' }
                ],
                x.expiring,
                s.branches,
                'Members with nothing booked after it, soonest first (at most 50).'
            )
        ]
    };
}

/* ---------- attendance ---------- */

export const WEEKDAYS: [number, string][] = [
    [6, 'Sat'],
    [0, 'Sun'],
    [1, 'Mon'],
    [2, 'Tue'],
    [3, 'Wed'],
    [4, 'Thu'],
    [5, 'Fri']
];
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6);
const hh = (h: number): string => `${String(h).padStart(2, '0')}:00`;

export interface AttendanceInput {
    days: DayRow[];
    /** Per branch: unique_members over the range. */
    unique: Map<string, Comp>;
    previousDays: DayRow[] | null;
    previousUnique: Map<string, Comp> | null;
    hours: { branch_oid: string; dow: number; hour: number; visits: number }[];
}

export function attendance(s: Scope, x: AttendanceInput, days: number): Built {
    const figures: Figure[] = [
        count('visits', 'Visits'),
        count('unique_members', 'Members who came'),
        { key: 'per_day', label: 'Visits a day', unit: 'number', value: y => Math.round((10 * (y['visits'] ?? 0)) / days) / 10 },
        {
            key: 'stay',
            label: 'Average stay',
            unit: 'minutes',
            value: y => ((y['stays'] ?? 0) > 0 ? Math.round((y['stay_minutes'] ?? 0) / (y['stays'] ?? 1)) : null)
        },
        count('visitors', 'From other branches', c('visitors'), 'Visits by members whose home is another branch.')
    ];
    const totals = (d: DayRow[], u: Map<string, Comp>): Map<string, Comp> => merge(d, fromMap(u));
    return {
        kpis: kpis(figures, s.branches, totals(x.days, x.unique), x.previousDays && x.previousUnique ? totals(x.previousDays, x.previousUnique) : null),
        charts: [
            series({ key: 'visits', title: 'Visits', kind: 'line', unit: 'count', measures: [count('visits', 'Visits')] }, s.range, s.branches, x.days),
            {
                key: 'busy',
                title: 'Busy hours',
                kind: 'heatmap',
                unit: 'count',
                categories: HOURS.map(hh),
                series: WEEKDAYS.map(([dow, name]) => ({
                    name,
                    data: HOURS.map(h => x.hours.filter(v => v.dow === dow && v.hour === h).reduce((sum, v) => sum + v.visits, 0))
                }))
            }
        ],
        tables: [
            pivot(
                {
                    key: 'by_weekday',
                    title: 'By weekday',
                    dim: { key: 'weekday', label: 'Day', unit: 'text' },
                    measures: [count('visits', 'Visits')],
                    primary: 'visits',
                    order: WEEKDAYS.map(w => w[1])
                },
                s.branches,
                x.hours.map(v => ({ branch_oid: v.branch_oid, dim: WEEKDAYS.find(w => w[0] === v.dow)?.[1] ?? '', comp: { visits: v.visits } }))
            ),
            pivot(
                {
                    key: 'by_hour',
                    title: 'By hour of arrival',
                    dim: { key: 'hour', label: 'Hour', unit: 'text' },
                    measures: [count('visits', 'Visits')],
                    primary: 'visits',
                    order: HOURS.map(hh)
                },
                s.branches,
                x.hours.map(v => ({ branch_oid: v.branch_oid, dim: hh(v.hour), comp: { visits: v.visits } }))
            )
        ]
    };
}

/* ---------- classes ---------- */

const CLASS_FIGURES: Figure[] = [
    count('held', 'Classes held'),
    count('cancelled', 'Cancelled'),
    percent('fill', 'Fill rate', pct('booked', 'capacity'), 'Places booked (attended, no-shows and still booked) out of the places offered.'),
    count('attended', 'Attended'),
    count('no_shows', 'No-shows'),
    percent('no_show_rate', 'No-show rate', y => pct('no_shows', 'came_or_not')({ ...y, came_or_not: (y['attended'] ?? 0) + (y['no_shows'] ?? 0) }))
];

export interface ClassesInput {
    days: DayRow[];
    previous: DayRow[] | null;
    byType: GroupRow[];
}

export function classes(s: Scope, x: ClassesInput): Built {
    return {
        kpis: kpis(
            [...CLASS_FIGURES, count('waitlist', 'On a waitlist'), count('late_cancels', 'Late cancels')],
            s.branches,
            totalsByBranch(x.days),
            x.previous ? totalsByBranch(x.previous) : null
        ),
        charts: [
            series(
                {
                    key: 'attendance',
                    title: 'Class attendance',
                    kind: 'bar',
                    unit: 'count',
                    measures: [count('attended', 'Attended'), count('no_shows', 'No-shows')]
                },
                s.range,
                s.branches,
                x.days
            )
        ],
        tables: [
            pivot(
                {
                    key: 'by_type',
                    title: 'By class',
                    dim: { key: 'class', label: 'Class', unit: 'text' },
                    measures: [
                        count('held', 'Held'),
                        count('capacity', 'Places'),
                        count('booked', 'Booked'),
                        ...CLASS_FIGURES.filter(f => ['fill', 'attended', 'no_shows', 'no_show_rate'].includes(f.key))
                    ],
                    primary: 'attended'
                },
                s.branches,
                x.byType
            )
        ]
    };
}

/* ---------- trainers (counts only: no commission) ---------- */

export interface TrainerNumbers {
    branch_oid: string;
    trainer_oid: string;
    trainer: string;
    pt_completed: number;
    pt_no_shows: number;
    pt_cancelled: number;
    pt_booked: number;
    classes: number;
    class_attended: number;
    class_no_shows: number;
    ratings: number;
    rating_sum: number;
}

export const TRAINER_KPIS: Figure[] = [
    count('pt_completed', 'PT sessions done'),
    count('pt_no_shows', 'PT no-shows'),
    count('pt_cancelled', 'PT cancelled'),
    count('classes', 'Classes taught'),
    count('class_attended', 'Class attendees'),
    { key: 'rating', label: 'Average rating', unit: 'number', value: ratio('rating_sum', 'ratings'), hint: 'Members’ 1–5 ratings of classes and PT sessions.' }
];

const TRAINER_NOTE = 'Counts only: commission and pay are not worked out here.';

export interface TrainersInput {
    rows: TrainerNumbers[];
    previous: TrainerNumbers[] | null;
    days: DayRow[];
}

export function trainers(s: Scope, x: TrainersInput): Built {
    const comp = (r: TrainerNumbers): Comp => ({
        pt_completed: r.pt_completed,
        pt_no_shows: r.pt_no_shows,
        pt_cancelled: r.pt_cancelled,
        pt_booked: r.pt_booked,
        classes: r.classes,
        class_attended: r.class_attended,
        class_no_shows: r.class_no_shows,
        ratings: r.ratings,
        rating_sum: r.rating_sum
    });
    const shape = (y: Comp): Row => ({
        pt_completed: y['pt_completed'] ?? 0,
        pt_no_shows: y['pt_no_shows'] ?? 0,
        pt_cancelled: y['pt_cancelled'] ?? 0,
        pt_booked: y['pt_booked'] ?? 0,
        classes: y['classes'] ?? 0,
        class_attended: y['class_attended'] ?? 0,
        rating: ratio('rating_sum', 'ratings')(y),
        ratings: y['ratings'] ?? 0
    });
    const per = (rows: TrainerNumbers[]): Map<string, Comp> => merge(rows.map(r => ({ branch_oid: r.branch_oid, comp: comp(r) })));
    return {
        kpis: kpis(TRAINER_KPIS, s.branches, per(x.rows), x.previous ? per(x.previous) : null),
        charts: [
            series(
                {
                    key: 'pt',
                    title: 'PT sessions done',
                    kind: 'bar',
                    unit: 'count',
                    measures: [count('pt_completed', 'PT sessions done'), count('classes', 'Classes taught')]
                },
                s.range,
                s.branches,
                x.days
            )
        ],
        tables: [
            list(
                'trainers',
                'By trainer',
                [
                    { key: 'trainer', label: 'Trainer', unit: 'text' },
                    { key: 'pt_completed', label: 'PT done', unit: 'count' },
                    { key: 'pt_no_shows', label: 'PT no-shows', unit: 'count' },
                    { key: 'pt_cancelled', label: 'PT cancelled', unit: 'count' },
                    { key: 'pt_booked', label: 'PT still booked', unit: 'count' },
                    { key: 'classes', label: 'Classes taught', unit: 'count' },
                    { key: 'class_attended', label: 'Class attendees', unit: 'count' },
                    { key: 'rating', label: 'Rating', unit: 'number' },
                    { key: 'ratings', label: 'Ratings', unit: 'count' }
                ],
                x.rows.map(r => ({ branch_oid: r.branch_oid, trainer: r.trainer, ...shape(comp(r)) })),
                s.branches,
                TRAINER_NOTE,
                x.rows.length ? { trainer: 'Total', ...shape(sumComp(x.rows.map(comp))) } : null
            )
        ]
    };
}

/** One trainer's numbers at one branch (`GET /v1/trainers/:oid/numbers`). */
export function trainerNumbers(s: Scope, x: { rows: TrainerNumbers[]; days: DayRow[] }): Report {
    const built = trainers(s, { rows: x.rows, previous: null, days: x.days });
    return {
        key: 'trainer',
        title: x.rows[0]?.trainer ?? 'Trainer',
        from: s.range.from,
        to: s.range.to,
        previous: null,
        branches: s.branches,
        kpis: built.kpis,
        charts: built.charts.map(ch => ({ ...ch, title: 'Sessions' })),
        tables: [],
        notes: [TRAINER_NOTE]
    };
}

/* ---------- shop (margin at average cost) ---------- */

const net = (y: Comp): number => (y['net'] ?? 0) - (y['returned_net'] ?? 0);
const margin = (y: Comp): number => net(y) - (y['cost'] ?? 0);
const SHOP_MEASURES: Figure[] = [
    count('qty', 'Items sold'),
    money('net_sales', 'Sales without VAT', net, 'After returns.'),
    money('cost', 'Cost', c('cost'), 'At the average cost when sold; items back on the shelf come off it.'),
    money('margin', 'Margin', margin),
    percent('margin_pct', 'Margin %', y => (net(y) > 0 ? Math.round((1000 * margin(y)) / net(y)) / 10 : null))
];

export interface ShopInput {
    days: DayRow[];
    previous: DayRow[] | null;
    byProduct: GroupRow[];
    byCategory: GroupRow[];
}

export function shop(s: Scope, x: ShopInput): Built {
    return {
        kpis: kpis(
            [money('gross', 'Shop takings', c('gross'), 'POS invoices, VAT included, before returns.'), count('sales', 'Sales'), ...SHOP_MEASURES],
            s.branches,
            totalsByBranch(x.days),
            x.previous ? totalsByBranch(x.previous) : null
        ),
        charts: [
            series(
                {
                    key: 'sales',
                    title: 'Shop sales and margin',
                    kind: 'bar',
                    unit: 'money',
                    measures: SHOP_MEASURES.filter(m => m.key === 'net_sales' || m.key === 'margin')
                },
                s.range,
                s.branches,
                x.days
            )
        ],
        tables: [
            pivot(
                { key: 'by_product', title: 'By product', dim: { key: 'product', label: 'Product', unit: 'text' }, measures: SHOP_MEASURES, primary: 'margin' },
                s.branches,
                x.byProduct
            ),
            pivot(
                {
                    key: 'by_category',
                    title: 'By category',
                    dim: { key: 'category', label: 'Category', unit: 'text' },
                    measures: SHOP_MEASURES,
                    primary: 'margin'
                },
                s.branches,
                labelled(x.byCategory)
            )
        ]
    };
}

/* ---------- operations: stock value, equipment spend, complaints, NPS ---------- */

const nps = (y: Comp): number | null =>
    (y['answers'] ?? 0) > 0 ? Math.round((100 * ((y['promoters'] ?? 0) - (y['detractors'] ?? 0))) / (y['answers'] ?? 1)) : null;
const spendOf = (y: Comp): number => (y['repair_cost'] ?? 0) + (y['purchase_cost'] ?? 0);

export interface OperationsInput {
    /** By product category, as it stands now: units, value, low. */
    stock: GroupRow[];
    /** By equipment category: repairs, repair_cost, bought, purchase_cost. */
    spend: GroupRow[];
    /** By complaint category: complaints, resolved, escalated, responded, response_hours. */
    complaints: GroupRow[];
    /** Per day: answers, promoters, detractors, complaints, ratings, rating_sum. */
    feedback: DayRow[];
    /** Per branch, now: open_tickets, urgent, out_of_order. */
    tickets: Map<string, Comp>;
    previous: { spend: GroupRow[]; complaints: GroupRow[]; feedback: DayRow[] } | null;
}

export function operations(s: Scope, x: OperationsInput): Built {
    // Complaints are counted per day (feedback); from the categories only the reply times.
    const replies = (rows: GroupRow[]): { branch_oid: string; comp: Comp }[] =>
        rows.map(r => ({ branch_oid: r.branch_oid, comp: { responded: r.comp['responded'] ?? 0, response_hours: r.comp['response_hours'] ?? 0 } }));
    const now = merge(x.stock, x.spend, replies(x.complaints), x.feedback, fromMap(x.tickets));
    const prev = x.previous ? merge(x.previous.spend, replies(x.previous.complaints), x.previous.feedback) : null;
    const figures: Figure[] = [
        { ...money('value', 'Stock value', c('value'), 'On hand now, at average cost.'), current: true },
        { ...count('low', 'Products low on stock', c('low'), 'At or below their reorder level, now.'), current: true },
        money('spend', 'Equipment spend', spendOf, 'Repairs closed and equipment bought in the period.'),
        { ...count('open_tickets', 'Open tickets', c('open_tickets'), 'Now.'), current: true },
        count('complaints', 'Complaints'),
        { key: 'response', label: 'Hours to first reply', unit: 'number', value: ratio('response_hours', 'responded') },
        { key: 'nps', label: 'NPS', unit: 'number', value: nps, hint: 'Promoters (9–10) minus detractors (0–6), as a share of the answers: −100 to 100.' },
        { key: 'rating', label: 'Average rating', unit: 'number', value: ratio('rating_sum', 'ratings') }
    ];
    return {
        kpis: kpis(figures, s.branches, now, prev),
        charts: [
            series(
                {
                    key: 'nps',
                    title: 'NPS and complaints',
                    kind: 'line',
                    unit: 'number',
                    measures: [{ key: 'nps', label: 'NPS', unit: 'number', value: nps }, count('complaints', 'Complaints')]
                },
                s.range,
                s.branches,
                x.feedback
            )
        ],
        tables: [
            pivot(
                {
                    key: 'stock',
                    title: 'Stock value by category',
                    note: 'On hand now.',
                    dim: { key: 'category', label: 'Category', unit: 'text' },
                    measures: [count('units', 'Units'), money('value', 'Value'), count('low', 'Low')],
                    primary: 'value'
                },
                s.branches,
                labelled(x.stock)
            ),
            pivot(
                {
                    key: 'equipment',
                    title: 'Equipment spend by category',
                    dim: { key: 'category', label: 'Category', unit: 'text' },
                    measures: [
                        count('repairs', 'Repairs closed'),
                        money('repair_cost', 'Repair cost'),
                        count('bought', 'Bought'),
                        money('purchase_cost', 'Purchase cost'),
                        money('spend', 'Total', spendOf)
                    ],
                    primary: 'spend'
                },
                s.branches,
                labelled(x.spend)
            ),
            pivot(
                {
                    key: 'complaints',
                    title: 'Complaints by category',
                    dim: { key: 'category', label: 'Category', unit: 'text' },
                    measures: [
                        count('complaints', 'Complaints'),
                        count('resolved', 'Resolved'),
                        count('escalated', 'Escalated'),
                        { key: 'response', label: 'Hours to first reply', unit: 'number', value: ratio('response_hours', 'responded') }
                    ],
                    primary: 'complaints'
                },
                s.branches,
                labelled(x.complaints)
            )
        ]
    };
}

/** The report's frame around what a definition built. */
export function frame(key: ReportKey, s: Scope, built: Built): Report {
    return { key, title: REPORT_TITLES[key], from: s.range.from, to: s.range.to, previous: s.previous, branches: s.branches, notes: [], ...built };
}
