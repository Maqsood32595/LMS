require('dotenv').config();
const db = require('../config/supabase');

async function migrate() {
    console.log('Running discussions table migration...');
    await db.query(`
        CREATE TABLE IF NOT EXISTS discussions (
            id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            course_id  UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            lesson_id  UUID REFERENCES lessons(id) ON DELETE CASCADE,
            member_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title      TEXT,
            content    TEXT NOT NULL,
            parent_id  UUID REFERENCES discussions(id) ON DELETE CASCADE,
            pinned     BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_discussions_course ON discussions(course_id);
        CREATE INDEX IF NOT EXISTS idx_discussions_lesson ON discussions(lesson_id);
        CREATE INDEX IF NOT EXISTS idx_discussions_parent ON discussions(parent_id);
        CREATE INDEX IF NOT EXISTS idx_discussions_member ON discussions(member_id);
    `);
    console.log('✅ discussions table migration complete.');
    process.exit(0);
}

migrate().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});
