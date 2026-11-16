import { Routes } from '@angular/router';

import { TENANT } from '@config/tenant';

import { slug } from './public-site.service';
import { sitePageGuard } from './site-page.guard';

/**
 * The public gym pages (indexable). Paths here must match PUBLIC_PATHS / the prerender params in
 * app.routes.server.ts. Titles come from the brand config.
 */
const landing = TENANT.landing!;

export const PUBLIC_BRANCH_SLUGS: string[] = landing.branches.items.map(b => slug(b.name));

export const PUBLIC_ROUTES: Routes = [
    { path: '', pathMatch: 'full', title: landing.seo.title, loadComponent: () => import('./landing/landing.component').then(m => m.LandingComponent) },
    { path: 'branches/:slug', canActivate: [sitePageGuard('branches')], title: 'Branch', loadComponent: () => import('./branch/branch-page.component').then(m => m.BranchPageComponent) },
    { path: 'plans', canActivate: [sitePageGuard('plans')], title: 'Membership plans', loadComponent: () => import('./plans/plans-page.component').then(m => m.PlansPageComponent) },
    { path: 'join', title: 'Join or ask a question', loadComponent: () => import('./join/join-page.component').then(m => m.JoinPageComponent) },
    { path: 'trainers', canActivate: [sitePageGuard('trainers')], title: landing.trainers.page.seo.title, loadComponent: () => import('./trainers/trainers-page.component').then(m => m.TrainersPageComponent) },
    { path: 'blog', canActivate: [sitePageGuard('blog')], title: landing.blog.page.seo.title, loadComponent: () => import('./blog/blog-page.component').then(m => m.BlogPageComponent) },
    { path: 'gallery', canActivate: [sitePageGuard('gallery')], title: landing.gallery.page.seo.title, loadComponent: () => import('./gallery/gallery-page.component').then(m => m.GalleryPageComponent) },
    // Extra pages from the config (offers, policies…), each at `/<slug>`.
    ...landing.pages.map(page => ({
        path: page.slug,
        title: page.seo.title,
        data: { slug: page.slug },
        loadComponent: () => import('./info/info-page.component').then(m => m.InfoPageComponent)
    }))
];
