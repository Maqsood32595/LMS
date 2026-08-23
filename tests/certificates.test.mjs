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
    console.log('\n📜 [TEST] Running Certifications Grandchild Test Suite in RAM...\n');

    // 1. Authenticate admin
    const loginAdmin = await j('/api/method/login', {
        method: 'POST',
        body: JSON.stringify({ usr: 'admin@fractallms.app', pwd: 'admin@123' }),
    });
    assert.equal(loginAdmin.res.status, 200, 'Admin login failed');
    const adminCookie = (loginAdmin.res.headers.get('set-cookie') || '').match(/user_id=([^;]+)/)[1];
    const adminAuth = { Cookie: `user_id=${adminCookie}` };

    // 2. Register a new graduate student
    const studentEmail = `grad-${Date.now().toString(36)}@example.com`;
    const regRes = await j('/api/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email: studentEmail, password: 'Password123!', first_name: 'Alan', last_name: 'Turing' }),
    });
    assert.equal(regRes.res.status, 201, 'Student registration status');

    // 3. Issue certificate via frappe.client.insert
    const issueRes = await j('/api/method/frappe.client.insert', {
        method: 'POST',
        headers: adminAuth,
        body: JSON.stringify({
            doc: {
                doctype: 'LMS Certificate',
                member: studentEmail,
                course: 'fractal-kernel-fundamentals',
            },
        }),
    });
    assert.equal(issueRes.res.status, 200, 'Issue certificate status');
    assert.ok(issueRes.body.message?.certificate_id, 'Certificate ID returned');
    const certId = issueRes.body.message.certificate_id;
    console.log('  ✅ 1. Issued certificate:', certId);

    // 4. Query get_certification_details
    const detailRes = await j(`/api/method/lms.lms.api.get_certification_details?certificate_id=${encodeURIComponent(certId)}`, {
        method: 'GET',
    });
    assert.equal(detailRes.res.status, 200, 'get_certification_details status');
    assert.equal(detailRes.body.message?.certificate_id, certId, 'Certificate ID matches');
    assert.equal(detailRes.body.message?.verified, true, 'Certificate is verified');
    assert.equal(detailRes.body.message?.student?.name, studentEmail, 'Student email matches');
    console.log('  ✅ 2. Verified get_certification_details and public verification');

    // 5. Query get_certified_participants
    const certParticipants = await j('/api/method/lms.lms.api.get_certified_participants?course=fractal-kernel-fundamentals', {
        method: 'GET',
        headers: adminAuth,
    });
    assert.equal(certParticipants.res.status, 200, 'get_certified_participants status');
    assert.ok(Array.isArray(certParticipants.body.message), 'Participants is array');
    const participantFound = certParticipants.body.message.find((p) => p.certificate_id === certId);
    assert.ok(participantFound, 'Issued certificate found in participants list');
    assert.equal(participantFound.member, studentEmail, 'Participant email matches');
    console.log('  ✅ 3. Verified get_certified_participants list');

    // 6. Query get_count_of_certified_members
    const countRes = await j('/api/method/lms.lms.api.get_count_of_certified_members?course=fractal-kernel-fundamentals', {
        method: 'GET',
        headers: adminAuth,
    });
    assert.equal(countRes.res.status, 200, 'get_count_of_certified_members status');
    assert.ok(typeof countRes.body.message === 'number' && countRes.body.message >= 1, 'Count >= 1');
    console.log('  ✅ 4. Verified get_count_of_certified_members:', countRes.body.message);

    console.log('\n🎉 ALL 4 CERTIFICATIONS IN-RAM TESTS PASSED!\n');
    process.exit(0);
})().catch((err) => {
    console.error('❌ Certificate test failed:', err);
    process.exit(1);
});
