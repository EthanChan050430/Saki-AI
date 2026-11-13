import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeModelCatalog, startModelRefresh } from '../src/utils/modelRefresh.js';

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
