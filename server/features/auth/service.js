const bcrypt = require('bcryptjs');
const db = require('../../config/supabase');
const { signToken } = require('../../middleware/auth');

const PUBLIC_FIELDS = 'id, email, first_name, last_name, role, avatar_url, bio, headline, created_at';

async function findByEmail(email) {
    const rows = await db.query('SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1', [email]);
    return rows[0] || null;
}

async function register({ email, password, first_name, last_name }) {
    if (!email || !password) throw Object.assign(new Error('Email and password are required'), { status: 400 });
    if (await findByEmail(email)) throw Object.assign(new Error('A user with this email already exists'), { status: 409 });

    const password_hash = await bcrypt.hash(password, 10);
    const rows = await db.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, role)
         VALUES ($1, $2, $3, $4, 'student') RETURNING ${PUBLIC_FIELDS}`,
        [email.toLowerCase(), password_hash, first_name || '', last_name || '']
    );
    const user = rows[0];
    return { user, token: signToken(user) };
}

async function login({ email, password }) {
    if (!email || !password) throw Object.assign(new Error('Email and password are required'), { status: 400 });
    const user = await findByEmail(email);
    if (!user) throw Object.assign(new Error('Invalid email or password'), { status: 401 });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw Object.assign(new Error('Invalid email or password'), { status: 401 });

    const safe = stripHash(user);
    return { user: safe, token: signToken(safe) };
}

function stripHash(user) {
    const { password_hash, ...rest } = user;
    return rest;
}

// Frappe `get_user_info` equivalent: profile + membership summary
async function getUserInfo(userId) {
    const rows = await db.query(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id = $1`, [userId]);
    if (!rows[0]) throw Object.assign(new Error('User not found'), { status: 404 });

    const enrollments = await db.query(
        `SELECT e.progress, c.name AS course, c.title AS course_title, c.image
         FROM enrollments e JOIN courses c ON c.id = e.course_id
         WHERE e.member_id = $1`, [userId]
    );
    return {
        ...rows[0],
        is_system_manager: rows[0].role === 'admin',
        is_instructor: ['admin', 'instructor'].includes(rows[0].role),
        enrollments,
        social: {},
    };
}

async function getMe(userId) {
    const rows = await db.query(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id = $1`, [userId]);
    if (!rows[0]) throw Object.assign(new Error('User not found'), { status: 404 });
    return rows[0];
}

async function updateProfile(userId, body) {
    const allowed = ['first_name', 'last_name', 'bio', 'headline', 'avatar_url'];
    const sets = [], params = [];
    for (const key of allowed) {
        if (key in body) { params.push(body[key]); sets.push(`${key} = $${params.length}`); }
    }
    if (!sets.length) throw Object.assign(new Error('Nothing to update'), { status: 400 });
    params.push(userId);
    const rows = await db.query(
        `UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING ${PUBLIC_FIELDS}`, params
    );
    return rows[0];
}

async function dbPing() {
    return db.ping();
}

module.exports = { register, login, getUserInfo, getMe, updateProfile, dbPing, findByEmail };
