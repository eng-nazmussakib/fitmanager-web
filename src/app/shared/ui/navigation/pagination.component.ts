import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { APP } from '@core/constants/app.constants';

import { SelectComponent, type SelectOption } from '../forms/select.component';
import { IconComponent } from '../icon/icon.component';

/** Page numbers to show around `current`, with `null` for a gap: 1 … 4 5 [6] 7 8 … 20. */
export function pageWindow(current: number, count: number): (number | null)[] {
    if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
    const pages = new Set([1, count, current - 1, current, current + 1]);
    if (current <= 4) [2, 3, 4, 5].forEach(p => pages.add(p));
    if (current >= count - 3) [count - 4, count - 3, count - 2, count - 1].forEach(p => pages.add(p));
    const sorted = [...pages].filter(p => p >= 1 && p <= count).sort((a, b) => a - b);
    const out: (number | null)[] = [];
    sorted.forEach((p, i) => {
        if (i && p - sorted[i - 1] > 1) out.push(null);
        out.push(p);
    });
    return out;
}

/**
 * `<fm-pagination [total]="250" [(pageIndex)]="page" [(pageSize)]="size" />`: 1-based pages for server-side lists.
 * A labelled `<nav>`; the current page has `aria-current="page"`.
 */
@Component({
    selector: 'fm-pagination',
    imports: [FormsModule, IconComponent, SelectComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'fm-pagination' },
    template: `
        <p aria-live="polite">
            @if (total()) {
                {{ from() }}–{{ to() }} of {{ total() }}
            } @else {
                No results
            }
        </p>
        <div class="flex flex-wrap items-center gap-3">
            @if (showSize()) {
                <div class="w-32">
                    <fm-select ariaLabel="Rows per page" [ngModel]="pageSize()" [options]="sizeOptions()" (ngModelChange)="setSize($event)" />
                </div>
            }
            <nav aria-label="Pagination">
                <ul>
                    <li>
                        <button class="fm-page-btn" type="button" aria-label="Previous page" [disabled]="pageIndex() <= 1" (click)="go(pageIndex() - 1)">
                            <fm-icon name="chevron-left" size="1rem" />
                        </button>
                    </li>
                    @for (p of pages(); track $index) {
                        <li>
                            @if (p === null) {
                                <span class="fm-page-btn cursor-default" aria-hidden="true">…</span>
                            } @else {
                                <button
                                    class="fm-page-btn"
                                    type="button"
                                    [attr.aria-current]="p === pageIndex() ? 'page' : null"
                                    [attr.aria-label]="'Page ' + p"
                                    (click)="go(p)"
                                >
                                    {{ p }}
                                </button>
                            }
                        </li>
                    }
                    <li>
                        <button class="fm-page-btn" type="button" aria-label="Next page" [disabled]="pageIndex() >= pageCount()" (click)="go(pageIndex() + 1)">
                            <fm-icon name="chevron-right" size="1rem" />
                        </button>
                    </li>
                </ul>
            </nav>
        </div>
    `
})
export class PaginationComponent {
    readonly total = input(0);
    readonly pageIndex = model(1);
    readonly pageSize = model<number>(APP.PAGE_SIZE);
    readonly pageSizeOptions = input<readonly number[]>(APP.PAGE_SIZE_OPTIONS);
    readonly showSize = input(true);

    protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
    protected readonly pages = computed(() => pageWindow(Math.min(this.pageIndex(), this.pageCount()), this.pageCount()));
    protected readonly from = computed(() => (this.total() ? (this.pageIndex() - 1) * this.pageSize() + 1 : 0));
    protected readonly to = computed(() => Math.min(this.total(), this.pageIndex() * this.pageSize()));
    protected readonly sizeOptions = computed<SelectOption<number>[]>(() => this.pageSizeOptions().map(n => ({ value: n, label: `${n} / page` })));

    protected go(page: number): void {
        const p = Math.min(Math.max(1, page), this.pageCount());
        if (p !== this.pageIndex()) this.pageIndex.set(p);
    }

    protected setSize(size: number | null): void {
        if (!size || size === this.pageSize()) return;
        this.pageSize.set(size);
        this.pageIndex.set(1);
    }
}
