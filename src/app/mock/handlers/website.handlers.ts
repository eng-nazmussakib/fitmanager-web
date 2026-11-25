import type { HttpResponse } from '@angular/common/http';

import type { BlogPost, GalleryPhoto, Offer } from '@core/models/website.model';

import { recordAudit } from '../audit';
import { type Ctx, fail, ok, qStr, type Route, str } from '../http';
import { commit, db, newOid } from '../store';
import type { GalleryRow, OfferRow, PostRow } from '../types';

/**
 * The website's content in demo mode (phase 7c, D-109), as the API answers: public reads (live posts, running offers,
 * photos), HQ's blog and offers, the gallery (HQ any branch, a manager their own), the branch description.
 */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const time = (iso: string): number => new Date(iso).getTime();
const atHq = (ctx: Ctx): boolean => ctx.branch?.kind === 'HQ';

function postWire(p: PostRow, nowIso: string, withBody: boolean): BlogPost {
    const c = db().postCategories.find(x => x.oid === p.category_oid);
    const file = p.cover_file_oid ? (db().files ?? []).find(f => f.oid === p.cover_file_oid) : null;
    const src = file?.url ?? p.cover_url;
    return {
        oid: p.oid,
        slug: p.slug,
        title: p.title,
        excerpt: p.excerpt,
        ...(withBody ? { body: p.body } : {}),
        category: c ? { oid: c.oid, name: c.name, slug: c.slug } : null,
        cover: src ? { src, alt: p.cover_alt } : null,
        cover_file_oid: p.cover_file_oid,
        author_name: p.author_name,
        published_at: p.published_at,
        status: !p.published_at ? 'draft' : time(p.published_at) > time(nowIso) ? 'scheduled' : 'published',
        updated_at: p.updated_at
    };
}

const live = (p: PostRow, nowIso: string): boolean => !p.deleted_at && !!p.published_at && time(p.published_at) <= time(nowIso);

function photoWire(g: GalleryRow): GalleryPhoto {
    const b = db().branches.find(x => x.oid === g.branch_oid)!;
    const file = g.file_oid ? (db().files ?? []).find(f => f.oid === g.file_oid) : null;
    const src = file?.url ?? g.image_url ?? '';
    return {
        oid: g.oid,
        branch: { oid: b.oid, slug: b.slug, name: b.name },
        src,
        thumb: g.thumb_url ?? src,
        alt: g.alt,
        width: g.width,
        height: g.height,
        sort_order: g.sort_order,
        file_oid: g.file_oid
    };
}

export function photosOf(branchSlug?: string): GalleryPhoto[] {
    const branches = db().branches.filter(b => b.kind === 'BRANCH' && (!branchSlug || b.slug === branchSlug));
    return db()
        .gallery.filter(g => !g.deleted_at && branches.some(b => b.oid === g.branch_oid))
        .sort((a, b) => {
            const na = branches.find(x => x.oid === a.branch_oid)!.name;
            const nb = branches.find(x => x.oid === b.branch_oid)!.name;
            return na.localeCompare(nb) || a.sort_order - b.sort_order;
        })
        .map(photoWire);
}

const offerWire = ({ deleted_at: _d, ...o }: OfferRow): Offer => o;

/* ---------- public ---------- */

function publicPosts(ctx: Ctx): HttpResponse<unknown> {
    const cat = qStr(ctx, 'category');
    const c = db().postCategories.find(x => x.slug === cat);
    return ok(
        db()
            .posts.filter(p => live(p, ctx.now.iso) && (!cat || p.category_oid === c?.oid))
            .sort((a, b) => time(b.published_at!) - time(a.published_at!))
            .map(p => postWire(p, ctx.now.iso, false))
    );
}

function publicPost(ctx: Ctx): HttpResponse<unknown> {
    const p = db().posts.find(x => x.slug === ctx.params[0] && live(x, ctx.now.iso));
    if (!p) fail(404, 'Post not found');
    return ok(postWire(p, ctx.now.iso, true));
}

function publicOffers(ctx: Ctx): HttpResponse<unknown> {
    const today = ctx.now.date;
    return ok(
        db()
            .offers.filter(o => !o.deleted_at && o.published && o.starts_on <= today && (!o.ends_on || o.ends_on >= today))
            .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title))
            .map(offerWire)
    );
}

/* ---------- HQ: posts, categories, offers ---------- */

