import { Routes } from '@angular/router';

import { TENANT } from '@config/tenant';

/** Sign-in is username and password only (D-054, D-064): no reCAPTCHA, no outside identity provider (D-075). */
export const AUTH_ROUTES: Routes = [
    { path: '', pathMatch: 'full', redirectTo: 'sign-in' },
    { path: 'sign-in', title: 'Sign in', loadComponent: () => import('./sign-in/sign-in.component').then(m => m.SignInComponent) },
    // Joining needs the branches and plans of the public site, so the page exists only with a landing page.
    ...(TENANT.landing ? [{ path: 'sign-up', title: 'Join', loadComponent: () => import('./sign-up/sign-up.component').then(m => m.SignUpComponent) }] : [])
];
