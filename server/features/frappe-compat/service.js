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
    if (!email) return null;

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
        username: u.email.split('@')[0],
        bio: u.bio || '',
        headline: u.headline || '',
        roles: [isAdmin ? 'System Manager' : isInstructor ? 'Course Creator' : 'LMS Student'],
        is_instructor: isInstructor,
        is_moderator: isInstructor,
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

// Upstream contract: api.py get_branding (lines 455-471)
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
    return { courses: 1, batches: 0, certifications: 1, jobs: 0, statistics: 0, notifications: 1, programming_exercises: 0, web_pages: [] };
}

async function getAllUsers() {
    const rows = await db.query(
        'SELECT email AS name, email, first_name, last_name, avatar_url AS user_image FROM users ORDER BY created_at DESC LIMIT 200'
    );
    return rows.map((r) => ({ ...r, username: r.email.split('@')[0], full_name: `${r.first_name} ${r.last_name}`.trim() }));
}

// ── Core journey reads (upstream lms.lms.utils contracts) ───────────────
const CARDS = `c.name, c.title, c.image, c.short_introduction, c.category,
    c.published, c.featured, c.enable_certification, c.video_link,
    (SELECT COUNT(*)::int FROM enrollments e WHERE e.course_id = c.id) AS enrollment_count`;

async function staffList() {
    const rows = await db.query(
        `SELECT email AS name, email, first_name, last_name, avatar_url AS user_image
         FROM users WHERE role IN ('admin','instructor') LIMIT 10`
    );
    return rows.map((r) => ({
        ...r,
        username: r.email.split('@')[0],
        full_name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.email,
    }));
}

function parseFilterObj(rawFilters) {
    if (!rawFilters) return {};
    if (typeof rawFilters === 'string') {
        try { return JSON.parse(rawFilters); } catch { return {}; }
    }
    return rawFilters;
}

async function buildCourseFilterQuery({ title, category, certification, filters, user, start = 0, limit = 24, limit_page_length } = {}) {
    const f = parseFilterObj(filters);
    const effectiveTitle = title || f.title || '';
    const effectiveCategory = category || f.category || '';
    const effectiveCert = certification || f.certification;
    const isEnrolled = f.enrolled === 1 || f.enrolled === '1' || f.enrolled === true;
    const isCreated = f.created === 1 || f.created === '1' || f.created === true;

    let userRow = null;
    if (user) {
        const u = await db.query('SELECT id, role FROM users WHERE lower(email)=lower($1) LIMIT 1', [user]);
        userRow = u[0];
    }

    const p = [];
    let joins = '';
    let w = 'c.published = true';

    if (isEnrolled) {
        if (!userRow) return { sql: '', countSql: '', params: [], empty: true, userRow };
        p.push(userRow.id);
        joins += ` JOIN enrollments enr ON enr.course_id = c.id AND enr.member_id = $${p.length}`;
        w = 'TRUE';
    }

    if (effectiveTitle) {
        const queryTerm = Array.isArray(effectiveTitle) ? effectiveTitle[1] : effectiveTitle;
        p.push(`%${String(queryTerm).replace(/%/g, '')}%`);
        w += ` AND (c.title ILIKE $${p.length} OR c.short_introduction ILIKE $${p.length})`;
    }

    if (effectiveCategory) {
        p.push(effectiveCategory);
        w += ` AND c.category = $${p.length}`;
    }

    if (effectiveCert === '1' || effectiveCert === 'true' || effectiveCert === 1 || effectiveCert === true) {
        w += ' AND c.enable_certification = true';
    }

    const effectiveLimit = Number(limit_page_length || limit) || 24;
    const effectiveOffset = Number(start) || 0;

    const sql = `SELECT ${CARDS}, c.id FROM courses c ${joins} WHERE ${w} ORDER BY c.created_at DESC LIMIT ${effectiveLimit} OFFSET ${effectiveOffset}`;
    const countSql = `SELECT COUNT(*)::int AS n FROM courses c ${joins} WHERE ${w}`;

    return { sql, countSql, params: p, empty: false, userRow };
}

async function getCourses(params = {}) {
    const q = await buildCourseFilterQuery(params);
    if (q.empty) return [];

    const rows = await db.query(q.sql, q.params);
    const staff = await staffList();

    let enrolledMap = new Map();
    if (q.userRow) {
        const enrolls = await db.query(
            'SELECT course_id, progress, status FROM enrollments WHERE member_id = $1',
            [q.userRow.id]
        );
        for (const e of enrolls) {
            enrolledMap.set(e.course_id, { progress: Number(e.progress), status: e.status });
        }
    }

    return rows.map((r) => {
        const mem = enrolledMap.get(r.id) || null;
        return {
            ...r,
            instructors: staff || [],
            membership: mem ? { ...mem, course: r.name, member: params.user } : null,
        };
    });
}

async function getCourseCount(params = {}) {
    const q = await buildCourseFilterQuery(params);
    if (q.empty) return 0;
    const rows = await db.query(q.countSql, q.params);
    return rows[0]?.n || 0;
}

async function getCourseCategories() {
    const rows = await db.query(
        "SELECT DISTINCT category AS name FROM courses WHERE category IS NOT NULL AND category <> '' ORDER BY category ASC"
    );
    return [
        { label: '', value: null },
        ...rows.map((r) => ({ label: r.name, value: r.name, name: r.name })),
    ];
}

async function courseByName(name) {
    const rows = await db.query(
        `SELECT c.*, (SELECT COUNT(*)::int FROM enrollments e WHERE e.course_id = c.id) AS enrollment_count
         FROM courses c WHERE c.name = $1 OR c.id::text = $1 LIMIT 1`, [name]
    );
    if (!rows[0]) throw Object.assign(new Error('Course not found'), { status: 404 });
    return rows[0];
}

