import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { filter } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import {
    type Equipment,
    EQUIPMENT_CATEGORY_LABEL,
    EQUIPMENT_STATUS,
    type EquipmentDetail,
    PRIORITY,
    SERVICE_STATE,
    type Ticket,
    TICKET_STATUS
} from '@core/models/business.model';
import { type TextPromptData, TextPromptDialogComponent, type TextPromptResult } from '@features/governance/text-prompt-dialog.component';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';
import { TakaPipe } from '@shared/pipes/taka.pipe';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogService } from '@shared/ui/dialog/dialog.service';
import { BadgeComponent, CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { EmptyStateComponent } from '@shared/ui/feedback/empty-state.component';
import { todayIso } from '@shared/ui/forms/date-picker.component';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';
import { SwitchComponent } from '@shared/ui/forms/switch.component';
import { IconComponent } from '@shared/ui/icon/icon.component';
import { TabDirective, TabsComponent } from '@shared/ui/tabs/tabs.component';

import { BusinessService } from './business.service';
import { EquipmentDialogComponent } from './equipment-dialog.component';
import { TicketDialogComponent, type TicketDialogData } from './ticket-dialog.component';

/**
 * `/console/:branch/equipment` (D-098): the branch's register (service due worked out when read, warranty, what was
 * spent) and its maintenance tickets. Every staff member reports a fault; the branch manager keeps the register, runs
 * the tickets, records services and retires what cannot be used.
 */
@Component({
    selector: 'app-equipment-page',
    imports: [
        FormsModule,
        AppDatePipe,
        TakaPipe,
        PageHeaderComponent,
        ButtonComponent,
        BadgeComponent,
        CardComponent,
        SkeletonComponent,
        EmptyStateComponent,
        FieldComponent,
        InputDirective,
        SelectComponent,
        SwitchComponent,
        IconComponent,
        TabsComponent,
        TabDirective
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <app-page-header subtitle="Machines, their service schedule and repairs" title="Equipment">
            @if (keeper) {
                <button fmButton variant="primary" (click)="edit(null)">
                    <fm-icon name="plus" />
                    Add equipment
                </button>
            }
        </app-page-header>
        @if (list.value(); as l) {
            <div class="mb-4 flex flex-wrap gap-2 text-sm">
                <fm-badge tone="success">{{ l.counts.in_use }} in use</fm-badge>
                <fm-badge [tone]="l.counts.out_of_order ? 'danger' : 'neutral'">{{ l.counts.out_of_order }} out of order</fm-badge>
                <fm-badge [tone]="l.counts.service_due ? 'warning' : 'neutral'">{{ l.counts.service_due }} service due</fm-badge>
                <fm-badge>{{ l.counts.retired }} retired</fm-badge>
            </div>
        }
        <fm-tabs [(active)]="tab">
            <ng-template fmTab="register" label="Register">
                <div class="mb-4 flex flex-wrap items-end gap-4">
                    <fm-field class="w-48" label="Status">
                        <fm-select [ngModel]="status()" [options]="statuses" (ngModelChange)="status.set($event)" />
                    </fm-field>
                    <fm-field class="w-56" label="Search">
                        <input fmInput placeholder="Name, brand, serial" [ngModel]="q()" (ngModelChange)="q.set($event)" />
                    </fm-field>
                    <fm-switch [ngModel]="due()" (ngModelChange)="due.set($event)">Service due or soon</fm-switch>
                </div>
                <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                    @if (list.value(); as l) {
                        @if (l.rows.length) {
                            <fm-card flush>
                                <ul class="divide-y divide-border">
                                    @for (e of l.rows; track e.oid) {
                                        <li>
                                            <button
                                                class="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-sunken"
                                                type="button"
                                                [class.bg-accent-soft]="open()?.oid === e.oid"
                                                (click)="show(e.oid)"
                                            >
                                                @if (e.photo_url) {
                                                    <img class="size-12 shrink-0 rounded-lg object-cover" alt="" [src]="e.photo_url" />
                                                } @else {
                                                    <span class="grid size-12 shrink-0 place-items-center rounded-lg bg-surface-sunken text-fg-subtle">
                                                        <fm-icon name="dumbbell" />
                                                    </span>
                                                }
                                                <span class="min-w-0 flex-1">
                                                    <span class="block truncate font-medium">{{ e.name }}</span>
                                                    <span class="block truncate text-sm text-fg-muted">
                                                        {{ category[e.category] }}{{ e.room ? ' · ' + e.room.name : '' }}{{ e.brand ? ' · ' + e.brand : '' }}
                                                    </span>
                                                </span>
                                                @if (e.open_tickets) {
                                                    <fm-badge tone="warning">{{ e.open_tickets }} ticket{{ e.open_tickets === 1 ? '' : 's' }}</fm-badge>
                                                }
                                                @if (e.status !== 'in_use') {
                                                    <fm-badge [tone]="statusOf[e.status].tone">{{ statusOf[e.status].label }}</fm-badge>
                                                } @else if (e.service === 'due' || e.service === 'soon') {
                                                    <fm-badge [tone]="serviceOf[e.service].tone">{{ serviceOf[e.service].label }}</fm-badge>
                                                }
                                            </button>
                                        </li>
                                    }
                                </ul>
                            </fm-card>
                        } @else {
                            <fm-empty-state icon="dumbbell" title="No equipment here" />
                        }
                    } @else {
                        <fm-skeleton height="16rem" />
                    }
                    @if (open(); as e) {
                        <fm-card>
                            <div class="flex flex-wrap items-start gap-4">
                                @if (e.photo_url) {
                                    <img class="h-32 rounded-lg object-cover" alt="" [src]="e.photo_url" />
                                }
                                <div class="min-w-0 flex-1">
                                    <h2 class="text-lg font-semibold">{{ e.name }}</h2>
                                    <p class="text-sm text-fg-muted">
                                        {{ category[e.category] }}{{ e.brand ? ' · ' + e.brand : '' }}{{ e.model ? ' ' + e.model : ''
                                        }}{{ e.serial ? ' · ' + e.serial : '' }}
                                    </p>
                                    <div class="mt-2 flex flex-wrap gap-2">
                                        <fm-badge [tone]="statusOf[e.status].tone">{{ statusOf[e.status].label }}</fm-badge>
                                        <fm-badge [tone]="serviceOf[e.service].tone">{{ serviceOf[e.service].label }}</fm-badge>
                                        @if (e.warranty_until) {
                                            <fm-badge [tone]="e.in_warranty ? 'info' : 'neutral'">
                                                {{ e.in_warranty ? 'In warranty until' : 'Warranty ended' }} {{ e.warranty_until | appDate }}
                                            </fm-badge>
                                        }
                                    </div>
                                </div>
                            </div>
                            <dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                <dt class="text-fg-muted">Where</dt>
                                <dd>{{ e.room?.name ?? 'The gym floor' }}</dd>
                                <dt class="text-fg-muted">Bought</dt>
                                <dd>{{ e.purchased_on ? (e.purchased_on | appDate) : '—' }}{{ e.cost ? ' for ' + (e.cost | taka: 0) : '' }}</dd>
                                <dt class="text-fg-muted">Service</dt>
                                <dd>
                                    @if (e.service_every_days) {
                                        Every {{ e.service_every_days }} days · next {{ e.next_service_on | appDate }}
                                    } @else {
                                        No schedule
                                    }
                                </dd>
                                <dt class="text-fg-muted">Last serviced</dt>
                                <dd>{{ e.last_serviced_on ? (e.last_serviced_on | appDate) : '—' }}</dd>
                                <dt class="text-fg-muted">Spent on repairs</dt>
                                <dd>{{ e.spent | taka: 0 }}</dd>
                                @if (e.retired_on) {
                                    <dt class="text-fg-muted">Retired</dt>
                                    <dd>{{ e.retired_on | appDate }}: {{ e.retired_reason }}</dd>
                                }
                            </dl>
                            @if (e.notes) {
                                <p class="mt-3 text-sm text-fg-muted">{{ e.notes }}</p>
                            }
                            @if (e.status !== 'retired') {
                                <div class="mt-4 flex flex-wrap gap-2">
                                    @if (auth.can('create', 'Equipment')) {
                                        <button fmButton size="sm" (click)="raise(e)">
                                            <fm-icon name="wrench" size="1rem" />
                                            Report a fault
                                        </button>
                                    }
                                    @if (keeper) {
                                        <button fmButton size="sm" (click)="service(e)">Record a service</button>
                                        <button fmButton size="sm" variant="ghost" (click)="edit(e)">Edit</button>
                                        <button fmButton size="sm" variant="ghost" (click)="retire(e)">Retire</button>
                                    }
                                </div>
                            }
                            <h3 class="mt-6 mb-2 font-medium">History</h3>
                            @if (e.tickets.length) {
                                <ul class="divide-y divide-border text-sm">
                                    @for (t of e.tickets; track t.oid) {
                                        <li class="py-2">
                                            <div class="flex flex-wrap items-center gap-2">
                                                <span class="font-mono text-xs">{{ t.code }}</span>
                                                <span>{{ t.kind === 'service' ? 'Service' : t.description }}</span>
                                                <fm-badge class="ml-auto" [tone]="ticketOf[t.status].tone">
                                                    {{ t.kind === 'service' ? 'Done' : ticketOf[t.status].label }}
                                                </fm-badge>
                                            </div>
                                            <p class="text-xs text-fg-muted">
                                                {{ t.raised_at | appDate: 'd MMM yyyy' }} · {{ t.raised_by_name }}{{ t.technician ? ' · ' + t.technician : ''
                                                }}{{ t.cost ? ' · ' + (t.cost | taka: 0) : '' }}{{ t.resolution ? ' · ' + t.resolution : '' }}
                                            </p>
                                        </li>
                                    }
                                </ul>
                            } @else {
                                <p class="text-sm text-fg-muted">No repairs or services yet.</p>
                            }
                        </fm-card>
                    }
                </div>
            </ng-template>
            <ng-template fmTab="tickets" label="Tickets" [count]="tickets.value()?.length ?? null">
                @if (tickets.value(); as rows) {
                    @if (rows.length) {
                        <fm-card flush>
                            <ul class="divide-y divide-border">
                                @for (t of rows; track t.oid) {
                                    <li class="flex flex-wrap items-center gap-3 px-4 py-3">
                                        <span class="min-w-0 flex-1">
                                            <span class="block font-medium">{{ t.equipment.name }}: {{ t.description }}</span>
                                            <span class="block text-sm text-fg-muted">
                                                <span class="font-mono text-xs">{{ t.code }}</span>
                                                · {{ t.raised_by_name }} · {{ t.raised_at | appDate: 'd MMM, h:mm a'
                                                }}{{ t.technician ? ' · ' + t.technician : '' }}
                                            </span>
                                        </span>
                                        @if (t.photo_url) {
                                            <a target="_blank" [href]="t.photo_url">
                                                <img class="size-10 rounded object-cover" alt="Photo" [src]="t.photo_url" />
                                            </a>
                                        }
                                        @if (t.out_of_order) {
                                            <fm-badge tone="danger">Out of order</fm-badge>
                                        }
                                        <fm-badge [tone]="priorityOf[t.priority].tone">{{ priorityOf[t.priority].label }}</fm-badge>
                                        <fm-badge [tone]="ticketOf[t.status].tone">{{ ticketOf[t.status].label }}</fm-badge>
                                        @if (keeper) {
                                            <button fmButton size="sm" (click)="update(t)">Update</button>
                                        }
                                    </li>
                                }
                            </ul>
                        </fm-card>
                    } @else {
                        <fm-empty-state description="Everything is working." icon="wrench" title="No open tickets" />
                    }
                } @else {
                    <fm-skeleton height="10rem" />
                }
            </ng-template>
        </fm-tabs>
    `
})
export class EquipmentPageComponent {
    protected readonly auth = inject(AuthService);
    private readonly _service = inject(BusinessService);
    private readonly _dialog = inject(DialogService);
    protected readonly keeper = this.auth.can('update', 'Equipment');
    protected readonly category = EQUIPMENT_CATEGORY_LABEL;
    protected readonly statusOf = EQUIPMENT_STATUS;
    protected readonly serviceOf = SERVICE_STATE;
    protected readonly ticketOf = TICKET_STATUS;
    protected readonly priorityOf = PRIORITY;
    protected readonly statuses: SelectOption<string>[] = [
        { value: '', label: 'Not retired' },
        { value: 'in_use', label: 'In use' },
        { value: 'out_of_order', label: 'Out of order' },
        { value: 'retired', label: 'Retired' },
        { value: 'all', label: 'All' }
    ];
    protected readonly tab = signal('register');
    protected readonly status = signal('');
    protected readonly q = signal('');
    protected readonly due = signal(false);
    private readonly _filters = computed(() => ({ status: this.status(), q: this.q().trim(), due: this.due() }));
    protected readonly list = rxResource({ params: this._filters, stream: ({ params }) => this._service.equipment(params) });
    protected readonly tickets = rxResource({ stream: () => this._service.tickets('open') });
    protected readonly open = signal<EquipmentDetail | null>(null);

    protected show(oid: string): void {
        this._service.equipmentDetail(oid).subscribe(e => this.open.set(e));
    }

    protected edit(e: Equipment | null): void {
        this._dialog
            .open<EquipmentDialogComponent, Equipment | null, Equipment>(EquipmentDialogComponent, { data: e, size: 'lg' })
            .afterClosed.pipe(filter((v): v is Equipment => !!v))
            .subscribe(saved => this._refresh(saved.oid));
    }

    protected raise(e: Equipment): void {
        this._ticket({ mode: 'raise', equipment: e });
    }

    protected service(e: Equipment): void {
        this._ticket({ mode: 'service', equipment: e, today: todayIso() });
    }

    protected update(t: Ticket): void {
        this._ticket({ mode: 'update', ticket: t });
    }

    protected retire(e: Equipment): void {
        this._dialog
            .open<TextPromptDialogComponent, TextPromptData, TextPromptResult>(TextPromptDialogComponent, {
                data: {
                    title: `Retire ${e.name}`,
                    description: 'It stays in the register as retired, with its history. Close its open tickets first.',
                    label: 'Why',
                    okText: 'Retire',
                    minLength: 3,
                    danger: true
                },
                size: 'sm'
            })
            .afterClosed.pipe(filter((v): v is TextPromptResult => !!v))
            .subscribe(r => this._service.retire(e.oid, r.text).subscribe(() => this._refresh(e.oid)));
    }

    private _refresh(oid?: string): void {
        this.list.reload();
        this.tickets.reload();
        const id = oid ?? this.open()?.oid;
        if (id) this.show(id);
    }

    private _ticket(data: TicketDialogData): void {
        this._dialog
            .open<TicketDialogComponent, TicketDialogData, unknown>(TicketDialogComponent, { data })
            .afterClosed.pipe(filter(v => !!v))
            .subscribe(() => this._refresh(data.mode === 'update' ? data.ticket.equipment.oid : data.equipment.oid));
    }
}
