const express = require('express');
const router = express.Router();
const multer = require('multer');
const service = require('./service');
const gcs = require('../../config/gcloud');

// Multer: store file in memory (we stream directly to GCS) — 500MB limit for high-res images & video
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });


function parseCookies(header = '') {
    const out = {};
    header.split(';').forEach((pair) => {
        const idx = pair.indexOf('=');
        if (idx > -1) out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
    });
    return out;
}

// Attach req.fractalUser from the user_id cookie (set by /api/method/login)
function attachUser(req, _res, next) {
    const cookies = parseCookies(req.headers.cookie);
    req.fractalUser = cookies.user_id && cookies.user_id !== 'Guest' ? cookies.user_id : null;
    next();
}
router.use(attachUser);

// ── Session ──────────────────────────────────────────────────────────────
// POST /api/method/login  { usr, pwd }  (also accepts lms.lms.api.login)
function loginHandler(req, res) {
    const usr = req.body?.usr || req.body?.email;
    const pwd = req.body?.pwd || req.body?.password;
    service.login(usr, pwd)
        .then(({ email, full_name }) => {
            res.setHeader('Set-Cookie', `user_id=${encodeURIComponent(email)}; Path=/; Max-Age=604800; SameSite=Lax`);
            res.json({ message: 'Logged In', home_page: '/courses', full_name });
        })
        .catch((e) => res.status(e.status || 401).json({ exc_type: 'AuthenticationError', error: e.message }));
}
router.post('/login', loginHandler);
router.post('/lms.lms.api.login', loginHandler);

// POST /api/method/logout
router.all('/logout', (req, res) => {
    res.setHeader('Set-Cookie', 'user_id=; Path=/; Max-Age=0');
    res.json({ message: 'ok' });
});

// ── Boot-chain reads (the preserved UI calls these on every load) ────────
const read = (fn) => (req, res) => {
    Promise.resolve(fn(req))
        .then((data) => res.json({ message: data }))
        .catch((e) => res.status(e.status || 500).json({ exc_type: e.exc_type || 'ServerError', error: e.message }));
};

const readQ = (fn) => (req, res) => {
    const payload = { ...req.query, ...(req.body || {}) };
    if (!payload.user && req.fractalUser) payload.user = req.fractalUser;
    payload.sessionUser = req.fractalUser;
    Promise.resolve(fn(payload))
        .then((data) => res.json({ message: data }))
        .catch((e) => res.status(e.status || 500).json({ exc_type: e.exc_type || 'ServerError', messages: [e.message] }));
};

router.all('/lms.lms.api.get_user_info', read((req) => service.getUserInfo(req.fractalUser)));
router.all('/lms.lms.api.get_profile_details', readQ((a) => service.getProfileDetails(a)));
router.all('/lms.lms.api.get_lms_settings', read(() => service.getLmsSettings()));
router.all('/lms.lms.api.get_branding', read(() => service.getBranding()));
router.all('/lms.lms.api.get_sidebar_settings', read((req) => service.getSidebarSettings(req.fractalUser)));
router.all('/lms.lms.api.get_translations', read(() => ({})));
router.all('/frappe.apps.get_apps', read(() => []));
router.all('/lms.lms.utils.get_programs', read(() => []));
router.all('/lms.lms.api.get_all_users', read((req) => service.getAllUsers()));

// ── Role journeys (Student home · Tutor home · enroll · create course) ──
router.all('/lms.lms.api.get_my_courses', read((req) => service.myCourses(req.fractalUser)));
router.all('/lms.lms.api.get_created_courses', read((req) => service.createdCourses(req.fractalUser)));
router.all('/lms.lms.api.get_my_batches', read((req) => service.myBatches(req.fractalUser)));
router.all('/lms.lms.api.get_created_batches', read((req) => service.createdBatches(req.fractalUser)));
router.all('/lms.lms.api.get_my_live_classes', read((req) => service.upcomingLiveClasses()));
router.all('/lms.lms.api.get_admin_live_classes', read((req) => service.upcomingLiveClasses()));
router.all('/lms.lms.api.get_admin_evals', read(() => []));
router.all('/lms.lms.api.get_streak_info', read((req) => service.streakInfo(req.fractalUser)));
router.all('/lms.lms.api.search_users_by_role', read((req) => service.searchUsersByRole(req.body?.roles)));

