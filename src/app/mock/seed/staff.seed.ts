import type { AppRule } from '@core/auth/ability';
import type { Branch, StaffRole } from '@core/models/branch.model';
import type { Trainer } from '@core/models/class.model';
import type { CurrentUser } from '@core/models/user.model';

import { toRef } from './organisation.seed';

export interface MockAccount {
    username: string;
    password: string;
    user: CurrentUser;
    /** Staff management (phase 1): a deactivated account cannot sign in. */
    status?: 'Active' | 'Inactive';
    created_at?: string;
    /** For trainers: their trainer row ("My classes"). */
    trainer_oid?: string;
}

/**
 * CASL rules per role, the same JSON the API sends (fitmanager-infra/db/migrations/002_branches_and_staff.sql, 004, 006, 007,
 * 018: change both together). One subject per screen or entity; a button is gated by the action IT performs.
 * Phase 3 (D-083): `manage Locker` sets lockers up, the desk's `create`/`update Locker` rents them; a trainer's
 * `update Trainer` and `update PtSession` are narrowed to their own profile and sessions (by the API, and here).
 */
/** The role rules of migration 020 (D-083, D-086, D-097): the full set per role, as the API sends them. */
export const ROLE_RULES: Record<StaffRole, AppRule[]> = {
    OWNER: [{ action: 'manage', subject: 'all' }],
    HQ_ADMIN: [
        {
            action: 'manage',
            subject: [
                'HqDashboard',
                'Branch',
                'PlanTemplate',
                'Plan',
                'Staff',
                'Settings',
                'Report',
                'ClassType',
                'Trainer',
                'Exercise',
                'Routine',
                'Policy',
                'Incident',
                'Complaint',
                'Product',
                'Supplier',
                'PurchaseOrder'
            ]
        },
        {
            action: 'read',
            subject: [
                'Dashboard',
                'Member',
                'Subscription',
                'Payment',
                'Invoice',
                'CashClosing',
                'Attendance',
                'Class',
                'Booking',
                'Room',
                'Locker',
                'PtSession',
                'Workout',
                'Measurement',
                'AuditLog',
                'Feedback',
                'Equipment',
                'Stock',
                'Transfer',
                'Sale'
            ]
        }
    ],
    BRANCH_MANAGER: [
        {
            action: 'manage',
            subject: [
                'Member',
                'Subscription',
                'Payment',
                'Invoice',
                'CashClosing',
                'Attendance',
                'AttendanceOverride',
                'Class',
                'Booking',
                'Staff',
                'Trainer',
                'Room',
                'Locker',
                'PtSession',
                'Exercise',
                'Routine',
                'Workout',
                'Measurement',
                'Incident',
                'Complaint',
                'Equipment',
                'Stock',
                'Transfer',
                'Sale'
            ]
        },
        { action: ['read', 'create', 'update'], subject: ['PurchaseOrder'] },
        // Exports (D-107, migration 022): `export Report`.
        { action: ['read', 'export'], subject: ['Report'] },
        { action: 'read', subject: ['Dashboard', 'Plan', 'AuditLog', 'Policy', 'Feedback', 'Product', 'Supplier'] }
    ],
    FRONT_DESK: [
        { action: ['read', 'create', 'update'], subject: ['Member', 'Attendance', 'Booking', 'Locker', 'PtSession', 'Measurement', 'Complaint'] },
        { action: ['read', 'create'], subject: ['Subscription', 'Payment', 'Incident', 'Equipment', 'Sale'] },
        {
            action: 'read',
            subject: ['Invoice', 'CashClosing', 'Plan', 'Class', 'Dashboard', 'Trainer', 'Room', 'Exercise', 'Routine', 'Workout', 'Policy', 'Product', 'Stock']
        }
    ],
    TRAINER: [
        { action: ['read', 'update'], subject: ['Class', 'Trainer'] },
        { action: ['read', 'create', 'update'], subject: ['Booking', 'PtSession', 'Exercise', 'Routine', 'Workout', 'Measurement'] },
        { action: ['read', 'create'], subject: ['Incident', 'Equipment'] },
        { action: 'read', subject: ['Member', 'Room', 'Policy', 'Feedback'] }
    ]
};

export const MEMBER_RULES: AppRule[] = [{ action: 'manage', subject: 'Portal' }];

