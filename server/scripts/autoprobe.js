/* Self-contained boot + probe of save_progress (no external server assumptions) */
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const ROOT = 'd:/Mujahid/LMS';
const out = [];
const log = (...a) => { out.push(a.join(' ')); fs.writeFileSync(ROOT + '/autoprobe-out.txt', out.join('\n')); };

(async () => {
    try { execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ROOT + '/server/scripts/kill5010.ps1'], { stdio: 'ignore' }); } catch {}
    await new Promise((r) => setTimeout(r, 2500));

    const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let errLog = '';
    srv.stderr.on('data', (d) => { errLog += d; });
    let up = false;
    for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        try { if ((await fetch('http://localhost:5010/api/features')).status === 200) { up = true; break; } } catch {}
    }
    log('server up:', up);

    // login student
    const lg = await fetch('http://localhost:5010/api/method/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usr: 'smoke@test.com', pwd: 'Test1234' }),
    });
    const cookie = (lg.headers.get('set-cookie') || '').match(/user_id=([^;]+)/)?.[1] || '';
    log('cookie:', cookie ? 'ok' : 'none');

    // fetch lesson id
    const det = await fetch('http://localhost:5010/api/method/lms.lms.utils.get_course_details?course=fractal-kernel-fundamentals');
    const dj = await det.json();
    const lessonId = dj?.message?.chapters?.[0]?.lessons?.[0]?.name || 'MISSING';
    log('lessonId:', lessonId);

    // call save_progress
    const sp = await fetch('http://localhost:5010/api/method/lms.lms.doctype.course_lesson.course_lesson.save_progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: 'user_id=' + cookie },
        body: JSON.stringify({ course: 'fractal-kernel-fundamentals', lesson: lessonId }),
    });
    log('save status:', sp.status);
    log('save body:', (await sp.text()).slice(0, 400));

    await new Promise((r) => setTimeout(r, 800));
    log('server stderr tail:', errLog.split('\n').slice(-12).join('\n') || '(none)');

    fs.writeFileSync(ROOT + '/.server.pid', String(srv.pid));
    // keep server alive for further debugging
    process.exit(0);
})();