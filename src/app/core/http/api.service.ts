import { HttpClient, HttpContext, HttpEvent, HttpParams, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { API } from '@core/constants/api-endpoints';
import { ApiResponse, DdlResponse, ListQuery, PageData } from '@core/models/api-response.model';
import { environment } from '@env/environment';

import { ApiError } from './api-error';
import { NotifyMode, withNotify } from './http-context.tokens';

export interface RequestOptions {
    notify?: NotifyMode;
    context?: HttpContext;
}

/**
 * Thin, typed wrapper around HttpClient.
 *
 * - Prefixes `environment.apiBaseUrl`.
 * - Unwraps the `{ code, message, data }` envelope and returns `data`, so callers get `T`, not `any`.
 * - Throws ApiError when the body `code` says failure, even on HTTP 200 (these backends do that).
 * - Toasts are NOT shown here. notifyInterceptor shows them, so HttpClient calls made outside this service get them too.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
    private readonly _http = inject(HttpClient);
    private readonly _baseUrl = environment.apiBaseUrl;

    get<T>(path: string, params?: Record<string, unknown>, options: RequestOptions = {}): Observable<T> {
        return this._http.get<ApiResponse<T>>(this._url(path), { params: toHttpParams(params), context: this._ctx(options, 'errors') }).pipe(unwrap());
    }

    /** Offset-paginated list. Empty filter values are dropped from the query string. */
    getPage<T>(path: string, query: ListQuery, options: RequestOptions = {}): Observable<PageData<T>> {
        return this.get<PageData<T>>(path, query, options);
    }

    post<T>(path: string, body: unknown, options: RequestOptions = {}): Observable<T> {
        return this._http.post<ApiResponse<T>>(this._url(path), body, { context: this._ctx(options, 'all') }).pipe(unwrap());
    }

    put<T>(path: string, body: unknown, options: RequestOptions = {}): Observable<T> {
        return this._http.put<ApiResponse<T>>(this._url(path), body, { context: this._ctx(options, 'all') }).pipe(unwrap());
    }

    patch<T>(path: string, body: unknown, options: RequestOptions = {}): Observable<T> {
        return this._http.patch<ApiResponse<T>>(this._url(path), body, { context: this._ctx(options, 'all') }).pipe(unwrap());
    }

    delete<T>(path: string, params?: Record<string, unknown>, options: RequestOptions = {}): Observable<T> {
        return this._http.delete<ApiResponse<T>>(this._url(path), { params: toHttpParams(params), context: this._ctx(options, 'all') }).pipe(unwrap());
    }

    /** Fetches dropdown lists by key in one round-trip. */
    ddl(keys: string[]): Observable<DdlResponse> {
        return this.get<DdlResponse>(API.DDL, { ddl_key: keys });
    }

    /** Binary download. Keep the full HttpResponse so the file name can be read from Content-Disposition. */
    download(path: string, params?: Record<string, unknown>): Observable<HttpResponse<Blob>> {
        return this._http.get(this._url(path), { params: toHttpParams(params), responseType: 'blob', observe: 'response', context: withNotify('errors') });
    }

    /** Multipart upload with progress events (`HttpEventType.UploadProgress`), for a progress bar. */
    upload<T>(path: string, formData: FormData): Observable<HttpEvent<ApiResponse<T>>> {
        return this._http.post<ApiResponse<T>>(this._url(path), formData, { reportUploadProgress: true, observe: 'events', context: withNotify('errors') });
    }

    private _url(path: string): string {
        return `${this._baseUrl}${path}`;
    }

    private _ctx(options: RequestOptions, fallback: NotifyMode): HttpContext {
        return withNotify(options.notify ?? fallback, options.context);
    }
}

function unwrap<T>(): (source: Observable<ApiResponse<T>>) => Observable<T> {
    return source =>
        source.pipe(
            map(res => {
                if (res.code >= 400) throw new ApiError(res.message, res.code, res);
                return res.data;
            })
        );
}

/** Builds HttpParams and drops null, undefined and '' (array values become repeated keys). */
export function toHttpParams(params?: Record<string, unknown>): HttpParams {
    let httpParams = new HttpParams();
    for (const [key, value] of Object.entries(params ?? {})) {
        if (value === null || value === undefined || value === '') continue;
        if (Array.isArray(value)) value.forEach((v: unknown) => (httpParams = httpParams.append(key, toParamString(v))));
        else httpParams = httpParams.set(key, toParamString(value));
    }
    return httpParams;
}

/** Query-string value: objects are sent as JSON instead of the useless "[object Object]". */
function toParamString(value: unknown): string {
    return typeof value === 'string' ? value : JSON.stringify(value);
}
