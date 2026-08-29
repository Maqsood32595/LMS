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
        is_moderator: isAdmin,
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

let currentLmsSettings = {
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
    send_calendar_invite_for_evaluations: 0,
};

// Upstream contract: api.py get_lms_settings (lines 1904-1927)
function getLmsSettings() {
    return { ...currentLmsSettings };
}

function updateLmsSettings(updates) {
    if (typeof updates === 'object' && updates !== null) {
        for (const [k, v] of Object.entries(updates)) {
            currentLmsSettings[k] = v;
        }
    }
    return { ...currentLmsSettings };
}

// Upstream contract: api.py get_branding (lines 455-471)
function getBranding() {
    return {
        app_name: 'College LMS',
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
    c.published, c.featured, c.enable_certification, c.video_link, c.instructors,
    (SELECT COUNT(*)::int FROM enrollments e WHERE e.course_id = c.id) AS enrollment_count`;

// In-RAM SWR Micro-Cache (60s TTL) for static metadata queries
let staffCache = { data: null, expires: 0 };
let categoriesCache = { data: null, expires: 0 };

function invalidateMetadataCache() {
    staffCache.data = null;
    categoriesCache.data = null;
}

async function staffList() {
    if (staffCache.data && Date.now() < staffCache.expires && process.env.NODE_ENV !== 'test') {
        return staffCache.data;
    }
    const rows = await db.query(
        `SELECT DISTINCT ON (email) email AS name, email, first_name, last_name, avatar_url AS user_image, role
         FROM users WHERE role IN ('admin','instructor') ORDER BY email, created_at DESC LIMIT 5`
    );
    rows.sort((a, b) => (a.role === 'admin' ? -1 : 1));
    const seen = new Set();
    const result = [];
    for (const r of rows) {
        const fullName = `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.email;
        const key = fullName.toLowerCase();
        if (!seen.has(key)) {
            seen.add(key);
            result.push({
                ...r,
                username: r.email.split('@')[0],
                full_name: fullName,
            });
        }
    }
    staffCache = { data: result, expires: Date.now() + 60000 };
    return result;
}

