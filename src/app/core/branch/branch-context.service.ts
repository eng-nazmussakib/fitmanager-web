import { Injectable, signal } from '@angular/core';

import type { BranchRef } from '@core/models/branch.model';

/**
 * The branch the console is working on. It comes from the URL (`/console/:branch`, D-014), set by `branchMatch`;
 * `/hq` sets the HQ row (D-023); the portal and public pages clear it. Never set it from anywhere else: the URL
 * is the only source, so links can be shared and two tabs can work on two branches.
 *
 * `branchHeaderInterceptor` sends it to the API as `X-Branch-Id`, and AuthService adds that branch's rules to the
 * ability.
 */
@Injectable({ providedIn: 'root' })
export class BranchContextService {
    private readonly _active = signal<BranchRef | null>(null);

    readonly active = this._active.asReadonly();

    set(branch: BranchRef | null): void {
        if (branch?.oid !== this._active()?.oid) this._active.set(branch);
    }
}
