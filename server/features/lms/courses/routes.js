const express = require('express');
const router = express.Router();
const service = require('./service');
const { requireAuth, optionalAuth, requireRole } = require('../../../middleware/auth');

// GET /api/v1/lms/courses?category=&search=&featured=1 — published catalog
router.get('/', optionalAuth, async (req, res) => {
    try {
        res.json(await service.listCourses(req.query));
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

// POST /api/v1/lms/courses — create course (instructor/admin)
router.post('/', requireAuth, requireRole('admin', 'instructor'), async (req, res) => {
    try {
        res.status(201).json(await service.createCourse(req.body, req.user));
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

// GET /api/v1/lms/courses/:id — full detail with chapter → lesson outline
router.get('/:id', optionalAuth, async (req, res) => {
    try {
        res.json(await service.getCourseDetail(req.params.id, req.user));
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

// GET /api/v1/lms/courses/:id/categories — convenience passthrough list of categories
router.get('/meta/categories', async (_req, res) => {
    try { res.json(await service.listCategories()); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/v1/lms/courses/:id/enroll — self-enroll
router.post('/:id/enroll', requireAuth, async (req, res) => {
    try {
        res.status(201).json(await service.enroll(req.user.sub, req.params.id));
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

// ── Mount grandchild cells ───────────────────────────────────────────
router.use('/quizzes', require('./quizzes/routes'));
router.use('/content', require('./content/routes'));

module.exports = router;
