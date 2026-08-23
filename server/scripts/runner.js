/* Sequel v2: robust kill -> boot -> PID-verify -> suites. */
const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const ROOT = 'd:/Mujahid/LMS';
const out = [];
function log(...a) { out.push(a.join(' ')); fs.writeFileSync(ROOT + '/runner-out.txt', out.join('\n')); }

function listenerPid() {
    try {
        const s = execFileSync('netstat', ['-ano'], { encoding: 'utf8' });
        for (const line of s.split('\n')) {
            if (line.includes(':5010') && line.includes('LISTENING')) {
                const m = line.trim().split(/\s+/);
                return m[m.length - 1];
            }
        }
    } catch {}
    return null;
}

(async () => {
    try { execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ROOT + '/server/scripts/kill5010.ps1'], { stdio: 'ignore' }); } catch {}
    await new Promise((r) => setTimeout(r, 3000));
    log('pre-start listener:', listenerPid() || 'none');

    const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    srv.stderr.on('data', (d) => { try { fs.appendFileSync(ROOT + '/boot-err.log', d); } catch {} });
    srv.stdout.on('data', (d) => { try { fs.appendFileSync(ROOT + '/boot-out.log', d); } catch {} });

    let ok = false;
    for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        if (listenerPid() === String(srv.pid)) {
            const r = await fetch('http://localhost:5010/api/features').catch(() => null);
            if (r && r.status === 200) { ok = true; break; }
        }
    }
    log('server up & PID-matched:', ok, 'expected=' + srv.pid, 'listener=' + listenerPid());

    for (const f of ['tests/piet/gate6.spec.mjs', 'tests/piet/piet.mjs']) {
        try {
            const res = execFileSync(process.execPath, [f], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
            fs.writeFileSync(ROOT + '/last-suite.txt', res);
            log('SUITE', f, '-> exit 0');
        } catch (e) {
            fs.writeFileSync(ROOT + '/last-suite.txt', String(e.stdout || '') + '\n' + String(e.stderr || ''));
            log('SUITE', f, '-> exit', e.status);
        }
    }
    srv.kill();
    process.exit(0);
})();