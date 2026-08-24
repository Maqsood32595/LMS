# Fractal LMS — Agentic Development Rules

This file is read automatically by the AI agent at the start of every conversation.
These rules are STRICT and NON-NEGOTIABLE. Follow them exactly, every time.

---

## THE GOLDEN WORKFLOW — ALWAYS FOLLOW THIS ORDER

Every feature, bug fix, or change MUST pass through these gates in strict sequence.
Never skip a gate. Never reverse the order. Never assume approval.

```
GATE 1: ANALYSE
  - Agent reads code, identifies root cause, explains plan
  - User reviews plan, asks questions
  - Agent WAITS for explicit "go ahead"

GATE 2: IN-RAM (if possible)
  - Agent writes test in d:\Mujahid\LMS2\tests\ (OUTSIDE git repo)
  - Agent runs test against live local server (port 5010)
  - Test must pass 100% green before proceeding
  - User is shown test output

GATE 3: LOCAL
  - Agent makes code changes to d:\Mujahid\LMS\
  - Agent runs npm test (57-assertion suite) — must stay 100% green
  - Agent tells user "ready to test locally"
  - User tests at http://localhost:5010
  - User says "working" before next gate

GATE 4: DEV BRANCH
  - Agent runs: git add <files>; git commit -m "..."; git push origin dev
  - NEVER push to main at this gate
  - Agent confirms Render dev deployment triggered
  - User tests at https://fractal-lms-dev.onrender.com
  - User says "working, push to main" before next gate

GATE 5: MAIN (PRODUCTION)
  - Only after explicit user message: "merge to main" / "push to main" / "promote to main"
  - Agent runs: git checkout main; git merge dev; git push origin main; git checkout dev
  - Agent confirms production deployment triggered
```

---

## ABSOLUTE PROHIBITIONS

1. NEVER push to main without the user explicitly saying so. Not "it's working", not "looks good" — must say "merge to main" or "push to main".
2. NEVER start editing code without explaining the plan first (for non-trivial changes).
3. NEVER skip the in-RAM test phase when an external test can be written.
4. NEVER run git push origin main from within a plan or analysis phase.
5. NEVER commit files from d:\Mujahid\LMS2\ — that folder is OUTSIDE the git repo by design.
6. NEVER touch dev or main during local debugging. Local is local.

---

## BEFORE EVERY TASK

Ask yourself these questions before touching any code:
- Have I read and understood the relevant source files?
- Have I explained what root cause I found and what I plan to change?
- Has the user said "go ahead" / "yes" / "do it"?
- Can I write an in-RAM test for this first?
- Will my change break the 57-assertion test suite?

---

## IN-RAM TEST RULES

- All external tests live in: d:\Mujahid\LMS2\tests\
- Tests are .mjs files (ESM), no framework needed — pure Node 22 fetch + assert
- Tests MUST follow this exact lifecycle — no exceptions:
    1. SETUP   — insert/create only what is needed for the test
    2. ACT     — call the API endpoint being tested
    3. ASSERT  — verify the response
    4. TEARDOWN (in a finally block) — DELETE every record created during the test
- TEARDOWN IS MANDATORY. Even if the test crashes, the finally block must run cleanup SQL.
- Never leave ghost records in the DB. Ghost records appear in the live UI and confuse the user.
- Tests run against the local server at http://localhost:5010
- Use DATABASE_URL from .env for cleanup queries
- Use pg from d:/Mujahid/LMS/node_modules/ via file:/// ESM import
- Never commit these test files to git

### Teardown Template (copy into every new test)
```js
const { Client } = await import('file:///d:/Mujahid/LMS/node_modules/pg/lib/index.js');
const pgClient = new Client({ connectionString: process.env.DATABASE_URL });
await pgClient.connect();
try {
  // ... setup, act, assert ...
} finally {
  // ALWAYS runs — cleans up even if test throws
  await pgClient.query('DELETE FROM <table> WHERE <test_identifier_column> = $1', [testId]);
  await pgClient.end();
}
```

---

## BRANCH DISCIPLINE

| Branch | Purpose                                          | Who Pushes                          |
|--------|--------------------------------------------------|-------------------------------------|
| dev    | Staging — agent pushes after local verification  | Agent (with user approval)          |
| main   | Production — ONLY after user confirms dev works  | Agent (explicit "merge to main" only) |

Always return to dev branch after any main merge.

---

## FOLDER MAP

| Path                      | Purpose                                         | In Git?    |
|---------------------------|-------------------------------------------------|------------|
| d:\Mujahid\LMS\           | Main application codebase                       | Yes        |
| d:\Mujahid\LMS\tests\     | Official in-repo test suite (npm test)          | Yes        |
| d:\Mujahid\LMS2\tests\    | External in-RAM tests (profile, media, etc.)    | Never      |
| d:\Mujahid\LMS2\docs\     | Architecture docs saved outside repo            | Never      |

---

## STANDARD COMMIT FORMAT

```
<type>(<scope>): <short description>

Types: feat, fix, refactor, test, docs, chore
Examples:
  fix(profile): enable User doctype in clientSetValue, deduplicate SQL columns
  feat(media): universal /files/* proxy, descriptive GCS folder structure, 500MB upload limit
```

---

## REGRESSION GATE

Before every git push, run:
```
npm test
```
Must show 57 of 57 assertions green in RAM.
If any test fails, stop and fix before pushing.

---

## COMMUNICATION STYLE

- For analysis: explain clearly what the root cause is, what files are affected, what the plan is
- For plans: list the exact files that will change and why
- For test results: always show the full pass/fail output
- NEVER summarise what an artifact already shows — just point to it
- Ask for clarification rather than guessing intent
