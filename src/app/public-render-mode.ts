import { RenderMode } from '@angular/ssr';

/**
 * How the public gym pages render. Two hosting targets share one route table (D-027):
 * - this file, Cloudflare Workers on the Free plan (D-026): pages are prerendered at build time and served as static
 *   files, because per-request SSR would not fit the 10 ms CPU limit;
 * - `public-render-mode.vm.ts`, swapped in by the `vm` build configurations: per-request SSR from the Node server
 *   behind nginx (Docker image, future VM hosting).
 */
export const PUBLIC_RENDER_MODE = RenderMode.Prerender as RenderMode.Prerender | RenderMode.Server;