async function getCourseDetails({ course, user }) {
    const c = await courseByName(course);
    const chapters = await db.query(
        'SELECT id AS name, title, idx FROM chapters WHERE course_id = $1 ORDER BY idx', [c.id]
    );
    for (const ch of chapters) {
        ch.lessons = await db.query(
            `SELECT id AS name, title, content_type, include_in_preview, idx, duration, quiz_id
             FROM lessons WHERE chapter_id = $1 ORDER BY idx`, [ch.name]
        );
    }
    const instructors = await staffList();
    const related_courses = await getRelatedCourses({ course: c.name, category: c.category });
    let membership = null;
    let roleRow = null;
    if (user) {
        const u = await db.query('SELECT id, role FROM users WHERE lower(email)=lower($1) LIMIT 1', [user]);
        if (u[0]) {
            roleRow = u[0];
            const enr = await db.query('SELECT progress, status FROM enrollments WHERE member_id=$1 AND course_id=$2 LIMIT 1', [u[0].id, c.id]);
            if (enr[0]) membership = { progress: Number(enr[0].progress), status: enr[0].status, course: c.name, member: user };
        }
    }
    return {
        ...c,
        published: !!c.published,
        featured: !!c.featured,
        enable_certification: !!c.enable_certification,
        chapters,
        instructors: instructors || [],
        related_courses: related_courses || [],
        membership,
        is_instructor: roleRow ? roleRow.role === 'admin' || roleRow.role === 'instructor' : false,
        allow_self_enrollment: 1,
        allow_guest_access: 1,
    };
}

async function getRelatedCourses({ course, category } = {}) {
    const p = [];
    let w = 'c.published = true';
    if (course) { p.push(course); w += ` AND c.name <> $${p.length}`; }
    if (category) { p.push(category); w += ` AND c.category = $${p.length}`; }
    const rows = await db.query(`SELECT ${CARDS} FROM courses c WHERE ${w} ORDER BY c.created_at DESC LIMIT 4`, p);
    const staff = await staffList();
    return rows.map((r) => ({ ...r, instructors: staff || [], membership: null }));
}

async function getCourseOutline({ course, user } = {}) {
    const c = await courseByName(course);
    const chapters = await db.query(
        'SELECT id AS name, title, idx FROM chapters WHERE course_id = $1 ORDER BY idx',
        [c.id]
    );

    let completedLessons = new Set();
    if (user) {
        const u = await db.query('SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1', [user]);
        if (u[0]) {
            const comp = await db.query('SELECT lesson_id FROM course_progress WHERE member_id = $1', [u[0].id]);
            for (const r of comp) completedLessons.add(r.lesson_id);
        }
    }

    for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i];
        const lessons = await db.query(
            `SELECT id AS name, title, content_type, include_in_preview, idx, duration, quiz_id
             FROM lessons WHERE chapter_id = $1 ORDER BY idx`,
            [ch.name]
        );
        ch.lessons = lessons.map((l, lIdx) => {
            const isComp = completedLessons.has(l.name);
            return {
                ...l,
                number: `${i + 1}-${lIdx + 1}`,
                is_complete: isComp,
                completed: isComp,
            };
        });
    }

    return chapters;
}

async function getLesson({ course, chapter, lesson, user } = {}) {
    const c = await courseByName(course);
    let row = null;

    if (chapter !== undefined && lesson !== undefined && !String(lesson).includes('-')) {
        const chIdx = Number(chapter) - 1;
        const lIdx = Number(lesson) - 1;
        const chapters = await db.query(
            'SELECT id, title FROM chapters WHERE course_id = $1 ORDER BY idx LIMIT 1 OFFSET $2',
            [c.id, Math.max(0, chIdx)]
        );
        if (chapters[0]) {
            const lessons = await db.query(
                `SELECT l.*, ch.title AS chapter_title
                 FROM lessons l
                 JOIN chapters ch ON ch.id = l.chapter_id
                 WHERE l.chapter_id = $1 ORDER BY l.idx LIMIT 1 OFFSET $2`,
                [chapters[0].id, Math.max(0, lIdx)]
            );
            row = lessons[0];
        }
    } else {
        const lessonIdentifier = lesson || chapter;
        const rows = await db.query(
            `SELECT l.*, ch.title AS chapter_title
             FROM lessons l
             JOIN chapters ch ON ch.id = l.chapter_id
             WHERE (l.id::text = $1 OR l.title = $1)
               AND ch.course_id = $2
             LIMIT 1`,
            [lessonIdentifier, c.id]
        );
        row = rows[0];
    }

    if (!row) throw Object.assign(new Error('Lesson not found'), { status: 404 });

    let membership = null;
    if (user) {
        const u = await db.query('SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1', [user]);
        if (u[0]) {
            const enr = await db.query('SELECT progress, status FROM enrollments WHERE member_id=$1 AND course_id=$2 LIMIT 1', [u[0].id, c.id]);
            if (enr[0]) membership = { progress: Number(enr[0].progress), status: enr[0].status, course: c.name, member: user };
        }
    }

    const gcloud = require('../../config/gcloud');
    let videoUrl = row.video_url || null;
    if (row.file && gcloud?.generateSignedUrl) {
        try { videoUrl = await gcloud.generateSignedUrl(row.file); } catch (_) {}
    }

    let editorContent = row.body || '';
    if (editorContent && !editorContent.startsWith('{')) {
        editorContent = JSON.stringify({
            blocks: [{ type: 'paragraph', data: { text: editorContent } }]
        });
    }

    return {
        id: row.id,
        chapter_id: row.chapter_id,
        title: row.title,
        body: row.body,
        content_type: row.content_type,
        youtube: row.youtube_id || (row.content_type === 'Video' ? 'M7lc1UVf-VE' : null),
        file: videoUrl,
        quiz_id: row.quiz_id,
        duration: row.duration,
        include_in_preview: row.include_in_preview,
        idx: row.idx,
        chapter_title: row.chapter_title,
        name: row.id,
        course: c.name,
        course_title: c.title,
        membership,
        progress: !!membership,
        content: editorContent,
        instructor_content: null,
    };
}

