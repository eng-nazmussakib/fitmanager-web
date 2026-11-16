import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '@core/http/api.service';
import type { Branch } from '@core/models/branch.model';
import type { Dashboard } from '@core/models/dashboard.model';
import type { PlanTemplate } from '@core/models/plan.model';

/** Dashboards: HQ across branches (`X-Branch-Id` = HQ) and one branch (`X-Branch-Id` = that branch). */
@Injectable({ providedIn: 'root' })
export class DashboardService {
    private readonly _api = inject(ApiService);

    hq(from: string, to: string): Observable<Dashboard> {
        return this._api.get<Dashboard>('/v1/hq/dashboard', { from, to });
    }

    branch(from: string, to: string): Observable<Dashboard> {
        return this._api.get<Dashboard>('/v1/dashboard', { from, to });
    }

    branches(): Observable<Branch[]> {
        return this._api.get<Branch[]>('/v1/branches');
    }

    templates(): Observable<PlanTemplate[]> {
        return this._api.get<PlanTemplate[]>('/v1/hq/plan-templates');
    }
}
