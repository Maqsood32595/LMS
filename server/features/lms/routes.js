/**
 * LMS PARENT CELL — /api/v1/lms
 *
 * Grandchild approach: the Kernel discovers only THIS feature (recursion stops
 * at its manifest). This file is responsible for mounting its own child and
 * grandchild cells, mirroring the folder hierarchy:
 *
 *   /api/v1/lms                     ← this router (dashboard stats)
 *   ├── /api/v1/lms/users           ← child cell
 *   │     └── /students             ← grandchild cell
 *   ├── /api/v1/lms/courses         ← child cell
 *   │     ├── /quizzes              ← grandchild cell
 *   │     └── /content              ← grandchild cell
 *   └── /api/v1/lms/live            ← child cell
 */
const express = require('express');
const router = express.Router();
const service = require('./service');

// GET /api/v1/lms/stats — platform counters for dashboards
router.get('/stats', async (_req, res) => {
    try {
        res.json(await service.getStats());
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

// ── Mount child cells ────────────────────────────────────────────────
router.use('/users', require('./users/routes'));
router.use('/courses', require('./courses/routes'));
router.use('/live', require('./live/routes'));

module.exports = router;
