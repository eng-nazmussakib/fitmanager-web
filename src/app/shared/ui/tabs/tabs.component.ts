import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, contentChildren, Directive, inject, input, model, TemplateRef } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { RovingFocusDirective } from '../a11y/roving-focus.directive';

let nextId = 0;

/** One tab of `<fm-tabs>`: `<ng-template fmTab="payments" label="Payments">…</ng-template>` (rendered only while active). */
@Directive({ selector: 'ng-template[fmTab]' })
export class TabDirective {
    readonly template = inject<TemplateRef<unknown>>(TemplateRef);

    readonly fmTab = input.required<string>();
    readonly label = input.required<string>();
    /** A count shown next to the label. */
    readonly count = input<number | null>(null);
}

/**
 * Tabs (WAI-ARIA tabs pattern, automatic activation): ←/→ move and select, Home/End jump to the ends; only the
 * selected tab is in the Tab order. Bind `[(active)]` to the tab id; keep it in a query param to make it shareable.
 *
 *   <fm-tabs [(active)]="tab">
 *     <ng-template fmTab="overview" label="Overview">…</ng-template>
 *     <ng-template fmTab="payments" label="Payments" [count]="3">…</ng-template>
 *   </fm-tabs>
 */
@Component({
    selector: 'fm-tabs',
    imports: [NgTemplateOutlet, RovingFocusDirective],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'block' },
    template: `
        <div class="fm-tabs" fmRovingFocus itemSelector="[role=tab]" orientation="horizontal" role="tablist" [attr.aria-label]="label() || null">
            @for (tab of tabs(); track tab.fmTab()) {
                <button
                    class="fm-tab"
                    type="button"
                    role="tab"
                    [attr.aria-controls]="prefix + '-panel-' + tab.fmTab()"
                    [attr.aria-selected]="tab.fmTab() === current()"
                    [id]="prefix + '-tab-' + tab.fmTab()"
                    [tabIndex]="tab.fmTab() === current() ? 0 : -1"
                    (click)="active.set(tab.fmTab())"
                    (focus)="active.set(tab.fmTab())"
                >
                    {{ tab.label() }}
                    @if (tab.count() !== null) {
                        <span class="fm-badge ml-1.5 h-5 px-1.5">{{ tab.count() }}</span>
                    }
                </button>
            }
        </div>
        @for (tab of tabs(); track tab.fmTab()) {
            @if (tab.fmTab() === current()) {
                <div
                    class="pt-4 focus-visible:outline-none"
                    role="tabpanel"
                    tabindex="0"
                    [attr.aria-labelledby]="prefix + '-tab-' + tab.fmTab()"
                    [id]="prefix + '-panel-' + tab.fmTab()"
                >
                    <ng-container [ngTemplateOutlet]="tab.template" />
                </div>
            }
        }
    `
})
export class TabsComponent {
    protected readonly tabs = contentChildren(TabDirective);
    protected readonly prefix = `fm-tabs-${nextId++}`;

    readonly active = model<string>('');
    readonly label = input<string>();

    /** The active id, or the first tab when it names none. */
    protected readonly current = computed(() => {
        const id = this.active();
        const tabs = this.tabs();
        return tabs.some(t => t.fmTab() === id) ? id : (tabs[0]?.fmTab() ?? '');
    });
}

export interface NavTab {
    label: string;
    link: string | unknown[];
    exact?: boolean;
}

/**
 * Tabs that are links (sub-pages with their own URL): a `<nav>` with `aria-current="page"` on the active link,
 * styled like `<fm-tabs>`. Use it when each tab is a route; use `<fm-tabs>` for panels on one page.
 */
@Component({
    selector: 'fm-tab-nav',
    imports: [RouterLink, RouterLinkActive],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <nav [attr.aria-label]="label()">
            <div class="fm-tabs">
                @for (tab of tabs(); track tab.label) {
                    <a
                        #rla="routerLinkActive"
                        class="fm-tab"
                        ariaCurrentWhenActive="page"
                        routerLinkActive
                        [attr.aria-selected]="rla.isActive"
                        [routerLink]="tab.link"
                        [routerLinkActiveOptions]="{ exact: tab.exact ?? false }"
                    >
                        {{ tab.label }}
                    </a>
                }
            </div>
        </nav>
    `
})
export class TabNavComponent {
    readonly tabs = input.required<NavTab[]>();
    readonly label = input('Sections');
}
