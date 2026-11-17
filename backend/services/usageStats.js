'use strict';

/**
 * Token accounting for one conversation.
 *
 * Providers disagree about what "input tokens" means:
 *   - Anthropic reports `input_tokens` *excluding* cache reads/writes, which are
 *     separate fields.
 *   - DeepSeek reports `prompt_tokens` including `prompt_cache_hit_tokens`, and a
 *     matching miss count.
 *   - OpenAI reports `prompt_tokens` including `prompt_tokens_details.cached_tokens`.
 *
 * Everything is normalised here to three disjoint buckets plus output, so a
 * cache-hit rate and a total can be computed without provider-specific branches
 * leaking into the UI:
 *
 *   uncachedInput + cacheRead + cacheCreation + output = totalTokens
 */

const USAGE_TOTAL_FIELDS = Object.freeze([
    'requests',
    'inputTokens',
    'uncachedInputTokens',
    'cacheReadTokens',
    'cacheCreationTokens',
    'outputTokens',
    'totalTokens',
]);

function toCount(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return 0;
    return Math.floor(number);
}

function emptyUsageTotals() {
    return {
        requests: 0,
        inputTokens: 0,
        uncachedInputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
    };
}

/**
 * Coerces anything that reached disk or the wire (older sessions, a client
 * payload, a provider extension) into the canonical totals shape.
 */
function normalizeUsageTotals(raw) {
    const totals = emptyUsageTotals();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return totals;
    for (const field of USAGE_TOTAL_FIELDS) totals[field] = toCount(raw[field]);
    // A total recorded by an older build may omit the split; trust what is present.
    if (totals.inputTokens === 0) {
        totals.inputTokens = totals.uncachedInputTokens + totals.cacheReadTokens + totals.cacheCreationTokens;
    }
    if (totals.totalTokens === 0) {
        totals.totalTokens = totals.inputTokens + totals.outputTokens;
    }
    if (raw.approximate === true) totals.approximate = true;
    return totals;
}

function cacheHitRate(totals) {
    const input = toCount(totals?.inputTokens);
    if (input <= 0) return null;
    return Math.min(100, Math.round((toCount(totals?.cacheReadTokens) / input) * 100));
}

/**
 * Adds one provider usage report to the running totals.
 *
 * `usage` is the normalised shape emitted by `createUsageTracker`:
 * `{ promptTokens, completionTokens, cacheReadTokens, cacheCreationTokens, uncachedInputTokens }`.
 * Missing cache fields are treated as a fully uncached request rather than
 * silently reporting a 100% hit rate.
 */
function addUsageToTotals(totals, usage) {
    const base = normalizeUsageTotals(totals);
    const totalInput = toCount(usage?.promptTokens);
    const cacheRead = Math.min(toCount(usage?.cacheReadTokens), totalInput);
    const cacheCreation = Math.min(toCount(usage?.cacheCreationTokens), Math.max(0, totalInput - cacheRead));
    const uncached = usage?.uncachedInputTokens === undefined
        ? Math.max(0, totalInput - cacheRead - cacheCreation)
        : Math.min(toCount(usage.uncachedInputTokens), Math.max(0, totalInput - cacheRead - cacheCreation));
    const output = toCount(usage?.completionTokens);

    return {
        requests: base.requests + 1,
        inputTokens: base.inputTokens + totalInput,
        uncachedInputTokens: base.uncachedInputTokens + uncached,
        cacheReadTokens: base.cacheReadTokens + cacheRead,
        cacheCreationTokens: base.cacheCreationTokens + cacheCreation,
        outputTokens: base.outputTokens + output,
        totalTokens: base.totalTokens + totalInput + output,
    };
}

/**
 * Restores the running totals from a conversation.
 *
 * Every assistant message records the session-cumulative totals it observed, so
 * the newest recorded message is the authoritative resume point. Scanning
 * backwards tolerates a turn that failed before recording anything.
 *
 * Conversations written before cumulative accounting existed only carry the
 * last request of each turn. Those are summed as a lower bound and flagged
 * `approximate`, because a multi-step turn recorded only its final step.
 */
function createUsageTotalsFromHistory(messages = []) {
    const list = Array.isArray(messages) ? messages : [];
    for (let index = list.length - 1; index >= 0; index -= 1) {
        const message = list[index];
        const candidate = message?.contextStatus?.totals || message?.usageTotals;
        if (candidate && typeof candidate === 'object') return normalizeUsageTotals(candidate);
    }

    const legacy = emptyUsageTotals();
    let recorded = false;
    for (const message of list) {
        const status = message?.contextStatus;
        if (!status || status.source !== 'api') continue;
        const input = toCount(status.promptTokens);
        const output = toCount(status.completionTokens);
        if (input === 0 && output === 0) continue;
        const cacheRead = Math.min(toCount(status.cacheReadTokens), input);
        const cacheCreation = Math.min(toCount(status.cacheCreationTokens), Math.max(0, input - cacheRead));
        recorded = true;
        legacy.requests += 1;
        legacy.inputTokens += input;
        legacy.cacheReadTokens += cacheRead;
        legacy.cacheCreationTokens += cacheCreation;
        legacy.uncachedInputTokens += Math.max(0, input - cacheRead - cacheCreation);
        legacy.outputTokens += output;
        legacy.totalTokens += input + output;
    }
    if (recorded) legacy.approximate = true;
    return legacy;
}

/**
 * Splits the current context into the three parts the panel shows.
 *
 * These are estimates produced by the same heuristic the compaction threshold
 * uses, which is why the UI labels them with `~`. They describe what is about to
 * be sent, not what the provider billed.
 */
function buildContextBreakdown({ systemTokens = 0, toolTokens = 0, messageTokens = 0, estimated = true } = {}) {
    const system = toCount(systemTokens);
    const tools = toCount(toolTokens);
    const messages = toCount(messageTokens);
    return {
        systemTokens: system,
        toolTokens: tools,
        messageTokens: messages,
        totalTokens: system + tools + messages,
        estimated: Boolean(estimated),
    };
}

module.exports = {
    USAGE_TOTAL_FIELDS,
    emptyUsageTotals,
    normalizeUsageTotals,
    cacheHitRate,
    addUsageToTotals,
    createUsageTotalsFromHistory,
    buildContextBreakdown,
};
