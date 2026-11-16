import type { AppRule } from '@core/auth/ability';
import type { Branch, StaffRole } from '@core/models/branch.model';
import type { Trainer } from '@core/models/class.model';
import type { CurrentUser } from '@core/models/user.model';

import { toRef } from './organisation.seed';

export interface MockAccount {
    username: string;
    password: string;
    user: CurrentUser;
    /** For trainers: their trainer row ("My classes"). */
    trainer_oid?: string;
}

/**
 * CASL rules per role, the same JSON the API sends (fitmanager-infra/db/migrations/002_branches_and_staff.sql:
 * change both together). One subject per screen or entity;
 * a button is gated by the action IT performs.
 */
export const ROLE_RULES: Record<StaffRole, AppRule[]> = {
    OWNER: [{ action: 'manage', subject: 'all' }],
    HQ_ADMIN: [
        // Only HQ changes the plans a branch sells (D-044): HQ_ADMIN manages Plan; branch roles only read it.
        { action: 'manage', subject: ['HqDashboard', 'Branch', 'PlanTemplate', 'Plan', 'Staff', 'Settings', 'Report'] },
        { action: 'read', subject: ['Dashboard', 'Member', 'Subscription', 'Payment', 'Invoice', 'CashClosing', 'Attendance', 'Class', 'Trainer'] }
    ],
    BRANCH_MANAGER: [
        { action: 'manage', subject: ['Member', 'Subscription', 'Payment', 'Invoice', 'CashClosing', 'Attendance', 'AttendanceOverride', 'Class', 'Booking'] },
        { action: 'read', subject: ['Dashboard', 'Plan', 'Trainer', 'Report'] }
    ],
    FRONT_DESK: [
        { action: ['read', 'create', 'update'], subject: ['Member', 'Attendance'] },
        { action: ['read', 'create'], subject: ['Subscription', 'Payment', 'Booking'] },
        { action: 'read', subject: ['Invoice', 'CashClosing', 'Plan', 'Class', 'Dashboard', 'Trainer'] }
    ],
    TRAINER: [
        { action: ['read', 'update'], subject: 'Class' },
        { action: ['read', 'create', 'update'], subject: 'Booking' },
        { action: 'read', subject: ['Member', 'Trainer'] }
    ]
};

export const MEMBER_RULES: AppRule[] = [{ action: 'manage', subject: 'Portal' }];

/** Trainers: the landing page's four, plus local coaches, 4–5 per branch. */
export function seedTrainers(): Trainer[] {
    const t = (oid: string, branch: string, name: string, gender: 'Male' | 'Female', specialties: string[], photo: string | null, phone: string): Trainer => ({
        oid,
        branch_oid: branch,
        name,
        gender,
        specialties,
        photo_url: photo,
        phone
    });
    const img = 'assets/images/landing';
    return [
        t('tr-gul-1', 'br-gul', 'Sam Cole', 'Male', ['Strength', 'Powerlifting'], `${img}/trainer-sam.webp`, '01711200101'),
        t('tr-gul-2', 'br-gul', 'Tom Blake', 'Male', ['Beginners', 'Mobility'], `${img}/trainer-tom.webp`, '01711200102'),
        t('tr-gul-3', 'br-gul', 'Tahmina Rahman', 'Female', ['Yoga', 'Pilates', 'Ladies classes'], null, '01711200103'),
        t('tr-gul-4', 'br-gul', 'Shakib Hasan', 'Male', ['HIIT', 'Boxing'], null, '01711200104'),
        t('tr-gul-5', 'br-gul', 'Nabila Islam', 'Female', ['Zumba', 'Cardio'], null, '01711200105'),
        t('tr-dha-1', 'br-dha', 'Michael Harris', 'Male', ['Hypertrophy', 'Body recomposition'], `${img}/trainer-michael.webp`, '01711200201'),
        t('tr-dha-2', 'br-dha', 'Farhana Chowdhury', 'Female', ['Yoga', 'Ladies classes'], null, '01711200202'),
        t('tr-dha-3', 'br-dha', 'Rakib Ahmed', 'Male', ['Spin', 'Conditioning'], null, '01711200203'),
        t('tr-dha-4', 'br-dha', 'Imran Khan', 'Male', ['Strength', 'Boxing'], null, '01711200204'),
        t('tr-utt-1', 'br-utt', 'John Anderson', 'Male', ['Fat loss', 'HIIT'], `${img}/trainer-john.webp`, '01711200301'),
        t('tr-utt-2', 'br-utt', 'Sanjida Akter', 'Female', ['Zumba', 'Ladies classes'], null, '01711200302'),
        t('tr-utt-3', 'br-utt', 'Mehedi Hasan', 'Male', ['Spin', 'Strength'], null, '01711200303'),
        t('tr-utt-4', 'br-utt', 'Asif Mahmud', 'Male', ['Mobility', 'Beginners'], null, '01711200304')
    ];
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
            name,
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
