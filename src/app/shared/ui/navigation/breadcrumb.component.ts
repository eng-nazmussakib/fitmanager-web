import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ActivatedRouteSnapshot, NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

export interface Crumb {
    label: string;
    url: string;
}

/** Crumbs from `data.breadcrumb` along the active route chain (a string, or a function of the route snapshot). */
export function routeCrumbs(root: ActivatedRoute): Crumb[] {
    const crumbs: Crumb[] = [];
    let route: ActivatedRouteSnapshot | null = root.snapshot;
    let url = '';
    while (route) {
        const segment = route.url.map(s => s.path).join('/');
        if (segment) url += `/${segment}`;
        const raw = route.routeConfig?.data?.['breadcrumb'] as string | ((r: ActivatedRouteSnapshot) => string) | undefined;
        const label = typeof raw === 'function' ? raw(route) : raw;
        if (label && crumbs.at(-1)?.label !== label) crumbs.push({ label, url: url || '/' });
        route = route.firstChild;
    }
    return crumbs;
}

/**
 * The page's place in the console, from the routes' `data.breadcrumb` (nothing hard-coded per page).
 * WAI-ARIA breadcrumb pattern: a labelled `<nav>`, and `aria-current="page"` on the last crumb.
 * Pass `items` to override the route-derived crumbs.
 */
@Component({
    selector: 'fm-breadcrumb',
    imports: [RouterLink],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (crumbs().length) {
            <nav class="fm-breadcrumb" aria-label="Breadcrumb">
                <ol>
                    @for (crumb of crumbs(); track crumb.url; let last = $last) {
                        <li class="flex items-center gap-1.5">
                            @if (last) {
                                <span aria-current="page">{{ crumb.label }}</span>
                            } @else {
                                <a [routerLink]="crumb.url">{{ crumb.label }}</a>
                                <span aria-hidden="true">/</span>
                            }
                        </li>
                    }
                </ol>
            </nav>
        }
    `
})
export class BreadcrumbComponent {
    private readonly _router = inject(Router);
    private readonly _route = inject(ActivatedRoute);

    readonly items = input<Crumb[] | null>(null);

    private readonly _fromRoutes = toSignal(
        this._router.events.pipe(
            filter(e => e instanceof NavigationEnd),
            startWith(null),
            map(() => routeCrumbs(this._route.root))
        ),
        { initialValue: [] as Crumb[] }
    );

    protected readonly crumbs = computed(() => this.items() ?? this._fromRoutes());
}
