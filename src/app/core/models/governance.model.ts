/**
 * Governance: policies and their acceptance, discipline cases about members and staff, appeals,
 * complaints, NPS and ratings. The shapes of fitmanager-api src/features/policies, discipline and feedback.
 */

/* ---------- policies ---------- */

export type PolicyMode = 'accept_again' | 'wording_only';

export interface PolicyClause {
    oid: string;
    /** "3" or "3.2": what an incident cites. */
    number: string;
    heading: string;
    body: string;
}

export interface PolicyVersion {
    oid: string;
    policy_oid: string;
    version: number;
    mode: PolicyMode;
    change_note: string | null;
    published_on: string;
    published_by_name: string | null;
}

export interface Policy {
    oid: string;
    slug: string;
    title: string;
    summary: string | null;
    /** Members must accept the current "accept again" version (rule 6). */
    required: boolean;
    /** Shown at /policies/<slug>. */
    public: boolean;
    sort_order: number;
    active: boolean;
    updated_at: string;
    current: PolicyVersion & { clauses: PolicyClause[] };
    /** The newest "accept again" version: what members must have accepted. */
    required_version: number;
    versions?: PolicyVersion[];
}

/** `GET /v1/policies/:oid[?version=]`: `shown` is the version asked for (the current one by default). */
export interface PolicyDetail extends Policy {
    shown: PolicyVersion & { clauses: PolicyClause[] };
}

export interface ClauseInput {
    number?: string;
    heading: string;
    body: string;
}

export interface PolicyCreate {
    slug: string;
    title: string;
    summary?: string | null;
    required: boolean;
    public: boolean;
    sort_order?: number;
    clauses: ClauseInput[];
}

export type PolicyUpdate = Partial<Pick<Policy, 'title' | 'summary' | 'required' | 'public' | 'sort_order' | 'active'>>;

export interface VersionCreate {
    mode: PolicyMode;
    change_note?: string | null;
    clauses: ClauseInput[];
}

/** `GET /v1/policy-clauses`: the current clauses, for citing on an incident. */
export interface ClauseOption {
    oid: string;
    policy_title: string;
    version: number;
    number: string;
    heading: string;
    /** "Gym rules v2 §3: Respect for others". */
    label: string;
}

export type PolicyState = 'accepted' | 'due' | 'overdue' | 'optional';

/** `GET /v1/members/:oid/policies`, `GET /v1/me/policies`. */
export interface MemberPolicy {
    policy_oid: string;
    slug: string;
    title: string;
    summary: string | null;
    required: boolean;
    current_version: number;
    current_version_oid: string;
    required_version: number;
    change_note: string | null;
    accepted_version: number | null;
    accepted_at: string | null;
    method: 'portal' | 'paper' | null;
    recorded_by_name: string | null;
    state: PolicyState;
    /** The first day check-in is blocked without it, while due or overdue. */
    blocks_on: string | null;
}

/** `GET /v1/public/policies`. */
export interface PublicPolicySummary {
    slug: string;
    title: string;
    summary: string | null;
    version: number;
    published_on: string;
}

/** `GET /v1/public/policies/:slug`. */
export interface PublicPolicy {
    slug: string;
    title: string;
    summary: string | null;
    version: number;
    published_on: string;
    clauses: { number: string; heading: string; body: string }[];
    history: { version: number; mode: PolicyMode; change_note: string | null; published_on: string }[];
}

export const POLICY_STATE: Record<PolicyState, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
    accepted: { label: 'Accepted', tone: 'success' },
    due: { label: 'Due', tone: 'warning' },
    overdue: { label: 'Overdue', tone: 'danger' },
    optional: { label: 'Not required', tone: 'neutral' }
};

/* ---------- discipline ---------- */

export type SanctionLevel = 'verbal' | 'written' | 'suspension' | 'ban';
export const LADDER: SanctionLevel[] = ['verbal', 'written', 'suspension', 'ban'];
export const LEVEL_LABEL: Record<SanctionLevel, string> = { verbal: 'Verbal warning', written: 'Written warning', suspension: 'Suspension', ban: 'Ban' };
export type GiverRole = 'desk' | 'trainer' | 'manager' | 'hq';
export const GIVER_LABEL: Record<GiverRole, string> = { desk: 'Front desk', trainer: 'Trainer', manager: 'Branch manager', hq: 'HQ' };
export type SanctionState = 'recorded' | 'upcoming' | 'in_force' | 'ended' | 'lifted' | 'overturned';
export const SANCTION_STATE: Record<SanctionState, { label: string; tone: 'neutral' | 'info' | 'danger' | 'success' | 'warning' }> = {
    recorded: { label: 'Recorded', tone: 'neutral' },
    upcoming: { label: 'Starts later', tone: 'info' },
    in_force: { label: 'In force', tone: 'danger' },
    ended: { label: 'Ended', tone: 'neutral' },
    lifted: { label: 'Lifted', tone: 'success' },
    overturned: { label: 'Overturned', tone: 'success' }
};

