'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Readable } = require('node:stream');
const { EventEmitter } = require('node:events');
const { createKeyedSerialQueue, isCurrentRun, parseProviderFrame, getAnthropicModelProfile } = require('../services/agentLoopUtils');
const { createLineBuffer } = require('../services/streamBuffer');
const { preserveSteeringMessages, createSteeringController, emitRunOutcome } = require('../services/agentSteering');
const { applyFinalOutcomeToMessages, resolveFinalPendingRequest, isStalePendingSession } = require('../services/chatSessionFinalizer');
const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8').replace(/\r\n/g, '\n');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('server remains syntactically valid without starting listeners', () => {
    assert.doesNotThrow(() => new vm.Script(source));
});

test('shared session queue serializes RMW, survives rejection and permits other chats', async () => {
    const queue = createKeyedSerialQueue();
    const gate = deferred();
    const events = [];
    const first = queue('chat', async () => { events.push('read'); await gate.promise; events.push('write'); throw Error('failed'); });
    const rejected = assert.rejects(first, /failed/);
    const second = queue('chat', () => events.push('second'));
    await queue('other', () => events.push('other'));
    assert.deepEqual(events, ['read', 'other']);
    gate.resolve();
    await rejected;
    await second;
    assert.deepEqual(events, ['read', 'other', 'write', 'second']);
});

function lifecycleContext(extra = {}) {
    const context = vm.createContext({
        BACKGROUND_RUNS: new Map(), withSessionWrite: createKeyedSerialQueue(),
        isCurrentRun, createSteeringController, emitRunOutcome, console,
        ...extra,
    });
    vm.runInContext(section('function createBackgroundRun(', 'function attachBackgroundSubscriber(')
        + section('function withRunSessionWrite(', 'async function persistSessionRecordLocked('), context);
    return context;
}

test('stop releases occupancy immediately; old cleanup and late tool persistence cannot affect new run', async () => {
    const c = lifecycleContext();
    const old = c.createBackgroundRun('chat', 'agent', 'old');
    old.stop();
    assert.equal(c.BACKGROUND_RUNS.has('chat'), false);
    const next = c.createBackgroundRun('chat', 'agent', 'new');
    let writes = 0;
    await c.withRunSessionWrite('chat', old, () => { writes++; });
    old.end();
    assert.equal(writes, 0);
    assert.equal(c.BACKGROUND_RUNS.get('chat'), next);
    await c.withRunSessionWrite('chat', next, () => { writes++; });
    assert.equal(writes, 1);
});

test('stop during asynchronous read invalidates write; new writes wait for the old queue', async () => {
    const c = lifecycleContext();
    const old = c.createBackgroundRun('chat', 'agent', 'old');
    const read = deferred();
    const started = deferred();
    const writes = [];
    const pending = c.withRunSessionWrite('chat', old, async valid => {
        started.resolve(); await read.promise;
        if (valid()) writes.push('old');
    });
    await started.promise;
    old.stop();
    const next = c.createBackgroundRun('chat', 'agent', 'new');
    const fresh = c.withRunSessionWrite('chat', next, () => writes.push('new'));
    read.resolve();
    await Promise.all([pending, fresh]);
    assert.deepEqual(writes, ['new']);
});

test('initialization reservation rejects duplicates and promotes without changing identity', () => {
    const c = lifecycleContext();
    const run = c.createBackgroundRun('chat', 'initializing', 'answer');
    assert.throws(() => c.createBackgroundRun('chat', 'agent', 'duplicate'), /run_in_progress/);
    assert.equal(c.createBackgroundRun('chat', 'agent', 'answer', run), run);
    assert.ok(run.steering);
    run.stop();
    assert.throws(() => c.createBackgroundRun('chat', 'agent', 'answer', run), /run_changed/);
});

test('persistSessionRecord and Agent writes share the lock so steering is not lost', async () => {
    let saved = { messages: [{ role: 'assistant', id: 'a', steeringMessages: [] }] };
    const c = lifecycleContext({
        path, SESSIONS_DIR: '/sessions', preserveSteeringMessages,
        safeReadJsonFile: async () => JSON.parse(JSON.stringify(saved)),
        fs: { writeJson: async (_file, value) => { saved = JSON.parse(JSON.stringify(value)); } },
        hasPendingRequest: Boolean, mergePreservedStoryGlassConversationMessages: incoming => incoming,
        shouldPruneEmptyHistorySession: () => false, getHistory: async () => [], saveHistory: async () => {},
        createSessionSummary: ({ chatId }) => ({ id: chatId }), emitRealtimeEvent: () => {},
    });
    vm.runInContext(section('function persistSessionRecord(options)', 'function withRunSessionWrite(')
        + section('async function persistSessionRecordLocked(', 'async function loadQQBotSessionMap('), c);
    const run = c.createBackgroundRun('chat', 'agent', 'a');
    const read = deferred();
    const started = deferred();
    const steering = c.withRunSessionWrite('chat', run, async () => {
        const snapshot = JSON.parse(JSON.stringify(saved)); started.resolve(); await read.promise;
        snapshot.messages[0].steeringMessages.push({ id: 's', text: 'new constraint', status: 'accepted' });
        saved = snapshot;
    });
    await started.promise;
    const clientSave = c.persistSessionRecord({ chatId: 'chat', messages: [{ role: 'assistant', id: 'a', parts: [] }] });
    read.resolve();
    await Promise.all([steering, clientSave]);
    assert.equal(saved.messages[0].steeringMessages[0].text, 'new constraint');
});

