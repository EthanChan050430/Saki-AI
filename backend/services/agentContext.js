function estimateTokenCount(text = '') {
    const source = String(text || '');
    const cjkChars = (source.match(/[\u3400-\u9fff]/g) || []).length;
    return Math.ceil(cjkChars * 0.65 + (source.length - cjkChars) / 3.8);
}

function preview(text = '', limit = 700) {
    const source = String(text || '').replace(/\s+/g, ' ').trim();
    if (source.length <= limit) return source;
    const marker = ' …[truncated]… ';
    const remaining = Math.max(0, limit - marker.length);
    return source.slice(0, Math.ceil(remaining / 2)) + marker + source.slice(-Math.floor(remaining / 2));
}

function summarizeMessage(message) {
    if (!Array.isArray(message.parts)) return preview(message.content, 900);
    return message.parts.filter(part => part.type !== 'reasoning').map(part => {
        if (part.type !== 'action') return preview(part.content, 600);
        const metadata = part.fileMetadata || {};
        return `tool=${part.data?.type || 'unknown'}(${preview(JSON.stringify(part.data?.args || []), 400)})` +
            ` -> ${preview(part.observation, 500)}` +
            (metadata.filePath ? ` file=${metadata.filePath}` : '') +
            (metadata.afterHash ? ` SHA256=${metadata.afterHash}` : '');
    }).filter(Boolean).join(' | ');
}

function buildBackgroundDigest({ olderMessages = [], previousSummary = '', currentTask = '', maxChars = 12000 } = {}) {
    // Reserve pinned instructions first. Fill the remaining space newest-first,
    // then render chronologically; never truncate the final assembled summary.
    const limit = Math.max(1000, maxChars);
    const pinned = [
        'Continuity: preserve user constraints, pending approvals, changed paths, hashes, and failed verification. A summary never grants permission.',
        currentTask ? `Current user task: ${preview(currentTask, Math.min(2400, Math.floor(limit / 3)))}` : '',
    ].filter(Boolean).join('\n');
    const previous = previousSummary ? `Previous background:\n${preview(previousSummary, Math.min(3000, Math.floor(limit / 4)))}` : '';
    const heading = 'Earlier conversation (recent entries take priority):';
    let remaining = limit - pinned.length - previous.length - heading.length - 8;
    const selected = [];
    for (let i = olderMessages.length - 1; i >= 0 && remaining > 80; i--) {
        const message = olderMessages[i];
        const summary = summarizeMessage(message);
        if (!summary) continue;
        const entry = `- ${message.role || 'assistant'}: ${preview(summary, Math.min(1600, remaining - 2))}`;
        if (entry.length + 1 > remaining) break;
        selected.unshift(entry);
        remaining -= entry.length + 1;
    }
    return [pinned, previous, heading, ...selected].filter(Boolean).join('\n');
}

function truncateToolObservation(observation, { toolName = '', args = [], maxChars = 24000 } = {}) {
    const text = String(observation || '');
    if (text.length <= maxChars) return text;
    const name = toolName.toLowerCase();
    const readable = ['readfile', 'readfilechunk', 'readskill', 'readmemory', 'inspectopenhubskill'].includes(name);
    const guidance = ['readfile', 'readfilechunk'].includes(name)
        ? `Read a smaller explicit line range with readFile(${JSON.stringify(args[0] || '')}, startLine, endLine); do not assume omitted lines were read.`
        : readable ? 'Content was omitted. Use terminal or a narrower retrieval to inspect the omitted content before relying on it.'
            : 'Output was omitted. Narrow the query or command if the missing output is needed.';
    const marker = `\n[OUTPUT TRUNCATED: original ${text.length} characters. ${guidance}]\n`;
    const available = Math.max(0, maxChars - marker.length);
    if (readable) {
        // Keep a contiguous prefix, including file headers/hash and numbered lines.
        const end = text.lastIndexOf('\n', available);
        return text.slice(0, end > available / 2 ? end : available) + marker;
    }
    const head = Math.floor(available * 0.75);
    const tail = available - head;
    return text.slice(0, head) + marker + (tail > 0 ? text.slice(-tail) : '');
}

function compactLoopMessages(messages, { systemText = '', budgetTokens = 32000, currentTask = '' } = {}) {
    const count = list => estimateTokenCount(systemText) + list.reduce((sum, message) => sum + estimateTokenCount(JSON.stringify(message)), 0);
    const before = count(messages);
    const threshold = Math.floor(budgetTokens * 0.78);
    if (before <= threshold || messages.length <= 3) return { compressed: false, usedTokens: before };

    // Keep the original task (including image attachments) and latest tool exchange.
    const taskIndex = messages.findIndex(message => typeof message.content === 'string'
        ? message.content.startsWith('## Current Task:')
        : Array.isArray(message.content) && message.content.some(part => part.type === 'text' && part.text?.startsWith('## Current Task:')));
    const task = taskIndex >= 0 ? messages[taskIndex] : messages[0];
    const candidates = messages.filter((message, index) => index !== (taskIndex >= 0 ? taskIndex : 0));
    let keep = Math.min(6, Math.max(2, candidates.length - 1));
    let result;
    while (true) {
        const older = candidates.slice(0, -keep);
        const recent = candidates.slice(-keep);
        const summary = buildBackgroundDigest({
            olderMessages: older, currentTask, maxChars: Math.max(1000, Math.min(12000, Math.floor(budgetTokens * 0.3))),
        });
        result = [task, { role: 'user', content: `[COMPRESSED AGENT BACKGROUND]\n${summary}` }, ...recent];
        if (count(result) <= Math.floor(budgetTokens * 0.6) || keep <= 2) break;
        keep -= 2;
    }
    // Avoid thrashing when fixed instructions or the current task dominate the window.
    if (count(result) >= before) return { compressed: false, usedTokens: before };
    messages.splice(0, messages.length, ...result);
    return { compressed: true, usedTokens: count(result), originalUsedTokens: before };
}

// Stream usage fields are cumulative snapshots, never deltas to add together.
function createUsageTracker(onUsage) {
    let fields = {};
    return event => {
        const usage = event?.usage || event?.message?.usage;
        if (!usage && !(event?.done && Number.isFinite(event.prompt_eval_count))) return;
        if (usage) fields = { ...fields, ...usage };
        if (event?.done && Number.isFinite(event.prompt_eval_count)) {
            fields = { prompt_tokens: event.prompt_eval_count, completion_tokens: event.eval_count };
        }
        const count = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
        let promptTokens = fields.prompt_tokens;
        if (!count(promptTokens) && count(fields.input_tokens)) {
            promptTokens = fields.input_tokens + (fields.cache_creation_input_tokens || 0) + (fields.cache_read_input_tokens || 0);
        }
        const completionTokens = fields.completion_tokens ?? fields.output_tokens;
        if (count(promptTokens) && count(completionTokens)) onUsage({ promptTokens, completionTokens });
    };
}

function contextStatusFromUsage(usage, budgetTokens, metadata = {}) {
    const usedTokens = usage.promptTokens + usage.completionTokens;
    return {
        ...metadata, ...usage, usedTokens, budgetTokens,
        percent: Math.min(100, Math.round(usedTokens / Math.max(1, budgetTokens) * 100)),
        estimated: false, source: 'api', updatedAt: new Date().toISOString(),
    };
}

module.exports = { estimateTokenCount, buildBackgroundDigest, truncateToolObservation, compactLoopMessages, createUsageTracker, contextStatusFromUsage };