export const INCIDENT_CATEGORIES = ['conduct', 'safety', 'equipment', 'hygiene', 'harassment', 'access', 'payment', 'attendance', 'other'] as const;
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];
export const INCIDENT_CATEGORY_LABEL: Record<IncidentCategory, string> = {
    conduct: 'Conduct',
    safety: 'Safety',
    equipment: 'Equipment misuse',
    hygiene: 'Hygiene',
    harassment: 'Harassment or threats',
    access: 'Card or access',
    payment: 'Payment or cash',
    attendance: 'Lateness or absence',
    other: 'Other'
};

export interface IncidentSubject {
    kind: 'member' | 'staff';
    member_oid: string | null;
    staff_oid: string | null;
    name: string;
    /** Member code, or the staff member's username. */
    code: string;
    /** A staff member's role at the branch. */
    role: string | null;
}

export interface IncidentListItem {
    oid: string;
    branch: { oid: string; name: string };
    subject: IncidentSubject;
    occurred_at: string;
    category: IncidentCategory;
    summary: string;
    clause_label: string | null;
    hq_only: boolean;
    reported_by_name: string | null;
    reported_role: GiverRole | null;
    closed: boolean;
    latest: { level: SanctionLevel; state: SanctionState } | null;
    steps: number;
    open_appeal: boolean;
    created_at: string;
}

export interface Appeal {
    oid: string;
    body: string;
    status: 'open' | 'upheld' | 'rejected';
    filed_at: string | null;
    filed_by_name: string | null;
    decided_by_name: string | null;
    decision_note: string | null;
    decided_at: string | null;
    can_decide: boolean;
}

export interface Sanction {
    oid: string;
    incident_oid: string;
    level: SanctionLevel;
    state: SanctionState;
    starts_on: string;
    ends_on: string | null;
    scope: 'branch' | 'all' | null;
    reason: string;
    suggested_level: SanctionLevel;
    choice_reason: string | null;
    given_by_name: string;
    given_role: GiverRole;
    given_on: string;
    branch_name: string;
    membership_cancelled: boolean;
    lifted: { at: string | null; by: string | null; reason: string | null } | null;
    overturned_at: string | null;
    appeal: Appeal | null;
    appeal_deadline: string;
    can_lift: boolean;
}

export interface IncidentDetail extends IncidentListItem {
    description: string;
    witnesses: string | null;
    internal_notes: string | null;
    evidence: { oid: string; name: string; content_type: string; url: string }[];
    sanctions: Sanction[];
    /** The person's strikes in the last 12 months, everywhere. */
    strikes: { level: SanctionLevel; starts_on: string; branch_name: string }[];
    suggestion: SanctionLevel;
    actions: { levels: SanctionLevel[]; ban_scopes: ('branch' | 'all')[]; can_edit: boolean };
}

/** `POST /v1/incidents`: a case about a member reported at a branch other than HQ's answer's `sent_to_hq`. */
export type IncidentCreated = IncidentDetail | { oid: string; hq_only: true; sent_to_hq: true };

export interface IncidentInput {
    branch_oid?: string;
    subject_kind: 'member' | 'staff';
    member_code?: string;
    staff_oid?: string;
    occurred_at: string;
    category: IncidentCategory;
    summary: string;
    description: string;
    clause_oid?: string | null;
    witnesses?: string | null;
    internal_notes?: string | null;
    evidence_file_oids?: string[];
}

export interface SanctionInput {
    level: SanctionLevel;
    reason: string;
    choice_reason?: string | null;
    starts_on?: string;
    ends_on?: string;
    scope?: 'branch' | 'all';
}

export interface StaffSubject {
    oid: string;
    name: string;
    username: string;
    role: 'BRANCH_MANAGER' | 'FRONT_DESK' | 'TRAINER';
}

