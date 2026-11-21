import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { INCIDENT_CATEGORY_LABEL, type IncidentCreated, LEVEL_LABEL, SANCTION_STATE } from '@core/models/governance.model';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogService } from '@shared/ui/dialog/dialog.service';
import { BadgeComponent, CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { EmptyStateComponent } from '@shared/ui/feedback/empty-state.component';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';
import { IconComponent } from '@shared/ui/icon/icon.component';
import { ToastService } from '@shared/ui/toast/toast.service';

import { GovernanceService } from './governance.service';
import { IncidentDialogComponent, type IncidentDialogData } from './incident-dialog.component';

const ROLE_LABEL: Record<string, string> = { BRANCH_MANAGER: 'Branch manager', FRONT_DESK: 'Front desk', TRAINER: 'Trainer' };

/**
 * `/console/:branch/incidents` and `/hq/incidents` (D-092 to D-094): discipline cases about members and staff, newest
 * first. A branch sees its cases and those about its members elsewhere, never one about a branch manager (HQ's) or about
 * the person looking; HQ sees every branch's, and the appeals waiting for it.
 */
@Component({
    selector: 'app-incidents-page',
    imports: [
        FormsModule,
        RouterLink,
        AppDatePipe,
        PageHeaderComponent,
        ButtonComponent,
        BadgeComponent,
        CardComponent,
        SkeletonComponent,
        EmptyStateComponent,
        FieldComponent,
        InputDirective,
        SelectComponent,
        IconComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <app-page-header
            title="Incidents"
            [subtitle]="hq ? 'Cases at every branch, and the ones about branch managers' : 'Discipline cases about members and staff'"
        >
            @if (auth.can('create', 'Incident')) {
                <button fmButton variant="primary" (click)="record()">
                    <fm-icon name="plus" />
                    Record an incident
                </button>
            }
        </app-page-header>
        <div class="mb-4 flex flex-wrap items-end gap-3">
            <fm-field class="w-56" label="Search">
                <input fmInput placeholder="Name, code or summary" [ngModel]="q()" (ngModelChange)="q.set($event)" />
            </fm-field>
            <fm-field class="w-40" label="Cases"><fm-select [ngModel]="status()" [options]="statuses" (ngModelChange)="status.set($event)" /></fm-field>
            <fm-field class="w-40" label="About"><fm-select [ngModel]="kind()" [options]="kinds" (ngModelChange)="kind.set($event)" /></fm-field>
            <fm-field class="w-48" label="Appeals"><fm-select [ngModel]="appeal()" [options]="appeals" (ngModelChange)="appeal.set($event)" /></fm-field>
        </div>
        @if (list.value(); as rows) {
            @if (rows.length) {
                <fm-card flush>
                    <ul class="divide-y divide-border">
                        @for (i of rows; track i.oid) {
                            <li>
                                <a class="flex flex-wrap items-center gap-3 px-5 py-3 text-fg no-underline hover:bg-surface-sunken" [routerLink]="[i.oid]">
                                    <span class="min-w-0 flex-1">
                                        <span class="flex flex-wrap items-center gap-2 font-medium">
                                            {{ i.subject.name }}
                                            <span class="text-sm font-normal text-fg-muted">
                                                {{ i.subject.kind === 'member' ? i.subject.code : (role[i.subject.role ?? ''] ?? 'Staff') }}
                                            </span>
                                            @if (i.hq_only) {
                                                <fm-badge tone="info">HQ only</fm-badge>
                                            }
                                            @if (i.open_appeal) {
                                                <fm-badge tone="warning">Appeal open</fm-badge>
                                            }
                                        </span>
                                        <span class="block text-sm text-fg-muted">
                                            {{ i.summary }} · {{ category[i.category] }} · {{ i.occurred_at | appDate: 'd MMM yyyy, h:mm a'
                                            }}{{ hq ? ' · ' + i.branch.name : '' }}
                                        </span>
                                    </span>
                                    @if (i.latest; as l) {
                                        <fm-badge [tone]="state[l.state].tone">{{ level[l.level] }} · {{ state[l.state].label }}</fm-badge>
                                    } @else {
                                        <fm-badge tone="warning">No step yet</fm-badge>
                                    }
                                    @if (i.closed) {
                                        <fm-badge>Closed</fm-badge>
                                    }
                                </a>
                            </li>
                        }
                    </ul>
                </fm-card>
            } @else {
                <fm-empty-state description="Cases recorded at the desk or by trainers show here." icon="shield-check" title="No cases" />
            }
        } @else {
            <fm-skeleton height="16rem" />
        }
    `
})
export class IncidentsPageComponent {
    protected readonly auth = inject(AuthService);
    private readonly _service = inject(GovernanceService);
    private readonly _dialog = inject(DialogService);
    private readonly _toast = inject(ToastService);
    private readonly _router = inject(Router);
    private readonly _route = inject(ActivatedRoute);
    protected readonly hq = this._route.snapshot.data['hq'] === true;
    protected readonly level = LEVEL_LABEL;
    protected readonly state = SANCTION_STATE;
    protected readonly category = INCIDENT_CATEGORY_LABEL;
    protected readonly role = ROLE_LABEL;
    protected readonly statuses: SelectOption<string>[] = [
        { value: '', label: 'All' },
        { value: 'open', label: 'Open' },
        { value: 'closed', label: 'Closed' }
    ];
    protected readonly kinds: SelectOption<string>[] = [
        { value: '', label: 'Anyone' },
        { value: 'member', label: 'Members' },
        { value: 'staff', label: 'Staff' }
    ];
    protected readonly appeals: SelectOption<string>[] = [
        { value: '', label: 'Any' },
        { value: 'open', label: 'Waiting for a decision' }
    ];
    protected readonly q = signal('');
    protected readonly status = signal(this._route.snapshot.queryParamMap.get('status') ?? '');
    protected readonly kind = signal('');
    protected readonly appeal = signal(this._route.snapshot.queryParamMap.get('appeal') ?? '');
    private readonly _filters = computed(() => ({ status: this.status(), kind: this.kind(), appeal: this.appeal(), q: this.q().trim() }));
    protected readonly list = rxResource({ params: this._filters, stream: ({ params }) => this._service.incidents(params) });

    protected record(): void {
        const branches = this.hq ? (this.auth.user()?.assignments ?? []).filter(a => a.branch.kind === 'BRANCH').map(a => a.branch) : undefined;
        this._dialog
            .open<IncidentDialogComponent, IncidentDialogData, IncidentCreated>(IncidentDialogComponent, { data: branches ? { branches } : {}, size: 'lg' })
            .afterClosed.pipe(filter((v): v is IncidentCreated => !!v))
            .subscribe(c => {
                if ('sent_to_hq' in c) {
                    this._toast.show('It is about a branch manager, so HQ handles it.', { tone: 'info', title: 'Sent to HQ' });
                    this.list.reload();
                } else void this._router.navigate([c.oid], { relativeTo: this._route });
            });
    }
}
