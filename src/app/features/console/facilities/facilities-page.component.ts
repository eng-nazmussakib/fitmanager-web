import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import type { MemberListItem } from '@core/models/member.model';
import type { Locker, Room } from '@core/models/scheduling.model';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { CanDirective } from '@shared/directives/can.directive';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';
import { TakaPipe } from '@shared/pipes/taka.pipe';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogComponent } from '@shared/ui/dialog/dialog.component';
import { BadgeComponent, CardComponent, DividerDirective, SkeletonComponent } from '@shared/ui/display/display';
import { DatePickerComponent, todayIso } from '@shared/ui/forms/date-picker.component';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { NumberInputComponent } from '@shared/ui/forms/number-input.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';
import { IconComponent } from '@shared/ui/icon/icon.component';
import { TabDirective, TabsComponent } from '@shared/ui/tabs/tabs.component';

import { MemberPickerComponent } from '../member-picker.component';
import { SchedulingService } from '../scheduling.service';

const STATUS_TONE: Record<Locker['status'], 'success' | 'primary' | 'warning' | 'neutral'> = {
    Free: 'success',
    Rented: 'primary',
    Blocked: 'warning',
    Inactive: 'neutral'
};

/**
 * `/console/:branch/facilities` (D-082): lockers (rent one on its own invoice, take the key back), rooms (where
 * classes and PT happen) and maintenance blocks on either. A blocked room takes no new classes; the classes already
 * in it are listed for the manager to move or cancel.
 */
