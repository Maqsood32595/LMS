const bcrypt = require('bcryptjs');
const db = require('../../config/supabase');

async function login(usr, pwd) {
    if (!usr || !pwd) throw Object.assign(new Error('Credentials required'), { status: 400 });
    const rows = await db.query('SELECT * FROM users WHERE lower(email)=lower($1) LIMIT 1', [usr]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(pwd, user.password_hash))) {
        throw Object.assign(new Error('Invalid username or password'), { status: 401, exc_type: 'AuthenticationError' });
    }
    return { email: user.email, full_name: `${user.first_name} ${user.last_name}`.trim() };
}

function fileDict(url) {
    if (!url) return null;
    return { file_url: url, file_name: url.split('/').pop(), file_size: 0 };
}

// Upstream contract: api.py get_user_info (lines 59-82)
async function getUserInfo(email) {
    if (!email) return null; // Guest → frappe returns None

    const rows = await db.query('SELECT * FROM users WHERE lower(email)=lower($1) LIMIT 1', [email]);
    const u = rows[0];
    if (!u) return null;

    const isAdmin = u.role === 'admin';
    const isInstructor = isAdmin || u.role === 'instructor';
    const canManage = isInstructor ? 1 : 0;

    const enrolled = await db.query(
        'SELECT c.name, c.title, c.image, e.progress FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE e.member_id = $1',
        [u.id]
    );

    const perms = {};
    for (const dt of ['LMS Course', 'Course Chapter', 'Course Lesson', 'LMS Batch', 'LMS Quiz', 'LMS Assignment', 'LMS Program', 'Job Opportunity']) {
        perms[dt] = { read: 1, write: canManage, create: canManage, delete: canManage, submit: 0, cancel: 0, amend: 0, email: 0, print: 0, report: 0, import: 0, export: 0, share: 0 };
    }

    return {
        name: u.email,
        email: u.email,
        enabled: 1,
        user_image: u.avatar_url || '',
        full_name: `${u.first_name} ${u.last_name}`.trim(),
        first_name: u.first_name,
        last_name: u.last_name,
        user_type: isAdmin ? 'System Manager' : 'Website User',
        username: '',
        bio: u.bio || '',
        headline: u.headline || '',
        roles: [isAdmin ? 'System Manager' : isInstructor ? 'Course Creator' : 'LMS Student'],
        is_instructor: isInstructor,
        is_moderator: false,
        is_evaluator: false,
        is_student: !isInstructor,
        is_fc_site: false,
        is_system_manager: isAdmin,
        sitename: 'fractal-lms',
        developer_mode: 0,
        permissions: perms,
        enrolled_courses: enrolled.map((e) => ({ course: e.name, title: e.title, image: e.image, progress: Number(e.progress) })),
    };
}

// Upstream contract: api.py get_lms_settings (lines 1904-1927)
function getLmsSettings() {
    return {
        allow_guest_access: 1,
        prevent_skipping_videos: 0,
        contact_us_email: '',
        contact_us_url: '',
        livecode_url: '',
        disable_pwa: 0,
        allow_job_posting: 0,
        demo_data_present: 1,
        lesson_dwell_time: null,
        enforce_video_completion: 0,
        enforce_quiz_completion: 0,
        enforce_assignment_completion: 0,
        is_payments_app_installed: 0,
    };
}

// Upstream contract: api.py get_branding (lines 455-471) — images are file dicts
function getBranding() {
    return {
        app_name: 'Fractal LMS',
        banner_image: null,
        footer_logo: null,
        favicon: fileDict('/favicon.png'),
        app_logo: fileDict('/learning.svg'),
    };
}

// Upstream contract: api.py get_sidebar_settings (lines 850-880)
function getSidebarSettings(email) {
    if (!email) return [];
    return { courses: 1, batches: 0, certifications: 1, jobs: 0, statistics: 0, notifications: 1, programming_exercises: 0 };
}

async function getAllUsers() {
    const rows = await db.query(
        'SELECT email AS name, email, first_name, last_name, avatar_url AS user_image FROM users ORDER BY created_at DESC LIMIT 200'
    );
    return rows.map((r) => ({ ...r, full_name: `${r.first_name} ${r.last_name}`.trim() }));
}

// ── Role journeys ────────────────────────────────────────────────────────
const COURSE_CARD = 'c.name, c.title, c.image, c.short_introduction, c.category, c.published, c.enable_certification';

async function requireUser(email) {
    if (!email) throw Object.assign(new Error('Not logged in'), { status: 401, exc_type: 'AuthenticationError' });
    const rows = await db.query('SELECT * FROM users WHERE lower(email)=lower($1) LIMIT 1', [email]);
    if (!rows[0]) throw Object.assign(new Error('User not found'), { status: 401, exc_type: 'AuthenticationError' });
    return rows[0];
}

async function myCourses(email) {
    const u = await requireUser(email);
    return db.query(
        `SELECT ${COURSE_CARD.replace(/c\./g, 'c.') + ', '} e.progress
         FROM enrollments e JOIN courses c ON c.id = e.course_id
         WHERE e.member_id = $1 ORDER BY e.enrolled_on DESC`,
        [u.id]
    );
}

async function createdCourses(email) {
    const u = await requireUser(email);
    if (u.role === 'student') {
        throw Object.assign(new Error('Only Course Creators may view created courses'), { status: 403, exc_type: 'PermissionError' });
    }
    return db.query(`SELECT ${COURSE_CARD} FROM courses c ORDER BY c.created_at DESC`);
}

