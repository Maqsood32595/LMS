const express = require('express');
const router = express.Router();
const service = require('./service');
const { requireAuth } = require('../../../../middleware/auth');

// GET /api/v1/lms/users/students/me/dashboard — my courses + progress summary
router.get('/me/dashboard', requireAuth, async (req, res) => {
    try {
        res.json(await service.getDashboard(req.user.sub));
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

// GET /api/v1/lms/users/students/me/progress/:courseId — lesson-level progress map
router.get('/me/progress/:courseId', requireAuth, async (req, res) => {
    try {
        res.json(await service.getCourseProgress(req.user.sub, req.params.courseId));
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

// POST /api/v1/lms/users/students/me/progress  { lesson_id, course_id }
router.post('/me/progress', requireAuth, async (req, res) => {
    try {
        res.status(201).json(await service.markLessonComplete(req.user.sub, req.body));
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

// GET /api/v1/lms/users/students — admin listing of all students
router.get('/', requireAuth, async (req, res) => {
    try {
        res.json(await service.listStudents(req.user, req.query));
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

module.exports = router;
