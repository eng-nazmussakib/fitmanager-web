import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { type IncidentCreated, LEVEL_LABEL, POLICY_STATE, SANCTION_STATE } from '@core/models/governance.model';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogService } from '@shared/ui/dialog/dialog.service';
import { BadgeComponent, CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { IconComponent } from '@shared/ui/icon/icon.component';

import { GovernanceService } from './governance.service';
import { IncidentDialogComponent, type IncidentDialogData } from './incident-dialog.component';

/**
 * A member's governance tab (D-090 to D-094): where they stand with each policy (the desk records "signed on paper"),
 * their strikes and the suggested next step, and the cases about them that this branch may see.
 */
@Component({
    selector: 'app-member-governance',
    imports: [RouterLink, AppDatePipe, ButtonComponent, BadgeComponent, CardComponent, SkeletonComponent, IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="grid gap-4 lg:grid-cols-2">
            <fm-card subtitle="Required policies must be accepted; check-in is blocked once the grace period is over." title="Policies">
                @if (policies.value(); as list) {
                    <ul class="divide-y divide-border">
                        @for (p of list; track p.policy_oid) {
                            <li class="flex flex-wrap items-center gap-2 py-2 text-sm">
                                <span class="min-w-0 flex-1">
                                    <span class="block font-medium">
                                        {{ p.title }}
                                        <span class="font-normal text-fg-muted">v{{ p.current_version }}</span>
                                    </span>
                                    <span class="block text-fg-muted">
                                        @if (p.accepted_version) {
                                            v{{ p.accepted_version }} {{ p.method === 'paper' ? 'signed on paper' : 'accepted in the portal' }},
                                            {{ p.accepted_at | appDate: 'd MMM yyyy' }}
                                        } @else {
                                            Not accepted
                                        }
                                        @if (p.blocks_on) {
                                            · {{ p.state === 'overdue' ? 'blocking check-in since' : 'blocks check-in from' }}
                                            {{ p.blocks_on | appDate: 'd MMM' }}
                                        }
                                    </span>
                                </span>
                                <fm-badge [tone]="policyState[p.state].tone">{{ policyState[p.state].label }}</fm-badge>
                            </li>
                        }
                    </ul>
                    @if (outstanding() && auth.can('update', 'Member')) {
                        <button class="mt-3" fmButton size="sm" variant="primary" [loading]="signing()" (click)="sign()">
                            <fm-icon name="file-text" size="1rem" />
                            Signed on paper today
                        </button>
                    }
                } @else {
                    <fm-skeleton height="8rem" />
                }
            </fm-card>
            @if (auth.can('read', 'Incident')) {
                <fm-card title="Discipline">
                    @if (record.value(); as r) {
                        <p class="text-sm">
                            <strong>{{ r.strikes }}</strong>
                            strike{{ r.strikes === 1 ? '' : 's' }} in the last 12 months · next step:
                            <strong>{{ level[r.suggestion].toLowerCase() }}</strong>
                        </p>
                        @if (r.incidents.length) {
                            <ul class="mt-3 divide-y divide-border">
                                @for (i of r.incidents; track i.oid) {
                                    <li class="py-2 text-sm">
                                        <a
                                            class="flex flex-wrap items-center gap-2 text-fg no-underline hover:underline"
                                            [routerLink]="['../../incidents', i.oid]"
                                        >
                                            <span class="min-w-0 flex-1">
                                                {{ i.summary }}
                                                <span class="text-fg-muted">· {{ i.occurred_at | appDate: 'd MMM yyyy' }} · {{ i.branch.name }}</span>
                                            </span>
                                            @if (i.latest; as l) {
                                                <fm-badge [tone]="state[l.state].tone">{{ level[l.level] }}</fm-badge>
                                            } @else {
                                                <fm-badge tone="warning">No step yet</fm-badge>
                                            }
                                        </a>
                                    </li>
                                }
                            </ul>
                        } @else {
                            <p class="mt-2 text-sm text-fg-muted">No cases.</p>
                        }
                        @if (auth.can('create', 'Incident')) {
                            <button class="mt-3" fmButton size="sm" (click)="recordIncident()">
                                <fm-icon name="shield-alert" size="1rem" />
                                Record an incident
                            </button>
                        }
                    } @else {
                        <fm-skeleton height="8rem" />
                    }
                </fm-card>
            }
        </div>
    `
})
export class MemberGovernanceComponent {
    readonly member = input.required<{ oid: string; code: string; name: string }>();
    readonly changed = output();
    protected readonly auth = inject(AuthService);
    private readonly _service = inject(GovernanceService);
    private readonly _dialog = inject(DialogService);
    private readonly _router = inject(Router);
    private readonly _route = inject(ActivatedRoute);
    protected readonly policies = rxResource({ params: () => this.member().oid, stream: ({ params }) => this._service.memberPolicies(params) });
    protected readonly record = rxResource({
        params: () => (this.auth.can('read', 'Incident') ? this.member().oid : undefined),
        stream: ({ params }) => this._service.memberDiscipline(params)
    });
    protected readonly policyState = POLICY_STATE;
    protected readonly level = LEVEL_LABEL;
    protected readonly state = SANCTION_STATE;
    protected readonly signing = signal(false);

    protected outstanding(): boolean {
        return (this.policies.value() ?? []).some(p => p.state === 'due' || p.state === 'overdue');
    }

    protected sign(): void {
        this.signing.set(true);
        this._service.signOnPaper(this.member().oid).subscribe({
            next: r => {
                this.signing.set(false);
                this.policies.set(r.policies);
                this.changed.emit();
            },
            error: () => this.signing.set(false)
        });
    }

    protected recordIncident(): void {
        const m = this.member();
        this._dialog
            .open<IncidentDialogComponent, IncidentDialogData, IncidentCreated>(IncidentDialogComponent, {
                data: { member: { code: m.code, name: m.name } },
                size: 'lg'
            })
            .afterClosed.pipe(filter((v): v is IncidentCreated => !!v))
            .subscribe(c => void this._router.navigate(['../../incidents', c.oid], { relativeTo: this._route }));
    }
}
