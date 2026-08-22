const db = require('../../../config/supabase');

const CARD_FIELDS = `c.id, c.name, c.title, c.short_introduction, c.image, c.category,
    c.published, c.featured, c.enable_certification, c.created_at,
    (SELECT COUNT(*)::int FROM enrollments e WHERE e.course_id = c.id) AS enrollment_count`;

async function listCourses({ category, search, featured, limit = 60, offset = 0 } = {}) {
    const params = [];
    let where = 'c.published = true';
    if (category) { params.push(category); where += ` AND c.category = $${params.length}`; }
    if (search) { params.push(`%${search}%`); where += ` AND (c.title ILIKE $${params.length} OR c.short_introduction ILIKE $${params.length})`; }
    if (featured === '1' || featured === 'true') where += ' AND c.featured = true';

    const rows = await db.query(
        `SELECT ${CARD_FIELDS} FROM courses c
         WHERE ${where}
         ORDER BY c.created_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
        [...params]
    );
    return rows;
}

async function getCourseDetail(idOrName, user) {
    const rows = await db.query(
        `SELECT ${CARD_FIELDS}, c.description FROM courses c
         WHERE c.id::text = $1 OR c.name = $1 LIMIT 1`, [idOrName]
    );
    const course = rows[0];
    if (!course) throw Object.assign(new Error('Course not found'), { status: 404 });

    const chapters = await db.query(
        `SELECT id, title, idx FROM chapters WHERE course_id = $1 ORDER BY idx`, [course.id]
    );
    for (const ch of chapters) {
        ch.lessons = await db.query(
            `SELECT id, title, content_type, include_in_preview, idx, duration
             FROM lessons WHERE chapter_id = $1 ORDER BY idx`, [ch.id]
        );
    }

    let enrolled = false;
    if (user) {
        const e = await db.query('SELECT id FROM enrollments WHERE member_id=$1 AND course_id=$2', [user.sub, course.id]);
        enrolled = e.length > 0;
    }

    const instructors = await db.query(
        `SELECT u.id, u.first_name, u.last_name, u.avatar_url, u.bio, u.headline
         FROM users u WHERE u.role IN ('admin','instructor')`
    );

    return { ...course, chapters, enrolled, instructors };
}

async function createCourse(body, user) {
    const { title, short_introduction, description, category, image, video_link, published } = body;
    if (!title) throw Object.assign(new Error('Title is required'), { status: 400 });
    const name = title.toLowerCase().replace(/[^\w]+/g, '-').slice(0, 80);
    const rows = await db.query(
        `INSERT INTO courses (name, title, short_introduction, description, category, image, video_link, published)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [name, title, short_introduction || '', description || '', category || '', image || '', video_link || '', !!published]
    );
    return rows[0];
}

async function enroll(userId, courseId) {
    const course = await db.query('SELECT id FROM courses WHERE id::text=$1 OR name=$1 LIMIT 1', [courseId]);
    if (!course[0]) throw Object.assign(new Error('Course not found'), { status: 404 });

    const existing = await db.query('SELECT * FROM enrollments WHERE member_id=$1 AND course_id=$2', [userId, course[0].id]);
    if (existing[0]) return existing[0];

    const rows = await db.query(
        `INSERT INTO enrollments (member_id, course_id) VALUES ($1,$2) RETURNING *`,
        [userId, course[0].id]
    );
    return rows[0];
}

async function listCategories() {
    return db.query('SELECT DISTINCT category FROM courses WHERE category IS NOT NULL AND category <> \'\'');
}

module.exports = { listCourses, getCourseDetail, createCourse, enroll, listCategories };
