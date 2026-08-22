/**
 * Auth cell boot script — runs once at kernel boot (manifest "boot" field).
 * Ensures the bootstrap admin exists (bcrypt-hashed ADMIN_PASSWORD).
 * Also verifies DB reachability early with a clear log line.
 */
const bcrypt = require('bcryptjs');
const db = require('../../config/supabase');

async function init() {
    try {
        const email = (process.env.ADMIN_EMAIL || 'admin@fractallms.app').toLowerCase();
        const password = process.env.ADMIN_PASSWORD || 'admin@123';
        const first = process.env.ADMIN_FIRST_NAME || 'Fractal';
        const last = process.env.ADMIN_LAST_NAME || 'Admin';

        const hash = await bcrypt.hash(password, 10);
        await db.query(
            `INSERT INTO users (email, password_hash, first_name, last_name, role)
             VALUES ($1, $2, $3, $4, 'admin')
             ON CONFLICT (email) DO UPDATE SET role = 'admin'`,
            [email, hash, first, last]
        );
        console.log(`👑 [auth] Bootstrap admin ready → ${email}`);
    } catch (e) {
        console.warn(`⚠️  [auth] Bootstrap admin skipped: ${e.message}`);
    }
}

module.exports = { init };
