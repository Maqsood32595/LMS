/**
 * PIET Gate 6 — Legacy Deep Journeys (standalone spec)
 * Catalog · course detail · lesson · legacy save_progress · quiz trio · authoring loop
 * Run: node tests/piet/gate6.spec.mjs   (also chained from npm run test:piet)
 */
const BASE = (process.env.BASE_URL || 'http://localhost:5010').replace(/\/$/, '')
const ADMIN = { email: 'admin@fractallms.app', password: 'admin@123' }
const { execFileSync } = await import('node:child_process')

const results = []
async function t(name, fn) {
    try { await fn(); results.push({ name, ok: true }) }
    catch (e) { results.push({ name, ok: false, detail: String(e.message || e).slice(0, 250) }) }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed') }
function eq(a, b, m) { assert(a === b, `${m || 'eq'} → expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`) }
async function j(p, o = {}) {
    const res = await fetch(`${BASE}${p}`, {
        ...o, headers: { Origin: BASE, 'Content-Type': 'application/json', ...(o.headers || {}) },
    })
    let body = null
    try { body = await res.clone().json() } catch {}
    return { res, body }
}

const RUN = Date.now().toString(36)
let adminCookie = ''
{
    const r = await fetch(`${BASE}/api/method/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usr: ADMIN.email, pwd: ADMIN.password }),
    })
    const m = (r.headers.get('set-cookie') || '').match(/user_id=([^;]+)/)
    if (m) adminCookie = `user_id=${decodeURIComponent(m[1])}`
}

/* catalog */
await t('get_courses catalog returns published cards incl. demo course', async () => {
    const r = await j('/api/method/lms.lms.utils.get_courses')
    assert(Array.isArray(r.body.message) && r.body.message.length >= 2, 'catalog too small')
    const demo = r.body.message.find((c) => c.name === 'fractal-kernel-fundamentals')
    assert(demo && Array.isArray(demo.instructors), 'demo card malformed')
})

await t('course_categories includes seeded category', async () => {
    const r = await j('/api/method/lms.lms.utils.get_course_categories')
    assert(r.body.message.some((c) => c.name === 'Engineering'), 'Engineering category missing')
})

/* detail contract */
let lessonId = null
await t('get_course_details full contract (chapters→lessons, membership)', async () => {
    const r = await j('/api/method/lms.lms.utils.get_course_details?course=fractal-kernel-fundamentals', {
        headers: { Cookie: adminCookie },
    })
    eq(r.res.status, 200, 'status')
    const d = r.body.message
    assert(d.chapters?.length >= 1 && d.chapters[0].lessons.length >= 1, 'outline missing')
    lessonId = d.chapters[0].lessons[0].name
    assert(Array.isArray(d.instructors) && Array.isArray(d.related_courses), 'instructors/related missing')
    eq(typeof d.is_instructor, 'boolean', 'is_instructor type')
})

/* legacy save_progress */
await t('legacy save_progress persists + recomputes to exactly 100', async () => {
    const stu = await j('/api/method/login', { method: 'POST', body: JSON.stringify({ usr: 'smoke@test.com', pwd: 'Test1234' }) })
    const cookie = (stu.res.headers.get('set-cookie') || '').match(/user_id=([^;]+)/)[1]
    const res = await fetch(`${BASE}/api/method/lms.lms.doctype.course_lesson.course_lesson.save_progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `user_id=${cookie}` },
        body: JSON.stringify({ course: 'fractal-kernel-fundamentals', lesson: lessonId }),
    })
    eq(res.status, 200, 'save status')
    const mine = await j('/api/method/lms.lms.api.get_my_courses', { method: 'POST', headers: { Cookie: `user_id=${cookie}` } })
    const row = mine.body.message.find((c) => c.name === 'fractal-kernel-fundamentals')
    assert(row && Number(row.progress) === 100, `progress=${row?.progress}`)
})

