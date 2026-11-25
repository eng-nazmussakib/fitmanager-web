import { ApplicationConfig, mergeApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';

import { PRERENDER_API_ORIGIN } from '@features/public/public-content.service';

import { appConfig } from './app.config';
import { prerenderApiOrigin, serverRoutes } from './app.routes.server';

/**
 * Server-only providers: rendering with the per-route render modes. It runs only at build time: the public pages are
 * prerendered (D-026, D-075) and every other route renders in the browser. There is no Node server at run time.
 */
const serverConfig: ApplicationConfig = {
    providers: [
        provideServerRendering(withRoutes(serverRoutes)),
        // The public pages are prerendered from the live API's content (D-109, item 22 b).
        { provide: PRERENDER_API_ORIGIN, useFactory: prerenderApiOrigin }
    ]
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
