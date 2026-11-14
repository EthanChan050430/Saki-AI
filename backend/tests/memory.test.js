'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs-extra');
const os = require('node:os');
const path = require('node:path');

const {
    sanitizeMemoryText,
    normalizePendingActionItem,
    expirePendingActions,
    inferDecisionText,
    normalizeChatKey,
    MemoryService,
} = require('../services/memory.js');

async function temporaryMemory(t) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'saki-memory-test-'));
    t.after(() => fs.remove(root));
    const service = new MemoryService({
        dataDir: path.join(root, 'data'), memoriesDir: path.join(root, 'memories'),
        workspaceDir: root, embeddingMode: 'keyword',
    });
    await fs.ensureDir(service.dataDir);
    await service.init();
    return service;
}

describe('memory fact admission and replacement', () => {
    it('preserves primary JSON when atomic replacement fails', async t => {
        const service = await temporaryMemory(t);
        const before = await fs.readFile(service.storePath, 'utf8');
        const store = await service.loadStore();
        store.memories.push({ id: 'uncommitted' });
        const rename = fs.rename;
        fs.rename = async (source, target) => {
            if (target === service.storePath) throw new Error('simulated rename failure');
            return rename(source, target);
        };
        try {
            await assert.rejects(service.saveStore(store), /simulated rename failure/);
        } finally {
            fs.rename = rename;
        }
        assert.equal(await fs.readFile(service.storePath, 'utf8'), before);
        assert.ok(!(await fs.readdir(service.dataDir)).some(file => file.endsWith('.tmp')));
    });
    it('isolates explicit scopes including mirrors and working memory', async t => {
        const base = await temporaryMemory(t);
        const options = { dataDir: base.dataDir, memoriesDir: base.memoriesDir,
            workspaceDir: base.workspaceDir, embeddingMode: 'keyword' };
        const a = new MemoryService({ ...options, scopeId: 'a' });
        const b = new MemoryService({ ...options, scopeId: 'b' });
        await a.upsertMemory({ name: 'Preference', content: 'Tea' });
        await b.upsertMemory({ name: 'Preference', content: 'Coffee' });
        await a.updateWorkingMemory('shared-chat', { user: 'Private context' });
        assert.equal((await a.getMemory('Preference')).content, 'Tea');
        assert.equal((await b.getMemory('Preference')).content, 'Coffee');
        assert.equal(await b.getWorkingMemory('shared-chat'), null);
        await a.deleteMemory('Preference');
        assert.equal((await b.getMemory('Preference')).content, 'Coffee');
    });

    it('persists deletion barriers and permits only explicit restoration', async t => {
        const service = await temporaryMemory(t);
        const input = { name: 'Tea preference', content: 'I prefer tea' };
        await service.upsertMemory(input);
        await service.enqueueSleepCandidates([{ ...input, topicKey: 'tea' }]);
        await service.deleteMemory(input.name);
        assert.equal((await service.loadSleepStore()).queue.length, 0);
        await assert.rejects(service.upsertMemory({ ...input, auto: true }), /explicitly deleted/);
        assert.equal((await service.enqueueSleepCandidates([input])).length, 0);
        assert.equal((await service.loadStore()).tombstones.length, 1);
        const queue = await service.loadSleepStore();
        queue.queue.push({ ...input, topicKey: 'tea', category: 'preference' });
        await service.saveSleepStore(queue);
        assert.equal((await service.runSleepCycle({ force: true })).consolidated.length, 0);
        await fs.writeFile(path.join(service.memoriesDir, 'Tea preference.txt'), input.content);
        service.initialized = false;
        await service.init();
        assert.equal(await service.getMemory(input.name), null);
        await service.upsertMemory({ ...input, restoreDeleted: true });
        assert.equal((await service.getMemory(input.name)).content, input.content);
    });

    it('indexes explicitly without embedding documents during search', async t => {
        const service = await temporaryMemory(t);
        await service.upsertMemory({ name: 'Tea', content: 'Tea preference' });
        service.embeddingDisabled = false;
        const calls = [];
        service.embedText = async text => { calls.push(text); return [1, 0]; };
        await service.rebuildVectorIndex();
        assert.equal(calls.length, 1);
        calls.length = 0;
        await service.searchMemories('Tea');
        assert.equal(calls.length, 1);
        await service.rebuildVectorIndex();
        assert.equal(calls.length, 1);
    });

    it('requires human review of offline evidence before storing memories', async t => {
        const service = await temporaryMemory(t);
        const { OfflineReflectionService } = require('../services/offlineReflection');
        const { MemoryReviewService } = require('../services/memoryReview');
        const reflection = new OfflineReflectionService({ dataDir: service.dataDir,
            workspaceRoot: service.workspaceDir, sessionsDir: service.dataDir, memoryService: service });
        reflection.collectDailyInputs = async () => ({ dateKey: '2026-01-01', fileDigests: [],
            sessionSummaries: [{ chatId: 'a', updatedAt: new Date().toISOString(),
                transcript: 'User: Tea please\nAssistant: Coffee please', userMessages: ['Tea please'] }] });
        const review = new MemoryReviewService({ dataDir: service.dataDir,
            reflectionService: reflection, memoryService: service });
        const draft = await review.generate({ dateKey: '2026-01-01',
            config: { provider: 'openai', model: 'test-model' },
            callModel: async () => JSON.stringify({ memoryCandidates: [
                { name: 'Tea', content: 'Tea preference', evidenceText: 'Tea please' },
                { name: 'Coffee', content: 'Coffee preference', evidenceText: 'Coffee please' },
            ] }) });
        assert.equal(draft.memoryCandidates.length, 1);
        assert.equal((await service.loadStore()).memories.length, 0);
        await review.commit(draft.id);
        assert.equal((await service.loadStore()).memories.length, 1);
        assert.equal((await service.loadStore()).memories[0].provenance.evidenceText, 'Tea please');
    });
    it('replaces the current summary and retains the previous version across reloads', async t => {
        const service = await temporaryMemory(t);
        await service.upsertMemory({ name: 'Drink preference', content: 'I drink coffee', summary: 'Coffee daily', tags: ['obsolete-tag'], confidence: 0.99 });
        const provenance = { chatId: 'chat-a', sourceRole: 'user', evidenceText: 'I no longer drink coffee' };
        await service.upsertMemory({ name: 'Drink preference', content: provenance.evidenceText,
            summary: 'No coffee', merge: false, provenance, confidence: 0.6 });
        const memory = (await service.loadStore()).memories[0];
        assert.equal(memory.summary, 'No coffee');
        assert.equal(memory.content, provenance.evidenceText);
        assert.equal(memory.history.length, 1);
        assert.equal(memory.history[0].summary, 'Coffee daily');
        assert.deepEqual(memory.provenance, provenance);
        assert.equal(memory.confidence, 0.6);
        assert.ok(!memory.tags.includes('obsolete-tag'));
        await service.upsertMemory({ name: 'Drink preference', content: memory.content, summary: memory.summary, merge: false });
        assert.equal((await service.loadStore()).memories[0].history.length, 1);
        assert.equal((await service.loadStore()).memories[0].provenance, null);
        assert.doesNotMatch((await service.buildContext({ query: 'coffee' })).summaryText, /Coffee daily/);
    });

    it('does not derive user facts from assistant suggestions', () => {
        const service = new MemoryService({ dataDir: 'unused', memoriesDir: 'unused', embeddingMode: 'keyword' });
        assert.deepEqual(service.fallbackAutoMemories('Hello', 'I like coffee and I work at a bank'), []);
        const snapshot = service.captureSensorySnapshot({ userMessage: 'Hello', assistantMessage: 'I prefer coffee' });
        assert.ok(snapshot.segments.every(segment => !segment.text.includes('coffee')));
    });

    it('honors an empty extraction without fallback or short-term promotion', async t => {
        const service = await temporaryMemory(t);
        const result = await service.autoCaptureFromTurn({ chatId: 'a', userMessage: 'I like coffee',
            assistantMessage: 'Noted', provider: 'test', model: 'test', callLLM: async () => '[]' });
        assert.equal(result.saved.length, 0);
        assert.equal(result.queued.length, 0);
        assert.equal((await service.loadStore()).memories.length, 0);
        assert.deepEqual((await service.loadShortTermStore()).chats, {});
    });

    it('rejects fabricated evidence and preserves a supported extraction source', async t => {
        const service = await temporaryMemory(t);
        const result = await service.autoCaptureFromTurn({ chatId: 'a', userMessage: 'I prefer tea',
            provider: 'test', model: 'test', callLLM: async () => JSON.stringify([
                { name: 'Tea preference', content: 'I prefer tea', category: 'preference', importance: 0.9, evidenceText: 'I prefer tea' },
                { name: 'Coffee preference', content: 'I prefer coffee', category: 'preference', importance: 0.9, evidenceText: 'I prefer coffee' },
            ]) });
        assert.equal(result.saved.length, 1);
        assert.equal(result.saved[0].provenance.chatId, 'a');
        assert.equal(result.saved[0].provenance.evidenceText, 'I prefer tea');
    });

    it('retains heuristic capture when extraction fails', async t => {
        const service = await temporaryMemory(t);
        const result = await service.autoCaptureFromTurn({ chatId: 'a', userMessage: 'I prefer tea',
            provider: 'test', model: 'test', callLLM: async () => 'invalid JSON' });
        assert.ok(result.saved.length > 0);
    });

    it('never replaces a corrupt store with an empty default', async t => {
        const service = await temporaryMemory(t);
        await fs.writeFile(service.storePath, '{broken', 'utf8');
        await assert.rejects(service.upsertMemory({ name: 'New', content: 'New fact' }));
        assert.equal(await fs.readFile(service.storePath, 'utf8'), '{broken');
        await fs.writeJson(service.storePath, { memories: null });
        await assert.rejects(service.loadStore(), /Invalid memory store/);
        service.initialized = false;
        await fs.writeFile(path.join(service.memoriesDir, 'legacy.txt'), 'Legacy fact');
        await assert.rejects(service.init(), /Legacy import was stopped/);
        assert.deepEqual(await fs.readJson(service.storePath), { memories: null });
    });
});