function postBody(ctx: Ctx, before: PostRow | null): Partial<PostRow> {
    const b = ctx.body;
    const out: Partial<PostRow> = {};
    const text = (key: 'title' | 'excerpt', min: number, max: number): void => {
        if (b[key] === undefined && before) return;
        const v = str(b[key]);
        if (v.length < min || v.length > max) fail(400, `${key}: between ${min} and ${max} characters`);
        out[key] = v;
    };
    text('title', 3, 120);
    text('excerpt', 10, 300);
    if (b['slug'] !== undefined || !before) {
        const slug = str(b['slug']).toLowerCase();
        if (!SLUG.test(slug)) fail(400, 'The address: lower-case letters, digits and single dashes');
        if (db().posts.some(p => p.slug === slug && p.oid !== before?.oid)) fail(409, 'That address is taken');
        out.slug = slug;
    }
    if (b['body'] !== undefined || !before) out.body = typeof b['body'] === 'string' ? b['body'] : '';
    if (b['category_oid'] !== undefined) out.category_oid = (b['category_oid'] as string | null) ?? null;
    if (b['cover_file_oid'] !== undefined) {
        out.cover_file_oid = (b['cover_file_oid'] as string | null) ?? null;
        if (out.cover_file_oid) out.cover_url = null;
    }
    if (b['cover_url'] !== undefined && !out.cover_file_oid) out.cover_url = (b['cover_url'] as string | null) ?? null;
    if (b['cover_alt'] !== undefined) out.cover_alt = str(b['cover_alt']);
    if (b['published_at'] !== undefined) out.published_at = (b['published_at'] as string | null) ?? null;
    return out;
}

function createPost(ctx: Ctx): HttpResponse<unknown> {
    const fields = postBody(ctx, null);
    const row: PostRow = {
        oid: newOid('post'),
        branch_oid: ctx.branch!.oid,
        slug: '',
        title: '',
        excerpt: '',
        body: '',
        category_oid: null,
        cover_file_oid: null,
        cover_url: null,
        cover_alt: '',
        author_name: ctx.user?.name ?? 'HQ',
        published_at: null,
        created_at: ctx.now.iso,
        updated_at: ctx.now.iso,
        deleted_at: null,
        ...fields
    };
    commit({ t: 'put', table: 'posts', row });
    recordAudit(ctx, 'create', 'blog_post', row.slug, null, { title: row.title });
    return ok(postWire(row, ctx.now.iso, true), 'Post saved');
}

function postAt(ctx: Ctx): PostRow {
    const p = db().posts.find(x => x.oid === ctx.params[0] && !x.deleted_at);
    if (!p) fail(404, 'Post not found');
    return p;
}

function updatePost(ctx: Ctx): HttpResponse<unknown> {
    const before = postAt(ctx);
    const row: PostRow = { ...before, ...postBody(ctx, before), updated_at: ctx.now.iso };
    commit({ t: 'put', table: 'posts', row });
    recordAudit(ctx, 'update', 'blog_post', row.slug, { title: before.title }, { title: row.title });
    return ok(postWire(row, ctx.now.iso, true), 'Post saved');
}

function deletePost(ctx: Ctx): HttpResponse<unknown> {
    const before = postAt(ctx);
    commit({ t: 'put', table: 'posts', row: { ...before, deleted_at: ctx.now.iso, slug: `${before.slug}-deleted-${before.oid.slice(-6)}` } });
    recordAudit(ctx, 'delete', 'blog_post', before.slug, { title: before.title }, null);
    return ok(null, 'Post deleted');
}

function createCategory(ctx: Ctx): HttpResponse<unknown> {
    const name = str(ctx.body['name']);
    const slug = str(ctx.body['slug']).toLowerCase();
    if (name.length < 2 || !SLUG.test(slug)) fail(400, 'A name and an address');
    if (db().postCategories.some(c => c.slug === slug)) fail(409, 'That category exists');
    const row = { oid: newOid('cat'), name, slug, sort_order: db().postCategories.length + 1 };
    commit({ t: 'put', table: 'postCategories', row });
    recordAudit(ctx, 'create', 'blog_category', slug, null, { name });
    return ok({ oid: row.oid, name, slug }, 'Category added');
}

function offerBody(ctx: Ctx, before: OfferRow | null): OfferRow {
    const b = ctx.body;
    const pick = <K extends keyof OfferRow>(k: K, fallback: OfferRow[K]): OfferRow[K] =>
        b[k] === undefined ? (before?.[k] ?? fallback) : (b[k] as OfferRow[K]);
    const row: OfferRow = {
        oid: before?.oid ?? newOid('offer'),
        slug: str(pick('slug', '')).toLowerCase(),
        title: str(pick('title', '')),
        summary: str(pick('summary', '')),
        body: pick('body', ''),
        conditions: pick('conditions', []),
        promo_code: pick('promo_code', null),
        starts_on: pick('starts_on', ctx.now.date),
        ends_on: pick('ends_on', null),
        sort_order: pick('sort_order', 0),
        published: pick('published', true),
        deleted_at: null
    };
    if (!SLUG.test(row.slug)) fail(400, 'The address: lower-case letters, digits and single dashes');
    if (db().offers.some(o => o.slug === row.slug && o.oid !== row.oid)) fail(409, 'That address is taken');
    if (row.title.length < 3 || row.summary.length < 10) fail(400, 'A title and a summary');
    if (row.ends_on && row.ends_on < row.starts_on) fail(400, 'The end is before the start');
    if (row.promo_code && !db().promos.some(p => p.code === row.promo_code)) fail(400, 'No such promo code');
    return row;
}

