import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiService } from '@core/http/api.service';
import type {
    ClauseOption,
    Complaint,
    ComplaintInput,
    FeedbackReport,
    IncidentCreated,
    IncidentDetail,
    IncidentInput,
    IncidentListItem,
    MemberDiscipline,
    MemberPolicy,
    MyFeedback,
    OwnSanction,
    Policy,
    PolicyCreate,
    PolicyDetail,
    PolicyUpdate,
    SanctionInput,
    StaffSubject,
    VersionCreate
} from '@core/models/governance.model';

/**
 * The phase 5 calls (D-090 to D-097): policies, discipline, complaints, NPS and ratings, for the consoles (the branch or
 * HQ in `X-Branch-Id`) and the member portal (`/v1/me/*`).
 */
@Injectable({ providedIn: 'root' })
export class GovernanceService {
    private readonly _api = inject(ApiService);

    /* ---------- policies ---------- */

    policies(all = false): Observable<Policy[]> {
        return this._api.get<Policy[]>('/v1/policies', all ? { all: '1' } : undefined);
    }

    policy(oid: string, version?: number): Observable<PolicyDetail> {
        return this._api.get<PolicyDetail>(`/v1/policies/${oid}`, version ? { version: String(version) } : undefined);
    }

    clauses(): Observable<ClauseOption[]> {
        return this._api.get<ClauseOption[]>('/v1/policy-clauses');
    }

    createPolicy(body: PolicyCreate): Observable<Policy> {
        return this._api.post<Policy>('/v1/hq/policies', body);
    }

    updatePolicy(oid: string, body: PolicyUpdate): Observable<Policy> {
        return this._api.patch<Policy>(`/v1/hq/policies/${oid}`, body);
    }

    publishVersion(oid: string, body: VersionCreate): Observable<Policy> {
        return this._api.post<Policy>(`/v1/hq/policies/${oid}/versions`, body);
    }

    memberPolicies(memberOid: string): Observable<MemberPolicy[]> {
        return this._api.get<MemberPolicy[]>(memberOid === 'me' ? '/v1/me/policies' : `/v1/members/${memberOid}/policies`);
    }

    /** The desk records "signed on paper": these policies, or every one not accepted yet. */
    signOnPaper(memberOid: string, policyOids?: string[]): Observable<{ recorded: number; policies: MemberPolicy[] }> {
        return this._api.post<{ recorded: number; policies: MemberPolicy[] }>(
            `/v1/members/${memberOid}/policies/accept`,
            policyOids ? { policy_oids: policyOids } : {}
        );
    }

    /** The member portal: a policy's current wording, to read before accepting. */
    memberPolicyText(oid: string): Observable<PolicyDetail> {
        return this._api.get<PolicyDetail>(`/v1/me/policies/${oid}`);
    }

    /** The member accepts the version they read, in the portal. */
    acceptInPortal(versionOid: string): Observable<MemberPolicy[]> {
        return this._api.post<MemberPolicy[]>('/v1/me/policies/accept', { version_oid: versionOid });
    }

    /* ---------- discipline ---------- */

