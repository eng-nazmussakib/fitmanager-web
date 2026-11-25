import type { CartLine } from '@core/models/business.model';
import type { Invoice } from '@core/models/payment.model';
import type { PaymentMethod } from '@core/models/subscription.model';

import {
    type Actor,
    customerOf,
    type Emit,
    moveStock,
    priceCart,
    raisePo,
    receivePo,
    receiveTransfer,
    requestTransfer,
    returnPos,
    sellPos,
    sendTransfer
} from '../business';
import { apply } from '../store';
import type { EquipmentRow, FileRow, MockDb, PoRow, ProductRow, SupplierRow, TicketRow, TransferRow } from '../types';
import { addDaysIso, weekdayOf } from './clock';
import { Rng } from './prng';

/**
 * Business showcase: the same catalogue as the API's demo seed (008_catalogue.sql) and the same
 * cases as its showcase seed (106_business_cases.sql), dated from the seed day. The stock, orders, transfers and POS
 * sales go through the same steps as the handlers (../business.ts), oldest first, so the ledger's running balance is
 * right. The photos are credited in fitmanager-infra db/seeds/showcase/MEDIA-CREDITS.md.
 *
 * Gulshan has every case: equipment in use, in warranty, service due and soon, out of order with an urgent ticket,
 * a low-priority ticket, a fixed repair, one that could not be fixed and was retired; orders received, partly
 * received, sent, approved, pending, rejected and cancelled; low and out-of-stock products; adjustments (damaged,
 * expired, a count, a transfer shortfall); transfers in every status; POS sales by every method, a member who paid
 * (Rahim, the portal member), a member who charged it to the account (Sadia), a manager's discount, and returns
 * (restocked, damaged, and a late one by the manager).
 */

const SUPPLIERS: [string, string, string, string | null, string | null, string, string | null, boolean][] = [
    [
        'sup-1',
        'Dhaka Nutrition Traders',
        'Mahmud Karim',
        '+8801711000301',
        'orders@dhakanutrition.example',
        'House 12, Road 3, Banani, Dhaka',
        'Supplements. Delivers in 3 to 5 days; orders by WhatsApp.',
        true
    ],
    [
        'sup-2',
        'Bengal Beverage Distributors',
        'Shirin Akter',
        '+8801811000302',
        'sales@bengalbev.example',
        'Tejgaon Industrial Area, Dhaka',
        'Drinks and snack bars. Weekly van on Tuesdays.',
        true
    ],
    [
        'sup-3',
        'SportsLine Accessories',
        'Arif Chowdhury',
        '+8801911000303',
        'hello@sportsline.example',
        'Bashundhara City, Level 4, Dhaka',
        'Towels, gloves, bands, shakers and branded T-shirts.',
        true
    ],
    ['sup-4', 'Old Town Fitness Supply', 'Kamrul Islam', '+8801611000304', null, 'Nawabpur Road, Old Dhaka', 'No longer used: prices went up in 2025.', false]
];

type P = [string, ProductRow['category'], ProductRow['unit'], string, number, number | null, string, number, boolean, string | null];
const PRODUCTS: P[] = [
    ['Whey protein, chocolate, 1 kg', 'supplements', 'tub', '24 g protein a scoop, about 33 scoops.', 4200, null, 'sup-1', 3, true, 'whey-chocolate'],
    ['Whey protein, vanilla, 1 kg', 'supplements', 'tub', '24 g protein a scoop, about 33 scoops.', 4200, null, 'sup-1', 3, true, null],
    ['Creatine monohydrate, 300 g', 'supplements', 'tub', 'Unflavoured, 5 g a day.', 1850, null, 'sup-1', 3, true, 'creatine'],
    ['BCAA powder, 250 g', 'supplements', 'tub', 'Lemon flavour, for during training.', 2100, null, 'sup-1', 2, true, null],
    ['Protein bar, 60 g', 'snacks', 'piece', '20 g protein, peanut and chocolate.', 180, null, 'sup-2', 12, true, 'protein-bar'],
    ['Oat energy bar', 'snacks', 'piece', 'Oats, dates and honey.', 90, null, 'sup-2', 12, true, null],
    ['Bottled water, 500 ml', 'drinks', 'bottle', 'Chilled at the desk.', 30, 0.05, 'sup-2', 24, true, null],
    ['Electrolyte drink, 500 ml', 'drinks', 'bottle', 'Orange, low sugar.', 120, null, 'sup-2', 12, true, null],
    ['Shaker bottle, 700 ml', 'accessories', 'piece', 'With a mixing ball and a powder compartment.', 450, null, 'sup-3', 4, true, 'shaker'],
    ['Gym towel', 'accessories', 'piece', 'Microfibre, 40 × 80 cm.', 550, null, 'sup-3', 5, true, 'gym-towel'],
    ['Lifting gloves', 'accessories', 'pair', 'Padded palm, wrist strap. Sizes S to XL.', 950, null, 'sup-3', 3, true, null],
    ['Resistance band set', 'accessories', 'box', 'Five bands, light to extra heavy.', 1400, null, 'sup-3', 2, true, 'resistance-bands'],
    ['Training T-shirt', 'apparel', 'piece', 'Quick-dry, with the gym logo.', 890, null, 'sup-3', 5, true, null],
    ['Pre-workout, 300 g', 'supplements', 'tub', 'Withdrawn: too much caffeine for HQ’s rules.', 2600, null, 'sup-4', 0, false, null]
];

