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
    console.log('\n📄 [TEST] Running PDF Courses & Incremental Progress Suite in RAM...\n');

    const { default: pg } = await import('pg');
    const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();

    const uid = Date.now().toString(36);
    const tutorEmail = `tutor-${uid}@college.edu`;
    const studentEmail = `student-${uid}@college.edu`;

    let courseId = null;
    let chapterId = null;
    let lessonId = null;
    let tutorId = null;
    let studentId = null;

    const { default: bcrypt } = await import('bcryptjs');
    const passHash = bcrypt.hashSync('Password123!', 10);

    try {
        // 1. Create Tutor & Student
        const tRes = await db.query(
            `INSERT INTO users (email, password_hash, first_name, last_name, role)
             VALUES ($1, $2, 'Prof', 'Tutor', 'instructor') RETURNING id`,
            [tutorEmail, passHash]
        );
        tutorId = tRes.rows[0].id;

        const sRes = await db.query(
            `INSERT INTO users (email, password_hash, first_name, last_name, role)
             VALUES ($1, $2, 'Student', 'Learner', 'student') RETURNING id`,
            [studentEmail, passHash]
        );
        studentId = sRes.rows[0].id;
        console.log('  ✅ 1. Created tutor & student users in database');

        // 2. Create Course, Chapter & PDF Lesson
        const cRes = await db.query(
            `INSERT INTO courses (title, name, published)
             VALUES ('Quantum Physics Textbook', $1, true) RETURNING id`,
            [`quantum-pdf-${uid}`]
        );
        courseId = cRes.rows[0].id;

        const chRes = await db.query(
            `INSERT INTO chapters (course_id, title, idx)
             VALUES ($1, 'Complete Textbook', 1) RETURNING id`,
            [courseId]
        );
        chapterId = chRes.rows[0].id;

        const lRes = await db.query(
            `INSERT INTO lessons (chapter_id, title, content_type, file, idx)
             VALUES ($1, 'Full Document', 'PDF', '/files/uploads/misc/sample.pdf', 1) RETURNING id`,
            [chapterId]
        );
        lessonId = lRes.rows[0].id;
        console.log('  ✅ 2. Created PDF course, chapter, and lesson');

        // 3. Authenticate student
        const loginStudent = await j('/api/method/login', {
            method: 'POST',
            body: JSON.stringify({ usr: studentEmail, pwd: 'Password123!' }),
        });
        const studentCookie = (loginStudent.res.headers.get('set-cookie') || '').match(/user_id=([^;]+)/)[1];
        const studentAuth = { Cookie: `user_id=${studentCookie}` };

        // 4. Test incremental reading progress: Page 1 and 2 of 10 (20%)
        await j('/api/method/lms.lms.api.record_pdf_reading_progress', {
            method: 'POST',
            headers: studentAuth,
            body: JSON.stringify({ lesson_id: lessonId, course_id: `quantum-pdf-${uid}`, page_number: 1, total_pages: 10 }),
        });
        const p1 = await j('/api/method/lms.lms.api.record_pdf_reading_progress', {
            method: 'POST',
            headers: studentAuth,
            body: JSON.stringify({ lesson_id: lessonId, course_id: `quantum-pdf-${uid}`, page_number: 2, total_pages: 10 }),
        });
        assert.equal(p1.res.status, 200, 'record_pdf_reading_progress status');
        assert.equal(p1.body.message?.pct_complete, 20, '2/10 pages is 20% complete');
        assert.equal(p1.body.message?.completed, false, 'Under 80% is not completed');
        console.log('  ✅ 3. Verified incremental reading progress (20% on page 2)');

        // 5. Test 80% threshold auto-completion: Read pages 3, 4, 5, 6, 7, 8 (8 of 10 pages = 80%)
        for (let p = 3; p <= 7; p++) {
            await j('/api/method/lms.lms.api.record_pdf_reading_progress', {
                method: 'POST',
                headers: studentAuth,
                body: JSON.stringify({ lesson_id: lessonId, course_id: `quantum-pdf-${uid}`, page_number: p, total_pages: 10 }),
            });
        }
        const p2 = await j('/api/method/lms.lms.api.record_pdf_reading_progress', {
            method: 'POST',
            headers: studentAuth,
            body: JSON.stringify({
                lesson_id: lessonId,
                course_id: `quantum-pdf-${uid}`,
                page_number: 8,
                total_pages: 10,
            }),
        });
        assert.equal(p2.res.status, 200, 'record_pdf_reading_progress status at 80%');
        assert.equal(p2.body.message?.pct_complete, 100, '80% threshold marks course 100% complete');
        assert.equal(p2.body.message?.completed, true, '80% threshold marks completed=true');
        console.log('  ✅ 4. Verified 80% threshold auto-completion triggers 100% mastery');

        // 6. Test frappe.client.get_single_value endpoint
        const settingsRes = await j('/api/method/frappe.client.get_single_value', {
            method: 'POST',
            headers: studentAuth,
            body: JSON.stringify({ doctype: 'LMS Settings', field: 'lesson_dwell_time' }),
        });
        assert.equal(settingsRes.res.status, 200, 'get_single_value returns 200');
        console.log('  ✅ 5. Verified frappe.client.get_single_value compatibility');

        console.log('\n🎉 ALL 5 PDF COURSES IN-RAM TESTS PASSED!\n');
    } finally {
        try {
            if (lessonId) await db.query('DELETE FROM lessons WHERE id = $1', [lessonId]);
            if (chapterId) await db.query('DELETE FROM chapters WHERE id = $1', [chapterId]);
            if (courseId) await db.query('DELETE FROM courses WHERE id = $1', [courseId]);
            if (tutorId) await db.query('DELETE FROM users WHERE id = $1', [tutorId]);
            if (studentId) await db.query('DELETE FROM users WHERE id = $1', [studentId]);
            await db.query(`DELETE FROM notifications WHERE for_user = $1`, [tutorEmail]);
            await db.end();
        } catch (_) {}
    }
    process.exit(0);
})().catch((err) => {
    console.error('❌ PDF courses test failed:', err);
    process.exit(1);
});
