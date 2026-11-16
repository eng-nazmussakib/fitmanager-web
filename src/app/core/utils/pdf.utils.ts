/**
 * Client-side PDF of something already on screen (a receipt, a detail card): jsPDF + html2canvas, as in IB.
 *
 * Why rasterise instead of jsPDF's text API: jsPDF cannot shape Bangla (conjuncts, vowel signs break apart)
 * unless you embed and subset a Bangla font. A screenshot of the DOM renders exactly what the browser rendered.
 * The trade-off: the text in the PDF is not selectable or searchable. If that matters, generate the PDF on the server.
 *
 * - `html2canvas-pro`, not `html2canvas`: html2canvas 1.4 throws on modern CSS colours (`oklch()`,
 *   `color-mix()`), and Tailwind v4 plus this app's brand palette use them everywhere.
 * - Both libraries (~600 kB) are imported INSIDE the function, so they form a lazy chunk downloaded on the
 *   first click, never at startup. (IB lazy-imports the whole helper module for the same reason.)
 */

const A4 = { width: 210, height: 297 }; // mm
const MARGIN = 10; // mm
const SCALE = 2; // canvas pixels per CSS pixel: sharp text without a huge file

export async function exportElementToPdf(element: HTMLElement, fileName: string): Promise<void> {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')]);

    const canvas = await html2canvas(element, {
        scale: SCALE,
        backgroundColor: '#ffffff',
        useCORS: true,
        // Always print the light theme, whatever the user is looking at.
        onclone: doc => doc.documentElement.classList.remove('dark')
    });

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const contentWidth = A4.width - 2 * MARGIN;
    const contentHeight = A4.height - 2 * MARGIN;
    const pxPerMm = canvas.width / contentWidth;
    const pageHeightPx = Math.floor(contentHeight * pxPerMm);

    // Slice the tall canvas into page-sized pieces. (Drawing the whole image at a negative offset on each page
    // would also bleed into the top and bottom margins.)
    for (let y = 0, page = 0; y < canvas.height; y += pageHeightPx, page++) {
        const sliceHeight = Math.min(pageHeightPx, canvas.height - y);
        const slice = document.createElement('canvas');
        slice.width = canvas.width;
        slice.height = sliceHeight;
        slice.getContext('2d')?.drawImage(canvas, 0, y, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

        if (page > 0) pdf.addPage();
        pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', MARGIN, MARGIN, contentWidth, sliceHeight / pxPerMm);
    }

    pdf.save(fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`);
}
