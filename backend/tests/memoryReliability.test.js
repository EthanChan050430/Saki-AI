'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs-extra');
const os = require('node:os');
const path = require('node:path');
const { MemoryService } = require('../services/memory');
const { MemoryCaptureQueue } = require('../services/memoryCaptureQueue');
const { OfflineReflectionService } = require('../services/offlineReflection');

async function fixture(t) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'saki-memory-reliability-'));
    t.after(() => fs.remove(root));
    const params = {
        dataDir: path.join(root, 'data'),
        memoriesDir: path.join(root, 'memories'),
        workspaceDir: root,
        embeddingMode: 'keyword',
    };
    const service = new MemoryService(params);
    await service.init();
    return { root, params, service };
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function until(predicate, timeout = 1200) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        if (await predicate()) return;
        await wait(10);
    }
    throw new Error('Timed out waiting for expected background state');
}

test('concurrent instances preserve unique memories and session writes', async t => {
    const { params, service } = await fixture(t);
    const another = new MemoryService(params);
    await Promise.all(Array.from({ length: 24 }, (_, index) =>
        (index % 2 ? another : service).upsertMemory({
            name: `Concurrent Fact ${index}`,
            content: `Unique item number ${index}`,
        })
    ));
    assert.equal((await service.loadStore()).memories.length, 24);
    await Promise.all([
        service.saveSessionState({ currentTask: 'Task A' }, 'chat-a'),
        another.saveSessionState({ currentTask: 'Task B' }, 'chat-b'),
    ]);
    const sessions = await fs.readJson(service.sessionStateJsonPath);
    assert.equal(sessions.chats['chat-a'].currentTask, 'Task A');
    assert.equal(sessions.chats['chat-b'].currentTask, 'Task B');
});

test('persisted capture job recovers if process died while running', async t => {
    const { params } = await fixture(t);
    const job = { id: 'chat:42', chatId: 'chat', userMessage: 'Remember this', assistantMessage: 'Understood' };
    const blocked = new Promise(() => {});
    const original = new MemoryCaptureQueue({ dataDir: params.dataDir, handler: () => blocked });
    await original.enqueue(job);
    await until(async () => (await fs.readJson(original.filePath)).jobs[0]?.status === 'running');
    const seen = [];
    const restarted = new MemoryCaptureQueue({ dataDir: params.dataDir, handler: async item => { seen.push(item.id); } });
    await restarted.init();
    assert.equal((await fs.readJson(restarted.filePath)).jobs[0]?.status, 'pending');
    await restarted.pump();
    assert.deepEqual(seen, ['chat:42']);
    const state = await fs.readJson(restarted.filePath);
    assert.equal(state.jobs.length, 0);
    assert.deepEqual(state.completedIds, ['chat:42']);
    assert.equal(await restarted.enqueue(job), false);
    restarted.stop();
    original.stop();
});

test('failed capture keeps a retryable durable job', async t => {
    const { params } = await fixture(t);
    const queue = new MemoryCaptureQueue({
        dataDir: params.dataDir, handler: async () => { throw new Error('temporarily unavailable'); },
        retryBaseMs: 60000,
    });
    await queue.enqueue({ id: 'bad:1', chatId: 'bad', userMessage: 'A preference' });
    await until(async () => {
        const entry = (await fs.readJson(queue.filePath)).jobs[0];
        return entry?.attempts >= 1 && entry.status === 'pending';
    });
    const state = await fs.readJson(queue.filePath);
    assert.equal(state.jobs[0].status, 'pending');
    assert.match(state.jobs[0].lastError, /temporarily unavailable/);
    queue.stop();
});

