import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { filter } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import type { Policy, PolicyDetail } from '@core/models/governance.model';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogService } from '@shared/ui/dialog/dialog.service';
import { BadgeComponent, CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { IconComponent } from '@shared/ui/icon/icon.component';

import { GovernanceService } from './governance.service';
import { type PolicyEditorData, PolicyEditorDialogComponent } from './policy-editor-dialog.component';

/**
 * `/hq/policies` (HQ edits) and `/console/:branch/policies` (read): HQ's policies with their numbered clauses
 * and version history. "Accept again" versions must be accepted by every member; "wording only" ones not.
 */
@Component({
    selector: 'app-policies-page',
    imports: [AppDatePipe, PageHeaderComponent, ButtonComponent, BadgeComponent, CardComponent, SkeletonComponent, IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <app-page-header
            title="Policies"
            [subtitle]="edit ? 'Every branch and the website read these. A change is a new version.' : 'HQ’s rules and terms; incidents cite their clauses'"
        >
            @if (edit) {
                <button fmButton variant="primary" (click)="editor(null)">
                    <fm-icon name="plus" />
                    New policy
                </button>
            }
        </app-page-header>
        @if (list.value(); as rows) {
            <div class="grid gap-3">
                @for (p of rows; track p.oid) {
                    <fm-card>
                        <div class="flex flex-wrap items-center gap-2">
                            <button
                                class="text-left text-lg font-semibold hover:underline"
                                type="button"
                                [attr.aria-expanded]="open()?.oid === p.oid"
                                (click)="toggle(p)"
                            >
                                {{ p.title }}
                            </button>
                            <fm-badge>v{{ p.current.version }}</fm-badge>
                            @if (p.required) {
                                <fm-badge tone="info">Members accept</fm-badge>
                            }
                            @if (p.public) {
                                <fm-badge tone="neutral">On the website</fm-badge>
                            }
                            @if (!p.active) {
                                <fm-badge tone="warning">Retired</fm-badge>
                            }
                            <span class="flex-1"></span>
                            @if (edit) {
                                <button fmButton size="sm" variant="ghost" (click)="editor(p)">
                                    <fm-icon name="pencil" size="1rem" />
                                    New version
                                </button>
                                <button fmButton size="sm" variant="ghost" (click)="toggleFlag(p, 'public')">
                                    {{ p.public ? 'Hide from website' : 'Show on website' }}
                                </button>
                                <button fmButton size="sm" variant="ghost" (click)="toggleFlag(p, 'active')">{{ p.active ? 'Retire' : 'Bring back' }}</button>
                            }
                        </div>
                        <p class="mt-1 text-sm text-fg-muted">
                            {{ p.summary }} · Published {{ p.current.published_on | appDate: 'd MMM yyyy'
                            }}{{ p.required_version !== p.current.version ? ' · members accept v' + p.required_version : '' }}
                        </p>
                        @if (open()?.oid === p.oid) {
                            @if (open(); as d) {
                                <div class="mt-3 flex flex-wrap gap-2" aria-label="Versions" role="tablist">
                                    @for (v of d.versions ?? []; track v.oid) {
                                        <button
                                            type="button"
                                            fmButton
                                            role="tab"
                                            size="sm"
                                            [attr.aria-selected]="d.shown.version === v.version"
                                            [variant]="d.shown.version === v.version ? 'primary' : 'secondary'"
                                            (click)="version(p, v.version)"
                                        >
                                            v{{ v.version }} · {{ v.mode === 'accept_again' ? 'accept again' : 'wording only' }}
                                        </button>
                                    }
                                </div>
                                @if (d.shown.change_note) {
                                    <p class="mt-2 text-sm text-fg-muted">What changed: {{ d.shown.change_note }}</p>
                                }
                                <ol class="mt-3 grid gap-2">
                                    @for (c of d.shown.clauses; track c.oid) {
                                        <li class="text-sm">
                                            <span class="font-semibold">§{{ c.number }} {{ c.heading }}.</span>
                                            {{ c.body }}
                                        </li>
                                    }
                                </ol>
                                <p class="mt-2 text-xs text-fg-subtle">
                                    v{{ d.shown.version }} published {{ d.shown.published_on | appDate: 'd MMM yyyy'
                                    }}{{ d.shown.published_by_name ? ' by ' + d.shown.published_by_name : '' }}
                                </p>
                            }
                        }
                    </fm-card>
                }
            </div>
        } @else {
            <fm-skeleton height="16rem" />
        }
    `
})
export class PoliciesPageComponent {
    protected readonly auth = inject(AuthService);
    private readonly _service = inject(GovernanceService);
    private readonly _dialog = inject(DialogService);
    protected readonly edit = inject(ActivatedRoute).snapshot.data['hq'] === true && this.auth.can('update', 'Policy');
    protected readonly list = rxResource({ stream: () => this._service.policies(this.edit) });
    protected readonly open = signal<PolicyDetail | null>(null);

    protected toggle(p: Policy): void {
        if (this.open()?.oid === p.oid) this.open.set(null);
        else this.version(p);
    }

    protected version(p: Policy, version?: number): void {
        this._service.policy(p.oid, version).subscribe(d => this.open.set(d));
    }

    protected editor(p: Policy | null): void {
        this._dialog
            .open<PolicyEditorDialogComponent, PolicyEditorData, Policy>(PolicyEditorDialogComponent, { data: { policy: p }, size: 'lg' })
            .afterClosed.pipe(filter((v): v is Policy => !!v))
            .subscribe(() => {
                this.open.set(null);
                this.list.reload();
            });
    }

    protected toggleFlag(p: Policy, flag: 'public' | 'active'): void {
        this._service.updatePolicy(p.oid, { [flag]: !p[flag] }).subscribe(() => this.list.reload());
    }
}
