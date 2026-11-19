import { JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { ignoreHandledApiError } from '@core/http/api-error';
import type { AuditEntry } from '@core/models/staff.model';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { BadgeComponent, CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { EmptyStateComponent } from '@shared/ui/feedback/empty-state.component';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';

import { type StaffLevel, StaffService } from './staff.service';

/** What happened, in words. Unknown actions show as they are. */
const ACTIONS: Record<string, string> = {
    create: 'Added',
    update: 'Changed',
    assign: 'Changed roles',
    unassign: 'Removed from branch',
    deactivate: 'Deactivated',
    activate: 'Activated',
    reset_password: 'Reset password',
    sign_out: 'Signed out everywhere'
};
const ENTITIES: Record<string, string> = { staff: 'Staff', site_group: 'Public site' };

/**
 * `/hq/audit` and `/console/:branch/audit` (phase 1): the append-only log of every change, newest first. HQ sees every
 * branch it reaches (and can pick one); a branch manager sees their branch. Paged with the API's cursor ("Load more").
 */
@Component({
    selector: 'app-audit-page',
    imports: [
        FormsModule,
        JsonPipe,
        PageHeaderComponent,
        AppDatePipe,
        ButtonComponent,
        BadgeComponent,
        CardComponent,
        SkeletonComponent,
        EmptyStateComponent,
        FieldComponent,
        InputDirective,
        SelectComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <app-page-header subtitle="Every change, who made it and when. Entries cannot be edited or deleted." title="Audit log" />

        <div class="mb-4 grid gap-3" [class]="level() === 'hq' ? 'sm:grid-cols-4' : 'sm:grid-cols-3'">
            @if (level() === 'hq') {
                <fm-field label="Branch">
                    <fm-select placeholder="Every branch" [ngModel]="branch()" [options]="branchOptions()" (ngModelChange)="branch.set($event)" />
                </fm-field>
            }
            <fm-field label="What">
                <fm-select placeholder="Everything" [ngModel]="entity()" [options]="entityOptions" (ngModelChange)="entity.set($event)" />
            </fm-field>
            <fm-field label="From">
                <input type="date" fmInput [ngModel]="from()" (ngModelChange)="from.set($event)" />
            </fm-field>
            <fm-field label="To">
                <input type="date" fmInput [ngModel]="to()" (ngModelChange)="to.set($event)" />
            </fm-field>
        </div>

        @if (rows().length) {
            <fm-card>
                <ul class="divide-y divide-border">
                    @for (r of rows(); track r.oid) {
                        <li class="py-3 first:pt-0 last:pb-0">
                            <button
                                class="flex w-full cursor-pointer items-start justify-between gap-3 text-left"
                                type="button"
                                [attr.aria-expanded]="open() === r.oid"
                                (click)="toggle(r.oid)"
                            >
                                <span class="min-w-0">
                                    <span class="block text-sm">
                                        <strong>{{ r.actor_name ?? 'System' }}</strong>
                                        · {{ actionLabel(r.action) }}
                                        <span class="text-fg-muted">{{ subject(r) }}</span>
                                    </span>
                                    <span class="block text-xs text-fg-subtle">{{ r.created_at | appDate: 'dd MMM yyyy, h:mm a' }}</span>
                                </span>
                                <fm-badge [tone]="r.branch_code === 'HQ' ? 'primary' : 'neutral'">{{ r.branch_code }}</fm-badge>
                            </button>
                            @if (open() === r.oid) {
                                <div class="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                                    <div>
                                        <p class="mb-1 font-medium text-fg-muted">Before</p>
                                        <pre class="overflow-x-auto rounded-md bg-surface-sunken p-2">{{ r.before | json }}</pre>
                                    </div>
                                    <div>
                                        <p class="mb-1 font-medium text-fg-muted">After</p>
                                        <pre class="overflow-x-auto rounded-md bg-surface-sunken p-2">{{ r.after | json }}</pre>
                                    </div>
                                    @if (r.request_id) {
                                        <p class="text-fg-subtle sm:col-span-2">Request {{ r.request_id }}</p>
                                    }
                                </div>
                            }
                        </li>
                    }
                </ul>
            </fm-card>
            @if (next()) {
                <div class="mt-4 flex justify-center">
                    <button fmButton [loading]="loading()" (click)="loadMore()">Load more</button>
                </div>
            }
        } @else if (loading()) {
            <fm-skeleton height="12rem" />
        } @else {
            <fm-empty-state description="Changes appear here as people make them." icon="inbox" title="Nothing logged yet" />
        }
    `
})
export class AuditPageComponent {
    private readonly _staff = inject(StaffService);
    private readonly _auth = inject(AuthService);

    readonly level = input<StaffLevel>('branch');

    protected readonly branch = signal('');
    protected readonly entity = signal('');
    protected readonly from = signal('');
    protected readonly to = signal('');
    protected readonly rows = signal<AuditEntry[]>([]);
    protected readonly next = signal<string | null>(null);
    protected readonly loading = signal(false);
    protected readonly open = signal<string | null>(null);

    protected readonly entityOptions: SelectOption<string>[] = [
        { value: '', label: 'Everything' },
        ...Object.entries(ENTITIES).map(([value, label]) => ({ value, label }))
    ];
    /** HQ: the branches the user reaches (the API's RLS context is the same set). */
    protected readonly branchOptions = computed<SelectOption<string>[]>(() => [
        { value: '', label: 'Every branch' },
        ...(this._auth.user()?.assignments ?? []).map(a => ({ value: a.branch.oid, label: a.branch.kind === 'HQ' ? 'Head office' : a.branch.name }))
    ]);
    private readonly _query = computed(() => ({
        branch_oid: this.level() === 'hq' ? this.branch() || undefined : undefined,
        entity: this.entity() || undefined,
        from: this.from() || undefined,
        to: this.to() || undefined
    }));

    constructor() {
        // A new filter starts the list again from the newest entry.
        effect(() => {
            const query = this._query();
            this.rows.set([]);
            this.next.set(null);
            this._load(query, undefined);
        });
    }

    protected loadMore(): void {
        const cursor = this.next();
        if (cursor) this._load(this._query(), cursor);
    }

    protected toggle(oid: string): void {
        this.open.update(o => (o === oid ? null : oid));
    }

    protected actionLabel(action: string): string {
        return ACTIONS[action] ?? action.replace(/_/g, ' ');
    }

    /** The changed thing: a staff member's name from the entry itself, or the entity and its key. */
    protected subject(r: AuditEntry): string {
        const named = (r.after ?? r.before) as { name?: unknown } | null;
        const name = typeof named?.name === 'string' ? named.name : r.entity_key;
        return `${ENTITIES[r.entity] ?? r.entity}: ${name}`;
    }

    private _load(query: Record<string, string | undefined>, before: string | undefined): void {
        this.loading.set(true);
        this._staff
            .audit(this.level(), { ...query, before, limit: 50 })
            .pipe(finalize(() => this.loading.set(false)))
            .subscribe({
                next: page => {
                    this.rows.update(list => (before ? [...list, ...page.rows] : page.rows));
                    this.next.set(page.next);
                },
                error: ignoreHandledApiError
            });
    }
}
