import { createMongoAbility, type MongoAbility, type RawRuleOf } from '@casl/ability';

/**
 * Authorization vocabulary, with CASL (`@casl/ability`) as the engine. The IB portals use the same stack.
 *
 * A permission is an (action, subject) pair, not a free string like 'item:create'.
 * Both are closed unions, so `can('aprove', 'Member')` or `*appCan="'read'; on: 'Membr'"` is a COMPILE error.
 * IB learned this the hard way: a free-string subject that matched nothing silently removed a Save button
 * for every user, four times, before the subject was typed.
 *
 * Rules:
 * - One subject per screen/entity, never per menu group. Keying on a group let a user who was granted one
 *   screen reach its siblings by URL (IB).
 * - A button is gated by the action IT performs, not by the workflow it belongs to.
 * - The UI check is a convenience. The backend must still authorise every call.
 */

/** `manage` is CASL's wildcard: it matches every action. */
export type Action = 'manage' | 'read' | 'create' | 'update' | 'delete' | 'export';

/**
 * `all` is CASL's wildcard: it matches every subject. One entry per screen or entity; the API's list must match
 * (fitmanager-api `src/auth/ability.ts`).
 * - Branch console: Dashboard, Member, Subscription, Payment, Invoice, CashClosing, Attendance,
 *   AttendanceOverride (letting someone in although a rule blocks them), Class, Booking, Plan, Trainer, Report.
 * - HQ: HqDashboard, Branch, PlanTemplate, Staff, Settings.
 * - Member portal: Portal.
 */
export type Subject =
    | 'Dashboard'
    | 'Member'
    | 'Subscription'
    | 'Payment'
    | 'Invoice'
    | 'CashClosing'
    | 'Attendance'
    | 'AttendanceOverride'
    | 'Class'
    | 'Booking'
    | 'Plan'
    | 'Trainer'
    | 'Report'
    | 'HqDashboard'
    | 'Branch'
    | 'PlanTemplate'
    | 'Staff'
    | 'Settings'
    | 'Portal'
    | 'all';

export type AppAbility = MongoAbility<[Action, Subject]>;

/**
 * One rule as the backend sends it, e.g. `{ action: 'read', subject: ['Member', 'Plan'] }`.
 * CASL rules are plain JSON, so the profile endpoint can return them as-is.
 * If your backend sends strings ('item:read') or a menu tree (IB's menuJson), map them to rules in ONE place
 * (AuthService) and keep the rest of the app on `can(action, subject)`.
 */
export type AppRule = RawRuleOf<AppAbility>;

/** No rules → nothing is allowed. Fail-closed by construction. */
export function createAppAbility(rules: AppRule[] = []): AppAbility {
    return createMongoAbility<AppAbility>(rules);
}
