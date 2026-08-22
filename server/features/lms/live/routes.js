const express = require('express');
const router = express.Router();
const service = require('./service');
const { requireAuth, optionalAuth, requireRole } = require('../../../middleware/auth');

// GET /api/v1/lms/live/classes?course_id=&batch_id=
router.get('/classes', optionalAuth, async (req, res) => {
    try {
        res.json(await service.listClasses(req.query));
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

// POST /api/v1/lms/live/classes — schedule a live class
router.post('/classes', requireAuth, requireRole('admin', 'instructor'), async (req, res) => {
    try {
        res.status(201).json(await service.createClass(req.body, req.user));
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

// GET /api/v1/lms/live/classes/:id/join — enrolled members get the join link
router.get('/classes/:id/join', requireAuth, async (req, res) => {
    try {
        res.json(await service.joinClass(req.params.id, req.user));
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

module.exports = router;
