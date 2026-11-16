import { inject, Injectable } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, RouterStateSnapshot, TitleStrategy } from '@angular/router';

import { TENANT } from '@config/tenant';

/**
 * Browser tab title: "<page> | <brand>". The page part is the route's `title` or, failing that, the deepest
 * `data.breadcrumb`, so most routes need nothing extra.
 */
@Injectable({ providedIn: 'root' })
export class AppTitleStrategy extends TitleStrategy {
    private readonly _title = inject(Title);

    override updateTitle(snapshot: RouterStateSnapshot): void {
        const page = this.buildTitle(snapshot) ?? deepestBreadcrumb(snapshot.root);
        this._title.setTitle(page ? `${page} | ${TENANT.brand.name}` : TENANT.brand.name);
    }
}

function deepestBreadcrumb(route: ActivatedRouteSnapshot): string | undefined {
    let label: string | undefined;
    for (let r: ActivatedRouteSnapshot | null = route; r; r = r.firstChild) {
        label = (r.data['breadcrumb'] as string | undefined) ?? label;
    }
    return label;
}
