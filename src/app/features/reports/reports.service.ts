import { inject, Injectable } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';

import { ApiService } from '@core/http/api.service';
import { EXPORT_LIMIT, type ExportFormat, type ExportKind, type ExportPage, type Report, type ReportKey, type ReportTable } from '@core/models/report.model';
import { type ExportSheet, safeName, savePdf, saveXlsx } from '@core/utils/table-export';
import { ToastService } from '@shared/ui/toast/toast.service';

export interface ReportQuery {
    from: string;
    to: string;
    compare: boolean;
    /** HQ only: one branch instead of all. */
    branch_oid?: string | null;
}

/**
 * Reports (D-106) and exports (D-107). Reports: one branch (`X-Branch-Id` = that branch) or HQ across branches.
 * Exports page through `POST /v1/exports/:kind` (the API writes the audit row on the first page and refuses more
 * than 50 000 rows), then the file is made here; a report table is already on screen, so only its audit row is
 * sent before the file is made.
 */
@Injectable({ providedIn: 'root' })
export class ReportsService {
    private readonly _api = inject(ApiService);
    private readonly _toast = inject(ToastService);

    report(key: ReportKey, q: ReportQuery, hq: boolean): Observable<Report> {
        const params = { from: q.from, to: q.to, compare: q.compare ? '1' : undefined, branch_oid: hq ? (q.branch_oid ?? undefined) : undefined };
        return this._api.get<Report>(hq ? `/v1/hq/reports/${key}` : `/v1/reports/${key}`, params);
    }

    trainerNumbers(trainerOid: string, from: string, to: string): Observable<Report> {
        return this._api.get<Report>(`/v1/trainers/${trainerOid}/numbers`, { from, to });
    }

    /** A report table as Excel or PDF. Resolves false when the API refused (already shown as a toast). */
    async exportTable(report: Report, table: ReportTable, format: ExportFormat, branchOid?: string | null): Promise<boolean> {
        try {
            await firstValueFrom(
                this._api.post('/v1/exports/report', {
                    format,
                    report: report.key,
                    table: table.key,
                    from: report.from,
                    to: report.to,
                    rows: table.rows.length,
                    ...(branchOid ? { branch_oid: branchOid } : {})
                })
            );
        } catch {
            return false;
        }
        const where = report.branches.length === 1 ? report.branches[0]?.name : 'All branches';
        const sheet: ExportSheet = {
            title: `${report.title}: ${table.title}`,
            subtitle: `${where} · ${report.from} to ${report.to}`,
            columns: table.columns,
            rows: table.rows,
            total: table.total
        };
        await this._save(sheet, format, `${safeName(report.title)}-${table.key}-${report.from}-${report.to}`);
        return true;
    }

    /**
     * A list (members, payments, stock, audit log) as Excel or PDF, every page of it. `onProgress` gets the rows so
     * far and the total. Resolves the number of rows, or null when the API refused.
     */
    async exportList(
        kind: ExportKind,
        body: { filters?: Record<string, unknown> },
        format: ExportFormat,
        meta: { title: string; subtitle: string },
        onProgress?: (done: number, total: number) => void
    ): Promise<number | null> {
        const rows: ExportPage['rows'] = [];
        let columns: ExportPage['columns'] | undefined;
        let total = 0;
        let next: string | null = null;
        try {
            do {
                const cursor: Record<string, unknown> = next === null ? {} : kind === 'members' ? { page: Number(next) } : { after: next };
                const page: ExportPage = await firstValueFrom(this._api.post<ExportPage>(`/v1/exports/${kind}`, { format, ...body, ...cursor }));
                if (page.total !== null) total = page.total;
                columns = page.columns;
                rows.push(...page.rows);
                next = page.next;
                onProgress?.(rows.length, total);
            } while (next !== null && rows.length < EXPORT_LIMIT);
        } catch {
            return null;
        }
        if (!rows.length) {
            this._toast.info('There is nothing to export with these filters.');
            return 0;
        }
        await this._save({ ...meta, columns: columns ?? [], rows }, format, `${safeName(meta.title)}-${new Date().toISOString().slice(0, 10)}`);
        return rows.length;
    }

    private async _save(sheet: ExportSheet, format: ExportFormat, name: string): Promise<void> {
        if (format === 'xlsx') await saveXlsx(sheet, name);
        else await savePdf(sheet, name);
        this._toast.success(`${sheet.rows.length.toLocaleString('en-IN')} rows saved as ${format === 'xlsx' ? 'Excel' : 'PDF'}.`, 'Exported');
    }
}
