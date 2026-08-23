import assert from 'node:assert/strict';

const BASE = 'http://localhost:5010';

async function j(url, opts = {}) {
    const res = await fetch(`${BASE}${url}`, {
        ...opts,
        headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    const body = await res.json().catch(() => null);
    return { res, body };
}

(async () => {
    console.log('\n🧵 [TEST] Running Discussions Grandchild Test Suite in RAM...\n');

    // 1. Authenticate user
    const login = await j('/api/method/login', {
        method: 'POST',
        body: JSON.stringify({ usr: 'admin@fractallms.app', pwd: 'admin@123' }),
    });
    assert.equal(login.res.status, 200, 'Login failed');
    const cookie = (login.res.headers.get('set-cookie') || '').match(/user_id=([^;]+)/)[1];
    const authHeader = { Cookie: `user_id=${cookie}` };

    // 2. Create discussion topic on course
    const title = `Discussion Thread ${Date.now().toString(36)}`;
    const topicRes = await j('/api/method/frappe.client.insert', {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({
            doc: {
                doctype: 'Discussion Topic',
                reference_doctype: 'LMS Course',
                reference_docname: 'fractal-kernel-fundamentals',
                title,
            },
        }),
    });
    assert.equal(topicRes.res.status, 200, 'Topic insert status');
    assert.ok(topicRes.body.message?.name, 'Topic name returned');
    const topicId = topicRes.body.message.name;
    console.log('  ✅ 1. Created discussion topic:', topicId);

    // 3. Fetch discussion topics
    const topicsList = await j('/api/method/lms.lms.utils.get_discussion_topics', {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({
            doctype: 'LMS Course',
            docname: 'fractal-kernel-fundamentals',
        }),
    });
    assert.equal(topicsList.res.status, 200, 'Topics list status');
    assert.ok(Array.isArray(topicsList.body.message), 'Topics is array');
    const foundTopic = topicsList.body.message.find((t) => t.name === topicId);
    assert.ok(foundTopic, 'Created topic found in list');
    assert.equal(foundTopic.title, title, 'Topic title matches');
    assert.equal(foundTopic.user?.email, 'admin@fractallms.app', 'Author user info populated');
    assert.equal(foundTopic.reply_count, 0, 'Initial reply_count is 0');
    console.log('  ✅ 2. Verified discussion topic list & author structure');

    // 4. Create discussion reply
    const replyContent = '<p>This is a test reply from student/admin.</p>';
    const replyRes = await j('/api/method/frappe.client.insert', {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({
            doc: {
                doctype: 'Discussion Reply',
                topic: topicId,
                reply: replyContent,
            },
        }),
    });
    assert.equal(replyRes.res.status, 200, 'Reply insert status');
    assert.ok(replyRes.body.message?.name, 'Reply name returned');
    const replyId = replyRes.body.message.name;
    console.log('  ✅ 3. Created discussion reply:', replyId);

    // 5. Fetch discussion replies
    const repliesList = await j('/api/method/lms.lms.utils.get_discussion_replies', {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({ topic: topicId }),
    });
    assert.equal(repliesList.res.status, 200, 'Replies list status');
    assert.ok(Array.isArray(repliesList.body.message), 'Replies is array');
    const foundReply = repliesList.body.message.find((r) => r.name === replyId);
    assert.ok(foundReply, 'Created reply found in thread');
    assert.equal(foundReply.reply, replyContent, 'Reply content matches');
    assert.equal(foundReply.user?.email, 'admin@fractallms.app', 'Reply user info populated');
    console.log('  ✅ 4. Verified discussion replies list');

    // 6. Verify topic reply_count incremented
    const updatedTopics = await j('/api/method/lms.lms.utils.get_discussion_topics', {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({
            doctype: 'LMS Course',
            docname: 'fractal-kernel-fundamentals',
        }),
    });
    const topicAfterReply = updatedTopics.body.message.find((t) => t.name === topicId);
    assert.equal(topicAfterReply?.reply_count, 1, 'Reply count updated to 1');
    console.log('  ✅ 5. Verified reply count calculation');

    // 7. Edit reply via client.set_value
    const editedText = '<p>Updated reply text</p>';
    const editRes = await j('/api/method/frappe.client.set_value', {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({
            doctype: 'Discussion Reply',
            name: replyId,
            fieldname: 'reply',
            value: editedText,
        }),
    });
    assert.equal(editRes.res.status, 200, 'Edit reply status');

    const editedList = await j('/api/method/lms.lms.utils.get_discussion_replies', {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({ topic: topicId }),
    });
    const afterEdit = editedList.body.message.find((r) => r.name === replyId);
    assert.equal(afterEdit?.reply, editedText, 'Reply content edited successfully');
    console.log('  ✅ 6. Verified reply editing');

    // 8. Falsification: Unauthenticated insert rejected
    const anonRes = await j('/api/method/frappe.client.insert', {
        method: 'POST',
        body: JSON.stringify({
            doc: { doctype: 'Discussion Topic', title: 'Hacked' },
        }),
    });
    assert.equal(anonRes.res.status, 401, 'Anonymous discussion creation rejected 401');
    console.log('  ✅ 7. Verified unauthenticated guard rejection 401');

    console.log('\n🎉 ALL 7 DISCUSSIONS IN-RAM TESTS PASSED!\n');
    process.exit(0);
})().catch((err) => {
    console.error('❌ Discussion test failed:', err);
    process.exit(1);
});