function offerAt(ctx: Ctx): OfferRow {
    const o = db().offers.find(x => x.oid === ctx.params[0] && !x.deleted_at);
    if (!o) fail(404, 'Offer not found');
    return o;
}

function createOffer(ctx: Ctx): HttpResponse<unknown> {
    const row = offerBody(ctx, null);
    commit({ t: 'put', table: 'offers', row });
    recordAudit(ctx, 'create', 'offer', row.slug, null, offerWire(row));
    return ok(offerWire(row), 'Offer saved');
}

function updateOffer(ctx: Ctx): HttpResponse<unknown> {
    const before = offerAt(ctx);
    const row = offerBody(ctx, before);
    commit({ t: 'put', table: 'offers', row });
    recordAudit(ctx, 'update', 'offer', row.slug, offerWire(before), offerWire(row));
    return ok(offerWire(row), 'Offer saved');
}

function deleteOffer(ctx: Ctx): HttpResponse<unknown> {
    const before = offerAt(ctx);
    commit({ t: 'put', table: 'offers', row: { ...before, deleted_at: ctx.now.iso, slug: `${before.slug}-deleted-${before.oid.slice(-6)}` } });
    recordAudit(ctx, 'delete', 'offer', before.slug, { title: before.title }, null);
    return ok(null, 'Offer deleted');
}

/* ---------- the gallery and the branch page ---------- */

function galleryList(ctx: Ctx): HttpResponse<unknown> {
    const oid = atHq(ctx) ? qStr(ctx, 'branch_oid') : ctx.branch!.oid;
    const slug = oid ? db().branches.find(b => b.oid === oid)?.slug : undefined;
    return ok(photosOf(slug));
}

function addPhoto(ctx: Ctx): HttpResponse<unknown> {
    const branchOid = atHq(ctx) ? str(ctx.body['branch_oid']) : ctx.branch!.oid;
    const branch = db().branches.find(b => b.oid === branchOid && b.kind === 'BRANCH');
    if (!branch) fail(400, 'Choose a branch');
    const fileOid = str(ctx.body['file_oid']);
    const file = (db().files ?? []).find(f => f.oid === fileOid && f.kind === 'site_image' && f.status === 'ready');
    if (!file) fail(400, 'Upload the file first');
    const alt = str(ctx.body['alt']);
    if (alt.length < 3) fail(400, 'Describe the photo (at least 3 characters)');
    const row: GalleryRow = {
        oid: newOid('photo'),
        branch_oid: branch.oid,
        file_oid: fileOid,
        image_url: null,
        thumb_url: null,
        alt,
        width: Number(ctx.body['width'] ?? 640) || 640,
        height: Number(ctx.body['height'] ?? 480) || 480,
        sort_order: db().gallery.filter(g => g.branch_oid === branch.oid && !g.deleted_at).length + 1,
        deleted_at: null
    };
    commit({ t: 'put', table: 'gallery', row });
    recordAudit(ctx, 'create', 'gallery_item', branch.slug, null, { alt });
    return ok(photoWire(row), 'Photo added');
}

function photoAt(ctx: Ctx): GalleryRow {
    const g = db().gallery.find(x => x.oid === ctx.params[0] && !x.deleted_at);
    if (!g || (!atHq(ctx) && g.branch_oid !== ctx.branch!.oid)) fail(404, 'Photo not found');
    return g;
}

function updatePhoto(ctx: Ctx): HttpResponse<unknown> {
    const before = photoAt(ctx);
    const row: GalleryRow = {
        ...before,
        alt: ctx.body['alt'] === undefined ? before.alt : str(ctx.body['alt']),
        sort_order: ctx.body['sort_order'] === undefined ? before.sort_order : Number(ctx.body['sort_order'])
    };
    commit({ t: 'put', table: 'gallery', row });
    recordAudit(ctx, 'update', 'gallery_item', photoWire(row).branch.slug, { alt: before.alt }, { alt: row.alt });
    return ok(photoWire(row), 'Photo saved');
}

