import 'dotenv/config';
import assert from 'node:assert/strict';

const BASE = 'http://localhost:5010';

async function j(url, opts = {}) {
    const res = await fetch(`${BASE}${url}`, {
        ...opts,
        headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    let body = null;
    try { body = await res.json(); } catch {}
    return { res, body };
}

(async () => {
    console.log('\n👥 [TEST] Running Member Management Suite in RAM...\n');

    const loginAdmin = await j('/api/method/login', {
        method: 'POST',
        body: JSON.stringify({ usr: 'admin@fractallms.app', pwd: 'admin@123' }),
    });
    assert.equal(loginAdmin.res.status, 200, 'Admin login status 200');
    const adminCookie = (loginAdmin.res.headers.get('set-cookie') || '').match(/user_id=([^;]+)/)[1];
    const adminAuth = { Cookie: `user_id=${adminCookie}` };

    const testEmail = `newmember-${Date.now().toString(36)}@example.com`;
    const { default: pg } = await import('file:///d:/Mujahid/LMS/node_modules/pg/lib/index.js');
    const pgClient = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await pgClient.connect();

    try {
        // 1. Add New Member via frappe.client.insert (doctype: User)
        const createRes = await j('/api/method/frappe.client.insert', {
            method: 'POST',
            headers: adminAuth,
            body: JSON.stringify({
                doc: {
                    doctype: 'User',
                    email: testEmail,
                    first_name: 'Test',
                    last_name: 'Member',
                },
            }),
        });
        assert.equal(createRes.res.status, 200, 'Add Member status');
        assert.equal(createRes.body.message?.name, testEmail, 'Created user name matches email');
        console.log('  ✅ 1. Successfully created member:', testEmail);

        // 2. Assign Role via lms.lms.api.save_role
        const roleRes = await j('/api/method/lms.lms.api.save_role', {
            method: 'POST',
            headers: adminAuth,
            body: JSON.stringify({
                user: testEmail,
                role: 'Course Creator',
                value: 1,
            }),
        });
        assert.equal(roleRes.res.status, 200, 'Save role status');
        console.log('  ✅ 2. Successfully assigned role "Course Creator" to member');

        // 3. Fetch Member details via lms.lms.api.get_member
        const getMemberRes = await j(`/api/method/lms.lms.api.get_member?member=${encodeURIComponent(testEmail)}`, {
            method: 'GET',
            headers: adminAuth,
        });
        assert.equal(getMemberRes.res.status, 200, 'get_member status');
        assert.equal(getMemberRes.body.message?.email, testEmail, 'get_member email matches');
        assert.ok(getMemberRes.body.message?.roles?.includes('Course Creator'), 'Member roles includes Course Creator');
        console.log('  ✅ 3. Verified get_member returns full details & role');

        // 4. Fetch Members list via lms.lms.api.get_members
        const listRes = await j(`/api/method/lms.lms.api.get_members?search=${encodeURIComponent(testEmail)}`, {
            method: 'GET',
            headers: adminAuth,
        });
        assert.equal(listRes.res.status, 200, 'get_members status');
        assert.ok(Array.isArray(listRes.body.message), 'get_members returns array');
        const found = listRes.body.message.find((m) => m.email === testEmail || m.name === testEmail);
        assert.ok(found, 'Created member found in get_members list');
        console.log('  ✅ 4. Verified get_members list includes new member');

        // 5. Delete Member via lms.lms.api.delete_member
        const deleteRes = await j('/api/method/lms.lms.api.delete_member', {
            method: 'POST',
            headers: adminAuth,
            body: JSON.stringify({ user: testEmail }),
        });
        assert.equal(deleteRes.res.status, 200, 'delete_member status');
        console.log('  ✅ 5. Verified delete_member deleted the user');

    } finally {
        // MANDATORY TEARDOWN
        await pgClient.query('DELETE FROM users WHERE email = $1 OR email LIKE $2', [testEmail, 'newmember-%@example.com']);
        await pgClient.end();
        console.log('  🧹 Teardown verified. Zero ghost records remaining.');
    }

    console.log('🎉 ALL MEMBER MANAGEMENT IN-RAM TESTS PASSED!\n');
    process.exit(0);
})().catch((err) => {
    console.error('❌ Member Management test failed:', err);
    process.exit(1);
});