async function upcomingLiveClasses() {
    return db.query(
        'SELECT id, title, start_time, duration_minutes, platform, meet_link FROM live_classes WHERE start_time > now() ORDER BY start_time ASC LIMIT 10'
    );
}

async function streakInfo(email) {
    if (!email) return { current_streak: 0, longest_streak: 0 };
    const u = await requireUser(email);
    const rows = await db.query(
        `SELECT to_char(cp.completed_at, 'YYYY-MM-DD') AS d FROM course_progress cp WHERE cp.member_id = $1
         UNION SELECT to_char(qs.created_at, 'YYYY-MM-DD') FROM quiz_submissions qs WHERE qs.member_id = $1`,
        [u.id]
    );
    const dates = [...new Set(rows.map((r) => r.d))].sort();
    let cur = 0, longest = 0, run = 0, prev = null;
    for (const d of dates) {
        run = prev && (new Date(d) - new Date(prev)) === 86400000 ? run + 1 : 1;
        longest = Math.max(longest, run);
        prev = d;
    }
    // current streak counts back from today/yesterday
    const day = 86400000;
    const today = new Date().toISOString().slice(0, 10);
    let cursor = dates.includes(today) ? today : dates.includes(new Date(Date.now() - day).toISOString().slice(0, 10)) ? new Date(Date.now() - day).toISOString().slice(0, 10) : null;
    while (cursor && dates.includes(cursor)) { cur++; cursor = new Date(new Date(cursor) - day).toISOString().slice(0, 10); }
    return { current_streak: cur, longest_streak: Math.max(longest, cur) };
}

function slugify(t) {
    return String(t).toLowerCase().replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || `doc-${Date.now()}`;
}

// frappe.client.insert — whitelisted doctypes only
async function insertDoc(doc, sessionEmail) {
    const dt = doc.doctype;
    if (dt === 'LMS Enrollment') {
        const u = await requireUser(sessionEmail || doc.member);
        const course = await db.query('SELECT id FROM courses WHERE name = $1 LIMIT 1', [doc.course]);
        if (!course[0]) throw Object.assign(new Error('Course not found'), { status: 404 });
        await db.query(
            'INSERT INTO enrollments (member_id, course_id) VALUES ($1,$2) ON CONFLICT (member_id, course_id) DO NOTHING',
            [u.id, course[0].id]
        );
        return { doctype: dt, name: doc.course, course: doc.course, member: u.email };
    }
    if (dt === 'LMS Course') {
        const u = await requireUser(sessionEmail);
        if (u.role === 'student') {
            throw Object.assign(new Error('Only Course Creators can create courses'), { status: 403, exc_type: 'PermissionError' });
        }
        const title = doc.title || 'Untitled Course';
        let name = slugify(title);
        const clash = await db.query('SELECT 1 FROM courses WHERE name=$1', [name]);
        if (clash[0]) name = `${name}-${Date.now().toString(36)}`;
        const ins = await db.query(
            `INSERT INTO courses (name, title, short_introduction, description, image, video_link, category, published)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING name`,
            [name, title, doc.short_introduction || '', doc.description || '', doc.image || '', doc.video_link || '', doc.category || '', !!Number(doc.published)]
        );
        return { doctype: dt, name: ins[0].name, ...doc };
    }
    if (dt === 'LMS Category') {
        const label = doc.category_name || doc.title || doc.name || '';
        return { doctype: dt, name: slugify(label) };
    }
    throw Object.assign(new Error(`Insert not permitted for ${dt}`), { status: 403 });
}

// frappe.client.get_count — minimal counters the UI polls
async function getCount(params) {
    const dt = params.doctype || '';
    if (dt === 'Notification Log') return 0;
    if (dt === 'LMS Course') {
        const rows = await db.query('SELECT COUNT(*)::int AS n FROM courses');
        return rows[0].n;
    }
    if (dt === 'LMS Enrollment') {
        const rows = await db.query('SELECT COUNT(*)::int AS n FROM enrollments');
        return rows[0].n;
    }
    return 0;
}

async function searchUsersByRole(rolesJson) {
    let roles = [];
    try { roles = typeof rolesJson === 'string' ? JSON.parse(rolesJson) : rolesJson || []; } catch { roles = []; }
    const staffRoles = ['Course Creator', 'Moderator', 'Batch Evaluator', 'System Manager'];
    const wantStaff = roles.some((r) => staffRoles.includes(r));
    const where = wantStaff ? "role IN ('admin','instructor')" : 'TRUE';
    const rows = await db.query(
        `SELECT email AS value, email AS name, first_name, last_name, avatar_url AS user_image FROM users WHERE ${where} LIMIT 20`
    );
    return rows.map((r) => ({ ...r, label: `${r.first_name} ${r.last_name}`.trim(), description: r.email }));
}

function getPwaManifest() {
    return {
        name: 'Fractal LMS',
        short_name: 'Fractal LMS',
        description: 'Learn anything — powered by the Fractal Kernel.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#2490EF',
        icons: [
            { src: '/favicon.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/learning.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
    };
}

module.exports = {
    login, getUserInfo, getLmsSettings, getBranding, getSidebarSettings,
    getAllUsers, getPwaManifest, myCourses, createdCourses, upcomingLiveClasses,
    streakInfo, insertDoc, getCount, searchUsersByRole,
};

