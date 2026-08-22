const db = require('../../../../config/supabase');

// Quiz with questions and options; correct answers stripped unless show_answers
async function getQuiz(quizId) {
    const quizzes = await db.query('SELECT * FROM quizzes WHERE id::text=$1 LIMIT 1', [quizId]);
    const quiz = quizzes[0];
    if (!quiz) throw Object.assign(new Error('Quiz not found'), { status: 404 });

    const questions = await db.query(
        `SELECT q.id, q.question, q.type, q.marks FROM questions q WHERE q.quiz_id=$1 ORDER BY q.idx`,
        [quiz.id]
    );
    for (const q of questions) {
        let opts = await db.query('SELECT id, option FROM question_options WHERE question_id=$1', [q.id]);
        if (quiz.show_answers) {
            opts = await db.query('SELECT id, option, is_correct FROM question_options WHERE question_id=$1', [q.id]);
        }
        q.options = opts;
    }
    return { ...quiz, questions };
}

// Grade submission and persist quiz_submissions + score
async function submitQuiz(userId, quizId, { answers = {} } = {}) {
    const quizzes = await db.query('SELECT * FROM quizzes WHERE id::text=$1 LIMIT 1', [quizId]);
    const quiz = quizzes[0];
    if (!quiz) throw Object.assign(new Error('Quiz not found'), { status: 404 });

    const questions = await db.query(
        `SELECT q.id, q.marks FROM questions q WHERE q.quiz_id=$1`, [quiz.id]
    );

    let totalMarks = 0, scored = 0;
    for (const q of questions) {
        totalMarks += q.marks || 1;
        const chosen = answers[q.id];
        if (!chosen) continue;
        const rows = await db.query(
            'SELECT is_correct FROM question_options WHERE question_id=$1 AND id::text=$2',
            [q.id, String(chosen)]
        );
        if (rows[0]?.is_correct) scored += q.marks || 1;
    }

    const percentage = totalMarks ? Math.round((scored / totalMarks) * 100) : 0;
    const passed = percentage >= (quiz.passing_percentage || 0);

    const saved = await db.query(
        `INSERT INTO quiz_submissions (quiz_id, member_id, score, percentage, passed, submission)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [quiz.id, userId, scored, percentage, passed, JSON.stringify(answers)]
    );
    return {
        submission: saved[0],
        score: scored,
        total_marks: totalMarks,
        percentage,
        passed,
        passing_percentage: quiz.passing_percentage,
    };
}

async function mySubmissions(userId, quizId) {
    return db.query(
        'SELECT * FROM quiz_submissions WHERE member_id=$1 AND quiz_id=(SELECT id FROM quizzes WHERE id::text=$2) ORDER BY created_at DESC',
        [userId, quizId]
    );
}

module.exports = { getQuiz, submitQuiz, mySubmissions };
