'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Readable, PassThrough } = require('node:stream');
const { EventEmitter } = require('node:events');

const {
    AGENT_STOP_SEQUENCES,
    buildOllamaChatOptions,
    hydrateAxiosStreamError,
    isOllamaThinkingUnsupportedError,
    parseProviderFrame,
    resolveOllamaNumCtx,
} = require('../services/agentLoopUtils');
const { createLineBuffer } = require('../services/streamBuffer');
const { createResponseTextStream } = require('../services/responseTextStream');
const {
    NATIVE_PROTOCOL_NOTE,
    buildAgentSystemText,
    createNativeCallAccumulator,
    isOllamaToolParseError,
    isToolSchemaRejection,
    toOllamaMessage,
} = require('../services/nativeToolCalling');
const { buildCompactAgentPrompt } = require('../services/smallModelContext');

const serverSource = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8').replace(/\r\n/g, '\n');
const section = (start, end) => serverSource.slice(serverSource.indexOf(start), serverSource.indexOf(end, serverSource.indexOf(start)));

function createCallLlmContext(axiosImpl) {
    const context = vm.createContext({
        normalizeChatProviderId: id => id,
        getConfiguredChatApiKey: () => '',
        axios: { post: axiosImpl },
        postModelStream: axiosImpl,
        createLineBuffer,
        parseProviderFrame,
        getAnthropicModelProfile: () => ({ maxTokens: 4096, thinkingBudget: 0 }),
        console,
        globalThis,
        Buffer,
    });
    vm.runInContext(section('async function callLLM(', 'async function runDeepReadingLoop('), context);
    return context;
}

describe('Ollama options & error helpers', () => {
    test('buildOllamaChatOptions omits stop sequences and forced repeat_penalty in native agent mode', () => {
        const nativeOpts = buildOllamaChatOptions({}, { nativeToolsEnabled: true, numCtx: 32768, isAgent: true });
        assert.equal(nativeOpts.stop, undefined);
        assert.equal(nativeOpts.repeat_penalty, undefined);
        assert.equal(nativeOpts.temperature, 0.6);
        assert.equal(nativeOpts.num_ctx, 32768);
        assert.equal(nativeOpts.num_predict, 8192);

        const textOpts = buildOllamaChatOptions({}, { nativeToolsEnabled: false, numCtx: 16384, isAgent: true });
        assert.deepEqual(textOpts.stop, AGENT_STOP_SEQUENCES);
        assert.equal(textOpts.repeat_penalty, undefined);

        const customOpts = buildOllamaChatOptions({ temperature: 0.25, repeatPenalty: 1.05, maxTokens: 2048 }, { nativeToolsEnabled: true, isAgent: false });
        assert.equal(customOpts.temperature, 0.25);
        assert.equal(customOpts.repeat_penalty, 1.05);
        assert.equal(customOpts.num_predict, 2048);
    });

    test('compact prompt and native protocol do not encourage mixed XML tool syntax', () => {
        const prompt = buildCompactAgentPrompt({
            persona: 'Saki',
            envInfo: { os: 'Windows', cwd: 'd:\\demo', shell: 'PowerShell' },
            filesDir: 'files',
            capabilityProfile: 'Search enabled',
            toolCatalog: 'respond(text)',
        });
        assert.doesNotMatch(prompt, /XML is also supported/i);
        assert.doesNotMatch(NATIVE_PROTOCOL_NOTE, /fall back to one Tool: or XML/i);
    });

    test('isOllamaToolParseError detects XML EOF and Go template parser failures without over-matching', () => {
        assert.equal(isOllamaToolParseError(new Error('XML syntax error on line 122: unexpected EOF')), true);
        assert.equal(isOllamaToolParseError({ response: { status: 500, data: { error: 'qwen3.5 tool call parsing failed' } } }), true);
        assert.equal(isOllamaToolParseError(new Error('model does not support tools')), false);
        assert.equal(isOllamaToolParseError(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })), false);
    });

    test('hydrateAxiosStreamError extracts JSON error detail from readable response streams', async () => {
        const err = Object.assign(new Error('Request failed with status code 400'), {
            response: {
                status: 400,
                data: Readable.from(['{"error":"\\"gemma3\\" does not support thinking"}']),
            },
        });
        await hydrateAxiosStreamError(err);
        assert.equal(err.response.data.error, '"gemma3" does not support thinking');
        assert.match(err.message, /does not support thinking/);
        assert.equal(isOllamaThinkingUnsupportedError(err), true);
    });
});

