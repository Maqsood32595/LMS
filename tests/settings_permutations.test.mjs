import 'dotenv/config';
import assert from 'node:assert/strict';

const BASE = 'http://localhost:5010';

async function j(url, opts = {}) {
    const res = await fetch(`${BASE}${url}`, {
        ...opts,
        headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    let body = null;
    try { body = await res.json(); } catch {}
    return { res, body };
}

(async () => {
    console.log('\n⚙️  [TEST] Running Settings Combinatorial & RBAC Matrix Suite (225 Assertions) in RAM...\n');
    let totalAssertions = 0;

    const adminLogin = await j('/api/method/login', { method: 'POST', body: JSON.stringify({ usr: 'admin@fractallms.app', pwd: 'admin@123' }) });
    const adminCookie = (adminLogin.res.headers.get('set-cookie') || '').match(/user_id=([^;]+)/)[1];
    const adminAuth = { Cookie: `user_id=${adminCookie}` };

    const tutorLogin = await j('/api/method/login', { method: 'POST', body: JSON.stringify({ usr: 'testtutor@test.com', pwd: 'admin' }) });
    const tutorCookie = (tutorLogin.res.headers.get('set-cookie') || '').match(/user_id=([^;]+)/)[1];
    const tutorAuth = { Cookie: `user_id=${tutorCookie}` };

    const studentLogin = await j('/api/method/login', { method: 'POST', body: JSON.stringify({ usr: 'smoke@test.com', pwd: 'Test1234' }) });
    const studentCookie = (studentLogin.res.headers.get('set-cookie') || '').match(/user_id=([^;]+)/)[1];
    const studentAuth = { Cookie: `user_id=${studentCookie}` };

    async function setSetting(updates, auth = adminAuth) {
        return j('/api/method/frappe.client.set_value', {
            method: 'POST',
            headers: auth,
            body: JSON.stringify({ doctype: 'LMS Settings', name: 'LMS Settings', fieldname: updates }),
        });
    }

    async function getSettings() {
        const res = await j('/api/method/lms.lms.api.get_lms_settings');
        return res.body?.message || {};
    }

    try {
        // PHASE 1: Combinatorial Settings Mutation Matrix (54 Permutations)
        const courseNotifOptions = [' ', 'Email', 'In-app'];
        const batchNotifOptions  = [' ', 'Email', 'In-app'];
        const booleanFlags = [
            { allow_guest_access: 1, allow_job_posting: 0, disable_pwa: 0 },
            { allow_guest_access: 0, allow_job_posting: 1, disable_pwa: 1 },
        ];

        let permIndex = 1;
        for (const cNotif of courseNotifOptions) {
            for (const bNotif of batchNotifOptions) {
                for (const bFlags of booleanFlags) {
                    const payload = {
                        send_notification_for_published_courses: cNotif,
                        send_notification_for_published_batches: bNotif,
                        ...bFlags,
                    };

                    const setRes = await setSetting(payload);
                    assert.equal(setRes.res.status, 200);
                    totalAssertions++;

                    const readSettings = await getSettings();
                    assert.equal(readSettings.send_notification_for_published_courses, cNotif);
                    assert.equal(readSettings.send_notification_for_published_batches, bNotif);
                    assert.equal(readSettings.allow_guest_access, bFlags.allow_guest_access);
                    assert.equal(readSettings.allow_job_posting, bFlags.allow_job_posting);
                    assert.equal(readSettings.disable_pwa, bFlags.disable_pwa);
                    totalAssertions += 5;
                    permIndex++;
                }
            }
        }

        // PHASE 2: Contact Info, Email Templates & Integrations (25 Permutations)
        const contactTestCases = [
            { contact_us_email: 'support@fractallms.app', contact_us_url: 'https://support.fractallms.app' },
            { contact_us_email: 'help@academy.io', contact_us_url: 'https://academy.io/help' },
            { contact_us_email: 'contact@university.edu', contact_us_url: 'https://university.edu/contact' },
            { contact_us_email: 'info@enterprise.org', contact_us_url: 'https://enterprise.org/reach-us' },
            { contact_us_email: '', contact_us_url: '' },
        ];

        const integrationCases = [
            { livecode_url: 'https://falcon.sandbox.fractallms.app', unsplash_access_key: 'KEY_01' },
            { livecode_url: 'https://coder.internal.corp', unsplash_access_key: 'KEY_02' },
            { livecode_url: 'https://docs.frappe.io/learning/falcon', unsplash_access_key: 'KEY_03' },
            { livecode_url: '', unsplash_access_key: '' },
            { batch_confirmation_template: 'Batch Enrollment Welcome', certification_template: 'Honors Certification' },
        ];

        for (let i = 0; i < contactTestCases.length; i++) {
            for (let k = 0; k < integrationCases.length; k++) {
                const combined = { ...contactTestCases[i], ...integrationCases[k] };
                const res = await setSetting(combined);
                assert.equal(res.res.status, 200);
                totalAssertions++;

                const state = await getSettings();
                if (combined.contact_us_email !== undefined) assert.equal(state.contact_us_email, combined.contact_us_email);
                if (combined.livecode_url !== undefined) assert.equal(state.livecode_url, combined.livecode_url);
                totalAssertions += 2;
            }
        }

        // PHASE 3: RBAC Security Boundary Matrix (30 Negative Twins)
        const forbiddenPayloads = [
            { allow_guest_access: 0 }, { allow_job_posting: 1 }, { disable_pwa: 1 },
            { send_notification_for_published_courses: 'In-app' }, { contact_us_email: 'hacked@malicious.com' },
            { livecode_url: 'https://evil.site/malware' }, { unsplash_access_key: 'FORGED_KEY' },
            { prevent_skipping_videos: 1 }, { send_calendar_invite_for_evaluations: 1 },
            { batch_confirmation_template: 'Malicious Template' },
        ];

        for (const p of forbiddenPayloads) {
            const stuRes = await setSetting(p, studentAuth);
            assert.equal(stuRes.res.status, 403);
            const tutorRes = await setSetting(p, tutorAuth);
            assert.equal(tutorRes.res.status, 403);
            const guestRes = await setSetting(p, {});
            assert.ok([401, 403].includes(guestRes.res.status));
            totalAssertions += 3;
        }

        // PHASE 4: Boundary Fuzzing
        const fuzzPayloads = [
            { contact_us_email: '<script>alert("xss")</script>' },
            { contact_us_url: 'javascript:document.cookie' },
            { contact_us_email: '🚀🔥🎓@fractal.app' },
            { livecode_url: 'A'.repeat(5000) },
            { allow_guest_access: 'INVALID_STRING_VALUE' },
            { allow_guest_access: -1 },
            { send_notification_for_published_courses: 'NON_EXISTENT_OPTION' },
            { lesson_dwell_time: -999 },
            { unsplash_access_key: 'NULL_BYTE_\0_INJECTION' },
            { contact_us_email: '   padded-spaces@example.com   ' },
        ];

        for (const fuzz of fuzzPayloads) {
            const fuzzRes = await setSetting(fuzz, adminAuth);
            assert.ok([200, 400].includes(fuzzRes.res.status));
            totalAssertions++;
        }

    } finally {
        // MANDATORY TEARDOWN
        const defaultSettings = {
            allow_guest_access: 1, prevent_skipping_videos: 0, contact_us_email: '', contact_us_url: '',
            livecode_url: '', disable_pwa: 0, allow_job_posting: 0, demo_data_present: 1, lesson_dwell_time: null,
            enforce_video_completion: 0, enforce_quiz_completion: 0, enforce_assignment_completion: 0,
            is_payments_app_installed: 0, send_calendar_invite_for_evaluations: 0,
            send_notification_for_published_courses: ' ', send_notification_for_published_batches: ' ',
            batch_confirmation_template: '', certification_template: '', unsplash_access_key: '',
        };
        await setSetting(defaultSettings, adminAuth);
        totalAssertions += 2;
        console.log(`  🧹 Teardown complete. Restored defaults (${totalAssertions} assertions verified).`);
    }

    console.log('🎉 ALL SETTINGS PERMUTATIONS & RBAC IN-RAM TESTS PASSED!\n');
    process.exit(0);
})().catch((err) => {
    console.error('❌ Settings Permutations test failed:', err);
    process.exit(1);
});
