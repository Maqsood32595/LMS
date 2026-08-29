-- ============================================================================
-- Fractal LMS — Supabase PostgreSQL Schema
-- Maps core frappe/lms DocTypes → clean relational tables.
-- Apply via: Supabase Dashboard → SQL Editor (or psql "$DATABASE_URL")
-- ============================================================================

-- ── users (Frappe User) ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email            TEXT UNIQUE NOT NULL,
    password_hash    TEXT NOT NULL,
    first_name       TEXT DEFAULT '',
    last_name        TEXT DEFAULT '',
    role             TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','instructor','admin')),
    avatar_url       TEXT,
    cover_image_url  TEXT,
    bio              TEXT,
    headline         TEXT,
    linkedin         TEXT DEFAULT '',
    github           TEXT DEFAULT '',
    twitter          TEXT DEFAULT '',
    language         TEXT DEFAULT 'en',
    open_to          TEXT DEFAULT '',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── courses (LMS Course) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courses (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name               TEXT UNIQUE NOT NULL,          -- slug
    title              TEXT NOT NULL,
    short_introduction TEXT DEFAULT '',
    description        TEXT DEFAULT '',
    image              TEXT,
    video_link         TEXT,
    category           TEXT,
    published          BOOLEAN NOT NULL DEFAULT false,
    featured           BOOLEAN NOT NULL DEFAULT false,
    enable_certification BOOLEAN NOT NULL DEFAULT false,
    max_students       INT,
    instructors        JSONB DEFAULT '[]'::jsonb,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_courses_category ON courses(category);
CREATE INDEX IF NOT EXISTS idx_courses_published ON courses(published);

-- ── chapters (Course Chapter) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chapters (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title     TEXT NOT NULL,
    idx       INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_chapters_course ON chapters(course_id);

-- ── lessons (Course Lesson) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lessons (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chapter_id         UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    title              TEXT NOT NULL,
    body               TEXT DEFAULT '',               -- rich text / markdown
    content_type       TEXT NOT NULL DEFAULT 'Text'
                       CHECK (content_type IN ('Video','PDF','HTML','Text','Quiz','Assignment')),
    youtube            TEXT,                          -- youtube video id/url
    file               TEXT,                          -- GCS object path under fractal-lms/ or external URL
    quiz_id            UUID,                          -- FK added after quizzes table
    duration           TEXT,
    include_in_preview BOOLEAN NOT NULL DEFAULT false,
    idx                INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_lessons_chapter ON lessons(chapter_id);

-- ── enrollments (LMS Enrollment) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enrollments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id   UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    progress    NUMERIC(5,2) NOT NULL DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'In Progress',
    enrolled_on TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (member_id, course_id)
);
CREATE INDEX IF NOT EXISTS idx_enrollments_member ON enrollments(member_id);

-- ── quizzes (LMS Quiz) ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quizzes (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title              TEXT NOT NULL,
    passing_percentage NUMERIC(5,2) NOT NULL DEFAULT 50,
    total_marks        NUMERIC(6,2) NOT NULL DEFAULT 0,
    duration_minutes   INT,
    show_answers       BOOLEAN NOT NULL DEFAULT true,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE lessons
    DROP CONSTRAINT IF EXISTS fk_lessons_quiz;
ALTER TABLE lessons
    ADD CONSTRAINT fk_lessons_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE SET NULL;

-- ── questions (LMS Question) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS questions (
    id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id  UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    type     TEXT NOT NULL DEFAULT 'Choices' CHECK (type IN ('Choices','Multiple Choice','Input','Checkboxes')),
    marks    NUMERIC(5,2) NOT NULL DEFAULT 1,
    idx      INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_questions_quiz ON questions(quiz_id);

-- ── question_options (LMS Option) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS question_options (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    option      TEXT NOT NULL,
    is_correct  BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_options_question ON question_options(question_id);

-- ── quiz_submissions (LMS Quiz Submission + LMS Quiz Result) ───────────────
CREATE TABLE IF NOT EXISTS quiz_submissions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id    UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    member_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score      NUMERIC(6,2) NOT NULL DEFAULT 0,
    percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
    passed     BOOLEAN NOT NULL DEFAULT false,
    submission JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quiz_sub_member ON quiz_submissions(member_id);

-- ── course_progress (LMS Course Progress) — per-lesson completion ──────────
CREATE TABLE IF NOT EXISTS course_progress (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id    UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    course_id    UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (member_id, lesson_id)
);
CREATE INDEX IF NOT EXISTS idx_progress_member_course ON course_progress(member_id, course_id);

-- ── batches (LMS Batch) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS batches (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT UNIQUE NOT NULL,
    title       TEXT NOT NULL,
    description TEXT DEFAULT '',
    start_date  DATE,
    end_date    DATE,
    seats       INT,
    published   BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS batch_enrollments (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id  UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (batch_id, member_id)
);

-- ── live_classes (LMS Live Class) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS live_classes (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title            TEXT NOT NULL,
    course_id        UUID REFERENCES courses(id) ON DELETE CASCADE,
    batch_id         UUID REFERENCES batches(id) ON DELETE CASCADE,
    host_id          UUID REFERENCES users(id),
    start_time       TIMESTAMPTZ NOT NULL,
    duration_minutes INT NOT NULL DEFAULT 60,
    platform         TEXT NOT NULL DEFAULT 'Google Meet',
    meet_link        TEXT,
    join_token       TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── certificates (LMS Certificate) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS certificates (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id      UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    certificate_id TEXT UNIQUE NOT NULL DEFAULT ('CERT-' || upper(substring(gen_random_uuid()::text, 1, 8))),
    issued_on      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (member_id, course_id)
);

-- ── discussions (LMS Discussion Topic & Reply) ───────────────────────────
CREATE TABLE IF NOT EXISTS discussions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id  UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    lesson_id  UUID REFERENCES lessons(id) ON DELETE CASCADE,
    member_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT,
    content    TEXT NOT NULL,
    parent_id  UUID REFERENCES discussions(id) ON DELETE CASCADE,
    pinned     BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_discussions_course ON discussions(course_id);
CREATE INDEX IF NOT EXISTS idx_discussions_lesson ON discussions(lesson_id);
CREATE INDEX IF NOT EXISTS idx_discussions_parent ON discussions(parent_id);
CREATE INDEX IF NOT EXISTS idx_discussions_member ON discussions(member_id);

-- ── reviews (LMS Course Review) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id  UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    rating     INT CHECK (rating BETWEEN 1 AND 5),
    review     TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (member_id, course_id)
);