test('fact key replaces obsolete fact but retains historical version', async t => {
    const { service } = await fixture(t);
    await service.upsertMemory({ name: 'Coffee', content: 'I prefer coffee', factKey: 'user.drink',
        factValue: 'coffee', merge: false });
    await service.upsertMemory({ name: 'Tea', content: 'I prefer tea now', factKey: 'user.drink',
        factValue: 'tea', merge: true });
    const memories = (await service.loadStore()).memories;
    assert.equal(memories.length, 1);
    assert.equal(memories[0].content, 'I prefer tea now');
    assert.equal(memories[0].factValue, 'tea');
    assert.equal(memories[0].history.length, 1);
    assert.equal(memories[0].history[0].factValue, 'coffee');
    assert.equal((await service.searchMemories('coffee')).length, 0);
});

test('sleep consolidation does not blindly promote irrelevant general notes', async t => {
    const { service } = await fixture(t);
    await service.enqueueSleepCandidates([
        { topicKey: 'smalltalk', topicLabel: 'Small talk', category: 'general',
            content: 'The sky was nice', importance: 0.35 },
        { topicKey: 'identity', topicLabel: 'Student', category: 'identity',
            content: '我是大学生', importance: 0.95 },
    ]);
    const result = await service.runSleepCycle({ force: true });
    assert.equal(result.consolidated.length, 1);
    assert.equal((await service.loadSleepStore()).queue.length, 1);
    assert.equal((await service.loadStore()).memories.length, 1);
});

test('forgetting removes derived work, notes, graph, queue and vector while retaining unrelated data', async t => {
    const { service, root, params } = await fixture(t);
    const phrase = 'I prefer matcha tea';
    await service.upsertMemory({ name: 'Matcha Preference', content: phrase,
        provenance: { chatId: 'chat', evidenceText: phrase } });
    await service.upsertMemory({ name: 'Unrelated Preference', content: 'I love hiking' });
    await service.updateWorkingMemory('chat', { user: phrase, assistant: 'Noted', jobId: 'job:1' });
    await service.updateWorkingMemory('chat', { user: 'I love hiking', assistant: 'Noted', jobId: 'job:2' });
    await service.saveSessionState({ currentTask: phrase, keyContext: [phrase, 'I love hiking'],
        topicFocus: [phrase], recentDecisions: [phrase] }, 'chat');
    await service.enqueueSleepCandidates([{ topicKey: 'matcha', category: 'preference', content: phrase }]);
    await service.upsertKnowledgeGraph({ entities: [
        { name: 'Matcha choice', summary: phrase },
        { name: 'Hiking', summary: 'I love hiking' },
    ], relations: [{ subject: 'User', predicate: 'preference', object: phrase, evidence: phrase }] });
    await service.appendDailyLog({ chatId: 'chat', userMessage: phrase, memories: [
        { name: 'Matcha Preference', category: 'preference' },
    ] });
    await service.appendTopicSnapshot({ topicKey: 'matcha', topicLabel: 'Matcha', content: phrase });
    await service.rememberDecision(phrase);
    const queue = new MemoryCaptureQueue({ dataDir: params.dataDir,
        handler: async () => { throw new Error('model offline'); }, retryBaseMs: 60000 });
    service.captureQueue = queue;
    await queue.enqueue({ id: 'chat:1', chatId: 'chat', userMessage: phrase });
    await service.deleteMemory('Matcha Preference');
    assert.equal((await service.loadStore()).memories.length, 1);
    assert.equal((await service.loadStore()).tombstones[0].purgeSnapshot, undefined);
    assert.ok(!(await fs.readFile(service.storePath, 'utf8')).includes(phrase));
    assert.equal((await service.loadSleepStore()).queue.length, 0);
    assert.equal((await service.loadKnowledgeGraph()).entities.length, 1);
    assert.equal((await service.loadKnowledgeGraph()).relations.length, 0);
    assert.equal((await queue.status()).pending, 0);
    assert.equal((await service.getWorkingMemory('chat')).turns.length, 1);
    assert.doesNotMatch((await fs.readFile(service.sessionStateJsonPath, 'utf8')), /matcha tea/);
    const topicPath = path.join(root, 'memory', 'topics', 'matcha.md');
    if (await fs.pathExists(topicPath)) {
        assert.doesNotMatch((await fs.readFile(topicPath, 'utf8')), /matcha tea/i);
    }
    const files = await fs.readdir(path.join(root, 'memory'));
    for (const file of files.filter(file => file.endsWith('.md'))) {
        assert.doesNotMatch(await fs.readFile(path.join(root, 'memory', file), 'utf8'), /matcha tea/i);
    }
    assert.ok((await service.searchMemories('hiking')).length > 0);
    await assert.rejects(service.upsertMemory({ name: 'Matcha Preference', content: phrase, auto: true }), /deleted/);
    queue.stop();
});

