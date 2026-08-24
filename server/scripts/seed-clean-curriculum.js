/**
 * Seeds high-quality, production-ready curriculum courses and quizzes,
 * while purging temporary test courses (piet-gate3-*, tutor-journey-*, etc.).
 *
 * Usage: node server/scripts/seed-clean-curriculum.js
 */
require('dotenv').config();
const { getPool } = require('../config/supabase');

async function main() {
    const pool = getPool();

    console.log('🧹 [Curriculum] Cleaning up dynamic temporary test courses...');
    await pool.query(`
        DELETE FROM courses 
        WHERE name LIKE 'piet-gate3-%' 
           OR name LIKE 'tutor-journey-%' 
           OR name LIKE 'concurrency-test-%' 
           OR name = 'fractal'
    `);
    console.log('✅ Temporary test courses removed.');

    // ── 0. Baseline Verification Courses ──────────────────────────────────
    const fractalCourse = await pool.query(`
        INSERT INTO courses (name, title, short_introduction, description, category, published, featured)
        VALUES ('fractal-kernel-fundamentals', 'Fractal Kernel Fundamentals',
                'Learn how manifest-driven grandchild cells power a modern LMS.',
                'The core architecture overview course for Fractal LMS.',
                'Engineering', true, true)
        ON CONFLICT (name) DO UPDATE SET published = true
        RETURNING id;
    `);
    const fractalCourseId = fractalCourse.rows[0].id;

    const e2eCourse = await pool.query(`
        INSERT INTO courses (name, title, short_introduction, description, category, published, featured)
        VALUES ('e2e-verification-course', 'E2E Verification Course',
                'Baseline course for automated enrollment testing.',
                'Used by automated QA test harness.',
                'Engineering', true, true)
        ON CONFLICT (name) DO UPDATE SET published = true
        RETURNING id;
    `);

    // Ensure fractal course has chapter and lesson
    const existingChapters = await pool.query('SELECT id FROM chapters WHERE course_id = $1', [fractalCourseId]);
    let fractalChId = existingChapters.rows[0]?.id;
    if (!fractalChId) {
        fractalChId = (await pool.query(`INSERT INTO chapters (course_id, title, idx) VALUES ($1, 'Getting Started', 0) RETURNING id`, [fractalCourseId])).rows[0].id;
        await pool.query(`
            INSERT INTO lessons (chapter_id, title, body, content_type, include_in_preview, idx)
            VALUES ($1, 'Welcome to Fractal LMS', '<p>Welcome to Fractal LMS architecture.</p>', 'Text', true, 0)
        `, [fractalChId]);
    }

    // Ensure Fractal Basics quiz exists with 1 question
    const existingQuiz = await pool.query("SELECT id FROM quizzes WHERE title = 'Fractal Basics'");
    let fractalQuizId = existingQuiz.rows[0]?.id;
    if (!fractalQuizId) {
        fractalQuizId = (await pool.query(`
            INSERT INTO quizzes (title, passing_percentage, total_marks, show_answers)
            VALUES ('Fractal Basics', 50, 2, true) RETURNING id
        `)).rows[0].id;
        const q = (await pool.query(`
            INSERT INTO questions (quiz_id, question, type, marks, idx)
            VALUES ($1, 'Which component auto-discovers feature cells?', 'Choices', 2, 0) RETURNING id
        `, [fractalQuizId])).rows[0].id;
        await pool.query(`
            INSERT INTO question_options (question_id, option, is_correct)
            VALUES ($1, 'The Kernel', true), ($1, 'The Router', false), ($1, 'Vite', false)
        `, [q]);
    }


    // ── 1. Python & Backend Engineering Course ────────────────────────────
    console.log('📚 [Curriculum] Creating: Mastering Python & Backend Engineering...');
    const pythonCourseRes = await pool.query(`
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
            published = EXCLUDED.published,
            featured = EXCLUDED.featured,
            image = EXCLUDED.image,
            enable_certification = EXCLUDED.enable_certification
        RETURNING id;
    `);
    const pythonCourseId = pythonCourseRes.rows[0].id;

    // Chapters for Python
    const pyCh1 = (await pool.query(`
        INSERT INTO chapters (course_id, title, idx) 
        VALUES ($1, 'Chapter 1: Python Internals & Advanced Data Structures', 0) 
        RETURNING id;
    `, [pythonCourseId])).rows[0].id;

    const pyCh2 = (await pool.query(`
        INSERT INTO chapters (course_id, title, idx) 
        VALUES ($1, 'Chapter 2: Asynchronous Concurrency & REST Architecture', 1) 
        RETURNING id;
    `, [pythonCourseId])).rows[0].id;

    // Quizzes for Python
    const pyQuiz1 = (await pool.query(`
        INSERT INTO quizzes (title, passing_percentage, total_marks, duration_minutes, show_answers)
        VALUES ('Python Fundamentals & Memory Model Quiz', 70, 5, 15, true)
        RETURNING id;
    `)).rows[0].id;

    const pyQuiz2 = (await pool.query(`
        INSERT INTO quizzes (title, passing_percentage, total_marks, duration_minutes, show_answers)
        VALUES ('Backend REST & Concurrency Mastery Quiz', 80, 5, 20, true)
        RETURNING id;
    `)).rows[0].id;

    // Lessons for Python Chapter 1
    await pool.query(`
        INSERT INTO lessons (chapter_id, title, body, content_type, include_in_preview, idx)
        VALUES 
        ($1, '1.1 Memory Model, Mutability & Object References', 
         '<h3>Understanding Python Memory Management</h3><p>In Python, variables are not buckets holding values; they are <b>pointers to objects in memory</b>.</p><ul><li><b>Immutable Types</b>: <code>int</code>, <code>float</code>, <code>str</code>, <code>tuple</code>, <code>frozenset</code>.</li><li><b>Mutable Types</b>: <code>list</code>, <code>dict</code>, <code>set</code>.</li></ul><pre><code class="language-python"># Example of pointer sharing\na = [1, 2, 3]\nb = a\nb.append(4)\nprint(a) # Output: [1, 2, 3, 4]</code></pre>',
         'Text', true, 0),
        ($1, '1.2 Advanced Generators, Iterators & List Comprehensions',
         '<h3>Lazy Evaluation with Generators</h3><p>Generators yield one item at a time using the <code>yield</code> keyword, keeping memory footprint constant $O(1)$ even when streaming millions of records.</p><pre><code class="language-python">def chunk_stream(data, size):\n    for i in range(0, len(data), size):\n        yield data[i:i + size]</code></pre>',
         'Text', false, 1),
        ($1, '1.3 Python Fundamentals & Memory Quiz',
         '<p>Test your knowledge on Python memory pointers, list comprehensions, and mutability.</p>',
         'Quiz', false, 2)
    `, [pyCh1]);

    // Attach quiz1 to lesson 1.3
    await pool.query(`UPDATE lessons SET quiz_id = $1 WHERE chapter_id = $2 AND title LIKE '%Quiz%'`, [pyQuiz1, pyCh1]);

    // Questions for Python Quiz 1
    const pyQ1 = (await pool.query(`
        INSERT INTO questions (quiz_id, question, type, marks, idx)
        VALUES ($1, 'Which of the following data types in Python is IMMUTABLE?', 'Choices', 1, 0)
        RETURNING id;
    `, [pyQuiz1])).rows[0].id;
    await pool.query(`
        INSERT INTO question_options (question_id, option, is_correct)
        VALUES 
        ($1, 'Tuple', true),
        ($1, 'List', false),
        ($1, 'Dictionary', false),
        ($1, 'Set', false)
    `, [pyQ1]);

    const pyQ2 = (await pool.query(`
        INSERT INTO questions (quiz_id, question, type, marks, idx)
        VALUES ($1, 'What is the time complexity of looking up a key in a Python dict on average?', 'Choices', 1, 1)
        RETURNING id;
    `, [pyQuiz1])).rows[0].id;
    await pool.query(`
        INSERT INTO question_options (question_id, option, is_correct)
        VALUES 
        ($1, 'O(1)', true),
        ($1, 'O(n)', false),
        ($1, 'O(log n)', false),
        ($1, 'O(n^2)', false)
    `, [pyQ2]);

    const pyQ3 = (await pool.query(`
        INSERT INTO questions (quiz_id, question, type, marks, idx)
        VALUES ($1, 'What does the "yield" keyword in a function return?', 'Choices', 1, 2)
        RETURNING id;
    `, [pyQuiz1])).rows[0].id;
    await pool.query(`
        INSERT INTO question_options (question_id, option, is_correct)
        VALUES 
        ($1, 'A generator object', true),
        ($1, 'A completed list', false),
        ($1, 'A boolean status', false)
    `, [pyQ3]);

    // Lessons for Python Chapter 2
    await pool.query(`
        INSERT INTO lessons (chapter_id, title, body, content_type, include_in_preview, idx)
        VALUES 
        ($1, '2.1 Asynchronous Event Loops & Async/Await',
         '<h3>Concurrency vs Parallelism in Python</h3><p>Using <code>asyncio</code> allows cooperative multitasking for I/O bound workloads (DB queries, HTTP requests, GCS uploads) without thread-context overhead.</p><pre><code class="language-python">import asyncio\n\nasync def fetch_data():\n    await asyncio.sleep(1)\n    return {"status": "ok"}</code></pre>',
         'Text', false, 0),
        ($1, '2.2 Designing Idempotent REST APIs & HTTP Semantics',
         '<h3>HTTP Method Idempotency</h3><p>An operation is idempotent if making multiple identical requests has the same effect as making a single request.</p><ul><li><b>GET, PUT, DELETE</b>: Idempotent</li><li><b>POST, PATCH</b>: Non-idempotent</li></ul>',
         'Text', false, 1),
        ($1, '2.3 Backend REST & Concurrency Mastery Quiz',
         '<p>Final examination covering asynchronous concurrency and HTTP API design standards.</p>',
         'Quiz', false, 2)
    `, [pyCh2]);

    // Attach quiz2 to lesson 2.3
    await pool.query(`UPDATE lessons SET quiz_id = $1 WHERE chapter_id = $2 AND title LIKE '%Quiz%'`, [pyQuiz2, pyCh2]);

    // Questions for Python Quiz 2
    const pyQ2_1 = (await pool.query(`
        INSERT INTO questions (quiz_id, question, type, marks, idx)
        VALUES ($1, 'Which HTTP method is considered IDEMPOTENT by RFC 9110 specification?', 'Choices', 1, 0)
        RETURNING id;
    `, [pyQuiz2])).rows[0].id;
    await pool.query(`
        INSERT INTO question_options (question_id, option, is_correct)
        VALUES 
        ($1, 'PUT', true),
        ($1, 'POST', false)
    `, [pyQ2_1]);

    const pyQ2_2 = (await pool.query(`
        INSERT INTO questions (quiz_id, question, type, marks, idx)
        VALUES ($1, 'In database architecture, what does the ACID "I" stand for?', 'Choices', 1, 1)
        RETURNING id;
    `, [pyQuiz2])).rows[0].id;
    await pool.query(`
        INSERT INTO question_options (question_id, option, is_correct)
        VALUES 
        ($1, 'Isolation', true),
        ($1, 'Idempotency', false),
        ($1, 'Integration', false)
    `, [pyQ2_2]);

    // ── 2. Vue 3 & Modern Frontend Architecture Course ────────────────────
    console.log('📚 [Curriculum] Creating: Full-Stack Vue 3 & Vite Application Architecture...');
    const vueCourseRes = await pool.query(`
        INSERT INTO courses (name, title, short_introduction, description, category, published, featured, image, enable_certification)
        VALUES (
            'modern-vue3-vite-architecture',
            'Full-Stack Vue 3 & Vite Architecture',
            'Master the Composition API, Pinia state stores, Vite build optimization, and resilient UI design.',
            'A practical deep dive into enterprise Vue 3 development. Learn reactive primitives (ref vs reactive), custom composables, Tailwind UI integration, and sub-second Vite HMR.',
            'Frontend Engineering',
            true,
            true,
            'https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=1200&q=80',
            true
        )
        ON CONFLICT (name) DO UPDATE SET 
            title = EXCLUDED.title,
            short_introduction = EXCLUDED.short_introduction,
            description = EXCLUDED.description,
            category = EXCLUDED.category,
            published = EXCLUDED.published,
            featured = EXCLUDED.featured,
            image = EXCLUDED.image,
            enable_certification = EXCLUDED.enable_certification
        RETURNING id;
    `);
    const vueCourseId = vueCourseRes.rows[0].id;

    // Chapters for Vue
    const vueCh1 = (await pool.query(`
        INSERT INTO chapters (course_id, title, idx) 
        VALUES ($1, 'Chapter 1: Composition API & Reactive Primitives', 0) 
        RETURNING id;
    `, [vueCourseId])).rows[0].id;

    // Quiz for Vue
    const vueQuiz = (await pool.query(`
        INSERT INTO quizzes (title, passing_percentage, total_marks, duration_minutes, show_answers)
        VALUES ('Vue 3 Composition API & Reactivity Quiz', 75, 4, 15, true)
        RETURNING id;
    `)).rows[0].id;

    // Lessons for Vue Chapter 1
    await pool.query(`
        INSERT INTO lessons (chapter_id, title, body, content_type, include_in_preview, idx)
        VALUES 
        ($1, '1.1 Deep Dive: ref() vs reactive() & Proxy Trap Mechanics',
         '<h3>Vue 3 Reactivity System</h3><p>Vue 3 uses JavaScript <code>Proxy</code> to intercept property accesses and mutations.</p><ul><li><b>ref(val)</b>: Wraps primitives and objects into a <code>RefImpl</code> object with <code>.value</code> getter/setter.</li><li><b>reactive(obj)</b>: Creates a reactive Proxy around an object (cannot hold primitives like strings/numbers).</li></ul>',
         'Text', true, 0),
        ($1, '1.2 Architecture of Custom Composables',
         '<h3>Clean Business Logic Separation</h3><p>Composables leverage Vue’s reactivity outside of components for reusable stateful logic.</p><pre><code class="language-typescript">export function useScreenSize() {\n  const width = ref(window.innerWidth)\n  // ...\n  return { width }\n}</code></pre>',
         'Text', false, 1),
        ($1, '1.3 Vue 3 Composition API & Reactivity Quiz',
         '<p>Assessment on Proxy mechanics, Ref un-wrapping, and Pinia store state reactivity.</p>',
         'Quiz', false, 2)
    `, [vueCh1]);

    // Attach quiz to lesson 1.3
    await pool.query(`UPDATE lessons SET quiz_id = $1 WHERE chapter_id = $2 AND title LIKE '%Quiz%'`, [vueQuiz, vueCh1]);

    // Questions for Vue Quiz
    const vueQ1 = (await pool.query(`
        INSERT INTO questions (quiz_id, question, type, marks, idx)
        VALUES ($1, 'Which underlying JavaScript feature powers Vue 3 reactivity?', 'Choices', 1, 0)
        RETURNING id;
    `, [vueQuiz])).rows[0].id;
    await pool.query(`
        INSERT INTO question_options (question_id, option, is_correct)
        VALUES 
        ($1, 'Proxy', true),
        ($1, 'Object.defineProperty', false),
        ($1, 'WebSockets', false),
        ($1, 'Service Workers', false)
    `, [vueQ1]);

    const vueQ2 = (await pool.query(`
        INSERT INTO questions (quiz_id, question, type, marks, idx)
        VALUES ($1, 'When accessing a ref inside a <script setup> block, what property must you use?', 'Choices', 1, 1)
        RETURNING id;
    `, [vueQuiz])).rows[0].id;
    await pool.query(`
        INSERT INTO question_options (question_id, option, is_correct)
        VALUES 
        ($1, '.value', true),
        ($1, '.data', false),
        ($1, '.ref', false)
    `, [vueQ2]);

    // ── 3. System Design & Cloud-Native Architecture Course ───────────────
    console.log('📚 [Curriculum] Creating: System Design & Cloud-Native Architecture...');
    const sysCourseRes = await pool.query(`
        INSERT INTO courses (name, title, short_introduction, description, category, published, featured, image, enable_certification)
        VALUES (
            'system-design-cloud-native',
            'System Design & Cloud-Native Architecture',
            'Design fault-tolerant, horizontally scalable distributed systems using Cloud Storage, CDN Caching, and Event-Driven architecture.',
            'Learn high-level system design from first principles: load balancing algorithms, database partitioning, signed object streaming, and high-availability SLA calculations.',
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
            published = EXCLUDED.published,
            featured = EXCLUDED.featured,
            image = EXCLUDED.image,
            enable_certification = EXCLUDED.enable_certification
        RETURNING id;
    `);
    const sysCourseId = sysCourseRes.rows[0].id;

    // Chapter for System Design
    const sysCh1 = (await pool.query(`
        INSERT INTO chapters (course_id, title, idx) 
        VALUES ($1, 'Chapter 1: Distributed Systems, Latency & Storage Primitives', 0) 
        RETURNING id;
    `, [sysCourseId])).rows[0].id;

    // Quiz for System Design
    const sysQuiz = (await pool.query(`
        INSERT INTO quizzes (title, passing_percentage, total_marks, duration_minutes, show_answers)
        VALUES ('Distributed Systems & Cloud Storage Quiz', 80, 3, 15, true)
        RETURNING id;
    `)).rows[0].id;

    await pool.query(`
        INSERT INTO lessons (chapter_id, title, body, content_type, include_in_preview, idx)
        VALUES 
        ($1, '1.1 Throughput vs Latency & The CAP Theorem',
         '<h3>Core Trade-offs in Distributed Systems</h3><p>In distributed data stores, the CAP Theorem dictates you can pick at most two of:</p><ul><li><b>Consistency (C)</b>: Every read receives the most recent write.</li><li><b>Availability (A)</b>: Every non-failing node returns a response.</li><li><b>Partition Tolerance (P)</b>: The system continues to operate despite network drops.</li></ul>',
         'Text', true, 0),
        ($1, '1.2 Direct-to-Storage Cloud Streaming Architectures',
         '<h3>Decoupling Compute from High-Bandwidth Media</h3><p>Rather than proxying video gigabytes through web servers, modern architectures issue short-lived signed URLs directly to object stores (GCS/S3) with CDN edge caching.</p>',
         'Text', false, 1),
        ($1, '1.3 Distributed Systems & Cloud Storage Quiz',
         '<p>Test your knowledge on CAP theorem, database sharding, and cloud storage streaming.</p>',
         'Quiz', false, 2)
    `, [sysCh1]);

    await pool.query(`UPDATE lessons SET quiz_id = $1 WHERE chapter_id = $2 AND title LIKE '%Quiz%'`, [sysQuiz, sysCh1]);

    const sysQ1 = (await pool.query(`
        INSERT INTO questions (quiz_id, question, type, marks, idx)
        VALUES ($1, 'According to the CAP theorem, in the presence of a network partition (P), what trade-off must be made?', 'Choices', 1, 0)
        RETURNING id;
    `, [sysQuiz])).rows[0].id;
    await pool.query(`
        INSERT INTO question_options (question_id, option, is_correct)
        VALUES 
        ($1, 'Choose between Consistency (C) and Availability (A)', true),
        ($1, 'Increase CPU cores to eliminate partitions', false),
        ($1, 'Switch from SQL to NoSQL', false)
    `, [sysQ1]);

    console.log('🎉 [Curriculum] All 3 production courses, chapters, lessons, and 4 quizzes successfully seeded!');
    await pool.end();
    process.exit(0);
}

main().catch(err => {
    console.error('❌ [Curriculum] Seeding failed:', err);
    process.exit(1);
});
