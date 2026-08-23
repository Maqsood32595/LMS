/**
 * Enrolled Filter Verification Test (In-RAM)
 * Run: node tests/enrolled-tab.test.mjs
 */
const BASE = process.env.BASE_URL || 'http://localhost:5010';

async function j(path, opts = {}) {
    const res = await fetch(`${BASE}${path}`, {
        ...opts,
        headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }
    });
    let body = null;
    try { body = await res.clone().json(); } catch {}
    return { res, body };
}

(async () => {
    console.log('\n==============================================');
    console.log('  Testing Enrolled Filter for maqsoodlmohammed@gmail.com');
    console.log('==============================================\n');

    let passed = 0, failed = 0;
    const log = (ok, label, detail) => {
        if (ok) { passed++; console.log(`  ✅ PASS: ${label}`); }
        else { failed++; console.log(`  ❌ FAIL: ${label}${detail ? ' → ' + detail : ''}`); }
    };

    // 1. Unauthenticated test (Guest)
    const guestRes = await j('/api/method/lms.lms.utils.get_courses?filters=%7B%22enrolled%22%3A1%7D');
    log(Array.isArray(guestRes.body?.message) && guestRes.body.message.length === 0, 'Guest request to enrolled tab returns 0 courses (no leak)');

    // 2. Logged in as maqsoodlmohammed@gmail.com
    const maqsoodCookie = 'user_id=maqsoodlmohammed@gmail.com';
    const maqsoodEnrolled = await j('/api/method/lms.lms.utils.get_courses?filters=%7B%22enrolled%22%3A1%7D', {
        headers: { Cookie: maqsoodCookie }
    });
    const courses = maqsoodEnrolled.body?.message || [];
    log(courses.length === 4, `maqsoodlmohammed@gmail.com enrolled filter returns exactly 4 courses (found ${courses.length})`);
    log(courses.every(c => c.membership && c.membership.member === 'maqsoodlmohammed@gmail.com'), 'All returned courses contain live membership details for maqsoodlmohammed@gmail.com');

    // 3. Logged in as smoke@test.com
    const smokeCookie = 'user_id=smoke@test.com';
    const smokeEnrolled = await j('/api/method/lms.lms.utils.get_courses?filters=%7B%22enrolled%22%3A1%7D', {
        headers: { Cookie: smokeCookie }
    });
    const smokeCourses = smokeEnrolled.body?.message || [];
    log(smokeCourses.length === 2, `smoke@test.com enrolled filter returns exactly 2 courses (found ${smokeCourses.length})`);
    log(smokeCourses.every(c => c.membership && c.membership.member === 'smoke@test.com'), 'All returned courses contain live membership details for smoke@test.com');

    // 4. Verify Catalog vs Enrolled Counts
    const allCount = await j('/api/method/lms.lms.utils.get_course_count', { headers: { Cookie: maqsoodCookie } });
    const enrolledCount = await j('/api/method/lms.lms.utils.get_course_count?filters=%7B%22enrolled%22%3A1%7D', { headers: { Cookie: maqsoodCookie } });
    log(allCount.body?.message >= 20, `Public catalog count is large (${allCount.body?.message} courses)`);
    log(enrolledCount.body?.message === 4, `Enrolled count for maqsoodlmohammed@gmail.com is strictly 4 (found ${enrolledCount.body?.message})`);

    console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
    process.exit(failed ? 1 : 0);
})();
