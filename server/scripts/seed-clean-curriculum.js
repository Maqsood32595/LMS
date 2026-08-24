/**
 * Seeds the 4 high-quality production courses and interactive quizzes,
 * while purging all temporary and legacy test courses from the database.
 *
 * Courses:
 *   1. System Design & Cloud-Native Architecture (system-design-cloud-native)
 *   2. Full-Stack Vue 3 & Vite Architecture (modern-vue3-vite-architecture)
 *   3. Mastering Python & Backend Engineering (mastering-python-backend)
 *   4. Fractal Kernel Fundamentals (fractal-kernel-fundamentals)
 *
 * Usage: node server/scripts/seed-clean-curriculum.js
 */
require('dotenv').config();
const { getPool } = require('../config/supabase');

async function main() {
    const pool = getPool();

    console.log('🧹 [Curriculum] Purging all test courses from database...');
    // Delete any course that is NOT one of our 4 official production courses
    await pool.query(`
        DELETE FROM courses 
        WHERE name NOT IN (
            'system-design-cloud-native',
            'modern-vue3-vite-architecture',
            'mastering-python-backend',
            'fractal-kernel-fundamentals'
        )
    `);
    console.log('✅ Temporary test courses purged.');

    // Delete existing quizzes to recreate clean single versions with fresh questions
    await pool.query('DELETE FROM quizzes');

    // ── 0. Baseline Course: Fractal Kernel Fundamentals ───────────────────
    console.log('📚 [Curriculum] Seeding: Fractal Kernel Fundamentals...');
    const fractalRes = await pool.query(`
        INSERT INTO courses (name, title, short_introduction, description, category, published, featured, enable_certification, image)
        VALUES (
            'fractal-kernel-fundamentals',
            'Fractal Kernel Fundamentals',
            'Learn how manifest-driven grandchild cells and decoupled micro-kernels power modern learning management.',
            'An architectural deep dive into the Fractal LMS micro-kernel, auto-discovering feature cells, and resilient zero-mock testing paradigms.',
            'Engineering',
            true,
            true,
            false,
            'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80'
        )
        ON CONFLICT (name) DO UPDATE SET 
            title = EXCLUDED.title,
            short_introduction = EXCLUDED.short_introduction,
            description = EXCLUDED.description,
            category = EXCLUDED.category,
            published = true,
            featured = true,
            image = EXCLUDED.image
        RETURNING id;
    `);
    const fractalId = fractalRes.rows[0].id;

    // Quiz: Fractal Basics
    const fractalQuizId = (await pool.query(`
        INSERT INTO quizzes (title, passing_percentage, total_marks, duration_minutes, show_answers)
        VALUES ('Fractal Basics', 50, 2, 10, true) RETURNING id
    `)).rows[0].id;
    const fq1 = (await pool.query(`
        INSERT INTO questions (quiz_id, question, type, marks, idx)
        VALUES ($1, 'Which component auto-discovers feature cells and routes?', 'Choices', 2, 0) RETURNING id
    `, [fractalQuizId])).rows[0].id;
    await pool.query(`
        INSERT INTO question_options (question_id, option, is_correct)
        VALUES ($1, 'The Fractal Kernel', true), ($1, 'Vite Bundler', false), ($1, 'Redis Cache', false)
    `, [fq1]);

    // Chapters & Lessons for Fractal Kernel
    await pool.query('DELETE FROM chapters WHERE course_id = $1', [fractalId]);
    const fractalCh = (await pool.query(`
        INSERT INTO chapters (course_id, title, idx) VALUES ($1, 'Chapter 1: Micro-Kernel Architecture', 0) RETURNING id
    `, [fractalId])).rows[0].id;

    await pool.query(`
        INSERT INTO lessons (chapter_id, title, body, content_type, include_in_preview, idx, duration)
        VALUES ($1, '1.1 Introduction to Fractal Architecture', '<p>The Fractal Kernel discovers grandchild feature cells through structured manifests, ensuring zero hard dependencies between services.</p>', 'Text', true, 0, '10 mins')
    `, [fractalCh]);

    await pool.query(`
        INSERT INTO lessons (chapter_id, title, body, content_type, include_in_preview, idx, quiz_id, duration)
        VALUES ($1, '1.2 Checkpoint Quiz: Kernel Concepts', '<p>Test your understanding of the Fractal Micro-Kernel architecture.</p>', 'Quiz', true, 1, $2, '10 mins')
    `, [fractalCh, fractalQuizId]);


    // ── 1. Mastering Python & Backend Engineering ─────────────────────────
    console.log('📚 [Curriculum] Seeding: Mastering Python & Backend Engineering...');
    const pythonRes = await pool.query(`
        INSERT INTO courses (name, title, short_introduction, description, category, published, featured, image, enable_certification)
        VALUES (
            'mastering-python-backend',
            'Mastering Python & Backend Engineering',
            'From core Python internals to high-throughput asynchronous REST APIs and database optimization.',
            'A comprehensive, hands-on masterclass covering Python data structures, memory management, decorators, async/await concurrency, and production-grade PostgreSQL architecture.',
            'Computer Science',
            true,
            true,
            'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1200&q=80',
            true
        )
        ON CONFLICT (name) DO UPDATE SET 
            title = EXCLUDED.title,
            short_introduction = EXCLUDED.short_introduction,
            description = EXCLUDED.description,
            category = EXCLUDED.category,
            published = true,
            featured = true,
            image = EXCLUDED.image,
            enable_certification = true
        RETURNING id;
    `);
    const pythonId = pythonRes.rows[0].id;

    // Quiz 1: Python Fundamentals & Memory Model
    const pyQuiz1Id = (await pool.query(`
        INSERT INTO quizzes (title, passing_percentage, total_marks, duration_minutes, show_answers)
        VALUES ('Python Fundamentals & Memory Model Quiz', 70, 5, 15, true) RETURNING id
    `)).rows[0].id;

    const pq1 = (await pool.query(`
        INSERT INTO questions (quiz_id, question, type, marks, idx)
        VALUES ($1, 'What is the key difference between a Python list and a tuple?', 'Choices', 2, 0) RETURNING id
    `, [pyQuiz1Id])).rows[0].id;
    await pool.query(`
        INSERT INTO question_options (question_id, option, is_correct)
        VALUES 
            ($1, 'Lists are mutable while tuples are immutable', true),
            ($1, 'Tuples can only store integers', false),
            ($1, 'Lists cannot be indexed', false),
            ($1, 'Tuples use dynamic memory allocation while lists do not', false)
    `, [pq1]);

    const pq2 = (await pool.query(`
        INSERT INTO questions (quiz_id, question, type, marks, idx)
        VALUES ($1, 'How does Python handle memory management for unused objects?', 'Choices', 2, 1) RETURNING id
    `, [pyQuiz1Id])).rows[0].id;
    await pool.query(`
        INSERT INTO question_options (question_id, option, is_correct)
        VALUES 
            ($1, 'Reference counting combined with a cyclic garbage collector', true),
            ($1, 'Manual pointer freeing like C malloc/free', false),
            ($1, 'Immediate OS memory reallocation on variable re-assignment', false),
            ($1, 'Strict compile-time lifetime borrow checking', false)
    `, [pq2]);

    const pq3 = (await pool.query(`
        INSERT INTO questions (quiz_id, question, type, marks, idx)
        VALUES ($1, 'What is the average time complexity of looking up a key in a Python dict?', 'Choices', 1, 2) RETURNING id
    `, [pyQuiz1Id])).rows[0].id;
    await pool.query(`
        INSERT INTO question_options (question_id, option, is_correct)
        VALUES 
            ($1, 'O(1) amortized constant time via hash tables', true),
            ($1, 'O(n) linear search', false),
            ($1, 'O(log n) binary search', false),
            ($1, 'O(n log n)', false)
    `, [pq3]);

    // Quiz 2: Backend REST & Concurrency Mastery
    const pyQuiz2Id = (await pool.query(`
        INSERT INTO quizzes (title, passing_percentage, total_marks, duration_minutes, show_answers)
        VALUES ('Backend REST & Concurrency Mastery Quiz', 80, 5, 20, true) RETURNING id
    `)).rows[0].id;

    const pq4 = (await pool.query(`
        INSERT INTO questions (quiz_id, question, type, marks, idx)
        VALUES ($1, 'Which HTTP methods must be idempotent according to RFC 7231 specifications?', 'Choices', 3, 0) RETURNING id
    `, [pyQuiz2Id])).rows[0].id;
    await pool.query(`
        INSERT INTO question_options (question_id, option, is_correct)
        VALUES 
            ($1, 'GET, PUT, DELETE, and HEAD', true),
            ($1, 'POST and PATCH only', false),
            ($1, 'POST, PUT, and DELETE', false),
            ($1, 'CONNECT and POST only', false)
    `, [pq4]);

    const pq5 = (await pool.query(`
        INSERT INTO questions (quiz_id, question, type, marks, idx)
        VALUES ($1, 'Which ACID isolation level guarantees complete serialization of concurrent transactions?', 'Choices', 2, 1) RETURNING id
    `, [pyQuiz2Id])).rows[0].id;
    await pool.query(`
        INSERT INTO question_options (question_id, option, is_correct)
        VALUES 
            ($1, 'SERIALIZABLE', true),
            ($1, 'READ COMMITTED', false),
            ($1, 'REPEATABLE READ', false),
            ($1, 'READ UNCOMMITTED', false)
    `, [pq5]);

    // Chapters & Lessons for Python Course
    await pool.query('DELETE FROM chapters WHERE course_id = $1', [pythonId]);
    const pyCh1 = (await pool.query(`
        INSERT INTO chapters (course_id, title, idx) VALUES ($1, 'Chapter 1: Python Internals & Advanced Data Structures', 0) RETURNING id
    `, [pythonId])).rows[0].id;

    await pool.query(`
        INSERT INTO lessons (chapter_id, title, body, content_type, include_in_preview, idx, duration)
        VALUES ($1, '1.1 Memory Allocation & Pointer Model in CPython', '<h2>CPython Memory Model</h2><p>Python variables are pointers to PyObject structs on the heap. Small integers and interned strings are cached in memory pools to optimize runtime overhead.</p>', 'Text', true, 0, '15 mins')
    `, [pyCh1]);

    await pool.query(`
        INSERT INTO lessons (chapter_id, title, body, content_type, include_in_preview, idx, duration)
        VALUES ($1, '1.2 Advanced Generator Pipelines & Itertools', '<h2>Generators & Lazy Streams</h2><p>Using yield enables constant O(1) memory evaluation across arbitrarily large datasets.</p>', 'Text', true, 1, '20 mins')
    `, [pyCh1]);

    await pool.query(`
        INSERT INTO lessons (chapter_id, title, body, content_type, include_in_preview, idx, quiz_id, duration)
        VALUES ($1, '1.3 Assessment: Python Fundamentals & Memory Model Quiz', '<p>Interactive assessment on Python memory structures, mutability, and dictionary hash tables.</p>', 'Quiz', true, 2, $2, '15 mins')
    `, [pyCh1, pyQuiz1Id]);

    const pyCh2 = (await pool.query(`
        INSERT INTO chapters (course_id, title, idx) VALUES ($1, 'Chapter 2: Production REST APIs & Concurrency', 1) RETURNING id
    `, [pythonId])).rows[0].id;

    await pool.query(`
        INSERT INTO lessons (chapter_id, title, body, content_type, include_in_preview, idx, duration)
        VALUES ($1, '2.1 Async/Await Event Loop Architecture', '<h2>Event Loop Concurrency</h2><p>Explore asynchronous I/O multiplexing with libuv/epoll and non-blocking database queries.</p>', 'Text', true, 0, '25 mins')
    `, [pyCh2]);

    await pool.query(`
        INSERT INTO lessons (chapter_id, title, body, content_type, include_in_preview, idx, quiz_id, duration)
        VALUES ($1, '2.2 Assessment: Backend REST & Concurrency Mastery Quiz', '<p>Interactive quiz evaluating HTTP idempotency, connection pooling, and ACID transaction isolation.</p>', 'Quiz', true, 1, $2, '20 mins')
    `, [pyCh2, pyQuiz2Id]);


    // ── 2. Full-Stack Vue 3 & Vite Application Architecture ───────────────
    console.log('📚 [Curriculum] Seeding: Full-Stack Vue 3 & Vite Application Architecture...');
    const vueRes = await pool.query(`
        INSERT INTO courses (name, title, short_introduction, description, category, published, featured, image, enable_certification)
        VALUES (
            'modern-vue3-vite-architecture',
            'Full-Stack Vue 3 & Vite Architecture',
            'Master the Composition API, Pinia state stores, Vite build optimization, and resilient UI design.',
            'Deep dive into reactive frontends using Vue 3 Script Setup syntax, composable architecture, dynamic route guards, and zero-bundle overhead build pipelines with Vite.',
            'Frontend Engineering',
            true,
            true,
            'https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?auto=format&fit=crop&w=1200&q=80',
            true
        )
        ON CONFLICT (name) DO UPDATE SET 
            title = EXCLUDED.title,
            short_introduction = EXCLUDED.short_introduction,
            description = EXCLUDED.description,
            category = EXCLUDED.category,
            published = true,
            featured = true,
            image = EXCLUDED.image,
            enable_certification = true
        RETURNING id;
    `);
    const vueId = vueRes.rows[0].id;

    // Quiz 3: Vue 3 Composition API & Reactivity
    const vueQuizId = (await pool.query(`
        INSERT INTO quizzes (title, passing_percentage, total_marks, duration_minutes, show_answers)
        VALUES ('Vue 3 Composition API & Reactivity Quiz', 75, 4, 15, true) RETURNING id
    `)).rows[0].id;

    const vq1 = (await pool.query(`
        INSERT INTO questions (quiz_id, question, type, marks, idx)
        VALUES ($1, 'How does Vue 3 achieve fine-grained reactivity under the hood?', 'Choices', 2, 0) RETURNING id
    `, [vueQuizId])).rows[0].id;
    await pool.query(`
        INSERT INTO question_options (question_id, option, is_correct)
        VALUES 
            ($1, 'ES6 Proxies that intercept get/set operations and track active effects in a WeakMap', true),
            ($1, 'Object.defineProperty property rewriting on startup', false),
            ($1, 'Dirty-checking polling cycles like AngularJS 1.x', false),
            ($1, 'DOM mutation observers attached to every element', false)
    `, [vq1]);

    const vq2 = (await pool.query(`
        INSERT INTO questions (quiz_id, question, type, marks, idx)
        VALUES ($1, 'Why is ref() used instead of reactive() when dealing with primitive types like numbers or strings?', 'Choices', 2, 1) RETURNING id
    `, [vueQuizId])).rows[0].id;
    await pool.query(`
        INSERT INTO question_options (question_id, option, is_correct)
        VALUES 
            ($1, 'JavaScript primitives cannot be wrapped in Proxies directly, so ref wraps them in an object with a .value getter/setter', true),
            ($1, 'reactive() only works on server-side rendering', false),
            ($1, 'ref() disables reactivity for performance', false),
            ($1, 'reactive() causes memory leaks when holding strings', false)
    `, [vq2]);

    // Chapters & Lessons for Vue 3 Course
    await pool.query('DELETE FROM chapters WHERE course_id = $1', [vueId]);
    const vueCh1 = (await pool.query(`
        INSERT INTO chapters (course_id, title, idx) VALUES ($1, 'Chapter 1: Composition API & Reactivity Deep Dive', 0) RETURNING id
    `, [vueId])).rows[0].id;

    await pool.query(`
        INSERT INTO lessons (chapter_id, title, body, content_type, include_in_preview, idx, duration)
        VALUES ($1, '1.1 Deep Reactivity: ref(), reactive(), and shallowRef()', '<h2>The Vue 3 Reactivity Engine</h2><p>Understand how ES6 Proxies track active effect subscribers and batch microtask DOM updates.</p>', 'Text', true, 0, '18 mins')
    `, [vueCh1]);

    await pool.query(`
        INSERT INTO lessons (chapter_id, title, body, content_type, include_in_preview, idx, quiz_id, duration)
        VALUES ($1, '1.2 Assessment: Vue 3 Composition API & Reactivity Quiz', '<p>Test your mastery of Vue 3 Proxies, Pinia store design, and composable lifecycles.</p>', 'Quiz', true, 1, $2, '15 mins')
    `, [vueCh1, vueQuizId]);


    // ── 3. System Design & Cloud-Native Architecture ──────────────────────
    console.log('📚 [Curriculum] Seeding: System Design & Cloud-Native Architecture...');
    const sysRes = await pool.query(`
        INSERT INTO courses (name, title, short_introduction, description, category, published, featured, image, enable_certification)
        VALUES (
            'system-design-cloud-native',
            'System Design & Cloud-Native Architecture',
            'Design fault-tolerant, horizontally scalable distributed systems using Cloud Storage, CDN Caching, and Event-Driven architecture.',
            'A masterclass on building enterprise systems that scale to millions of requests per second. Topics include database sharding, CQRS, distributed locking, GCS/S3 signed URLs, and multi-region failover.',
            'System Design',
            true,
            true,
            'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1200&q=80',
            true
        )
        ON CONFLICT (name) DO UPDATE SET 
            title = EXCLUDED.title,
            short_introduction = EXCLUDED.short_introduction,
            description = EXCLUDED.description,
            category = EXCLUDED.category,
            published = true,
            featured = true,
            image = EXCLUDED.image,
            enable_certification = true
        RETURNING id;
    `);
    const sysId = sysRes.rows[0].id;

    // Quiz 4: Distributed Systems & Cloud Storage
    const sysQuizId = (await pool.query(`
        INSERT INTO quizzes (title, passing_percentage, total_marks, duration_minutes, show_answers)
        VALUES ('Distributed Systems & Cloud Storage Quiz', 80, 3, 15, true) RETURNING id
    `)).rows[0].id;

    const sq1 = (await pool.query(`
        INSERT INTO questions (quiz_id, question, type, marks, idx)
        VALUES ($1, 'Under the CAP theorem, which trade-off must a distributed system make in the presence of a network partition (P)?', 'Choices', 3, 0) RETURNING id
    `, [sysQuizId])).rows[0].id;
    await pool.query(`
        INSERT INTO question_options (question_id, option, is_correct)
        VALUES 
            ($1, 'Choose between Consistency (C) and Availability (A)', true),
            ($1, 'Sacrifice Partition Tolerance completely', false),
            ($1, 'Guarantee zero-latency network round-trips', false),
            ($1, 'Switch automatically from SQL to NoSQL', false)
    `, [sq1]);

    // Chapters & Lessons for System Design Course
    await pool.query('DELETE FROM chapters WHERE course_id = $1', [sysId]);
    const sysCh1 = (await pool.query(`
        INSERT INTO chapters (course_id, title, idx) VALUES ($1, 'Chapter 1: Scalable Cloud Storage & CDN Distribution', 0) RETURNING id
    `, [sysId])).rows[0].id;

    await pool.query(`
        INSERT INTO lessons (chapter_id, title, body, content_type, include_in_preview, idx, duration)
        VALUES ($1, '1.1 Object Storage Architecture & Signed URL Security', '<h2>Securing Cloud Media</h2><p>Learn how to generate expiring v4 signed URLs for direct client streaming from Google Cloud Storage without overloading backend API compute.</p>', 'Text', true, 0, '22 mins')
    `, [sysCh1]);

    await pool.query(`
        INSERT INTO lessons (chapter_id, title, body, content_type, include_in_preview, idx, quiz_id, duration)
        VALUES ($1, '1.2 Assessment: Distributed Systems & Cloud Storage Quiz', '<p>Interactive quiz covering CAP theorem trade-offs, CDN edge caching, and scalable object storage patterns.</p>', 'Quiz', true, 1, $2, '15 mins')
    `, [sysCh1, sysQuizId]);

    console.log('🎉 [Curriculum] All 4 production courses, chapters, lessons, and interactive quizzes successfully seeded!');
    process.exit(0);
}

main().catch((err) => {
    console.error('❌ [Curriculum] Seeding failed:', err);
    process.exit(1);
});
