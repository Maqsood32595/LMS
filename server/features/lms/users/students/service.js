const db = require('../../../../config/supabase');

// Dashboard: enrolled courses with computed progress
async function getDashboard(userId) {
    return db.query(
        `SELECT c.id, c.name, c.title, c.image, e.progress, e.status, e.enrolled_on
         FROM enrollments e JOIN courses c ON c.id = e.course_id
         WHERE e.member_id = $1 ORDER BY e.enrolled_on DESC`, [userId]
    );
}

async function getCourseProgress(userId, courseId) {
    const rows = await db.query(
        `SELECT l.id AS lesson_id, cp.completed_at
         FROM lessons l
         JOIN chapters ch ON ch.id = l.chapter_id
         LEFT JOIN course_progress cp ON cp.lesson_id = l.id AND cp.member_id = $1
         WHERE ch.course_id = $2 ORDER BY ch.idx, l.idx`,
        [userId, courseId]
    );
    const map = {};
    for (const r of rows) if (r.completed_at) map[r.lesson_id] = r.completed_at;
    return { course: courseId, completed_lessons: map };
}

async function markLessonComplete(userId, { lesson_id, course_id }) {
    if (!lesson_id || !course_id) throw Object.assign(new Error('lesson_id and course_id are required'), { status: 400 });

    await db.query(
        `INSERT INTO course_progress (member_id, lesson_id, course_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (member_id, lesson_id) DO NOTHING`,
        [userId, lesson_id, course_id]
    );

    // Recompute aggregate % on enrollments
    await db.query(
        `WITH lesson_scope AS (
             SELECT l.id FROM lessons l JOIN chapters ch ON ch.id = l.chapter_id WHERE ch.course_id = $2
         ), totals AS (
             SELECT COUNT(*)::int AS total FROM lesson_scope
         ), done AS (
             SELECT COUNT(*)::int AS n FROM course_progress cp
             WHERE cp.member_id = $1 AND cp.lesson_id IN (SELECT id FROM lesson_scope)
         )
         UPDATE enrollments e
         SET progress = ROUND(100.0 * (SELECT n FROM done) / NULLIF((SELECT total FROM totals), 0))
         WHERE e.member_id = $1 AND e.course_id = $2`,
        [userId, course_id]
    );

    const rows = await db.query('SELECT * FROM course_progress WHERE member_id=$1 AND lesson_id=$2', [userId, lesson_id]);
    return rows[0];
}

async function listStudents(user, { limit = 100, offset = 0 } = {}) {
    if (!['admin', 'instructor'].includes(user.role || '')) {
        throw Object.assign(new Error('Insufficient permissions'), { status: 403 });
    }
    return db.query(
        `SELECT id, email, first_name, last_name, role, created_at FROM users
         WHERE role='student' ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [Number(limit), Number(offset)]
    );
}

module.exports = { getDashboard, getCourseProgress, markLessonComplete, listStudents };
