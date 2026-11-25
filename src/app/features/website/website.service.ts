import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiService } from '@core/http/api.service';
import type { BlogCategory, BlogPost, GalleryPhoto, Offer, OfferPayload, PostPayload } from '@core/models/website.model';

/** The website's content for HQ and branch managers: `/v1/website/*` and `/v1/hq/website/*`. */
@Injectable({ providedIn: 'root' })
export class WebsiteService {
    private readonly _api = inject(ApiService);

    posts(): Observable<BlogPost[]> {
        return this._api.get<BlogPost[]>('/v1/website/posts');
    }
    createPost(body: PostPayload): Observable<BlogPost> {
        return this._api.post<BlogPost>('/v1/website/posts', body);
    }
    updatePost(oid: string, body: Partial<PostPayload>): Observable<BlogPost> {
        return this._api.patch<BlogPost>(`/v1/website/posts/${oid}`, body);
    }
    deletePost(oid: string): Observable<null> {
        return this._api.delete<null>(`/v1/website/posts/${oid}`);
    }
    categories(): Observable<BlogCategory[]> {
        return this._api.get<BlogCategory[]>('/v1/website/categories');
    }
    addCategory(name: string, slug: string): Observable<BlogCategory> {
        return this._api.post<BlogCategory>('/v1/website/categories', { name, slug });
    }

    offers(): Observable<Offer[]> {
        return this._api.get<Offer[]>('/v1/website/offers');
    }
    createOffer(body: OfferPayload): Observable<Offer> {
        return this._api.post<Offer>('/v1/website/offers', body);
    }
    updateOffer(oid: string, body: Partial<OfferPayload>): Observable<Offer> {
        return this._api.patch<Offer>(`/v1/website/offers/${oid}`, body);
    }
    deleteOffer(oid: string): Observable<null> {
        return this._api.delete<null>(`/v1/website/offers/${oid}`);
    }

    /** At HQ: one branch's photos (`branchOid`) or all; at a branch: its own. */
    gallery(branchOid?: string): Observable<GalleryPhoto[]> {
        return this._api.get<GalleryPhoto[]>('/v1/website/gallery', branchOid ? { branch_oid: branchOid } : undefined);
    }
    addPhoto(body: { branch_oid?: string; file_oid: string; alt: string; width: number; height: number }): Observable<GalleryPhoto> {
        return this._api.post<GalleryPhoto>('/v1/website/gallery', body);
    }
    updatePhoto(oid: string, body: { alt?: string; sort_order?: number }): Observable<GalleryPhoto> {
        return this._api.patch<GalleryPhoto>(`/v1/website/gallery/${oid}`, body);
    }
    removePhoto(oid: string): Observable<null> {
        return this._api.delete<null>(`/v1/website/gallery/${oid}`);
    }
    /** A branch's profile (`GET /v1/branches/:oid`), for the text on its page. */
    branch(oid: string): Observable<{ description?: string | null }> {
        return this._api.get<{ description?: string | null }>(`/v1/branches/${oid}`);
    }
    /** The branch page's text: the active branch's, or at HQ the one named. */
    setDescription(description: string | null, branchOid?: string): Observable<{ description: string | null }> {
        return this._api.put<{ description: string | null }>(`/v1/website/branch${branchOid ? `?branch_oid=${branchOid}` : ''}`, { description });
    }
}