for (const provider of ['openai', 'anthropic', 'ollama']) {
    test(`callLLM rejects HTTP-200 ${provider} stream errors after partial output`, async () => {
        const frames = provider === 'ollama'
            ? ['{"response":"partial"}\n', '{"error":"provider failed"}\n']
            : provider === 'anthropic'
                ? ['data: {"type":"content_block_delta","delta":{"text":"partial"}}\n', 'data: {"type":"error","error":{"type":"overloaded_error","message":"provider failed"}}\n']
                : ['data: {"choices":[{"delta":{"content":"partial"}}]}\n', 'data: {"error":{"message":"provider failed"}}\n', 'data: [DONE]\n'];
        const request = async () => ({ data: Readable.from(frames) });
        const c = vm.createContext({
            normalizeChatProviderId: id => id, getConfiguredChatApiKey: () => '',
            axios: { post: request }, postModelStream: request, createLineBuffer,
            parseProviderFrame, getAnthropicModelProfile, console,
        });
        vm.runInContext(section('async function callLLM(', 'async function runDeepReadingLoop('), c);
        const text = [];
        await assert.rejects(c.callLLM(provider, 'test', '', 'hello', {}, token => text.push(token)), /provider failed/);
        assert.deepEqual(text, ['partial']);
    });
}

test('callLLM completes when a provider sends its terminal frame before closing the stream', async () => {
    const stream = new EventEmitter();
    stream.destroy = () => {};
    const request = async () => {
        setImmediate(() => {
            stream.emit('data', Buffer.from('data: {"choices":[{"delta":{"content":"complete"}}]}\n'));
            stream.emit('data', Buffer.from('data: [DONE]\n'));
        });
        return { data: stream };
    };
    const c = vm.createContext({
        normalizeChatProviderId: id => id, getConfiguredChatApiKey: () => '',
        axios: { post: request }, postModelStream: request, createLineBuffer,
        parseProviderFrame, getAnthropicModelProfile, console,
    });
    vm.runInContext(section('async function callLLM(', 'async function runDeepReadingLoop('), c);

    const text = await Promise.race([
        c.callLLM('openai', 'test', '', 'hello', {}, token => token),
        new Promise((_, reject) => setTimeout(() => reject(new Error('stream did not finish')), 250)),
    ]);
    assert.equal(text, 'complete');
});

test('callLLM completes when Ollama sends done=true before closing the stream', async () => {
    const stream = new EventEmitter();
    stream.destroy = () => {};
    const request = async () => {
        setImmediate(() => {
            stream.emit('data', Buffer.from('{"response":"complete","done":true}\n'));
        });
        return { data: stream };
    };
    const c = vm.createContext({
        normalizeChatProviderId: id => id, getConfiguredChatApiKey: () => '',
        axios: { post: request }, postModelStream: request, createLineBuffer,
        parseProviderFrame, getAnthropicModelProfile, console,
    });
    vm.runInContext(section('async function callLLM(', 'async function runDeepReadingLoop('), c);

    const text = await Promise.race([
        c.callLLM('ollama', 'test', '', 'hello', {}, token => token),
        new Promise((_, reject) => setTimeout(() => reject(new Error('stream did not finish')), 250)),
    ]);
    assert.equal(text, 'complete');
});

test('malformed JSON is recoverable but provider error is not a JSON parse failure', () => {
    assert.equal(parseProviderFrame('{'), null);
    assert.throws(() => parseProviderFrame('{"error":{"message":"overloaded"}}'), /overloaded/);
});

