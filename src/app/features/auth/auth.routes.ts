import { importProvidersFrom } from '@angular/core';
import { Routes } from '@angular/router';
import { RECAPTCHA_V3_SITE_KEY, RecaptchaV3Module } from 'ng-recaptcha-2';

import { TENANT } from '@config/tenant';
import { environment } from '@env/environment';

/**
 * reCAPTCHA is provided on THIS route only (ARDS/TRP/ACAS provided it in main.ts).
 * Google's script then loads only on auth pages, not on every authenticated screen.
 * `ng-recaptcha-2` is the maintained fork. The original `ng-recaptcha` stopped at Angular 17.
 */
export const AUTH_ROUTES: Routes = [
    {
        path: '',
        providers: environment.recaptchaSiteKey
            ? [importProvidersFrom(RecaptchaV3Module), { provide: RECAPTCHA_V3_SITE_KEY, useValue: environment.recaptchaSiteKey }]
            : [],
        children: [
            { path: '', pathMatch: 'full', redirectTo: 'sign-in' },
            { path: 'sign-in', title: 'Sign in', loadComponent: () => import('./sign-in/sign-in.component').then(m => m.SignInComponent) },
            // Joining needs the branches and plans of the public site, so the page exists only with a landing page.
            ...(TENANT.landing
                ? [{ path: 'sign-up', title: 'Join', loadComponent: () => import('./sign-up/sign-up.component').then(m => m.SignUpComponent) }]
                : []),
            // OAuth redirect_uri (environment.auth.type === 'oauth'; not used by the FitManager builds yet).
            { path: 'callback', loadComponent: () => import('./oauth-callback/oauth-callback.component').then(m => m.OAuthCallbackComponent) }
        ]
    }
];
