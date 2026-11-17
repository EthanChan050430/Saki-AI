'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    emptyUsageTotals,
    normalizeUsageTotals,
    addUsageToTotals,
    cacheHitRate,
    createUsageTotalsFromHistory,
    buildContextBreakdown,
} = require('../services/usageStats.js');
const { createUsageTracker, contextStatusFromUsage } = require('../services/agentContext.js');

/** Runs a list of provider stream events through the tracker and returns the last report. */
function track(events) {
    let last = null;
    const feed = createUsageTracker(usage => { last = usage; });
    for (const event of events) feed(event);
    return last;
}

describe('createUsageTracker', () => {
    it('normalises DeepSeek hit/miss accounting', () => {
        const usage = track([{ usage: { prompt_tokens: 1000, completion_tokens: 50, prompt_cache_hit_tokens: 800, prompt_cache_miss_tokens: 200 } }]);
        assert.equal(usage.promptTokens, 1000);
        assert.equal(usage.cacheReadTokens, 800);
        assert.equal(usage.cacheCreationTokens, 0);
        assert.equal(usage.uncachedInputTokens, 200);
        assert.equal(usage.completionTokens, 50);
    });

    it('normalises Anthropic separate cache fields', () => {
        const usage = track([{ usage: { input_tokens: 300, cache_read_input_tokens: 900, cache_creation_input_tokens: 100, output_tokens: 40 } }]);
        assert.equal(usage.promptTokens, 1300);
        assert.equal(usage.cacheReadTokens, 900);
        assert.equal(usage.cacheCreationTokens, 100);
        assert.equal(usage.uncachedInputTokens, 300);
        assert.equal(usage.completionTokens, 40);
    });

    it('normalises OpenAI cached_tokens nested in prompt_tokens_details', () => {
        const usage = track([{ usage: { prompt_tokens: 2000, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 1500 } } }]);
        assert.equal(usage.cacheReadTokens, 1500);
        assert.equal(usage.uncachedInputTokens, 500);
    });

    it('treats a provider without cache fields as fully uncached', () => {
        const usage = track([{ usage: { prompt_tokens: 700, completion_tokens: 10 } }]);
        assert.equal(usage.cacheReadTokens, 0);
        assert.equal(usage.uncachedInputTokens, 700);
    });

    it('reads Ollama done counters', () => {
        const usage = track([{ done: true, prompt_eval_count: 400, eval_count: 12 }]);
        assert.equal(usage.promptTokens, 400);
        assert.equal(usage.completionTokens, 12);
    });

    it('ignores events without a usable usage report', () => {
        assert.equal(track([{ text: 'hi' }]), null);
    });
});

describe('contextStatusFromUsage', () => {
    it('counts only the input side as context occupancy', () => {
        const status = contextStatusFromUsage(
            { promptTokens: 320000, completionTokens: 2000, cacheReadTokens: 300000, uncachedInputTokens: 20000 },
            1000000,
            { provider: 'p', model: 'm' },
        );
        assert.equal(status.usedTokens, 320000);
        assert.equal(status.contextTokens, 320000);
        assert.equal(status.percent, 32);
        assert.equal(status.source, 'api');
        assert.equal(status.cacheReadTokens, 300000);
        assert.equal(status.provider, 'p');
    });
});

describe('normalizeUsageTotals', () => {
    it('returns zeros for junk input', () => {
        assert.deepEqual(normalizeUsageTotals(null), emptyUsageTotals());
        assert.deepEqual(normalizeUsageTotals('x'), emptyUsageTotals());
        assert.deepEqual(normalizeUsageTotals([]), emptyUsageTotals());
    });

    it('derives a missing input split and total', () => {
        const totals = normalizeUsageTotals({ uncachedInputTokens: 100, cacheReadTokens: 900, outputTokens: 50 });
        assert.equal(totals.inputTokens, 1000);
        assert.equal(totals.totalTokens, 1050);
    });

    it('clamps negative and fractional numbers', () => {
        const totals = normalizeUsageTotals({ requests: -3, inputTokens: -5, outputTokens: 10.7 });
        assert.equal(totals.requests, 0);
        assert.equal(totals.inputTokens, 0);
        assert.equal(totals.outputTokens, 10);
    });
});

describe('addUsageToTotals', () => {
    it('accumulates requests, input buckets and output', () => {
        let totals = emptyUsageTotals();
        totals = addUsageToTotals(totals, { promptTokens: 1000, completionTokens: 50, cacheReadTokens: 800, uncachedInputTokens: 200 });
        totals = addUsageToTotals(totals, { promptTokens: 500, completionTokens: 25, cacheReadTokens: 0, uncachedInputTokens: 500 });
        assert.equal(totals.requests, 2);
        assert.equal(totals.inputTokens, 1500);
        assert.equal(totals.cacheReadTokens, 800);
        assert.equal(totals.uncachedInputTokens, 700);
        assert.equal(totals.outputTokens, 75);
        assert.equal(totals.totalTokens, 1575);
    });

    it('never reports more cached tokens than input tokens', () => {
        const totals = addUsageToTotals(emptyUsageTotals(), {
            promptTokens: 100,
            completionTokens: 0,
            cacheReadTokens: 500,
            cacheCreationTokens: 500,
            uncachedInputTokens: 0,
        });
        assert.equal(totals.cacheReadTokens, 100);
        assert.equal(totals.cacheCreationTokens, 0);
        assert.equal(totals.inputTokens, 100);
    });

    it('does not mutate the input totals', () => {
        const base = emptyUsageTotals();
        addUsageToTotals(base, { promptTokens: 10, completionTokens: 1 });
        assert.equal(base.requests, 0);
        assert.equal(base.inputTokens, 0);
    });
});

