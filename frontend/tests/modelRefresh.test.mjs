import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyProviderModelUpdates,
  decorateModel,
  fetchApiProviderModels,
  fetchProviderModels,
  mergeModelCatalog,
  startModelRefresh,
} from '../src/utils/modelRefresh.js';

test('vision detection respects disabled support and text-only capability metadata', () => {
  assert.equal(decorateModel({ name: 'gpt-4o', supportsVision: false }).supportsVision, false);
  assert.equal(decorateModel({ name: 'chat', capabilities: { vision: false } }).supportsVision, false);
  assert.equal(decorateModel({ name: 'chat', capabilities: { modalities: ['text'] } }).supportsVision, false);
  assert.equal(decorateModel({ name: 'chat', capabilities: { supports: { vision: true } } }).supportsVision, true);
  assert.equal(decorateModel({ name: 'chat', capabilities: { modalities: ['text', 'image'] } }).supportsVision, true);
});

test('successful catalogs replace old entries, empty catalogs clear them, failed providers retain cache', () => {
  const old = [{ provider: 'ollama', name: 'removed' }, { provider: 'copilot', name: 'cached' }];
  const fresh = [{ provider: 'ollama', name: 'new' }];
  assert.deepEqual(mergeModelCatalog(fresh, old, new Set(['ollama'])), [fresh[0], old[1]]);
  assert.deepEqual(mergeModelCatalog([], old, new Set(['ollama'])), [old[1]]);
});

test('refresh runs on timers and return events, skips hidden/overlapping work and cleans up', async () => {
  const window = new EventTarget();
  const document = new EventTarget();
  document.visibilityState = 'visible';
  const timers = new Map();
  window.setTimeout = window.setInterval = fn => { const id = timers.size + 1; timers.set(id, fn); return id; };
  window.clearTimeout = window.clearInterval = id => timers.delete(id);
  let calls = 0;
  let release;
  const errors = [];
  const stop = startModelRefresh({ window, document, onError: e => errors.push(e), refresh: () => {
    calls++;
    return new Promise(resolve => { release = resolve; });
  } });
  const first = timers.get(1)();
  window.dispatchEvent(new Event('focus'));
  assert.equal(calls, 1);
  release(); await first;
  document.visibilityState = 'hidden';
  await timers.get(2)();
  assert.equal(calls, 1);
  document.visibilityState = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(calls, 2);
  release(); await Promise.resolve();
  window.dispatchEvent(new Event('online'));
  assert.equal(calls, 3);
  release(); await Promise.resolve();
  stop();
  window.dispatchEvent(new Event('focus'));
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(calls, 3);
  assert.equal(timers.size, 0);
  assert.deepEqual(errors, []);
});

test('applyProviderModelUpdates replaces updated provider models, dedupes, and preserves other providers', () => {
  const current = [
    { provider: 'ollama', name: 'llama3', label: 'llama3', supportsVision: false },
    { provider: 'openai', name: 'gpt-3.5-turbo', label: 'gpt-3.5-turbo', supportsVision: false },
  ];
  const updated = applyProviderModelUpdates(current, {
    openai: [
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'o3-mini', label: 'o3-mini' },
    ],
  });
  assert.deepEqual(
    updated.map(m => ({ provider: m.provider, name: m.name, supportsVision: m.supportsVision })),
    [
      { provider: 'openai', name: 'gpt-4o', supportsVision: true },
      { provider: 'openai', name: 'o3-mini', supportsVision: false },
      { provider: 'ollama', name: 'llama3', supportsVision: false },
    ]
  );
});

test('fetchApiProviderModels queries backend endpoint, normalizes models, and surfaces errors', async () => {
  let requestedUrl = '';
  const result = await fetchApiProviderModels({
    backendUrl: 'http://localhost:3001',
    provider: 'custom',
    baseUrl: 'https://example.com/v1',
    apiKey: 'sk-test',
    fetchImpl: async (url) => {
      requestedUrl = url;
      return {
        ok: true,
        status: 200,
        json: async () => ([
          { id: 'deepseek-chat', label: 'DeepSeek Chat' },
          { id: 'qwen-vl-max', label: 'Qwen VL Max' },
        ]),
      };
    },
  });
  assert.equal(
    requestedUrl,
    'http://localhost:3001/api/provider/models?provider=custom&baseUrl=https%3A%2F%2Fexample.com%2Fv1&apiKey=sk-test'
  );
  assert.equal(result.length, 2);
  assert.equal(result[0].provider, 'custom');
  assert.equal(result[1].supportsVision, true);

  await assert.rejects(
    () => fetchApiProviderModels({
      backendUrl: 'http://localhost:3001',
      provider: 'openai',
      apiKey: 'bad',
      fetchImpl: async () => ({
        ok: false,
        status: 502,
        json: async () => ({ error: 'Incorrect API key provided' }),
      }),
    }),
    /Incorrect API key provided/
  );
});

test('fetchProviderModels supports ollama, lmstudio, and copilot endpoints', async () => {
  const seen = [];
  const ollamaModels = await fetchProviderModels({
    backendUrl: 'http://localhost:3001',
    provider: 'ollama',
    ollamaUrl: 'http://127.0.0.1:11434',
    fetchImpl: async (url) => {
      seen.push(url);
      return { ok: true, status: 200, json: async () => ['llama3:8b', 'qwen2.5vl:7b'] };
    },
  });
  assert.equal(seen[0], 'http://localhost:3001/api/models?ollamaUrl=http%3A%2F%2F127.0.0.1%3A11434');
  assert.deepEqual(ollamaModels.map(m => m.name), ['llama3:8b', 'qwen2.5vl:7b']);
  assert.equal(ollamaModels[1].supportsVision, true);

  const lmModels = await fetchProviderModels({
    backendUrl: 'http://localhost:3001',
    provider: 'lmstudio',
    lmstudioUrl: 'http://localhost:1234',
    fetchImpl: async (url) => {
      seen.push(url);
      return { ok: true, status: 200, json: async () => [{ id: 'qwen-7b', label: 'Qwen 7B' }] };
    },
  });
  assert.equal(seen[1], 'http://localhost:3001/api/lmstudio/models?lmstudioUrl=http%3A%2F%2Flocalhost%3A1234');
  assert.equal(lmModels[0].provider, 'lmstudio');

  const copilotModels = await fetchProviderModels({
    backendUrl: 'http://localhost:3001',
    provider: 'copilot',
    copilotToken: 'ghu_123',
    fetchImpl: async (url) => {
      seen.push(url);
      return { ok: true, status: 200, json: async () => [{ id: 'openai/gpt-4o', label: 'OpenAI GPT-4o' }] };
    },
  });
  assert.equal(seen[2], 'http://localhost:3001/api/github/models?token=ghu_123');
  assert.equal(copilotModels[0].name, 'gpt-4o');
  assert.equal(copilotModels[0].supportsVision, true);
});
