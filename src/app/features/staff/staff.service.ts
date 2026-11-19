import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { API } from '@core/constants/api-endpoints';
import { ApiService } from '@core/http/api.service';
import type { StaffRole } from '@core/models/branch.model';
import type { AuditPage, StaffAssignmentInput, StaffList, StaffMember } from '@core/models/staff.model';

export type StaffLevel = 'hq' | 'branch';

export interface StaffFilter {
    q?: string;
    role?: StaffRole | '';
    status?: 'Active' | 'Inactive' | '';
    branch_oid?: string;
}

export interface NewStaff {
    username: string;
    name: string;
    email: string | null;
    password: string;
}

/**
 * The staff API (D-054, D-055) at either level: `/v1/hq/staff` in the HQ console, `/v1/branch/staff` in a branch
 * console (`X-Branch-Id` comes from the URL, branch-header interceptor). Messages are toasted by notifyInterceptor.
 */
@Injectable({ providedIn: 'root' })
export class StaffService {
    private readonly _api = inject(ApiService);

    list(level: StaffLevel, filter: StaffFilter): Observable<StaffList> {
        return this._api.get<StaffList>(this._base(level), { ...filter });
    }

    createAtHq(body: NewStaff & { assignments: StaffAssignmentInput[]; all_branches: boolean }): Observable<StaffMember> {
        return this._api.post<StaffMember>(API.STAFF.HQ, body);
    }

    createAtBranch(body: NewStaff & { role: StaffRole }): Observable<StaffMember> {
        return this._api.post<StaffMember>(API.STAFF.BRANCH, body);
    }

    updateProfile(level: StaffLevel, oid: string, patch: { name?: string; email?: string | null }): Observable<StaffMember> {
        return this._api.patch<StaffMember>(`${this._base(level)}/${oid}`, patch);
    }

    setAssignments(oid: string, assignments: StaffAssignmentInput[], allBranches: boolean): Observable<StaffMember> {
        return this._api.put<StaffMember>(`${API.STAFF.HQ}/${oid}/assignments`, { assignments, all_branches: allBranches });
    }

    setRoleHere(oid: string, role: StaffRole): Observable<StaffMember> {
        return this._api.put<StaffMember>(`${API.STAFF.BRANCH}/${oid}/role`, { role });
    }

    removeHere(oid: string): Observable<StaffMember> {
        return this._api.delete<StaffMember>(`${API.STAFF.BRANCH}/${oid}`);
    }

    setActive(level: StaffLevel, oid: string, active: boolean): Observable<StaffMember> {
        return this._api.post<StaffMember>(`${this._base(level)}/${oid}/${active ? 'activate' : 'deactivate'}`, {});
    }

    resetPassword(level: StaffLevel, oid: string, password: string): Observable<null> {
        return this._api.post<null>(`${this._base(level)}/${oid}/reset-password`, { password });
    }

    signOut(level: StaffLevel, oid: string): Observable<null> {
        return this._api.post<null>(`${this._base(level)}/${oid}/sign-out`, {});
    }

    audit(level: StaffLevel, query: Record<string, string | number | undefined>): Observable<AuditPage> {
        return this._api.get<AuditPage>(level === 'hq' ? API.AUDIT.HQ : API.AUDIT.BRANCH, query);
    }

    private _base(level: StaffLevel): string {
        return level === 'hq' ? API.STAFF.HQ : API.STAFF.BRANCH;
    }
}
