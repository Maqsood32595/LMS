/* Extracts every legacy endpoint the preserved UI calls → endpoint-inventory.txt */
const fs = require('fs');
const path = require('path');
const SRC = path.resolve(__dirname, '../../frontend/src');
let out = [];
function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(vue|js|ts)$/.test(e.name)) {
            const s = fs.readFileSync(p, 'utf8');
            for (const m of s.matchAll(/url:\s*['"`]([a-zA-Z0-9_.]+)['"`]/g)) out.push(m[1]);
        }
    }
}
walk(SRC);
const u = [...new Set(out)].sort();
fs.writeFileSync(path.resolve(__dirname, '../endpoint-inventory.txt'), u.join('\n'));
console.log('distinct endpoints:', u.length);
