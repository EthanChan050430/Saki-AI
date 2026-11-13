'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { createToolRegistry, parseToolCalls } = require('../services/agentTools.js');
const { compactLoopMessages } = require('../services/agentContext.js');
const {
    nativeToolsFromRegistry,
    createNativeCallAccumulator,
    supportsNativeTools,
    isToolSchemaRejection,
    appendToolExchange,
    alignNativeToolHistory,
    recordDeferredNativeRespond,
    toOllamaMessage,
    buildAgentSystemText,
    NATIVE_PROTOCOL_NOTE,
} = require('../services/nativeToolCalling.js');

function registry() {
    return createToolRegistry({ searchEnabled: true, memoryEnabled: true });
}

describe('agent system instructions', () => {
    it('initializes native instructions without conversation history', () => {
        assert.equal(buildAgentSystemText('System instructions', true), `System instructions\n\n${NATIVE_PROTOCOL_NOTE}`);
    });

    it('appends the native protocol after separating conversation history', () => {
        const prompt = 'System instructions\n\n## Conversation History:\nUser: private history';
        assert.equal(buildAgentSystemText(prompt, true), `System instructions\n\n${NATIVE_PROTOCOL_NOTE}`);
        assert.equal(buildAgentSystemText(prompt, false), 'System instructions');
    });

    it('preserves the text protocol when native tools are disabled', () => {
        assert.equal(buildAgentSystemText('System instructions', false), 'System instructions');
    });

    it('switches protocols when native tool support changes between turns', () => {
        const prompt = 'System instructions';
        assert.match(buildAgentSystemText(prompt, true), /native function-calling channel/i);
        assert.doesNotMatch(buildAgentSystemText(prompt, false), /native function-calling channel/i);
    });
});

describe('legacy action parsing', () => {
    it('parses positional and named arguments emitted by small Ollama models', () => {
        const tools = registry();
        const positional = parseToolCalls('listDir(".", 20, 0)', tools);
        const named = parseToolCalls('Tool: listDir(path=".", limit=20, offset=0)', tools);
        const namedRespond = parseToolCalls('Tool: respond(text="done")', tools);
        const namedWrite = parseToolCalls('Tool: writeFile(path="notes.txt", content="hello")', tools);
        const unknownReadArg = parseToolCalls('Tool: readFile(path="notes.txt", start=1)', tools);
        assert.deepEqual(positional[0].parsedArgs, ['.', '20', '0']);
        assert.deepEqual(named[0].parsedArgs, ['.', '20', '0', '']);
        assert.deepEqual(namedRespond[0].parsedArgs, ['done']);
        assert.deepEqual(namedWrite[0].parsedArgs, ['notes.txt', 'hello', '']);
        assert.match(unknownReadArg[0].error, /Unknown or repeated argument/);
    });

    it('rejects unknown named arguments and ignores fenced examples', () => {
        const tools = registry();
        const [invalid] = parseToolCalls('Tool: listDir(path=".", surprise=1)', tools);
        assert.match(invalid.error, /Unknown or repeated argument/);
        assert.equal(parseToolCalls('```text\\nlistDir(".")\\n```', tools).length, 0);
    });

    it('parses multiline JSON arguments without splitting nested commas', () => {
        const tools = registry();
        const [call] = parseToolCalls('Tool: updateTodo({\n  "title": "Inspect",\n  "items": [{"id":"one", "text":"a,b", "status":"pending"}]\n})', tools);
        assert.equal(call.parsedArgs.length, 1);
        assert.doesNotThrow(() => JSON.parse(call.parsedArgs[0]));
    });
});

describe('native tool schemas', () => {
    it('offers autonomous web lookup even with legacy search disabled', () => {
        for (const options of [{}, { searchEnabled: false }]) {
            const tools = createToolRegistry(options);
            const names = nativeToolsFromRegistry(tools).tools.map(tool => tool.function.name);
            assert.ok(names.includes('search'));
            assert.ok(names.includes('verifyClaim'));
            assert.equal(parseToolCalls('Tool: search("latest release")', tools)[0].name, 'search');
        }
    });
    it('offers drawing without a per-message toggle only when configured', () => {
        const enabled = createToolRegistry({ drawingEnabled: true });
        assert.ok(enabled.has('draw'));
        assert.match(enabled.get('draw').description, /only when the user requests image creation/);
        assert.ok(nativeToolsFromRegistry(enabled).tools.some(tool => tool.function.name === 'draw'));
        assert.equal(createToolRegistry({ drawingEnabled: false }).has('draw'), false);
    });

    it('skips aliases and keeps file content required', () => {
        const { tools, names } = nativeToolsFromRegistry(registry());
        assert.equal(tools.some(tool => tool.function.name === 'todo'), false);
        const writeFile = tools.find(tool => tool.function.name === 'writeFile');
        assert.ok(writeFile.function.parameters.required.includes('content'));
        assert.equal(writeFile.function.parameters.required.includes('expectedHash'), false);
        assert.equal(names.get('readFile'), 'readfile');
    });

    it('preserves an MCP input schema and a legal provider name', () => {
        const source = createToolRegistry({
            mcpTools: [{
                serverName: 'docs.api',
                name: 'lookup',
                description: 'Look up a document',
                inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
            }],
        });
        const { tools, names } = nativeToolsFromRegistry(source);
        const mcp = tools.find(tool => tool.function.name.startsWith('mcp_'));
        assert.match(mcp.function.name, /^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/);
        assert.deepEqual(mcp.function.parameters.required, ['id']);
        assert.equal(source.get(names.get(mcp.function.name)).mcp.toolName, 'lookup');
    });
});

