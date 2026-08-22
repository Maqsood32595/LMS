/**
 * Seeds demo content so the UI has something to render.
 * Idempotent â€” skips if demo course already exists.
 * Usage: node server/scripts/seed-demo.js
 */
require('dotenv').config();
const { getPool } = require('../config/supabase');

async function main() {
    const pool = getPool();

    const existing = await pool.query("SELECT id FROM courses WHERE name = 'fractal-kernel-fundamentals'");
    if (existing[0]) {
        console.log('â„¹ï¸  Demo course already present â€” skipping.');
        await pool.end();
        return;
    }

    const course = await pool.query(
        `INSERT INTO courses (name, title, short_introduction, description, category, published, featured)
         VALUES ('fractal-kernel-fundamentals', 'Fractal Kernel Fundamentals',
                 'Learn how manifest-driven grandchild cells power a modern LMS.',
                 'A demo course created by server/scripts/seed-demo.js.',
                 'Engineering', true, true)
         RETURNING id`
    );
    const courseId = course.rows[0].id;

    const chapter = await pool.query(
        `INSERT INTO chapters (course_id, title, idx) VALUES ($1, 'Getting Started', 0) RETURNING id`,
        [courseId]
    );

    await pool.query(
        `INSERT INTO lessons (chapter_id, title, body, content_type, youtube, include_in_preview, idx)
         VALUES ($1, 'Welcome to Fractal LMS',
                 '<p>This platform runs on the <b>Fractal Kernel</b>: parent cells own child and grandchild cells.</p>',
                 'Video', 'M7lc1UVf-VE', true, 0)`,
        [chapter.rows[0].id]
    );

    const quiz = await pool.query(
        `INSERT INTO quizzes (title, passing_percentage, total_marks, show_answers)
         VALUES ('Fractal Basics', 50, 2, true) RETURNING id`
    );
    const q1 = await pool.query(
        `INSERT INTO questions (quiz_id, question, type, marks, idx)
         VALUES ($1, 'Which component auto-discovers feature cells?', 'Choices', 2, 0) RETURNING id`,
        [quiz.rows[0].id]
    );
    await pool.query(
        `INSERT INTO question_options (question_id, option, is_correct)
         VALUES ($1, 'The Kernel', true), ($1, 'The Router', false), ($1, 'Vite', false)`,
        [q1.rows[0].id]
    );

    console.log(`âœ… Demo seeded: course=${courseId}`);
    await pool.end();
}

main().catch((e) => { console.error('âŒ Seed failed:', e.message); process.exit(1); });