describe('callLLM Ollama adaptation', () => {
    test('disables thinking when applyThinkingLevel is false, reads thinking frames, forwards images, and closes on done=true', async () => {
        const requests = [];
        let destroyed = false;
        const stream = new EventEmitter();
        stream.destroy = () => { destroyed = true; };

        const c = createCallLlmContext(async (url, body) => {
            requests.push({ url, body });
            setImmediate(() => {
                stream.emit('data', Buffer.from('{"thinking":"internal reasoning","done":false}\n'));
                stream.emit('data', Buffer.from('{"response":"hello world","done":false}\n'));
                stream.emit('data', Buffer.from('{"response":"","done":true,"eval_count":12}\n'));
            });
            return { data: stream };
        });

        const tokens = [];
        const thoughts = [];
        const result = await Promise.race([
            c.callLLM(
                'ollama',
                'qwen3.5:test-a',
                'http://127.0.0.1:11434',
                'hello',
                { applyThinkingLevel: false, systemPrompt: 'sys', images: ['imgB64'] },
                t => tokens.push(t),
                r => thoughts.push(r)
            ),
            new Promise((_, reject) => setTimeout(() => reject(new Error('callLLM timed out waiting for close')), 250)),
        ]);

        assert.equal(requests.length, 1);
        assert.equal(requests[0].url, 'http://127.0.0.1:11434/api/generate');
        assert.equal(requests[0].body.think, false);
        assert.equal(requests[0].body.system, 'sys');
        assert.deepEqual(requests[0].body.images, ['imgB64']);
        assert.equal(requests[0].body.options, undefined);
        assert.equal(result, 'hello world');
        assert.deepEqual(tokens, ['hello world']);
        assert.deepEqual(thoughts, ['internal reasoning']);
        assert.equal(destroyed, true);
    });

    test('retries without think on non-thinking model 400 stream and caches capability for subsequent calls', async () => {
        const requests = [];
        const model = `gemma-nonthink-${Date.now()}`;
        const urlKey = 'http://127.0.0.1:11499';
        globalThis.__sakiOllamaNoThinkModels?.delete(`${urlKey}::${model}`);

        const c = createCallLlmContext(async (url, body) => {
            requests.push({ url, body });
            if (body.think !== undefined) {
                throw Object.assign(new Error('Request failed with status code 400'), {
                    response: {
                        status: 400,
                        data: Readable.from([JSON.stringify({ error: `"${model}" does not support thinking` })]),
                    },
                });
            }
            return { data: Readable.from(['{"message":{"content":"ok"},"done":true}\n']) };
        });

        const first = await c.callLLM(
            'ollama',
            model,
            urlKey,
            [{ role: 'user', content: [{ type: 'text', text: 'see' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } }] }],
            { applyThinkingLevel: false, systemPrompt: 'sys' }
        );
        const second = await c.callLLM('ollama', model, urlKey, [{ role: 'user', content: 'next' }], { applyThinkingLevel: false });

        assert.equal(first, 'ok');
        assert.equal(second, 'ok');
        assert.equal(requests.length, 3);
        assert.equal(requests[0].url, `${urlKey}/api/chat`);
        assert.equal(requests[0].body.think, false);
        assert.equal(requests[0].body.messages[0].role, 'system');
        assert.deepEqual(requests[0].body.messages[1].images, ['abc123']);
        assert.equal(requests[1].body.think, undefined);
        assert.equal(requests[2].body.think, undefined);
    });
});

