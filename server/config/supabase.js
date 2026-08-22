/**
 * Supabase PostgreSQL client.
 *
 * The Supabase JS client talks to the REST/PostgREST API using SUPABASE_URL +
 * service key. For this conversion we instead connect straight to the
 * Postgres connection string via `pg`, because our schema uses plain SQL DDL
 * (database/supabase_schema.sql) and rich SQL joins.
 *
 * DATABASE_URL format:
 *   postgresql://user:password@host:5432/postgres   (password URL-encoded)
 */
const { Pool } = require('pg');

let pool = null;

function getPool() {
    if (pool) return pool;

    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL is not configured. Set it in .env (see .env.example).');
    }

    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }, // required by Supabase
        max: 10,
        idleTimeoutMillis: 30000,
    });

    pool.on('error', (err) => console.error('❌ [config/supabase] Pool error:', err.message));
    console.log('🐘 [config/supabase] PostgreSQL pool ready.');
    return pool;
}

/** Parameterized query helper. Returns rows array. */
async function query(sql, params = []) {
    const p = getPool();
    const res = await p.query(sql, params);
    return res.rows;
}

/** Health probe used by /api/v1/auth/health and readiness checks. */
async function ping() {
    const rows = await query('SELECT NOW() as now');
    return rows[0].now;
}

module.exports = { getPool, query, ping };
