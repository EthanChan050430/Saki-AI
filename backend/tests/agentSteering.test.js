'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { LIMITS, validateSteering, createSteeringController, createSteeringHandler, emitRunOutcome, preserveSteeringMessages } = require('../services/agentSteering');
const { appendToolExchange, alignNativeToolHistory } = require('../services/nativeToolCalling');

function fixture(save = async () => {}) {
    const events = [];
    const assistant = {};
    const steering = createSteeringController({ chatId: 'chat', assistantMsgId: 42, emit: event => events.push(event) });
    steering.bind(assistant, save);
    return { events, assistant, steering };
}
const input = text => ({ assistantMsgId: 42, text, files: [] });

test('legacy client history saves preserve server-owned steering records', () => {
    const records = [{ id: 'steer', status: 'applied', text: 'new direction' }];
    const saved = preserveSteeringMessages([{ id: 42, role: 'assistant', content: 'answer' }], [{ id: 42, role: 'assistant', steeringMessages: records }]);
    assert.deepEqual(saved[0].steeringMessages, records);
    assert.equal(saved[0].content, 'answer');
});

test('steering is persisted, FIFO, and cannot finish with pending updates', async () => {
    let saves = 0;
    const { steering, assistant, events } = fixture(async () => { saves++; });
    await steering.accept(input('first'));
    await steering.accept(input('second'));
    assert.equal(steering.tryFinish(), false);
    assert.equal(assistant.steeringMessages.length, 2);
    assert.deepEqual(events.map(event => event.status), ['accepted', 'accepted']);
    const messages = [];
    assert.equal(await steering.apply(messages), 2);
    assert.match(messages[0].content, /first/);
    assert.match(messages[1].content, /second/);
    assert.equal(saves, 4);
    assert.ok(assistant.steeringMessages.every(record => record.appliedAt && record.status === 'applied'));
    assert.equal(steering.tryFinish(), true);
    await assert.rejects(steering.accept(input('late')), /run_not_accepting/);
});

test('accepted persistence gates application during an in-flight model response', async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let count = 0;
    const { steering, events } = fixture(() => ++count === 1 ? gate : Promise.resolve());
    const accepting = steering.accept(input('new instructions'));
    const messages = [];
    const applying = steering.apply(messages);
    assert.equal(messages.length, 0);
    release();
    await Promise.all([accepting, applying]);
    assert.deepEqual(events.map(event => event.status), ['accepted', 'applied']);
});

for (const provider of ['openai', 'ollama', 'anthropic']) {
    test(`${provider}: deferred respond and completed tool exchanges remain paired`, async () => {
        const { steering } = fixture();
        const messages = [{ role: 'user', content: 'original task' }];
        for (const name of ['readFile', 'respond']) {
            appendToolExchange(messages, provider, {
                match: { native: true, name, providerName: name, callId: `call_${name}`, rawArgs: '{}' },
                observation: name === 'respond' ? 'Deferred for pending steering' : 'file contents',
            });
        }
        await steering.accept(input('change the target'));
        assert.equal(steering.tryFinish(), false);
        await steering.apply(messages, provider);
        assert.deepEqual(alignNativeToolHistory(messages, provider), messages);
        if (provider === 'anthropic') {
            assert.equal(messages.length, 5);
            assert.equal(messages.at(-1).content[0].type, 'tool_result');
            assert.match(messages.at(-1).content[1].text, /change the target/);
        } else {
            assert.equal(messages.at(-2).role, 'tool');
            assert.match(messages.at(-1).content, /change the target/);
        }
    });
}

test('reject wrong binding, pre-initialization, flood, and persistence failure', async () => {
    const cold = createSteeringController({ assistantMsgId: 42 });
    await assert.rejects(cold.accept(input('hello')), /run_not_ready/);
    const { steering } = fixture();
    await assert.rejects(steering.accept({ ...input('hello'), assistantMsgId: 43 }), /run_binding_mismatch/);
    for (let i = 0; i < LIMITS.messages; i++) await steering.accept(input(String(i)));
    await assert.rejects(steering.accept(input('overflow')), /steering_limit/);
    const broken = fixture(async () => { throw new Error('disk full'); });
    await assert.rejects(broken.steering.accept(input('hello')), /disk full/);
    assert.equal(broken.events.length, 0);
    await assert.rejects(broken.steering.apply([]), /disk full/);
});

