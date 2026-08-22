const db = require('../../../config/supabase');
const { signToken } = require('../../../middleware/auth');

async function listClasses({ course_id, batch_id } = {}) {
    const params = [];
    let where = 'TRUE';
    if (course_id) { params.push(course_id); where += ` AND course_id::text = $${params.length}`; }
    if (batch_id) { params.push(batch_id); where += ` AND batch_id::text = $${params.length}`; }
    return db.query(`SELECT * FROM live_classes WHERE ${where} ORDER BY start_time ASC`, params);
}

async function createClass(body, user) {
    const { title, course_id, batch_id, start_time, duration_minutes, platform, meet_link } = body;
    if (!title || !start_time) throw Object.assign(new Error('title and start_time are required'), { status: 400 });
    const join_token = signToken({ id: user.sub, email: user.email, role: user.role }).slice(0, 48);
    const rows = await db.query(
        `INSERT INTO live_classes (title, course_id, batch_id, host_id, start_time, duration_minutes, platform, meet_link, join_token)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [title, course_id || null, batch_id || null, user.sub, start_time, duration_minutes || 60,
         platform || 'Google Meet', meet_link || '', join_token]
    );
    return rows[0];
}

async function joinClass(classId, user) {
    const rows = await db.query('SELECT * FROM live_classes WHERE id::text=$1 LIMIT 1', [classId]);
    const cls = rows[0];
    if (!cls) throw Object.assign(new Error('Live class not found'), { status: 404 });

    if (cls.course_id) {
        const e = await db.query(
            'SELECT id FROM enrollments WHERE member_id=$1 AND course_id=$2', [user.sub, cls.course_id]
        );
        if (!e[0] && !['admin', 'instructor'].includes(user.role || '')) {
            throw Object.assign(new Error('You must be enrolled to join this class'), { status: 403 });
        }
    }
    return { title: cls.title, start_time: cls.start_time, platform: cls.platform, join_url: cls.meet_link, join_token: cls.join_token };
}

module.exports = { listClasses, createClass, joinClass };
