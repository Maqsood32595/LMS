const express = require('express');
const router = express.Router();
const service = require('./service');

// GET /api/method/lms.lms.api.get_pwa_manifest — PWA manifest (legacy path)
router.get('/lms.lms.api.get_pwa_manifest', (_req, res) => {
    res.json(service.getPwaManifest());
});

// Any other legacy frappe method → explicit 404 JSON (never the SPA HTML)
router.use((_req, res) => {
    res.status(404).json({
        error: 'Legacy frappe endpoint not implemented in Fractal Kernel',
        hint: 'See implementation.md → Legacy API → Fractal Endpoint Map',
    });
});

module.exports = router;