function removePhoto(ctx: Ctx): HttpResponse<unknown> {
    const before = photoAt(ctx);
    commit({ t: 'put', table: 'gallery', row: { ...before, deleted_at: ctx.now.iso } });
    recordAudit(ctx, 'delete', 'gallery_item', photoWire(before).branch.slug, { alt: before.alt }, null);
    return ok(null, 'Photo removed');
}

function setDescription(ctx: Ctx): HttpResponse<unknown> {
    const oid = atHq(ctx) ? qStr(ctx, 'branch_oid') : ctx.branch!.oid;
    const b = db().branches.find(x => x.oid === oid && x.kind === 'BRANCH');
    if (!b) fail(400, 'Choose a branch');
    const raw = ctx.body['description'];
    const text = typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, 4000) : null;
    const before = b.description ?? null;
    commit({ t: 'branch.description', oid: b.oid, description: text });
    recordAudit(ctx, 'update', 'branch_page', b.slug, { description: before }, { description: text });
    return ok({ description: text }, 'Branch page saved');
}

export const WEBSITE_ROUTES: Route[] = [
    { method: 'GET', path: /^\/v1\/public\/posts$/, scope: 'public', handler: publicPosts },
    { method: 'GET', path: /^\/v1\/public\/posts\/([\w-]+)$/, scope: 'public', handler: publicPost },
    {
        method: 'GET',
        path: /^\/v1\/public\/blog-categories$/,
        scope: 'public',
        handler: () => ok(db().postCategories.map(({ oid, name, slug }) => ({ oid, name, slug })))
    },
    { method: 'GET', path: /^\/v1\/public\/gallery$/, scope: 'public', handler: ctx => ok(photosOf(qStr(ctx, 'branch') || undefined)) },
    { method: 'GET', path: /^\/v1\/public\/offers$/, scope: 'public', handler: publicOffers },

    {
        method: 'GET',
        path: /^\/v1\/website\/posts$/,
        scope: 'hq',
        can: ['read', 'Website'],
        handler: ctx =>
            ok(
                db()
                    .posts.filter(p => !p.deleted_at)
                    .sort((a, b) => time(b.published_at ?? b.created_at) - time(a.published_at ?? a.created_at))
                    .map(p => postWire(p, ctx.now.iso, true))
            )
    },
    { method: 'POST', path: /^\/v1\/website\/posts$/, scope: 'hq', can: ['create', 'Website'], handler: createPost },
    { method: 'PATCH', path: /^\/v1\/website\/posts\/([\w-]+)$/, scope: 'hq', can: ['update', 'Website'], handler: updatePost },
    { method: 'DELETE', path: /^\/v1\/website\/posts\/([\w-]+)$/, scope: 'hq', can: ['delete', 'Website'], handler: deletePost },
    {
        method: 'GET',
        path: /^\/v1\/website\/categories$/,
        scope: 'staff',
        can: ['read', 'Website'],
        handler: () => ok(db().postCategories.map(({ oid, name, slug }) => ({ oid, name, slug })))
    },
    { method: 'POST', path: /^\/v1\/website\/categories$/, scope: 'hq', can: ['create', 'Website'], handler: createCategory },
    {
        method: 'GET',
        path: /^\/v1\/website\/offers$/,
        scope: 'hq',
        can: ['read', 'Website'],
        handler: () =>
            ok(
                db()
                    .offers.filter(o => !o.deleted_at)
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map(offerWire)
            )
    },
    { method: 'POST', path: /^\/v1\/website\/offers$/, scope: 'hq', can: ['create', 'Website'], handler: createOffer },
    { method: 'PATCH', path: /^\/v1\/website\/offers\/([\w-]+)$/, scope: 'hq', can: ['update', 'Website'], handler: updateOffer },
    { method: 'DELETE', path: /^\/v1\/website\/offers\/([\w-]+)$/, scope: 'hq', can: ['delete', 'Website'], handler: deleteOffer },
    { method: 'GET', path: /^\/v1\/website\/gallery$/, scope: 'staff', can: ['read', 'Website'], handler: galleryList },
    { method: 'POST', path: /^\/v1\/website\/gallery$/, scope: 'staff', can: ['update', 'Website'], handler: addPhoto },
    { method: 'PATCH', path: /^\/v1\/website\/gallery\/([\w-]+)$/, scope: 'staff', can: ['update', 'Website'], handler: updatePhoto },
    { method: 'DELETE', path: /^\/v1\/website\/gallery\/([\w-]+)$/, scope: 'staff', can: ['update', 'Website'], handler: removePhoto },
    { method: 'PUT', path: /^\/v1\/website\/branch$/, scope: 'staff', can: ['update', 'Website'], handler: setDescription }
];
