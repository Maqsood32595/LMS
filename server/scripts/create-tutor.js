require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

(async () => {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    const hash = await bcrypt.hash('admin', 10);
    const emails = ['testtutor@fractallms.app', 'testtutor@test.com', 'testtutor'];

    for (const email of emails) {
        await pool.query(
            `INSERT INTO users (email, password_hash, first_name, last_name, role)
             VALUES ($1, $2, 'Test', 'Tutor', 'instructor')
             ON CONFLICT (email) DO UPDATE SET password_hash = $2, role = 'instructor'`,
            [email, hash]
        );
    }

    console.log('Tutor user created successfully: username/email="testtutor" or "testtutor@fractallms.app" with password="admin"');
    await pool.end();
})();
