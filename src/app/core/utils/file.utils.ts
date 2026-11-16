import { HttpResponse } from '@angular/common/http';
import { saveAs } from 'file-saver';

/**
 * Saves a blob response and takes the file name from `Content-Disposition` when the server sends it.
 * Used for report / pay-slip / Excel downloads (OMS, SIB, Policy-Repo).
 */
export function saveHttpBlob(res: HttpResponse<Blob>, fallbackName: string): void {
    if (!res.body) return;
    saveAs(res.body, fileNameFromDisposition(res.headers.get('Content-Disposition')) ?? fallbackName);
}

export function fileNameFromDisposition(header: string | null): string | null {
    if (!header) return null;
    const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header);
    if (utf8) return decodeURIComponent(utf8[1]);
    const plain = /filename="?([^";]+)"?/i.exec(header);
    return plain ? plain[1] : null;
}

/**
 * Client-side CSV export. The UTF-8 BOM lets Excel show non-ASCII text (e.g. ৳) correctly; without it Excel
 * decodes the file as Windows-1252 and such characters turn into garbage.
 */
export function exportCsv<T extends object>(rows: T[], columns: { key: keyof T; header: string }[], fileName: string): void {
    const escape = (v: unknown): string =>
        `"${(typeof v === 'object' && v !== null ? JSON.stringify(v) : String((v as string | number | boolean | null | undefined) ?? '')).replace(/"/g, '""')}"`;
    const lines = [columns.map(c => escape(c.header)).join(','), ...rows.map(r => columns.map(c => escape(r[c.key])).join(','))];
    saveAs(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), fileName);
}

/** Opens a PDF blob in a new tab instead of downloading it (OMS FileViewComponent). */
export function openBlobInNewTab(blob: Blob): void {
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
