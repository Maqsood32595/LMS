# 🧬 Fractal LMS — Micro-Level Implementation Tracker

> **Mission:** Clone [`frappe/lms`](https://github.com/frappe/lms), keep its production-grade **Vue 3 UI intact**, strip the Python/Frappe Bench monolith, and re-platform onto the [Fractal Kernel](https://github.com/Maqsood32595/fractal-kernel) grandchild-cell architecture with **Supabase PostgreSQL** + **Google Cloud Storage** (`shortshub_video_storage`, isolated under `fractal-lms/`).
>
> Repo target: [`Maqsood32595/LMS.git`](https://github.com/Maqsood32595/LMS) · Branches: **`main`** (stable) + **`dev`** (integration).

---

## Phase 0 — Analysis & Decisions

- [x] Study Fractal Kernel (`kernel.js` discovery engine, manifest contract, AI_RULES.md)
- [x] Confirm kernel rule: *recursion stops at first manifest → parent owns children* (grandchild pattern = parent mounts child routers explicitly)
- [x] Study frappe/lms frontend stack: Vue 3 + Vite 5 + Pinia + frappe-ui + Tailwind, 35+ pages
- [x] Decision: **keep frappe/lms UI 100%**, convert only the data layer
- [x] Harvest infrastructure from `D:\Hayat\AITAG\.env` (read-only): GCS project/bucket/service-account, JWT secrets
- [x] URL-encode Supabase password (`Oraib@32595` → `Oraib%4032595`)
- [x] Scope guard: only `d:\Mujahid\LMS` modified — AITAG/Website folders untouched

## Phase 1 — Clone & Restructure

- [x] Fresh shallow clone of `frappe/lms` → `_upstream/lms` (1375 files)
- [x] Copy pristine `frontend/` to repo root (SPA preserved)
- [x] Ignore upstream/reference material (`_upstream/`, `frappe-lms-source/`, `frappe_src/`)
- [x] Root layout established: `frontend/` + `server/` (kernel, config, middleware, features/) + `database/`

## Phase 2 — Infrastructure Configuration

- [x] `.env` created (gitignored):
  - [x] Supabase via **Supavisor session pooler** (`aws-0-ap-southeast-2.pooler.supabase.com:5432`) — direct `db.*` host is IPv6-only and unreachable from Node on this network; region discovered by probing, password URL-encoded
  - [x] GCS: project `corded-cable-460921-u1`, bucket `shortshub_video_storage`
  - [x] `GCS_PREFIX=fractal-lms/` ← isolated folder for this app inside shared bucket
  - [x] Key resolution: `GOOGLE_CLOUD_KEY_FILE=D:/Website/shortshub-service-account.json` ✓ exists, with `GCS_KEY_BASE64` fallback for Render
  - [x] JWT secrets reused
- [x] `.env.example` committed (placeholders only)
- [x] `.gitignore`: secrets, node_modules, dist, reference dirs
- [x] Root `package.json`: scripts dev/dev:server/dev:frontend/build/start; deps incl. `pg`, `@google-cloud/storage`, `bcryptjs`, `jsonwebtoken`

## Phase 3 — Kernel & Grandchild Cells

- [x] `server/kernel.js` — verbatim immutable engine (syntax-verified via `node --check`)
- [x] `server/index.js` — boot + `/api/features` registry + CORS allowlist + static SPA of `frontend/dist` + history fallback
- [x] `server/middleware/auth.js` — `requireAuth`, `optionalAuth`, `requireRole`, `signToken`
- [x] `server/config/supabase.js` — pg Pool on DATABASE_URL (SSL), `query()`, `ping()`
- [x] `server/config/gcloud.js` — bucket client; every object forced under `fractal-lms/`; v4 signed URLs; key-file/base64 resolution

### Cell tree (7 cells, 3 levels)

- [x] **`features/auth`** (parent) → `/api/v1/auth`: register · login · logout · `GET /user` (=frappe get_user_info) · me/patch · health
- [x] **`features/lms`** (parent) → `/api/v1/lms`: manifest · routes mounting children · `GET /stats`
- [x] **`features/lms/users`** (child): directory + public profile
  - [x] **`users/students`** (grandchild): dashboard · progress map · mark-complete (auto % recompute) · students list
- [x] **`features/lms/courses`** (child): catalog filters · detail outline · create · enroll
  - [x] **`courses/quizzes`** (grandchild): fetch (answers hidden) · auto-grade submit · my-submissions
  - [x] **`courses/content`** (grandchild): lesson fetch · GCS signed stream (prefix-enforced) · instructor upload targets
- [x] **`features/lms/live`** (child): list classes · schedule · enrollment-gated join

## Phase 4 — Database DDL (Supabase)

- [x] `database/supabase_schema.sql` — idempotent DDL
  - [x] DocType map: User→users · LMS Course→courses · Course Chapter→chapters · Course Lesson→lessons · LMS Enrollment→enrollments · LMS Quiz→quizzes · LMS Question→questions · LMS Option→question_options · Quiz Submission/Result→quiz_submissions · Course Progress→course_progress · Batch→batches · Batch Enrollment→batch_enrollments · Live Class→live_classes · Certificate→certificates · Review→reviews
  - [x] FKs with ON DELETE CASCADE · unique constraints · hot-path indexes
  - [x] **Schema APPLIED to live Supabase** via `node server/scripts/apply-schema.js` → all 15 tables created; demo content via `server/scripts/seed-demo.js`; bootstrap admin via auth cell `boot.js`

## Phase 5 — Frontend Conversion (surgical)

- [x] `frontend/src/utils/api.js` — Fractal adapter: fetch client + JWT storage; maps get_user_info→/api/v1/auth/user, get_courses→/api/v1/lms/courses, quizzes, lessons, streams, dashboard
- [x] `frontend/vite.config.js` — frappeProxy:false · jinjaBootData:false · proxy `/api → :3000` · outDir dist
- [x] `frontend/src/socket.js` — removed missing sites config import; optional realtime stub
- [x] `frontend/package.json` — `build: "vite build"` (bench copy-html-entry removed)
- [ ] Rewire page data calls to adapter (mechanical):
  - [ ] stores/user.js session → getUserInfo()
  - [ ] Courses list/detail pages → getCourses()/getCourseDetails()
  - [ ] Lesson player → getLesson() + streamUrlFor() + markLessonComplete()
  - [ ] Quiz pages → getQuiz()/submitQuiz()
  - [ ] Live/batch components → getLiveClasses()
  - [ ] Login/signup dialogs → loginUser()/registerUser()

## Phase 6 — Verification (all passed against LIVE infrastructure)

- [x] npm install succeeds (232 packages incl. pg)
- [x] Kernel boots → discovers parent cells (`auth`, `lms`); children/grandchildren mounted by parents per fractal ownership rule
- [x] GET /api/features returns registry JSON
- [x] GET /api/v1/auth/health → `{ok:true, db:"up"}` — live Supabase round-trip
- [x] POST /register → student row + JWT · POST /login (admin via boot bootstrap) → JWT
- [x] POST /courses (admin) → course persisted; GET catalog lists published courses
- [x] POST /enroll → enrollment row · lesson complete → **dashboard progress=100.00%**
- [x] Quiz submit → **score 2/2, pct=100%, passed=true**, row persisted
- [x] GCS stream → **302 signed URL**: `storage.googleapis.com/shortshub_video_storage/fractal-lms/…`

## Phase 7 — Git Foundation & Push

- [x] Branching strategy: **main** (stable) + **dev** (integration); cell feature branches merge into dev; dev → main releases
- [x] git init → initial commit on main (`44989fa`, 651 files)
- [x] Create dev branch from main
- [x] Remote origin = https://github.com/Maqsood32595/LMS.git
- [x] Push main + dev ✓ (verified on remote)

## Phase 8 — Deploy (Render)

- [ ] Render Web Service: build `npm install && npm run build`, start `node server/index.js`
- [ ] Mirror env vars incl. GCS_KEY_BASE64
- [ ] Post-deploy smoke: /api/features · /api/v1/auth/health · SPA served same-origin

---

### Legacy API → Fractal Endpoint Map

| Legacy (frappe) | Fractal route | Status |
|---|---|---|
| `lms.lms.api.get_user_info` | `GET /api/v1/auth/user` | ✅ |
| login/session | `POST /api/v1/auth/login` (JWT) | ✅ |
| `get_courses` | `GET /api/v1/lms/courses` | ✅ |
| `get_course_details` | `GET /api/v1/lms/courses/:id` | ✅ |
| enroll | `POST /api/v1/lms/courses/:id/enroll` | ✅ |
| `get_quiz` | `GET …/courses/quizzes/:quizId` | ✅ |
| `submit_quiz` | `POST …/quizzes/:quizId/submit` | ✅ |
| `get_lesson` | `GET …/content/lesson/:lessonId` | ✅ |
| file/video streams | `GET …/content/stream/*` → signed GCS | ✅ |
| `mark_lesson_progress` | `POST /api/v1/lms/users/students/me/progress` | ✅ |
| Live Class | `GET/POST /api/v1/lms/live/classes` | ✅ |
| **Legacy `/api/method/*` shim (`frappe-compat` cell)** | | |
| `login` / `lms.lms.api.login` | POST — bcrypt check, sets `user_id` cookie the SPA session store reads | ✅ |
| `logout` | clears cookie | ✅ |
| `lms.lms.api.get_user_info` | full upstream payload (roles/permissions/enrolled_courses) from cookie session | ✅ |
| `lms.lms.api.get_lms_settings` | allowed-fields payload + `is_payments_app_installed` | ✅ |
| `lms.lms.api.get_branding` | `app_name` + image file-dicts | ✅ |
| `lms.lms.api.get_sidebar_settings` | visibility flags | ✅ |
| `lms.lms.api.get_translations` | `{}` dict | ✅ |
| `frappe.apps.get_apps` | `[]` | ✅ |
| `lms.lms.utils.get_programs` | `[]` | ✅ |
| `lms.lms.api.get_all_users` | user directory | ✅ |
| `lms.lms.api.get_pwa_manifest` | PWA manifest JSON | ✅ |
| any other method | explicit JSON 404 (+hint), never HTML | ✅ |

---

## Phase 9 — PIET Strict Non-Hallucinating Testing (`tests/piet/piet.mjs`)

> Per `D:\Hayat\workflows\persistent_in_ram_ephemeral_twin_specification.md`. Run: `npm run test:piet`. Exit 1 on any failure.

- [x] **Gate 1 — Falsification Probe (6/6)**: harness red-capability proof (closed-port detection) · wrong-pw → 401 no cookie · guest `get_user_info` = null (no phantom user) · forged JWT 401 · unknown legacy method JSON-404 · GCS path-traversal stays inside `fractal-lms/`
- [x] **Gate 2 — AST & Import Integrity (5/5)**: `node --check` over every server JS · manifest validity/uniqueness/routes-on-disk · every hashed ref in dist/index.html resolves to a real file · bundle hygiene (0×`:9000`, stub embedded, zero Jinja) · kernel control plane all cells loaded
- [x] **Gate 3 — Zero-Mock HTTP & Storage (7/7)**: real bcrypt login sets session cookie · full upstream user_info contract from cookie · register→legacy-login persists real row · admin course create → public catalog visibility · enroll+complete → progress exactly 100 · quiz graded against DB truth incl. RED twin (wrong answer must NOT pass) · GCS v4 signed URL 302 under prefix
- [x] **Gate 4 — Physical Layout & State (5/5)**: served HTML == disk bundle (no stale twin drift) · branding assets exist & served · PWA artifacts correct MIME (root-level manifest per W3C spec) · head state (lang=en, viewport, manifest wired) · deep-link SPA fallback
- [x] **Result: 23/23 passed · 0 FAILED** against live Supabase + live GCS
- [x] **Gate 5 — Role Journeys (6/6)**: `/login` & `/signup` standalone pages served by new `auth-pages` cell · student enrolls via `frappe.client.insert` (exact UI path) → appears in `get_my_courses` · tutor creates course via same endpoint → slug returned + listed in `get_created_courses` · RED: student course-creation rejected `403 PermissionError` · student `get_created_courses` blocked 403 · streak-info shape + `search_users_by_role` returns staff only · `frappe.client.get_count`
- [x] **Full suite: 29/29 · 0 FAILED**
- [x] New compat endpoints: `get_my_courses` · `get_created_courses` · `get_my_batches`/`get_created_batches` · `get_my_live_classes`/`get_admin_live_classes` · `get_admin_evals` · `get_streak_info` · `search_users_by_role` · `frappe.client.insert` (LMS Enrollment / LMS Course / LMS Category whitelist) · `frappe.client.get_count`

### PIET 4-Tier Promotion Pipeline (this repo)
| Stage | Environment | Trigger |
|---|---|---|
| 1 | In-RAM suite (`npm run test:piet`) | every change, before commit |
| 2 | Localhost `http://localhost:5010` | user browser verification |
| 3 | Staging — Render on **`dev`** branch | auto-deploy |
| 4 | Production — Render on **`main`** | fast-forward from dev, zero drift |