async function formatInstructors(rawInstructors, fallbackStaff = []) {
    let emails = [];
    if (rawInstructors) {
        let list = typeof rawInstructors === 'string' ? JSON.parse(rawInstructors) : rawInstructors;
        if (Array.isArray(list)) {
            emails = list.map((i) => (typeof i === 'string' ? i : (i.instructor || i.name || i.email))).filter(Boolean);
        }
    }
    if (emails.length > 0) {
        const rows = await db.query(
            `SELECT email, first_name, last_name, bio, headline, avatar_url AS user_image FROM users WHERE lower(email) = ANY($1::text[])`,
            [emails.map((e) => e.toLowerCase())]
        );
        if (rows.length > 0) {
            return rows.map((r) => {
                const fullName = `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.email;
                return {
                    instructor: r.email,
                    instructor_name: fullName,
                    full_name: fullName,
                    first_name: r.first_name || '',
                    last_name: r.last_name || '',
                    name: r.email,
                    email: r.email,
                    username: r.email.split('@')[0],
                    user_image: r.user_image || '',
                    bio: r.bio || '',
                    headline: r.headline || '',
                };
            });
        }
    }
    if (fallbackStaff.length > 0) {
        const s = fallbackStaff[0];
        return [{
            instructor: s.email,
            instructor_name: s.full_name,
            full_name: s.full_name,
            first_name: s.first_name || '',
            last_name: s.last_name || '',
            name: s.email,
            email: s.email,
            username: s.username || s.email.split('@')[0],
            user_image: s.user_image || '',
            bio: s.bio || '',
            headline: s.headline || '',
        }];
    }
    return [];
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
    if (!params.user && !Number(currentLmsSettings.allow_guest_access)) {
        throw Object.assign(new Error('Guest access is disabled. Please log in.'), { status: 401, exc_type: 'AuthenticationError' });
    }
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

    const primaryInstructor = staff.length > 0 ? [staff[0]] : [];

    return Promise.all(rows.map(async (r) => {
        const mem = enrolledMap.get(r.id) || null;
        const instructors = r.instructors && Array.isArray(r.instructors) && r.instructors.length > 0
            ? await formatInstructors(r.instructors, staff)
            : primaryInstructor;
        return {
            ...r,
            instructors,
            membership: mem ? { ...mem, course: r.name, member: params.user } : null,
        };
    }));
}

async function getCourseCount(params = {}) {
    const q = await buildCourseFilterQuery(params);
    if (q.empty) return 0;
    const rows = await db.query(q.countSql, q.params);
    return rows[0]?.n || 0;
}

async function getCourseCategories() {
    if (categoriesCache.data && Date.now() < categoriesCache.expires && process.env.NODE_ENV !== 'test') {
        return categoriesCache.data;
    }
    const rows = await db.query(
        "SELECT DISTINCT category AS name FROM courses WHERE category IS NOT NULL AND category <> '' ORDER BY category ASC"
    );
    const result = [
        { label: '', value: null },
        ...rows.map((r) => ({ label: r.name, value: r.name, name: r.name })),
    ];
    categoriesCache = { data: result, expires: Date.now() + 60000 };
    return result;
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
    const staff = await staffList();
    const instructors = await formatInstructors(c.instructors, staff);
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
    const primaryInstructor = staff.length > 0 ? [staff[0]] : [];
    return Promise.all(rows.map(async (r) => {
        const instructors = r.instructors && Array.isArray(r.instructors) && r.instructors.length > 0
            ? await formatInstructors(r.instructors, staff)
            : primaryInstructor;
        return { ...r, instructors, membership: null };
    }));
}

async function getCourseOutline({ course, user } = {}) {
    const c = await courseByName(course);
    const chapters = await db.query(
        'SELECT id AS name, title, idx, is_scorm, launch_file FROM chapters WHERE course_id = $1 ORDER BY idx',
        [c.id]
    );

    let completedLessons = new Set();
    if (user) {
        const u = await db.query('SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1', [user]);
        if (u[0]) {
            const comp = await db.query('SELECT lesson_id FROM course_progress WHERE member_id = $1 AND completed_at IS NOT NULL', [u[0].id]);
            for (const r of comp) completedLessons.add(r.lesson_id);
        }
    }

    for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i];
        const isScorm = Number(ch.is_scorm) === 1;
        const lessons = await db.query(
            `SELECT id AS name, title, content_type, include_in_preview, idx, duration, quiz_id
             FROM lessons WHERE chapter_id = $1 ORDER BY idx`,
            [ch.name]
        );
        ch.lessons = lessons.map((l, lIdx) => {
            const isComp = completedLessons.has(l.name);
            return {
                ...l,
                chapter_id: ch.name,
                is_scorm: isScorm ? 1 : 0,
                number: `${i + 1}-${lIdx + 1}`,
                is_complete: isComp,
                completed: isComp,
            };
        });
        // expose is_scorm on chapter itself for CourseOutline
        ch.is_scorm = isScorm ? 1 : 0;
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
            'SELECT id, title, is_scorm, launch_file FROM chapters WHERE course_id = $1 ORDER BY idx LIMIT 1 OFFSET $2',
            [c.id, Math.max(0, chIdx)]
        );
        if (chapters[0]) {
            const lessons = await db.query(
                `SELECT l.*, ch.title AS chapter_title, ch.is_scorm, ch.launch_file
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
            `SELECT l.*, ch.title AS chapter_title, ch.is_scorm, ch.launch_file
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
    let isLessonCompleted = false;
    if (user) {
        const u = await db.query('SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1', [user]);
        if (u[0]) {
            const enr = await db.query('SELECT progress, status FROM enrollments WHERE member_id=$1 AND course_id=$2 LIMIT 1', [u[0].id, c.id]);
            if (enr[0]) membership = { progress: Number(enr[0].progress), status: enr[0].status, course: c.name, member: user };

            const cp = await db.query(
                'SELECT 1 FROM course_progress WHERE member_id=$1 AND lesson_id=$2 AND completed_at IS NOT NULL LIMIT 1',
                [u[0].id, row.id]
            );
            isLessonCompleted = Boolean(cp[0]);
        }
    }

    const gcloud = require('../../config/gcloud');
    let videoUrl = row.video_url || null;
    if (row.file && gcloud?.generateSignedUrl) {
        try { videoUrl = await gcloud.generateSignedUrl(row.file); } catch (_) {}
    }

    let editorContent = null;
    if (row.body && row.body.trim().startsWith('{')) {
        try {
            JSON.parse(row.body);
            editorContent = row.body;
        } catch (_) {
            editorContent = null;
        }
    }

    return {
        id: row.id,
        chapter_id: row.chapter_id,
        chapter_name: row.chapter_id,
        is_scorm_package: Number(row.is_scorm) ? 1 : 0,
        title: row.title,
        body: row.body,
        content_type: row.content_type,
        youtube: row.youtube || row.youtube_id || null,
        file: row.file || videoUrl || null,
        quiz_id: row.quiz_id,
        duration: row.duration,
        include_in_preview: row.include_in_preview,
        idx: row.idx,
        chapter_title: row.chapter_title,
        name: row.id,
        course: c.name,
        course_title: c.title,
        membership,
        progress: isLessonCompleted,
        content: editorContent,
        instructor_content: null,
    };
}

async function saveProgress({ lesson, course, scorm_details, user } = {}) {
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

    let scormContent = null;
    let isComplete = true;
    if (scorm_details) {
        if (typeof scorm_details === 'object') {
            scormContent = scorm_details.scorm_content || null;
            if (scorm_details.is_complete !== undefined) {
                isComplete = Boolean(scorm_details.is_complete);
            }
        }
    }

    if (isComplete) {
        await db.query(
            `INSERT INTO course_progress (member_id, course_id, lesson_id, completed_at, scorm_content)
             VALUES ($1,$2,$3,NOW(),$4)
             ON CONFLICT (member_id, lesson_id)
             DO UPDATE SET completed_at = NOW(), scorm_content = COALESCE($4, course_progress.scorm_content)`,
            [u.id, courseId, lessonId, scormContent]
        );
    } else if (scormContent) {
        await db.query(
            `INSERT INTO course_progress (member_id, course_id, lesson_id, scorm_content)
             VALUES ($1,$2,$3,$4)
             ON CONFLICT (member_id, lesson_id)
             DO UPDATE SET scorm_content = $4`,
            [u.id, courseId, lessonId, scormContent]
        );
    }

    const total = await db.query(
        'SELECT COUNT(*)::int AS n FROM lessons l JOIN chapters ch ON ch.id=l.chapter_id WHERE ch.course_id=$1', [courseId]
    );
    const done = await db.query(
        'SELECT COUNT(*)::int AS n FROM course_progress WHERE course_id=$1 AND member_id=$2 AND completed_at IS NOT NULL', [courseId, u.id]
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

    // ── Automated Notification on Course Completion ──────────────────────────
    if (progress >= 80 || status === 'Completed') {
        try {
            const staff = await db.query("SELECT email FROM users WHERE role IN ('instructor', 'admin') LIMIT 5");
            const studentName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email;
            const cInfo = await db.query('SELECT name, title FROM courses WHERE id=$1', [courseId]);
            const courseTitle = cInfo[0]?.title || 'Course';
            const courseSlug = cInfo[0]?.name || '';

            for (const s of staff) {
                if (s.email.toLowerCase() !== u.email.toLowerCase()) {
                    await createNotification({
                        for_user: s.email,
                        from_user: u.email,
                        subject: `🎓 ${studentName} completed the course "${courseTitle}"`,
                        link: `/courses/${courseSlug}`,
                        document_type: 'LMS Course',
                        document_name: courseSlug,
                    });
                }
            }
        } catch (notifErr) {
            console.error('Notification trigger error:', notifErr.message);
        }
    }

    return { progress, is_complete: progress === 100 };
}

async function getQuizWithQuestions({ quiz } = {}) {
    const qRows = await db.query(
        'SELECT id AS name, title, passing_percentage, total_marks, duration_minutes, show_answers FROM quizzes WHERE id::text=$1 OR title=$1 LIMIT 1', [quiz]
    );
    if (!qRows[0]) throw Object.assign(new Error('Quiz not found'), { status: 404 });
    const q = qRows[0];
    
    // Fetch questions ordered by idx
    const questions = await db.query(
        'SELECT id AS name, id, question, type, marks, idx FROM questions WHERE quiz_id = $1 ORDER BY idx ASC', [q.name]
    );

    const questionsByName = {};
    const quizQuestions = [];

    for (const qn of questions) {
        const opts = await db.query(
            'SELECT id, option, is_correct FROM question_options WHERE question_id = $1 ORDER BY id ASC',
            [qn.id]
        );
        
        const qDetail = {
            name: qn.name,
            question: qn.question,
            type: qn.type || 'Choices',
            multiple: 0,
            marks: Number(qn.marks) || 1,
            options: opts.map(o => ({ id: o.id, option: o.option })) // never leak is_correct to client
        };

        // Frappe LMS Quiz.vue binds option_1, option_2, option_3, option_4
        opts.forEach((o, index) => {
            qDetail[`option_${index + 1}`] = o.option;
        });

        questionsByName[qn.name] = qDetail;
        questionsByName[qn.question] = qDetail;
        quizQuestions.push({
            name: qn.name,
            question: qn.question,
            marks: Number(qn.marks) || 1
        });
    }

    const quizDoc = {
        name: q.name,
        title: q.title,
        passing_percentage: Number(q.passing_percentage) || 50,
        total_marks: Number(q.total_marks) || questions.length,
        duration: (Number(q.duration_minutes) || 15) * 60, // seconds for Vue timer
        show_answers: q.show_answers ? 1 : 0,
        questions: quizQuestions
    };

    return {
        ...quizDoc,
        quiz: quizDoc,
        questions_by_name: questionsByName,
        questions: quizQuestions
    };
}

async function submitQuizLegacy({ quiz, answers, results, user } = {}) {
    if (!user) throw Object.assign(new Error('Authentication required'), { status: 401 });
    
    // Parse answers — Quiz.vue sends { results: '[{ "question_name": "...", "answer": ["..."] }]' }
    let ansMap = {};
    if (results) {
        const parsedResults = typeof results === 'string' ? JSON.parse(results) : results;
        if (Array.isArray(parsedResults)) {
            for (const r of parsedResults) {
                if (r.question_name && r.answer) {
                    ansMap[r.question_name] = r.answer;
                }
            }
        }
    } else if (answers) {
        ansMap = typeof answers === 'string' ? JSON.parse(answers) : answers;
    }

    const qRows = await db.query('SELECT id, passing_percentage, total_marks FROM quizzes WHERE id::text=$1 OR title=$1 LIMIT 1', [quiz]);
    if (!qRows[0]) throw Object.assign(new Error('Quiz not found'), { status: 404 });
    const q = qRows[0];

    const questions = await db.query('SELECT id, type, marks FROM questions WHERE quiz_id = $1', [q.id]);
    let scored = 0;
    let totalMarks = 0;

    for (const qn of questions) {
        const qMarks = Number(qn.marks) || 1;
        totalMarks += qMarks;
        
        let userChoice = ansMap[qn.id] || ansMap[String(qn.id)];
        if (!userChoice) continue;
        if (!Array.isArray(userChoice)) userChoice = [userChoice];

        const opts = await db.query('SELECT id, option, is_correct FROM question_options WHERE question_id = $1', [qn.id]);
        const isRight = opts.some((o) => o.is_correct && userChoice.some(c => String(c) === String(o.id) || String(c).trim() === o.option?.trim()));
        if (isRight) scored += qMarks;
    }

    if (totalMarks === 0) totalMarks = questions.length || 1;
    const percentage = Math.round((scored / totalMarks) * 100);
    const passingThreshold = Number(q.passing_percentage) || 50;
    const passed = percentage >= passingThreshold;

    const u = await db.query('SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1', [user]);
    if (u[0]) {
        await db.query(
            'INSERT INTO quiz_submissions (member_id, quiz_id, score, percentage, passed, submission) VALUES ($1,$2,$3,$4,$5,$6)',
            [u[0].id, q.id, scored, percentage, passed, JSON.stringify(ansMap)]
        );
    }
    return { score: scored, total_marks: totalMarks, percentage, passed, result: passed ? 'Pass' : 'Fail' };
}

async function checkAnswer({ question, answers, answer } = {}) {
    const qRows = await db.query(
        'SELECT id, type, marks FROM questions WHERE id::text=$1 OR question=$1 LIMIT 1',
        [question]
    );
    if (!qRows[0]) throw Object.assign(new Error('Question not found'), { status: 404 });
    const q = qRows[0];

    let userAnswers = [];
    if (answers) {
        userAnswers = typeof answers === 'string' ? JSON.parse(answers) : answers;
    } else if (answer) {
        userAnswers = Array.isArray(answer) ? answer : [answer];
    }
    if (!Array.isArray(userAnswers)) userAnswers = [userAnswers];

    const opts = await db.query(
        'SELECT id, option, is_correct FROM question_options WHERE question_id = $1 ORDER BY id',
        [q.id]
    );

    const result = [];
    let allCorrect = true;

    opts.forEach((o, index) => {
        const isSelected = userAnswers.some(a => String(a) === String(o.id) || String(a).trim() === o.option?.trim());
        if (isSelected) {
            if (o.is_correct) {
                result[index] = 1;
            } else {
                result[index] = 0;
                allCorrect = false;
            }
        } else {
            if (o.is_correct) {
                result[index] = 2;
                allCorrect = false;
            } else {
                result[index] = null;
            }
        }
    });

    return result;
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
    const primaryInstructor = staff.length > 0 ? [staff[0]] : [];
    return rows.map((r) => ({ ...r, instructors: primaryInstructor, membership: null }));
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
        const studentName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email;
        const staff = await staffList();
        for (const s of staff) {
            await createNotification({
                for_user: s.email,
                from_user: u.email,
                subject: `<b>${studentName}</b> enrolled in <b>${doc.course}</b>`,
                link: `/lms/courses/${doc.course}`,
                document_type: 'LMS Course',
                document_name: doc.course,
            });
        }
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

        let instList = doc.instructors;
        let emails = [];
        if (instList) {
            if (typeof instList === 'string') { try { instList = JSON.parse(instList); } catch {} }
            if (Array.isArray(instList)) {
                emails = instList.map((i) => (typeof i === 'string' ? i : (i.instructor || i.name || i.email))).filter(Boolean);
            }
        }
        if (emails.length === 0 && sessionEmail) {
            emails = [sessionEmail];
        }

        const ins = await db.query(
            `INSERT INTO courses (name, title, short_introduction, description, image, video_link, category, published, instructors)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING name`,
            [name, title, doc.short_introduction || '', doc.description || '', doc.image || '', doc.video_link || '', doc.category || '', !!Number(doc.published), JSON.stringify(emails)]
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
    if (dt === 'LMS Quiz') {
        const u = await requireUser(sessionEmail);
        if (u.role !== 'admin' && u.role !== 'instructor') {
            throw Object.assign(new Error('Permission denied: only instructors can create quizzes'), { status: 403, exc_type: 'PermissionError' });
        }
        const ins = await db.query(
            `INSERT INTO quizzes (title, passing_percentage, total_marks, duration_minutes, show_answers)
             VALUES ($1, $2, $3, $4, $5) RETURNING id, title`,
            [doc.title || 'Untitled Quiz', doc.passing_percentage || 50, doc.total_marks || 0, doc.duration_minutes || 15, doc.show_answers !== false]
        );
        return { doctype: dt, name: ins[0].id, id: ins[0].id, title: ins[0].title };
    }
    if (dt === 'User') {
        const u = await requireUser(sessionEmail);
        if (u.role !== 'admin' && u.role !== 'instructor') {
            throw Object.assign(new Error('Permission denied: only staff can add members'), { status: 403, exc_type: 'PermissionError' });
        }
        const email = (doc.email || doc.name || '').trim().toLowerCase();
        if (!email) throw Object.assign(new Error('Email is required'), { status: 400 });
        const existing = await db.query('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
        if (existing[0]) {
            if (doc.first_name || doc.last_name) {
                await db.query(
                    'UPDATE users SET first_name = COALESCE($1, first_name), last_name = COALESCE($2, last_name) WHERE id = $3',
                    [doc.first_name || null, doc.last_name || null, existing[0].id]
                );
            }
            return { doctype: dt, name: existing[0].email, email: existing[0].email, first_name: existing[0].first_name, last_name: existing[0].last_name };
        }
        const bcrypt = require('bcryptjs');
        const defaultHash = await bcrypt.hash('Welcome123!', 10);
        const ins = await db.query(
            `INSERT INTO users (email, first_name, last_name, role, password_hash)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [email, doc.first_name || '', doc.last_name || '', 'student', defaultHash]
        );
        return { doctype: dt, name: ins[0].email, email: ins[0].email, first_name: ins[0].first_name, last_name: ins[0].last_name };
    }
    if (dt === 'LMS Assignment') {
        const u = await requireUser(sessionEmail);
        if (u.role !== 'admin' && u.role !== 'instructor') {
            throw Object.assign(new Error('Permission denied: only instructors can create assignments'), { status: 403, exc_type: 'PermissionError' });
        }
        const ins = await db.query(
            `INSERT INTO assignments (title, instructions, max_score)
             VALUES ($1, $2, $3) RETURNING id, title, max_score`,
            [doc.title || 'Untitled Assignment', doc.instructions || '', Number(doc.max_score) || 100]
        );
        return { doctype: dt, name: ins[0].id, id: ins[0].id, title: ins[0].title, max_score: ins[0].max_score };
    }
    if (dt === 'LMS Assignment Submission') {
        const u = await requireUser(sessionEmail);
        const assignmentId = doc.assignment || doc.assignment_id;
        const ins = await db.query(
            `INSERT INTO assignment_submissions (assignment_id, member_id, submission_text, attachment_url, status)
             VALUES ($1, $2, $3, $4, 'Submitted') RETURNING id, status, submitted_at`,
            [assignmentId, u.id, doc.submission_text || '', doc.attachment_url || '']
        );
        return { doctype: dt, name: ins[0].id, id: ins[0].id, status: ins[0].status };
    }
    if (dt === 'LMS Coupon') {
        const u = await requireUser(sessionEmail);
        if (u.role !== 'admin' && u.role !== 'instructor') {
            throw Object.assign(new Error('Permission denied: only instructors can create coupons'), { status: 403, exc_type: 'PermissionError' });
        }
        const code = (doc.code || doc.coupon_code || '').trim().toUpperCase();
        if (!code) throw Object.assign(new Error('Coupon code is required'), { status: 400 });
        const ins = await db.query(
            `INSERT INTO coupons (code, discount_percentage, max_uses, valid_until)
             VALUES ($1, $2, $3, $4) RETURNING id, code, discount_percentage`,
            [code, Number(doc.discount_percentage) || 10, Number(doc.max_uses) || 100, doc.valid_until || null]
        );
        return { doctype: dt, name: ins[0].code, code: ins[0].code, discount_percentage: ins[0].discount_percentage };
    }
    if (dt === 'LMS Lesson Note' || dt === 'Course Note') {
        return { doctype: dt, name: `note-${Date.now()}`, ...doc };
    }
    throw Object.assign(new Error(`Insert not permitted for ${dt}`), { status: 403 });
}

// frappe.client.get_count — minimal counters the UI polls
async function getCount(params) {
    const dt = params.doctype || '';
    if (dt === 'Notification Log') {
        const filters = typeof params.filters === 'string' ? JSON.parse(params.filters) : params.filters || {};
        const forUser = filters.for_user || params.sessionUser;
        if (!forUser) return 0;
        const isRead = filters.read === 0 || filters.read === '0' || filters.read === false ? false : null;
        if (isRead !== null) {
            const rows = await db.query('SELECT COUNT(*)::int AS n FROM notifications WHERE lower(for_user) = lower($1) AND read = $2', [forUser, isRead]);
            return rows[0]?.n || 0;
        }
        const rows = await db.query('SELECT COUNT(*)::int AS n FROM notifications WHERE lower(for_user) = lower($1)', [forUser]);
        return rows[0]?.n || 0;
    }
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
    if (dt === 'LMS Quiz') {
        const filters = typeof params.filters === 'string' ? JSON.parse(params.filters) : params.filters || {};
        let w = 'TRUE';
        const p = [];
        if (filters.title && Array.isArray(filters.title) && filters.title[0] === 'like') {
            p.push(filters.title[1]);
            w += ` AND title ILIKE $${p.length}`;
        }
        const rows = await db.query(`SELECT COUNT(*)::int AS n FROM quizzes WHERE ${w}`, p);
        return rows[0]?.n || 0;
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

async function searchUsersByRole(rolesJson, sessionEmail) {
    if (!sessionEmail) {
        throw Object.assign(new Error('Authentication required'), { status: 401, exc_type: 'AuthenticationError' });
    }
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
        } else if (d.doctype === 'LMS Live Class' && d.name) {
            await db.query('DELETE FROM live_classes WHERE id::text = $1', [d.name]);
        }
    }
    return { ok: true };
}

async function getProfileDetails({ username, user } = {}) {
    const term = username || user || '';
    if (!term) throw Object.assign(new Error('Username is required'), { status: 400 });

    const rows = await db.query(
        `SELECT id, email, first_name, last_name, role, avatar_url, bio, headline,
                linkedin, github, twitter, language, open_to
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
        language: u.language || 'en',
        open_to: u.open_to || null,
        linkedin: u.linkedin || '',
        github: u.github || '',
        twitter: u.twitter || '',
        roles: [isAdmin ? 'System Manager' : isInstructor ? 'Course Creator' : 'LMS Student'],
        is_instructor: isInstructor,
        is_system_manager: isAdmin,
    };
}


// ── frappe.client generic reads ─────────────────────────────────────────
const LIST_TABLES = {
    'LMS Enrollment': "SELECT e.id::text AS name, u.email AS member, COALESCE(NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''), u.email) AS member_name, COALESCE(u.avatar_url, '') AS member_image, SPLIT_PART(u.email, '@', 1) AS member_username, c.name AS course, e.progress, e.status, e.enrolled_on::text AS creation FROM enrollments e JOIN users u ON u.id = e.member_id JOIN courses c ON c.id = e.course_id",
    'LMS Lesson Note': "SELECT NULL::text AS name, '' AS color, '' AS highlighted_text, '' AS note, NOW()::text AS creation WHERE false",
    'LMS Quiz': "SELECT q.id::text AS name, q.title, q.passing_percentage, q.total_marks, q.show_answers, q.duration_minutes, q.created_at::text AS modified, q.created_at::text AS creation FROM quizzes q",
    'LMS Quiz Submission': "SELECT qs.id::text AS name, qs.quiz_id::text AS quiz, u.email AS member, COALESCE(NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''), u.email) AS member_name, COALESCE(u.avatar_url, '') AS member_image, q.title AS quiz_title, qs.score, q.total_marks AS score_out_of, qs.percentage, q.passing_percentage, qs.passed, qs.submission, qs.created_at::text AS creation FROM quiz_submissions qs JOIN users u ON u.id = qs.member_id JOIN quizzes q ON q.id = qs.quiz_id",
    'LMS Course Review': "SELECT r.id AS name, r.rating, r.review, r.created_at::text AS creation FROM reviews r",
    'LMS Certificate': "SELECT cert.id AS name, cert.certificate_id, cert.issued_on::text AS creation, c.title AS course_title, c.name AS course FROM certificates cert JOIN courses c ON c.id = cert.course_id",
    'LMS Assignment': "SELECT a.id::text AS name, a.title, a.instructions, a.max_score, a.created_at::text AS creation FROM assignments a",
    'LMS Assignment Submission': "SELECT sub.id::text AS name, sub.assignment_id::text AS assignment, sub.submission_text, sub.status, sub.score, sub.feedback, sub.submitted_at::text AS creation FROM assignment_submissions sub",
    'LMS Coupon': "SELECT c.id::text AS name, c.code, c.discount_percentage, c.max_uses, c.used_count, c.created_at::text AS creation FROM coupons c",
    'LMS Live Class': "SELECT lc.id::text AS name, lc.title, '' AS description, TO_CHAR(lc.start_time, 'YYYY-MM-DD') AS date, TO_CHAR(lc.start_time, 'HH24:MI') AS time, lc.duration_minutes AS duration, 0 AS attendees, lc.meet_link AS start_url, lc.meet_link AS join_url, lc.platform AS conferencing_provider, b.name AS batch_name, u.email AS owner, lc.created_at::text AS creation FROM live_classes lc LEFT JOIN batches b ON b.id = lc.batch_id LEFT JOIN users u ON u.id = lc.host_id",
    'Job Opportunity': "SELECT NULL::text AS name WHERE false",
};
async function clientGetList({ doctype, filters = {}, limit = 50, order_by, fields } = {}) {
    const base = LIST_TABLES[doctype];
    if (!base || base.includes('WHERE false')) return [];

    // ── Normalise filters: Frappe UI sends either object OR array-of-triples ──
    let parsedFilters = typeof filters === 'string' ? JSON.parse(filters) : filters || {};
    // Array-format: [["field","=","value"], ...] or [["field","like","val"]]
    if (Array.isArray(parsedFilters)) {
        const obj = {};
        for (const triple of parsedFilters) {
            if (!Array.isArray(triple) || triple.length < 3) continue;
            const [field, op, val] = triple;
            if (op === '=' || op === 'equals') obj[field] = val;
            else if (op === 'like' || op === 'Like') obj[field] = ['like', val];
        }
        parsedFilters = obj;
    }

    const where = [];
    const params = [];
    for (const [k, v] of Object.entries(parsedFilters)) {
        if (k === 'member' || k === 'owner') { 
            params.push(v); 
            if (doctype === 'LMS Enrollment') {
                where.push(`(u.email = $${params.length} OR e.member_id = (SELECT id FROM users WHERE lower(email)=lower($${params.length})))`); 
            } else if (doctype === 'LMS Quiz Submission') {
                where.push(`(u.email = $${params.length} OR qs.member_id = (SELECT id FROM users WHERE lower(email)=lower($${params.length})))`);
            } else {
                where.push(`member_id = (SELECT id FROM users WHERE lower(email)=lower($${params.length}))`);
            }
        }
        else if (k === 'batch_name' || k === 'batch') {
            params.push(v);
            where.push(`(b.name = $${params.length} OR b.id::text = $${params.length})`);
        }
        else if (k === 'course') {
            params.push(v);
            if (doctype === 'LMS Enrollment') {
                where.push(`(c.name = $${params.length} OR c.id::text = $${params.length})`);
            } else if (doctype === 'LMS Certificate') {
                where.push(`(c.name = $${params.length} OR c.id::text = $${params.length})`);
            } else {
                where.push(`course_id = (SELECT id FROM courses WHERE name = $${params.length} OR id::text = $${params.length})`);
            }
        }
        else if (k === 'quiz') {
            params.push(v);
            if (doctype === 'LMS Quiz Submission') {
                where.push(`(qs.quiz_id::text = $${params.length} OR q.title = $${params.length})`);
            } else {
                where.push(`quiz_id = (SELECT id FROM quizzes WHERE id::text=$${params.length} OR title=$${params.length})`);
            }
        }
        else if (k === 'title' && Array.isArray(v) && v[0] === 'like') {
            params.push(v[1]);
            where.push(`title ILIKE $${params.length}`);
        }
        else if (k === 'title' && typeof v === 'string') {
            params.push(v);
            where.push(`title ILIKE $${params.length}`);
        }
    }

    // ── Safe order_by — only allow known safe columns, map Frappe aliases ────
    const ORDER_MAP = {
        'creation': 'creation', 'creation desc': 'creation DESC', 'creation asc': 'creation ASC',
        'modified': 'creation', 'modified desc': 'creation DESC', 'modified asc': 'creation ASC',
        'name': 'name', 'name desc': 'name DESC', 'name asc': 'name ASC',
        'idx': 'idx', 'idx asc': 'idx ASC', 'idx desc': 'idx DESC',
        'title': 'title', 'title asc': 'title ASC', 'title desc': 'title DESC',
    };
    const safeOrder = order_by ? (ORDER_MAP[String(order_by).toLowerCase().trim()] || null) : null;
    const order = safeOrder ? `ORDER BY ${safeOrder}` : (base.includes('creation') ? 'ORDER BY creation DESC' : '');

    const sql = `${base} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ${order} LIMIT ${Number(limit) || 50}`;
    return db.query(sql, params);
}

const VALUE_TABLES = {
    File: () => ({ file_name: '', file_size: 0, file_url: '' }),
    'LMS Settings': () => ({ allow_guest_access: 1 }),
};

async function clientGetValue({ doctype, fieldname, filters } = {}) {
    if (doctype === 'LMS Course Progress' && filters) {
        const filt = typeof filters === 'string' ? JSON.parse(filters) : filters;
        const member = filt.member;
        const lesson = filt.lesson;
        const rows = await db.query(
            `SELECT cp.completed_at, cp.scorm_content
             FROM course_progress cp
             JOIN users u ON u.id = cp.member_id
             JOIN lessons l ON l.id = cp.lesson_id
             WHERE (lower(u.email) = lower($1) OR u.id::text = $1)
               AND (l.id::text = $2 OR l.title = $2)
             LIMIT 1`,
            [member, lesson]
        );
        const r = rows[0] || {};
        return {
            status: r.completed_at ? 'Complete' : 'In Progress',
            scorm_content: r.scorm_content || '',
        };
    }
    const fn = VALUE_TABLES[doctype];
    const row = fn ? await fn() : {};
    const fields = Array.isArray(fieldname) ? fieldname : String(fieldname || '').split(',');
    const out = {};
    for (const f of fields.map((s) => s.trim()).filter(Boolean)) out[f] = row?.[f] ?? '';
    return out;
}

async function clientGet({ doctype, name } = {}) {
    if (doctype === 'LMS Settings') return getLmsSettings();
    if ((doctype === 'Course Chapter' || doctype === 'Chapter' || doctype === 'LMS Chapter') && name) {
        const chRows = await db.query(
            `SELECT ch.id, ch.id AS name, ch.title, ch.idx, ch.launch_file, ch.is_scorm,
                    c.id AS course_id, c.name AS course, c.title AS course_title
             FROM chapters ch
             JOIN courses c ON c.id = ch.course_id
             WHERE ch.id::text = $1 OR ch.title = $1 LIMIT 1`,
            [name]
        );
        if (!chRows[0]) throw Object.assign(new Error(`Chapter ${name} not found`), { status: 404 });
        const ch = chRows[0];
        const lessons = await db.query(
            `SELECT l.id AS lesson, l.id::text AS name, l.title, l.idx, l.body
             FROM lessons l WHERE l.chapter_id = $1 ORDER BY l.idx ASC`,
            [ch.id]
        );
        return {
            doctype: 'Course Chapter',
            name: ch.name,
            title: ch.title,
            course: ch.course,
            course_title: ch.course_title,
            launch_file: ch.launch_file || '',
            is_scorm: Number(ch.is_scorm) ? 1 : 0,
            lessons: lessons.length ? lessons : [{ lesson: ch.id, title: ch.title }],
        };
    }
    if (doctype === 'LMS Quiz' && name) {
        const rows = await db.query(
            'SELECT id::text AS name, title, passing_percentage, total_marks, duration_minutes, show_answers, created_at::text AS modified FROM quizzes WHERE id::text = $1 OR title = $1 LIMIT 1',
            [name]
        );
        if (!rows[0]) throw Object.assign(new Error(`Quiz ${name} not found`), { status: 404 });
        const q = rows[0];
        const questions = await db.query(
            'SELECT id::text AS name, question, type, marks, idx FROM questions WHERE quiz_id::text = $1 ORDER BY idx ASC',
            [q.name]
        );
        return {
            doctype: 'LMS Quiz',
            name: q.name,
            title: q.title,
            passing_percentage: Number(q.passing_percentage) || 50,
            total_marks: Number(q.total_marks) || 0,
            duration_minutes: q.duration_minutes || 0,
            show_answers: q.show_answers ? 1 : 0,
            questions: questions.map((qs) => ({
                name: qs.name,
                question: qs.question,
                type: qs.type,
                marks: Number(qs.marks) || 1,
            })),
        };
    }
    if (doctype === 'LMS Quiz Submission' && name) {
        const rows = await db.query(`
            SELECT qs.id::text AS name, qs.quiz_id::text AS quiz, u.email AS member,
                   COALESCE(NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''), u.email) AS member_name,
                   q.title AS quiz_title, q.total_marks AS score_out_of, q.passing_percentage,
                   qs.score, qs.percentage, qs.passed, qs.submission, qs.created_at::text AS creation
            FROM quiz_submissions qs
            JOIN users u ON u.id = qs.member_id
            JOIN quizzes q ON q.id = qs.quiz_id
            WHERE qs.id::text = $1 LIMIT 1
        `, [name]);
        if (!rows[0]) throw Object.assign(new Error(`Quiz submission ${name} not found`), { status: 404 });
        const sub = rows[0];
        
        let subObj = {};
        try { subObj = typeof sub.submission === 'string' ? JSON.parse(sub.submission) : sub.submission || {}; } catch {}

        const qList = await db.query('SELECT id, question, type, marks FROM questions WHERE quiz_id = $1 ORDER BY idx ASC', [sub.quiz]);
        const result = [];
        for (const q of qList) {
            const userAns = subObj[q.id] || subObj[String(q.id)] || [];
            result.push({
                name: q.id,
                question: q.question,
                type: q.type,
                marks: q.marks,
                answer: Array.isArray(userAns) ? userAns : [userAns]
            });
        }

        return {
            doctype: 'LMS Quiz Submission',
            name: sub.name,
            quiz: sub.quiz,
            quiz_title: sub.quiz_title,
            member: sub.member,
            member_name: sub.member_name,
            score: Number(sub.score) || 0,
            score_out_of: Number(sub.score_out_of) || 0,
            percentage: Number(sub.percentage) || 0,
            passing_percentage: Number(sub.passing_percentage) || 0,
            passed: sub.passed ? 1 : 0,
            result,
            creation: sub.creation
        };
    }
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
            upcoming: Boolean(c.upcoming),
            disable_self_learning: Boolean(c.disable_self_learning),
            enforce_lesson_completion: Boolean(c.enforce_lesson_completion),
            paid_course: Boolean(c.paid_course),
            paid_certificate: Boolean(c.paid_certificate),
            video_link: c.video_link || '',
            instructors: await formatInstructors(c.instructors, staff),
            card_gradient: 'blue',
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

async function clientSetValue({ doctype, name, fieldname, value, user } = {}) {
    if (doctype === 'User' && (name || user)) {
        const caller = await requireUser(user);
        const target = (name || user || '').trim();

        // IDOR Guard: Verify caller is target user or an administrator
        const targetRows = await db.query(
            `SELECT id, email FROM users
             WHERE lower(email) = lower($1)
                OR lower(email) LIKE lower($1 || '@%')
                OR lower(first_name || ' ' || last_name) = lower($1)
                OR id::text = $1 LIMIT 1`,
            [target]
        );
        if (!targetRows[0]) throw Object.assign(new Error(`User ${target} not found`), { status: 404 });
        const targetUser = targetRows[0];

        const isSelf = caller.id === targetUser.id || caller.email.toLowerCase() === targetUser.email.toLowerCase();
        const isAdmin = caller.role === 'admin';
        if (!isSelf && !isAdmin) {
            throw Object.assign(new Error('Permission denied: cannot edit other users profiles'), { status: 403, exc_type: 'PermissionError' });
        }

        // The profile edit form sends fieldname as an object (batch update) with all profile
        // fields at once. Support both single-field (fieldname string + value) and batch forms.
        const USER_COL_MAP = {
            first_name: 'first_name',
            last_name:  'last_name',
            headline:   'headline',
            bio:        'bio',
            linkedin:   'linkedin',
            github:     'github',
            twitter:    'twitter',
            language:   'language',
            open_to:    'open_to',
            user_image: 'avatar_url',
            image:      'avatar_url',
        };

        const updates = typeof fieldname === 'object' && fieldname !== null
            ? fieldname                           // batch form: { first_name, last_name, … }
            : { [fieldname]: value };             // single form: fieldname='headline', value='…'

        // De-duplicate columns (e.g. user_image and image both map to avatar_url)
        // PostgreSQL throws a syntax error if the same column appears multiple times in SET
        const colValues = {};
        for (const [k, v] of Object.entries(updates)) {
            const col = USER_COL_MAP[k];
            if (!col) continue;
            if (colValues[col] === undefined || (v && !colValues[col])) {
                colValues[col] = v ?? null;
            }
        }

        const sets   = [];
        const params = [];
        for (const [col, val] of Object.entries(colValues)) {
            params.push(val);
            sets.push(`${col} = $${params.length}`);
        }

        if (sets.length > 0 && target) {
            params.push(target);
            const pIdx = params.length;
            await db.query(
                `UPDATE users SET ${sets.join(', ')}
                 WHERE lower(email) = lower($${pIdx})
                    OR lower(email) LIKE lower($${pIdx} || '@%')
                    OR lower(first_name || ' ' || last_name) = lower($${pIdx})
                    OR id::text = $${pIdx}`,
                params
            );
        }

        return { name: target, doctype: 'User' };
    }

    if (doctype === 'LMS Course' && name) {
        await requireStaff(user);
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
            upcoming: 'upcoming',
            disable_self_learning: 'disable_self_learning',
            enforce_lesson_completion: 'enforce_lesson_completion',
            paid_course: 'paid_course',
            paid_certificate: 'paid_certificate',
        };
        const BOOL_COLS = new Set([
            'published', 'featured', 'enable_certification',
            'upcoming', 'disable_self_learning', 'enforce_lesson_completion',
            'paid_course', 'paid_certificate',
        ]);

        // Support single-field updates (fieldname=string) and whole-doc batch updates (fieldname=object)
        const updates = typeof fieldname === 'object' && fieldname !== null
            ? fieldname
            : { [fieldname]: value };

        const sets = [];
        const params = [];
        for (const [k, v] of Object.entries(updates)) {
            const col = colMap[k];
            if (!col) continue;
            let val = v;
            if (BOOL_COLS.has(col)) {
                val = Boolean(Number(v) || v === true || v === '1');
            }
            params.push(val);
            sets.push(`${col} = $${params.length}`);
        }

        if (updates.instructors !== undefined) {
            let instList = updates.instructors;
            if (typeof instList === 'string') {
                try { instList = JSON.parse(instList); } catch {}
            }
            if (Array.isArray(instList)) {
                const emails = instList.map((i) => (typeof i === 'string' ? i : (i.instructor || i.name || i.email))).filter(Boolean);
                params.push(JSON.stringify(emails));
                sets.push(`instructors = $${params.length}::jsonb`);
            }
        }

        if (sets.length > 0) {
            params.push(name);
            await db.query(`UPDATE courses SET ${sets.join(', ')} WHERE name = $${params.length} OR id::text = $${params.length}`, params);
        }
        return { ok: true, name };
    }
    if (doctype === 'LMS Batch' && name) {
        await requireStaff(user);
        const colMap = {
            title: 'title',
            description: 'description',
            published: 'published',
            start_date: 'start_date',
            end_date: 'end_date',
            seats: 'seats',
            meet_link: 'meet_link',
            live_meeting_url: 'meet_link',
            conferencing_provider: 'conferencing_provider',
            google_meet_account: 'google_meet_account',
        };
        const updates = typeof fieldname === 'object' && fieldname !== null
            ? fieldname
            : { [fieldname]: value };

        const sets = [];
        const params = [];
        for (const [k, v] of Object.entries(updates)) {
            const col = colMap[k];
            if (!col) continue;
            params.push(v);
            sets.push(`${col} = $${params.length}`);
        }

        if (updates.instructors !== undefined) {
            let instList = updates.instructors;
            if (typeof instList === 'string') {
                try { instList = JSON.parse(instList); } catch {}
            }
            if (Array.isArray(instList)) {
                const emails = instList.map((i) => (typeof i === 'string' ? i : (i.instructor || i.name || i.email))).filter(Boolean);
                params.push(JSON.stringify(emails));
                sets.push(`instructors = $${params.length}::jsonb`);
            }
        }

        if (sets.length > 0) {
            params.push(name);
            await db.query(`UPDATE batches SET ${sets.join(', ')} WHERE name = $${params.length} OR id::text = $${params.length}`, params);
        }
        return { ok: true, name };
    }
    if ((doctype === 'Discussion Reply' || doctype === 'Discussion Topic') && name) {
        if (fieldname === 'reply' || fieldname === 'content') {
            await db.query('UPDATE discussions SET content = $1, updated_at = NOW() WHERE id::text = $2', [value, name]);
        }
        return { ok: true, name };
    }
    if (doctype === 'LMS Settings') {
        const u = await requireUser(user);
        if (u.role !== 'admin') {
            throw Object.assign(new Error('Permission denied: only administrators can modify system settings'), { status: 403, exc_type: 'PermissionError' });
        }
        const updates = typeof fieldname === 'object' && fieldname !== null
            ? fieldname
            : { [fieldname]: value };
        updateLmsSettings(updates);
        return { doctype: 'LMS Settings', name: 'LMS Settings', ...currentLmsSettings };
    }
    return { ok: true };
}


async function getBatches({ title, category, filters, user, start = 0, limit = 24 } = {}) {
    if (!user && !Number(currentLmsSettings.allow_guest_access)) {
        throw Object.assign(new Error('Guest access is disabled. Please log in.'), { status: 401, exc_type: 'AuthenticationError' });
    }
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
    const primaryInstructor = staff.length > 0 ? [staff[0]] : [];
    return rows.map((r) => ({
        ...r,
        instructors: primaryInstructor,
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
    const primaryInstructor = staff.length > 0 ? [staff[0]] : [];
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
        conferencing_provider: b.conferencing_provider || 'Google Meet',
        google_meet_account: b.google_meet_account || 'admin@fractallms.app',
        instructors: primaryInstructor,
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
    const primaryInstructor = staff.length > 0 ? [staff[0]] : [];
    return rows.map((r) => ({ ...r, instructors: primaryInstructor, enrolled: true }));
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
    const primaryInstructor = staff.length > 0 ? [staff[0]] : [];
    return rows.map((r) => ({ ...r, instructors: primaryInstructor, enrolled: false }));
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
        name: 'College LMS',
        short_name: 'College LMS',
        description: 'Learn anything — powered by the College LMS.',
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

function userRolesList(role) {
    if (role === 'admin') return ['Moderator', 'Course Creator', 'LMS Student', 'Batch Evaluator'];
    if (role === 'instructor') return ['Course Creator', 'LMS Student', 'Batch Evaluator'];
    return ['LMS Student'];
}

async function getMembers({ search, start = 0, role, limit = 20 } = {}) {
    let where = 'TRUE';
    const params = [];
    if (search && String(search).trim()) {
        params.push(`%${String(search).trim().toLowerCase()}%`);
        where += ` AND (lower(email) LIKE $${params.length} OR lower(first_name || ' ' || last_name) LIKE $${params.length})`;
    }
    if (role && role !== 'All') {
        if (role === 'Moderator') where += ` AND role = 'admin'`;
        else if (role === 'Course Creator' || role === 'Batch Evaluator') where += ` AND role IN ('admin', 'instructor')`;
    }
    params.push(Math.max(0, Number(start) || 0));
    const offsetParam = params.length;
    params.push(Math.min(100, Math.max(1, Number(limit) || 20)));
    const limitParam = params.length;

    const rows = await db.query(
        `SELECT id, email, first_name, last_name, role, avatar_url
         FROM users
         WHERE ${where}
         ORDER BY created_at DESC, first_name ASC
         OFFSET $${offsetParam} LIMIT $${limitParam}`,
        params
    );

    return rows.map((u) => ({
        name: u.email,
        username: u.email.split('@')[0],
        email: u.email,
        full_name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email,
        roles: userRolesList(u.role),
        user_image: u.avatar_url,
    }));
}

async function getMember({ member } = {}) {
    if (!member) throw Object.assign(new Error('Member email/id is required'), { status: 400 });
    const rows = await db.query(
        `SELECT id, email, first_name, last_name, role, avatar_url, bio, headline
         FROM users
         WHERE lower(email) = lower($1) OR id::text = $1
         LIMIT 1`,
        [member]
    );
    const u = rows[0];
    if (!u) return null;
    return {
        name: u.email,
        username: u.email.split('@')[0],
        email: u.email,
        first_name: u.first_name,
        last_name: u.last_name,
        full_name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email,
        roles: userRolesList(u.role),
        user_image: u.avatar_url,
    };
}

async function saveRole({ user, role, value } = {}) {
    if (!user || !role) throw Object.assign(new Error('user and role are required'), { status: 400 });
    const rows = await db.query('SELECT id, email, role FROM users WHERE lower(email) = lower($1) OR id::text = $1 LIMIT 1', [user]);
    const u = rows[0];
    if (!u) throw Object.assign(new Error('User not found'), { status: 404 });

    let newRole = u.role;
    const v = Number(value);

    if (v === 1) {
        if (role === 'Moderator') newRole = 'admin';
        else if ((role === 'Course Creator' || role === 'Batch Evaluator') && newRole !== 'admin') newRole = 'instructor';
    } else {
        if (role === 'Moderator' && newRole === 'admin') newRole = 'instructor';
        else if ((role === 'Course Creator' || role === 'Batch Evaluator') && newRole === 'instructor') newRole = 'student';
    }

    if (newRole !== u.role) {
        await db.query('UPDATE users SET role = $1 WHERE id = $2', [newRole, u.id]);
    }
    return { ok: true, role: newRole };
}

async function deleteMember({ user } = {}) {
    if (!user) throw Object.assign(new Error('user is required'), { status: 400 });
    await db.query('DELETE FROM users WHERE lower(email) = lower($1) OR id::text = $1', [user]);
    return { ok: true };
}

async function saveEvaluationDetails({ submission_id, score, feedback, user } = {}) {
    if (!submission_id) throw Object.assign(new Error('submission_id is required'), { status: 400 });
    const u = await requireUser(user);
    if (u.role !== 'admin' && u.role !== 'instructor') {
        throw Object.assign(new Error('Permission denied: only evaluators can grade assignments'), { status: 403, exc_type: 'PermissionError' });
    }
    const res = await db.query(
        `UPDATE assignment_submissions
         SET score = $1, feedback = $2, status = 'Evaluated', evaluated_by = $3, evaluated_at = NOW()
         WHERE id::text = $4 RETURNING id, status, score, feedback`,
        [Number(score) || 0, feedback || '', u.id, submission_id]
    );
    if (!res[0]) throw Object.assign(new Error('Submission not found'), { status: 404 });
    return { ok: true, submission: { ...res[0], score: Number(res[0].score) } };
}

async function getOrderSummary({ course, coupon_code } = {}) {
    let basePrice = 49.00;
    let discountPercentage = 0;
    if (coupon_code) {
        const rows = await db.query('SELECT * FROM coupons WHERE upper(code) = upper($1) LIMIT 1', [coupon_code.trim()]);
        if (rows[0]) {
            discountPercentage = Number(rows[0].discount_percentage) || 0;
        }
    }
    const discountAmount = (basePrice * discountPercentage) / 100;
    const finalPrice = Math.max(0, basePrice - discountAmount);
    return {
        course: course || 'fractal-kernel-fundamentals',
        base_price: basePrice,
        discount_percentage: discountPercentage,
        discount_amount: discountAmount,
        final_price: finalPrice,
        currency: 'USD',
    };
}

async function getPaymentLink({ course, gateway = 'stripe' } = {}) {
    return {
        payment_url: `/checkout/pay?course=${encodeURIComponent(course || '')}&gateway=${gateway}&session_id=cs_test_${Date.now().toString(36)}`,
        gateway,
        status: 'ready',
    };
}

async function clientGetSingleValue({ doctype, field } = {}) {
    const lmsSettings = await getLmsSettings();
    return lmsSettings[field] ?? null;
}

async function createNotification({ for_user, from_user, subject, link, document_type, document_name }) {
    if (!for_user || !subject) return;
    try {
        await db.query(
            `INSERT INTO notifications (for_user, from_user, subject, link, document_type, document_name)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [for_user, from_user || null, subject, link || null, document_type || null, document_name || null]
        );
    } catch (e) {
        console.error('Failed to create notification:', e.message);
    }
}