/** `prd-5` for PRD-000005. */
export const prd = (n: number): string => `prd-${n}`;

export function seedCatalogue(db: MockDb, today: string): void {
    const stamp = `${addDaysIso(today, -40)}T10:00:00+06:00`;
    for (const [oid, name, contact, phone, email, address, notes, active] of SUPPLIERS)
        db.suppliers.push({ oid, name, contact_name: contact, phone, email, address, notes, active, updated_at: stamp } satisfies SupplierRow);
    PRODUCTS.forEach(([name, category, unit, description, price, vat, supplier, reorder, active, photo], i) => {
        const oid = prd(i + 1);
        if (photo) {
            (db.files ??= []).push({
                oid: `file-${oid}`,
                branch_oid: 'br-hq',
                member_oid: null,
                kind: 'product_photo',
                name: `${photo}.webp`,
                content_type: 'image/webp',
                size_bytes: 12_000,
                status: 'ready',
                url: `assets/business/${photo}.webp`,
                created_at: stamp,
                created_by_name: 'Shirin Akhter'
            } satisfies FileRow);
        }
        db.products.push({
            oid,
            code: `PRD-${String(i + 1).padStart(6, '0')}`,
            name,
            category,
            unit,
            description,
            price,
            vat_rate: vat,
            photo_file_oids: photo ? [`file-${oid}`] : [],
            supplier_oid: supplier,
            reorder_level: reorder,
            active,
            updated_at: stamp
        });
    });
}

