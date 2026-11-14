'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs-extra');
const os = require('node:os');
const path = require('node:path');
const { MemoryService } = require('../services/memory');
const { OfflineReflectionService } = require('../services/offlineReflection');
const { MemoryReviewService } = require('../services/memoryReview');

async function fixture(t) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'saki-manual-review-'));
    t.after(() => fs.remove(root));
    const memoryService = new MemoryService({
        workspaceDir: root,
        dataDir: path.join(root, 'data'),
        memoriesDir: path.join(root, 'memories'),
        embeddingMode: 'keyword',
    });
    await memoryService.init();
    const reflectionService = new OfflineReflectionService({
        dataDir: memoryService.dataDir,
        workspaceRoot: root,
        sessionsDir: path.join(root, 'sessions'),
        memoryService,
    });
    const reviewService = new MemoryReviewService({
        reflectionService, memoryService, dataDir: memoryService.dataDir,
    });
    const day = reflectionService.localDateKey(new Date());
    reflectionService.collectDailyInputs = async () => ({
        dateKey: day,
        fileDigests: [],
        sessionSummaries: [{
            chatId: 'one',
            updatedAt: new Date().toISOString(),
            title: 'Preferences',
            transcript: 'User: I prefer green tea\nAssistant: Acknowledged',
            userMessages: ['I prefer green tea'],
        }],
    });
    return { memoryService, reflectionService, reviewService, day };
}

const output = JSON.stringify({
    summary: 'The user discussed a beverage preference.',
    memoryCandidates: [
        { name: 'Drink Preference', content: 'I prefer green tea', summary: 'Green tea',
            evidenceText: 'I prefer green tea', category: 'preference', factKey: 'user.drink' },
        { name: 'Unsupported', content: 'I prefer coffee', summary: 'Coffee',
            evidenceText: 'I prefer coffee', category: 'preference' },
    ],
    entities: [{ name: 'Tea', type: 'preference', summary: 'Green tea preference' }],
    relations: [{ subject: 'User', predicate: 'preferred_drink', object: 'Green tea', evidence: 'Green tea' }],
});

test('manual reflection follows the configured API model, and drafting never writes memories', async t => {
    const { reflectionService, memoryService, reviewService, day } = await fixture(t);
    assert.deepEqual(reflectionService.resolveModelSelection({
        provider: 'deepseek', model: 'deepseek-chat',
        offlineReflectionProvider: 'ollama', offlineReflectionModel: 'stale-local',
    }), { provider: 'deepseek', model: 'deepseek-chat' });
    let calledWith;
    const draft = await reviewService.generate({
        dateKey: day,
        config: { provider: 'deepseek', model: 'deepseek-chat' },
        callModel: async request => {
            calledWith = request;
            return output;
        },
    });
    assert.equal(calledWith.provider, 'deepseek');
    assert.equal(calledWith.model, 'deepseek-chat');
    assert.equal(draft.memoryCandidates.length, 1, 'fabricated evidence is rejected');
    assert.equal(draft.entities[0].selected, false);
    assert.equal(draft.relations[0].selected, false);
    assert.equal((await memoryService.loadStore()).memories.length, 0);
    assert.equal((await memoryService.loadKnowledgeGraph()).entities.length, 0);
    const reloaded = new MemoryReviewService({
        reflectionService, memoryService, dataDir: memoryService.dataDir,
    });
    assert.equal((await reloaded.getDraft()).id, draft.id, 'draft survives service restart');
    await assert.rejects(reloaded.generate({
        dateKey: day, config: { provider: 'openai', model: 'gpt-4o' },
        callModel: async () => output,
    }), /existing draft/i);
});

test('reviewer can correct and select evidence-backed memories before an explicit commit', async t => {
    const { memoryService, reviewService, day } = await fixture(t);
    const draft = await reviewService.generate({
        dateKey: day, config: { provider: 'openai', model: 'gpt-4o' },
        callModel: async () => output,
    });
    const edit = {
        ...draft,
        draftId: draft.id,
        memoryCandidates: [{ ...draft.memoryCandidates[0],
            content: 'User currently prefers green tea, not coffee',
            summary: 'Green tea is the current choice',
            evidenceText: 'forged evidence' }],
        entities: [{ ...draft.entities[0], selected: true }],
        relations: draft.relations,
    };
    const revised = await reviewService.saveDraft(edit);
    assert.equal(revised.memoryCandidates[0].evidenceText, 'I prefer green tea');
    assert.equal(revised.memoryCandidates[0].content, 'User currently prefers green tea, not coffee');
    assert.equal((await memoryService.loadStore()).memories.length, 0);
    const committed = await reviewService.commit(draft.id);
    assert.equal(committed.savedCount, 1);
    assert.equal(committed.entityCount, 1);
    assert.equal(committed.relationCount, 0);
    const saved = (await memoryService.loadStore()).memories;
    assert.equal(saved.length, 1);
    assert.equal(saved[0].provenance.evidenceText, 'I prefer green tea');
    assert.equal(saved[0].content, 'User currently prefers green tea, not coffee');
    assert.equal((await memoryService.loadKnowledgeGraph()).entities.length, 1);
    await assert.rejects(reviewService.commit(draft.id), /No reviewable draft/);
});