async function getNotifications(sessionEmail) {
    if (!sessionEmail) return [];
    const rows = await db.query(
        `SELECT n.id::text AS name, n.subject, n.link, n.document_type, n.document_name,
                CASE WHEN n.read THEN 1 ELSE 0 END AS read,
                n.created_at::text AS creation,
                u.first_name, u.last_name, u.email AS from_email, u.avatar_url AS from_image
         FROM notifications n
         LEFT JOIN users u ON lower(u.email) = lower(n.from_user)
         WHERE lower(n.for_user) = lower($1)
         ORDER BY n.created_at DESC
         LIMIT 50`,
        [sessionEmail]
    );
    return rows.map((r) => ({
        name: r.name,
        subject: r.subject,
        link: r.link,
        document_type: r.document_type,
        document_name: r.document_name,
        read: r.read,
        creation: r.creation,
        from_user_details: {
            full_name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.from_email || 'College LMS',
            user_image: r.from_image || '',
            email: r.from_email || '',
        },
    }));
}

async function markNotificationAsRead(id) {
    if (!id) return { ok: false };
    await db.query('UPDATE notifications SET read = true WHERE id::text = $1', [id]);
    return { ok: true };
}

async function markAllNotificationsAsRead(sessionEmail) {
    if (!sessionEmail) return { ok: false };
    await db.query('UPDATE notifications SET read = true WHERE lower(for_user) = lower($1)', [sessionEmail]);
    return { ok: true };
}