test('validate text, uploaded file confinement, image payload, and size limits', async t => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'saki-steer-'));
    t.after(() => fs.rm(dir, { recursive: true, force: true }));
    const uploads = path.join(dir, 'uploads');
    await fs.mkdir(uploads);
    const filePath = path.join(uploads, 'notes.txt');
    await fs.writeFile(filePath, 'notes');
    const imagePath = path.join(uploads, 'image.png');
    await fs.writeFile(imagePath, 'image bytes');
    const result = await validateSteering({ assistantMsgId: 42, files: [{ path: filePath, content: 'notes' }, { path: imagePath }] }, uploads);
    assert.equal(result.files[0].size, 5);
    assert.equal(result.images.length, 1);
    assert.match(result.images[0].image_url.url, /^data:image\/png;base64,/);
    for (const body of [{}, input(' '), { ...input('x'), text: {} }, { ...input('x'), files: {} }]) {
        await assert.rejects(validateSteering(body, uploads), error => error.statusCode === 400);
    }
    await assert.rejects(validateSteering(input('界'.repeat(LIMITS.textBytes)), uploads), error => error.statusCode === 413);
    const outside = path.join(dir, 'secret.txt');
    await fs.writeFile(outside, 'secret');
    await assert.rejects(validateSteering({ ...input('x'), files: [{ path: outside }] }, uploads), /file_outside_uploads/);
    await assert.rejects(validateSteering({ ...input('x'), files: [{ path: filePath, content: 'x'.repeat(LIMITS.contentBytes + 1) }] }, uploads), error => error.statusCode === 413);
    await fs.truncate(filePath, LIMITS.fileBytes + 1);
    await assert.rejects(validateSteering({ ...input('x'), files: [{ path: filePath }] }, uploads), error => error.statusCode === 413);
});

test('HTTP steer route returns 202 and conflicts for absent, unsupported, stale, or finished runs', async t => {
    const { steering, events } = fixture();
    const runs = new Map([['chat', { mode: 'agent', steering }], ['ppt', { mode: 'ppt' }]]);
    const app = express();
    app.use(express.json());
    app.post('/api/chat/stream/:chatId/steer', createSteeringHandler({ runs, uploadsDir: os.tmpdir() }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const post = (id, body) => fetch(`http://127.0.0.1:${server.address().port}/api/chat/stream/${id}/steer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    for (const id of ['missing', 'ppt']) assert.equal((await post(id, input('hi'))).status, 409);
    assert.equal((await post('chat', { ...input('hi'), assistantMsgId: 43 })).status, 409);
    assert.equal((await post('chat', input(''))).status, 400);
    const accepted = await post('chat', input('please adjust'));
    assert.equal(accepted.status, 202);
    assert.equal((await accepted.json()).steering.text, 'please adjust');
    assert.equal(events[0].status, 'accepted');
    steering.close();
    assert.equal((await post('chat', input('late'))).status, 409);
});

test('run outcomes are explicit, terminal, bound, and emitted exactly once', () => {
    for (const outcome of ['completed', 'awaitingApproval', 'error', 'stopped']) {
        const chunks = [];
        let closed = false;
        const res = { chatId: 'chat', assistantMsgId: 42, write: chunk => chunks.push(chunk), steering: { close() { closed = true; } } };
        emitRunOutcome(res, outcome, { error: 'detail' });
        emitRunOutcome(res, 'completed');
        assert.equal(chunks.length, 1);
        assert.equal(closed, true);
        const event = JSON.parse(chunks[0].slice(6));
        assert.equal(event.type, 'runOutcome');
        assert.equal(event.outcome, outcome);
        assert.equal(event.assistantMsgId, 42);
    }
});

test('finish gate rejects a new update while final persistence is still running', async () => {
    const { steering } = fixture();
    assert.equal(steering.tryFinish(), true);
    await assert.rejects(steering.accept(input('too late')), /run_not_accepting/);
});

test('HTTP handler rechecks run identity after asynchronous validation', async () => {
    const original = { mode: 'agent', steering: fixture().steering };
    let reads = 0;
    const runs = { get() { return ++reads === 1 ? original : { mode: 'agent', steering: fixture().steering }; } };
    let status, body;
    const res = { status(code) { status = code; return this; }, json(value) { body = value; } };
    await createSteeringHandler({ runs, uploadsDir: os.tmpdir() })({ params: { chatId: 'chat' }, body: input('hello') }, res);
    assert.equal(status, 409);
    assert.equal(body.error, 'run_changed');
    assert.equal(original.steering.records.length, 0);
});