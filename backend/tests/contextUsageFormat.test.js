'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let contextUsage = null;

before(async () => {
    const entry = path.join(__dirname, '..', '..', 'frontend', 'src', 'utils', 'contextUsage.js');
    contextUsage = await import(pathToFileURL(entry).href);
});

describe('formatTokenCount', () => {
    it('groups thousands', () => {
        assert.equal(contextUsage.formatTokenCount(39875075), '39,875,075');
        assert.equal(contextUsage.formatTokenCount(719957), '719,957');
        assert.equal(contextUsage.formatTokenCount(999), '999');
    });
    it('renders zero for empty or invalid input', () => {
        assert.equal(contextUsage.formatTokenCount(0), '0');
        assert.equal(contextUsage.formatTokenCount(null), '0');
        assert.equal(contextUsage.formatTokenCount(-5), '0');
        assert.equal(contextUsage.formatTokenCount('abc'), '0');
    });
});

describe('formatCompactTokenCount', () => {
    it('uses K and M suffixes the panel shows', () => {
        assert.equal(contextUsage.formatCompactTokenCount(262000), '262K');
        assert.equal(contextUsage.formatCompactTokenCount(319000), '319K');
        assert.equal(contextUsage.formatCompactTokenCount(1600), '1.6K');
        assert.equal(contextUsage.formatCompactTokenCount(8200), '8.2K');
        assert.equal(contextUsage.formatCompactTokenCount(1000000), '1M');
        assert.equal(contextUsage.formatCompactTokenCount(1250000), '1.3M');
    });
    it('keeps small values exact and rounds the boundary up', () => {
        assert.equal(contextUsage.formatCompactTokenCount(820), '820');
        assert.equal(contextUsage.formatCompactTokenCount(0), '0');
        assert.equal(contextUsage.formatCompactTokenCount(999999), '1M');
        assert.equal(contextUsage.formatCompactTokenCount(999400), '999K');
    });
});

describe('calculateCacheHitRate', () => {
    it('matches the documented 98% example', () => {
        assert.equal(contextUsage.calculateCacheHitRate({
            inputTokens: 39727701,
            cacheReadTokens: 39007744,
            uncachedInputTokens: 719957,
            outputTokens: 147374,
            totalTokens: 39875075,
        }), 98);
    });
    it('returns null with no input and 0 when nothing was cached', () => {
        assert.equal(contextUsage.calculateCacheHitRate(null), null);
        assert.equal(contextUsage.calculateCacheHitRate({ inputTokens: 0 }), null);
        assert.equal(contextUsage.calculateCacheHitRate({ inputTokens: 1000, cacheReadTokens: 0 }), 0);
    });
});

describe('collectRecordedUsage', () => {
    it('takes the newest snapshot and its breakdown', () => {
        const breakdown = { systemTokens: 1, toolTokens: 2, messageTokens: 3, totalTokens: 6 };
        const messages = [
            { role: 'assistant', contextStatus: { totals: { requests: 1, totalTokens: 10 } } },
            { role: 'user', content: 'more' },
            { role: 'assistant', contextStatus: { totals: { requests: 2, totalTokens: 20 }, breakdown } },
        ];
        const recorded = contextUsage.collectRecordedUsage(messages);
        assert.equal(recorded.totals.requests, 2);
        assert.equal(recorded.breakdown, breakdown);
    });

    it('returns nulls for a conversation recorded before this feature', () => {
        const recorded = contextUsage.collectRecordedUsage([{ role: 'assistant', parts: [] }]);
        assert.equal(recorded.totals, null);
        assert.equal(recorded.breakdown, null);
    });
});

describe('calculateContextStatusFromMessages', () => {
    const config = { provider: 'custom', model: 'claude-haiku-5-5' };

    it('returns null without messages', () => {
        assert.equal(contextUsage.calculateContextStatusFromMessages([], config), null);
    });

    it('keeps the measured status, totals and breakdown for the matching route', () => {
        const totals = { requests: 4, inputTokens: 900, cacheReadTokens: 800, outputTokens: 40, totalTokens: 940 };
        const breakdown = { systemTokens: 10, toolTokens: 20, messageTokens: 30, totalTokens: 60 };
        const status = contextUsage.calculateContextStatusFromMessages([{
            role: 'assistant',
            contextStatus: { source: 'api', provider: 'custom', model: 'claude-haiku-5-5', usedTokens: 900, totals, breakdown },
        }], config);
        assert.equal(status.usedTokens, 900);
        assert.equal(status.totals, totals);
        assert.equal(status.breakdown, breakdown);
        assert.equal(status.percent, Math.min(100, Math.round(900 / status.budgetTokens * 100)));
    });

    it('falls back to an estimate on a route change but still surfaces usage', () => {
        const totals = { requests: 4, inputTokens: 900, outputTokens: 40, totalTokens: 940 };
        const status = contextUsage.calculateContextStatusFromMessages([
            { role: 'user', content: 'hello' },
            { role: 'assistant', contextStatus: { source: 'api', provider: 'other', model: 'x', usedTokens: 900, totals } },
            { role: 'user', content: 'again' },
        ], config);
        assert.equal(status.estimated, true);
        assert.equal(status.totals, totals);
        assert.ok(status.usedTokens > 0);
    });

    it('reports no usage for a conversation that never recorded any', () => {
        const status = contextUsage.calculateContextStatusFromMessages([
            { role: 'user', content: 'hello' },
            { role: 'assistant', parts: [{ type: 'text', content: 'hi' }] },
        ], config);
        assert.equal(status.totals, null);
        assert.equal(status.breakdown, null);
    });
});
