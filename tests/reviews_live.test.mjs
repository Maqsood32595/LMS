import assert from 'node:assert/strict';

const BASE = 'http://localhost:5010';

async function j(url, opts = {}) {
    const res = await fetch(`${BASE}${url}`, {
        ...opts,
        headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    const body = await res.json().catch(() => null);
    return { res, body };
}

(async () => {
    console.log('\n⭐ [TEST] Running Reviews & Live Classes Grandchild Test Suite in RAM...\n');

    // 1. Authenticate Admin
    const loginAdmin = await j('/api/method/login', {
        method: 'POST',
        body: JSON.stringify({ usr: 'admin@fractallms.app', pwd: 'admin@123' }),
    });
    assert.equal(loginAdmin.res.status, 200, 'Admin login');
    const adminCookie = (loginAdmin.res.headers.get('set-cookie') || '').match(/user_id=([^;]+)/)[1];
    const adminAuth = { Cookie: `user_id=${adminCookie}` };

    // 2. Register and Authenticate Student
    const studentEmail = `reviewer-${Date.now().toString(36)}@example.com`;
    await j('/api/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email: studentEmail, password: 'Password123!', first_name: 'Grace', last_name: 'Hopper' }),
    });
    const loginStudent = await j('/api/method/login', {
        method: 'POST',
        body: JSON.stringify({ usr: studentEmail, pwd: 'Password123!' }),
    });
    const studentCookie = (loginStudent.res.headers.get('set-cookie') || '').match(/user_id=([^;]+)/)[1];
    const studentAuth = { Cookie: `user_id=${studentCookie}` };

    // 3. Student submits course review
    const reviewText = 'Incredible mastery of Fractal Kernel architecture!';
    const reviewRes = await j('/api/method/frappe.client.insert', {
        method: 'POST',
        headers: studentAuth,
        body: JSON.stringify({
            doc: {
                doctype: 'LMS Course Review',
                course: 'fractal-kernel-fundamentals',
                rating: 1.0, // 5/5 fraction from UI Rating component
                review: reviewText,
            },
        }),
    });
    assert.equal(reviewRes.res.status, 200, 'Review submission status');
    console.log('  ✅ 1. Student submitted course review');

    // 4. Fetch course reviews
    const reviewsList = await j('/api/method/lms.lms.utils.get_reviews?course=fractal-kernel-fundamentals', {
        method: 'GET',
    });
    assert.equal(reviewsList.res.status, 200, 'get_reviews status');
    assert.ok(Array.isArray(reviewsList.body.message), 'Reviews is array');
    const foundReview = reviewsList.body.message.find((r) => r.owner_details?.email === studentEmail);
    assert.ok(foundReview, 'Student review listed in course reviews');
    assert.equal(foundReview.rating, 5, 'Rating normalized to 5');
    assert.equal(foundReview.review, reviewText, 'Review text matches');
    assert.equal(foundReview.owner_details?.full_name, 'Grace Hopper', 'Author details populated');
    console.log('  ✅ 2. Verified get_reviews catalog and author details');

    // 5. Query get_count for eligible_to_review check
    const countRes = await j('/api/method/frappe.client.get_count', {
        method: 'POST',
        headers: studentAuth,
        body: JSON.stringify({
            doctype: 'LMS Course Review',
            filters: {
                course: 'fractal-kernel-fundamentals',
                owner: studentEmail,
            },
        }),
    });
    assert.equal(countRes.res.status, 200, 'get_count status');
    assert.equal(countRes.body.message, 1, 'Review count for user is 1');
    console.log('  ✅ 3. Verified get_count for review duplicate check');

    // 6. Admin schedules a Live Class
    const liveTitle = `Architecture AMA ${Date.now().toString(36)}`;
    const liveRes = await j('/api/method/frappe.client.insert', {
        method: 'POST',
        headers: adminAuth,
        body: JSON.stringify({
            doc: {
                doctype: 'LMS Live Class',
                title: liveTitle,
                course: 'fractal-kernel-fundamentals',
                start_time: new Date(Date.now() + 3600000).toISOString(),
                duration_minutes: 45,
                platform: 'Google Meet',
                meet_link: 'https://meet.google.com/xyz-uvwx-rst',
            },
        }),
    });
    assert.equal(liveRes.res.status, 200, 'Live class creation status');
    console.log('  ✅ 4. Admin scheduled live class');

    // 7. Query upcoming live classes
    const upcomingRes = await j('/api/method/lms.lms.api.get_my_live_classes', {
        method: 'GET',
        headers: studentAuth,
    });
    assert.equal(upcomingRes.res.status, 200, 'get_my_live_classes status');
    assert.ok(Array.isArray(upcomingRes.body.message), 'Live classes is array');
    const foundLive = upcomingRes.body.message.find((lc) => lc.title === liveTitle);
    assert.ok(foundLive, 'Scheduled live class listed in upcoming');
    assert.equal(foundLive.platform, 'Google Meet', 'Platform is Google Meet');
    assert.equal(foundLive.join_url, 'https://meet.google.com/xyz-uvwx-rst', 'Join URL matches');
    console.log('  ✅ 5. Verified upcoming live classes and join URL');

    // 8. Falsification: Student scheduling live class rejected (403)
    const illegalLive = await j('/api/method/frappe.client.insert', {
        method: 'POST',
        headers: studentAuth,
        body: JSON.stringify({
            doc: { doctype: 'LMS Live Class', title: 'Illegal Live Class' },
        }),
    });
    assert.equal(illegalLive.res.status, 403, 'Student scheduling live class rejected 403');
    console.log('  ✅ 6. Verified role security guard for live classes');

    console.log('\n🎉 ALL 6 REVIEWS & LIVE CLASSES IN-RAM TESTS PASSED!\n');
    process.exit(0);
})().catch((err) => {
    console.error('❌ Reviews/Live test failed:', err);
    process.exit(1);
});
