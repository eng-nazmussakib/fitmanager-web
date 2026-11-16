import { type AccessClock, type AccessFacts, daysBetween, evaluateAccess } from './access-rules';

/** Table-driven: each case is one rule outcome. Reused as the API's test cases in phase 2. */
const BRANCH = {
    oid: 'b-gul',
    dues_limit: 1000,
    hours: [
        { days: [0, 1, 2, 3, 4, 6], open: '07:00', close: '23:00' },
        { days: [5], open: '16:00', close: '21:00' }
    ]
};
const NOW: AccessClock = { date: '2026-11-15', time: '18:00', weekday: 0 };

function facts(over: Omit<Partial<AccessFacts>, 'member'> & { member?: Partial<AccessFacts['member']> } = {}): AccessFacts {
    return {
        member: { branch_oid: 'b-gul', branch_name: 'Gulshan', status: 'Active', dues: 0, ...over.member },
        subscription: over.subscription === undefined ? { start_date: '2026-11-01', end_date: '2026-11-30', freezes: [] } : over.subscription,
        branch: over.branch ?? BRANCH,
        open_check_in: over.open_check_in ?? null
    };
}

describe('access rules', () => {
    const cases: [string, AccessFacts, AccessClock, string[], boolean[]][] = [
        ['allowed: active, no dues, open hours', facts(), NOW, [], []],
        [
            'expired 3 days ago',
            facts({ subscription: { start_date: '2026-10-13', end_date: '2026-11-12', freezes: [] }, member: { status: 'Expired' } }),
            NOW,
            ['expired'],
            [true]
        ],
        [
            'frozen today',
            facts({
                member: { status: 'Frozen' },
                subscription: { start_date: '2026-11-01', end_date: '2026-12-30', freezes: [{ from: '2026-11-10', to: '2026-11-20' }] }
            }),
            NOW,
            ['frozen'],
            [true]
        ],
        ['suspended', facts({ member: { status: 'Suspended' } }), NOW, ['suspended'], [true]],
        ['dues over the limit', facts({ member: { dues: 2500 } }), NOW, ['dues'], [true]],
        ['dues at the limit are fine', facts({ member: { dues: 1000 } }), NOW, [], []],
        ['before opening', facts(), { ...NOW, time: '06:30' }, ['hours'], [true]],
        ['Friday morning (opens 16:00)', facts(), { date: '2026-11-20', time: '10:00', weekday: 5 }, ['hours'], [true]],
        ['after closing', facts(), { ...NOW, time: '23:10' }, ['hours'], [true]],
        ['already inside', facts({ open_check_in: '17:05' }), NOW, ['already_in'], [false]],
        ['another branch', facts({ member: { branch_oid: 'b-dha', branch_name: 'Dhanmondi' } }), NOW, ['branch'], [false]],
        ['join request without payment', facts({ member: { status: 'Pending' }, subscription: null }), NOW, ['pending'], [false]],
        ['no membership', facts({ subscription: null, member: { status: 'Expired' } }), NOW, ['membership'], [false]],
        ['starts in the future', facts({ subscription: { start_date: '2026-11-20', end_date: '2026-12-19', freezes: [] } }), NOW, ['membership'], [true]],
        [
            'several failures at once',
            facts({ member: { status: 'Suspended', dues: 5000 }, subscription: { start_date: '2026-09-01', end_date: '2026-10-31', freezes: [] } }),
            NOW,
            ['suspended', 'expired', 'dues'],
            [true, true, true]
        ]
    ];

    it.each(cases)('%s', (_name, input, now, rules, overridable) => {
        const result = evaluateAccess(input, now);
        expect(result.map(f => f.rule)).toEqual(rules);
        expect(result.map(f => f.overridable)).toEqual(overridable);
    });

    it('says how long ago a subscription expired, with the taka amounts in lakh grouping', () => {
        const [expired] = evaluateAccess(facts({ subscription: { start_date: '2026-10-13', end_date: '2026-11-12', freezes: [] } }), NOW);
        expect(expired.message).toBe('Subscription expired 3 days ago (12 Nov 2026).');
        const [dues] = evaluateAccess(facts({ member: { dues: 125000 } }), NOW);
        expect(dues.message).toBe('Dues ৳1,25,000 exceed the limit of ৳1,000.');
    });

    it('counts days across months and years', () => {
        expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
        expect(daysBetween('2026-11-15', '2026-11-15')).toBe(0);
    });
});
