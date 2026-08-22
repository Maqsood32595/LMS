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

// CORS — allow the SPA origins declared in .env (CORS_ORIGIN, comma separated)
const allowedOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

app.use(
    cors({
        origin(origin, cb) {
            if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
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
    app.use(express.static(spaDir));
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
    app.get(/^(?!\/api).*/, (req, res) => {
        const indexPath = path.join(spaDir, 'index.html');
        if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
        res.status(200).send('Fractal LMS API is running. Build the frontend (`npm run build`) to serve the SPA.');
    });

    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
        console.log(`Feature list:  http://localhost:${PORT}/api/features\n`);
    });
});