// frappe.client.* — the generic client API used by the preserved UI
router.all('/frappe.client.get_count', readQ((a) => service.getCount(a)));
router.post('/frappe.client.insert', async (req, res) => {
    try {
        const doc = await service.insertDoc(req.body?.doc || {}, req.fractalUser);
        res.json({ message: doc });
    } catch (e) {
        res.status(e.status || 500).json({ exc_type: e.exc_type || 'ServerError', messages: [e.message] });
    }
});

// ── Core journeys: catalog · detail · lesson · quiz · batches · discussions
router.all('/lms.lms.utils.get_courses', readQ((a) => service.getCourses(a)));
router.all('/lms.lms.utils.get_course_count', readQ((a) => service.getCourseCount(a)));
router.all('/lms.lms.utils.get_course_categories', readQ(() => service.getCourseCategories()));
router.all('/lms.lms.utils.get_course_details', readQ((a) => service.getCourseDetails(a)));
router.all('/lms.lms.utils.get_course_outline', readQ((a) => service.getCourseOutline(a)));
router.all('/lms.lms.utils.get_related_courses', readQ((a) => service.getRelatedCourses(a)));
router.all('/lms.lms.utils.get_lesson', readQ((a) => service.getLesson(a)));
router.all('/lms.lms.doctype.course_lesson.course_lesson.save_progress', readQ((a) => service.saveProgress(a)));
router.all('/lms.lms.utils.get_quiz_with_questions', readQ((a) => service.getQuizWithQuestions(a)));
router.all('/lms.lms.doctype.lms_quiz.lms_quiz.submit_quiz', readQ((a) => service.submitQuizLegacy(a)));
router.all('/lms.lms.doctype.lms_quiz.lms_quiz.check_answer', readQ((a) => service.checkAnswer(a)));
router.all('/lms.lms.utils.get_discussion_topics', readQ((a) => service.getDiscussionTopics(a)));
router.all('/lms.lms.utils.get_discussion_replies', readQ((a) => service.getDiscussionReplies(a)));
router.all('/lms.lms.utils.get_batches', readQ((a) => service.getBatches(a)));
router.all('/lms.lms.utils.get_batch_count', readQ((a) => service.getBatchCount(a)));
router.all('/lms.lms.utils.get_batch_details', readQ((a) => service.getBatchDetails(a)));
router.all('/lms.lms.utils.enroll_in_batch', readQ((a) => service.enrollInBatch(a)));
router.all('/lms.lms.api.get_certification_details', readQ((a) => service.getCertificationDetails(a)));
router.all('/lms.lms.api.get_certified_participants', readQ((a) => service.getCertifiedParticipants(a)));
router.all('/lms.lms.api.get_count_of_certified_members', readQ((a) => service.getCountOfCertifiedMembers(a)));
router.all('/lms.lms.utils.get_reviews', readQ((a) => service.getReviews(a)));
router.all('/lms.lms.api.get_notifications', read((req) => service.getNotifications(req.fractalUser)));
router.all('/frappe.desk.doctype.notification_log.notification_log.mark_as_read', readQ((a) => service.markNotificationAsRead(a?.docname || a?.name)));
router.all('/frappe.desk.doctype.notification_log.notification_log.mark_all_as_read', read((req) => service.markAllNotificationsAsRead(req.fractalUser)));
router.all('/lms.lms.api.delete_documents', readQ((a) => service.deleteDocuments(a)));
router.all('/lms.lms.api.get_members', readQ((a) => service.getMembers(a)));
router.all('/lms.lms.api.get_member', readQ((a) => service.getMember(a)));
router.all('/lms.lms.api.save_role', readQ((a) => service.saveRole(a)));
router.all('/lms.lms.api.delete_member', readQ((a) => service.deleteMember(a)));
router.all('/lms.lms.api.save_evaluation_details', readQ((a) => service.saveEvaluationDetails(a)));
router.all('/lms.lms.utils.get_order_summary', readQ((a) => service.getOrderSummary(a)));
router.all('/lms.lms.payments.get_payment_link', readQ((a) => service.getPaymentLink(a)));

