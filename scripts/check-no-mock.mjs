// The production bundle contains no mock code: no seed data, no demo password, no mock interceptor.
// Run after `npm run build:prod`. Exits 1 if any marker is found.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MARKERS = ['Owner@123', 'Kamrul Chowdhury', 'fm.mock.v1', 'mulberry32', 'Mock: no handler'];
const hits = [];
const walk = dir => {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(m?js|html)$/.test(name)) {
            const text = readFileSync(path, 'utf8');
            for (const m of MARKERS) if (text.includes(m)) hits.push(`${path}: ${m}`);
        }
    }
};
walk('dist');
if (hits.length) {
    console.error('Mock code found in the production build:\n' + hits.join('\n'));
    process.exit(1);
}
console.warn('No mock code in dist/');
