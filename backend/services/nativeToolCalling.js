function sanitizeProviderToolName(name, usedNames) {
    let result = String(name || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    if (!/^[a-zA-Z_]/.test(result)) result = `tool_${result}`;
    result = result.slice(0, 64);
    if (usedNames.has(result)) {
        const suffix = require('crypto').createHash('sha256').update(String(name)).digest('hex').slice(0, 8);
        result = `${result.slice(0, 55)}_${suffix}`;
    }
    usedNames.add(result);
    return result;
}

// `content` is intentionally required: writeFile/respond must not be called empty.
const OPTIONAL_PARAMS = new Set(['startLine', 'endLine', 'chunkLines', 'timeoutSeconds', 'limit', 'offset', 'includeIgnored', 'expectedHash', 'occurrence', 'width', 'height', 'bars']);

function nativeToolsFromRegistry(registry) {
    const used = new Set();
    const names = new Map();
    const tools = [];
    for (const [key, tool] of registry) {
        if (tool.alias) continue;
        const providerName = sanitizeProviderToolName(tool.name, used);
        names.set(providerName, key);
        const parameters = tool.mcp?.schema && Object.keys(tool.mcp.schema).length
            ? tool.mcp.schema
            : {
                type: 'object',
                properties: Object.fromEntries(tool.params.map(name => [name, { type: 'string' }])),
                required: tool.params.filter(name => !OPTIONAL_PARAMS.has(name)),
            };
        tools.push({ type: 'function', function: { name: providerName, description: tool.description || tool.name, parameters } });
    }
    return { tools, names };
}

function createNativeCallAccumulator(nameMap) {
    const calls = new Map();
    return {
        addOpenAI(deltas = []) {
            for (const delta of deltas) {
                const index = Number.isInteger(delta.index) ? delta.index : calls.size;
                const current = calls.get(index) || { id: '', name: '', arguments: '' };
                if (delta.id) current.id = delta.id;
                if (delta.function?.name) current.name += delta.function.name;
                if (delta.function?.arguments) current.arguments += delta.function.arguments;
                calls.set(index, current);
            }
        },
        addAnthropic(event) {
            if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
                calls.set(event.index, { id: event.content_block.id, name: event.content_block.name, arguments: '' });
            } else if (event.type === 'content_block_delta' && event.delta?.type === 'input_json_delta') {
                const current = calls.get(event.index);
                if (current) current.arguments += event.delta.partial_json || '';
            }
        },
        addOllama(toolCalls = []) {
            // Ollama repeats the full tool_calls array on every chunk. Replace the
            // snapshot; appending would execute the same call once per chunk.
            if (!Array.isArray(toolCalls) || toolCalls.length === 0) return;
            const snapshot = new Map();
            toolCalls.forEach((call, index) => {
                const name = call.function?.name || call.name || '';
                if (!name) return;
                const raw = call.function?.arguments ?? call.arguments ?? {};
                snapshot.set(index, {
                    id: call.id || `call_${index + 1}`,
                    name,
                    arguments: typeof raw === 'string' ? raw : JSON.stringify(raw),
                });
            });
            if (snapshot.size === 0) return;
            calls.clear();
            for (const [index, call] of snapshot) calls.set(index, call);
        },
        toMatches(registry) {
            return [...calls.values()].map((call, index) => {
                const key = nameMap.get(call.name) || call.name.toLowerCase();
                const tool = registry.get(key);
                const callId = call.id || `call_${index + 1}`;
                if (!tool) return { name: call.name, providerName: call.name, callId, parsedArgs: [], rawArgs: call.arguments, native: true, error: 'Unknown native tool.' };
                try {
                    const object = call.arguments ? JSON.parse(call.arguments) : {};
                    if (!object || typeof object !== 'object' || Array.isArray(object)) throw new Error('Tool arguments must be a JSON object.');
                    const args = tool.mcp ? [JSON.stringify(object)] : tool.params.map(param => {
                        const value = object[param];
                        return value === undefined || value === null ? '' : (typeof value === 'string' ? value : JSON.stringify(value));
                    });
                    return {
                        name: tool.name, providerName: call.name, callId, parsedArgs: args,
                        rawArgs: JSON.stringify(object), input: object, native: true,
                    };
                } catch (error) {
                    return {
                        name: tool.name, providerName: call.name, callId, parsedArgs: [],
                        rawArgs: call.arguments, native: true, error: `Invalid native tool arguments: ${error.message}`,
                    };
                }
            });
        },
        isEmpty() { return calls.size === 0; },
    };
}

