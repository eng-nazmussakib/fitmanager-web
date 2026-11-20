import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { catchError, debounceTime, map, of, switchMap } from 'rxjs';

import type { MemberListItem } from '@core/models/member.model';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { FieldComponent, InputDirective, PrefixDirective } from '@shared/ui/forms/field.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

import { ConsoleService } from './console.service';

/**
 * Search the branch's members by name, phone or code and pick one (PT bookings, locker rentals). Presentational
 * apart from the search call; the picked member is emitted, and shown until it is cleared.
 */
@Component({
    selector: 'app-member-picker',
    imports: [FormsModule, ButtonComponent, FieldComponent, InputDirective, PrefixDirective, IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (picked(); as m) {
            <div class="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                <span class="min-w-0 flex-1 text-sm">
                    <span class="block truncate font-medium">{{ m.name }}</span>
                    <span class="text-xs text-fg-subtle">{{ m.code }} · {{ m.status }}</span>
                </span>
                <button type="button" fmButton size="sm" variant="ghost" (click)="clear()">Change</button>
            </div>
        } @else {
            <fm-field [label]="label()">
                <fm-icon class="text-fg-subtle" name="search" fmPrefix />
                <input autocomplete="off" fmInput placeholder="Name, phone or member code" [ngModel]="query()" (ngModelChange)="query.set($event)" />
            </fm-field>
            @if (matches().length) {
                <ul class="mt-1 flex flex-col rounded-lg border border-border" aria-label="Matching members">
                    @for (m of matches(); track m.oid) {
                        <li class="border-b border-border last:border-0">
                            <button
                                class="fm-focusable flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-sunken"
                                type="button"
                                (click)="pick(m)"
                            >
                                <span class="min-w-0 flex-1 text-sm">
                                    <span class="block truncate">{{ m.name }}</span>
                                    <span class="text-xs text-fg-subtle">{{ m.code }} · {{ m.status }}</span>
                                </span>
                                <fm-icon class="text-fg-subtle" name="chevron-right" size="1rem" />
                            </button>
                        </li>
                    }
                </ul>
            }
        }
    `
})
export class MemberPickerComponent {
    private readonly _console = inject(ConsoleService);
    readonly label = input('Member');
    /** Only members in this status (e.g. Active). */
    readonly status = input<string>('');
    readonly picked = signal<MemberListItem | null>(null);
    readonly changed = output<MemberListItem | null>();
    protected readonly query = signal('');
    private readonly _matches = signal<MemberListItem[]>([]);
    protected readonly matches = this._matches.asReadonly();

    constructor() {
        toObservable(this.query)
            .pipe(
                debounceTime(250),
                map(q => q.trim()),
                switchMap(q =>
                    q.length < 2
                        ? of([])
                        : this._console.members({ q, size: 6, status: (this.status() || undefined) as never }).pipe(
                              map(p => p.rows),
                              catchError(() => of([]))
                          )
                ),
                takeUntilDestroyed()
            )
            .subscribe(rows => this._matches.set(rows));
    }

    clear(): void {
        this.picked.set(null);
        this.changed.emit(null);
    }

    protected pick(m: MemberListItem): void {
        this.picked.set(m);
        this.query.set('');
        this.changed.emit(m);
    }
}
