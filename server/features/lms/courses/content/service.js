const db = require('../../../../config/supabase');
const gcloud = require('../../../../config/gcloud');

// Lesson detail; resolves GCS object → short-lived signed URL for media
async function getLesson(lessonId) {
    const rows = await db.query(
        `SELECT l.*, ch.course_id, ch.title AS chapter_title
         FROM lessons l JOIN chapters ch ON ch.id = l.chapter_id
         WHERE l.id::text = $1 LIMIT 1`, [lessonId]
    );
    const lesson = rows[0];
    if (!lesson) throw Object.assign(new Error('Lesson not found'), { status: 404 });

    if (lesson.quiz_id) {
        lesson.quiz_ref = `/api/v1/lms/courses/quizzes/${lesson.quiz_id}`;
    }

    // If file is stored in GCS under fractal-lms/, mint a signed URL
    if (lesson.file && lesson.file.includes('/')) {
        try {
            lesson.signed_url = await gcloud.signedUrl(lesson.file);
        } catch (_e) {
            lesson.signed_url = null; // fall back to raw path (external URL)
        }
    }
    return lesson;
}

// Signed streaming URL — enforces the fractal-lms/ namespace
async function getStreamUrl(objectPath) {
    const scoped = gcloud.scopedPath(String(objectPath).replace(/^\/+/, '').replace(/\.\./g, ''));
    return gcloud.signedUrl(scoped);
}

// Returns the target path a client uploads to (direct-to-GCS or via signed PUT)
async function createUploadRequest(user, { filename, folder = 'uploads' }) {
    if (!['admin', 'instructor'].includes(user.role || '')) {
        throw Object.assign(new Error('Only instructors may upload content'), { status: 403 });
    }
    if (!filename) throw Object.assign(new Error('filename is required'), { status: 400 });
    const safeName = `${Date.now()}-${String(filename).replace(/[^\w.\-]+/g, '_')}`;
    const objectPath = gcloud.scopedPath(folder, safeName);
    return {
        bucket: process.env.GOOGLE_CLOUD_BUCKET_NAME,
        object_path: objectPath,
        stream_via: `/api/v1/lms/courses/content/stream/${objectPath.replace(gcloud.getPrefix(), '')}`,
    };
}

module.exports = { getLesson, getStreamUrl, createUploadRequest };
