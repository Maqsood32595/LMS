const express = require('express');
const router = express.Router();
const service = require('./service');
const { requireAuth } = require('../../middleware/auth');
const { authRateLimiter } = require('../../middleware/rateLimiter');

// POST /api/v1/auth/register  { email, password, first_name, last_name }
router.post('/register', authRateLimiter, async (req, res) => {
    try {
        const { user, token } = await service.register(req.body);
        res.status(201).json({ user, token });
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

// POST /api/v1/auth/login  { email, password } -> { token, user }
router.post('/login', authRateLimiter, async (req, res) => {
    try {
        const { user, token } = await service.login(req.body);
        res.json({ token, user });
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

// POST /api/v1/auth/logout — stateless JWT: client discards the token
router.post('/logout', (_req, res) => res.json({ ok: true }));

// GET /api/v1/auth/user — replaces frappe call `lms.lms.api.get_user_info`
router.get('/user', requireAuth, async (req, res) => {
    try {
        res.json(await service.getUserInfo(req.user.sub));
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

// GET /api/v1/auth/me — minimal profile
router.get('/me', requireAuth, async (req, res) => {
    try {
        res.json(await service.getMe(req.user.sub));
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

// PATCH /api/v1/auth/me — update profile fields
router.patch('/me', requireAuth, async (req, res) => {
    try {
        res.json(await service.updateProfile(req.user.sub, req.body));
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

// GET /api/v1/auth/health — DB connectivity probe
router.get('/health', async (_req, res) => {
    try {
        const now = await service.dbPing();
        res.json({ ok: true, db: 'up', now });
    } catch (e) {
        res.status(503).json({ ok: false, db: 'down', error: e.message });
    }
});

module.exports = router;