@Component({
    selector: 'app-facilities-page',
    imports: [
        FormsModule,
        PageHeaderComponent,
        CanDirective,
        AppDatePipe,
        TakaPipe,
        ButtonComponent,
        DialogComponent,
        BadgeComponent,
        CardComponent,
        DividerDirective,
        SkeletonComponent,
        DatePickerComponent,
        FieldComponent,
        InputDirective,
        NumberInputComponent,
        SelectComponent,
        IconComponent,
        TabsComponent,
        TabDirective,
        MemberPickerComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <app-page-header subtitle="Lockers, rooms and maintenance" title="Facilities" />
        <fm-tabs label="Facilities" [active]="tab() ?? 'lockers'" (activeChange)="setTab($event)">
            <ng-template fmTab="lockers" label="Lockers" [count]="lockers.value()?.lockers?.length ?? null">
                @if (lockers.value(); as l) {
                    <div class="mb-4 flex flex-wrap items-center gap-2 text-sm">
                        <fm-badge tone="success">{{ l.totals.free }} free</fm-badge>
                        <fm-badge tone="primary">{{ l.totals.rented }} rented</fm-badge>
                        @if (l.totals.blocked) {
                            <fm-badge tone="warning">{{ l.totals.blocked }} out of use</fm-badge>
                        }
                        <span class="flex-1"></span>
                        <button *appCan="'manage'; on: 'Locker'" fmButton size="sm" (click)="newLocker.set(true)">
                            <fm-icon name="plus" size="1rem" />
                            Add a locker
                        </button>
                    </div>
                    <ul class="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                        @for (x of l.lockers; track x.oid) {
                            <li>
                                <button
                                    class="fm-focusable flex h-full w-full flex-col gap-1 rounded-lg border border-border bg-surface p-3 text-left hover:border-accent"
                                    type="button"
                                    [class.opacity-60]="x.status === 'Inactive'"
                                    (click)="openLocker(x)"
                                >
                                    <span class="flex items-center justify-between">
                                        <span class="font-semibold">{{ x.number }}</span>
                                        <span class="text-xs text-fg-subtle">{{ x.size }} · {{ x.monthly_fee | taka }}</span>
                                    </span>
                                    <fm-badge [tone]="tone[x.status]">{{ x.status === 'Blocked' ? 'Out of use' : x.status }}</fm-badge>
                                    @if (x.rental) {
                                        <span class="truncate text-xs" [class.text-warning-fg]="x.rental.ends_soon">
                                            {{ x.rental.member_name }} · to {{ x.rental.end_date | appDate }}
                                        </span>
                                    }
                                </button>
                            </li>
                        }
                    </ul>
                } @else {
                    <fm-skeleton height="16rem" />
                }
            </ng-template>
            <ng-template fmTab="rooms" label="Rooms">
                <fm-card flush>
                    <ul class="divide-y divide-border">
                        @for (r of rooms.value() ?? []; track r.oid) {
                            <li class="flex items-center gap-3 px-4 py-3">
                                <span class="min-w-0 flex-1">
                                    <span class="block font-medium">{{ r.name }}</span>
                                    <span class="text-xs text-fg-subtle">Holds {{ r.capacity }}</span>
                                </span>
                                @if (!r.active) {
                                    <fm-badge>Closed</fm-badge>
                                }
                                <button *appCan="'manage'; on: 'Room'" fmButton size="sm" variant="ghost" (click)="editRoom(r)">Edit</button>
                            </li>
                        }
                    </ul>
                </fm-card>
                <button *appCan="'manage'; on: 'Room'" class="mt-3" fmButton size="sm" (click)="editRoom(null)">
                    <fm-icon name="plus" size="1rem" />
                    Add a room
                </button>
            </ng-template>
            <ng-template fmTab="maintenance" label="Maintenance" [count]="blocks.value()?.blocks?.length ?? null">
                @if (blocks.value(); as b) {
                    @if (b.affected_classes.length) {
                        <fm-card class="mb-4" subtitle="Their rooms are blocked: move them or cancel them on the Classes page" title="Classes to move">
                            <ul class="flex flex-col gap-1 text-sm">
                                @for (c of b.affected_classes; track c.oid) {
                                    <li class="flex gap-2">
                                        <span class="flex-1">{{ c.title }} · {{ c.room_name }}</span>
                                        <span class="text-fg-subtle tabular-nums">{{ c.starts_at | appDate: 'EEE d MMM, h:mm a' }}</span>
                                        <fm-badge>{{ c.booked }} booked</fm-badge>
                                    </li>
                                }
                            </ul>
                        </fm-card>
                    }
                    <fm-card flush>
                        <ul class="divide-y divide-border">
                            @for (x of b.blocks; track x.oid) {
                                <li class="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                                    <fm-icon class="text-fg-subtle" name="wrench" size="1rem" />
                                    <span class="min-w-0 flex-1">
                                        <span class="block font-medium">{{ x.room_name ?? 'Locker ' + x.locker_number }} · {{ x.reason }}</span>
                                        <span class="text-xs text-fg-subtle">
                                            {{ x.starts_at | appDate: 'd MMM, h:mm a' }} – {{ x.ends_at | appDate: 'd MMM, h:mm a' }}
                                        </span>
                                    </span>
                                    @if (x.current) {
                                        <fm-badge tone="warning">Now</fm-badge>
                                    }
                                    @if (canBlock(x.room_oid ? 'room' : 'locker')) {
                                        <button fmButton size="sm" variant="ghost" (click)="unblock(x.oid)">Lift</button>
                                    }
                                </li>
                            } @empty {
                                <li class="px-4 py-6 text-sm text-fg-muted">Nothing is out of use.</li>
                            }
                        </ul>
                    </fm-card>
                    @if (canBlock('room') || canBlock('locker')) {
                        <fm-card class="mt-4" title="Take something out of use">
                            <div class="grid gap-3 sm:grid-cols-2">
                                <fm-field label="What">
                                    <fm-select
                                        ariaLabel="What"
                                        placeholder="Choose"
                                        [ngModel]="blockTarget()"
                                        [options]="targetOptions()"
                                        (ngModelChange)="blockTarget.set($event)"
                                    />
                                </fm-field>
                                <fm-field label="Reason">
                                    <input fmInput maxlength="300" [ngModel]="blockReason()" (ngModelChange)="blockReason.set($event)" />
                                </fm-field>
                                <fm-field label="From">
                                    <fm-date-picker [min]="today" [ngModel]="blockFrom()" (ngModelChange)="blockFrom.set($event)" />
                                </fm-field>
                                <fm-field hint="The block ends at the end of this day." label="Until">
                                    <fm-date-picker [min]="blockFrom() || today" [ngModel]="blockTo()" (ngModelChange)="blockTo.set($event)" />
                                </fm-field>
                            </div>
                            <div class="mt-3 flex justify-end">
                                <button
                                    fmButton
                                    variant="primary"
                                    [disabled]="!blockTarget() || blockReason().trim().length < 3 || !blockFrom()"
                                    (click)="block()"
                                >
                                    Block
                                </button>
                            </div>
                        </fm-card>
                    }
                } @else {
                    <fm-skeleton height="12rem" />
                }
            </ng-template>
        </fm-tabs>

        <fm-dialog
            [description]="selected() ? selected()!.size + ' · ' + (selected()!.monthly_fee | taka) + ' a month' : ''"
            [title]="'Locker ' + (selected()?.number ?? '')"
            [(open)]="drawer"
        >
            @if (selected(); as x) {
                <div class="grid gap-4 text-sm">
                    @if (x.rental; as r) {
                        <p>
                            Rented to
                            <strong>{{ r.member_name }}</strong>
                            ({{ r.member_code }}) from {{ r.start_date | appDate }} to {{ r.end_date | appDate }}.
                        </p>
                        <div *appCan="'update'; on: 'Locker'" class="flex justify-end">
                            <button fmButton variant="danger" [loading]="busy()" (click)="endRental(r.oid)">Take the key back</button>
                        </div>
                    } @else if (x.status === 'Free') {
                        <ng-container *appCan="'create'; on: 'Locker'">
                            <app-member-picker label="Rent to" (changed)="renter.set($event)" />
                            <div class="grid grid-cols-2 gap-3">
                                <fm-field label="Months">
                                    <fm-select ariaLabel="Months" [ngModel]="months()" [options]="monthOptions" (ngModelChange)="months.set($event)" />
                                </fm-field>
                                <fm-field hint="VAT is added on the invoice." label="Paid now">
                                    <fm-number-input taka [ngModel]="paid()" (ngModelChange)="paid.set($event ?? 0)" />
                                </fm-field>
                            </div>
                            <p class="text-fg-muted">{{ x.monthly_fee * months() | taka }} before VAT. Anything not paid now is recorded as dues.</p>
                            <div class="flex justify-end">
                                <button fmButton variant="primary" [disabled]="!renter()" [loading]="busy()" (click)="rent(x)">Rent</button>
                            </div>
                        </ng-container>
                    } @else if (x.blocked) {
                        <p>Out of use: {{ x.blocked.reason }}.</p>
                    }
                    @if (auth.can('manage', 'Locker')) {
                        <hr fmDivider />
                        <div class="grid grid-cols-2 gap-3">
                            <fm-field label="Size">
                                <fm-select ariaLabel="Size" [ngModel]="editSize()" [options]="sizes" (ngModelChange)="editSize.set($event)" />
                            </fm-field>
                            <fm-field label="Fee a month"><fm-number-input taka [ngModel]="editFee()" (ngModelChange)="editFee.set($event ?? 0)" /></fm-field>
                        </div>
                        <div class="flex justify-end gap-2">
                            <button fmButton (click)="saveLocker(x, { active: !x.active })">{{ x.active ? 'Take out of use' : 'Put back in use' }}</button>
                            <button fmButton variant="primary" (click)="saveLocker(x, { size: editSize(), monthly_fee: editFee() })">Save</button>
                        </div>
                    }
                </div>
            }
        </fm-dialog>

        <fm-dialog title="Add a locker" [(open)]="newLocker">
            <div class="grid grid-cols-3 gap-3">
                <fm-field label="Number"><input fmInput maxlength="10" [ngModel]="addNumber()" (ngModelChange)="addNumber.set($event)" /></fm-field>
                <fm-field label="Size"><fm-select ariaLabel="Size" [ngModel]="editSize()" [options]="sizes" (ngModelChange)="editSize.set($event)" /></fm-field>
                <fm-field label="Fee a month"><fm-number-input taka [ngModel]="editFee()" (ngModelChange)="editFee.set($event ?? 0)" /></fm-field>
            </div>
            <ng-container fmDialogFooter>
                <button fmButton (click)="newLocker.set(false)">Cancel</button>
                <button fmButton variant="primary" [disabled]="!addNumber().trim()" (click)="addLocker()">Add</button>
            </ng-container>
        </fm-dialog>

        <fm-dialog [title]="roomEdit()?.oid ? 'Edit ' + roomEdit()!.name : 'Add a room'" [(open)]="roomDialog">
            <div class="grid grid-cols-2 gap-3">
                <fm-field label="Name"><input fmInput maxlength="60" [ngModel]="roomName()" (ngModelChange)="roomName.set($event)" /></fm-field>
                <fm-field label="Holds"><fm-number-input [ngModel]="roomCapacity()" (ngModelChange)="roomCapacity.set($event ?? 1)" /></fm-field>
            </div>
            <ng-container fmDialogFooter>
                @if (roomEdit()?.oid) {
                    <button fmButton (click)="saveRoom({ active: !roomEdit()!.active })">{{ roomEdit()!.active ? 'Close the room' : 'Open the room' }}</button>
                }
                <button fmButton variant="primary" [disabled]="roomName().trim().length < 2" (click)="saveRoom({})">Save</button>
            </ng-container>
        </fm-dialog>
    `
})
export class FacilitiesPageComponent {
    private readonly _service = inject(SchedulingService);
    private readonly _router = inject(Router);
    private readonly _route = inject(ActivatedRoute);
    protected readonly auth = inject(AuthService);
    readonly tab = input<string>();
    protected readonly today = todayIso();
    protected readonly tone = STATUS_TONE;
    protected readonly lockers = rxResource({ stream: () => this._service.lockers() });
    protected readonly rooms = rxResource({ stream: () => this._service.rooms() });
    protected readonly blocks = rxResource({ stream: () => (this.auth.can('read', 'Room') ? this._service.maintenance() : of(null)) });
    protected readonly busy = signal(false);

    protected readonly drawer = signal(false);
    protected readonly selected = signal<Locker | null>(null);
    protected readonly renter = signal<MemberListItem | null>(null);
    protected readonly months = signal(1);
    protected readonly paid = signal(0);
    protected readonly monthOptions: SelectOption<number>[] = [1, 2, 3, 6, 12].map(n => ({ value: n, label: `${n} month${n === 1 ? '' : 's'}` }));
    protected readonly sizes: SelectOption<'S' | 'M' | 'L'>[] = [
        { value: 'S', label: 'Small' },
        { value: 'M', label: 'Medium' },
        { value: 'L', label: 'Large' }
    ];
    protected readonly editSize = signal<'S' | 'M' | 'L'>('S');
    protected readonly editFee = signal(300);
    protected readonly newLocker = signal(false);
    protected readonly addNumber = signal('');

    protected readonly roomDialog = signal(false);
    protected readonly roomEdit = signal<Room | null>(null);
    protected readonly roomName = signal('');
    protected readonly roomCapacity = signal(10);

    protected readonly blockTarget = signal<string>('');
    protected readonly blockReason = signal('');
    protected readonly blockFrom = signal(this.today);
    protected readonly blockTo = signal('');
    protected readonly targetOptions = computed<SelectOption<string>[]>(() => [
        ...(this.canBlock('room') ? (this.rooms.value() ?? []).map(r => ({ value: `room:${r.oid}`, label: r.name })) : []),
        ...(this.canBlock('locker') ? (this.lockers.value()?.lockers ?? []).map(l => ({ value: `locker:${l.oid}`, label: `Locker ${l.number}` })) : [])
    ]);

    protected setTab(tab: string): void {
        void this._router.navigate([], { relativeTo: this._route, queryParams: { tab }, queryParamsHandling: 'merge', replaceUrl: true });
    }

    protected canBlock(kind: 'room' | 'locker'): boolean {
        return this.auth.can('manage', kind === 'room' ? 'Room' : 'Locker');
    }

    protected openLocker(x: Locker): void {
        this.selected.set(x);
        this.renter.set(null);
        this.months.set(1);
        this.paid.set(0);
        this.editSize.set(x.size);
        this.editFee.set(x.monthly_fee);
        this.drawer.set(true);
    }

    protected rent(x: Locker): void {
        const m = this.renter();
        if (!m) return;
        this.busy.set(true);
        this._service.rent(x.oid, { member_oid: m.oid, months: this.months(), payment: { method: 'cash', amount: this.paid(), reference: null } }).subscribe({
            next: () => this._after(),
            error: () => this.busy.set(false)
        });
    }

    protected endRental(oid: string): void {
        this.busy.set(true);
        this._service.endRental(oid).subscribe({ next: () => this._after(), error: () => this.busy.set(false) });
    }

    protected saveLocker(x: Locker, patch: Partial<Pick<Locker, 'size' | 'monthly_fee' | 'active'>>): void {
        this._service.saveLocker(x.oid, patch).subscribe(() => this._after());
    }

    protected addLocker(): void {
        this._service.saveLocker(null, { number: this.addNumber().trim().toUpperCase(), size: this.editSize(), monthly_fee: this.editFee() }).subscribe(() => {
            this.newLocker.set(false);
            this.addNumber.set('');
            this.lockers.reload();
        });
    }

    protected editRoom(r: Room | null): void {
        this.roomEdit.set(r);
        this.roomName.set(r?.name ?? '');
        this.roomCapacity.set(r?.capacity ?? 10);
        this.roomDialog.set(true);
    }

    protected saveRoom(extra: Partial<Room>): void {
        const r = this.roomEdit();
        this._service.saveRoom(r?.oid ?? null, { name: this.roomName().trim(), capacity: this.roomCapacity(), ...extra }).subscribe(() => {
            this.roomDialog.set(false);
            this.rooms.reload();
        });
    }

    protected block(): void {
        const [kind, oid] = this.blockTarget().split(':');
        const to = this.blockTo() || this.blockFrom();
        this._service
            .block({
                ...(kind === 'room' ? { room_oid: oid } : { locker_oid: oid }),
                starts_at: `${this.blockFrom()}T00:00:00+06:00`,
                ends_at: `${to}T23:59:00+06:00`,
                reason: this.blockReason().trim()
            })
            .subscribe(() => {
                this.blockTarget.set('');
                this.blockReason.set('');
                this.blocks.reload();
                this.lockers.reload();
            });
    }

    protected unblock(oid: string): void {
        this._service.unblock(oid).subscribe(() => {
            this.blocks.reload();
            this.lockers.reload();
        });
    }

    private _after(): void {
        this.busy.set(false);
        this.drawer.set(false);
        this.lockers.reload();
    }
}
