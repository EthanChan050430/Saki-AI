'use strict';

function round(value) { return Math.round((Number(value) || 0) * 1000) / 1000; }

async function evaluateRetrievalCases(cases, retrieve, { limit = 3 } = {}) {
    const results = [];
    let positive = 0;
    let top1 = 0;
    let topK = 0;
    let rr = 0;
    let negative = 0;
    let correctNegative = 0;
    for (const item of cases || []) {
        if (!item || typeof item.query !== 'string' || !Array.isArray(item.expectedIds)) {
            throw new Error('Each case needs a query and expectedIds array');
        }
        const found = await retrieve(item.query, limit);
        const ids = found.map(entry => entry.id);
        const expected = new Set(item.expectedIds);
        const rank = ids.findIndex(id => expected.has(id));
        if (expected.size) {
            positive++;
            if (rank === 0) top1++;
            if (rank >= 0) {
                topK++;
                rr += 1 / (rank + 1);
            }
        } else {
            negative++;
            if (!ids.length) correctNegative++;
        }
        results.push({
            query: item.query,
            expectedIds: item.expectedIds,
            returnedIds: ids,
            passed: expected.size ? rank >= 0 : ids.length === 0,
            rank: rank < 0 ? null : rank + 1,
        });
    }
    return {
        type: 'labeled-retrieval',
        caseCount: results.length,
        positiveCases: positive,
        negativeCases: negative,
        hitAt1: positive ? round(top1 / positive) : null,
        hitAtK: positive ? round(topK / positive) : null,
        meanReciprocalRank: positive ? round(rr / positive) : null,
        negativeSpecificity: negative ? round(correctNegative / negative) : null,
        k: limit,
        cases: results,
    };
}

function assessMemoryHealth({ memoryStore = {}, vectorStore = {}, sleepStore = {}, knowledgeGraph = {}, captureQueue = {} } = {}) {
    const memories = Array.isArray(memoryStore.memories) ? memoryStore.memories : [];
    const vectors = vectorStore.vectors || {};
    const liveById = new Map(memories.map(memory => [memory.id, memory]));
    const factKeys = new Map();
    for (const memory of memories) {
        if (!memory.factKey) continue;
        const key = `${memory.scopeId || ''}:${memory.factKey}`;
        factKeys.set(key, (factKeys.get(key) || 0) + 1);
    }
    const queueJobs = Array.isArray(captureQueue.jobs) ? captureQueue.jobs : [];
    const sleepQueue = Array.isArray(sleepStore.queue) ? sleepStore.queue : [];
    return {
        type: 'storage-health',
        longTermMemories: memories.length,
        vectors: Object.keys(vectors).length,
        unindexedMemories: memories.filter(memory => !vectors[memory.id]).length,
        staleVectors: memories.filter(memory =>
            vectors[memory.id] && vectors[memory.id].updatedAt !== memory.updatedAt
        ).length,
        orphanVectors: Object.keys(vectors).filter(id => !liveById.has(id)).length,
        unsourcedAutoMemories: memories.filter(memory => memory.auto && !memory.provenance).length,
        duplicateActiveFactKeys: [...factKeys.values()].filter(count => count > 1).length,
        unresolvedDeletions: (memoryStore.tombstones || []).filter(item => item.purgePending).length,
        sleepingCandidates: sleepQueue.length,
        neverConsolidated: sleepQueue.length > 0 && !(sleepStore.runs || []).length,
        graphEntities: (knowledgeGraph.entities || []).length,
        graphRelations: (knowledgeGraph.relations || []).length,
        pendingCaptureJobs: Number.isFinite(captureQueue.pending)
            ? captureQueue.pending + (captureQueue.running || 0)
            : queueJobs.filter(job => job.status === 'pending' || job.status === 'running').length,
        failedCaptureJobs: Number.isFinite(captureQueue.failed)
            ? captureQueue.failed
            : queueJobs.filter(job => job.status === 'failed').length,
    };
}

module.exports = { evaluateRetrievalCases, assessMemoryHealth };
