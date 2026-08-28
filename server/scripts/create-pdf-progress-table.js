const { Client } = require('pg');
require('dotenv').config();

async function runMigration() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    console.log('📦 Running Migration: create pdf_reading_progress table...');

    await client.query(`
        CREATE TABLE IF NOT EXISTS pdf_reading_progress (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            member_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
            course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
            pages_seen INTEGER[] DEFAULT '{}',
            total_pages INTEGER DEFAULT 1,
            pct_complete INTEGER DEFAULT 0,
            completed_at TIMESTAMPTZ,
            last_opened_at TIMESTAMPTZ DEFAULT now(),
            UNIQUE (member_id, lesson_id)
        );
        CREATE INDEX IF NOT EXISTS idx_pdf_reading_member ON pdf_reading_progress(member_id);
        CREATE INDEX IF NOT EXISTS idx_pdf_reading_lesson ON pdf_reading_progress(lesson_id);
    `);

    console.log('✅ Migration complete: pdf_reading_progress table created successfully.');
    await client.end();
}

runMigration().catch(e => {
    console.error('❌ Migration failed:', e.message);
    process.exit(1);
});
