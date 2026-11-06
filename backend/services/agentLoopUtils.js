'use strict';

// Stop sequences used across all providers to prevent the model from fabricating
// its own Observation: lines and continuing the loop internally.
const AGENT_STOP_SEQUENCES = ['\nObservation:', '\nObservation：'];

// Models that accept a stop/stop_sequences parameter.
// OpenAI o-series and GPT-5 reject it; everything else is assumed to accept it.
function supportsStopSequences(model = '') {
    const m = String(model).toLowerCase().replace(/^[^/]+\//, ''); // strip vendor prefix
    return !/^(o\d|gpt-5)/i.test(m);
}

// Returns { maxTokens, thinkingBudget } for any Anthropic model name.
// Family ladder (evaluated top-to-bottom):
//   claude-3.7 / claude-3-7               → 16 000 + thinking 8 000
//   claude-3.5 / claude-3-5               → 8 192, no thinking
//   claude-3 (without minor ≥5)           → 4 096, no thinking
//   claude-2 / claude-1 / claude-instant  → 4 096, no thinking
//   claude-4+ (sonnet-4, opus-4, …)       → 32 000 + thinking 8 000
function getAnthropicModelProfile(model = '') {
    const m = String(model).toLowerCase();
    // 3.7 must be checked before the generic 3.x catch
    if (/claude-3[.-]7/.test(m)) {
        return { maxTokens: 16000, thinkingBudget: 8000 };
    }
    if (/claude-3[.-]5/.test(m)) {
        return { maxTokens: 8192, thinkingBudget: 0 };
    }
    // Any remaining claude-3.x (3.0, 3.1, 3.2, 3.3, 3.4) and legacy claude-2/1/instant
    if (/claude-3[.-]\d/.test(m) || /claude-[12](?:[.-]|\b)/.test(m) || m.includes('claude-instant')) {
        return { maxTokens: 4096, thinkingBudget: 0 };
    }
    // Bare "claude-3-sonnet/haiku/opus" without a minor version
    if (/claude-3-(?:sonnet|haiku|opus)/.test(m)) {
        return { maxTokens: 4096, thinkingBudget: 0 };
    }
    // Claude 4+: claude-opus-4, claude-sonnet-4-5, claude-haiku-4, claude-4-..., etc.
    if (/claude-(?:opus|sonnet|haiku)-[4-9]|claude-[4-9]/.test(m)) {
        return { maxTokens: 32000, thinkingBudget: 8000 };
    }
    return { maxTokens: 4096, thinkingBudget: 0 };
}

// Cut the assistant text at the first fabricated Observation: line (after any <think> block),
// preventing the model from feeding itself fake tool results.
function truncateAtFabricatedObservation(text = '') {
    // Allow Observation: inside a <think>...</think> block (reasoning scratchpad).
    let scanFrom = 0;
    const thinkEnd = text.lastIndexOf('</think>');
    if (thinkEnd !== -1) scanFrom = thinkEnd + 8;

    const match = /^\s*Observation\s*[:：]/m.exec(text.slice(scanFrom));
    if (!match) return text;
    return text.slice(0, scanFrom + match.index);
}

// Returns true when the assistant response looks like a progress note
// ("我来帮你…", "稍等…", "正在…", "Let me…", "I'll…") rather than a final answer.
const PROGRESS_NOTE_RE = /^(?:(?:好的|好|嗯|ok(?:ay)?)[，,。.!！\s]*)?(?:我(?:来|去|先|正在|马上|将|会)|稍等|请稍等|正在|让我|接下来我|wait\b|let me\b|i(?:'ll| will| am going to|'m going to)\b|one moment|processing\b|working on)/i;
const PROGRESS_TAIL_RE = /(?:\.\.\.|…|：|:)\s*$/;
function isProgressNote(text = '') {
    const t = String(text || '').trim();
    if (!t) return false;
    if (t.length <= 160 && PROGRESS_NOTE_RE.test(t)) return true;
    if (t.length <= 60 && PROGRESS_TAIL_RE.test(t)) return true;
    return false;
}

// Todo-bookkeeping tools produce no observation the answer could depend on,
// so they do not constitute a conflict with respond.
const TODO_TOOL_NAMES = new Set(['updatetodo', 'todo']);

// Separates `respond` from other non-todo tool calls in a match list.
// If respond appears alongside real (non-todo) tool calls, the respond is deferred:
// let the tools run first so the model gets real observations, not fabricated ones.
// Returns { respondMatches, realTools, hasConflict, filtered }
//   filtered: the list to actually iterate — excludes respond when there is a conflict.
function partitionRespond(toolMatches = []) {
    const respondMatches = [];
    const realTools = [];
    for (const m of toolMatches) {
        const name = String(m?.name || '').toLowerCase().trim();
        if (name === 'respond') {
            respondMatches.push(m);
        } else {
            realTools.push(m);
        }
    }
    const hasConflict = respondMatches.length > 0
        && realTools.some(m => !TODO_TOOL_NAMES.has(String(m?.name || '').toLowerCase().trim()));
    const filtered = hasConflict ? realTools : toolMatches;
    return { respondMatches, realTools, hasConflict, filtered };
}

// Tracks repeated tool calls. Returns { record(name, args) → boolean shouldWarn, isFatal }.
// Same name+args signature 3× in a row → warn; 4th time → fatal (stop the loop).
function createRepeatCallTracker() {
    let lastKey = null;
    let streak = 0;
    return {
        record(name, args) {
            const key = `${name}|${JSON.stringify(args)}`;
            if (key === lastKey) {
                streak++;
            } else {
                lastKey = key;
                streak = 1;
            }
            return { shouldWarn: streak === 3, isFatal: streak >= 4 };
        },
        reset() {
            lastKey = null;
            streak = 0;
        },
    };
}

// Derive a sensible Ollama num_ctx from the context budget computed by agentContext.
// Clamped between 8 192 and 131 072, rounded to the nearest power of two.
function resolveOllamaNumCtx(budgetTokens = 32768) {
    const raw = Math.max(8192, Math.min(131072, budgetTokens * 1.25)); // slight headroom
    // Round to nearest power of two
    const pow = Math.pow(2, Math.round(Math.log2(raw)));
    return Math.max(8192, Math.min(131072, pow));
}

// Read-only tool names that can be pre-fetched in parallel without side effects.
const READ_ONLY_TOOLS = new Set([
    'readfile', 'listdir', 'readfilechunk', 'planfileread',
    'searchskills', 'listskills', 'readskill',
    'listplugins', 'getplugindetails',
    'getrepomap', 'listmemories', 'searchmemories', 'readmemory',
]);

// One queue per session, shared by every persistence entry point.
function createKeyedSerialQueue() {
    const tails = new Map();
    return (key, operation) => {
        key = String(key);
        const result = (tails.get(key) || Promise.resolve()).then(operation);
        const tail = result.catch(() => {});
        tails.set(key, tail);
        tail.then(() => { if (tails.get(key) === tail) tails.delete(key); });
        return result;
    };
}

function isCurrentRun(runs, chatId, run) {
    return !run || (runs.get(chatId) === run && !run.destroyed && !run.writableEnded);
}

// Only JSON syntax errors are recoverable. Provider errors must reject the call.
function parseProviderFrame(text) {
    let frame;
    try { frame = JSON.parse(text); } catch (error) {
        if (error instanceof SyntaxError) return null;
        throw error;
    }
    if (frame?.error || frame?.type === 'error') {
        const detail = frame.error || frame;
        throw Object.assign(new Error(typeof detail === 'string' ? detail : detail.message || JSON.stringify(detail)), {
            code: detail.code || detail.type || 'provider_error', providerError: true,
        });
    }
    return frame;
}

module.exports = {
    createKeyedSerialQueue,
    isCurrentRun,
    parseProviderFrame,
    AGENT_STOP_SEQUENCES,
    supportsStopSequences,
    getAnthropicModelProfile,
    truncateAtFabricatedObservation,
    isProgressNote,
    partitionRespond,
    createRepeatCallTracker,
    resolveOllamaNumCtx,
    READ_ONLY_TOOLS,
};