    incidents(filters: { status?: string; kind?: string; appeal?: string; q?: string } = {}): Observable<IncidentListItem[]> {
        const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) as Record<string, string>;
        return this._api.get<IncidentListItem[]>('/v1/incidents', params);
    }

    incident(oid: string): Observable<IncidentDetail> {
        return this._api.get<IncidentDetail>(`/v1/incidents/${oid}`);
    }

    staffSubjects(branchOid?: string): Observable<StaffSubject[]> {
        return this._api.get<StaffSubject[]>('/v1/incidents/staff', branchOid ? { branch_oid: branchOid } : undefined);
    }

    recordIncident(body: IncidentInput): Observable<IncidentCreated> {
        return this._api.post<IncidentCreated>('/v1/incidents', body);
    }

    updateIncident(
        oid: string,
        body: { witnesses?: string | null; internal_notes?: string | null; evidence_file_oids?: string[]; closed?: boolean }
    ): Observable<IncidentDetail> {
        return this._api.patch<IncidentDetail>(`/v1/incidents/${oid}`, body);
    }

    giveStep(oid: string, body: SanctionInput): Observable<IncidentDetail> {
        return this._api.post<IncidentDetail>(`/v1/incidents/${oid}/sanctions`, body);
    }

    liftBan(sanctionOid: string, reason: string): Observable<IncidentDetail> {
        return this._api.post<IncidentDetail>(`/v1/sanctions/${sanctionOid}/lift`, { reason });
    }

    decideAppeal(appealOid: string, decision: 'upheld' | 'rejected', note: string): Observable<IncidentDetail> {
        return this._api.post<IncidentDetail>(`/v1/appeals/${appealOid}/decide`, { decision, note });
    }

    memberDiscipline(memberOid: string): Observable<MemberDiscipline> {
        return this._api.get<MemberDiscipline>(`/v1/members/${memberOid}/discipline`);
    }

    /** The person's own sanctions: staff (`/v1/my-record`) or the member portal (`/v1/me/record`). */
    ownRecord(portal: boolean): Observable<OwnSanction[]> {
        return this._api.get<OwnSanction[]>(portal ? '/v1/me/record' : '/v1/my-record');
    }

    appeal(portal: boolean, sanctionOid: string, body: string): Observable<OwnSanction> {
        return this._api.post<OwnSanction>(`${portal ? '/v1/me/record' : '/v1/my-record'}/${sanctionOid}/appeal`, { body });
    }

    /* ---------- complaints ---------- */

    complaints(filters: { status?: string; overdue?: boolean; escalated?: boolean } = {}): Observable<Complaint[]> {
        const params: Record<string, string> = {};
        if (filters.status) params['status'] = filters.status;
        if (filters.overdue) params['overdue'] = '1';
        if (filters.escalated) params['escalated'] = '1';
        return this._api.get<Complaint[]>('/v1/complaints', params);
    }

    complaint(oid: string): Observable<Complaint> {
        return this._api.get<Complaint>(`/v1/complaints/${oid}`);
    }

    fileComplaint(body: ComplaintInput, portal = false): Observable<Complaint | { oid: string; sent_to_hq: true }> {
        return this._api.post<Complaint | { oid: string; sent_to_hq: true }>(portal ? '/v1/me/complaints' : '/v1/complaints', body);
    }

    replyComplaint(oid: string, body: string, status?: 'in_progress' | 'resolved'): Observable<Complaint> {
        return this._api.post<Complaint>(`/v1/complaints/${oid}/updates`, status ? { body, status } : { body });
    }

    escalateComplaint(oid: string, reason: string): Observable<Complaint> {
        return this._api.post<Complaint>(`/v1/complaints/${oid}/escalate`, { reason });
    }

    myComplaints(): Observable<Complaint[]> {
        return this._api.get<Complaint[]>('/v1/me/complaints');
    }

    complaintStaff(): Observable<{ oid: string; name: string; role: string }[]> {
        return this._api.get<{ oid: string; name: string; role: string }[]>('/v1/me/complaints/staff');
    }

    memberComplaintAction(oid: string, action: 'reply' | 'accept' | 'escalate', text?: string): Observable<Complaint> {
        const body = action === 'reply' ? { body: text } : action === 'escalate' ? { reason: text } : {};
        return this._api.post<Complaint>(`/v1/me/complaints/${oid}/${action}`, body);
    }

    /* ---------- NPS and ratings ---------- */

    feedback(days = 90): Observable<FeedbackReport> {
        return this._api.get<FeedbackReport>('/v1/feedback', { days: String(days) });
    }

    myFeedback(): Observable<MyFeedback> {
        return this._api.get<MyFeedback>('/v1/me/feedback');
    }

    answerNps(score: number | null, comment: string | null): Observable<{ nps_due: false }> {
        return this._api.post<{ nps_due: false }>('/v1/me/nps', score === null ? { score: null } : { score, comment });
    }

    rate(target: { booking_oid: string | null; pt_session_oid: string | null }, score: number, comment: string | null): Observable<MyFeedback> {
        const key = target.booking_oid ? { booking_oid: target.booking_oid } : { pt_session_oid: target.pt_session_oid };
        return this._api.post<MyFeedback>('/v1/me/ratings', { ...key, score, comment });
    }
}