// frappe.client generic reads/writes used across pages
router.all('/frappe.client.get_list', readQ((a) => service.clientGetList(a)));
router.all('/frappe.client.get_value', readQ((a) => service.clientGetValue(a)));
router.all('/frappe.client.get', readQ((a) => service.clientGet(a)));
router.all('/frappe.client.set_value', readQ((a) => service.clientSetValue(a)));
router.all('/frappe.client.rename_doc', readQ((a) => ({ name: a?.new_name || a?.rename_to || '' })));



// ── Tutor authoring ──────────────────────────────────────────────────────
router.all('/lms.lms.api.upsert_chapter', readQ((a) => service.upsertChapter(a)));
router.all('/lms.lms.api.create_lesson', readQ((a) => service.createLesson(a)));
router.all('/lms.lms.api.update_lesson_index', readQ((a) => service.reindex('lessons', a?.lesson, a?.idx, a?.user)));
router.all('/lms.lms.api.update_chapter_index', readQ((a) => service.reindex('chapters', a?.chapter, a?.idx, a?.user)));
router.all('/lms.lms.api.delete_lesson', readQ((a) => service.delRow('lessons', a?.lesson, a?.user)));
router.all('/lms.lms.api.delete_chapter', readQ((a) => service.delRow('chapters', a?.chapter, a?.user)));
router.all('/lms.lms.api.delete_course', readQ((a) => service.delCourse(a?.course, a?.user)));

// ── POST /api/method/upload_file  ───────────────────────────────────────
// frappe-ui FileUploader posts multipart/form-data here for all file/image
// uploads (profile photo, cover image, course image, lesson attachments, …).
//
// Files are routed to doctype-aware GCS paths so each entity's uploads are
// namespaced cleanly:
//
//   User / user_image  → fractal-lms/users/<username>/avatar/
//   User / cover_image → fractal-lms/users/<username>/cover/
//   LMS Course / image → fractal-lms/courses/<course>/image/
//   Course Lesson      → fractal-lms/content/lessons/<lesson>/
//   LMS Batch          → fractal-lms/batches/<batch>/files/
//   anything else      → fractal-lms/attachments/<doctype>/<docname>/
//
// Returns Frappe-standard { message: { file_url, file_name, file_size, is_private } }.
router.post('/upload_file', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ exc_type: 'ValidationError', message: 'No file provided' });
        }

        const doctype   = req.body?.doctype   || '';
        const docname   = req.body?.docname   || '';
        const fieldname = req.body?.fieldname || '';
        const isPrivate = req.body?.is_private === '1';

        // Sanitise a string into a safe GCS path segment
        const slug = (s) => (s || '').toLowerCase().replace(/[^a-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'misc';

        // ── Route to the correct GCS sub-folder ────────────────────────────
        let gcsFolder;
        if (doctype === 'User') {
            const userSlug = slug(docname || req.fractalUser || 'unknown');
            if (fieldname === 'user_image' || fieldname === 'image') {
                gcsFolder = `users/${userSlug}/avatar`;
            } else if (fieldname === 'cover_image') {
                gcsFolder = `users/${userSlug}/cover`;
            } else {
                gcsFolder = `users/${userSlug}/files`;
            }
        } else if (doctype === 'LMS Course' || doctype === 'Course') {
            gcsFolder = `courses/${slug(docname)}/image`;
        } else if (doctype === 'Course Lesson' || doctype === 'LMS Lesson') {
            gcsFolder = `content/lessons/${slug(docname)}`;
        } else if (doctype === 'LMS Batch') {
            gcsFolder = `batches/${slug(docname)}/files`;
        } else if (doctype) {
            gcsFolder = `attachments/${slug(doctype)}/${slug(docname)}`;
        } else {
            gcsFolder = 'uploads/misc';
        }

        const { publicUrl } = await gcs.uploadFile(req.file.buffer, {
            folder: gcsFolder,
            filename: req.file.originalname,
            contentType: req.file.mimetype,
        });

        // Auto-persist the URL to the right DB column when we know the User
        if (doctype === 'User' && (docname || req.fractalUser)) {
            const email  = req.fractalUser || docname;
            const colMap = {
                user_image:  'avatar_url',
                image:       'avatar_url',
                cover_image: 'cover_image_url',
            };
            const col = colMap[fieldname];
            if (col) await service.updateUserField(email, col, publicUrl);
        }

        res.json({
            message: {
                file_url:   publicUrl,
                file_name:  req.file.originalname,
                file_size:  req.file.size,
                is_private: isPrivate ? 1 : 0,
            },
        });
    } catch (e) {
        console.error('[upload_file]', e.message);
        res.status(500).json({ exc_type: 'ServerError', message: e.message });
    }
});

