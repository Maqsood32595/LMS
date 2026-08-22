/**
 * Google Cloud Storage client — scoped to an isolated prefix folder
 * (GCS_PREFIX, default "fractal-lms/") inside the shared bucket.
 *
 * Credentials resolution order:
 *   1. GOOGLE_CLOUD_KEY_FILE      → local service-account JSON path
 *   2. GCS_KEY_BASE64             → base64-encoded service-account JSON (Render/cloud)
 *   3. GOOGLE_APPLICATION_CREDENTIALS / metadata server (default ADC)
 */
const fs = require('fs');
const path = require('path');

let storage = null;
let bucket = null;

function resolveKeyFilename() {
    // 1. Explicit key file on disk
    if (process.env.GOOGLE_CLOUD_KEY_FILE && fs.existsSync(process.env.GOOGLE_CLOUD_KEY_FILE)) {
        return process.env.GOOGLE_CLOUD_KEY_FILE;
    }
    // 2. Base64 payload decoded into server/config/gcs-service-account.json
    if (process.env.GCS_KEY_BASE64) {
        try {
            const decoded = Buffer.from(process.env.GCS_KEY_BASE64, 'base64').toString('utf8');
            const outDir = path.join(__dirname, './gcs-service-account.json'); // gitignored
            fs.writeFileSync(outDir, decoded);
            return outDir;
        } catch (e) {
            console.warn('⚠️  [config/gcloud] Could not decode GCS_KEY_BASE64:', e.message);
        }
    }
    return undefined; // fall back to ADC
}

function getBucket() {
    if (bucket) return bucket;

    const bucketName = process.env.GOOGLE_CLOUD_BUCKET_NAME;
    if (!bucketName) {
        console.warn('⚠️  [config/gcloud] GOOGLE_CLOUD_BUCKET_NAME not set — storage disabled.');
        return null;
    }

    const { Storage } = require('@google-cloud/storage');
    const options = { projectId: process.env.GOOGLE_CLOUD_PROJECT_ID };
    const keyFilename = resolveKeyFilename();
    if (keyFilename) options.keyFilename = keyFilename;

    storage = new Storage(options);
    bucket = storage.bucket(bucketName);
    console.log(`☁️  [config/gcloud] Bucket "${bucketName}" ready (prefix: "${getPrefix()}").`);
    return bucket;
}

/** Every object this application touches lives under this isolated folder. */
function getPrefix() {
    return process.env.GCS_PREFIX || 'fractal-lms/';
}

/** Build a full object path inside the fractal-lms/ namespace. */
function scopedPath(...segments) {
    return getPrefix() + segments.filter(Boolean).join('/');
}

/** Upload a buffer → public-ish object; returns { objectPath, publicUrl }. */
async function uploadFile(buffer, { folder = 'uploads', filename, contentType }) {
    const b = getBucket();
    if (!b) throw new Error('Storage not configured');

    const safeName = `${Date.now()}-${(filename || 'file').replace(/[^\w.\-]+/g, '_')}`;
    const objectPath = scopedPath(folder, safeName);
    const file = b.file(objectPath);

    await file.save(buffer, {
        contentType: contentType || 'application/octet-stream',
        resumable: false,
        metadata: { cacheControl: 'private, max-age=3600' },
    });
    return { objectPath, publicUrl: publicUrlFor(objectPath) };
}

/** Public URL form (bucket may still be private — use signed URLs for playback). */
function publicUrlFor(objectPath) {
    const bucketName = process.env.GOOGLE_CLOUD_BUCKET_NAME;
    return `https://storage.googleapis.com/${bucketName}/${objectPath}`;
}

/** Short-lived signed URL for video/PDF streaming. */
async function signedUrl(objectPath, ttlSeconds = Number(process.env.SIGNED_URL_TTL_SECONDS) || 3600) {
    const b = getBucket();
    if (!b) throw new Error('Storage not configured');
    const [url] = await b.file(objectPath).getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + ttlSeconds * 1000,
    });
    return url;
}

module.exports = { getBucket, getPrefix, scopedPath, uploadFile, signedUrl, publicUrlFor };