async function saveProgress({ lesson, course, user } = {}) {
    const u = await requireUser(user);
    let c = null;
    if (course) {
        const cRows = await db.query('SELECT id, name FROM courses WHERE name=$1 OR id::text=$1 LIMIT 1', [course]);
        c = cRows[0];
    }
    let lRows = await db.query(
        `SELECT l.id, ch.course_id FROM lessons l JOIN chapters ch ON ch.id=l.chapter_id
         WHERE l.id::text=$1 OR l.title=$1 LIMIT 1`, [lesson]
    );
    if (!lRows[0] && c) {
        lRows = await db.query(
            `SELECT l.id, ch.course_id FROM lessons l JOIN chapters ch ON ch.id=l.chapter_id
             WHERE ch.course_id=$1 ORDER BY ch.idx, l.idx LIMIT 1`, [c.id]
        );
    }
    if (!lRows[0]) throw Object.assign(new Error('Lesson not found'), { status: 404 });
    const lessonId = lRows[0].id;
    const courseId = lRows[0].course_id;

    await db.query(
        `INSERT INTO course_progress (member_id, course_id, lesson_id, completed_at)
         VALUES ($1,$2,$3,NOW()) ON CONFLICT (member_id, lesson_id) DO NOTHING`,
        [u.id, courseId, lessonId]
    );

    const total = await db.query(
        'SELECT COUNT(*)::int AS n FROM lessons l JOIN chapters ch ON ch.id=l.chapter_id WHERE ch.course_id=$1', [courseId]
    );
    const done = await db.query(
        'SELECT COUNT(*)::int AS n FROM course_progress WHERE course_id=$1 AND member_id=$2', [courseId, u.id]
    );
    const totN = total[0]?.n || 1;
    const doneN = done[0]?.n || 0;
    const progress = Math.min(100, Math.round((doneN / totN) * 100));
    const status = progress === 100 ? 'Completed' : 'In Progress';

    await db.query(
        `INSERT INTO enrollments (member_id, course_id, progress, status)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (member_id, course_id)
         DO UPDATE SET progress = $3, status = $4`,
        [u.id, courseId, progress, status]
    );

    return { progress, is_complete: progress === 100 };
}

async function getQuizWithQuestions({ quiz } = {}) {
    const qRows = await db.query(
        'SELECT id AS name, title, passing_percentage, max_attempts FROM quizzes WHERE id::text=$1 OR title=$1 LIMIT 1', [quiz]
    );
    if (!qRows[0]) throw Object.assign(new Error('Quiz not found'), { status: 404 });
    const q = qRows[0];
    const questions = await db.query(
        `SELECT id AS name, question, type, multiple, options, idx
         FROM questions WHERE quiz_id = $1 ORDER BY idx`, [q.name]
    );
    return { ...q, questions };
}

async function submitQuizLegacy({ quiz, answers, user } = {}) {
    if (!user) throw Object.assign(new Error('Authentication required'), { status: 401 });
    const ansMap = typeof answers === 'string' ? JSON.parse(answers) : (answers || {});

    const qRows = await db.query('SELECT id, passing_percentage FROM quizzes WHERE id::text=$1 OR title=$1 LIMIT 1', [quiz]);
    if (!qRows[0]) throw Object.assign(new Error('Quiz not found'), { status: 404 });
    const q = qRows[0];

    const questions = await db.query('SELECT id, options, type FROM questions WHERE quiz_id = $1', [q.id]);
    let correct = 0;
    for (const qn of questions) {
        const userChoice = ansMap[qn.id] || ansMap[String(qn.id)];
        const opts = Array.isArray(qn.options) ? qn.options : [];
        const isRight = opts.some((o) => (o.is_correct || o.correct) && (o.option === userChoice || o.id === userChoice || String(o.idx) === String(userChoice)));
        if (isRight) correct++;
    }
    const total = questions.length || 1;
    const score = correct;
    const percentage = Math.round((correct / total) * 100);
    const passed = percentage >= (q.passing_percentage || 70);

    const u = await db.query('SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1', [user]);
    if (u[0]) {
        await db.query(
            'INSERT INTO quiz_submissions (member_id, quiz_id, score, percentage, passed) VALUES ($1,$2,$3,$4,$5)',
            [u[0].id, q.id, score, percentage, passed]
        );
    }
    return { score, percentage, passed, result: passed ? 'Pass' : 'Fail' };
}

async function checkAnswer({ question, answer } = {}) {
    const rows = await db.query('SELECT options FROM questions WHERE id::text=$1 LIMIT 1', [question]);
    if (!rows[0]) throw Object.assign(new Error('Question not found'), { status: 404 });
    const opts = Array.isArray(rows[0].options) ? rows[0].options : [];
    const isRight = opts.some((o) => (o.is_correct || o.correct) && (o.option === answer || o.id === answer || String(o.idx) === String(answer)));
    return { is_correct: isRight };
}

// ── Role journeys (Student home · Tutor home · live classes · streaks) ───
function extractUser(u) {
    if (!u) return null;
    if (typeof u === 'string') return u;
    return u.fractalUser || u.email || u.user || u.name || null;
}

async function requireUser(input) {
    const email = extractUser(input);
    if (!email) throw Object.assign(new Error('Authentication required'), { status: 401, exc_type: 'AuthenticationError' });
    const rows = await db.query('SELECT id, email, role FROM users WHERE lower(email)=lower($1) LIMIT 1', [email]);
    if (!rows[0]) throw Object.assign(new Error('User not found'), { status: 404 });
    return rows[0];
}

async function myCourses(input) {
    const email = extractUser(input);
    if (!email) return [];
    const u = await requireUser(email);
    return db.query(
        `SELECT c.name, c.title, c.image, c.short_introduction, c.category, c.published, c.enable_certification, e.progress
         FROM enrollments e JOIN courses c ON c.id = e.course_id
         WHERE e.member_id = $1 ORDER BY e.enrolled_on DESC`,
        [u.id]
    );
}

