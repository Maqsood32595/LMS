/**
 * seed-clean-batches.js
 * Purges all test/temporary batches from the DB and seeds 3 realistic
 * production cohort batches linked to the official 4 curriculum courses.
 *
 * Run locally with: node server/scripts/seed-clean-batches.js
 *
 * DB columns (actual): id, name, title, description, start_date, end_date,
 *                      seats, published, created_at
 */

require('dotenv').config();
const db = require('../config/supabase');

/* ─── 3 production cohort definitions ──────────────────────────────────── */
const COHORTS = [
    {
        name: 'python-backend-fall-2026',
        title: 'Python & Cloud Backend Mastermind — Fall 2026',
        description:
            'A 12-week live mentorship cohort covering CPython memory internals, async REST concurrency with FastAPI, database query optimisation with PostgreSQL, and weekly code reviews with industry engineers. ' +
            'Tue & Thu: 7:00 PM – 9:00 PM IST. ₹14,999.',
        course_slug: 'mastering-python-backend',
        start_date: '2026-09-01',
        end_date: '2026-11-30',
        seats: 30,
        published: true,
    },
    {
        name: 'vue3-cloud-architecture-2026',
        title: 'Full-Stack Vue 3 & Cloud Architecture Immersion',
        description:
            'An intensive frontend engineering cohort focusing on Composition API deep patterns, Pinia state architectures, Vite micro-frontend optimisation, and cloud-native deployment pipelines. ' +
            'Mon & Wed: 6:30 PM – 8:30 PM IST. ₹12,499.',
        course_slug: 'modern-vue3-vite-architecture',
        start_date: '2026-09-15',
        end_date: '2026-12-15',
        seats: 25,
        published: true,
    },
    {
        name: 'system-design-mastery-2026',
        title: 'Enterprise System Design & Distributed Systems Cohort',
        description:
            'An executive weekend mastermind on designing high-throughput distributed architectures, GCS signed streaming, CAP theorem trade-offs, multi-region disaster recovery, and SRE on-call practices. ' +
            'Sat & Sun: 10:00 AM – 1:00 PM IST. ₹19,999.',
        course_slug: 'system-design-cloud-native',
        start_date: '2026-10-01',
        end_date: '2026-12-31',
        seats: 20,
        published: true,
    },
];

async function run() {
    console.log('\n🧹 [Batches] Purging all test/temp batches...');

    // Delete every batch whose name looks like a generated test slug
    await db.query(`
        DELETE FROM batches
        WHERE name LIKE 'fractal-kernel-cohort-%'
           OR name LIKE '%-mt%'
           OR name = 'illegal-batch'
           OR title = 'Illegal Batch'
    `);

    // Nuke leftover temporary test users created by test suites
    await db.query(`
        DELETE FROM users
        WHERE email LIKE 'student-%@example.com'
    `);

    console.log('✅ Temporary test batches purged.\n');

    /* ─── Seed 3 production cohorts ──────────────────────────────────── */
    for (const cohort of COHORTS) {
        console.log(`📚 [Batches] Seeding: ${cohort.title}...`);

        // Remove existing row if it exists (idempotent re-run)
        await db.query('DELETE FROM batches WHERE name = $1', [cohort.name]);

        const batchResult = await db.query(
            `INSERT INTO batches (name, title, description, start_date, end_date, seats, published)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, name`,
            [
                cohort.name,
                cohort.title,
                cohort.description,
                cohort.start_date,
                cohort.end_date,
                cohort.seats,
                cohort.published,
            ]
        );

        const batchId = batchResult[0]?.id;
        console.log(`   ✔ Batch seeded: ${cohort.name} (id: ${batchId})`);
    }

    /* ─── Final verification ─────────────────────────────────────────── */
    const finalBatches = await db.query(
        `SELECT name, title, start_date, end_date, seats, published FROM batches ORDER BY start_date ASC`
    );
    console.log('\n=== PRODUCTION BATCHES IN DB ===');
    console.table(finalBatches.map(b => ({
        name: b.name,
        title: b.title.substring(0, 50) + (b.title.length > 50 ? '…' : ''),
        start: b.start_date?.toISOString?.()?.slice(0, 10) ?? b.start_date,
        end: b.end_date?.toISOString?.()?.slice(0, 10) ?? b.end_date,
        seats: b.seats,
        published: b.published,
    })));

    console.log('\n🎉 [Batches] All 3 production cohort batches successfully seeded!\n');
    process.exit(0);
}

run().catch((err) => {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
});
