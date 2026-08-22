const express = require('express');
const router = express.Router();
const service = require('./service');
const { requireAuth, optionalAuth } = require('../../../../middleware/auth');

// GET /api/v1/lms/courses/content/lesson/:lessonId — lesson body + resolved media
router.get('/lesson/:lessonId', optionalAuth, async (req, res) => {
    try {
        res.json(await service.getLesson(req.params.lessonId));
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

// GET /api/v1/lms/courses/content/stream/:objectPath(*) — signed GCS URL redirect
// objectPath must live under the fractal-lms/ prefix; the prefix itself is omitted.
router.get('/stream/*', async (req, res) => {
    try {
        const objectPath = req.params[0] || req.query.path;
        if (!objectPath) return res.status(400).json({ error: 'Missing object path' });
        const url = await service.getStreamUrl(objectPath);
        res.redirect(url);
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

// POST /api/v1/lms/courses/content/upload-request — returns a scoped upload target
router.post('/upload-request', requireAuth, async (req, res) => {
    try {
        res.json(await service.createUploadRequest(req.user, req.body));
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

module.exports = router;
