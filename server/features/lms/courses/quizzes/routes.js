const express = require('express');
const router = express.Router();
const service = require('./service');
const { requireAuth, optionalAuth } = require('../../../../middleware/auth');

// GET /api/v1/lms/courses/quizzes/:quizId — quiz with questions+options (answers hidden)
router.get('/:quizId', optionalAuth, async (req, res) => {
    try {
        res.json(await service.getQuiz(req.params.quizId));
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

// POST /api/v1/lms/courses/quizzes/:quizId/submit — grade + persist result
router.post('/:quizId/submit', requireAuth, async (req, res) => {
    try {
        res.status(201).json(await service.submitQuiz(req.user.sub, req.params.quizId, req.body));
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

// GET /api/v1/lms/courses/quizzes/:quizId/my-submissions
router.get('/:quizId/my-submissions', requireAuth, async (req, res) => {
    try {
        res.json(await service.mySubmissions(req.user.sub, req.params.quizId));
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

module.exports = router;