/* quiz trio */
await t('quiz legacy trio: answers hidden · submit grades · check_answer', async () => {
    const ids = JSON.parse(execFileSync(
        process.execPath,
        ['-e', "require('dotenv').config();const{Pool}=require('pg');(async()=>{const p=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});const r=await p.query(\"SELECT q.id quiz_id, qu.id question_id, o.id opt_id FROM quizzes q JOIN questions qu ON qu.quiz_id=q.id JOIN question_options o ON o.question_id=qu.id WHERE o.is_correct=true LIMIT 1\");console.log(JSON.stringify(r.rows[0]));await p.end()})()"],
        { cwd: new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), encoding: 'utf8' }
    ))
    const qq = await j(`/api/method/lms.lms.utils.get_quiz_with_questions?quiz=${ids.quiz_id}`)
    eq(qq.res.status, 200, 'quiz fetch')
    assert(!JSON.stringify(qq.body.message).includes('"is_correct":true'), 'correct answers leaked')
    const sub = await j('/api/method/lms.lms.doctype.lms_quiz.lms_quiz.submit_quiz', {
        method: 'POST',
        body: JSON.stringify({ quiz: ids.quiz_id, values: { [ids.question_id]: ids.opt_id } }),
    })
    eq(sub.body.message.passed, true, 'grading failed')
    const chk = await j('/api/method/lms.lms.doctype.lms_quiz.lms_quiz.check_answer', {
        method: 'POST', body: JSON.stringify({ question: ids.question_id, answer: ids.opt_id }),
    })
    eq(chk.body.message, true, 'check_answer')
})

/* tutor authoring loop */
await t('TUTOR authoring loop: chapter → lesson → reindex → delete_lesson', async () => {
    const login = await fetch(`${BASE}/api/method/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usr: ADMIN.email, pwd: ADMIN.password }),
    })
    const cookie = (login.headers.get('set-cookie') || '').match(/user_id=([^;]+)/)[1]
    const H = { 'Content-Type': 'application/json', Cookie: `user_id=${cookie}` }
    const ch = await j('/api/method/lms.lms.api.upsert_chapter', {
        method: 'POST', headers: H,
        body: JSON.stringify({ course: 'e2e-verification-course', title: `PIET Ch ${RUN}` }),
    })
    eq(ch.res.status, 200, 'chapter create')
    const ls = await j('/api/method/lms.lms.api.create_lesson', {
        method: 'POST', headers: H, body: JSON.stringify({ chapter: ch.body.message.name }),
    })
    eq(ls.res.status, 200, 'lesson create')
    const ix = await j('/api/method/lms.lms.api.update_lesson_index', {
        method: 'POST', headers: H, body: JSON.stringify({ lesson: ls.body.message.name, idx: 5 }),
    })
    eq(ix.res.status, 200, 'reindex')
    const del = await j('/api/method/lms.lms.api.delete_lesson', {
        method: 'POST', headers: H, body: JSON.stringify({ lesson: ls.body.message.name }),
    })
    eq(del.res.status, 200, 'lesson delete')
})

/* RED: student authoring blocked */
await t('RED: student upsert_chapter rejected 403 PermissionError', async () => {
    const stu = await j('/api/method/login', { method: 'POST', body: JSON.stringify({ usr: 'smoke@test.com', pwd: 'Test1234' }) })
    const cookie = (stu.res.headers.get('set-cookie') || '').match(/user_id=([^;]+)/)[1]
    const r = await j('/api/method/lms.lms.api.upsert_chapter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `user_id=${cookie}` },
        body: JSON.stringify({ course: 'e2e-verification-course', title: 'Nope' }),
    })
    eq(r.res.status, 403, 'status')
    eq(r.body.exc_type, 'PermissionError', 'exc_type')
})

/* generics + stub sweep */
await t('frappe.client generics + stub sweep answer 200 envelope', async () => {
    const list = await j('/api/method/frappe.client.get_list?doctype=LMS%20Quiz%20Submission')
    assert(Array.isArray(list.body.message), 'get_list not array')
    const val = await j('/api/method/frappe.client.get_value?doctype=File&fieldname=file_url')
    assert('file_url' in val.body.message, 'get_value shape')
    for (const p of ['/api/method/lms.lms.api.get_announcements', '/api/method/lms.lms.utils.get_batches']) {
        eq((await j(p)).res.status, 200, `stub ${p}`)
    }
})

/* report */
let failed = 0
console.log('\n[GATE 6 - LEGACY DEEP JOURNEYS]')
for (const r of results) {
    if (r.ok) console.log(`  PASS ${r.name}`)
    else { failed++; console.log(`  FAIL ${r.name}\n       -> ${r.detail}`) }
}
console.log(`[GATE 6] ${results.length - failed}/${results.length} passed\n`)
process.exit(failed ? 1 : 0)