test('Ollama retry and tool-schema fallback are both disabled after stream data', () => {
    const loop = section("        if (provider === 'ollama') {\n            let retryCount", "        } else if (provider === 'copilot' || provider === 'github')");
    assert.match(loop, /receivedData = true;\s*ollamaLines.push\(chunk\)/);
    assert.match(loop, /if \(!receivedData && nativeToolsEnabled && isToolSchemaRejection/);
    assert.match(loop, /if \(!receivedData && retryCount < maxRetries && isRetryable\)/);
});

test('chat reserves occupancy before the first await and retains steering endpoint', () => {
    const route = section("app.post('/api/chat',", '// ── Background-run management routes');
    assert.ok(route.indexOf("createBackgroundRun(chatId, 'initializing'") < route.indexOf('await '));
    assert.match(route, /finally\s*\{\s*if \(reservation && BACKGROUND_RUNS.get\(chatId\) === reservation\)/);
    assert.match(source, /app.post\('\/api\/chat\/stream\/:chatId\/steer'/);
});

test('both steering finalization gates clear provisional text before another model turn', () => {
    const gates = [...source.matchAll(/if \(res\.steering && !res\.steering\.tryFinish\(\)\) \{\s*responseTextStream\.update\(''\);/g)];
    assert.equal(gates.length, 2);
});

test('startup hints match configured default ports', () => {
    const batch = fs.readFileSync(path.join(__dirname, '../../start.bat'), 'utf8');
    assert.match(batch, /localhost:5480/);
    assert.match(batch, /localhost:5482/);
    assert.doesNotMatch(batch, /5431|5432/);
});

test('finalizeChatRunSession and repairStalePendingSession clear orphaned pendingRequest and mark message done', async () => {
    let saved = {
        messages: [
            { role: 'user', id: 'u1', content: 'hello' },
            { role: 'assistant', id: 'a1', parts: [{ type: 'text', content: 'final answer' }] },
        ],
        pendingRequest: { type: 'chat', message: 'hello', assistantMsgId: 'a1' },
        source: 'web',
    };
    let historyList = [{ id: 'chat-final', isPending: true, pendingType: 'chat' }];
    const events = [];
    const c = lifecycleContext({
        path,
        SESSIONS_DIR: '/sessions',
        preserveSteeringMessages,
        applyFinalOutcomeToMessages,
        resolveFinalPendingRequest,
        isStalePendingSession,
        safeReadJsonFile: async () => JSON.parse(JSON.stringify(saved)),
        fs: { writeJson: async (_file, value) => { saved = JSON.parse(JSON.stringify(value)); } },
        hasPendingRequest: (p) => Boolean(p && typeof p === 'object' && p.assistantMsgId),
        mergePreservedStoryGlassConversationMessages: incoming => incoming,
        shouldPruneEmptyHistorySession: () => false,
        getHistory: async () => JSON.parse(JSON.stringify(historyList)),
        saveHistory: async (next) => { historyList = JSON.parse(JSON.stringify(next)); },
        createSessionSummary: ({ chatId, pendingRequest }) => ({
            id: chatId,
            isPending: Boolean(pendingRequest),
            pendingType: pendingRequest?.type || null,
        }),
        emitRealtimeEvent: (evt) => events.push(evt),
    });
    vm.runInContext(
        section('function persistSessionRecord(options)', 'function withRunSessionWrite(')
        + section('async function persistSessionRecordLocked(', 'async function loadQQBotSessionMap('),
        c
    );

    const run = c.createBackgroundRun('chat-final', 'agent', 'a1');
    await c.finalizeChatRunSession({
        chatId: 'chat-final',
        assistantMsgId: 'a1',
        outcome: 'completed',
        startedAt: Date.now() - 500,
        runIdentity: run,
    });
    assert.equal(saved.pendingRequest, null);
    assert.equal(saved.messages[1].status, 'done');
    assert.equal(saved.messages[1].runOutcome, 'completed');
    assert.equal(historyList[0].isPending, false);
    assert.ok(events.some(e => e.type === 'session-updated' && e.chatId === 'chat-final'));

    // Re-introduce stale orphaned pendingRequest (simulating pre-fix / crashed write)
    run.end();
    saved = {
        messages: [
            { role: 'user', id: 'u1', content: 'hello' },
            { role: 'assistant', id: 'a1', parts: [{ type: 'text', content: 'done text' }] },
        ],
        pendingRequest: { type: 'chat', message: 'hello', assistantMsgId: 'a1' },
    };
    const repaired = await c.repairStalePendingSession('chat-final');
    assert.equal(repaired.pendingRequest, null);
    assert.equal(repaired.messages[1].status, 'done');
});

test('/api/chat and /api/chat/stream/:chatId/stop finalize sessions before releasing runs', () => {
    const chatRoute = section("app.post('/api/chat',", '// ── Background-run management routes');
    const stopRoute = section("app.post('/api/chat/stream/:chatId/stop',", '// ── End background-run management routes');
    assert.match(chatRoute, /finalizeChatRunSession/);
    assert.match(stopRoute, /finalizeChatRunSession/);
});