describe('sanitizeMemoryText', () => {
    it('strips [expression:...] tags', () => {
        assert.equal(sanitizeMemoryText('hello [expression:happy.png] world'), 'hello world');
    });
    it('strips multiple tags', () => {
        const result = sanitizeMemoryText('[expression:smile] hi [expression:wave.gif]');
        assert.ok(!result.includes('[expression:'));
        assert.ok(result.includes('hi'));
    });
    it('collapses excess whitespace', () => {
        assert.equal(sanitizeMemoryText('foo   bar'), 'foo bar');
    });
    it('trims leading and trailing space', () => {
        assert.equal(sanitizeMemoryText('  hello  '), 'hello');
    });
    it('returns empty string for empty input', () => {
        assert.equal(sanitizeMemoryText(''), '');
        assert.equal(sanitizeMemoryText(null), '');
    });
});

describe('normalizePendingActionItem', () => {
    it('returns null for plain string (legacy format)', () => {
        assert.equal(normalizePendingActionItem('old plain string'), null);
    });
    it('returns null for null/undefined', () => {
        assert.equal(normalizePendingActionItem(null), null);
        assert.equal(normalizePendingActionItem(undefined), null);
    });
    it('returns null when text is empty after sanitization', () => {
        assert.equal(normalizePendingActionItem({ text: '[expression:x]', createdAt: new Date().toISOString() }), null);
    });
    it('returns null when createdAt is invalid', () => {
        assert.equal(normalizePendingActionItem({ text: 'do thing', createdAt: 'not-a-date' }), null);
    });
    it('normalizes a valid item', () => {
        const iso = new Date().toISOString();
        const result = normalizePendingActionItem({ text: 'fix the bug', createdAt: iso });
        assert.equal(result.text, 'fix the bug');
        assert.equal(typeof result.createdAt, 'string');
    });
    it('sanitizes text in the item', () => {
        const iso = new Date().toISOString();
        const result = normalizePendingActionItem({ text: 'fix [expression:x] bug', createdAt: iso });
        assert.equal(result.text, 'fix bug');
    });
});

