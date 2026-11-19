import { ApplicationConfig, mergeApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';

import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';

/**
 * Server-only providers: rendering with the per-route render modes. It runs only at build time: the public pages are
 * prerendered (D-026, D-075) and every other route renders in the browser. There is no Node server at run time.
 */
const serverConfig: ApplicationConfig = {
    providers: [provideServerRendering(withRoutes(serverRoutes))]
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
