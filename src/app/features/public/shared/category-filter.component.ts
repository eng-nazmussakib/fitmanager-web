import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Category filter for a public page: "All" plus one pill per category, each with its item count. The choice lives in
 * the URL (`?category=…`), so a filtered page can be shared, bookmarked and crawled. The page reads it as an input.
 */
@Component({
    selector: 'app-category-filter',
    imports: [RouterLink],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'block' },
    template: `
        <nav class="wrap" [attr.aria-label]="label()">
            <ul class="flex flex-wrap justify-center gap-2 lg:gap-3">
                <li>
                    <a class="chip" routerLink="." [attr.aria-current]="active() === null" [queryParams]="{ category: null }">
                        All
                        <span class="chip-count">{{ total() }}</span>
                    </a>
                </li>
                @for (c of categories(); track c.name) {
                    <li>
                        <a class="chip" routerLink="." [attr.aria-current]="active() === c.name" [queryParams]="{ category: c.name }">
                            {{ c.name }}
                            <span class="chip-count">{{ c.count }}</span>
                        </a>
                    </li>
                }
            </ul>
        </nav>
    `
})
export class CategoryFilterComponent {
    readonly categories = input.required<{ name: string; count: number }[]>();
    /** The active category, or null for all. */
    readonly active = input.required<string | null>();
    readonly total = input.required<number>();
    readonly label = input('Filter by category');
}
