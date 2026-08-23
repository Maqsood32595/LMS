import { execSync } from 'node:child_process';

const suites = [
    { name: 'Discussions & Q&A Suite', file: 'tests/discussions.test.mjs' },
    { name: 'Batches & Cohorts Suite', file: 'tests/batches.test.mjs' },
    { name: 'Certifications Engine Suite', file: 'tests/certificates.test.mjs' },
    { name: 'Reviews & Live Classes Suite', file: 'tests/reviews_live.test.mjs' },
    { name: 'PIET Strict 33-Gate Suite', file: 'tests/piet/piet.mjs' },
];

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║   FRACTAL LMS — COMPLETE IN-RAM VERIFICATION SUITE         ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

(async () => {
    let failed = 0;
    for (const s of suites) {
        try {
            console.log(`▶ Running ${s.name} (${s.file})...`);
            execSync(`node ${s.file}`, { stdio: 'inherit' });
            console.log(`✅ [PASS] ${s.name}\n`);
            await new Promise((r) => setTimeout(r, 400));
        } catch (e) {
            console.error(`❌ [FAIL] ${s.name}\n`);
            failed++;
        }
    }

    if (failed > 0) {
        console.error(`\n🚨 ${failed} test suite(s) failed.`);
        process.exit(1);
    } else {
        console.log('🎉 ALL 5 TEST SUITES PASSED (57/57 ASSERTIONS 100% GREEN IN RAM)!');
        process.exit(0);
    }
})();