function createAgentOllamaHarness({ axiosImpl, messagesList, nativeToolsEnabled = true, config = {}, model = 'huihui_ai/qwen3.5-abliterated:4b-Claude' }) {
    const ollamaBlock = section(
        "        if (provider === 'ollama') {\n            let retryCount",
        "        } else if (provider === 'copilot' || provider === 'github'"
    );
    const sseEvents = [];
    const res = {
        writableEnded: false,
        write(chunk) {
            const line = String(chunk).trim();
            if (line.startsWith('data: ')) {
                sseEvents.push(JSON.parse(line.slice(6)));
            }
        },
    };
    const nativeCallAccumulator = {
        tools: [{ type: 'function', function: { name: 'respond', parameters: { type: 'object', properties: { text: { type: 'string' } } } } }],
        names: new Map([['respond', 'respond']]),
    };

    const script = `
    (async () => {
        let aborted = false;
        let nativeToolsEnabled = ${Boolean(nativeToolsEnabled)};
        let ollamaToolParseFallbackUsed = false;
        let turn = 0;
        while (turn < 3) {
            turn++;
            let assistantResponse = "";
            let assistantReasoning = "";
            let assistantReasoningStreamed = false;
            const nativeCalls = createNativeCallAccumulator(nativeCallAccumulator.names);
            const responseTextStream = createResponseTextStream(evt => {
                if (!res.writableEnded) res.write('data: ' + JSON.stringify(evt) + '\\n\\n');
            });
            const handleReasoningProgress = (content) => {
                const clean = String(content || '').replace(/<\\/?think>/gi, '');
                if (!clean) return;
                assistantReasoning += clean;
                assistantReasoningStreamed = true;
                res.write('data: ' + JSON.stringify({ reasoning: clean }) + '\\n\\n');
            };
            const handleStreamProgress = (content) => {
                assistantResponse += content;
                responseTextStream.update(assistantResponse);
            };
            ${ollamaBlock}
        }
            return { turn, assistantResponse, assistantReasoning, nativeToolsEnabled, sseEvents };
        }
        throw new Error('Exceeded max test turns');
    })()
    `;

    const context = vm.createContext({
        provider: 'ollama',
        ollamaUrl: 'http://127.0.0.1:11434',
        model,
        config,
        currentPrompt: 'Base system instructions',
        messagesList,
        nativeCallAccumulator,
        historyContext: { status: { budgetTokens: 32768 } },
        resolveOllamaNumCtx,
        buildOllamaChatOptions,
        buildAgentSystemText,
        toOllamaMessage,
        loopAbortController: new AbortController(),
        axios: { post: axiosImpl },
        createLineBuffer,
        parseProviderFrame,
        onUsage: () => {},
        createNativeCallAccumulator,
        createResponseTextStream,
        res,
        sseEvents,
        sendDone: async (outcome) => { sseEvents.push({ type: 'sendDone', outcome }); },
        hydrateAxiosStreamError,
        isOllamaThinkingUnsupportedError,
        isToolSchemaRejection,
        isOllamaToolParseError,
        console,
        globalThis,
        Buffer,
        setTimeout,
    });
    return { promise: vm.runInContext(script, context), sseEvents };
}

