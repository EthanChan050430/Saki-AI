'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { MemoryService } = require('../services/memory');

function fixture() {
    const service = new MemoryService({ dataDir: 'unused', memoriesDir: 'unused', embeddingMode: 'off' });
    const unrelated = { id: 'other', name: 'Gardening', summary: 'Flowers', content: 'Water roses', importance: 1, tags: [], aliases: [] };
    const relevant = { ...unrelated, id: 'match', name: 'Quasarflux', summary: 'Quasarflux notes', importance: 0 };
    service.loadStore = async () => ({ memories: [unrelated, relevant] });
    service.getSemanticScores = async () => new Map();
    service.loadSleepStore = async () => ({ queue: [unrelated, relevant] });
    service.loadShortTermStore = async () => ({ chats: { chat: { topics: {
        other: { ...unrelated, topicLabel: unrelated.name },
        match: { ...relevant, topicLabel: relevant.name },
    } } } });
    return service;
}

test('importance cannot admit unrelated long-term, pending or short-term memories', async () => {
    const service = fixture();
    assert.deepEqual((await service.searchMemories('quasarflux')).map(item => item.id), ['match']);
    assert.deepEqual((await service.searchPendingMemories('quasarflux')).map(item => item.id), ['match']);
    assert.deepEqual((await service.getShortTermContext('chat', 'quasarflux')).topics.map(item => item.id), ['match']);
    assert.deepEqual(await service.searchMemories('zzzxnomatch'), []);
});

test('semantic relevance remains usable but weak similarities cannot bypass the gate', async () => {
    const service = fixture();
    service.getSemanticScores = async () => new Map([['other', 0.17], ['match', 0.5]]);
    assert.deepEqual((await service.searchMemories('zzzxnomatch')).map(item => item.id), ['match']);
});

test('KG confidence and completeness do not count as query matches; empty browse remains available', async () => {
    const service = fixture();
    service.loadKnowledgeGraph = async () => ({
        entities: [{ name: 'Flowers', summary: 'Roses', confidence: 0.99 }, { name: 'Quasarflux', confidence: 0.2 }],
        relations: [{ subject: 'Flowers', object: 'Garden', confidence: 0.99 }, { subject: 'Quasarflux', object: 'Star', confidence: 0.2 }],
    });
    const matches = await service.searchKnowledgeGraph('quasarflux');
    assert.equal(matches.length, 2);
    assert.deepEqual(await service.searchKnowledgeGraph('zzzxnomatch'), []);
    assert.equal((await service.searchKnowledgeGraph('')).length, 4);
});