/**
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * PIET â€” Persistent In-RAM Ephemeral Twin Â· Strict Non-Hallucinating Suite
 * Spec: D:\Hayat\workflows\persistent_in_ram_ephemeral_twin_specification.md
 * Target: live Fractal LMS on BASE_URL (default http://localhost:5010)
 *
 * Gate 1  Falsification Probe        â€” assertions must be able to FAIL (red)
 * Gate 2  AST & Import Integrity      â€” syntax, manifests, hashed-asset graph
 * Gate 3  Zero-Mock HTTP & Storage    â€” real HTTP â†’ real Supabase â†’ real GCS
 * Gate 4  Physical Layout & State     â€” rendered-artifact invariants on disk/HTTP
 *
 * Exit code 0 only when EVERY gate passes. No mocks. No yes-men.
 * Run:  node tests/piet/piet.mjs
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 */
import 'dotenv/config'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const DIST = `${ROOT}/frontend/dist`
const BASE = (process.env.BASE_URL || 'http://localhost:5010').replace(/\/$/, '')
const ADMIN = { email: 'admin@fractallms.app', password: 'admin@123' }

const results = []
let currentGate = ''
function gate(name) { currentGate = name }
async function t(name, fn) {
    try {
        await fn()
        results.push({ gate: currentGate, name, ok: true })
    } catch (e) {
        results.push({ gate: currentGate, name, ok: false, detail: String(e.message || e).slice(0, 300) })
    }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed') }
function eq(a, b, msg) { assert(a === b, `${msg || 'eq'} â†’ expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) }

async function j(pathname, opts = {}) {
    const res = await fetch(`${BASE}${pathname}`, {
        ...opts,
        headers: { Origin: BASE, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    })
    let body = null
    try { body = await res.clone().json() } catch { /* html/text */ }
    return { res, body }
}

/* â•â• GATE 1 â€” FALSIFICATION PROBE (Red Phase) â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
gate('G1-Falsification')

// 1.1 Harness self-test: a request to a CLOSED port must be detected as failure.
await t('harness detects unreachable server (red-capability proof)', async () => {
    const deadPort = BASE.replace(/:\d+$/, ':59990')
    let threw = false
    try { await fetch(`${deadPort}/api/features`, { signal: AbortSignal.timeout(2500) }) } catch { threw = true }
    assert(threw, 'fetch to closed port unexpectedly succeeded â€” runner cannot detect failures')
})

// 1.2 Wrong credentials MUST NOT authenticate (negative twin of login contract).
await t('wrong password rejected 401, no session cookie', async () => {
    const { res, body } = await j('/api/method/login', {
        method: 'POST',
        body: JSON.stringify({ usr: ADMIN.email, pwd: 'definitely-wrong-pw' }),
    })
    eq(res.status, 401, 'status')
    assert(!(res.headers.get('set-cookie') || '').includes('user_id='), 'must not set user_id cookie')
    assert(body?.exc_type === 'AuthenticationError', 'expected AuthenticationError exc_type')
})

// 1.3 Unauthenticated get_user_info MUST be Guest-null, never a fabricated user.
await t('get_user_info without session returns null (no phantom user)', async () => {
    const { body } = await j('/api/method/lms.lms.api.get_user_info', { method: 'POST' })
    assert(body && 'message' in body, 'missing frappe envelope')
    eq(body.message, null, 'guest payload')
})

// 1.4 Tampered JWT MUST be rejected by native fractal cells.
await t('forged Bearer token rejected 401 on /api/v1/auth/me', async () => {
    const { res } = await j('/api/v1/auth/me', { headers: { Authorization: 'Bearer xx.yy.zz' } })
    eq(res.status, 401, 'status')
})

// 1.5 Unknown legacy method MUST be JSON 404, never silent HTML success.
await t('unknown /api/method returns JSON 404 (not HTML)', async () => {
    const { res, body } = await j('/api/method/lms.lms.api.does_not_exist', { method: 'POST' })
    eq(res.status, 404, 'status')
    assert(body?.error, 'must carry JSON error field')
})


// 1.6 Path traversal MUST stay inside the fractal-lms/ namespace.
await t('stream traversal cannot escape fractal-lms/ prefix', async () => {
    const res = await fetch(`${BASE}/api/v1/lms/courses/content/stream/../../secret.txt`, { redirect: 'manual' })
    const loc = res.headers.get('location') || ''
    if (res.status === 302) assert(loc.includes('/fractal-lms/'), `signed URL escaped prefix: ${loc}`)
    else assert([400, 403, 404].includes(res.status), `unexpected status ${res.status}`)
})

/* â•â• GATE 2 â€” AST & MODULE IMPORT INTEGRITY â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
gate('G2-AST-Integrity')

await t('every server/**/*.js parses under node --check (zero SyntaxError)', () => {
    const bad = []
    const walk = (d) => readdirSync(d, { withFileTypes: true }).forEach((e) => {
        const p = `${d}/${e.name}`
        if (e.isDirectory() && e.name !== 'node_modules') walk(p)
        else if (e.isFile() && e.name.endsWith('.js')) {
            try { execFileSync(process.execPath, ['--check', p], { stdio: 'pipe' }) }
            catch (err) { bad.push(`${p}: ${String(err.stderr).slice(0, 100)}`) }
        }
    })
    walk(`${ROOT}/server`)
    assert(bad.length === 0, `syntax errors â†’ ${bad.join(' | ')}`)
})

await t('manifests valid Â· unique ids/basePaths Â· routes exist on disk', () => {
    const seen = new Map()
    const walk = (d) => readdirSync(d, { withFileTypes: true }).forEach((e) => {
        const p = `${d}/${e.name}`
        if (!e.isDirectory()) return
        const mf = `${p}/feature.manifest.json`
        if (statSync(mf, { throwIfNoEntry: false })) {
            const m = JSON.parse(readFileSync(mf, 'utf8'))
            assert(m.id && m.basePath?.startsWith('/'), `bad manifest ${p}`)
            assert(!seen.has(m.id), `duplicate feature id "${m.id}"`)
            seen.set(m.id, m.basePath)
            if (m.routes) assert(statSync(`${p}/${m.routes.replace('./', '')}`, { throwIfNoEntry: false }), `routes file missing for ${m.id}`)
        }
        walk(p)
    })
    walk(`${ROOT}/server/features`)
    assert(seen.size >= 8, `expected â‰¥8 cells, found ${seen.size}`)
})

await t('dist/index.html references resolve to REAL files (no dangling hashes)', () => {
    const html = readFileSync(`${DIST}/index.html`, 'utf8')
    const refs = [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map((m) => m[1])
        .filter((u) => !u.startsWith('//'))
        .filter((u) => !u.startsWith('/api/')) // endpoints are contracts (Gate 3), not files
    assert(refs.length >= 10, `suspiciously few asset refs (${refs.length})`)
    const missing = refs.filter((u) => !statSync(`${DIST}${u.split('?')[0]}`, { throwIfNoEntry: false }))
    eq(missing.length, 0, `dangling refs â†’ ${missing.slice(0, 4).join(', ')}`)
})

await t('bundle hygiene: no :9000 dialer Â· socket stub embedded Â· zero Jinja', () => {
    const files = readdirSync(`${DIST}/assets`).filter((f) => f.startsWith('index-') && f.endsWith('.js'))
    eq(files.length, 1, 'index bundle count')
    const js = readFileSync(`${DIST}/assets/${files[0]}`, 'utf8')
    assert(!js.includes(':9000'), 'bench realtime port leaked into bundle')
    assert(js.includes('FRACTAL_SOCKET_URL'), 'frappe socket stub not embedded')
    const html = readFileSync(`${DIST}/index.html`, 'utf8')
    assert(!html.includes('{{'), 'Jinja placeholders survived build')
})

await t('kernel control plane reports every cell loaded', async () => {
    const { res, body } = await j('/api/features')
    eq(res.status, 200, 'status')
    assert(body.count >= 3, `only ${body.count} features registered`)
    body.features.forEach((f) => assert(f.loaded, `cell ${f.id} failed to load`))
})

/* â•â• GATE 3 â€” ZERO-MOCK HTTP & STORAGE CONTRACTS â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
gate('G3-ZeroMock-HTTP')
const RUN = Date.now().toString(36)
let adminCookie = ''

async function bearer() {
    const r = await j('/api/v1/auth/login', { method: 'POST', body: JSON.stringify(ADMIN) })
    return `Bearer ${r.body.token}`
}

await t('admin login sets user_id session cookie (real bcrypt path)', async () => {
    const res = await fetch(`${BASE}/api/method/login`, {
        method: 'POST',
        headers: { Origin: BASE, 'Content-Type': 'application/json' },
        body: JSON.stringify({ usr: ADMIN.email, pwd: ADMIN.password }),
    })
    eq(res.status, 200, 'status')
    const m = (res.headers.get('set-cookie') || '').match(/user_id=([^;]+)/)
    assert(m && m[1] !== 'Guest', 'user_id cookie missing')
    adminCookie = `user_id=${decodeURIComponent(m[1])}`
})

await t('get_user_info (cookie) carries full upstream contract', async () => {
    const res = await fetch(`${BASE}/api/method/lms.lms.api.get_user_info`, {
        method: 'POST', headers: { Origin: BASE, Cookie: adminCookie },
    })
    eq(res.status, 200, 'status')
    const u = (await res.json()).message
    for (const k of ['name', 'email', 'full_name', 'roles', 'is_instructor', 'is_system_manager', 'permissions', 'enrolled_courses']) {
        assert(k in u, `missing field ${k}`)
    }
    eq(u.is_system_manager, true, 'admin flag')
    assert(u.permissions['LMS Course']?.write === 1, 'admin must manage LMS Course')
})

await t('register â†’ legacy login round-trip persists a REAL student row', async () => {
    const email = `piet-${RUN}@test.local`
    const reg = await j('/api/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password: 'Piet!2345', first_name: 'Piet', last_name: RUN }),
    })
    eq(reg.res.status, 201, 'register status')
    assert(reg.body.token?.split('.').length === 3, 'JWT shape')
    const login = await j('/api/method/lms.lms.api.login', {
        method: 'POST', body: JSON.stringify({ usr: email, pwd: 'Piet!2345' }),
    })
    eq(login.res.status, 200, 'legacy login status')
})

await t('create course (admin) â†’ persisted & visible in public catalog', async () => {
    const cr = await j('/api/v1/lms/courses', {
        method: 'POST', headers: { Authorization: await bearer() },
        body: JSON.stringify({ title: `PIET Gate3 ${RUN}`, short_introduction: 'piet', published: true }),
    })
    eq(cr.res.status, 201, 'create status')
    const list = await j('/api/v1/lms/courses')
    assert(list.body.find((c) => c.name === cr.body.name), 'created course not in catalog')
})

await t('enroll + lesson complete recomputes progress to exactly 100', async () => {
    const det = await j('/api/v1/lms/courses/fractal-kernel-fundamentals')
    const stu = await j('/api/v1/auth/login', {
        method: 'POST', body: JSON.stringify({ email: 'smoke@test.com', password: 'Test1234' }),
    })
    const auth = { Authorization: `Bearer ${stu.body.token}` }
    await j('/api/v1/lms/courses/fractal-kernel-fundamentals/enroll', { method: 'POST', headers: auth })
    for (const ch of det.body.chapters) {
        for (const l of ch.lessons) {
            await j('/api/v1/lms/users/students/me/progress', {
                method: 'POST', headers: auth, body: JSON.stringify({ lesson_id: l.id, course_id: det.body.id }),
            })
        }
    }
    const dash = await j('/api/v1/lms/users/students/me/dashboard', { headers: auth })
    const row = dash.body.find((d) => d.name === 'fractal-kernel-fundamentals')
    assert(row && Number(row.progress) === 100, `progress=${row?.progress}`)
})

await t('quiz submit grades against DB truth â€” correct answer = 100%', async () => {
    const { execSync } = await import('node:child_process')
    const ids = JSON.parse(execSync(
        'node -e "require(\'dotenv\').config();const{Pool}=require(\'pg\');(async()=>{const p=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});const r=await p.query(\\"SELECT q.id quiz_id, qu.id question_id, o.id opt_id FROM quizzes q JOIN questions qu ON qu.quiz_id=q.id JOIN question_options o ON o.question_id=qu.id WHERE o.is_correct=true AND q.title=\'Fractal Basics\' LIMIT 1\\");console.log(JSON.stringify(r.rows[0]));await p.end()})()"',
        { cwd: ROOT, encoding: 'utf8' }
    ))
    const admin = await j('/api/v1/auth/login', { method: 'POST', body: JSON.stringify(ADMIN) })
    // RED twin first: a WRONG answer must NOT pass (proves grader is falsifiable)
    const wrong = await j(`/api/v1/lms/courses/quizzes/${ids.quiz_id}/submit`, {
        method: 'POST', headers: { Authorization: `Bearer ${admin.body.token}` },
        body: JSON.stringify({ answers: { [ids.question_id]: '00000000-0000-0000-0000-000000000000' } }),
    })
    eq(wrong.res.status, 201, 'status')
    eq(wrong.body.passed, false, 'wrong answer must not pass')

    const sub = await j(`/api/v1/lms/courses/quizzes/${ids.quiz_id}/submit`, {
        method: 'POST', headers: { Authorization: `Bearer ${admin.body.token}` },
        body: JSON.stringify({ answers: { [ids.question_id]: ids.opt_id } }),
    })
    eq(sub.res.status, 201, 'status')
    eq(sub.body.passed, true, 'passed')
})

await t('GCS stream returns 302 v4 signed URL under fractal-lms/ prefix', async () => {
    const res = await fetch(`${BASE}/api/v1/lms/courses/content/stream/demo/video.mp4`, { redirect: 'manual' })
    eq(res.status, 302, 'status')
    const loc = res.headers.get('location') || ''
    assert(loc.startsWith('https://storage.googleapis.com/'), 'not a GCS URL')
    assert(loc.includes('/fractal-lms/'), 'escaped the isolated prefix')
    assert(loc.includes('X-Goog-Algorithm'), 'missing v4 signature params')
})

/* â•â• GATE 4 â€” PHYSICAL LAYOUT & STATE INVARIANTS â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
gate('G4-Physical-Invariants')

await t('served index.html matches disk bundle hash (no stale twin drift)', async () => {
    const served = await fetch(`${BASE}/`).then((r) => r.text())
    const disk = readFileSync(`${DIST}/index.html`, 'utf8')
    const diskHash = disk.match(/index-[A-Za-z0-9_-]+\.js/)[0]
    assert(served.includes(diskHash), `server serves different bundle than dist (disk=${diskHash})`)
})

await t('branding fallback assets exist on disk AND are served 200', async () => {
    for (const f of ['/favicon.png', '/learning.svg']) {
        assert(statSync(`${DIST}${f}`, { throwIfNoEntry: false }), `${f} missing on disk`)
        eq((await fetch(`${BASE}${f}`)).status, 200, `GET ${f}`)
    }
})

await t('PWA artifacts served with correct MIME (manifestÂ·swÂ·registerSW)', async () => {
    const man = await j('/api/method/lms.lms.api.get_pwa_manifest')
    // Web App Manifest spec needs ROOT-level keys (browsers parse it directly),
    // unlike data APIs which use the frappe {message} envelope.
    const m = man.body?.message ?? man.body
    assert(m?.name === 'College LMS' || m?.name === 'Fractal LMS', `manifest name unexpected: ${m?.name}`)
    for (const f of ['/sw.js', '/registerSW.js']) {
        const r = await fetch(`${BASE}${f}`)
        eq(r.status, 200, `GET ${f}`)
        assert((r.headers.get('content-type') || '').includes('javascript'), `${f} wrong MIME`)
    }
})

await t('document head state: lang=en · viewport · manifest link wired', async () => {
    const html = await fetch(`${BASE}/`).then((r) => r.text())
    assert(html.includes('<html lang="en"'), 'html lang not static en')
    assert(html.includes('name="viewport"'), 'viewport meta missing')
    assert(html.includes('rel="manifest" href="/api/method/lms.lms.api.get_pwa_manifest"'), 'manifest link not wired')
})

await t('deep-link history fallback serves SPA shell on unknown route', async () => {
    const r = await fetch(`${BASE}/courses/piet-does-not-exist`)
    eq(r.status, 200, 'status')
    assert((await r.text()).includes('<div id="app">'), 'fallback did not serve SPA shell')
})

/* ══ GATE 5 — ROLE JOURNEYS (Login page · Tutor · Student) ══════════════════ */
gate('G5-RoleJourneys')

await t('GET /login serves standalone form · GET /signup serves signup', async () => {
    const login = await fetch(`${BASE}/login`).then((r) => r.text())
    assert(login.includes('<form id="f"') && login.includes('/api/method/login'), 'login form missing')
    const signup = await fetch(`${BASE}/signup`).then((r) => r.text())
    assert(signup.includes('/api/v1/auth/register'), 'signup form missing')
})

await t('STUDENT enrolls via frappe.client.insert (exact UI path)', async () => {
    const stu = await j('/api/method/login', {
        method: 'POST', body: JSON.stringify({ usr: 'smoke@test.com', pwd: 'Test1234' }),
    })
    const cookie = (stu.res.headers.get('set-cookie') || '').match(/user_id=([^;]+)/)
    assert(cookie, 'no session cookie')
    const ins = await j('/api/method/frappe.client.insert', {
        method: 'POST',
        headers: { Cookie: `user_id=${cookie[1]}` },
        body: JSON.stringify({ doc: { doctype: 'LMS Enrollment', course: 'fractal-kernel-fundamentals', member: 'smoke@test.com' } }),
    })
    eq(ins.res.status, 200, 'insert status')
    const mine = await j('/api/method/lms.lms.api.get_my_courses', {
        method: 'POST', headers: { Cookie: `user_id=${cookie[1]}` },
    })
    assert(Array.isArray(mine.body.message), 'my_courses not array')
    assert(mine.body.message.some((c) => c.name === 'fractal-kernel-fundamentals'), 'enrolled course missing from my_courses')
})

await t('TUTOR creates course via frappe.client.insert → slug returned', async () => {
    const admin = await j('/api/method/login', { method: 'POST', body: JSON.stringify(ADMIN) })
    const cookie = (admin.res.headers.get('set-cookie') || '').match(/user_id=([^;]+)/)[1]
    const ins = await j('/api/method/frappe.client.insert', {
        method: 'POST',
        headers: { Cookie: `user_id=${cookie}` },
        body: JSON.stringify({ doc: { doctype: 'LMS Course', title: `Tutor Journey ${RUN}`, short_introduction: 'piet', published: 1 } }),
    })
    eq(ins.res.status, 200, 'insert status')
    assert(/^tutor-journey-/.test(ins.body.message.name), `unexpected slug ${ins.body.message.name}`)
    const created = await j('/api/method/lms.lms.api.get_created_courses', {
        method: 'POST', headers: { Cookie: `user_id=${cookie}` },
    })
    assert(created.body.message.some((c) => c.name === ins.body.message.name), 'created course not listed for tutor')
})

// RED twin: a student must NOT be able to create courses
await t('RED: student course creation rejected 403 PermissionError', async () => {
    const stu = await j('/api/method/login', {
        method: 'POST', body: JSON.stringify({ usr: 'smoke@test.com', pwd: 'Test1234' }),
    })
    const cookie = (stu.res.headers.get('set-cookie') || '').match(/user_id=([^;]+)/)[1]
    const ins = await j('/api/method/frappe.client.insert', {
        method: 'POST',
        headers: { Cookie: `user_id=${cookie}` },
        body: JSON.stringify({ doc: { doctype: 'LMS Course', title: `Sneaky ${RUN}`, published: 1 } }),
    })
    eq(ins.res.status, 403, 'status')
    eq(ins.body.exc_type, 'PermissionError', 'exc_type')
})

await t('student get_created_courses also blocked 403 (role gate)', async () => {
    const stu = await j('/api/method/login', {
        method: 'POST', body: JSON.stringify({ usr: 'smoke@test.com', pwd: 'Test1234' }),
    })
    const cookie = (stu.res.headers.get('set-cookie') || '').match(/user_id=([^;]+)/)[1]
    const r = await j('/api/method/lms.lms.api.get_created_courses', { method: 'POST', headers: { Cookie: `user_id=${cookie}` } })
    eq(r.res.status, 403, 'status')
})

await t('streak info shape + search_users_by_role returns only staff', async () => {
    const admin = await j('/api/v1/auth/login', { method: 'POST', body: JSON.stringify(ADMIN) })
    const streak = await j('/api/method/lms.lms.api.get_streak_info', { headers: { Cookie: adminCookie } })
    assert('current_streak' in streak.body.message && 'longest_streak' in streak.body.message, 'streak keys missing')
    const hits = await j('/api/method/lms.lms.api.search_users_by_role', {
        method: 'POST', headers: { Authorization: `Bearer ${admin.body.token}` },
        body: JSON.stringify({ roles: JSON.stringify(['Course Creator']) }),
    })
    assert(hits.body.message.length >= 1, 'no staff returned')
    hits.body.message.forEach((u) => assert(!u.value.includes('smoke@test'), 'student leaked into staff search'))
    const count = await j('/api/method/frappe.client.get_count?doctype=Notification%20Log')
    eq(count.body.message, 0, 'notification count')
})

/* ══ GATE 6 — LEGACY DEEP JOURNEYS ════════════════════════════════════════ */
gate('G6-LegacyDeep')

await t('get_courses catalog returns published cards incl. demo course', async () => {
    const r = await j('/api/method/lms.lms.utils.get_courses?limit=100')
    assert(Array.isArray(r.body.message) && r.body.message.length >= 2, 'catalog too small')
    const demo = r.body.message.find((c) => c.name === 'fractal-kernel-fundamentals')
    assert(demo && Array.isArray(demo.instructors), 'demo card malformed')
})

await t('course_categories includes seeded category', async () => {
    const r = await j('/api/method/lms.lms.utils.get_course_categories')
    assert(r.body.message.some((c) => c.name === 'Engineering'), 'Engineering category missing')
})

await t('get_course_details full contract (chapters, lessons, membership)', async () => {
    const r = await j('/api/method/lms.lms.utils.get_course_details?course=fractal-kernel-fundamentals', { headers: { Cookie: adminCookie } })
    eq(r.res.status, 200, 'status')
    const d = r.body.message
    assert(d.chapters?.length >= 1 && d.chapters[0].lessons.length >= 1, 'outline missing')
    assert(Array.isArray(d.instructors) && Array.isArray(d.related_courses), 'instructors/related missing')
    eq(typeof d.is_instructor, 'boolean', 'is_instructor type')
})

await t('legacy save_progress persists + recomputes to 100 (exact UI endpoint)', async () => {
    const det = await j('/api/method/lms.lms.utils.get_course_details?course=fractal-kernel-fundamentals')
    const stu = await j('/api/method/login', { method: 'POST', body: JSON.stringify({ usr: 'smoke@test.com', pwd: 'Test1234' }) })
    const cookie = (stu.res.headers.get('set-cookie') || '').match(/user_id=([^;]+)/)[1]
    for (const ch of det.body.message.chapters) {
        for (const l of ch.lessons) {
            await fetch(`${BASE}/api/method/lms.lms.doctype.course_lesson.course_lesson.save_progress`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: `user_id=${cookie}` },
                body: JSON.stringify({ course: 'fractal-kernel-fundamentals', lesson: l.name }),
            })
        }
    }
    const mine = await j('/api/method/lms.lms.api.get_my_courses', { method: 'POST', headers: { Cookie: `user_id=${cookie}` } })
    const row = mine.body.message.find((c) => c.name === 'fractal-kernel-fundamentals')
    assert(row && Number(row.progress) === 100, `progress=${row?.progress}`)
})

// Teardown: Clean up temporary test courses and users created during run
try {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await pool.query("DELETE FROM courses WHERE name LIKE 'piet-gate3-%' OR name LIKE 'tutor-journey-%' OR title LIKE 'PIET Gate3 %' OR title LIKE 'Tutor Journey %' OR title = 'Should Fail'");
    await pool.query("DELETE FROM users WHERE email LIKE 'piet-%@test.local' OR email LIKE 'profile-test-%@example.com' OR email LIKE 'newmember-%@example.com'");
    await pool.end();
} catch (_) {}

const byGate = {}
for (const r of results) (byGate[r.gate] ||= []).push(r)
let failed = 0
console.log('\n╔════ PIET · Strict Non-Hallucinating Suite ════╗')
for (const g of Object.keys(byGate)) {
    const rows = byGate[g]
    console.log(`\nâ•‘ ${g}  ${rows.filter((r) => r.ok).length}/${rows.length}`)
    for (const r of rows) {
        if (r.ok) console.log(`â•‘   âœ… ${r.name}`)
        else { failed++; console.log(`â•‘   âŒ ${r.name}\nâ•‘      â†³ ${r.detail}`) }
    }
}
console.log(`\nâ•šâ•â• ${results.length - failed}/${results.length} passed Â· ${failed} FAILED â•â•â•\n`)
process.exit(failed ? 1 : 0)