describe('runAgentLoopInWorkspace Ollama stream & error recovery', () => {
    test('finishes turn immediately on done=true even if underlying HTTP stream never closes, and captures message.thinking', async () => {
        const stream = new PassThrough();
        let destroyCount = 0;
        const origDestroy = stream.destroy.bind(stream);
        stream.destroy = (...args) => {
            destroyCount++;
            return origDestroy(...args);
        };

        const { promise, sseEvents } = createAgentOllamaHarness({
            messagesList: [{ role: 'user', content: 'hi' }],
            axiosImpl: async () => {
                setImmediate(() => {
                    stream.write('{"message":{"role":"assistant","content":"","thinking":"step1"},"done":false}\n');
                    stream.write('{"message":{"role":"assistant","content":"Done answer"},"done":true,"done_reason":"stop"}\n');
                    // Intentionally do NOT call stream.end() to simulate hung keep-alive TCP socket.
                });
                return { data: stream };
            },
        });

        const result = await Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Agent Ollama loop hung after done=true')), 300)),
        ]);

        assert.equal(result.assistantReasoning, 'step1');
        assert.equal(result.assistantResponse, 'Done answer');
        assert.equal(destroyCount >= 1, true);
        assert.ok(sseEvents.some(e => e.reasoning === 'step1'));
        assert.ok(sseEvents.some(e => e.text === 'Done answer'));
    });

    test('falls back cleanly when XML tool parse fails before visible text', async () => {
        const seenPayloads = [];
        const messagesList = [{ role: 'user', content: 'do work' }];

        const { promise, sseEvents } = createAgentOllamaHarness({
            messagesList,
            axiosImpl: async (_url, body) => {
                seenPayloads.push(body);
                if (seenPayloads.length === 1) {
                    return {
                        data: Readable.from([
                            '{"message":{"role":"assistant","content":"","thinking":"let me call a tool"},"done":false}\n',
                            '{"error":"XML syntax error on line 122: unexpected EOF"}\n',
                        ]),
                    };
                }
                return {
                    data: Readable.from([
                        '{"message":{"role":"assistant","content":"Tool: respond(\\"ok\\")"},"done":true}\n',
                    ]),
                };
            },
        });

        const result = await promise;
        assert.equal(seenPayloads.length, 2);
        assert.ok(Array.isArray(seenPayloads[0].tools));
        assert.equal(seenPayloads[0].options.stop, undefined);
        assert.equal(seenPayloads[1].tools, undefined);
        assert.deepEqual(seenPayloads[1].options.stop, AGENT_STOP_SEQUENCES);
        assert.equal(result.nativeToolsEnabled, false);
        assert.equal(result.assistantResponse, 'Tool: respond("ok")');
        assert.equal(sseEvents.some(e => e.type === 'sendDone'), false);
    });

    test('recovers into a text-protocol continuation turn when XML parse fails after partial visible preface', async () => {
        const seenPayloads = [];
        const messagesList = [{ role: 'user', content: 'plan a trip' }];

        const { promise, sseEvents } = createAgentOllamaHarness({
            messagesList,
            axiosImpl: async (_url, body) => {
                seenPayloads.push(body);
                if (seenPayloads.length === 1) {
                    return {
                        data: Readable.from([
                            '{"message":{"role":"assistant","content":"嗯？让我规划一下..."},"done":false}\n',
                            '{"error":"XML syntax error on line 122: unexpected EOF"}\n',
                        ]),
                    };
                }
                return {
                    data: Readable.from([
                        '{"message":{"role":"assistant","content":"Tool: respond(\\"计划完成\\")"},"done":true}\n',
                    ]),
                };
            },
        });

        const result = await promise;
        assert.equal(seenPayloads.length, 2);
        assert.equal(result.turn, 2);
        assert.equal(result.nativeToolsEnabled, false);
        assert.equal(result.assistantResponse, 'Tool: respond("计划完成")');
        assert.equal(sseEvents.some(e => e.type === 'sendDone'), false);
        assert.ok(sseEvents.some(e => e.textReplacement?.text === ''));
        assert.ok(messagesList.some(m => m.role === 'user' && /failed XML parsing in Ollama/i.test(m.content)));
    });

    test('hydrates streamed HTTP 400 tool and think rejections so Ollama agent retries cleanly', async () => {
        const seenPayloads = [];
        const model = `legacy-llama-${Date.now()}`;
        globalThis.__sakiOllamaNoThinkModels?.delete(`http://127.0.0.1:11434::${model}`);

        const { promise } = createAgentOllamaHarness({
            model,
            config: { thinkingLevel: 'off' },
            messagesList: [{ role: 'user', content: 'hi' }],
            axiosImpl: async (_url, body) => {
                seenPayloads.push(body);
                if (seenPayloads.length === 1) {
                    throw Object.assign(new Error('Request failed with status code 400'), {
                        response: { status: 400, data: Readable.from([JSON.stringify({ error: `"${model}" does not support thinking` })]) },
                    });
                }
                if (seenPayloads.length === 2) {
                    throw Object.assign(new Error('Request failed with status code 400'), {
                        response: { status: 400, data: Readable.from([JSON.stringify({ error: `"${model}" does not support tools` })]) },
                    });
                }
                return {
                    data: Readable.from(['{"message":{"role":"assistant","content":"Tool: respond(\\"ok\\")"},"done":true}\n']),
                };
            },
        });

        const result = await promise;
        assert.equal(seenPayloads.length, 3);
        assert.equal(seenPayloads[0].think, false);
        assert.equal(seenPayloads[1].think, undefined);
        assert.ok(Array.isArray(seenPayloads[1].tools));
        assert.equal(seenPayloads[2].think, undefined);
        assert.equal(seenPayloads[2].tools, undefined);
        assert.equal(result.nativeToolsEnabled, false);
        assert.equal(result.assistantResponse, 'Tool: respond("ok")');
    });

    test('runChatLoop forwards uploaded images and emits terminal runOutcome before sendDone', () => {
        const chatLoop = section('async function runChatLoop(', 'async function handleCompactCommand(');
        assert.match(chatLoop, /images:\s*imageBase64s\.map/);
        assert.match(chatLoop, /emitRunOutcome\(res,\s*'completed'\);\s*sendDone\(\);/);
        assert.match(chatLoop, /emitRunOutcome\(res,\s*'error',\s*\{\s*error:\s*errText\s*\}\);\s*sendDone\(\);/);
    });
});
