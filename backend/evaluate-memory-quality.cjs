'use strict';

const fs = require('fs-extra');
const path = require('node:path');
const { MemoryService } = require('./services/memory');
const { evaluateRetrievalCases, assessMemoryHealth } = require('./services/memoryQuality');

const args = process.argv.slice(2);
const valueAfter = key => {
    const position = args.indexOf(key);
    return position >= 0 ? args[position + 1] : null;
};
// Some Windows npm wrappers consume the --store flag while forwarding its value.
const storePath = valueAfter('--store') || args.find(arg => /memory_store\.json$/i.test(arg)) || null;
const casesPath = valueAfter('--cases') || args.find(arg => /\.cases\.json$/i.test(arg)) || null;
if (args.includes('--help')) {
    console.log('Usage: npm run memory:quality -- [--store PATH_TO_memory_store.json] [--cases LABELED_CASES.json]');
    console.log('No arguments runs a synthetic regression dataset. --store uses real storage read-only.');
    process.exit(0);
}

const syntheticMemories = [
    { id: 'trip', name: 'Travel budget', summary: 'The annual travel budget for work trips', content: 'Budget for business trips and travel expenses' },
    { id: 'study', name: 'Study plan', summary: 'Study IELTS vocabulary', content: 'IELTS reading practice and English vocabulary goals' },
    { id: 'ui', name: 'Design preference', summary: 'Prefers minimalist interface', content: 'Use a clean UI with simple typography' },
    { id: 'weather', name: 'Weather project', summary: 'Python weather app', content: 'Building a Python weather report generator' },
    { id: 'database', name: 'Database project', summary: 'Working with SQLite', content: 'Developing a local sqlite database for offline storage' },
    { id: 'slides', name: 'Presentation project', summary: 'Making slides', content: 'Create a PPT presentation for a class assignment' },
].map(item => ({ ...item, importance: 0.8, tags: [], aliases: [] }));

const syntheticCases = [
    { query: 'travel budget', expectedIds: ['trip'] },
    { query: 'IELTS vocabulary', expectedIds: ['study'] },
    { query: 'minimalist interface', expectedIds: ['ui'] },
    { query: 'python weather', expectedIds: ['weather'] },
    { query: 'sqlite offline storage', expectedIds: ['database'] },
    { query: 'ppt slides', expectedIds: ['slides'] },
    { query: 'unrelated quasarflux', expectedIds: [] },
    { query: 'zzzxnomatch', expectedIds: [] },
];

async function readOptionalJson(filePath, fallback) {
    return filePath && await fs.pathExists(filePath) ? fs.readJson(filePath) : fallback;
}

async function main() {
    const root = storePath ? path.dirname(path.resolve(storePath)) : null;
    const memoryStore = storePath ? await fs.readJson(path.resolve(storePath))
        : { memories: syntheticMemories, tombstones: [] };
    if (!Array.isArray(memoryStore.memories)) throw new Error('Store must contain memories array');
    const [vectorStore, sleepStore, knowledgeGraph, captureQueue] = await Promise.all([
        readOptionalJson(root && path.join(root, 'memory_vectors.json'), { vectors: {} }),
        readOptionalJson(root && path.join(root, 'memory_sleep_queue.json'), { queue: [], runs: [] }),
        readOptionalJson(root && path.join(root, 'memory_knowledge_graph.json'), { entities: [], relations: [] }),
        readOptionalJson(root && path.join(root, 'memory_capture_jobs.json'), { jobs: [] }),
    ]);

    const health = assessMemoryHealth({ memoryStore, vectorStore, sleepStore, knowledgeGraph, captureQueue });
    const labeled = casesPath ? await fs.readJson(path.resolve(casesPath)) : null;
    const cases = labeled ? (Array.isArray(labeled) ? labeled : labeled.cases) : storePath ? null : syntheticCases;
    let retrieval = null;
    if (cases) {
        const service = new MemoryService({ dataDir: root || 'unused', memoriesDir: root || 'unused', embeddingMode: 'keyword' });
        service.loadStore = async () => memoryStore;
        service.isInScope = () => true;
        service.getSemanticScores = async () => new Map();
        retrieval = await evaluateRetrievalCases(cases, (query, limit) => service.searchMemories(query, limit));
    }

    console.log(JSON.stringify({
        evaluatedAt: new Date().toISOString(),
        dataset: storePath ? 'local-store-read-only' : 'synthetic',
        limitations: 'Retrieval scoring is lexical unless an embedding evaluator is configured. Extraction accuracy needs labeled real conversations.',
        health,
        retrieval,
    }, null, 2));
}

main().catch(error => { console.error('[Memory Quality]', error.stack || error.message); process.exitCode = 1; });
