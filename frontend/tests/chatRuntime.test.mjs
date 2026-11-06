import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createEpochGuard, loadChatSnapshot, getDispatchConfig,
  readCachedConfig, cacheConfig, persistConfig, applyStreamingActions,
} from '../src/utils/chatRuntime.js';
import { migrateApiProviderConfig, API_PROVIDER_DEFAULTS } from '../src/utils/chatProviderConfig.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('A-B-A: stale history, running result and rejection cannot mutate current load', async () => {
  for (const stage of ['history', 'running', 'error']) {
    const guard = createEpochGuard();
    const mutations = [];
    const history = deferred();
    const running = deferred();
    const first = loadChatSnapshot({
      isCurrent: guard.capture(),
      loadHistory: () => history.promise,
      applyHistory: value => mutations.push(value),
      loadRunning: () => running.promise,
      applyRunning: value => mutations.push(value),
      onError: () => mutations.push('old error cleared loading'),
    });
    if (stage === 'running') {
      history.resolve('initial A');
      await Promise.resolve();
    }
    guard.invalidate(); // B
    guard.invalidate(); // new A, same ID but distinct epoch
    await loadChatSnapshot({
      isCurrent: guard.capture(),
      loadHistory: async () => 'new A',
      applyHistory: value => mutations.push(value),
      loadRunning: async () => 'new running state',
      applyRunning: value => mutations.push(value),
      onError: assert.fail,
    });
    const expected = [...mutations];
    if (stage === 'error') history.reject(new Error('stale A failed'));
    else history.resolve('stale A');
    running.resolve('stale running state');
    await first;
    assert.deepEqual(mutations, expected, stage);
  }
});

test('leaving to a new chat invalidates the load and current errors still surface', async () => {
  const guard = createEpochGuard();
  const isCurrent = guard.capture();
  guard.invalidate();
  assert.equal(isCurrent(), false);
  let error;
  await loadChatSnapshot({
    isCurrent: guard.capture(),
    loadHistory: async () => { throw new Error('current failure'); },
    applyHistory: assert.fail, loadRunning: assert.fail, applyRunning: assert.fail,
    onError: value => { error = value; },
  });
  assert.equal(error.message, 'current failure');
});

test('an old queue callback reads latest model, key and permissions at dispatch', () => {
  const configRef = { current: { model: 'old', agentPermissionMode: 'full-access', openaiApiKey: 'old' } };
  const options = { workspacePath: 'queued-workspace', useMcp: true };
  const oldDrain = () => getDispatchConfig(configRef, options);
  configRef.current = { provider: 'openai', model: 'new', agentPermissionMode: 'default', openaiApiKey: '', workspacePath: 'new-workspace' };
  const sent = oldDrain();
  assert.equal(sent.model, 'new');
  assert.equal(sent.provider, 'openai');
  assert.equal(sent.agentPermissionMode, 'default');
  assert.equal(sent.openaiApiKey, '');
  assert.equal(sent.workspacePath, 'queued-workspace');
  assert.equal(getDispatchConfig(configRef).workspacePath, 'new-workspace');
  assert.equal(configRef.current.workspacePath, 'new-workspace');
});

test('legacy migration precedes defaults; explicit empty keys and URLs survive reloads', () => {
  const legacy = { provider: 'openai', apiKey: 'legacy-key' };
  const migrated = { ...API_PROVIDER_DEFAULTS, ...migrateApiProviderConfig(legacy) };
  assert.equal(migrated.openaiApiKey, 'legacy-key');
  assert.equal(legacy.openaiApiKey, undefined);
  const cleared = migrateApiProviderConfig({ ...migrated, openaiApiKey: '' });
  assert.equal(migrateApiProviderConfig(JSON.parse(JSON.stringify(cleared))).openaiApiKey, '');
  assert.equal(migrateApiProviderConfig({ provider: 'deepseek', apiKey: 'old', deepseekApiKey: '' }).deepseekApiKey, '');
  const custom = migrateApiProviderConfig({ provider: 'custom', apiKey: 'old', apiBaseUrl: 'https://old' });
  assert.equal(custom.customApiKey, 'old');
  assert.equal(custom.customApiBaseUrl, 'https://old');
  const disabled = migrateApiProviderConfig({ ...custom, customApiKey: '', customApiBaseUrl: '' });
  assert.equal(disabled.customApiKey, '');
  assert.equal(disabled.customApiBaseUrl, '');
});

test('unavailable/quota-limited storage never prevents backend config saves', async () => {
  for (const name of ['QuotaExceededError', 'SecurityError']) {
    const storage = {
      getItem() { throw Object.assign(new Error('storage blocked'), { name }); },
      setItem() { throw Object.assign(new Error('storage blocked'), { name }); },
    };
    assert.equal(readCachedConfig(storage), null);
    assert.doesNotThrow(() => cacheConfig({}, storage));
    const config = { model: 'latest' };
    let saved;
    await persistConfig(config, storage, async value => { saved = value; });
    assert.equal(saved, config);
    await assert.rejects(persistConfig(config, storage, async () => { throw new Error('backend offline'); }), /backend offline/);
  }
  assert.equal(readCachedConfig({ getItem: () => '{broken' }), null);
});

test('streaming actions preview updates, empty preview clears, committed actions and terminals clear', () => {
  const original = { id: 1, parts: [], streamingActions: [] };
  const preview = [{ tool: 'search', args: { query: 'partial' } }];
  const streaming = applyStreamingActions(original, { streamingActions: preview });
  assert.deepEqual(streaming.streamingActions, preview);
  assert.deepEqual(original.streamingActions, []);
  assert.deepEqual(applyStreamingActions(streaming, { text: 'text' }).streamingActions, preview);
  assert.deepEqual(applyStreamingActions(streaming, { streamingActions: [] }).streamingActions, []);
  assert.deepEqual(applyStreamingActions(streaming, { action: { tool: 'search' } }).streamingActions, []);
  for (const status of ['done', 'error', 'interrupted', 'awaitingApproval']) {
    assert.deepEqual(applyStreamingActions({ ...streaming, status }, {}, true).streamingActions, []);
  }
});

test('App wires helpers into active dispatch, load, persistence and stream paths', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const stream = app.slice(app.indexOf('const streamPendingAssistantResponse'), app.indexOf('const sendMessageWithContext'));
  const send = app.slice(app.indexOf('const sendMessageWithContext'), app.indexOf('const handleRestoreCheckpoint'));
  assert.match(stream, /const config = getDispatchConfig\(configRef, options\)/);
  assert.match(send, /const config = getDispatchConfig\(configRef, options\)/);
  assert.match(stream, /applyStreamingActions\(message, data\)/);
  assert.match(stream, /applyStreamingActions\(m, data\)/);
  assert.match(stream, /applyStreamingActions\(enhancedMessage, \{\}, true\)/);
  assert.match(app, /return loadChatSnapshot\(/);
  assert.match(app, /chatEpochRef\.current\.invalidate\(\)/);
  assert.match(app, /persistConfig\(config, CONFIG_CACHE/);
});