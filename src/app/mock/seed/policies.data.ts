/**
 * HQ's demo policies (D-090), the same as fitmanager-infra/db/seeds/demo/007_policies.sql (generated from it: keep them in step).
 */
export const POLICY_SEED: { slug: string; title: string; summary: string; required: boolean; public: boolean; sort_order: number }[] = [
    {
        slug: 'gym-rules',
        title: 'Gym rules',
        summary: 'House rules at every branch: the floor, equipment, ladies hour and conduct.',
        required: true,
        public: true,
        sort_order: 1
    },
    {
        slug: 'membership-terms',
        title: 'Membership terms',
        summary: 'Plans, payment, renewal, freezes, branch transfer and cancellation.',
        required: true,
        public: true,
        sort_order: 2
    },
    {
        slug: 'refund-policy',
        title: 'Refund policy',
        summary: 'When a plan can be refunded, and how.',
        required: true,
        public: true,
        sort_order: 3
    },
    {
        slug: 'privacy-policy',
        title: 'Privacy policy',
        summary: 'What we keep about members and visitors, and how it is used.',
        required: true,
        public: true,
        sort_order: 4
    },
    {
        slug: 'liability-waiver',
        title: 'Liability waiver',
        summary: 'Training is at your own risk; tell us about any health condition.',
        required: true,
        public: false,
        sort_order: 5
    }
];

export const POLICY_VERSION_SEED: { slug: string; version: number; mode: 'accept_again' | 'wording_only'; change_note: string | null; published_on: string }[] =
    [
        {
            slug: 'gym-rules',
            version: 1,
            mode: 'accept_again',
            change_note: null,
            published_on: '2026-01-01'
        },
        {
            slug: 'membership-terms',
            version: 1,
            mode: 'accept_again',
            change_note: null,
            published_on: '2026-01-01'
        },
        {
            slug: 'refund-policy',
            version: 1,
            mode: 'accept_again',
            change_note: null,
            published_on: '2026-01-01'
        },
        {
            slug: 'refund-policy',
            version: 2,
            mode: 'wording_only',
            change_note: 'Clearer wording on refunds at the branch that sold the plan; no change to the rules.',
            published_on: '2026-06-01'
        },
        {
            slug: 'privacy-policy',
            version: 1,
            mode: 'accept_again',
            change_note: null,
            published_on: '2026-01-01'
        },
        {
            slug: 'liability-waiver',
            version: 1,
            mode: 'accept_again',
            change_note: null,
            published_on: '2026-01-01'
        }
    ];

export const POLICY_CLAUSE_SEED: { slug: string; version: number; number: string; heading: string; body: string }[] = [
    {
        slug: 'gym-rules',
        version: 1,
        number: '1',
        heading: 'Clothing and shoes',
        body: 'Wear clean indoor shoes and gym clothes on the floor. No outdoor shoes, sandals or bare feet.'
    },
    {
        slug: 'gym-rules',
        version: 1,
        number: '2',
        heading: 'Equipment',
        body: 'Wipe equipment after use, put weights back on the rack and share machines between sets at busy times.'
    },
    {
        slug: 'gym-rules',
        version: 1,
        number: '3',
        heading: 'Respect for others',
        body: 'Treat members and staff with respect. Abusive, threatening or discriminatory language or behaviour is not allowed.'
    },
    {
        slug: 'gym-rules',
        version: 1,
        number: '4',
        heading: 'Safety',
        body: 'Use equipment only as intended and ask a trainer when unsure. Do not drop weights except on the lifting platform.'
    },
    {
        slug: 'gym-rules',
        version: 1,
        number: '5',
        heading: 'Ladies hour',
        body: 'During ladies hour the gym floor is for women only, with women trainers on duty.'
    },
    {
        slug: 'gym-rules',
        version: 1,
        number: '6',
        heading: 'Your member card',
        body: 'Check in with your own member card on every visit. A card cannot be lent to anyone else.'
    },
    {
        slug: 'gym-rules',
        version: 1,
        number: '7',
        heading: 'Photos and filming',
        body: 'Do not photograph or film other members without their permission.'
    },
    {
        slug: 'membership-terms',
        version: 1,
        number: '1',
        heading: 'Your membership',
        body: 'A membership belongs to one member and one home branch. It cannot be shared or passed on.'
    },
    {
        slug: 'membership-terms',
        version: 1,
        number: '2',
        heading: 'Payment',
        body: 'Plans are paid in advance at the front desk, by cash, card or mobile banking. A plan does not renew by itself.'
    },
    {
        slug: 'membership-terms',
        version: 1,
        number: '3',
        heading: 'Freezes',
        body: 'Plans that allow it can be frozen for travel, illness or injury; the end date moves by the frozen days.'
    },
    {
        slug: 'membership-terms',
        version: 1,
        number: '4',
        heading: 'Changing branch',
        body: 'A membership can move to another branch with no dues outstanding. Ask the front desk.'
    },
    {
        slug: 'membership-terms',
        version: 1,
        number: '5',
        heading: 'Suspension and bans',
        body: 'The branch may suspend or end a membership for breaking the gym rules. A suspension does not extend the plan.'
    },
    {
        slug: 'refund-policy',
        version: 1,
        number: '1',
        heading: 'Within 3 days',
        body: 'A plan can be refunded in full within 3 days of payment if it has not been used.'
    },
    {
        slug: 'refund-policy',
        version: 1,
        number: '2',
        heading: 'After that',
        body: 'After 3 days plans are not refundable, but a freeze or a branch transfer may help.'
    },
    {
        slug: 'refund-policy',
        version: 2,
        number: '1',
        heading: 'Within 3 days',
        body: 'A plan can be refunded in full within 3 days of payment if it has not been used, at the branch that sold it.'
    },
    {
        slug: 'refund-policy',
        version: 2,
        number: '2',
        heading: 'After that',
        body: 'After 3 days plans are not refundable. A freeze or a branch transfer may help instead.'
    },
    {
        slug: 'refund-policy',
        version: 2,
        number: '3',
        heading: 'How it is paid',
        body: 'A refund is paid back the way the plan was paid, and a receipt is given.'
    },
    {
        slug: 'privacy-policy',
        version: 1,
        number: '1',
        heading: 'What we keep',
        body: 'Your name, phone number, email, plan, payments, visits and a photo for your member card.'
    },
    {
        slug: 'privacy-policy',
        version: 1,
        number: '2',
        heading: 'How we use it',
        body: 'To run your membership: check-ins, renewals, receipts and reminders. We do not sell your data.'
    },
    {
        slug: 'privacy-policy',
        version: 1,
        number: '3',
        heading: 'Who sees it',
        body: 'The staff of your home branch and head office. Another branch sees only what a check-in needs.'
    },
    {
        slug: 'privacy-policy',
        version: 1,
        number: '4',
        heading: 'Your choices',
        body: 'Ask the front desk to see, correct or delete your data.'
    },
    {
        slug: 'liability-waiver',
        version: 1,
        number: '1',
        heading: 'Your own risk',
        body: "You train at your own risk and follow the trainers' guidance on technique and loads."
    },
    {
        slug: 'liability-waiver',
        version: 1,
        number: '2',
        heading: 'Your health',
        body: 'You have told us about any health condition that affects training, and will tell us of any change.'
    },
    {
        slug: 'liability-waiver',
        version: 1,
        number: '3',
        heading: 'Belongings',
        body: 'Keep valuables in a locker. The gym is not responsible for items left on the floor or in the changing rooms.'
    }
];