describe('expirePendingActions', () => {
    const recent = new Date().toISOString();
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();

    it('removes expired items', () => {
        const items = [
            { text: 'old task', createdAt: old },
            { text: 'new task', createdAt: recent },
        ];
        const result = expirePendingActions(items);
        assert.equal(result.length, 1);
        assert.equal(result[0].text, 'new task');
    });
    it('drops legacy plain strings', () => {
        const result = expirePendingActions(['plain string', { text: 'valid', createdAt: recent }]);
        assert.equal(result.length, 1);
        assert.equal(result[0].text, 'valid');
    });
    it('deduplicates by text', () => {
        const items = [
            { text: 'same task', createdAt: recent },
            { text: 'same task', createdAt: recent },
        ];
        const result = expirePendingActions(items);
        assert.equal(result.length, 1);
    });
    it('caps at PENDING_ACTION_MAX (10)', () => {
        const items = Array.from({ length: 15 }, (_, i) => ({
            text: `task ${i}`,
            createdAt: recent,
        }));
        const result = expirePendingActions(items);
        assert.ok(result.length <= 10);
    });
    it('handles empty array', () => {
        assert.deepEqual(expirePendingActions([]), []);
    });
    it('handles non-array gracefully', () => {
        assert.deepEqual(expirePendingActions(null), []);
    });
});

describe('inferDecisionText', () => {
    it('returns empty for questions', () => {
        assert.equal(inferDecisionText('以后都用这个吗？'), '');
        assert.equal(inferDecisionText('Should we always use this?'), '');
    });
    it('returns empty for non-commitment statements', () => {
        assert.equal(inferDecisionText('今天天气不错'), '');
        assert.equal(inferDecisionText('I like this approach'), '');
    });
    it('captures Chinese commitment phrases', () => {
        assert.ok(inferDecisionText('以后都用TypeScript写').length > 0);
        assert.ok(inferDecisionText('从现在起统一用tabs缩进').length > 0);
    });
    it('captures English commitment phrases', () => {
        assert.ok(inferDecisionText("From now on always use ESM imports").length > 0);
        assert.ok(inferDecisionText("I've decided to use PostgreSQL").length > 0);
    });
    it('returns empty for empty input', () => {
        assert.equal(inferDecisionText(''), '');
        assert.equal(inferDecisionText(null), '');
    });
});

describe('normalizeChatKey', () => {
    it('returns __default__ for empty string', () => {
        assert.equal(normalizeChatKey(''), '__default__');
    });
    it('returns __default__ for null/undefined', () => {
        assert.equal(normalizeChatKey(null), '__default__');
        assert.equal(normalizeChatKey(undefined), '__default__');
    });
    it('returns the chatId unchanged when non-empty', () => {
        assert.equal(normalizeChatKey('chat-123'), 'chat-123');
        assert.equal(normalizeChatKey('abc'), 'abc');
    });
    it('trims whitespace', () => {
        assert.equal(normalizeChatKey('  '), '__default__');
        assert.equal(normalizeChatKey('  chat-1  '), 'chat-1');
    });
});
