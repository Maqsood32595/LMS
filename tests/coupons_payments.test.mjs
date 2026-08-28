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
    console.log('\n💳 [TEST] Running Coupons, Pricing & Payment Gateways Suite in RAM...\n');

    const tutorLogin = await j('/api/method/login', {
        method: 'POST',
        body: JSON.stringify({ usr: 'testtutor@test.com', pwd: 'admin' }),
    });
    const tutorCookie = (tutorLogin.res.headers.get('set-cookie') || '').match(/user_id=([^;]+)/)[1];
    const tutorAuth = { Cookie: `user_id=${tutorCookie}` };

    const studentLogin = await j('/api/method/login', { method: 'POST', body: JSON.stringify({ usr: 'smoke@test.com', pwd: 'Test1234' }) });
    const studentCookie = (studentLogin.res.headers.get('set-cookie') || '').match(/user_id=([^;]+)/)[1];
    const studentAuth = { Cookie: `user_id=${studentCookie}` };

    const RUN = Date.now().toString(36);
    const couponCode = `PROD${RUN.toUpperCase()}`;

    const { default: pg } = await import('file:///d:/Mujahid/LMS/node_modules/pg/lib/index.js');
    const pgClient = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await pgClient.connect();

    try {
        // 1. Instructor creates Coupon (50% OFF)
        const createCoupon = await j('/api/method/frappe.client.insert', {
            method: 'POST',
            headers: tutorAuth,
            body: JSON.stringify({
                doc: {
                    doctype: 'LMS Coupon',
                    code: couponCode,
                    discount_percentage: 50,
                    max_uses: 100,
                },
            }),
        });
        assert.equal(createCoupon.res.status, 200, 'Create coupon status 200');
        assert.equal(createCoupon.body?.message?.code, couponCode, 'Coupon code matches');
        console.log('  ✅ 1. Instructor created 50% discount coupon:', couponCode);

        // 2. Verify coupon in frappe.client.get_list
        const couponList = await j('/api/method/frappe.client.get_list', {
            method: 'POST',
            headers: tutorAuth,
            body: JSON.stringify({ doctype: 'LMS Coupon' }),
        });
        assert.equal(couponList.res.status, 200, 'Coupon list status 200');
        assert.ok(couponList.body?.message?.some((c) => c.code === couponCode || c.name === couponCode), 'Coupon in list');
        console.log('  ✅ 2. Verified coupon listed in frappe.client.get_list');

        // 3. Verify coupon calculation via get_order_summary
        const orderSummary = await j(`/api/method/lms.lms.utils.get_order_summary?course=fractal-kernel-fundamentals&coupon_code=${couponCode}`, {
            headers: studentAuth,
        });
        assert.equal(orderSummary.res.status, 200, 'Order summary status 200');
        const summary = orderSummary.body?.message;
        assert.equal(summary?.base_price, 49.00, 'Base price 49.00');
        assert.equal(summary?.discount_percentage, 50, '50% discount applied');
        assert.equal(summary?.discount_amount, 24.50, 'Discount amount 24.50');
        assert.equal(summary?.final_price, 24.50, 'Final price 24.50');
        console.log('  ✅ 3. Order Summary correctly computed 50% discount ($49.00 -> $24.50)');

        // 4. Verify Payment Link Generation
        const payLink = await j('/api/method/lms.lms.payments.get_payment_link?course=fractal-kernel-fundamentals&gateway=stripe', {
            headers: studentAuth,
        });
        assert.equal(payLink.res.status, 200, 'Payment link status 200');
        assert.ok(payLink.body?.message?.payment_url?.includes('/checkout/pay'), 'Payment URL generated');
        console.log('  ✅ 4. Generated verified checkout link:', payLink.body?.message?.payment_url);

    } finally {
        // MANDATORY TEARDOWN
        await pgClient.query('DELETE FROM coupons WHERE code = $1', [couponCode]);
        await pgClient.end();
        console.log('  🧹 Teardown complete. Cleaned coupon records.');
    }

    console.log('🎉 ALL COUPONS & PAYMENTS IN-RAM TESTS PASSED!\n');
    process.exit(0);
})().catch((err) => {
    console.error('❌ Coupons & Payments test failed:', err);
    process.exit(1);
});
