/* Post-restart verification: writes results to verify-out.txt */
const fs = require('fs');
const { execFileSync } = require('child_process');
const lines = [];
const run = (cmd, args) => {
    try { execFileSync(cmd, args, { stdio: 'pipe', cwd: __dirname + '/../..' }); return 'OK'; }
    catch (e) { return String(e.stderr || e.message).slice(0, 200); }
};
lines.push('service.js: ' + run('node', ['--check', 'server/features/frappe-compat/service.js']));
lines.push('routes.js: ' + run('node', ['--check', 'server/features/frappe-compat/routes.js']));
(async () => {
    const base = 'http://localhost:5010';
    for (const [label, p] of [
        ['features', '/api/features'],
        ['login-page', '/login'],
        ['get_courses', '/api/method/lms.lms.utils.get_courses'],
        ['course_details', '/api/method/lms.lms.utils.get_course_details?course=fractal-kernel-fundamentals'],
        ['lesson', '/api/method/lms.lms.utils.get_lesson?lessonname=x'],
        ['notifications', '/api/method/lms.lms.api.get_notifications'],
        ['stub-jobs', '/api/method/lms.lms.api.get_job_opportunities'],
    ]) {
        try {
            const r = await fetch(base + p);
            let b = ''; try { b = (await r.json()).message !== undefined ? 'envelope' : 'raw'; } catch { b = 'html'; }
            lines.push(`${label}: ${r.status} ${b}`);
        } catch (e) { lines.push(`${label}: ERR ${e.message}`); }
    }
    fs.writeFileSync(__dirname + '/../../verify-out.txt', lines.join('\n'));
})();
