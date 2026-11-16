import { EnvironmentProviders, ErrorHandler, inject, provideAppInitializer, Provider } from '@angular/core';
import { Router } from '@angular/router';
import * as Sentry from '@sentry/angular';

import { environment } from '@env/environment';

/**
 * Sentry setup (SPN / OMS / Policy-Repo).
 * Changes vs. the old code:
 * - The DSN comes from the environment file, not a literal in main.ts. An empty DSN means Sentry is off,
 *   so local runs do not send events.
 * - No `sendDefaultPii: true` (OMS turned it on). These are government/finance apps; Sentry's default sends no IPs/cookies.
 * - `provideAppInitializer` replaces the deprecated `APP_INITIALIZER` + empty factory.
 */
export function initSentry(): void {
    if (!environment.sentryDsn) return;
    Sentry.init({
        dsn: environment.sentryDsn,
        environment: environment.name,
        integrations: [Sentry.browserTracingIntegration()],
        tracesSampleRate: environment.production ? 0.1 : 1.0
    });
}

export function provideSentry(): (Provider | EnvironmentProviders)[] {
    if (!environment.sentryDsn) return [];
    return [
        { provide: ErrorHandler, useValue: Sentry.createErrorHandler({ showDialog: false }) },
        { provide: Sentry.TraceService, deps: [Router] },
        provideAppInitializer(() => {
            inject(Sentry.TraceService);
        })
    ];
}
