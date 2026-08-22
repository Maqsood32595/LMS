const express = require('express');
const router = express.Router();
const service = require('./service');
const { requireAuth, requireRole } = require('../../../middleware/auth');

// GET /api/v1/lms/users — directory (admin/instructor only)
router.get('/', requireAuth, requireRole('admin', 'instructor'), async (req, res) => {
    try {
        res.json(await service.listUsers(req.query));
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

// GET /api/v1/lms/users/:id — public profile
router.get('/:id', requireAuth, async (req, res) => {
    try {
        res.json(await service.getPublicProfile(req.params.id));
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

// ── Mount grandchild cell: students ─────────────────────────────────
router.use('/students', require('./students/routes'));

module.exports = router;