function openAIHistoryMessages(matches) {
    return [{ role: 'assistant', content: null, tool_calls: matches.map((match, index) => ({
        id: match.callId || `call_${index}`, type: 'function', function: { name: match.name, arguments: match.rawArgs || '{}' },
    })) }];
}

function anthropicHistoryMessages(matches) {
    return [{ role: 'assistant', content: matches.map((match, index) => ({
        type: 'tool_use', id: match.callId || `call_${index}`, name: match.providerName || match.name,
        input: match.input && typeof match.input === 'object' ? match.input : safeObject(match.rawArgs),
    })) }];
}

function safeObject(raw) {
    try {
        const parsed = JSON.parse(raw || '{}');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

const NATIVE_TOOL_PROVIDERS = new Set([
    'openai', 'nvidia', 'deepseek', 'zhipu', 'gemini', 'moonshot', 'tongyi',
    'doubao', 'minimax', 'anthropic', 'ollama', 'copilot',
]);

function supportsNativeTools(provider) {
    const normalized = String(provider || '').trim().toLowerCase();
    return NATIVE_TOOL_PROVIDERS.has(normalized === 'github' ? 'copilot' : normalized);
}

function toolHistoryProvider(provider) {
    const normalized = String(provider || '').trim().toLowerCase();
    if (normalized === 'github') return 'copilot';
    return normalized === 'anthropic' ? 'anthropic' : 'openai';
}

function isToolSchemaRejection(error) {
    const status = Number(error?.response?.status || error?.status || 0);
    const data = error?.response?.data;
    const message = [
        error?.message,
        typeof data === 'string' ? data : '',
        data?.error?.message,
        data?.error,
        data?.message,
    ].filter(Boolean).join(' ').toLowerCase();
    if (!message) return false;
    const mentionsTools = /tool|function.?call|input_schema/.test(message);
    const rejected = status === 400 || status === 404 || status === 422
        || /unsupported|not support|unknown parameter|invalid|unrecognized|does not|doesn't/.test(message);
    return mentionsTools && rejected;
}

/**
 * Record one executed native call plus its observation. One pair per call is
 * valid for every supported provider and is easier to keep complete than a batch.
 */
function appendToolExchange(messages, provider, { match, observation, assistantText = '' } = {}) {
    if (!Array.isArray(messages) || !match?.native || !match.callId) return false;
    const providerName = match.providerName || match.name;
    const text = String(observation ?? '');
    if (toolHistoryProvider(provider) === 'anthropic') {
        messages.push({
            role: 'assistant',
            content: [{ type: 'tool_use', id: match.callId, name: providerName, input: match.input || safeObject(match.rawArgs) }],
        });
        messages.push({
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: match.callId, content: text, is_error: Boolean(match.error) }],
        });
        return true;
    }
    // Empty string, not null: Gemini and Ollama reject null content on tool turns.
    messages.push({
        role: 'assistant',
        content: assistantText ? String(assistantText) : '',
        tool_calls: [{
            id: match.callId,
            type: 'function',
            function: { name: providerName, arguments: match.rawArgs || '{}' },
        }],
    });
    messages.push({ role: 'tool', tool_call_id: match.callId, tool_name: providerName, content: text });
    return true;
}

function isNativeToolMessage(message, style) {
    if (style === 'anthropic') {
        return message?.role === 'assistant' && Array.isArray(message.content)
            && message.content.some(block => block?.type === 'tool_use' && block.id);
    }
    return message?.role === 'assistant' && Array.isArray(message.tool_calls) && message.tool_calls.some(call => call?.id);
}

