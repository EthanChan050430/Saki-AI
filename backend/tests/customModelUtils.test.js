const test = require('node:test');
const assert = require('node:assert/strict');

const {
    extractCustomApiModels,
    normalizeCustomApiBaseUrl,
    normalizeCustomChatCompletionsUrl,
} = require('../services/customModelUtils');

test('normalizeCustomApiBaseUrl accepts root, /v1, /models, and /chat/completions URLs', () => {
    assert.equal(normalizeCustomApiBaseUrl('https://api.openai.com'), 'https://api.openai.com/v1');
    assert.equal(normalizeCustomApiBaseUrl('https://api.openai.com/v1/'), 'https://api.openai.com/v1');
    assert.equal(normalizeCustomApiBaseUrl('https://api.openai.com/v1/models'), 'https://api.openai.com/v1');
    assert.equal(
        normalizeCustomApiBaseUrl('https://api.openai.com/v1/chat/completions'),
        'https://api.openai.com/v1'
    );
});

test('normalizeCustomChatCompletionsUrl always returns the chat completions endpoint', () => {
    assert.equal(
        normalizeCustomChatCompletionsUrl('https://api.openai.com/v1'),
        'https://api.openai.com/v1/chat/completions'
    );
    assert.equal(
        normalizeCustomChatCompletionsUrl('https://api.openai.com/v1/models'),
        'https://api.openai.com/v1/chat/completions'
    );
});

test('extractCustomApiModels parses OpenAI-style model responses and filters non-chat models', () => {
    const models = extractCustomApiModels({
        data: [
            { id: 'gpt-4o-mini', owned_by: 'openai' },
            { id: 'text-embedding-3-small' },
            { id: 'whisper-1' },
            { id: 'qwen2.5-vl-72b-instruct' },
        ],
    });

    assert.deepEqual(models.map(model => model.name), [
        'gpt-4o-mini',
        'qwen2.5-vl-72b-instruct',
    ]);
});

test('extractCustomApiModels accepts alternative payload shapes and removes duplicates', () => {
    const models = extractCustomApiModels({
        models: [
            'deepseek-chat',
            { name: 'deepseek-chat', label: 'DeepSeek Chat' },
            { model: 'glm-4.5' },
        ],
    });

    assert.deepEqual(models.map(model => model.name), [
        'deepseek-chat',
        'glm-4.5',
    ]);
});