test('draft can be discarded without any writes', async t => {
    const { reviewService, memoryService, day } = await fixture(t);
    const draft = await reviewService.generate({
        dateKey: day, config: { provider: 'custom', model: 'user-model' },
        callModel: async () => output,
    });
    await reviewService.discard(draft.id);
    assert.equal(await reviewService.getDraft(), null);
    assert.equal((await memoryService.loadStore()).memories.length, 0);
});

test('manual review can accept or discard sleep candidates with corrections', async t => {
    const { memoryService } = await fixture(t);
    const queued = await memoryService.enqueueSleepCandidates([
        { topicKey: 'tea', topicLabel: 'Green tea', content: 'I prefer green tea',
            category: 'preference', importance: 0.5 },
        { topicKey: 'weather', topicLabel: 'Weather chat', content: 'It rained',
            category: 'general', importance: 0.5 },
    ]);
    await memoryService.reviewPendingMemory({
        id: queued[0].id,
        action: 'approve',
        changes: { name: 'Green tea', content: 'Currently prefers tea', summary: 'Tea choice' },
    });
    const store = await memoryService.loadStore();
    assert.equal(store.memories.length, 1);
    assert.equal(store.memories[0].content, 'Currently prefers tea');
    await memoryService.reviewPendingMemory({ id: queued[1].id, action: 'discard' });
    assert.equal((await memoryService.loadSleepStore()).queue.length, 0);
    assert.equal((await memoryService.loadStore()).memories.length, 1);
});

test('legacy offline reflection entry point is manual-only and does not call the model', async t => {
    const { reflectionService, memoryService } = await fixture(t);
    let called = false;
    const result = await reflectionService.maybeRun({
        config: { offlineReflectionEnabled: true },
        callModel: async () => { called = true; return output; },
    });
    assert.equal(result.status, 'manual-only');
    assert.equal(called, false);
    assert.equal((await memoryService.loadStore()).memories.length, 0);
});

test('automatic sleep review stays paused, even when older candidates are due', async t => {
    const { memoryService } = await fixture(t);
    await memoryService.enqueueSleepCandidates([{
        topicKey: 'study-plan', topicLabel: 'Study plan', content: 'I am studying English',
        category: 'identity', importance: 0.95,
    }]);
    const result = await memoryService.maybeRunSleepCycle({ force: true, reason: 'legacy-timer' });
    assert.equal(result.manualOnly, true);
    assert.equal((await memoryService.loadSleepStore()).queue.length, 1);
    assert.equal((await memoryService.loadStore()).memories.length, 0);
});

test('deleting a memory scrubs a matching proposal from a manual review draft', async t => {
    const { memoryService, reviewService, day } = await fixture(t);
    const draft = await reviewService.generate({
        dateKey: day, config: { provider: 'deepseek', model: 'deepseek-chat' },
        callModel: async () => output,
    });
    assert.equal(draft.memoryCandidates.length, 1);
    await memoryService.upsertMemory({ name: 'Drink Preference', content: 'I prefer green tea' });
    await memoryService.deleteMemory('Drink Preference');
    const remaining = await reviewService.getDraft();
    assert.equal(remaining.memoryCandidates.length, 0);
});

test('empty approval leaves the manual draft editable rather than committing it', async t => {
    const { reviewService, day } = await fixture(t);
    const draft = await reviewService.generate({
        dateKey: day, config: { provider: 'openai', model: 'configured-model' },
        callModel: async () => output,
    });
    await reviewService.saveDraft({
        draftId: draft.id,
        memoryCandidates: draft.memoryCandidates.map(item => ({ ...item, selected: false })),
        entities: draft.entities,
        relations: draft.relations,
    });
    await assert.rejects(reviewService.commit(draft.id), /Select at least one/);
    assert.equal((await reviewService.getDraft()).status, 'pending');
});