/** Trainers: the landing page's four, plus local coaches, 4–5 per branch. The same as the API's seed (005_scheduling.sql). */
export function seedTrainers(): Trainer[] {
    const img = 'assets/images/landing';
    const rows: [string, string, string, 'Male' | 'Female', string[], string | null, string, string, string, [string, string, number][]][] = [
        [
            'tr-gul-1',
            'br-gul',
            'Sam Cole',
            'Male',
            ['Strength', 'Powerlifting'],
            `${img}/trainer-sam.webp`,
            '01711200101',
            'Strength and powerlifting coach',
            'Sam has coached lifters for ten years, from first squats to national meets. He builds simple plans and makes the basics count.',
            [['Certified Strength and Conditioning Specialist', 'NSCA', 2018]]
        ],
        [
            'tr-gul-2',
            'br-gul',
            'Tom Blake',
            'Male',
            ['Beginners', 'Mobility'],
            `${img}/trainer-tom.webp`,
            '01711200102',
            'Beginners and mobility',
            'Tom helps new members find their feet: good form, steady progress, and a body that moves well.',
            [['Personal Trainer Level 3', 'REPs', 2019]]
        ],
        [
            'tr-gul-3',
            'br-gul',
            'Tahmina Rahman',
            'Female',
            ['Yoga', 'Pilates', 'Ladies classes'],
            null,
            '01711200103',
            'Yoga, Pilates and ladies classes',
            'Tahmina teaches yoga and Pilates, and runs the ladies-only classes at Gulshan.',
            [['RYT 200', 'Yoga Alliance', 2020]]
        ],
        [
            'tr-gul-4',
            'br-gul',
            'Shakib Hasan',
            'Male',
            ['HIIT', 'Boxing'],
            null,
            '01711200104',
            'HIIT and boxing',
            'Shakib brings the energy to every HIIT and boxing class.',
            []
        ],
        [
            'tr-gul-5',
            'br-gul',
            'Nabila Islam',
            'Female',
            ['Zumba', 'Cardio'],
            null,
            '01711200105',
            'Zumba and cardio',
            "Nabila's Zumba classes are the busiest of the week.",
            [['Zumba Instructor', 'Zumba Fitness', 2021]]
        ],
        [
            'tr-dha-1',
            'br-dha',
            'Michael Harris',
            'Male',
            ['Hypertrophy', 'Body recomposition'],
            `${img}/trainer-michael.webp`,
            '01711200201',
            'Hypertrophy and body recomposition',
            'Michael plans training and eating around one goal: more muscle, less fat.',
            [['Certified Personal Trainer', 'NASM', 2017]]
        ],
        [
            'tr-dha-2',
            'br-dha',
            'Farhana Chowdhury',
            'Female',
            ['Yoga', 'Ladies classes'],
            null,
            '01711200202',
            'Yoga and ladies classes',
            'Farhana teaches yoga and the ladies-only classes at Dhanmondi.',
            []
        ],
        [
            'tr-dha-3',
            'br-dha',
            'Rakib Ahmed',
            'Male',
            ['Spin', 'Conditioning'],
            null,
            '01711200203',
            'Spin and conditioning',
            'Rakib runs the spin room and the conditioning classes.',
            []
        ],
        [
            'tr-dha-4',
            'br-dha',
            'Imran Khan',
            'Male',
            ['Strength', 'Boxing'],
            null,
            '01711200204',
            'Strength and boxing',
            'Imran coaches strength and boxing.',
            []
        ],
        [
            'tr-utt-1',
            'br-utt',
            'John Anderson',
            'Male',
            ['Fat loss', 'HIIT'],
            `${img}/trainer-john.webp`,
            '01711200301',
            'Fat loss and HIIT',
            "John's clients lose fat and keep it off, with HIIT and habits that last.",
            [['Certified Personal Trainer', 'ACE', 2016]]
        ],
        [
            'tr-utt-2',
            'br-utt',
            'Sanjida Akter',
            'Female',
            ['Zumba', 'Ladies classes'],
            null,
            '01711200302',
            'Zumba and ladies classes',
            'Sanjida teaches Zumba and the ladies-only classes at Uttara.',
            []
        ],
        ['tr-utt-3', 'br-utt', 'Mehedi Hasan', 'Male', ['Spin', 'Strength'], null, '01711200303', 'Spin and strength', 'Mehedi coaches spin and strength.', []],
        [
            'tr-utt-4',
            'br-utt',
            'Asif Mahmud',
            'Male',
            ['Mobility', 'Beginners'],
            null,
            '01711200304',
            'Mobility and beginners',
            'Asif helps beginners start well and older members keep moving.',
            []
        ]
    ];
    const names: Record<string, string> = { 'br-gul': 'Gulshan', 'br-dha': 'Dhanmondi', 'br-utt': 'Uttara' };
    return rows.map(([oid, branch, name, gender, specialties, photo, phone, headline, bio, certs]) => {
        const slug = name.toLowerCase().replace(/[^a-z]+/g, '-');
        return {
            oid,
            branch_oid: branch,
            branch_name: names[branch],
            name,
            gender,
            specialties,
            photo_url: photo,
            phone,
            slug,
            user_oid: `u-${oid === 'tr-gul-1' ? 'trainer.gulshan' : slug.replace('-', '.')}`,
            username: oid === 'tr-gul-1' ? 'trainer.gulshan' : slug.replace('-', '.'),
            headline,
            bio,
            certifications: certs.map(([n, issuer, year]) => ({ name: n, issuer, year })),
            photo_file_oid: null,
            public: true,
            active: true,
            can_sign_in: oid === 'tr-gul-1',
            clients: 0
        };
    });
}

