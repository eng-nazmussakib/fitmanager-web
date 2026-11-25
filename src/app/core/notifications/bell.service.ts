import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, map, type Observable, of, tap } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { BranchContextService } from '@core/branch/branch-context.service';
import { ApiService } from '@core/http/api.service';
import type { Inbox, UnreadCount } from '@core/models/inbox.model';
import type { MemberNotification } from '@core/models/member.model';

/** Navigations closer together than this reuse the last count (each count is a Worker request on the free plan). */
const MIN_GAP_MS = 15_000;

/**
 * The bell's number: a member's unread messages in the portal, or the staff inbox at the active
 * branch (or HQ) in the consoles. Read when a page opens and when the user moves to another page, never pushed
 * (live updates are deferred). Errors are silent: the bell simply keeps its last number.
 */
@Injectable({ providedIn: 'root' })
export class BellService {
    private readonly _api = inject(ApiService);
    private readonly _auth = inject(AuthService);
    private readonly _branch = inject(BranchContextService);
    private readonly _unread = signal(0);
    private _last = { key: '', at: 0 };

    readonly unread = this._unread.asReadonly();
    /** "3", or "99+" past 99; empty at 0. */
    readonly badge = computed(() => {
        const n = this._unread();
        return n <= 0 ? '' : n > 99 ? '99+' : String(n);
    });

    /** Rereads the count, unless it was read for the same place less than 15 s ago (`force` always reads). */
    refresh(force = false): void {
        const user = this._auth.user();
        if (!user) return;
        const member = user.kind === 'member';
        const branch = this._branch.active()?.oid ?? '';
        if (!member && !branch) return;
        const key = member ? 'me' : branch;
        if (!force && this._last.key === key && Date.now() - this._last.at < MIN_GAP_MS) return;
        this._last = { key, at: Date.now() };
        this._api
            .get<UnreadCount>(member ? '/v1/me/notifications/count' : '/v1/inbox/count', undefined, { notify: 'none' })
            .pipe(catchError(() => of(null)))
            .subscribe(c => {
                if (c) this._unread.set(c.unread);
            });
    }

    /* ---------- the member's messages ---------- */

    memberMessages(): Observable<MemberNotification[]> {
        return this._api.get<MemberNotification[]>('/v1/me/notifications');
    }

    /** Marks the member's messages read (those named, or all); the bell follows. */
    markMemberRead(oids?: string[]): Observable<number> {
        return this._api.post<UnreadCount>('/v1/me/notifications/read', oids ? { oids } : {}, { notify: 'none' }).pipe(
            map(c => c.unread),
            tap(n => this._unread.set(n))
        );
    }

    /* ---------- the staff inbox ---------- */

    inbox(): Observable<Inbox> {
        return this._api.get<Inbox>('/v1/inbox').pipe(tap(i => this._unread.set(i.unread)));
    }

    markInboxRead(oids?: string[]): Observable<number> {
        return this._api.post<UnreadCount>('/v1/inbox/read', oids ? { oids } : {}, { notify: 'none' }).pipe(
            map(c => c.unread),
            tap(n => this._unread.set(n))
        );
    }
}
