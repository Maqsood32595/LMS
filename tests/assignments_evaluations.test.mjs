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
    console.log('\n📝 [TEST] Running Assignments & Evaluator Suite in RAM...\n');

    const tutorLogin = await j('/api/method/login', { method: 'POST', body: JSON.stringify({ usr: 'testtutor@fractallms.app', pwd: 'admin' }) });
    const tutorCookie = (tutorLogin.res.headers.get('set-cookie') || '').match(/user_id=([^;]+)/)[1];
    const tutorAuth = { Cookie: `user_id=${tutorCookie}` };

    const studentLogin = await j('/api/method/login', { method: 'POST', body: JSON.stringify({ usr: 'smoke@test.com', pwd: 'Test1234' }) });
    const studentCookie = (studentLogin.res.headers.get('set-cookie') || '').match(/user_id=([^;]+)/)[1];
    const studentAuth = { Cookie: `user_id=${studentCookie}` };

    const RUN = Date.now().toString(36);
    let assignmentId = null;

    const { default: pg } = await import('file:///d:/Mujahid/LMS/node_modules/pg/lib/index.js');
    const pgClient = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await pgClient.connect();

    try {
        // 1. Instructor creates assignment
        const createAssign = await j('/api/method/frappe.client.insert', {
            method: 'POST',
            headers: tutorAuth,
            body: JSON.stringify({
                doc: {
                    doctype: 'LMS Assignment',
                    title: `Kernel Allocator Lab ${RUN}`,
                    instructions: 'Implement a memory-safe slab allocator.',
                    max_score: 100,
                },
            }),
        });
        assert.equal(createAssign.res.status, 200, 'Create assignment status 200');
        assignmentId = createAssign.body?.message?.id;
        assert.ok(assignmentId, 'Assignment ID returned');
        console.log('  ✅ 1. Instructor created assignment:', assignmentId);

        // 2. Verify assignment appears in list
        const assignList = await j('/api/method/frappe.client.get_list', {
            method: 'POST',
            headers: tutorAuth,
            body: JSON.stringify({ doctype: 'LMS Assignment' }),
        });
        assert.equal(assignList.res.status, 200, 'Assignment list status 200');
        assert.ok(assignList.body?.message?.some((a) => a.name === assignmentId), 'Assignment in list');
        console.log('  ✅ 2. Verified assignment listed in frappe.client.get_list');

        // 3. Student submits assignment
        const submitAssign = await j('/api/method/frappe.client.insert', {
            method: 'POST',
            headers: studentAuth,
            body: JSON.stringify({
                doc: {
                    doctype: 'LMS Assignment Submission',
                    assignment_id: assignmentId,
                    submission_text: 'https://github.com/fractal/allocator-submission',
                },
            }),
        });
        assert.equal(submitAssign.res.status, 200, 'Student submit status 200');
        const submissionId = submitAssign.body?.message?.id;
        assert.ok(submissionId, 'Submission ID returned');
        console.log('  ✅ 3. Student submitted assignment solution:', submissionId);

        // 4. RBAC Check: Student attempts to grade submission (Must fail 403)
        const illegalGrade = await j('/api/method/lms.lms.api.save_evaluation_details', {
            method: 'POST',
            headers: studentAuth,
            body: JSON.stringify({ submission_id: submissionId, score: 100, feedback: 'I give myself 100' }),
        });
        assert.equal(illegalGrade.res.status, 403, 'Student grading must be rejected 403');
        console.log('  ✅ 4. RBAC Guard: Student illegal evaluation rejected 403');

        // 5. Instructor grades submission
        const evalRes = await j('/api/method/lms.lms.api.save_evaluation_details', {
            method: 'POST',
            headers: tutorAuth,
            body: JSON.stringify({
                submission_id: submissionId,
                score: 95,
                feedback: 'Exceptional allocator implementation with clean zero-leak cleanup!',
            }),
        });
        assert.equal(evalRes.res.status, 200, 'Instructor evaluation status 200');
        assert.equal(evalRes.body?.message?.submission?.score, 95, 'Graded score matches 95');
        assert.equal(evalRes.body?.message?.submission?.status, 'Evaluated', 'Status is Evaluated');
        console.log('  ✅ 5. Instructor successfully evaluated submission with score 95');

    } finally {
        // MANDATORY TEARDOWN
        if (assignmentId) {
            await pgClient.query('DELETE FROM assignments WHERE id::text = $1', [assignmentId]);
        }
        await pgClient.end();
        console.log('  🧹 Teardown complete. Cleaned assignment records.');
    }

    console.log('🎉 ALL ASSIGNMENTS & EVALUATIONS IN-RAM TESTS PASSED!\n');
    process.exit(0);
})().catch((err) => {
    console.error('❌ Assignments test failed:', err);
    process.exit(1);
});
