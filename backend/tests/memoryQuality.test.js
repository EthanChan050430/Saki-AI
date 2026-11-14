'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateRetrievalCases, assessMemoryHealth } = require('../services/memoryQuality');

test('labeled recall measures positives and clean negatives', async () => {
    const catalog = {
        alpha: [{ id: 'a' }, { id: 'b' }],
        beta: [{ id: 'x' }],
        zzz: [],
    };
    const result = await evaluateRetrievalCases([
        { query: 'alpha', expectedIds: ['b'] },
        { query: 'beta', expectedIds: ['x'] },
        { query: 'zzz', expectedIds: [] },
    ], async query => catalog[query]);
    assert.equal(result.hitAt1, 0.5);
    assert.equal(result.hitAtK, 1);
    assert.equal(result.meanReciprocalRank, 0.75);
    assert.equal(result.negativeSpecificity, 1);
});

test('storage-health detects index drift, outstanding purges and failed captures', () => {
    const report = assessMemoryHealth({
        memoryStore: {
            memories: [
                { id: 'a', updatedAt: 'recent', auto: true, factKey: 'user.preference' },
                { id: 'b', updatedAt: 'recent', auto: true, factKey: 'user.preference' },
                { id: 'c', updatedAt: 'old', provenance: { chatId: 'example' } },
            ],
            tombstones: [{ purgePending: true }],
        },
        vectorStore: { vectors: {
            a: { updatedAt: 'old' },
            stale: { updatedAt: 'recent' },
        } },
        sleepStore: { queue: [{ id: 'q1' }], runs: [] },
        captureQueue: { jobs: [{ status: 'failed' }, { status: 'pending' }] },
    });
    assert.equal(report.staleVectors, 1);
    assert.equal(report.orphanVectors, 1);
    assert.equal(report.unindexedMemories, 2);
    assert.equal(report.duplicateActiveFactKeys, 1);
    assert.equal(report.unresolvedDeletions, 1);
    assert.equal(report.failedCaptureJobs, 1);
    assert.equal(report.neverConsolidated, true);
});