// ── Long-tail stubs: remaining calls answer 200 with safe payloads ───────
const STUBS = {
    // Session operations — we are stateless JWT; just acknowledge and let
    // the client reload its own user resource.
    'frappe.sessions.clear': { message: 'ok' },
    'frappe.sessions.get_boot_info': {},
    'frappe.onboarding.get_onboarding_status': { steps: [] },
    'lms.lms.api.get_meta_info': [],
    'lms.lms.api.update_meta_info': { ok: true },
    'lms.lms.api.get_announcements': [],
    'lms.lms.api.track_video_watch_duration': { ok: true },
    'lms.lms.api.get_badges': [],
    'lms.lms.api.get_certification_categories': [],
    'lms.lms.api.get_chart_details': {},
    'lms.lms.api.get_course_assessment_progress': 0,
    'lms.lms.api.get_course_progress_distribution': [],
    'lms.lms.api.get_lesson_completion_stats': [],
    'lms.lms.api.get_application_users': [],
    'lms.lms.api.get_job_details': null,
    'lms.lms.api.get_job_opportunities': [],
    'lms.lms.api.get_job_opportunities_count': 0,
    'lms.lms.api.get_new_gateway_fields': [],
    'lms.lms.api.get_payment_field_meta': [],
    'lms.lms.api.get_payment_gateway_details': {},
    'lms.lms.api.get_unsplash_photos': [],
    'lms.lms.api.validate_billing_access': true,
    'lms.lms.utils.get_batch_courses': [],
    'lms.lms.utils.get_batch_chart_data': {},
    'lms.lms.utils.get_batch_student_progress': [],
    'lms.lms.utils.get_assessments': [],
    'lms.lms.utils.get_chart_data': {},
    'lms.lms.utils.get_course_completion_data': {},
    'lms.lms.utils.get_lesson_creation_details': {},
    'lms.lms.utils.get_program_details': null,
    'lms.lms.utils.get_roles': [],
    'gameplan.api.get_unsplash_photos': [],
    'lms.command_palette.search_sqlite': [],
    'lms.raven_provider.get_raven_setup': null,
    'raven_integration.api.compute_rule_diff': null,
    'raven_integration.api.list_providers': [],
    'frappe.geo.country_info.get_country_timezone_info': {},
    'frappe.utils.telemetry.pulse.client.boot_config': {},
    'frappe.core.doctype.communication.email.make': null,
    'frappe.desk.doctype.notification_log.notification_log.mark_as_read': null,
    'frappe.desk.doctype.notification_log.notification_log.mark_all_as_read': null,
    'frappe.desk.search.search_link': [],
    'lms.lms.api.add_evaluator_slot': null,
    'lms.lms.api.delete_evaluator_slot': null,
    'lms.lms.api.update_evaluator_slot': null,
    'lms.lms.api.ensure_evaluator_calendar': null,
    'lms.lms.api.set_evaluator_unavailability': null,
    'lms.lms.api.save_certificate_details': null,
    'lms.lms.api.update_sidebar_item': null,
    'lms.lms.api.get_evaluator_details': null,
    'lms.lms.email_account.create_email_account': null,
    'lms.lms.doctype.lms_batch.lms_batch.create_live_class': null,
    'lms.lms.doctype.lms_batch.lms_batch.create_google_meet_live_class': null,
    'lms.lms.doctype.lms_certificate.lms_certificate.create_certificate': null,
    'lms.lms.utils.enroll_in_batch': null,
    'lms.lms.utils.enroll_in_program': null,
};
for (const [name, payload] of Object.entries(STUBS)) {
    router.all('/' + name, (_req, res) => res.json({ message: payload }));
}

router.get('/lms.lms.api.get_pwa_manifest', (_req, res) => res.json(service.getPwaManifest()));

// Any other legacy method → explicit 404 JSON (never the SPA HTML)
router.use((_req, res) => {
    res.status(404).json({
        error: 'Legacy frappe endpoint not implemented in Fractal Kernel',
        hint: 'See implementation.md → Legacy API → Fractal Endpoint Map',
    });
});

module.exports = router;

