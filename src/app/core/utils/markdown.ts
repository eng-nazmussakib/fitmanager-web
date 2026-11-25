/**
 * A small Markdown renderer for the website's posts and offers: no library, safe by construction.
 * Every character of the input is HTML-escaped FIRST; only then are the few Markdown forms below turned into tags,
 * so no HTML a writer types can reach the page. Links keep only http(s), mailto, tel and site-relative targets.
 *
 * Supported: `#`–`###` headings (`#` and `##` as h2: the page has the h1; `###` as h3), paragraphs, `**bold**`, `*italic*`,
 * `` `code` ``, `[text](url)`, `-`/`*` and `1.` lists, `>` quotes, `---` rules. Pure, so it runs while prerendering.
 */
const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = (s: string): string => s.replace(/[&<>"']/g, c => ESCAPES[c] ?? c);

/** A link target that cannot run script: http(s), mailto, tel, or a path on this site. */
export function safeHref(raw: string): string | null {
    const href = raw.trim();
    if (/^(https?:\/\/|mailto:|tel:)/i.test(href)) return href;
    if (/^\/(?!\/)/.test(href) || /^#[\w-]*$/.test(href)) return href;
    return null;
}

function inline(text: string): string {
    // `text` is escaped already; code spans first, so their content is not formatted.
    const codes: string[] = [];
    let out = text.replace(/`([^`]+)`/g, (_m, c: string) => `\uE000${codes.push(`<code>${c}</code>`) - 1}\uE001`);
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label: string, url: string) => {
        // The URL was escaped with the rest: undo the entities before checking it, escape it again for the attribute.
        const raw = url.replace(/&amp;/g, '&');
        const href = safeHref(raw);
        if (!href) return label;
        const external = /^https?:\/\//i.test(href);
        return `<a href="${escape(href)}"${external ? ' rel="noopener" target="_blank"' : ''}>${label}</a>`;
    });
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
    return out.replace(/\uE000(\d+)\uE001/g, (_m, i: string) => codes[Number(i)] ?? '');
}

export function renderMarkdown(source: string): string {
    const lines = escape(source.replace(/\r\n?/g, '\n')).split('\n');
    const html: string[] = [];
    let para: string[] = [];
    let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;
    let quote: string[] = [];
    const flush = (): void => {
        if (para.length) html.push(`<p>${inline(para.join(' '))}</p>`);
        para = [];
        if (list) html.push(`<${list.tag}>${list.items.map(i => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`);
        list = null;
        if (quote.length) html.push(`<blockquote><p>${inline(quote.join(' '))}</p></blockquote>`);
        quote = [];
    };
    for (const line of lines) {
        const t = line.trim();
        let m: RegExpExecArray | null;
        if (!t) {
            flush();
        } else if ((m = /^(#{1,3})\s+(.*)$/.exec(t))) {
            flush();
            // The page's title is the h1: `#` and `##` are sections (h2), `###` a sub-section (h3).
            const level = Math.max(2, m[1].length);
            html.push(`<h${level}>${inline(m[2])}</h${level}>`);
        } else if (/^(-{3,}|\*{3,})$/.test(t)) {
            flush();
            html.push('<hr>');
        } else if ((m = /^&gt;\s?(.*)$/.exec(t))) {
            if (para.length || list) flush();
            quote.push(m[1]);
        } else if ((m = /^([-*]|\d+\.)\s+(.*)$/.exec(t))) {
            const tag = m[1] === '-' || m[1] === '*' ? 'ul' : 'ol';
            if (para.length || quote.length || (list && list.tag !== tag)) flush();
            list ??= { tag, items: [] };
            list.items.push(m[2]);
        } else {
            if (list || quote.length) flush();
            para.push(t);
        }
    }
    flush();
    return html.join('\n');
}

/** Plain text of a Markdown source (for descriptions and JSON-LD): the markers removed, nothing rendered. */
export function markdownText(source: string): string {
    return source
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/[*#>_]+/g, '')
        .replace(/^\s*(-|\d+\.)\s+/gm, '')
        .replace(/\s+/g, ' ')
        .trim();
}