async function createBatchLiveClass(params, sessionEmail) {
    const u = await requireUser(sessionEmail);
    if (u.role === 'student') {
        throw Object.assign(new Error('Only Course Creators can schedule live classes'), { status: 403, exc_type: 'PermissionError' });
    }
    const batchName = params.batch_name || params.batch;
    let batchId = null;
    if (batchName) {
        const b = await db.query('SELECT id FROM batches WHERE name=$1 OR id::text=$1 LIMIT 1', [batchName]);
        if (b[0]) batchId = b[0].id;
    }
    const title = params.title || 'Live Class';
    const date = params.date || new Date().toISOString().split('T')[0];
    const time = params.time || '10:00';
    const startTime = new Date(`${date}T${time}:00`);
    const duration = Number(params.duration) || 60;
    const platform = params.conferencing_provider || params.platform || 'Google Meet';
    let meetLink = params.join_url?.trim();
    if (!meetLink && batchName) {
        const bRow = await db.query('SELECT meet_link FROM batches WHERE name=$1 OR id::text=$1 LIMIT 1', [batchName]);
        if (bRow[0]?.meet_link) meetLink = bRow[0].meet_link;
    }
    if (!meetLink) {
        const letters = 'abcdefghijklmnopqrstuvwxyz';
        const pick = (len) => Array.from({ length: len }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
        const meetCode = `${pick(3)}-${pick(4)}-${pick(3)}`;
        meetLink = platform === 'Zoom' ? `https://zoom.us/j/${Math.floor(1000000000 + Math.random() * 9000000000)}` : `https://meet.google.com/${meetCode}`;
    }

    const ins = await db.query(
        `INSERT INTO live_classes (title, batch_id, host_id, start_time, duration_minutes, platform, meet_link)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [title, batchId, u.id, startTime, duration, platform, meetLink]
    );
    return {
        doctype: 'LMS Live Class',
        name: ins[0].id,
        id: ins[0].id,
        title,
        batch_name: batchName,
        date,
        time,
        duration,
        conferencing_provider: platform,
        join_url: meetLink,
        start_url: meetLink,
    };
}

async function importCourseFromPdf({ pdf_file_path, file_url, title, user } = {}) {
    const rawUrl = file_url || pdf_file_path || '';
    if (!rawUrl) throw Object.assign(new Error('PDF file URL or path is required'), { status: 400 });

    let courseTitle = (title || rawUrl.split('/').pop().replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')).trim();
    if (!courseTitle) courseTitle = 'Imported PDF Subject Course';

    const baseSlug = courseTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const courseName = `${baseSlug}-${Date.now().toString(36)}`;

    const cRows = await db.query(
        `INSERT INTO courses (title, name, description, published)
         VALUES ($1, $2, $3, true)
         RETURNING id, name, title`,
        [courseTitle, courseName, `Complete curriculum textbook for ${courseTitle}`]
    );
    const course = cRows[0];

    const chRows = await db.query(
        `INSERT INTO chapters (course_id, title, idx)
         VALUES ($1, $2, 1)
         RETURNING id`,
        [course.id, `${courseTitle} — Full Subject Reader`]
    );
    const chapter = chRows[0];

    await db.query(
        `INSERT INTO lessons (chapter_id, title, content_type, file, idx)
         VALUES ($1, $2, 'PDF', $3, 1)`,
        [chapter.id, `${courseTitle} (Complete Text)`, rawUrl]
    );

    return course.name;
}

async function recordPdfReadingProgress({ lesson_id, course_id, page_number, total_pages, user } = {}) {
    const u = await requireUser(user);
    if (!lesson_id || !page_number) throw Object.assign(new Error('lesson_id and page_number required'), { status: 400 });

    let lRows = await db.query('SELECT l.id, ch.course_id FROM lessons l JOIN chapters ch ON ch.id=l.chapter_id WHERE l.id::text=$1 OR l.title=$1 LIMIT 1', [lesson_id]);
    const realLessonId = lRows[0]?.id || lesson_id;
    const realCourseId = lRows[0]?.course_id || course_id;

    const cRows = await db.query('SELECT id, name, title FROM courses WHERE id::text=$1 OR name=$1 LIMIT 1', [realCourseId]);
    const actualCourseId = cRows[0]?.id || realCourseId;

    const existing = await db.query(
        'SELECT * FROM pdf_reading_progress WHERE member_id=$1 AND lesson_id=$2',
        [u.id, realLessonId]
    );

    let pagesSeen = new Set();
    if (existing[0]?.pages_seen) {
        existing[0].pages_seen.forEach(p => pagesSeen.add(Number(p)));
    }
    pagesSeen.add(Number(page_number));

    const totalPagesNum = Number(total_pages) || existing[0]?.total_pages || 1;
    const rawPct = Math.min(100, Math.round((pagesSeen.size / totalPagesNum) * 100));
    const isCompleted = rawPct >= 80;
    const progressPct = isCompleted ? 100 : rawPct;

    await db.query(
        `INSERT INTO pdf_reading_progress (member_id, lesson_id, course_id, pages_seen, total_pages, pct_complete, completed_at, last_opened_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (member_id, lesson_id)
         DO UPDATE SET pages_seen = $4, total_pages = $5, pct_complete = $6, completed_at = COALESCE(pdf_reading_progress.completed_at, $7), last_opened_at = NOW()`,
        [u.id, realLessonId, actualCourseId, Array.from(pagesSeen), totalPagesNum, progressPct, isCompleted ? new Date().toISOString() : null]
    );

    // Save incremental progress directly into enrollments table
    await db.query(
        `INSERT INTO enrollments (member_id, course_id, progress, status)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (member_id, course_id)
         DO UPDATE SET progress = GREATEST(enrollments.progress, $3), status = CASE WHEN $3 >= 80 THEN 'Completed' ELSE enrollments.status END`,
        [u.id, actualCourseId, progressPct, isCompleted ? 'Completed' : 'In Progress']
    );

    if (isCompleted) {
        await saveProgress({ lesson: realLessonId, course: actualCourseId, user });
    }

    return { pct_complete: progressPct, completed: isCompleted, pages_seen_count: pagesSeen.size, total_pages: totalPagesNum };
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
    getMembers, getMember, saveRole, deleteMember,
    saveEvaluationDetails, getOrderSummary, getPaymentLink, clientGetSingleValue,
    getNotifications, markNotificationAsRead, markAllNotificationsAsRead, createNotification,
    createBatchLiveClass,
    importCourseFromPdf, recordPdfReadingProgress,
};

