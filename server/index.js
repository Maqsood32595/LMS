require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const kernel = require('./kernel');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS — same-origin is always fine; allow configured origins + localhost + onrender.com domains
const allowedOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const RENDER_RE = /^https?:\/\/[a-zA-Z0-9-]+\.onrender\.com$/i;

app.use(
    cors({
        origin(origin, cb) {
            // No Origin header (same-origin navigation) or localhost or Render URL or allowedOrigins
            if (!origin || LOCALHOST_RE.test(origin) || RENDER_RE.test(origin) || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
                return cb(null, true);
            }
            cb(new Error('Not allowed by CORS'));
        },
        credentials: true,
    })
);

// Static SPA — serve the built Frappe LMS frontend in production
const spaDir = path.resolve(__dirname, '../frontend/dist');
if (fs.existsSync(spaDir)) {
    app.use(express.static(spaDir, { maxAge: '1h' }));
}

// ── Boot the Kernel — discovers and mounts all features automatically ──
kernel.boot(app, './features').then(() => {

    // Built-in: expose feature list for Admin UI or debugging
    app.get('/api/features', (req, res) => {
        const features = kernel.getAllFeatures().map((f) => ({
            id: f.id,
            name: f.name,
            description: f.description || '',
            basePath: f.basePath,
            enabled: f.enabled !== false,
            loaded: f.loaded,
            version: f.version || '1.0.0'
        }));
        res.json({ count: features.length, features });
    });

    // SPA fallback — any non-API GET serves index.html (client-side routing)
    // Never serve index.html for static assets or files with extensions to prevent MIME type errors
    app.get(/^(?!\/api).*/, (req, res) => {
        if (req.path.startsWith('/assets/') || /\.[a-zA-Z0-9]+$/.test(req.path)) {
            return res.status(404).send('Asset not found');
        }
        const indexPath = path.join(spaDir, 'index.html');
        if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
        res.status(200).send('Fractal LMS API is running. Build the frontend (`npm run build`) to serve the SPA.');
    });

    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
        console.log(`Feature list:  http://localhost:${PORT}/api/features\n`);
    });
});
