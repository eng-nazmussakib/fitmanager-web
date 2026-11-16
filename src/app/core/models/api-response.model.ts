/**
 * Every backend in these projects answers with the same envelope:
 *   { code: 200, message: 'Success', data: ... }
 * and list endpoints put `{ rows, count }` in `data`.
 * Typing it once removes the `res.body.data.rows` + `any` chains of the old code.
 */
export interface ApiResponse<T> {
    code: number;
    message: string;
    data: T;
}

export interface PageData<T> {
    rows: T[];
    count: number;
}

/** Query params for offset-based list endpoints. */
export interface ListQuery {
    offset: number;
    limit: number;
    search_text?: string;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
    [filter: string]: string | number | boolean | undefined | null;
}

/** A dropdown item. DDL endpoints return these. */
export interface LookupItem {
    oid: string;
    name: string;
}

export type DdlResponse = Record<string, LookupItem[]>;

/** Initial value for `toSignal(lookups$)` before the response arrives. */
export const EMPTY_DDL: DdlResponse = {};
