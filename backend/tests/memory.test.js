const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs-extra');

const { MemoryService } = require('../services/memory');

async function createService(t) {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'memory-service-'));
    const dataDir = path.join(rootDir, 'data');
    const memoriesDir = path.join(dataDir, 'memories');
    await fs.ensureDir(memoriesDir);

    const service = new MemoryService({ dataDir, memoriesDir });
    service.embeddingDisabled = true;
    await service.init();

    t.after(async () => {
        await fs.remove(rootDir);
    });

    return service;
}

test('explicit remember requests save immediately without using the sleep queue', async (t) => {
    const service = await createService(t);

    const result = await service.autoCaptureFromTurn({
        chatId: 'chat-explicit',
        userMessage: 'Please remember that I dislike cilantro in any meal recommendation.',
        assistantMessage: 'Understood. I will avoid cilantro in future suggestions.',
    });

    const memories = await service.listMemories();
    const sleepStore = await service.loadSleepStore();
    const shortTerm = await service.getShortTermContext('chat-explicit', 'cilantro', 4);

    assert.equal(result.saved.length, 1);
    assert.equal(memories.length, 1);
    assert.match(memories[0].preview, /cilantro/i);
    assert.equal(sleepStore.queue.length, 0);
    assert.ok(shortTerm.topics.length >= 1);
});

test('non-explicit user preferences are proactively promoted to long-term memory', async (t) => {
    const service = await createService(t);

    const result = await service.autoCaptureFromTurn({
        chatId: 'chat-preference',
        userMessage: 'I usually drink oat milk and I dislike cilantro in noodles.',
        assistantMessage: 'I will use oat milk and avoid cilantro in future food suggestions.',
    });

    const memories = await service.listMemories();
    const results = await service.searchMemories('oat milk cilantro', 4);
    const sleepStore = await service.loadSleepStore();

    assert.ok(result.saved.length >= 1);
    assert.ok(memories.length >= 1);
    assert.ok(results.length >= 1);
    assert.equal(results[0].category, 'preference');
    assert.match(`${results[0].summary}\n${results[0].content}`, /oat milk|cilantro/i);
    assert.equal(sleepStore.queue.length, 0);
});

test('non-explicit identity facts are proactively promoted to long-term memory', async (t) => {
    const service = await createService(t);

    const result = await service.autoCaptureFromTurn({
        chatId: 'chat-identity',
        userMessage: 'I am Ethan, and I work as a product designer in Shanghai.',
        assistantMessage: 'Got it, Ethan. I will keep your product design background in mind.',
    });

    const memories = await service.listMemories();
    const results = await service.searchMemories('Ethan product designer Shanghai', 4);

    assert.ok(result.saved.length >= 1);
    assert.ok(memories.length >= 1);
    assert.ok(results.length >= 1);
    assert.equal(results[0].category, 'identity');
    assert.match(`${results[0].summary}\n${results[0].content}`, /Ethan|product designer|Shanghai/i);
});

test('non-explicit durable facts stay in short-term and pending layers before consolidation', async (t) => {
    const service = await createService(t);

    await service.autoCaptureFromTurn({
        chatId: 'chat-roadmap',
        userMessage: 'Our Phoenix launch roadmap should keep the April alpha milestone and the partner onboarding checklist together.',
        assistantMessage: 'I will keep the Phoenix launch roadmap centered on April alpha plus partner onboarding.',
    });

    const memories = await service.listMemories();
    const pending = await service.searchPendingMemories('Phoenix roadmap', 4);
    const context = await service.buildContext({ query: 'Phoenix roadmap', chatId: 'chat-roadmap', limit: 6 });
    const system = await service.getSystemStatus();

    assert.equal(memories.length, 0);
    assert.ok(pending.length >= 1);
    assert.ok(system.shortTermTopicCount >= 1);
    assert.match(context.summaryText, /Short-Term Topics:/);
    assert.match(context.summaryText, /Pending Sleep Queue:/);
});

test('sleep consolidation merges staged topic memories into long-term storage', async (t) => {
    const service = await createService(t);

    const turns = [
        'Our Phoenix launch roadmap includes an April alpha and a May beta milestone.',
        'For the Phoenix launch roadmap, keep enterprise rollout and partner onboarding in the same plan.',
        'The Phoenix launch roadmap also needs a launch retro and owner list after beta.',
    ];

    for (const userMessage of turns) {
        await service.autoCaptureFromTurn({
            chatId: 'chat-consolidate',
            userMessage,
            assistantMessage: 'Captured for the Phoenix launch roadmap context.',
        });
    }

    const beforeSleep = await service.listMemories();
    assert.equal(beforeSleep.length, 0);

    const sleepRun = await service.runSleepCycle({ force: true, reason: 'test' });
    const memories = await service.listMemories();
    const results = await service.searchMemories('Phoenix roadmap enterprise rollout', 4);
    const system = await service.getSystemStatus();

    assert.ok(sleepRun.processed >= 1);
    assert.ok(memories.length >= 1);
    assert.ok(results.length >= 1);
    assert.equal(results[0].category, 'project');
    assert.match(`${results[0].summary}\n${results[0].content}`, /Phoenix|roadmap|enterprise/i);
    assert.ok(system.lastSleepCycleAt);
    assert.equal(system.pendingQueueSize, 0);
});
