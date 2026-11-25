/**
 * Browser-only helpers that keep uploads small: photos are scaled down and re-encoded as JPEG before they
 * leave the browser, and videos are checked for length. Call them only in the browser (from an event handler):
 * they use `document`, canvas and object URLs.
 */

/** A small photo: at most `maxPx` on the long side and at most `maxBytes`, as JPEG (quality stepped down if needed). */
export async function shrinkPhoto(file: Blob, maxPx = 800, maxBytes = 300 * 1024): Promise<Blob> {
    const url = URL.createObjectURL(file);
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image();
            el.onload = () => resolve(el);
            el.onerror = () => reject(new Error('This file is not a photo the browser can read.'));
            el.src = url;
        });
        const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
        for (const quality of [0.85, 0.75, 0.65, 0.55, 0.45]) {
            const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
            if (blob && blob.size <= maxBytes) return blob;
        }
        throw new Error(`The photo is still larger than ${Math.round(maxBytes / 1024)} KB. Try a smaller one.`);
    } finally {
        URL.revokeObjectURL(url);
    }
}

/** The length of a video file in seconds (from its metadata). */
export async function videoSeconds(file: Blob): Promise<number> {
    const url = URL.createObjectURL(file);
    try {
        return await new Promise<number>((resolve, reject) => {
            const el = document.createElement('video');
            el.preload = 'metadata';
            el.onloadedmetadata = () => resolve(el.duration);
            el.onerror = () => reject(new Error('This file is not a video the browser can read.'));
            el.src = url;
        });
    } finally {
        URL.revokeObjectURL(url);
    }
}

/** A short exercise video: MP4 or WebM, at most 8 MB and 10 seconds. Returns a message when it is not. */
export async function checkVideo(file: File, maxBytes = 8 * 1024 * 1024, maxSeconds = 10): Promise<string | null> {
    if (!['video/mp4', 'video/webm'].includes(file.type)) return 'A video is an MP4 or WebM file.';
    if (file.size > maxBytes) return `A video is at most ${Math.round(maxBytes / 1024 / 1024)} MB.`;
    const seconds = await videoSeconds(file);
    // A recording made in a browser may not state its length (Infinity): the size limit still applies.
    return Number.isFinite(seconds) && seconds > maxSeconds + 0.5 ? `A video is at most ${maxSeconds} seconds (this one is ${Math.round(seconds)}).` : null;
}
