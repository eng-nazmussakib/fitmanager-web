import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { filter } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { BranchContextService } from '@core/branch/branch-context.service';
import { type StockTransfer, TRANSFER_STATUS } from '@core/models/business.model';
import { ConsoleService } from '@features/console/console.service';
import { type TextPromptData, TextPromptDialogComponent, type TextPromptResult } from '@features/governance/text-prompt-dialog.component';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogService } from '@shared/ui/dialog/dialog.service';
import { BadgeComponent, CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { EmptyStateComponent } from '@shared/ui/feedback/empty-state.component';
import { FieldComponent } from '@shared/ui/forms/field.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

import { BusinessService } from './business.service';
import { OrderDialogComponent, type OrderDialogData } from './order-dialog.component';
import { type QtyLinesData, QtyLinesDialogComponent, type QtyLinesResult } from './qty-lines-dialog.component';

/**
 * Stock transfers between branches (D-101): this branch asks another for products; the other sends what it can (at its
 * average cost) or rejects; this branch counts it in, and anything short is written off as a shortfall.
 */
@Component({
    selector: 'app-transfers',
    imports: [
        FormsModule,
        AppDatePipe,
        ButtonComponent,
        BadgeComponent,
        CardComponent,
        SkeletonComponent,
        EmptyStateComponent,
        FieldComponent,
        SelectComponent,
        IconComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="mb-4 flex flex-wrap items-end gap-4">
            <fm-field class="w-44" label="Show"><fm-select [ngModel]="direction()" [options]="directions" (ngModelChange)="direction.set($event)" /></fm-field>
            @if (auth.can('create', 'Transfer')) {
                <button class="ml-auto" fmButton variant="primary" (click)="ask()">
                    <fm-icon name="arrow-right-left" />
                    Ask a branch
                </button>
            }
        </div>
        @if (list.value(); as rows) {
            @if (rows.length) {
                <div class="grid gap-3">
                    @for (t of rows; track t.oid) {
                        <fm-card>
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="font-mono text-sm">{{ t.code }}</span>
                                <span class="text-sm">
                                    {{ t.direction === 'in' ? 'From ' + t.from.name : 'To ' + t.to.name }} · asked by {{ t.requested_by_name }},
                                    {{ t.requested_at | appDate: 'd MMM' }}
                                </span>
                                <fm-badge class="ml-auto" [tone]="statusOf[t.status].tone">{{ statusOf[t.status].label }}</fm-badge>
                            </div>
                            <ul class="mt-2 text-sm">
                                @for (l of t.lines; track l.oid) {
                                    <li>
                                        {{ l.name }}: {{ l.qty_requested }} asked{{ l.qty_sent !== null ? ', ' + l.qty_sent + ' sent' : ''
                                        }}{{ l.qty_received !== null ? ', ' + l.qty_received + ' received' : '' }}
                                    </li>
                                }
                            </ul>
                            @if (t.note) {
                                <p class="mt-1 text-sm text-fg-muted">{{ t.note }}</p>
                            }
                            @if (t.closing_note) {
                                <p class="mt-1 text-sm text-fg-muted">{{ t.closing_note }}</p>
                            }
                            @if (t.status === 'requested' || t.status === 'in_transit') {
                                <div class="mt-3 flex flex-wrap gap-2">
                                    @if (t.direction === 'out' && t.status === 'requested' && can) {
                                        <button fmButton size="sm" variant="primary" (click)="send(t)">Send</button>
                                        <button fmButton size="sm" (click)="close(t, 'reject')">Reject</button>
                                    }
                                    @if (t.direction === 'in' && t.status === 'in_transit' && can) {
                                        <button fmButton size="sm" variant="primary" (click)="receive(t)">Receive</button>
                                    }
                                    @if (t.direction === 'in' && t.status === 'requested' && can) {
                                        <button fmButton size="sm" variant="ghost" (click)="close(t, 'cancel')">Cancel</button>
                                    }
                                </div>
                            }
                        </fm-card>
                    }
                </div>
            } @else {
                <fm-empty-state icon="arrow-right-left" title="No transfers" />
            }
        } @else {
            <fm-skeleton height="10rem" />
        }
    `
})
export class TransfersComponent {
    protected readonly auth = inject(AuthService);
    private readonly _service = inject(BusinessService);
    private readonly _dialog = inject(DialogService);
    private readonly _branch = inject(BranchContextService);
    private readonly _console = inject(ConsoleService);
    protected readonly can = this.auth.can('update', 'Transfer');
    protected readonly statusOf = TRANSFER_STATUS;
    protected readonly directions: SelectOption<'all' | 'in' | 'out'>[] = [
        { value: 'all', label: 'All' },
        { value: 'in', label: 'Coming here' },
        { value: 'out', label: 'Asked of us' }
    ];
    protected readonly direction = signal<'all' | 'in' | 'out'>('all');
    protected readonly list = rxResource({ params: () => this.direction(), stream: ({ params }) => this._service.transfers(params) });
    private readonly _branches = rxResource({ stream: () => this._console.branchOptions() });
    private readonly _others = computed(() => (this._branches.value() ?? []).filter(b => b.oid !== this._branch.active()?.oid));

    reload(): void {
        this.list.reload();
    }

    ask(start: { product_oid: string; qty: number }[] = []): void {
        this._dialog
            .open<OrderDialogComponent, OrderDialogData, StockTransfer>(OrderDialogComponent, {
                data: { kind: 'transfer', branches: this._others(), start },
                size: 'lg'
            })
            .afterClosed.pipe(filter(v => !!v))
            .subscribe(() => this.list.reload());
    }

    protected send(t: StockTransfer): void {
        this._lines(t, 'send', {
            title: `Send ${t.code} to ${t.to.name}`,
            description: 'What you send leaves your stock now, at its average cost.',
            okText: 'Send',
            lines: t.lines.map(l => ({ oid: l.oid, name: l.name, max: l.qty_requested, qty: l.qty_requested }))
        });
    }

    protected receive(t: StockTransfer): void {
        this._lines(t, 'receive', {
            title: `Receive ${t.code} from ${t.from.name}`,
            description: 'Count what arrived. Anything short is written off as a shortfall.',
            okText: 'Receive',
            noteLabel: 'Note on what was short',
            lines: t.lines.filter(l => (l.qty_sent ?? 0) > 0).map(l => ({ oid: l.oid, name: l.name, max: l.qty_sent ?? 0, qty: l.qty_sent ?? 0 }))
        });
    }

    protected close(t: StockTransfer, how: 'reject' | 'cancel'): void {
        this._dialog
            .open<TextPromptDialogComponent, TextPromptData, TextPromptResult>(TextPromptDialogComponent, {
                data: {
                    title: `${how === 'reject' ? 'Reject' : 'Cancel'} ${t.code}`,
                    label: 'Why',
                    okText: how === 'reject' ? 'Reject' : 'Cancel it',
                    minLength: 3
                },
                size: 'sm'
            })
            .afterClosed.pipe(filter((v): v is TextPromptResult => !!v))
            .subscribe(r => this._service.closeTransfer(t.oid, how, r.text).subscribe(() => this.list.reload()));
    }

    private _lines(t: StockTransfer, how: 'send' | 'receive', data: QtyLinesData): void {
        this._dialog
            .open<QtyLinesDialogComponent, QtyLinesData, QtyLinesResult>(QtyLinesDialogComponent, { data })
            .afterClosed.pipe(filter((v): v is QtyLinesResult => !!v))
            .subscribe(r => {
                const lines = r.lines.map(l => ({ line_oid: l.oid, qty: l.qty }));
                (how === 'send' ? this._service.sendTransfer(t.oid, lines, r.note) : this._service.receiveTransfer(t.oid, lines, r.note)).subscribe(() =>
                    this.list.reload()
                );
            });
    }
}
