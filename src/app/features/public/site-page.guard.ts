import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';

import { PublicContentService } from './public-content.service';
import { PublicSiteService } from './public-site.service';

/**
 * A public page that HQ can switch off (D-040): `/blog`, `/trainers`, `/gallery`, `/branches/:slug`, `/plans`.
 * When the page is off, the visitor lands on the group's landing section if that is on, else the top of the home
 * page. On the VM's server rendering this is a redirect; on a Cloudflare prerendered page it happens in the browser.
 */
export function sitePageGuard(group: string): CanActivateFn {
    return (_route, state) => {
        const site = inject(PublicSiteService);
        const router = inject(Router);
        return inject(PublicContentService)
            .siteGroups()
            .pipe(
                map(groups => {
                    if (groups) site.applyGroups(groups);
                    if (site.pageEnabled(group)) return true;
                    const to = site.target({ label: '', route: state.url });
                    return router.createUrlTree([to.route], { fragment: to.fragment });
                })
            );
    };
}