test('offline reflection excludes credential files and redacts config secrets', async t => {
    const { service, root } = await fixture(t);
    await fs.writeFile(path.join(root, 'production.env'), 'ACCESS_TOKEN=verysecretpassword123\n');
    await fs.writeFile(path.join(root, 'notes.json'), '{"api_key":"abcdefghijklmnopqrstuv"}');
    const reflection = new OfflineReflectionService({ dataDir: service.dataDir,
        workspaceRoot: root, sessionsDir: service.dataDir, memoryService: service });
    const now = Date.now();
    const files = await reflection.collectTodayFiles({ startMs: now - 10000, endMs: now + 10000 }, [
        path.join(root, 'production.env'), path.join(root, 'notes.json'),
    ]);
    assert.ok(!files.some(file => file.relativePath === 'production.env'));
    const note = files.find(file => file.relativePath === 'notes.json');
    assert.ok(note, 'non-sensitive JSON should still be eligible');
    assert.doesNotMatch(note.excerpt, /abcdefghijklmnopqrstuv/);
});

test('strict queued extraction propagates model outages for durable retry', async t => {
    const { service } = await fixture(t);
    await assert.rejects(service.autoCaptureFromTurn({
        chatId: 'chat', userMessage: 'I prefer tea', provider: 'ollama', model: 'test',
        callLLM: async () => { throw new Error('model temporarily unavailable'); },
        retryOnModelError: true,
    }), /temporarily unavailable/);
    assert.equal((await service.loadStore()).memories.length, 0);
});

test('interrupted deletion can be replayed without resurrecting the memory', async t => {
    const { params, service } = await fixture(t);
    await service.upsertMemory({ name: 'Secret Preference', content: 'I avoid sugary drinks' });
    const realPurge = service._purgeDerivedMemory;
    service._purgeDerivedMemory = async () => { throw new Error('interrupted purge'); };
    await assert.rejects(service.deleteMemory('Secret Preference'), /interrupted purge/);
    const pending = await service.loadStore();
    assert.equal(pending.tombstones[0].purgePending, true);
    service._purgeDerivedMemory = realPurge;
    const restarted = new MemoryService(params);
    await restarted.init();
    await restarted.recoverPendingPurges();
    const finished = await restarted.loadStore();
    assert.equal(finished.memories.length, 0);
    assert.equal(finished.tombstones[0].purgePending, undefined);
    assert.equal(finished.tombstones[0].purgeSnapshot, undefined);
});

test('corrupted derived JSON fails closed instead of losing pending data', async t => {
    const { service } = await fixture(t);
    await fs.writeFile(service.sleepStorePath, '{broken', 'utf8');
    await assert.rejects(service.enqueueSleepCandidates([
        { content: 'I prefer tea', topicKey: 'tea', category: 'preference' },
    ]));
    assert.equal(await fs.readFile(service.sleepStorePath, 'utf8'), '{broken');
});

test('deleted evidence cannot be reintroduced into the knowledge graph', async t => {
    const { service } = await fixture(t);
    const fact = 'I prefer matcha tea';
    await service.upsertMemory({ name: 'Matcha Preference', content: fact });
    await service.deleteMemory('Matcha Preference');
    await service.upsertKnowledgeGraph({
        entities: [{ name: 'User preference', summary: fact }],
        relations: [{ subject: 'User', predicate: 'preference', object: fact, evidence: fact }],
    });
    const graph = await service.loadKnowledgeGraph();
    assert.equal(graph.entities.length, 0);
    assert.equal(graph.relations.length, 0);
});
