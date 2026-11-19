import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideClientHydration } from '@angular/platform-browser';
import { provideRouter, TitleStrategy, withComponentInputBinding, withInMemoryScrolling, withRouterConfig } from '@angular/router';

import { provideAppHttpClient } from '@core/http/provide-app-http';
import { AppTitleStrategy } from '@core/routing/app-title.strategy';
import { ThemeService } from '@core/services/theme.service';

import { routes } from './app.routes';

/**
 * Application-wide providers, shared by the browser and the server (app.config.server.ts adds server rendering).
 * Standalone APIs only, no NgModules, and no UI component library (D-007): overlays, toasts and dialogs are the
 * in-house kit in `@shared/ui`, which needs no providers.
 *
 * Change detection is zoneless (Angular 21+ default, no zone.js). Every component is OnPush and state lives in signals.
 */
export const appConfig: ApplicationConfig = {
    providers: [
        provideBrowserGlobalErrorListeners(),
        provideRouter(
            routes,
            withComponentInputBinding(), // route params & query params → component input()s
            withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' }),
            // onSameUrlNavigation 'reload': clicking the same #section link again scrolls to it again (guards and resolvers are not re-run).
            withRouterConfig({ paramsInheritanceStrategy: 'always', onSameUrlNavigation: 'reload' })
        ),
        // Public pages are prerendered at build time and hydrated in the browser.
        // Incremental hydration and event replay are on by default (Angular 22): a click before the bundle loads is not lost.
        provideClientHydration(),
        // "<page> | <brand>" tab titles from the route `title` (or the deepest `data.breadcrumb`).
        { provide: TitleStrategy, useClass: AppTitleStrategy },
        // Applies the colour theme (CSS variables) before the first render, on the server too.
        provideAppInitializer(() => void inject(ThemeService)),
        provideAppHttpClient() // XHR backend for upload progress; interceptors (see provide-app-http.ts)
    ]
};
