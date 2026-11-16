import { ApplicationConfig, mergeApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';

import { API_INTERNAL_URL } from '@core/http/interceptors/server-api.interceptor';

import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';

/**
 * Server-only providers: server rendering with the per-route render modes, and the API's internal address for the
 * VM target (D-027). Prerendering on Cloudflare runs at build time with no API (the public pages fall back to the
 * brand config).
 */
const serverConfig: ApplicationConfig = {
    providers: [provideServerRendering(withRoutes(serverRoutes)), { provide: API_INTERNAL_URL, useFactory: () => process.env['API_INTERNAL_URL'] ?? null }]
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