async function createdCourses(input) {
    const email = extractUser(input);
    const u = await requireUser(email);
    if (u.role === 'student') {
        throw Object.assign(new Error('Only Course Creators can view created courses'), { status: 403, exc_type: 'PermissionError' });
    }
    const rows = await db.query(`SELECT ${CARDS} FROM courses c ORDER BY c.created_at DESC`);
    const staff = await staffList();
    return rows.map((r) => ({ ...r, instructors: staff || [], membership: null }));
}

async function upcomingLiveClasses() {
    const rows = await db.query(
        `SELECT lc.id AS name, lc.title, lc.start_time, lc.duration_minutes, lc.platform, lc.meet_link,
                c.title AS course_title, c.name AS course,
                u.email AS host_email, u.first_name AS host_first_name, u.last_name AS host_last_name, u.avatar_url AS host_image
         FROM live_classes lc
         LEFT JOIN courses c ON c.id = lc.course_id
         LEFT JOIN users u ON u.id = lc.host_id
         ORDER BY lc.start_time ASC`
    );
    return rows.map((r) => ({
        name: r.name,
        title: r.title,
        start_time: r.start_time,
        duration: r.duration_minutes,
        platform: r.platform,
        join_url: r.meet_link,
        course_title: r.course_title,
        course: r.course,
        host: {
            name: r.host_email,
            full_name: `${r.host_first_name || ''} ${r.host_last_name || ''}`.trim() || r.host_email,
            user_image: r.host_image,
        },
    }));
}

