import { fileNameFromDisposition } from './file.utils';

describe('fileNameFromDisposition', () => {
    it('reads a quoted filename', () => {
        expect(fileNameFromDisposition('attachment; filename="report.pdf"')).toBe('report.pdf');
    });

    it('prefers the RFC 5987 UTF-8 filename (Bangla file names)', () => {
        const header = `attachment; filename="fallback.csv"; filename*=UTF-8''${encodeURIComponent('কর্মচারী.csv')}`;
        expect(fileNameFromDisposition(header)).toBe('কর্মচারী.csv');
    });

    it('returns null without a header', () => {
        expect(fileNameFromDisposition(null)).toBeNull();
    });
});
