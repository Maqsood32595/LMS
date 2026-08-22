const db = require('../../config/supabase');

async function getStats() {
    const [courses, users, enrollments] = await Promise.all([
        db.query('SELECT COUNT(*)::int AS n FROM courses WHERE published = true'),
        db.query("SELECT COUNT(*)::int AS n FROM users WHERE role = 'student'"),
        db.query('SELECT COUNT(*)::int AS n FROM enrollments'),
    ]);
    return {
        courses: courses[0].n,
        students: users[0].n,
        enrollments: enrollments[0].n,
    };
}

module.exports = { getStats };