async function streakInfo(input) {
    const email = extractUser(input);
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
    if (dt === 'LMS Batch') {
        const u = await requireUser(sessionEmail);
        if (u.role === 'student') {
            throw Object.assign(new Error('Only Course Creators can create batches'), { status: 403, exc_type: 'PermissionError' });
        }
        const title = doc.title || 'Untitled Batch';
        let name = slugify(title);
        const clash = await db.query('SELECT 1 FROM batches WHERE name=$1', [name]);
        if (clash[0]) name = `${name}-${Date.now().toString(36)}`;
        const ins = await db.query(
            `INSERT INTO batches (name, title, description, start_date, end_date, seats, published)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING name`,
            [name, title, doc.description || doc.batch_details || '', doc.start_date || null, doc.end_date || null, Number(doc.seats) || 50, !!Number(doc.published)]
        );
        return { doctype: dt, name: ins[0].name, ...doc };
    }
    if (dt === 'LMS Batch Enrollment' || dt === 'Batch Enrollment') {
        const u = await requireUser(sessionEmail || doc.member);
        const b = await db.query('SELECT id, name FROM batches WHERE name=$1 OR id::text=$1 LIMIT 1', [doc.batch]);
        if (!b[0]) throw Object.assign(new Error('Batch not found'), { status: 404 });
        await db.query(
            'INSERT INTO batch_enrollments (batch_id, member_id) VALUES ($1,$2) ON CONFLICT (batch_id, member_id) DO NOTHING',
            [b[0].id, u.id]
        );
        return { doctype: dt, name: b[0].name, batch: b[0].name, member: u.email };
    }
    if (dt === 'LMS Certificate') {
        const u = await requireUser(doc.member || sessionEmail);
        const course = await db.query('SELECT id, name FROM courses WHERE name=$1 OR id::text=$1 LIMIT 1', [doc.course]);
        if (!course[0]) throw Object.assign(new Error('Course not found'), { status: 404 });
        const certId = `CERT-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
        const ins = await db.query(
            `INSERT INTO certificates (member_id, course_id, certificate_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (member_id, course_id) DO UPDATE SET issued_on = NOW()
             RETURNING id, certificate_id, issued_on`,
            [u.id, course[0].id, certId]
        );
        await db.query('UPDATE enrollments SET status = $1 WHERE member_id = $2 AND course_id = $3', ['Completed', u.id, course[0].id]);
        return {
            doctype: dt,
            name: ins[0].certificate_id,
            certificate_id: ins[0].certificate_id,
            member: u.email,
            course: course[0].name,
            issued_on: ins[0].issued_on,
        };
    }
    if (dt === 'LMS Course Review' || dt === 'Course Review') {
        const u = await requireUser(sessionEmail || doc.owner);
        const c = await db.query('SELECT id, name FROM courses WHERE name=$1 OR id::text=$1 LIMIT 1', [doc.course]);
        if (!c[0]) throw Object.assign(new Error('Course not found'), { status: 404 });
        let rating = Number(doc.rating) || 5;
        if (rating <= 1 && rating > 0) rating = Math.round(rating * 5);
        const ins = await db.query(
            `INSERT INTO reviews (member_id, course_id, rating, review)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (member_id, course_id) DO UPDATE SET rating = $3, review = $4, created_at = NOW()
             RETURNING id, rating, review`,
            [u.id, c[0].id, rating, doc.review || '']
        );
        return { doctype: dt, name: ins[0].id, id: ins[0].id, ...doc };
    }
    if (dt === 'LMS Live Class' || dt === 'Live Class') {
        const u = await requireUser(sessionEmail);
        if (u.role === 'student') {
            throw Object.assign(new Error('Only Course Creators can schedule live classes'), { status: 403, exc_type: 'PermissionError' });
        }
        let courseId = null;
        if (doc.course) {
            const c = await db.query('SELECT id FROM courses WHERE name=$1 OR id::text=$1 LIMIT 1', [doc.course]);
            if (c[0]) courseId = c[0].id;
        }
        const ins = await db.query(
            `INSERT INTO live_classes (title, course_id, host_id, start_time, duration_minutes, platform, meet_link)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [doc.title || 'Live Class', courseId, u.id, doc.start_time || new Date(), Number(doc.duration_minutes) || 60, doc.platform || 'Google Meet', doc.meet_link || 'https://meet.google.com/abc-defg-hij']
        );
        return { doctype: dt, name: ins[0].id, id: ins[0].id, ...doc };
    }
    if (dt === 'Discussion Topic') {
        const u = await requireUser(sessionEmail);
        const refDt = doc.reference_doctype;
        const refName = doc.reference_docname;
        let courseId = null;
        let lessonId = null;
        if (refDt === 'LMS Course') {
            const c = await db.query('SELECT id FROM courses WHERE name=$1 OR id::text=$1 LIMIT 1', [refName]);
            if (c[0]) courseId = c[0].id;
        } else if (refDt === 'Course Lesson') {
            const l = await db.query('SELECT l.id, ch.course_id FROM lessons l JOIN chapters ch ON ch.id = l.chapter_id WHERE l.id::text=$1 OR l.title=$1 LIMIT 1', [refName]);
            if (l[0]) { lessonId = l[0].id; courseId = l[0].course_id; }
        }
        if (!courseId) {
            const cFallback = await db.query('SELECT id FROM courses ORDER BY created_at DESC LIMIT 1');
            if (cFallback[0]) courseId = cFallback[0].id;
        }
        const ins = await db.query(
            `INSERT INTO discussions (course_id, lesson_id, member_id, title, content)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [courseId, lessonId, u.id, doc.title || 'Untitled Discussion', '']
        );
        return { doctype: dt, name: ins[0].id, id: ins[0].id };
    }
    if (dt === 'Discussion Reply') {
        const u = await requireUser(sessionEmail);
        const topicId = doc.topic;
        const topic = await db.query('SELECT id, course_id, lesson_id FROM discussions WHERE id::text=$1 LIMIT 1', [topicId]);
        if (!topic[0]) throw Object.assign(new Error('Topic not found'), { status: 404 });
        const ins = await db.query(
            `INSERT INTO discussions (course_id, lesson_id, member_id, parent_id, content)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [topic[0].course_id, topic[0].lesson_id, u.id, topic[0].id, doc.reply || '']
        );
        return { doctype: dt, name: ins[0].id, id: ins[0].id, reply: doc.reply };
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
    if (dt === 'LMS Batch') {
        const rows = await db.query('SELECT COUNT(*)::int AS n FROM batches WHERE published = true');
        return rows[0].n;
    }
    if (dt === 'LMS Course Review') {
        const filters = typeof params.filters === 'string' ? JSON.parse(params.filters) : params.filters || {};
        let w = 'TRUE';
        const p = [];
        if (filters.course) {
            p.push(filters.course);
            w += ` AND course_id = (SELECT id FROM courses WHERE name=$${p.length} OR id::text=$${p.length} LIMIT 1)`;
        }
        if (filters.owner) {
            p.push(filters.owner);
            w += ` AND member_id = (SELECT id FROM users WHERE lower(email)=lower($${p.length}) LIMIT 1)`;
        }
        const rows = await db.query(`SELECT COUNT(*)::int AS n FROM reviews WHERE ${w}`, p);
        return rows[0]?.n || 0;
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

// ── Tutor authoring ──────────────────────────────────────────────────────
async function requireStaff(email) {
    const u = await requireUser(email);
    if (u.role === 'student') {
        throw Object.assign(new Error('Only Course Creators can modify content'), { status: 403, exc_type: 'PermissionError' });
    }
    return u;
}

async function upsertChapter({ course, title, chapter, user } = {}) {
    await requireStaff(user);
    if (chapter) {
        await db.query('UPDATE chapters SET title = $1 WHERE id::text = $2', [title, chapter]);
        return { name: chapter };
    }
    const max = await db.query(
        'SELECT COALESCE(MAX(idx), -1) + 1 AS next FROM chapters WHERE course_id = (SELECT id FROM courses WHERE name=$1 LIMIT 1)',
        [course]
    );
    const rows = await db.query(
        'INSERT INTO chapters (course_id, title, idx) VALUES ((SELECT id FROM courses WHERE name=$1 LIMIT 1), $2, $3) RETURNING id AS name',
        [course, title || 'New Chapter', max[0].next]
    );
    return rows[0];
}

async function createLesson({ chapter, user } = {}) {
    await requireStaff(user);
    const max = await db.query(
        'SELECT COALESCE(MAX(idx), -1) + 1 AS next FROM lessons WHERE chapter_id::text = $1', [chapter]
    );
    const rows = await db.query(
        `INSERT INTO lessons (chapter_id, title, body, content_type, idx)
         VALUES ($1::uuid, 'New Lesson', '<p></p>', 'Text', $2) RETURNING id AS name`,
        [chapter, max[0].next]
    );
    return rows[0];
}

async function reindex(table, id, idx, user) {
    await requireStaff(user);
    const allowed = { lessons: 'lessons', chapters: 'chapters' };
    if (!allowed[table] || idx === undefined || idx === null) throw Object.assign(new Error('bad reindex args'), { status: 400 });
    await db.query(`UPDATE ${allowed[table]} SET idx = $1 WHERE id::text = $2`, [Number(idx), id]);
    return { ok: true };
}

async function delRow(table, id, user) {
    await requireStaff(user);
    const allowed = { lessons: 'lessons', chapters: 'chapters' };
    if (!allowed[table]) throw Object.assign(new Error('bad table'), { status: 400 });
    await db.query(`DELETE FROM ${allowed[table]} WHERE id::text = $1`, [id]);
    return { ok: true };
}

async function delCourse(name, user) {
    await requireStaff(user);
    await db.query('DELETE FROM courses WHERE name = $1 OR id::text = $1', [name]);
    return { ok: true };
}

async function deleteDocuments({ documents, user } = {}) {
    await requireStaff(user);
    for (const d of Array.isArray(documents) ? documents : []) {
        if (d.doctype === 'LMS Question' && d.name) {
            await db.query('DELETE FROM questions WHERE id::text = $1', [d.name]);
        }
    }
    return { ok: true };
}

async function getProfileDetails({ username, user } = {}) {
    const term = username || user || '';
    if (!term) throw Object.assign(new Error('Username is required'), { status: 400 });

    const rows = await db.query(
        `SELECT id, email, first_name, last_name, role, avatar_url, bio, headline
         FROM users
         WHERE lower(email) = lower($1)
            OR lower(email) LIKE lower($1 || '@%')
            OR lower(first_name || ' ' || last_name) = lower($1)
         LIMIT 1`,
        [term.trim()]
    );
    const u = rows[0];
    if (!u) {
        if (user) {
            const fallback = await db.query('SELECT * FROM users WHERE lower(email)=lower($1) LIMIT 1', [user]);
            if (fallback[0]) return formatProfileObj(fallback[0]);
        }
        throw Object.assign(new Error(`User ${term} not found`), { status: 404, exc_type: 'DoesNotExistError' });
    }
    return formatProfileObj(u);
}

function formatProfileObj(u) {
    const isAdmin = u.role === 'admin';
    const isInstructor = isAdmin || u.role === 'instructor';
    const fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email;

    return {
        name: u.email,
        email: u.email,
        username: u.email.split('@')[0],
        first_name: u.first_name || '',
        last_name: u.last_name || '',
        full_name: fullName,
        user_image: u.avatar_url || '',
        cover_image: null,
        bio: u.bio || '',
        headline: u.headline || '',
        language: 'en',
        open_to: null,
        linkedin: '',
        github: '',
        twitter: '',
        roles: [isAdmin ? 'System Manager' : isInstructor ? 'Course Creator' : 'LMS Student'],
        is_instructor: isInstructor,
        is_system_manager: isAdmin,
    };
}

// ── frappe.client generic reads ─────────────────────────────────────────
const LIST_TABLES = {
    'LMS Quiz Submission': "SELECT qs.id AS name, qs.score, qs.percentage, qs.passed, qs.created_at::text AS creation FROM quiz_submissions qs",
    'LMS Course Review': "SELECT r.id AS name, r.rating, r.review, r.created_at::text AS creation FROM reviews r",
    'LMS Certificate': "SELECT cert.id AS name, cert.certificate_id, cert.issued_on::text AS creation, c.title AS course_title, c.name AS course FROM certificates cert JOIN courses c ON c.id = cert.course_id",
    'Job Opportunity': "SELECT NULL::text AS name WHERE false",
};
async function clientGetList({ doctype, filters = {}, limit = 20 } = {}) {
    const base = LIST_TABLES[doctype];
    if (!base) return [];
    const where = [];
    const params = [];
    for (const [k, v] of Object.entries(filters || {})) {
        if (k === 'member' || k === 'owner') { params.push(v); where.push(`member_id = (SELECT id FROM users WHERE lower(email)=lower($${params.length}))`); }
        else if (k === 'quiz') {
            params.push(v);
            where.push(`quiz_id = (SELECT id FROM quizzes WHERE id::text=$${params.length} OR title=$${params.length})`);
        }
    }
    const sql = `${base} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY creation DESC LIMIT ${Number(limit) || 20}`;
    return db.query(sql, params);
}

const VALUE_TABLES = {
    File: () => ({ file_name: '', file_size: 0, file_url: '' }),
    'LMS Settings': () => ({ allow_guest_access: 1 }),
};

async function clientGetValue({ doctype, fieldname }) {
    const fn = VALUE_TABLES[doctype];
    const row = fn ? await fn() : {};
    const fields = Array.isArray(fieldname) ? fieldname : String(fieldname || '').split(',');
    const out = {};
    for (const f of fields.map((s) => s.trim()).filter(Boolean)) out[f] = row?.[f] ?? '';
    return out;
}

async function clientGet({ doctype, name } = {}) {
    if (doctype === 'LMS Settings') return getLmsSettings();
    if (doctype === 'LMS Course' && name) {
        const c = await courseByName(name);
        const staff = await staffList();
        return {
            doctype: 'LMS Course',
            name: c.name,
            title: c.title,
            image: c.image || '',
            short_introduction: c.short_introduction || '',
            description: c.description || '',
            category: c.category || '',
            published: Number(c.published) ? 1 : 0,
            featured: Number(c.featured) ? 1 : 0,
            enable_certification: Number(c.enable_certification) ? 1 : 0,
            video_link: c.video_link || '',
            instructors: staff.map((s) => ({
                instructor: s.email,
                instructor_name: s.full_name,
                name: s.email,
            })),
            paid_course: 0,
            card_gradient: 'blue',
            upcoming: 0,
        };
    }
    return {};
}

async function getDiscussionTopics({ doctype, docname, single_thread } = {}) {
    let where = 'd.parent_id IS NULL';
    const params = [];
    if (doctype === 'LMS Course' && docname) {
        params.push(docname);
        where += ` AND d.course_id = (SELECT id FROM courses WHERE name=$${params.length} OR id::text=$${params.length} LIMIT 1)`;
    } else if (doctype === 'Course Lesson' && docname) {
        params.push(docname);
        where += ` AND d.lesson_id = (SELECT id FROM lessons WHERE id::text=$${params.length} OR title=$${params.length} LIMIT 1)`;
    }
    const rows = await db.query(
        `SELECT d.id AS name, d.title, d.created_at AS creation, d.pinned,
                (SELECT COUNT(*)::int FROM discussions r WHERE r.parent_id = d.id) AS reply_count,
                u.email, u.first_name, u.last_name, u.avatar_url AS user_image
         FROM discussions d
         JOIN users u ON u.id = d.member_id
         WHERE ${where}
         ORDER BY d.pinned DESC, d.created_at DESC`,
        params
    );
    return rows.map((r) => ({
        name: r.name,
        title: r.title,
        creation: r.creation,
        pinned: r.pinned,
        reply_count: r.reply_count,
        user: {
            name: r.email,
            email: r.email,
            username: r.email.split('@')[0],
            full_name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.email,
            user_image: r.user_image || '',
        },
    }));
}

async function getDiscussionReplies({ topic } = {}) {
    if (!topic) return [];
    const rows = await db.query(
        `SELECT d.id AS name, d.parent_id AS topic, d.content AS reply, d.created_at AS creation,
                u.email, u.first_name, u.last_name, u.avatar_url AS user_image
         FROM discussions d
         JOIN users u ON u.id = d.member_id
         WHERE d.parent_id::text = $1
         ORDER BY d.created_at ASC`,
        [topic]
    );
    return rows.map((r) => ({
        name: r.name,
        topic: r.topic,
        reply: r.reply,
        creation: r.creation,
        user: {
            name: r.email,
            email: r.email,
            username: r.email.split('@')[0],
            full_name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.email,
            user_image: r.user_image || '',
        },
    }));
}

async function clientSetValue({ doctype, name, fieldname, value } = {}) {
    if (doctype === 'LMS Course' && name) {
        const colMap = {
            title: 'title',
            short_introduction: 'short_introduction',
            description: 'description',
            image: 'image',
            video_link: 'video_link',
            category: 'category',
            published: 'published',
            featured: 'featured',
            enable_certification: 'enable_certification',
        };
        const col = colMap[fieldname];
        if (col) {
            let val = value;
            if (col === 'published' || col === 'featured' || col === 'enable_certification') {
                val = Boolean(Number(value) || value === true || value === '1');
            }
            await db.query(`UPDATE courses SET ${col} = $1 WHERE name = $2 OR id::text = $2`, [val, name]);
        }
        return { ok: true, name };
    }
    if ((doctype === 'Discussion Reply' || doctype === 'Discussion Topic') && name) {
        if (fieldname === 'reply' || fieldname === 'content') {
            await db.query('UPDATE discussions SET content = $1, updated_at = NOW() WHERE id::text = $2', [value, name]);
        }
        return { ok: true, name };
    }
    return { ok: true };
}

async function getBatches({ title, category, filters, user, start = 0, limit = 24 } = {}) {
    const f = parseFilterObj(filters);
    const effectiveTitle = title || f.title || '';
    const isEnrolled = f.enrolled === 1 || f.enrolled === '1' || f.enrolled === true;

    let userRow = null;
    if (user) {
        const u = await db.query('SELECT id, role FROM users WHERE lower(email)=lower($1) LIMIT 1', [user]);
        userRow = u[0];
    }

    const p = [];
    let joins = '';
    let w = 'b.published = true';

    if (isEnrolled) {
        if (!userRow) return [];
        p.push(userRow.id);
        joins += ` JOIN batch_enrollments be ON be.batch_id = b.id AND be.member_id = $${p.length}`;
        w = 'TRUE';
    }

    if (effectiveTitle) {
        p.push(`%${String(effectiveTitle).replace(/%/g, '')}%`);
        w += ` AND (b.title ILIKE $${p.length} OR b.description ILIKE $${p.length})`;
    }

    p.push(Number(limit) || 24);
    p.push(Number(start) || 0);

    const rows = await db.query(
        `SELECT b.id, b.name, b.title, b.description, b.start_date, b.end_date, b.seats, b.published,
                (SELECT COUNT(*)::int FROM batch_enrollments be2 WHERE be2.batch_id = b.id) AS seat_count
         FROM batches b ${joins}
         WHERE ${w}
         ORDER BY b.created_at DESC
         LIMIT $${p.length - 1} OFFSET $${p.length}`,
        p
    );
    const staff = await staffList();
    return rows.map((r) => ({
        ...r,
        instructors: staff || [],
        enrolled: false,
    }));
}

async function getBatchCount({ filters, user } = {}) {
    const f = parseFilterObj(filters);
    const isEnrolled = f.enrolled === 1 || f.enrolled === '1' || f.enrolled === true;
    let userRow = null;
    if (user) {
        const u = await db.query('SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1', [user]);
        userRow = u[0];
    }
    const p = [];
    let joins = '';
    let w = 'b.published = true';
    if (isEnrolled) {
        if (!userRow) return 0;
        p.push(userRow.id);
        joins += ` JOIN batch_enrollments be ON be.batch_id = b.id AND be.member_id = $${p.length}`;
        w = 'TRUE';
    }
    const rows = await db.query(`SELECT COUNT(*)::int AS n FROM batches b ${joins} WHERE ${w}`, p);
    return rows[0]?.n || 0;
}

async function getBatchDetails({ batch, user } = {}) {
    const rows = await db.query('SELECT * FROM batches WHERE name=$1 OR id::text=$1 LIMIT 1', [batch]);
    if (!rows[0]) throw Object.assign(new Error('Batch not found'), { status: 404 });
    const b = rows[0];
    const staff = await staffList();
    let isEnrolled = false;
    if (user) {
        const u = await db.query('SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1', [user]);
        if (u[0]) {
            const enr = await db.query('SELECT 1 FROM batch_enrollments WHERE batch_id=$1 AND member_id=$2 LIMIT 1', [b.id, u[0].id]);
            if (enr[0]) isEnrolled = true;
        }
    }
    return {
        ...b,
        instructors: staff || [],
        is_enrolled: isEnrolled,
        courses: [],
    };
}

async function enrollInBatch({ batch, user } = {}) {
    const u = await requireUser(user);
    const rows = await db.query('SELECT id, name FROM batches WHERE name=$1 OR id::text=$1 LIMIT 1', [batch]);
    if (!rows[0]) throw Object.assign(new Error('Batch not found'), { status: 404 });
    await db.query(
        'INSERT INTO batch_enrollments (batch_id, member_id) VALUES ($1,$2) ON CONFLICT (batch_id, member_id) DO NOTHING',
        [rows[0].id, u.id]
    );
    return { ok: true, batch: rows[0].name };
}

async function myBatches(input) {
    const email = extractUser(input);
    if (!email) return [];
    const u = await requireUser(email);
    const rows = await db.query(
        `SELECT b.id, b.name, b.title, b.description, b.start_date, b.end_date, b.seats, b.published,
                (SELECT COUNT(*)::int FROM batch_enrollments be2 WHERE be2.batch_id = b.id) AS seat_count
         FROM batch_enrollments be
         JOIN batches b ON b.id = be.batch_id
         WHERE be.member_id = $1
         ORDER BY b.created_at DESC`,
        [u.id]
    );
    const staff = await staffList();
    return rows.map((r) => ({ ...r, instructors: staff || [], enrolled: true }));
}

async function createdBatches(input) {
    const email = extractUser(input);
    const u = await requireUser(email);
    if (u.role === 'student') {
        throw Object.assign(new Error('Only Course Creators can view created batches'), { status: 403, exc_type: 'PermissionError' });
    }
    const rows = await db.query(
        `SELECT b.id, b.name, b.title, b.description, b.start_date, b.end_date, b.seats, b.published,
                (SELECT COUNT(*)::int FROM batch_enrollments be2 WHERE be2.batch_id = b.id) AS seat_count
         FROM batches b
         ORDER BY b.created_at DESC`
    );
    const staff = await staffList();
    return rows.map((r) => ({ ...r, instructors: staff || [], enrolled: false }));
}

async function getCertificationDetails({ certificate_id, name } = {}) {
    const certRef = certificate_id || name;
    if (!certRef) return {};
    const rows = await db.query(
        `SELECT cert.certificate_id, cert.issued_on,
                c.name AS course_name, c.title AS course_title,
                u.email, u.first_name, u.last_name, u.avatar_url AS user_image
         FROM certificates cert
         JOIN courses c ON c.id = cert.course_id
         JOIN users u ON u.id = cert.member_id
         WHERE cert.certificate_id = $1 OR cert.id::text = $1 LIMIT 1`,
        [certRef]
    );
    if (!rows[0]) throw Object.assign(new Error('Certificate not found'), { status: 404 });
    const r = rows[0];
    return {
        certificate_id: r.certificate_id,
        issued_on: r.issued_on,
        course: r.course_name,
        course_title: r.course_title,
        student: {
            name: r.email,
            full_name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.email,
            user_image: r.user_image,
        },
        verified: true,
    };
}

async function getCertifiedParticipants({ course, batch } = {}) {
    let where = 'TRUE';
    const params = [];
    if (course) {
        params.push(course);
        where += ` AND cert.course_id = (SELECT id FROM courses WHERE name=$${params.length} OR id::text=$${params.length} LIMIT 1)`;
    }
    const rows = await db.query(
        `SELECT cert.certificate_id, cert.issued_on,
                c.title AS course_title,
                u.email, u.first_name, u.last_name, u.avatar_url AS user_image
         FROM certificates cert
         JOIN courses c ON c.id = cert.course_id
         JOIN users u ON u.id = cert.member_id
         WHERE ${where}
         ORDER BY cert.issued_on DESC`,
        params
    );
    return rows.map((r) => ({
        certificate_id: r.certificate_id,
        issued_on: r.issued_on,
        course_title: r.course_title,
        member: r.email,
        full_name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.email,
        user_image: r.user_image,
    }));
}

async function getCountOfCertifiedMembers({ course } = {}) {
    let where = 'TRUE';
    const params = [];
    if (course) {
        params.push(course);
        where += ` AND cert.course_id = (SELECT id FROM courses WHERE name=$${params.length} OR id::text=$${params.length} LIMIT 1)`;
    }
    const rows = await db.query(`SELECT COUNT(*)::int AS n FROM certificates cert WHERE ${where}`, params);
    return rows[0]?.n || 0;
}

async function getReviews({ course } = {}) {
    let where = 'TRUE';
    const params = [];
    if (course) {
        params.push(course);
        where += ` AND r.course_id = (SELECT id FROM courses WHERE name=$${params.length} OR id::text=$${params.length} LIMIT 1)`;
    }
    const rows = await db.query(
        `SELECT r.id AS name, r.rating, r.review, r.created_at AS creation,
                c.name AS course_name,
                u.email, u.first_name, u.last_name, u.avatar_url AS user_image
         FROM reviews r
         JOIN courses c ON c.id = r.course_id
         JOIN users u ON u.id = r.member_id
         WHERE ${where}
         ORDER BY r.created_at DESC`,
        params
    );
    return rows.map((r) => ({
        name: r.name,
        course: r.course_name,
        rating: r.rating,
        review: r.review,
        creation: r.creation,
        owner_details: {
            name: r.email,
            email: r.email,
            username: r.email.split('@')[0],
            full_name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.email,
            user_image: r.user_image || '',
        },
    }));
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

/** Update a single column on the users table (used by upload_file to persist avatar_url) */
async function updateUserField(email, column, value) {
    const ALLOWED = ['avatar_url', 'cover_image_url', 'bio', 'headline', 'linkedin_id', 'github_id', 'twitter_id'];
    if (!ALLOWED.includes(column)) throw Object.assign(new Error(`Column '${column}' is not updatable`), { status: 400 });
    await db.query(`UPDATE users SET ${column} = $1 WHERE lower(email) = lower($2)`, [value, email]);
    return { ok: true };
}

module.exports = {
    login, getUserInfo, getProfileDetails, getLmsSettings, getBranding, getSidebarSettings,
    getAllUsers, getPwaManifest, myCourses, createdCourses, upcomingLiveClasses,
    streakInfo, insertDoc, getCount, searchUsersByRole,
    getCourses, getCourseCount, getCourseCategories, getCourseDetails, getRelatedCourses,
    getCourseOutline, getLesson, saveProgress, getQuizWithQuestions, submitQuizLegacy, checkAnswer,
    getDiscussionTopics, getDiscussionReplies,
    getBatches, getBatchCount, getBatchDetails, enrollInBatch, myBatches, createdBatches,
    getCertificationDetails, getCertifiedParticipants, getCountOfCertifiedMembers,
    getReviews,
    upsertChapter, createLesson, reindex, delRow, delCourse, deleteDocuments,
    clientGetList, clientGetValue, clientGet, clientSetValue, updateUserField,
};