export function seedBusiness(db: MockDb, today: string): void {
    seedCatalogue(db, today);
    const emit: Emit = m => apply(db, m);
    const day = (n: number): string => addDaysIso(today, -n);
    const when = (n: number, hhmm: string): { date: string; iso: string } => ({ date: day(n), iso: `${day(n)}T${hhmm}:00+06:00` });
    const [GUL, DHA, UTT] = ['br-gul', 'br-dha', 'br-utt'];
    const mgr: Actor = { branch_oid: GUL, name: 'Ashraf Siddique' };
    const desk: Actor = { branch_oid: GUL, name: 'Lamia Haque' };
    const trainer = 'Sam Cole';
    const mgrDha: Actor = { branch_oid: DHA, name: 'Riyad Kabir' };
    const deskDha: Actor = { branch_oid: DHA, name: 'Mim Sarker' };
    const mgrUtt: Actor = { branch_oid: UTT, name: 'Zahid Alam' };
    const deskUtt: Actor = { branch_oid: UTT, name: 'Tanjila Biswas' };
    const hq = 'Shirin Akhter';

    /* ---------- equipment ---------- */
    let ticketN: Record<string, number> = {};
    const kit = (oid: string, branch: string, name: string, category: EquipmentRow['category'], o: Partial<EquipmentRow> = {}): EquipmentRow => {
        const row: EquipmentRow = {
            oid,
            branch_oid: branch,
            name,
            category,
            brand: null,
            model: null,
            serial: null,
            purchased_on: null,
            cost: null,
            warranty_until: null,
            room_oid: null,
            photo_file_oid: null,
            status: 'in_use',
            service_every_days: null,
            last_serviced_on: null,
            notes: null,
            retired_on: null,
            retired_reason: null,
            created_on: day(60),
            ...o
        };
        db.equipment.push(row);
        return row;
    };
    const ticket = (e: EquipmentRow, o: Partial<TicketRow> & Pick<TicketRow, 'description' | 'raised_by_name' | 'raised_at'>): void => {
        const code = db.branches.find(b => b.oid === e.branch_oid)!.code;
        ticketN = { ...ticketN, [code]: (ticketN[code] ?? 0) + 1 };
        const row: TicketRow = {
            oid: `tkt-${code.toLowerCase()}-${ticketN[code]}`,
            branch_oid: e.branch_oid,
            equipment_oid: e.oid,
            code: `TKT-${code}-${String(ticketN[code]).padStart(5, '0')}`,
            kind: 'repair',
            photo_file_oid: null,
            priority: 'normal',
            out_of_order: false,
            status: 'open',
            technician: null,
            cost: null,
            resolution: null,
            updated_at: o.closed_at ?? o.raised_at,
            closed_at: null,
            closed_by_name: null,
            ...o
        };
        db.tickets.push(row);
        if (row.kind === 'service' && row.closed_at) e.last_serviced_on = row.closed_at.slice(0, 10);
        const open = db.tickets.some(t => t.equipment_oid === e.oid && t.out_of_order && ['open', 'in_progress', 'cannot_fix'].includes(t.status));
        if (e.status !== 'retired') e.status = open ? 'out_of_order' : 'in_use';
    };
    const photo = (oid: string, name: string): string => {
        (db.files ??= []).push({
            oid,
            branch_oid: GUL,
            member_oid: null,
            kind: 'equipment_photo',
            name: `${name}.webp`,
            content_type: 'image/webp',
            size_bytes: 50_000,
            status: 'ready',
            url: `assets/business/${name}.webp`,
            created_at: when(60, '11:00').iso,
            created_by_name: mgr.name
        });
        return oid;
    };
    const room = (branch: string, name: string): string | null => db.rooms.find(r => r.branch_oid === branch && r.name === name)?.oid ?? null;

    let e = kit('eq-gul-1', GUL, 'Treadmill 1', 'cardio', {
        brand: 'StrideMax',
        model: 'T900',
        serial: 'SM-T9-04411',
        purchased_on: day(400),
        cost: 285000,
        warranty_until: addDaysIso(today, 330),
        photo_file_oid: photo('file-eq-gul-1', 'treadmill-1'),
        service_every_days: 90,
        notes: 'By the front windows.'
    });
    ticket(e, {
        kind: 'service',
        description: 'Belt, deck and motor service',
        status: 'fixed',
        technician: 'FitCare Services',
        cost: 2500,
        resolution: 'Belt tension set, deck waxed, motor brushes checked.',
        raised_by_name: mgr.name,
        raised_at: when(95, '09:00').iso,
        closed_at: when(95, '12:00').iso,
        closed_by_name: mgr.name
    });
    e = kit('eq-gul-2', GUL, 'Treadmill 3', 'cardio', {
        brand: 'StrideMax',
        model: 'T900',
        serial: 'SM-T9-04413',
        purchased_on: day(400),
        cost: 285000,
        warranty_until: addDaysIso(today, 330),
        service_every_days: 90,
        last_serviced_on: day(20)
    });
    ticket(e, {
        description: 'The belt slips when running faster than 10 km/h. Signed out of use.',
        priority: 'urgent',
        out_of_order: true,
        status: 'in_progress',
        technician: 'Gym Repairs BD',
        raised_by_name: desk.name,
        raised_at: when(0, '08:20').iso
    });
    kit('eq-gul-3', GUL, 'Rowing machine', 'cardio', {
        brand: 'AquaRow',
        model: 'R2',
        serial: 'AR-R2-1102',
        purchased_on: day(300),
        cost: 98000,
        warranty_until: day(30),
        photo_file_oid: photo('file-eq-gul-3', 'rowing-machine'),
        service_every_days: 60,
        last_serviced_on: day(55)
    });
    e = kit('eq-gul-4', GUL, 'Leg press', 'strength', {
        brand: 'IronLine',
        model: 'LP-45',
        purchased_on: day(500),
        cost: 165000,
        service_every_days: 180,
        last_serviced_on: day(70)
    });
    ticket(e, { description: 'The seat pin sticks; hard to move the seat.', priority: 'low', raised_by_name: trainer, raised_at: when(2, '18:10').iso });
    e = kit('eq-gul-5', GUL, 'Spin bike 7', 'cardio', {
        brand: 'CycleCore',
        model: 'S7',
        serial: 'CC-S7-0707',
        purchased_on: day(250),
        cost: 62000,
        warranty_until: addDaysIso(today, 115),
        room_oid: room(GUL, 'Spin room'),
        service_every_days: 120
    });
    ticket(e, {
        kind: 'service',
        description: 'Quarterly service',
        status: 'fixed',
        technician: 'FitCare Services',
        cost: 800,
        resolution: 'Chain and brake pads checked.',
        raised_by_name: mgr.name,
        raised_at: when(40, '09:00').iso,
        closed_at: when(40, '11:00').iso,
        closed_by_name: mgr.name
    });
    ticket(e, {
        description: 'Left pedal crank is loose and clicks.',
        out_of_order: true,
        status: 'fixed',
        technician: 'Gym Repairs BD',
        cost: 1800,
        resolution: 'Pedal crank replaced.',
        raised_by_name: trainer,
        raised_at: when(12, '07:15').iso,
        closed_at: when(10, '16:00').iso,
        closed_by_name: mgr.name
    });
    e = kit('eq-gul-6', GUL, 'Cable crossover', 'strength', {
        brand: 'IronLine',
        model: 'CX-2',
        purchased_on: day(1900),
        cost: 210000,
        service_every_days: 180,
        last_serviced_on: day(200)
    });
    ticket(e, {
        description: 'Right pulley housing cracked; the cable jumps off.',
        priority: 'urgent',
        out_of_order: true,
        status: 'cannot_fix',
        technician: 'Gym Repairs BD',
        cost: 1200,
        resolution: 'The housing is no longer made; no part to fit.',
        raised_by_name: trainer,
        raised_at: when(22, '19:00').iso,
        closed_at: when(20, '15:00').iso,
        closed_by_name: mgr.name
    });
    Object.assign(e, { status: 'retired', retired_on: day(15), retired_reason: 'Beyond repair: no parts. Replaced by the new cable station.' });
    kit('eq-gul-7', GUL, 'Cable station', 'strength', {
        brand: 'IronLine',
        model: 'CX-5',
        serial: 'IL-CX5-2290',
        purchased_on: day(12),
        cost: 245000,
        warranty_until: addDaysIso(today, 718),
        service_every_days: 180,
        notes: 'Replaced the cable crossover.',
        created_on: day(12)
    });
    kit('eq-gul-8', GUL, 'Adjustable bench', 'benches_racks', { purchased_on: day(700), cost: 18000, room_oid: room(GUL, 'PT area') });
    kit('eq-gul-9', GUL, 'Dumbbells 2–30 kg', 'free_weights', {
        purchased_on: day(700),
        cost: 120000,
        service_every_days: 365,
        last_serviced_on: day(100),
        notes: 'Pairs in 2 kg steps, on two racks.'
    });
    kit('eq-gul-10', GUL, 'Battle ropes', 'functional', { purchased_on: day(300), cost: 9500, room_oid: room(GUL, 'Studio B') });
    kit('eq-dha-1', DHA, 'Treadmill 1', 'cardio', {
        brand: 'StrideMax',
        model: 'T700',
        purchased_on: day(600),
        cost: 240000,
        service_every_days: 90,
        last_serviced_on: day(100)
    });
    e = kit('eq-dha-2', DHA, 'Squat rack', 'benches_racks', { brand: 'IronLine', model: 'PR-1', purchased_on: day(600), cost: 75000 });
    ticket(e, { description: 'One J-hook is bent.', raised_by_name: deskDha.name, raised_at: when(1, '17:30').iso });
    kit('eq-utt-1', UTT, 'Exercise bike 1', 'cardio', {
        brand: 'CycleCore',
        model: 'U3',
        purchased_on: day(200),
        cost: 55000,
        warranty_until: addDaysIso(today, 165),
        room_oid: room(UTT, 'Spin room'),
        service_every_days: 120,
        last_serviced_on: day(30)
    });

    /* ---------- the stock timeline, oldest first ---------- */
    let n = 0;
    const id = (p: string): string => `${p}-s${++n}`;
    const po = (a: Actor, sup: string, lines: [number, number, number][], at: [number, string], note: string | null = null): PoRow =>
        raisePo(
            db,
            emit,
            a,
            when(...at),
            { supplier_oid: sup, note, lines: lines.map(([p, qty, cost]) => ({ product_oid: prd(p), qty, unit_cost: cost })) },
            id('po')
        );
    const decide = (o: PoRow, approve: boolean, at: [number, string], note: string | null = null): void =>
        apply(db, {
            t: 'patch',
            table: 'purchaseOrders',
            oid: o.oid,
            patch: {
                status: approve ? 'approved' : 'rejected',
                decided_by_name: hq,
                decided_at: when(...at).iso,
                decision_note: note,
                closed_at: approve ? null : when(...at).iso
            }
        });
    const sent = (o: PoRow, at: [number, string]): void =>
        apply(db, { t: 'patch', table: 'purchaseOrders', oid: o.oid, patch: { status: 'sent', sent_at: when(...at).iso } });
    const receive = (o: PoRow, a: Actor, at: [number, string], only?: [number, number][], note: string | null = null): void => {
        const fresh = db.purchaseOrders.find(x => x.oid === o.oid)!;
        const lines = fresh.lines
            .map(l => ({ line_oid: l.oid, qty: only ? (only.find(([p]) => prd(p) === l.product_oid)?.[1] ?? 0) : l.qty - l.received }))
            .filter(l => l.qty > 0);
        receivePo(db, emit, a, when(...at), fresh, { lines, note }, id('del'));
    };
    const sell = (
        a: Actor,
        member: string | null,
        lines: [number, number, number?, string?][],
        method: PaymentMethod,
        amount: number,
        ref: string | null,
        at: [number, string]
    ): Invoice => {
        const m = member ? db.members.find(x => x.code === member)! : null;
        const branch = db.branches.find(b => b.oid === a.branch_oid)!;
        const dues = m ? db.invoices.filter(i => i.member_oid === m.oid).reduce((s, i) => s + i.due, 0) : 0;
        const cart: CartLine[] = lines.map(([p, qty, discount, reason]) => ({
            product_oid: prd(p),
            qty,
            discount: discount ?? 0,
            discount_reason: reason ?? null
        }));
        return sellPos(db, emit, a, when(...at), customerOf(db, branch, m, dues), cart, { method, amount, reference: ref }, true, id('inv')).invoice;
    };
    const giveBack = (
        a: Actor,
        inv: { oid: string },
        lines: { index: number; qty: number; damaged?: boolean }[],
        method: PaymentMethod,
        ref: string | null,
        reason: string,
        at: [number, string]
    ): void =>
        returnPos(
            db,
            emit,
            a,
            when(...at),
            db.invoices.find(i => i.oid === inv.oid)!,
            { lines, method, reference: ref, reason },
            true,
            id('ret')
        );
    const adjust = (a: Actor, p: number, qty: number, reason: 'damaged' | 'expired' | 'count', note: string, at: [number, string]): void =>
        void moveStock(db, emit, a, when(...at).iso, { product_oid: prd(p), kind: 'adjustment', qty, reason, note });
    const trf = (from: string, a: Actor, lines: [number, number][], at: [number, string], note: string | null = null): TransferRow =>
        requestTransfer(db, emit, a, when(...at), { from_branch_oid: from, note, lines: lines.map(([p, qty]) => ({ product_oid: prd(p), qty })) }, id('trf'));
    const fresh = (t: TransferRow): TransferRow => db.transfers.find(x => x.oid === t.oid)!;
    const close = (t: TransferRow, status: 'rejected' | 'cancelled', note: string, at: [number, string]): void =>
        apply(db, { t: 'patch', table: 'transfers', oid: t.oid, patch: { status, closing_note: note, closed_at: when(...at).iso } });

    // Three months of everyday walk-in sales first (as seed 106): an order for the quarter received 93 days
    // back, then sales from 92 to 31 days back that sell exactly that stock, so every product is back at zero when
    // the cases start and the cases' receipts set the average cost afresh.
    const COST: Record<number, number> = { 1: 3000, 2: 3000, 3: 1300, 4: 1500, 5: 110, 6: 55, 7: 15, 8: 80, 9: 260, 10: 320, 11: 560, 12: 850, 13: 480 };
    const WEIGHT: Record<number, number> = { 1: 3, 2: 2, 3: 2, 4: 2, 5: 25, 6: 10, 7: 30, 8: 15, 9: 4, 10: 4, 11: 2, 12: 1, 13: 1 };
    const history = (m: Actor, a: Actor, products: number[], perDay: number, seed: number): void => {
        const rng = new Rng(seed);
        const sales: { back: number; time: string; lines: [number, number][]; method: PaymentMethod }[] = [];
        for (let back = 92; back >= 31; back--) {
            const friday = weekdayOf(day(back)) === 5;
            let count = rng.int(0, perDay);
            if (friday) count = Math.floor(count / 2);
            for (let k = 0; k < count; k++) {
                const lines: [number, number][] = [];
                for (let j = rng.int(1, 2); j > 0; j--) {
                    const p = rng.weighted(products.map(x => [x, WEIGHT[x] ?? 1] as const));
                    if (!lines.some(([q]) => q === p)) lines.push([p, p >= 5 && p <= 8 ? rng.int(1, 3) : 1]);
                }
                const minute = friday ? 16 * 60 + rng.int(0, 239) : 7 * 60 + 30 + rng.int(0, 779);
                const hhmm = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
                sales.push({
                    back,
                    time: hhmm,
                    lines,
                    method: rng.weighted<PaymentMethod>([
                        ['cash', 45],
                        ['bkash', 30],
                        ['card', 15],
                        ['nagad', 10]
                    ])
                });
            }
        }
        const need = new Map<number, number>();
        for (const x of sales) for (const [p, qty] of x.lines) need.set(p, (need.get(p) ?? 0) + qty);
        const bySupplier = new Map<string, [number, number, number][]>();
        for (const [p, qty] of [...need].sort((x, y) => x[0] - y[0])) {
            const sup = db.products.find(x => x.oid === prd(p))?.supplier_oid ?? 'sup-1';
            (bySupplier.get(sup) ?? bySupplier.set(sup, []).get(sup)!).push([p, qty, COST[p] ?? 100]);
        }
        for (const [sup, lines] of [...bySupplier].sort((x, y) => x[0].localeCompare(y[0]))) {
            const order = po(m, sup, lines, [96, '10:00'], 'Stock for the quarter.');
            decide(order, true, [95, '11:00']);
            sent(order, [95, '12:00']);
            receive(order, m, [93, '15:00']);
        }
        const ref = (method: PaymentMethod): string | null => {
            const alnum = (): string => Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[rng.int(0, 31)]).join('');
            return method === 'cash' ? null : method === 'card' ? `POS-${rng.int(30000, 38999)}` : method === 'bkash' ? `BK${alnum()}` : `NG${alnum()}`;
        };
        sales.sort((x, y) => y.back - x.back || x.time.localeCompare(y.time));
        for (const x of sales) {
            const cart = x.lines.map(([p, qty]) => ({ product_oid: prd(p), qty, discount: 0, discount_reason: null }));
            const total = priceCart(db, a.branch_oid, cart, false).q.total;
            sell(a, null, x.lines, x.method, total, ref(x.method), [x.back, x.time]);
        }
    };
    history(mgr, desk, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], 5, 1061);
    history(mgrDha, deskDha, [1, 2, 4, 5, 7], 3, 1062);
    history(mgrUtt, deskUtt, [5, 7, 9, 10, 11], 3, 1063);

    // Opening stock: orders received in full.
    let o = po(
        mgr,
        'sup-1',
        [
            [1, 6, 3000],
            [2, 4, 3000],
            [3, 6, 1300],
            [4, 4, 1500]
        ],
        [30, '10:00'],
        'Opening stock.'
    );
    decide(o, true, [29, '11:00']);
    sent(o, [29, '12:00']);
    receive(o, mgr, [26, '15:00']);
    o = po(
        mgr,
        'sup-2',
        [
            [5, 48, 110],
            [6, 36, 55],
            [7, 96, 15],
            [8, 24, 80]
        ],
        [28, '10:00'],
        'Opening stock.'
    );
    decide(o, true, [28, '15:00']);
    sent(o, [28, '16:00']);
    receive(o, mgr, [25, '11:00']);
    o = po(
        mgr,
        'sup-3',
        [
            [9, 12, 260],
            [10, 15, 320],
            [11, 8, 560],
            [12, 5, 850],
            [13, 20, 480]
        ],
        [27, '10:00'],
        'Opening stock.'
    );
    decide(o, true, [27, '14:00']);
    sent(o, [27, '15:00']);
    receive(o, mgr, [24, '12:00']);
    const dhaA = po(
        mgrDha,
        'sup-1',
        [
            [1, 8, 3000],
            [2, 6, 3000],
            [4, 10, 1500]
        ],
        [22, '10:00'],
        'Opening stock.'
    );
    decide(dhaA, true, [22, '13:00']);
    const dhaB = po(
        mgrDha,
        'sup-2',
        [
            [5, 40, 110],
            [7, 48, 15]
        ],
        [22, '10:05'],
        'Opening stock.'
    );
    decide(dhaB, true, [22, '13:01']);
    const uttA = po(
        mgrUtt,
        'sup-3',
        [
            [9, 6, 260],
            [11, 4, 560],
            [10, 8, 320]
        ],
        [21, '10:00'],
        'Opening stock.'
    );
    decide(uttA, true, [21, '12:00']);
    const uttB = po(
        mgrUtt,
        'sup-2',
        [
            [5, 30, 110],
            [7, 48, 15]
        ],
        [21, '10:05']
    );
    decide(uttB, true, [21, '12:01']);

    sell(
        desk,
        null,
        [
            [7, 2],
            [5, 1]
        ],
        'cash',
        270,
        null,
        [20, '18:05']
    );
    receive(dhaA, mgrDha, [19, '12:00']);
    receive(dhaB, mgrDha, [19, '12:30']);
    receive(uttA, mgrUtt, [18, '11:00']);
    receive(uttB, mgrUtt, [18, '11:30']);
    const whey = sell(desk, null, [[1, 1]], 'card', 4830, 'POS-51102', [18, '19:10']);
    // Rahim (the portal member) paid by bKash: 450 + 68 and 1850 + 278 (VAT rounded per line).
    sell(
        desk,
        'MEM-GUL-000001',
        [
            [9, 1],
            [3, 1]
        ],
        'bkash',
        2646,
        'BK8H2K11Q',
        [16, '07:40']
    );
    adjust(mgr, 7, -3, 'damaged', 'A case was crushed in the store room.', [15, '10:00']);
    giveBack(mgr, whey, [{ index: 0, qty: 1 }], 'card', 'POS-51102-R', 'Sealed and unopened; an allergy to an ingredient found.', [14, '12:00']);
    const cancelled = po(mgr, 'sup-3', [[13, 30, 480]], [12, '10:00']);
    decide(cancelled, true, [11, '10:00']);
    const gloves = sell(desk, null, [[11, 2]], 'cash', 2185, null, [12, '18:30']);
    giveBack(desk, gloves, [{ index: 0, qty: 1 }], 'cash', null, 'Wrong size.', [11, '10:15']);
    o = po(mgr, 'sup-1', [[4, 10, 1500]], [10, '10:00']);
    decide(o, false, [10, '16:00'], 'Dhanmondi has 10 BCAA it is not selling: ask them for a transfer.');
    sell(mgr, null, [[2, 1, 300, 'Dented lid']], 'cash', 4485, null, [10, '17:00']);
    const bcaa = trf(DHA, mgr, [[4, 4]], [9, '10:00'], 'HQ asked us to get it from you.');
    sell(desk, null, [[12, 3]], 'card', 4830, 'POS-51377', [9, '19:20']);
    adjust(mgr, 6, -6, 'expired', 'Past the best-before date.', [8, '09:30']);
    sendTransfer(
        db,
        emit,
        mgrDha,
        when(8, '12:00'),
        fresh(bcaa),
        fresh(bcaa).lines.map(l => ({ line_oid: l.oid, qty: l.qty_requested }))
    );
    apply(db, {
        t: 'patch',
        table: 'purchaseOrders',
        oid: cancelled.oid,
        patch: { status: 'cancelled', cancel_reason: 'The supplier is out of T-shirts until next month.', closed_at: when(8, '12:00').iso }
    });
    sell(
        desk,
        'MEM-GUL-000001',
        [
            [11, 1],
            [12, 2]
        ],
        'bkash',
        4313,
        'BK9J3L22R',
        [7, '07:35']
    );
    receiveTransfer(
        db,
        emit,
        mgr,
        when(7, '16:00'),
        fresh(bcaa),
        fresh(bcaa).lines.map(l => ({ line_oid: l.oid, qty: (l.qty_sent ?? 0) - 1 })),
        null
    );
    const cancelTrf = trf(UTT, mgr, [[11, 2]], [6, '10:00']);
    const partial = po(
        mgr,
        'sup-2',
        [
            [5, 48, 115],
            [7, 96, 15]
        ],
        [6, '10:30']
    );
    decide(partial, true, [5, '10:00']);
    sent(partial, [5, '11:00']);
    const vanilla = trf(GUL, mgrDha, [[2, 3]], [5, '11:30']);
    const bars = sell(
        desk,
        null,
        [
            [8, 6],
            [5, 4]
        ],
        'nagad',
        1656,
        'NG4T7Y00P',
        [5, '18:45']
    );
    giveBack(desk, bars, [{ index: 1, qty: 1, damaged: true }], 'nagad', 'NG4T7Y00P-R', 'Wrapper torn, bar crushed.', [4, '09:10']);
    close(vanilla, 'rejected', 'We are down to our last tubs of vanilla; more are on order.', [4, '10:00']);
    const sentPo = po(
        mgr,
        'sup-1',
        [
            [1, 6, 3050],
            [2, 4, 3050]
        ],
        [4, '10:30']
    );
    sell(desk, null, [[11, 3]], 'card', 3278, 'POS-51450', [4, '19:00']);
    adjust(mgr, 10, 1, 'count', 'Monthly count: one more found in the laundry.', [4, '21:00']);
    decide(sentPo, true, [3, '10:00']);
    sent(sentPo, [3, '10:30']);
    receive(
        partial,
        mgr,
        [3, '12:00'],
        [
            [5, 48],
            [7, 48]
        ],
        'The rest of the water comes on Tuesday’s van.'
    );
    sell(
        deskDha,
        null,
        [
            [5, 2],
            [7, 2]
        ],
        'cash',
        477,
        null,
        [3, '18:00']
    );
    // Sadia charged it to her account: due, part of her dues.
    sell(
        desk,
        'MEM-GUL-000006',
        [
            [5, 2],
            [8, 2]
        ],
        'cash',
        0,
        null,
        [3, '20:10']
    );
    const creatine = trf(GUL, mgrUtt, [[3, 2]], [2, '10:00'], 'Two members asked for creatine.');
    const approved = po(mgr, 'sup-2', [[8, 24, 80]], [2, '10:30']);
    sell(desk, null, [[8, 8]], 'card', 1104, 'POS-51502', [2, '18:00']);
    sell(deskUtt, null, [[9, 1]], 'bkash', 518, 'BK1A2B33C', [2, '19:00']);
    sell(desk, null, [[7, 6]], 'bkash', 189, 'BK2M5N88S', [1, '07:20']);
    decide(approved, true, [1, '10:00'], 'Approved. Ask for the weekly van, no delivery charge.');
    sendTransfer(
        db,
        emit,
        mgr,
        when(1, '11:00'),
        fresh(creatine),
        fresh(creatine).lines.map(l => ({ line_oid: l.oid, qty: l.qty_requested }))
    );
    trf(UTT, mgr, [[9, 3]], [1, '12:00']);
    po(
        mgr,
        'sup-3',
        [
            [11, 6, 560],
            [12, 5, 850]
        ],
        [1, '17:00'],
        'Gloves are low and the band sets are sold out.'
    );
    close(cancelTrf, 'cancelled', 'Ordered from SportsLine instead.', [1, '17:05']);
    sell(
        desk,
        null,
        [
            [10, 1],
            [7, 2]
        ],
        'cash',
        696,
        null,
        [0, '08:40']
    );
}
