/* Probe save_progress + write raw responses to probe-out.txt */
const fs = require('fs');
function log(...a) { fs.appendFileSync('d:/Mujahid/LMS/probe-out.txt', a.join(' ') + '\n'); }
(async () => {
    fs.writeFileSync('d:/Mujahid/LMS/probe-out.txt', 'probe start\n');
    const B = 'http://localhost:5010';
    try {
        const lg = await fetch(B + '/api/method/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usr: 'smoke@test.com', pwd: 'Test1234' }),
        });
        const cookie = (lg.headers.get('set-cookie') || '').match(/user_id=([^;]+)/)?.[1] || '';
        log('cookie len', cookie.length);

        const det = await fetch(B + '/api/method/lms.lms.utils.get_course_details?course=fractal-kernel-fundamentals');
        const dj = await det.json();
        const lessonId = dj?.message?.chapters?.[0]?.lessons?.[0]?.name || 'MISSING';
        log('lessonId', lessonId);

        const sp = await fetch(B + '/api/method/lms.lms.doctype.course_lesson.course_lesson.save_progress', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: 'user_id=' + cookie },
            body: JSON.stringify({ course: 'fractal-kernel-fundamentals', lesson: lessonId }),
        });
        log('save_progress status', sp.status);
        log('save_progress body', (await sp.text()).slice(0, 300));
    } catch (e) {
        log('EXC', e.message);
    }
})();