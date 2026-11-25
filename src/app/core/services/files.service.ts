import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable, switchMap } from 'rxjs';

import { ApiService } from '@core/http/api.service';
import { NOTIFY, SKIP_AUTH } from '@core/http/http-context.tokens';
import { environment } from '@env/environment';

export type FileKind =
    | 'member_photo'
    | 'member_document'
    | 'trainer_photo'
    | 'exercise_photo'
    | 'exercise_video'
    | 'measurement_photo'
    | 'incident_evidence'
    | 'complaint_photo'
    | 'product_photo'
    | 'equipment_photo'
    | 'ticket_photo'
    // Website images (post covers, gallery and branch photos), public once used.
    | 'site_image';

/** `POST /v1/files`: a pending file and where to PUT its bytes. */
interface UploadStart {
    file: { oid: string };
    upload: { url: string; method: 'PUT'; headers: Record<string, string>; expires_at: string };
}

/**
 * Member photos and documents: the bytes go straight from the browser to the file store with a
 * short-lived signed URL (the bucket's, or the API's own route in development), never through the API. Then the
 * API checks what arrived and marks it ready. The limits are the API's; the browser only resizes photos.
 */
@Injectable({ providedIn: 'root' })
export class FilesService {
    private readonly _api = inject(ApiService);
    private readonly _http = inject(HttpClient);

    /**
     * Uploads one file; emits the ready file's oid. `portal`: a member's own progress photo (`/v1/me/files`, at their
     * home branch).
     */
    upload(kind: FileKind, blob: Blob, name: string, memberOid?: string, portal = false): Observable<string> {
        const base = portal ? '/v1/me/files' : '/v1/files';
        return this._api
            .post<UploadStart>(
                base,
                { kind, name, content_type: blob.type, size: blob.size, ...(memberOid && !portal && { member_oid: memberOid }) },
                { notify: 'errors' }
            )
            .pipe(
                switchMap(start =>
                    this._http
                        .put(resolve(start.upload.url), blob, {
                            headers: start.upload.headers,
                            // Never send the bearer token to a bucket; the signature is the permission.
                            context: new HttpContext().set(SKIP_AUTH, true).set(NOTIFY, 'errors')
                        })
                        .pipe(
                            switchMap(() => this._api.post<{ oid: string }>(`${base}/${start.file.oid}/complete`, {}, { notify: 'errors' })),
                            map(f => f.oid)
                        )
                )
            );
    }
}

/** A relative upload URL is the API's own route (local store): resolve it against the API's origin. */
function resolve(url: string): string {
    if (/^https?:\/\//.test(url)) return url;
    const base = environment.apiBaseUrl;
    if (/^https?:\/\//.test(base)) return new URL(url, base).toString();
    return url;
}

/** `data:image/jpeg;base64,…` (the photo cropper's output) → a Blob for the upload. */
export function dataUrlToBlob(dataUrl: string): Blob {
    const [head, data = ''] = dataUrl.split(',');
    const type = /data:([^;]+)/.exec(head ?? '')?.[1] ?? 'application/octet-stream';
    const bytes = atob(data);
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) out[i] = bytes.charCodeAt(i);
    return new Blob([out], { type });
}