/** The demo accounts (listed on /demo and on the sign-in page in mock builds). */
export function seedAccounts(branches: Branch[], demoMemberOid: string, demoMemberCode: string): MockAccount[] {
    const byCode = (code: string): Branch => branches.find(b => b.code === code)!;
    const hq = byCode('HQ');
    const staff = (username: string, password: string, name: string, roles: [Branch, StaffRole][], trainerOid?: string, allBranches = false): MockAccount => ({
        username,
        password,
        trainer_oid: trainerOid,
        user: {
            user_id: `u-${username}`,
            username,
            name,
            email: null,
            must_change_password: false,
            kind: 'staff',
            photo_url: null,
            rules: [],
            all_branches: allBranches,
            assignments: roles.map(([branch, role]) => ({ branch: toRef(branch), role, rules: ROLE_RULES[role] })),
            member: null
        }
    });
    const branchesOnly = branches.filter(b => b.kind === 'BRANCH');
    return [
        staff('owner', 'Owner@123', 'Kamrul Chowdhury', [[hq, 'OWNER'], ...branchesOnly.map((b): [Branch, StaffRole] => [b, 'OWNER'])], undefined, true),
        staff('admin.hq', 'Admin@123', 'Shirin Akhter', [[hq, 'HQ_ADMIN'], ...branchesOnly.map((b): [Branch, StaffRole] => [b, 'HQ_ADMIN'])], undefined, true),
        staff('manager.gulshan', 'Manager@123', 'Ashraf Siddique', [[byCode('GUL'), 'BRANCH_MANAGER']]),
        staff('desk.gulshan', 'Desk@123', 'Lamia Haque', [[byCode('GUL'), 'FRONT_DESK']]),
        staff('trainer.gulshan', 'Trainer@123', 'Sam Cole', [[byCode('GUL'), 'TRAINER']], 'tr-gul-1'),
        staff('manager.dhanmondi', 'Manager@123', 'Riyad Kabir', [[byCode('DHA'), 'BRANCH_MANAGER']]),
        staff('desk.dhanmondi', 'Desk@123', 'Mim Sarker', [[byCode('DHA'), 'FRONT_DESK']]),
        staff('manager.uttara', 'Manager@123', 'Zahid Alam', [[byCode('UTT'), 'BRANCH_MANAGER']]),
        // One person, two branches: front desk at Uttara, and at Dhanmondi too (branch switcher, X-Branch-Id).
        staff('desk.uttara', 'Desk@123', 'Tanjila Biswas', [
            [byCode('UTT'), 'FRONT_DESK'],
            [byCode('DHA'), 'FRONT_DESK']
        ]),
        {
            username: 'member.demo',
            password: 'Member@123',
            user: {
                user_id: 'u-member.demo',
                name: 'Rahim Uddin',
                kind: 'member',
                photo_url: null,
                rules: MEMBER_RULES,
                all_branches: false,
                assignments: [],
                member: { oid: demoMemberOid, code: demoMemberCode, branch: toRef(byCode('GUL')) }
            }
        }
    ];
}
