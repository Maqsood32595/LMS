import { execSync } from 'node:child_process';

const suites = [
    { name: 'Discussions & Q&A Suite', file: 'tests/discussions.test.mjs' },
    { name: 'Batches & Cohorts Suite', file: 'tests/batches.test.mjs' },
    { name: 'Certifications Engine Suite', file: 'tests/certificates.test.mjs' },
    { name: 'Reviews & Live Classes Suite', file: 'tests/reviews_live.test.mjs' },
    { name: 'Assignments & Evaluations Suite', file: 'tests/assignments_evaluations.test.mjs' },
    { name: 'Coupons & Payment Gateways Suite', file: 'tests/coupons_payments.test.mjs' },
    { name: 'Member Management Suite', file: 'tests/member_management.test.mjs' },
    { name: 'Settings & RBAC Matrix Suite (225+ Assertions)', file: 'tests/settings_permutations.test.mjs' },
    { name: 'PDF Courses & Incremental Progress Suite', file: 'tests/pdf_courses.test.mjs' },
    { name: 'PIET Strict 33-Gate Falsification Suite', file: 'tests/piet/piet.mjs' },
];

console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
console.log('║   FRACTAL LMS — MASTER 500+ ASSERTION IN-RAM VERIFICATION SUITE           ║');
console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

(async () => {
    let failed = 0;
    const start = Date.now();
    for (const s of suites) {
        try {
            console.log(`▶ Running ${s.name} (${s.file})...`);
            execSync(`node ${s.file}`, { stdio: 'inherit' });
            console.log(`✅ [PASS] ${s.name}\n`);
            await new Promise((r) => setTimeout(r, 200));
        } catch (e) {
            console.error(`❌ [FAIL] ${s.name}\n`);
            failed++;
        }
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    if (failed > 0) {
        console.error(`\n🚨 ${failed} test suite(s) failed after ${elapsed}s.`);
        process.exit(1);
    } else {
        console.log(`🎉 ALL 10 TEST SUITES PASSED (525+ ASSERTIONS 100% GREEN IN RAM IN ${elapsed}s)!`);
        process.exit(0);
    }
})();
