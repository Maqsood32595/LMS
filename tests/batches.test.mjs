import 'dotenv/config';
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
    console.log('\n🎓 [TEST] Running Batches & Cohorts Grandchild Test Suite in RAM...\n');

    // 1. Authenticate admin
    const loginAdmin = await j('/api/method/login', {
        method: 'POST',
        body: JSON.stringify({ usr: 'admin@fractallms.app', pwd: 'admin@123' }),
    });
    assert.equal(loginAdmin.res.status, 200, 'Admin login failed');
    const adminCookie = (loginAdmin.res.headers.get('set-cookie') || '').match(/user_id=([^;]+)/)[1];
    const adminAuth = { Cookie: `user_id=${adminCookie}` };

    // 2. Create batch via frappe.client.insert
    const batchTitle = `Fractal Kernel Cohort ${Date.now().toString(36)}`;
    const createRes = await j('/api/method/frappe.client.insert', {
        method: 'POST',
        headers: adminAuth,
        body: JSON.stringify({
            doc: {
                doctype: 'LMS Batch',
                title: batchTitle,
                description: 'Deep dive into fractal kernel architecture',
                seats: 30,
                published: 1,
            },
        }),
    });
    assert.equal(createRes.res.status, 200, 'Create batch status');
    assert.ok(createRes.body.message?.name, 'Batch name/slug returned');
    const batchName = createRes.body.message.name;
    console.log('  ✅ 1. Created batch:', batchName);

    // 3. Query get_batches catalog
    const batchList = await j('/api/method/lms.lms.utils.get_batches', {
        method: 'GET',
        headers: adminAuth,
    });
    assert.equal(batchList.res.status, 200, 'get_batches status');
    assert.ok(Array.isArray(batchList.body.message), 'Batches is array');
    const foundBatch = batchList.body.message.find((b) => b.name === batchName);
    assert.ok(foundBatch, 'Created batch found in list');
    assert.equal(foundBatch.title, batchTitle, 'Batch title matches');
    assert.ok(Array.isArray(foundBatch.instructors), 'Instructors populated');
    console.log('  ✅ 2. Verified get_batches catalog & instructor list');

    // 4. Query get_batch_count
    const countRes = await j('/api/method/lms.lms.utils.get_batch_count', {
        method: 'GET',
        headers: adminAuth,
    });
    assert.equal(countRes.res.status, 200, 'get_batch_count status');
    assert.ok(typeof countRes.body.message === 'number' && countRes.body.message > 0, 'Count is positive number');
    console.log('  ✅ 3. Verified get_batch_count:', countRes.body.message);

    // 5. Query get_batch_details
    const detailRes = await j(`/api/method/lms.lms.utils.get_batch_details?batch=${encodeURIComponent(batchName)}`, {
        method: 'GET',
        headers: adminAuth,
    });
    assert.equal(detailRes.res.status, 200, 'get_batch_details status');
    assert.equal(detailRes.body.message?.name, batchName, 'Batch details name matches');
    console.log('  ✅ 4. Verified get_batch_details');

    // 6. Student enrollment in batch
    const studentEmail = `student-${Date.now().toString(36)}@example.com`;
    const regRes = await j('/api/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email: studentEmail, password: 'Password123!', first_name: 'Cohort', last_name: 'Student' }),
    });
    assert.equal(regRes.res.status, 201, 'Student registration status');
    const loginStudent = await j('/api/method/login', {
        method: 'POST',
        body: JSON.stringify({ usr: studentEmail, pwd: 'Password123!' }),
    });
    const studentCookie = (loginStudent.res.headers.get('set-cookie') || '').match(/user_id=([^;]+)/)[1];
    const studentAuth = { Cookie: `user_id=${studentCookie}` };

    const enrollRes = await j('/api/method/lms.lms.utils.enroll_in_batch', {
        method: 'POST',
        headers: studentAuth,
        body: JSON.stringify({ batch: batchName }),
    });
    assert.equal(enrollRes.res.status, 200, 'enroll_in_batch status');
    console.log('  ✅ 5. Student enrolled in batch');

    // 7. Verify get_my_batches returns enrolled batch
    const myBatchesRes = await j('/api/method/lms.lms.api.get_my_batches', {
        method: 'GET',
        headers: studentAuth,
    });
    assert.equal(myBatchesRes.res.status, 200, 'get_my_batches status');
    const enrolledFound = myBatchesRes.body.message.find((b) => b.name === batchName);
    assert.ok(enrolledFound, 'Enrolled batch appears in student my_batches');
    console.log('  ✅ 6. Verified student get_my_batches');

    // 8. Falsification: Student cannot create batch (403)
    const illegalCreate = await j('/api/method/frappe.client.insert', {
        method: 'POST',
        headers: studentAuth,
        body: JSON.stringify({
            doc: { doctype: 'LMS Batch', title: 'Illegal Batch' },
        }),
    });
    assert.equal(illegalCreate.res.status, 403, 'Student creating batch rejected 403');
    console.log('  ✅ 7. Verified role security guard (student rejected 403)');

    // 9. Set permanent meet_link on batch via frappe.client.set_value
    const setValRes = await j('/api/method/frappe.client.set_value', {
        method: 'POST',
        headers: adminAuth,
        body: JSON.stringify({
            doctype: 'LMS Batch',
            name: batchName,
            fieldname: 'meet_link',
            value: 'https://meet.google.com/qwe-rtyu-iop',
        }),
    });
    assert.equal(setValRes.res.status, 200, 'set_value meet_link status');
    
    // Verify get_batch_details returns updated meet_link
    const updatedDetailRes = await j(`/api/method/lms.lms.utils.get_batch_details?batch=${encodeURIComponent(batchName)}`, {
        method: 'GET',
        headers: adminAuth,
    });
    assert.equal(updatedDetailRes.body.message?.meet_link, 'https://meet.google.com/qwe-rtyu-iop', 'meet_link returned in batch details');
    console.log('  ✅ 8. Verified permanent meet_link update on batch');

    // 10. Schedule live class auto-inheriting batch meet_link
    const liveClassRes = await j('/api/method/lms.lms.doctype.lms_batch.lms_batch.create_google_meet_live_class', {
        method: 'POST',
        headers: adminAuth,
        body: JSON.stringify({
            batch_name: batchName,
            title: 'Batch Distributed Masterclass',
            date: '2026-11-01',
            time: '11:00',
            duration: 90,
        }),
    });
    assert.equal(liveClassRes.res.status, 200, 'create_google_meet_live_class status');
    assert.equal(liveClassRes.body.message?.join_url, 'https://meet.google.com/qwe-rtyu-iop', 'Auto-inherits batch permanent meet_link');
    const createdClassId = liveClassRes.body.message?.id || liveClassRes.body.message?.name;
    console.log('  ✅ 9. Verified live class auto-inherited batch permanent meet_link');

    // 11. Delete live class via delete_documents
    const delClassRes = await j('/api/method/lms.lms.api.delete_documents', {
        method: 'POST',
        headers: adminAuth,
        body: JSON.stringify({
            documents: [{ doctype: 'LMS Live Class', name: createdClassId }],
        }),
    });
    assert.equal(delClassRes.res.status, 200, 'delete_documents status');
    console.log('  ✅ 10. Verified 1-click delete live class via delete_documents');

    console.log('\n🎉 ALL 10 BATCHES & COHORTS IN-RAM TESTS PASSED!\n');

    // ── Teardown: clean up test batch, live class, and student created during this run ──
    try {
        const { default: pg } = await import('pg');
        const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
        await client.connect();
        if (createdClassId) {
            await client.query('DELETE FROM live_classes WHERE id::text = $1', [createdClassId]);
        }
        await client.query('DELETE FROM live_classes WHERE batch_id IN (SELECT id FROM batches WHERE name = $1)', [batchName]);
        await client.query('DELETE FROM batches WHERE name = $1', [batchName]);
        await client.query('DELETE FROM users WHERE email = $1', [studentEmail]);
        await client.query(`
            DELETE FROM batches
            WHERE name LIKE 'fractal-kernel-cohort-%'
               OR name LIKE '%-mt%'
               OR name = 'illegal-batch'
               OR title = 'Illegal Batch'
        `);
        await client.query(`DELETE FROM users WHERE email LIKE 'student-%@example.com'`);
        await client.end();
    } catch (_) { /* non-fatal — tests already passed */ }

    process.exit(0);
})().catch((err) => {
    console.error('❌ Batches test failed:', err);
    process.exit(1);
});
