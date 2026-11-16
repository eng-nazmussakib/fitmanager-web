import { RenderMode } from '@angular/ssr';

/** VM target (D-027): public pages are rendered per request by the Node SSR server. See `public-render-mode.ts`. */
export const PUBLIC_RENDER_MODE = RenderMode.Server as RenderMode.Prerender | RenderMode.Server;
