/**
 * Applies database/supabase_schema.sql to Supabase.
 * Idempotent — safe to run repeatedly. Usage: node server/scripts/apply-schema.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getPool } = require('../config/supabase');

async function main() {
    const sqlPath = path.resolve(__dirname, '../../database/supabase_schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    const pool = getPool();
    console.log(`📄 Applying ${sqlPath} ...`);
    await pool.query(sql);
    const tables = await pool.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema='public' ORDER BY table_name`
    );
    console.log(`✅ Schema applied. Public tables (${tables.rows.length}):`);
    console.log('   ' + tables.rows.map((r) => r.table_name).join(', '));
    await pool.end();
}

main().catch((e) => {
    console.error('❌ Schema application failed:', e.message);
    process.exit(1);
});