describe('cacheHitRate', () => {
    it('matches the documented example: 98% with a 39M cache read', () => {
        const totals = {
            inputTokens: 39727701,
            uncachedInputTokens: 719957,
            cacheReadTokens: 39007744,
            cacheCreationTokens: 0,
            outputTokens: 147374,
            totalTokens: 39875075,
            requests: 120,
        };
        assert.equal(cacheHitRate(totals), 98);
        assert.equal(totals.uncachedInputTokens + totals.cacheReadTokens + totals.outputTokens, totals.totalTokens);
    });

    it('returns null before any input has been reported', () => {
        assert.equal(cacheHitRate(null), null);
        assert.equal(cacheHitRate(emptyUsageTotals()), null);
        assert.equal(cacheHitRate({ inputTokens: 0, cacheReadTokens: 5 }), null);
    });

    it('reports 0 for a fully uncached conversation', () => {
        assert.equal(cacheHitRate({ inputTokens: 1000, cacheReadTokens: 0 }), 0);
    });
});

describe('createUsageTotalsFromHistory', () => {
    it('returns zeros for an empty or unusable conversation', () => {
        assert.deepEqual(createUsageTotalsFromHistory([]), emptyUsageTotals());
        assert.deepEqual(createUsageTotalsFromHistory(null), emptyUsageTotals());
    });

    it('takes the newest recorded snapshot', () => {
        const history = [
            { role: 'assistant', contextStatus: { totals: { requests: 1, inputTokens: 100, outputTokens: 10, totalTokens: 110 } } },
            { role: 'user', content: 'next' },
            { role: 'assistant', contextStatus: { totals: { requests: 3, inputTokens: 900, outputTokens: 90, totalTokens: 990 } } },
        ];
        assert.equal(createUsageTotalsFromHistory(history).requests, 3);
        assert.equal(createUsageTotalsFromHistory(history).totalTokens, 990);
    });

    it('falls back to a message-level usageTotals snapshot', () => {
        const history = [{ role: 'assistant', usageTotals: { requests: 2, inputTokens: 50, outputTokens: 5, totalTokens: 55 } }];
        assert.equal(createUsageTotalsFromHistory(history).totalTokens, 55);
    });

    it('skips messages that recorded nothing and keeps scanning', () => {
        const history = [
            { role: 'assistant', contextStatus: { totals: { requests: 1, inputTokens: 10, outputTokens: 1, totalTokens: 11 } } },
            { role: 'assistant', contextStatus: { totals: null } },
        ];
        assert.equal(createUsageTotalsFromHistory(history).requests, 1);
    });

    it('backfills a legacy conversation from per-message request usage and flags it', () => {
        const history = [
            { role: 'assistant', contextStatus: { source: 'api', promptTokens: 1000, completionTokens: 50, cacheReadTokens: 800 } },
            { role: 'user', content: 'again' },
            { role: 'assistant', contextStatus: { source: 'api', promptTokens: 500, completionTokens: 25 } },
            { role: 'assistant', contextStatus: { source: 'estimate', usedTokens: 9999 } },
        ];
        const totals = createUsageTotalsFromHistory(history);
        assert.equal(totals.requests, 2);
        assert.equal(totals.inputTokens, 1500);
        assert.equal(totals.cacheReadTokens, 800);
        assert.equal(totals.uncachedInputTokens, 700);
        assert.equal(totals.outputTokens, 75);
        assert.equal(totals.totalTokens, 1575);
        assert.equal(totals.approximate, true);
    });

    it('does not flag a conversation with a real snapshot as approximate', () => {
        const history = [{ role: 'assistant', contextStatus: { totals: { requests: 2, inputTokens: 10, outputTokens: 1, totalTokens: 11 } } }];
        assert.equal(createUsageTotalsFromHistory(history).approximate, undefined);
    });
});

describe('buildContextBreakdown', () => {
    it('sums the three parts and flags them as estimates', () => {
        const breakdown = buildContextBreakdown({ systemTokens: 1600, toolTokens: 8200, messageTokens: 262000 });
        assert.equal(breakdown.systemTokens, 1600);
        assert.equal(breakdown.toolTokens, 8200);
        assert.equal(breakdown.messageTokens, 262000);
        assert.equal(breakdown.totalTokens, 271800);
        assert.equal(breakdown.estimated, true);
    });

    it('tolerates missing parts', () => {
        assert.deepEqual(buildContextBreakdown(), {
            systemTokens: 0, toolTokens: 0, messageTokens: 0, totalTokens: 0, estimated: true,
        });
    });
});
