import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatQueueStore, restoreQueues, mergeSteeringEvent, canAdvanceQueue, isComposerComposing } from '../src/utils/chatQueue.js';

test('FIFO is chat-isolated, snapshots files/options and reserves synchronously', () => {
  const store = createChatQueueStore();
  const payload = { text: 'first', files: [{ name: 'a', content: 'preview' }], options: { useMcp: true, storyGlassPreferences: { mode: 'auto' } } };
  const a = store.enqueue('a', payload);
  const b = store.enqueue('a', { text: 'second' });
  store.enqueue('b', { text: 'other' });
  payload.files[0].content = 'changed';
  payload.options.storyGlassPreferences.mode = 'changed';
  assert.equal(store.take('a').id, a.id);
  assert.equal(store.take('a'), null);
  assert.equal(store.claim('a', a.id), null);
  assert.equal(store.remove('a', a.id), null);
  assert.equal(store.get('a').items[0].files[0].content, 'preview');
  assert.equal(store.get('a').items[0].options.storyGlassPreferences.mode, 'auto');
  store.remove('a', a.id, true);
  assert.equal(store.take('a').id, b.id);
  assert.equal(store.get('b').items[0].text, 'other');
});

test('steer failure retains item, busy excludes editing and dequeue, explicit resume required', () => {
  const store = createChatQueueStore();
  const item = store.enqueue('a', { text: 'steer' });
  assert.ok(store.claim('a', item.id));
  assert.equal(store.take('a'), null);
  assert.equal(store.remove('a', item.id), null);
  store.release('a', item.id, '409');
  store.pause('a');
  assert.equal(store.take('a'), null);
  assert.equal(store.get('a').items[0].error, '409');
  store.resume('a');
  assert.equal(store.take('a').id, item.id);
});

test('restoration always pauses and unlocks interrupted steering; corrupted storage is safe', () => {
  const store = createChatQueueStore();
  const item = store.enqueue('a', { text: 'draft', files: [], options: {} });
  store.claim('a', item.id);
  const restored = restoreQueues(JSON.stringify({ a: store.get('a') }));
  assert.equal(restored.a.paused, true);
  assert.equal(restored.a.items[0].busy, false);
  assert.equal(restored.a.items[0].text, 'draft');
  assert.deepEqual(restoreQueues('{bad'), {});
  assert.deepEqual(restoreQueues('null'), {});
});

test('withdraw/edit removes once and can preserve original FIFO on dispatch refusal', () => {
  const store = createChatQueueStore();
  const first = store.enqueue('a', { text: 'first' });
  store.enqueue('a', { text: 'second' });
  const draft = store.remove('a', first.id);
  assert.equal(draft.text, 'first');
  assert.equal(store.remove('a', first.id), null);
  store.prepend('a', draft);
  assert.equal(store.take('a').id, first.id);
});

test('only successful terminal result advances; DONE fallback never overrides errors/approval/stop', () => {
  assert.equal(canAdvanceQueue({ outcome: 'completed' }), true);
  assert.equal(canAdvanceQueue({ done: true }), true);
  for (const outcome of ['awaitingApproval', 'error', 'stopped']) assert.equal(canAdvanceQueue({ outcome, done: true }), false);
  for (const flag of ['error', 'approval', 'stopped']) assert.equal(canAdvanceQueue({ outcome: 'completed', done: true, [flag]: true }), false);
  assert.equal(canAdvanceQueue({ done: false }), false);
});

test('202/SSE duplicate and out-of-order steering is monotonic and assistant-bound', () => {
  const base = [{ id: 1, role: 'assistant' }, { id: 2, role: 'assistant' }];
  const accepted = { assistantMsgId: '1', status: 'accepted', steering: { id: 's', text: 'guide', acceptedAt: 1 } };
  let messages = mergeSteeringEvent(base, { ...accepted, status: 'applied', steering: { ...accepted.steering, appliedAt: 2 } });
  messages = mergeSteeringEvent(messages, accepted);
  messages = mergeSteeringEvent(messages, accepted);
  assert.equal(messages[0].steeringMessages.length, 1);
  assert.equal(messages[0].steeringMessages[0].status, 'applied');
  assert.equal(messages[0].steeringMessages[0].appliedAt, 2);
  assert.equal(messages[1].steeringMessages, undefined);
  assert.equal(base[0].steeringMessages, undefined);
});

test('IME composing Enter must not submit including Windows 229 fallback', () => {
  assert.equal(isComposerComposing({ key: 'Enter', nativeEvent: { isComposing: true } }), true);
  assert.equal(isComposerComposing({ key: 'Enter', keyCode: 229 }), true);
  assert.equal(isComposerComposing({ key: 'Enter' }, true), true);
  assert.equal(Boolean(isComposerComposing({ key: 'Enter' })), false);
});