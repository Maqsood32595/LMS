require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const kernel = require('./kernel');

const app = express();
const PORT = process.env.PORT || 3000;

// ── HTTP Security Headers (OWASP A05) ──
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

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
    // 1-year immutable caching for Vite content-hashed assets
    app.use('/assets', express.static(path.join(spaDir, 'assets'), {
        maxAge: '1y',
        immutable: true,
    }));
    app.use(express.static(spaDir, { maxAge: '1h' }));
}

// ── Universal Authenticated GCS Media Proxy: /files/* and /api/v1/files/* ──
// Serves images (avatars, thumbnails, badges) with caching & streams videos with seek support
const gcs = require('./config/gcloud');

// In-RAM Signed URL Cache (90-minute TTL to prevent crypto re-signing on timeline seeking)
const signedUrlCache = new Map();
const SIGNED_URL_TTL = 90 * 60 * 1000; // 90 minutes

async function getCachedSignedUrl(objectPath) {
    const cached = signedUrlCache.get(objectPath);
    if (cached && Date.now() < cached.expires) {
        return cached.url;
    }
    const url = await gcs.signedUrl(objectPath, 7200); // 2-hour GCS v4 signed URL
    signedUrlCache.set(objectPath, { url, expires: Date.now() + SIGNED_URL_TTL });
    return url;
}

async function handleFileStream(req, res) {
    try {
        const rawPath = req.params[0] || req.path.replace(/^\/(?:api\/v1\/)?files\//, '');
        const cleanPath = decodeURIComponent(rawPath).replace(/\.\./g, '').replace(/^\/+/, '');
        if (!cleanPath) return res.status(400).json({ error: 'File path required' });

        const objectPath = gcs.scopedPath(cleanPath);

        // Videos & audio: issue v4 signed URL redirect with browser caching for smooth seeking
        const isVideo = /\.(mp4|webm|ogg|mov|m4v|mp3|wav)$/i.test(cleanPath);
        if (isVideo) {
            const url = await getCachedSignedUrl(objectPath);
            res.setHeader('Cache-Control', 'private, max-age=3600');
            return res.redirect(302, url);
        }

        // Images, PDFs, and static media: stream directly from GCS with caching
        const metadata = await gcs.getMetadata(objectPath).catch(() => null);
        if (!metadata) {
            return res.status(404).send('File not found in storage');
        }

        const contentType = metadata.contentType || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
        if (metadata.size) res.setHeader('Content-Length', metadata.size);
        if (metadata.etag) res.setHeader('ETag', metadata.etag);

        gcs.createReadStream(objectPath).on('error', (err) => {
            console.error('[file-stream]', err.message);
            if (!res.headersSent) res.status(500).send('Error streaming file');
        }).pipe(res);
    } catch (e) {
        console.error('[file-stream]', e.message);
        if (!res.headersSent) res.status(500).send('Storage error');
    }
}
app.get('/files/*', handleFileStream);
app.get('/api/v1/files/*', handleFileStream);

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