describe('native call accumulation', () => {
    it('assembles streamed OpenAI fragments into executor arguments', () => {
        const built = nativeToolsFromRegistry(registry());
        const calls = createNativeCallAccumulator(built.names);
        calls.addOpenAI([{ index: 0, id: 'call_1', function: { name: 'read', arguments: '' } }]);
        calls.addOpenAI([{ index: 0, function: { name: 'File', arguments: '{"path":' } }]);
        calls.addOpenAI([{ index: 0, function: { arguments: '"notes.txt"}' } }]);
        const [match] = calls.toMatches(registry());
        assert.equal(match.name, 'readFile');
        assert.deepEqual(match.parsedArgs.slice(0, 1), ['notes.txt']);
        assert.equal(match.callId, 'call_1');
        assert.equal(match.providerName, 'readFile');
    });

    it('keeps one Ollama snapshot instead of duplicating repeated chunks', () => {
        const built = nativeToolsFromRegistry(registry());
        const calls = createNativeCallAccumulator(built.names);
        const chunk = [{ function: { name: 'listDir', arguments: { path: '.' } } }];
        calls.addOllama(chunk);
        calls.addOllama(chunk);
        assert.equal(calls.toMatches(registry()).length, 1);
    });

    it('reports malformed arguments without throwing', () => {
        const built = nativeToolsFromRegistry(registry());
        const calls = createNativeCallAccumulator(built.names);
        calls.addAnthropic({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: 'respond' } });
        calls.addAnthropic({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"text":' } });
        const [match] = calls.toMatches(registry());
        assert.match(match.error, /Invalid native tool arguments/);
        assert.equal(match.parsedArgs.length, 0);
    });
});

describe('provider tool history', () => {
    it('records an OpenAI call and result as one complete pair', () => {
        const messages = [];
        const ok = appendToolExchange(messages, 'openai', {
            match: { native: true, callId: 'call_9', providerName: 'listDir', name: 'listDir', rawArgs: '{"path":"."}' },
            observation: 'a.txt',
        });
        assert.equal(ok, true);
        assert.equal(messages[1].role, 'tool');
        assert.equal(messages[1].tool_call_id, messages[0].tool_calls[0].id);
    });

    it('drops an orphaned tool result before the next request', () => {
        const aligned = alignNativeToolHistory([
            { role: 'user', content: 'task' },
            { role: 'tool', tool_call_id: 'missing', content: 'orphan' },
        ], 'openai');
        assert.deepEqual(aligned, [{ role: 'user', content: 'task' }]);
    });

    it('keeps a complete Anthropic tool_use and tool_result group', () => {
        const messages = [{
            role: 'assistant',
            content: [{ type: 'tool_use', id: 'toolu_1', name: 'listDir', input: { path: '.' } }],
        }, {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok' }],
        }];
        assert.equal(alignNativeToolHistory(messages, 'anthropic').length, 2);
        messages.pop();
        assert.equal(alignNativeToolHistory(messages, 'anthropic').length, 0);
    });

    it('records a dropped native respond without inventing an answer', () => {
        const openai = [];
        const recorded = recordDeferredNativeRespond(openai, 'openai', [{
            name: 'respond',
            native: true,
            callId: 'call_respond',
            rawArgs: '{"content":"invented"}',
        }]);
        assert.equal(recorded, 1);
        assert.equal(openai[0].tool_calls[0].id, 'call_respond');
        assert.match(openai[1].content, /not executed/i);
        assert.doesNotMatch(openai[1].content, /invented/);

        const anthropic = [];
        recordDeferredNativeRespond(anthropic, 'anthropic', [{
            name: 'respond',
            native: true,
            callId: 'toolu_respond',
            rawArgs: '{"content":"invented"}',
        }]);
        assert.equal(anthropic[1].content[0].type, 'tool_result');
        assert.equal(anthropic[1].content[0].tool_use_id, 'toolu_respond');
    });

    it('converts OpenAI history into an Ollama-legal payload', () => {
        const converted = toOllamaMessage({
            role: 'assistant',
            content: null,
            tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'listDir', arguments: '{"path":"."}' } }],
        });
        assert.equal(converted.content, '');
        assert.deepEqual(converted.tool_calls[0].function.arguments, { path: '.' });
        assert.equal(toOllamaMessage({ role: 'tool', name: 'listDir', content: 'ok' }).tool_name, 'listDir');
    });

    it('recognizes schema rejection and unsupported providers', () => {
        assert.equal(supportsNativeTools('github'), true);
        assert.equal(supportsNativeTools('lmstudio'), false);
        assert.equal(isToolSchemaRejection({ response: { status: 400, data: { error: { message: 'tools parameter is unsupported' } } } }), true);
        assert.equal(isToolSchemaRejection({ response: { status: 500, data: { message: 'tools unavailable' } } }), false);
    });
});

describe('native history compaction', () => {
    it('does not split a tool call from its result', () => {
        const messages = [
            { role: 'user', content: '## Current Task:\nkeep me' },
            ...Array.from({ length: 8 }, (_, index) => ({ role: 'user', content: `older ${index} ${'x'.repeat(8000)}` })),
            { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'listDir', arguments: '{}' } }] },
            { role: 'tool', tool_call_id: 'call_1', content: 'result' },
        ];
        const result = compactLoopMessages(messages, { budgetTokens: 1000, currentTask: 'keep me' });
        assert.equal(result.compressed, true);
        const callIndex = messages.findIndex(message => message.tool_calls);
        assert.equal(messages[callIndex + 1].role, 'tool');
        assert.equal(messages.some(message => message.role === 'tool' && messages[messages.indexOf(message) - 1]?.tool_calls?.[0]?.id !== message.tool_call_id), false);
    });
});
