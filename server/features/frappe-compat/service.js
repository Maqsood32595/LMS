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

module.exports = { login, getUserInfo, getLmsSettings, getBranding, getSidebarSettings, getAllUsers, getPwaManifest };

