import { markdownText, renderMarkdown, safeHref } from './markdown';

describe('renderMarkdown', () => {
    it('headings under the page title, paragraphs, bold, italic, code, lists, quotes and rules', () => {
        expect(renderMarkdown('## Plan\n\nSome **bold** and *soft* `x*y`.\n\n- one\n- two\n\n1. first\n2. second\n\n> Quote\n\n---')).toBe(
            [
                '<h2>Plan</h2>',
                '<p>Some <strong>bold</strong> and <em>soft</em> <code>x*y</code>.</p>',
                '<ul><li>one</li><li>two</li></ul>',
                '<ol><li>first</li><li>second</li></ol>',
                '<blockquote><p>Quote</p></blockquote>',
                '<hr>'
            ].join('\n')
        );
    });

    it('escapes every HTML tag a writer types, and keeps only safe links', () => {
        const out = renderMarkdown(
            '<script>alert(1)</script> <img src=x onerror=alert(1)> [x](javascript:alert(1)) [ok](https://a.example/?a=1&b=2) [in](/plans)'
        );
        expect(out).not.toMatch(/<script|<img|javascript:/);
        expect(out).toContain('&lt;script&gt;');
        expect(out).toContain('<a href="https://a.example/?a=1&amp;b=2" rel="noopener" target="_blank">ok</a>');
        expect(out).toContain('<a href="/plans">in</a>');
        expect(out).toContain(' x) '); // the unsafe link is left as text
        expect(renderMarkdown('[q](https://a.example/"onmouseover="x)')).not.toContain('"onmouseover');
    });

    it('safe hrefs and plain text', () => {
        expect(safeHref('//evil.example')).toBeNull();
        expect(safeHref('data:text/html,x')).toBeNull();
        expect(safeHref('mailto:a@b.example')).toBe('mailto:a@b.example');
        expect(markdownText('## Hi\n\n- **one** [two](/x)')).toBe('Hi one two');
    });
});
