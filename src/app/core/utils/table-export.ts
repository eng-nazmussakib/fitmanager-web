import { saveAs } from 'file-saver';

import type { ReportCell, ReportColumn } from '@core/models/report.model';

/**
 * Excel and PDF files made in the browser (D-107): `exceljs` and `jspdf` + `jspdf-autotable` are imported inside
 * the functions, so they are lazy chunks fetched on the first export, never at start-up (and never while
 * prerendering: only a click calls these).
 *
 * PDF text uses jsPDF's built-in Helvetica: it has no ৳ sign and cannot shape Bangla, so money is written "Tk" in
 * PDFs, and Bangla text would come out broken there (use Excel for it). Excel keeps real numbers with formats.
 */

export interface ExportSheet {
    title: string;
    /** Under the title: the branch, the range, filters. */
    subtitle?: string;
    columns: ReportColumn[];
    rows: Record<string, ReportCell>[];
    total?: Record<string, ReportCell> | null;
}

const MONEY_XLSX = '"৳"#,##,##0.##;-"৳"#,##,##0.##';

/** `2026-11-21` stays; an ISO time becomes `2026-11-21 18:05` in Dhaka. */
export function dateText(v: ReportCell): string {
    if (typeof v !== 'string') return v === null ? '' : String(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const t = Date.parse(v);
    if (Number.isNaN(t)) return v;
    const local = new Date(t + 6 * 3600_000).toISOString();
    return `${local.slice(0, 10)} ${local.slice(11, 16)}`;
}

const lakh = (n: number, digits = 0): string => n.toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

/** A cell as text for the PDF. */
export function pdfText(v: ReportCell, c: ReportColumn): string {
    if (v === null || v === '') return '–';
    if (c.unit === 'date') return dateText(v);
    if (typeof v !== 'number') return String(v);
    switch (c.unit) {
        case 'money':
            return `Tk ${lakh(v, 2)}`;
        case 'percent':
            return `${lakh(v, 1)}%`;
        case 'minutes':
            return `${lakh(v)} min`;
        default:
            return lakh(v, 1);
    }
}

export function safeName(title: string): string {
    return (
        title
            .replace(/[^\w\s-]/g, '')
            .trim()
            .replace(/\s+/g, '-')
            .toLowerCase() || 'export'
    );
}

export async function saveXlsx(sheet: ExportSheet, fileName: string): Promise<void> {
    const mod = await import('exceljs');
    // The browser build is UMD: the classes are on the CommonJS default export.
    const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod;
    const wb = new ExcelJS.Workbook();
    wb.created = new Date();
    const ws = wb.addWorksheet(sheet.title.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '), { views: [{ state: 'frozen', ySplit: 4 }] });
    ws.addRow([sheet.title]).font = { bold: true, size: 14 };
    ws.addRow([sheet.subtitle ?? '']).font = { color: { argb: 'FF6B6B74' } };
    ws.addRow([]);
    const head = ws.addRow(sheet.columns.map(c => c.label));
    head.font = { bold: true };
    head.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F1F4' } };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFD4D4D8' } } };
    });
    const value = (v: ReportCell, c: ReportColumn): string | number | null => (c.unit === 'date' ? dateText(v) || null : v);
    for (const r of sheet.rows) ws.addRow(sheet.columns.map(c => value(r[c.key] ?? null, c)));
    if (sheet.total) ws.addRow(sheet.columns.map(c => value(sheet.total?.[c.key] ?? null, c))).font = { bold: true };
    sheet.columns.forEach((c, i) => {
        const col = ws.getColumn(i + 1);
        if (c.unit === 'money') col.numFmt = MONEY_XLSX;
        else if (c.unit === 'percent') col.numFmt = '0.0"%"';
        else if (c.unit === 'count') col.numFmt = '#,##,##0';
        const longest = Math.max(c.label.length, ...sheet.rows.slice(0, 500).map(r => String(r[c.key] ?? '').length));
        col.width = Math.min(60, Math.max(10, longest + 2));
    });
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: sheet.columns.length } };
    const buffer = await wb.xlsx.writeBuffer();
    saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${fileName}.xlsx`);
}

export async function savePdf(sheet: ExportSheet, fileName: string): Promise<void> {
    const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: sheet.columns.length > 6 ? 'landscape' : 'portrait' });
    doc.setFontSize(14);
    doc.text(sheet.title, 12, 14);
    doc.setFontSize(9);
    doc.setTextColor(107, 107, 116);
    if (sheet.subtitle) doc.text(sheet.subtitle, 12, 20);
    const numeric = (c: ReportColumn): boolean => c.unit !== 'text' && c.unit !== 'date';
    autoTable(doc, {
        startY: 25,
        margin: { left: 12, right: 12 },
        styles: { fontSize: 8, cellPadding: 1.6 },
        headStyles: { fillColor: [241, 241, 244], textColor: [24, 24, 27], fontStyle: 'bold' },
        footStyles: { fillColor: [241, 241, 244], textColor: [24, 24, 27], fontStyle: 'bold' },
        columnStyles: Object.fromEntries(sheet.columns.map((c, i) => [i, { halign: numeric(c) ? 'right' : 'left' }])),
        head: [sheet.columns.map(c => c.label)],
        body: sheet.rows.map(r => sheet.columns.map(c => pdfText(r[c.key] ?? null, c))),
        ...(sheet.total ? { foot: [sheet.columns.map(c => pdfText(sheet.total?.[c.key] ?? null, c))] } : {}),
        didDrawPage: () => {
            const page = doc.getNumberOfPages();
            doc.setFontSize(8);
            doc.setTextColor(107, 107, 116);
            doc.text(`Page ${page}`, doc.internal.pageSize.getWidth() - 24, doc.internal.pageSize.getHeight() - 6);
        }
    });
    doc.save(`${fileName}.pdf`);
}