/** `GET /v1/members/:oid/discipline`. */
export interface MemberDiscipline {
    incidents: IncidentListItem[];
    sanctions: Sanction[];
    strikes: number;
    suggestion: SanctionLevel;
}

/** What the person sees of their own sanction: `GET /v1/me/record`, `GET /v1/my-record`. */
export interface OwnSanction {
    oid: string;
    level: SanctionLevel;
    state: SanctionState;
    starts_on: string;
    ends_on: string | null;
    scope: 'branch' | 'all' | null;
    branch_name: string;
    reason: string;
    clause_label: string | null;
    given_on: string;
    appeal: { status: Appeal['status']; body: string; filed_at: string | null; decision_note: string | null; decided_at: string | null } | null;
    appeal_deadline: string;
    can_appeal: boolean;
}

/* ---------- complaints ---------- */

export const COMPLAINT_CATEGORIES = ['facilities', 'equipment', 'cleanliness', 'staff', 'billing', 'classes', 'other'] as const;
export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number];
export const COMPLAINT_CATEGORY_LABEL: Record<ComplaintCategory, string> = {
    facilities: 'Facilities',
    equipment: 'Equipment',
    cleanliness: 'Cleanliness',
    staff: 'Staff',
    billing: 'Billing',
    classes: 'Classes',
    other: 'Other'
};
export type ComplaintStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export const COMPLAINT_STATUS: Record<ComplaintStatus, { label: string; tone: 'info' | 'warning' | 'success' | 'neutral' }> = {
    open: { label: 'Open', tone: 'info' },
    in_progress: { label: 'In progress', tone: 'warning' },
    resolved: { label: 'Resolved', tone: 'success' },
    closed: { label: 'Closed', tone: 'neutral' }
};

export interface ComplaintUpdate {
    oid: string;
    author: 'staff' | 'member';
    author_name: string;
    body: string;
    status: ComplaintStatus | null;
    at: string;
}

export interface Complaint {
    oid: string;
    code: string;
    branch: { oid: string; name: string };
    member_oid: string | null;
    member_code: string | null;
    member_name: string;
    category: ComplaintCategory;
    subject: string;
    body: string;
    photo_url: string | null;
    named_staff_name: string | null;
    hq_only: boolean;
    filed_via: 'portal' | 'desk';
    status: ComplaintStatus;
    overdue: boolean;
    due_at: string;
    first_response_at: string | null;
    resolution: string | null;
    resolved_at: string | null;
    escalated: { at: string; by: 'manager' | 'member' | null; reason: string | null } | null;
    member_accepted_at: string | null;
    closes_at: string | null;
    can_respond: boolean;
    created_at: string;
    updates?: ComplaintUpdate[];
}

export interface ComplaintInput {
    category: ComplaintCategory;
    subject: string;
    body: string;
    photo_file_oid?: string | null;
    named_staff_oid?: string | null;
    member_oid?: string | null;
    member_name?: string | null;
}

/* ---------- NPS and ratings ---------- */

export interface Rateable {
    kind: 'class' | 'pt';
    booking_oid: string | null;
    pt_session_oid: string | null;
    label: string;
    trainer_oid: string | null;
    trainer_name: string | null;
    at: string;
    /** The last day it can be rated. */
    until: string;
}

/** `GET /v1/me/feedback`. */
export interface MyFeedback {
    nps_due: boolean;
    rateable: Rateable[];
    ratings: { oid: string; kind: 'class' | 'pt'; label: string; trainer_name: string | null; session_at: string; score: number; comment: string | null }[];
}

export interface TrainerAverage {
    trainer_oid: string;
    trainer_name: string;
    class_avg: number | null;
    class_count: number;
    pt_avg: number | null;
    pt_count: number;
}

/** `GET /v1/feedback`: managers and HQ get everything; a trainer only `trainer`. */
export interface FeedbackReport {
    days: number;
    trainer?: TrainerAverage | null;
    nps?: { score: number | null; responses: number; promoters: number; passives: number; detractors: number; dismissed: number };
    answers?: { oid: string; branch_name: string; member_code: string; member_name: string; score: number; comment: string | null; created_at: string }[];
    ratings?: {
        oid: string;
        branch_name: string;
        member_name: string;
        kind: 'class' | 'pt';
        label: string;
        trainer_name: string | null;
        session_at: string;
        score: number;
        comment: string | null;
    }[];
    trainers?: TrainerAverage[];
}
