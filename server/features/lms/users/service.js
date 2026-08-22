const db = require('../../../config/supabase');

async function listUsers({ role, search, limit = 50, offset = 0 }) {
    const params = [];
    let where = 'TRUE';
    if (role) { params.push(role); where += ` AND role = $${params.length}`; }
    if (search) {
        params.push(`%${search}%`);
        where += ` AND (email ILIKE $${params.length} OR first_name ILIKE $${params.length} OR last_name ILIKE $${params.length})`;
    }
    const rows = await db.query(
        `SELECT id, email, first_name, last_name, role, avatar_url, headline, created_at
         FROM users WHERE ${where}
         ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, Number(limit), Number(offset)]
    );
    return rows;
}

async function getPublicProfile(id) {
    const rows = await db.query(
        `SELECT id, email, first_name, last_name, role, avatar_url, bio, headline, created_at
         FROM users WHERE id = $1`, [id]
    );
    if (!rows[0]) throw Object.assign(new Error('User not found'), { status: 404 });
    return rows[0];
}

module.exports = { listUsers, getPublicProfile };