/** Drop a native call that lost its result, or a result that lost its call. */
function alignNativeToolHistory(messages, provider = 'openai') {
    if (!Array.isArray(messages) || messages.length === 0) return messages;
    const style = toolHistoryProvider(provider);
    const kept = [];
    for (let i = 0; i < messages.length; i += 1) {
        const message = messages[i];
        if (style === 'anthropic' && isNativeToolMessage(message, style)) {
            const uses = message.content.filter(block => block?.type === 'tool_use' && block.id);
            const next = messages[i + 1];
            const results = Array.isArray(next?.content) ? next.content.filter(block => block?.type === 'tool_result') : [];
            const answered = new Set(results.map(block => block.tool_use_id));
            if (next?.role === 'user' && uses.every(block => answered.has(block.id))) {
                kept.push(message, next);
                i += 1;
            }
            continue;
        }
        if (style !== 'anthropic' && isNativeToolMessage(message, style)) {
            const ids = new Set(message.tool_calls.filter(call => call?.id).map(call => call.id));
            let cursor = i + 1;
            const results = [];
            while (cursor < messages.length && messages[cursor]?.role === 'tool' && ids.has(messages[cursor].tool_call_id)) {
                results.push(messages[cursor]);
                ids.delete(messages[cursor].tool_call_id);
                cursor += 1;
            }
            if (ids.size === 0) {
                kept.push(message, ...results);
                i = cursor - 1;
            }
            continue;
        }
        if (message?.role === 'tool') continue;
        if (style === 'anthropic' && message?.role === 'user' && Array.isArray(message.content)
            && message.content.some(block => block?.type === 'tool_result')) continue;
        kept.push(message);
    }
    return kept;
}

const DEFERRED_RESPOND_OBSERVATION = 'Error: respond was not executed because it appeared in the same turn as other tool calls. Read the real tool results, then call respond in a separate turn.';

/** Acknowledge a dropped native respond so the provider history stays paired. */
function recordDeferredNativeRespond(messages, provider, respondMatches = []) {
    let recorded = 0;
    for (const match of respondMatches) {
        if (!match?.native) continue;
        const observation = match.error
            ? `Error: ${match.error} ${DEFERRED_RESPOND_OBSERVATION}`
            : DEFERRED_RESPOND_OBSERVATION;
        if (appendToolExchange(messages, provider, {
            match: { ...match, error: match.error || 'deferred-respond' },
            observation,
        })) recorded += 1;
    }
    return recorded;
}

function parseToolArguments(raw) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
    if (typeof raw !== 'string' || !raw.trim()) return {};
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { value: raw };
    } catch {
        return { value: raw };
    }
}

/** Ollama unmarshals tool arguments into an object and content into a string. */
function toOllamaMessage(message) {
    if (!message || typeof message !== 'object') return message;
    if (message.role === 'tool') {
        return {
            role: 'tool',
            tool_name: message.tool_name || message.name || 'tool',
            content: String(message.content ?? ''),
        };
    }
    if (message.role === 'assistant' && Array.isArray(message.tool_calls)) {
        return {
            role: 'assistant',
            content: typeof message.content === 'string' ? message.content : '',
            tool_calls: message.tool_calls.map(call => ({
                function: {
                    name: call.function?.name || call.name || 'tool',
                    arguments: parseToolArguments(call.function?.arguments ?? call.arguments),
                },
            })),
        };
    }
    return message;
}

const NATIVE_PROTOCOL_NOTE = `## Native tool protocol
Structured function calls are enabled for this model.
Prefer the provider's native function-calling channel. Do not also write Tool: or XML for a call you already made natively.
If the native channel is unavailable, fall back to one Tool: or XML call per action.
Never write an Observation yourself. A final answer must be a respond call, not plain text.
Do not call respond in the same turn as another tool. That respond is dropped until the tool results come back.`;

function buildAgentSystemText(currentPrompt, nativeToolsEnabled = false) {
    const historyIndex = currentPrompt.indexOf('## Conversation History:');
    const systemText = historyIndex === -1
        ? currentPrompt
        : currentPrompt.slice(0, historyIndex).trim();
    return nativeToolsEnabled ? `${systemText}\n\n${NATIVE_PROTOCOL_NOTE}` : systemText;
}

module.exports = {
    buildAgentSystemText,
    nativeToolsFromRegistry,
    createNativeCallAccumulator,
    openAIHistoryMessages,
    anthropicHistoryMessages,
    supportsNativeTools,
    toolHistoryProvider,
    isToolSchemaRejection,
    appendToolExchange,
    alignNativeToolHistory,
    recordDeferredNativeRespond,
    toOllamaMessage,
    DEFERRED_RESPOND_OBSERVATION,
    NATIVE_PROTOCOL_NOTE,
};
