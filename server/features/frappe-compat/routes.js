const express = require('express');
const router = express.Router();
const service = require('./service');

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

router.all('/lms.lms.api.get_user_info', read((req) => service.getUserInfo(req.fractalUser)));
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
router.all('/lms.lms.api.get_my_batches', read(() => []));
router.all('/lms.lms.api.get_created_batches', read(() => []));
router.all('/lms.lms.api.get_my_live_classes', read((req) => service.upcomingLiveClasses()));
router.all('/lms.lms.api.get_admin_live_classes', read((req) => service.upcomingLiveClasses()));
router.all('/lms.lms.api.get_admin_evals', read(() => []));
router.all('/lms.lms.api.get_streak_info', read((req) => service.streakInfo(req.fractalUser)));
router.all('/lms.lms.api.search_users_by_role', read((req) => service.searchUsersByRole(req.body?.roles)));

// frappe.client.* — the generic client API used by the preserved UI
router.all('/frappe.client.get_count', read((req) => service.getCount(req.query || req.body || {})));
router.post('/frappe.client.insert', async (req, res) => {
    try {
        const doc = await service.insertDoc(req.body?.doc || {}, req.fractalUser);
        res.json({ message: doc });
    } catch (e) {
        res.status(e.status || 500).json({ exc_type: e.exc_type || 'ServerError', messages: [e.message] });
    }
});


// ── PWA manifest (kept from earlier iteration) ───────────────────────────
router.get('/lms.lms.api.get_pwa_manifest', (_req, res) => res.json(service.getPwaManifest()));

// Any other legacy method → explicit 404 JSON (never the SPA HTML)
router.use((_req, res) => {
    res.status(404).json({
        error: 'Legacy frappe endpoint not implemented in Fractal Kernel',
        hint: 'See implementation.md → Legacy API → Fractal Endpoint Map',
    });
});

module.exports = router;

