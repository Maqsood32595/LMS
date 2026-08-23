/* v2: restore the TWO missing lines in the save_progress test (assert + }) */
const fs = require('fs');
const p = 'd:/Mujahid/LMS/tests/piet/gate6.spec.mjs';
const outFile = 'd:/Mujahid/LMS/fix-gate6-out.txt';
let s = fs.readFileSync(p, 'utf8');
const needle = "const row = mine.body.message.find((c) => c.name === 'fractal-kernel-fundamentals')";
const idx = s.indexOf(needle);
const out = [];
if (idx === -1) out.push('NEEDLE NOT FOUND');
else {
    const tail = s.slice(idx + needle.length).replace(/^\r\n/, '\n');
    if (!tail.startsWith("\n    assert(row && Number(row.progress)")) {
        const insert = "\n    assert(row && Number(row.progress) === 100, `progress=${row?.progress}`)\n})\n";
        s = s.slice(0, idx + needle.length) + insert + s.slice(idx + needle.length);
        fs.writeFileSync(p, s);
        out.push('INSERTED assert + })\n');
    } else {
        out.push('ALREADY FIXED\n');
    }
}
fs.writeFileSync(outFile, out.join(''));