import { firstValueFrom } from 'rxjs';

import type { FilesService } from '@core/services/files.service';
import { shrinkPhoto } from '@core/utils/media.utils';

/**
 * A website image: shrunk in the browser to 1600 px and at most 500 KB, uploaded as a `site_image`, with its
 * size (the public pages set width and height, so nothing shifts while it loads). Browser only.
 */
export async function uploadSiteImage(files: FilesService, file: File): Promise<{ oid: string; width: number; height: number; preview: string }> {
    const blob = await shrinkPhoto(file, 1600, 500 * 1024);
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    const oid = await firstValueFrom(files.upload('site_image', blob, file.name.replace(/\.\w+$/, '.jpg')));
    return { oid, ...size, preview: URL.createObjectURL(blob) };
}

/** "Squat Well!" → "squat-well": the address a title suggests. */
export function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80);
}
