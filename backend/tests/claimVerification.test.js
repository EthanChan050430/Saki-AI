const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyClaim } = require('../services/claimVerification');
const { createToolRegistry, parseToolCalls } = require('../services/agentTools');
const { nativeToolsFromRegistry } = require('../services/nativeToolCalling');

test('verification is available on demand through both tool protocols', () => {
    const registry = createToolRegistry();
    assert.equal(parseToolCalls('verifyClaim("Mars water discovery")', registry)[0].name, 'verifyClaim');
    const tool = nativeToolsFromRegistry(registry).tools.find(item => item.function.name === 'verifyClaim');
    assert.deepEqual(tool.function.parameters.required, ['claim']);
});

test('partial search failure preserves readable page evidence and reports the error', async () => {
    const result = await verifyClaim('Mars water discovery', {}, {
        search: async query => {
            if (query.includes('official')) throw new Error('provider unavailable');
            return [{ title: 'Mars water discovery', url: 'https://science.nasa.gov/mars/', content: 'Mars water discovery summary.' }];
        },
        crawl: async () => 'Mars water discovery observations require further confirmation. '.repeat(15),
    });
    assert.equal(result.status, 'evidence-collected');
    assert.equal(result.sources[0].evidenceType, 'page');
    assert.match(result.sources[0].evidence, /further confirmation/);
    assert.equal(result.errors[0].error, 'provider unavailable');
});

test('verification deduplicates sources and reports failed page reads without inventing a verdict', async () => {
    const result = await verifyClaim('Mars water discovery', {}, {
        search: async () => [{ title: 'Mars water discovery', url: 'https://science.nasa.gov/mars/', content: 'Mars water discovery evidence remains uncertain.' }],
        crawl: async () => { throw new Error('network unavailable'); },
    });
    assert.equal(result.sources.length, 1);
    assert.equal(result.sources[0].evidenceType, 'search-snippet');
    assert.equal(result.sources[0].readError, 'network unavailable');
    assert.match(result.sources[0].evidence, /Mars water/);
    assert.equal(result.score, undefined);
    assert.equal(result.verdict, undefined);
});

test('missing evidence is explicit and search failures propagate', async () => {
    const result = await verifyClaim('Mars water discovery', {}, { search: async () => [] });
    assert.equal(result.status, 'insufficient-evidence');
    await assert.rejects(verifyClaim('', {}), /non-empty/);
    await assert.rejects(verifyClaim('Mars water discovery', {}, { search: async () => { throw new Error('offline'); } }), /Verification search failed/);
});
