const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const { ExternalChatBridge, splitText } = require('../services/externalChatBridge');

function event(id = 'message-1', overrides = {}) {
  return {
    header: { token: 'verify', app_id: 'app', event_type: 'im.message.receive_v1' },
    event: { sender: { sender_type: 'user', sender_id: { open_id: 'user-1' } },
      message: { message_id: id, chat_id: 'chat-1', chat_type: 'p2p', message_type: 'text',
        content: JSON.stringify({ text: 'hello' }), ...overrides } },
  };
}

function feishuBridge(onMessage) {
  const bridge = new ExternalChatBridge({ onMessage });
  bridge.config = { feishu: { enabled: true, appId: 'app', appSecret: 'secret', verificationToken: 'verify', botOpenId: 'bot' } };
  return bridge;
}

test('Feishu authenticates callbacks and verifies URL without dispatching', () => {
  const bridge = feishuBridge(() => assert.fail('must not dispatch'));
  assert.equal(bridge.handleFeishu({ ...event(), header: {} }).status, 403);
  assert.deepEqual(bridge.handleFeishu({ token: 'verify', type: 'url_verification', challenge: 'challenge' }),
    { status: 200, body: { challenge: 'challenge' } });
  assert.equal(bridge.handleFeishu({ encrypt: 'encrypted' }).status, 400);
  bridge.config.feishu.enabled = false;
  assert.equal(bridge.handleFeishu(event()).status, 503);
});

test('Feishu deduplicates, enforces allowlist, filters groups and strips bot mention', async () => {
  const received = [];
  const bridge = feishuBridge(async message => received.push(message));
  bridge.config.feishu.allowFrom = ['other'];
  bridge.handleFeishu(event());
  bridge.config.feishu.allowFrom = ['user-1'];
  bridge.handleFeishu(event('group-ignored', { chat_type: 'group' }));
  bridge.handleFeishu(event('group-other', { chat_type: 'group', mentions: [{ id: { open_id: 'someone' }, key: '@_user_1' }] }));
  const groupEvent = event('group-ok', { chat_type: 'group', mentions: [{ id: { open_id: 'bot' }, key: '@_user_1' }],
    content: JSON.stringify({ text: '@_user_1 /new' }) });
  bridge.handleFeishu(groupEvent);
  bridge.handleFeishu(groupEvent);
  bridge.handleFeishu(event('private'));
  await Promise.all(bridge.queues.values());
  assert.deepEqual(received.map(message => message.text), ['/new', 'hello']);
  assert.equal(received[0].accountId, 'app');
  assert.equal(received[0].peerId, 'chat-1');
  assert.equal(bridge.handleFeishu(event('invalid', { content: '{' })).status, 400);
});

test('messages in the same conversation execute serially and recover after a failure', async () => {
  const order = [];
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const bridge = new ExternalChatBridge({ onMessage: async message => {
    order.push(message.text);
    if (message.text === 'first') { await barrier; throw new Error('failed'); }
  } });
  const meta = { platform: 'feishu', accountId: 'app', peerId: 'chat' };
  const first = bridge.dispatch({ ...meta, text: 'first' });
  const handled = assert.rejects(first, /failed/);
  const second = bridge.dispatch({ ...meta, text: 'second' });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(order, ['first']);
  release();
  await Promise.all([handled, second]);
  assert.deepEqual(order, ['first', 'second']);
});

test('Telegram polls text, handles group mentions, applies allowlist and persists offset', async t => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'saki-chat-'));
  t.after(() => fs.remove(dataDir));
  const controller = new AbortController();
  const calls = [];
  const received = [];
  let polls = 0;
  const message = (id, chatType, text, userId = 1) => ({ update_id: id, message: {
    chat: { id: 10, type: chatType }, from: { id: userId, first_name: 'User' }, text,
  } });
  const http = { post: async (url, body) => {
    const method = url.split('/').pop();
    calls.push({ method, body });
    if (method === 'getMe') return { data: { ok: true, result: { id: 100, username: 'SakiBot' } } };
    if (method === 'getWebhookInfo') return { data: { ok: true, result: { url: '' } } };
    if (method === 'getUpdates') {
      if (polls++) { controller.abort(); return { data: { ok: true, result: [] } }; }
      return { data: { ok: true, result: [message(1, 'private', 'hello'), message(2, 'private', 'blocked', 2),
        message(3, 'group', 'ignored'), message(4, 'group', '/new@SakiBot')] } };
    }
    return { data: { ok: true, result: {} } };
  } };
  const bridge = new ExternalChatBridge({ dataDir, http, onMessage: async msg => { received.push(msg); await msg.deliver('answer'); } });
  await bridge.pollTelegram({ botToken: 'token', allowFrom: ['1'] }, controller.signal);
  assert.deepEqual(received.map(msg => msg.text), ['hello', '/new']);
  assert.equal(calls.filter(call => call.method === 'sendMessage').length, 2);
  const saved = await fs.readJson(path.join(dataDir, 'telegram_offset.json'));
  assert.equal(saved.next, 5);
  assert.equal(JSON.stringify(saved).includes('token'), false);
});

test('Telegram reports webhook conflicts without removing the webhook or leaking token', async t => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'saki-chat-'));
  t.after(() => fs.remove(dataDir));
  const methods = [];
  const bridge = new ExternalChatBridge({ dataDir, http: { post: async url => {
    const method = url.split('/').pop();
    methods.push(method);
    return { data: { ok: true, result: method === 'getMe' ? { id: 1 } : { url: 'https://example.test' } } };
  } } });
  await bridge.pollTelegram({ botToken: 'secret' }, new AbortController().signal);
  assert.match(bridge.getStatus('telegram').error, /webhook is active/);
  assert.deepEqual(methods, ['getMe', 'getWebhookInfo']);
  bridge.http.post = async () => { throw new Error('secret URL'); };
  await assert.rejects(bridge.telegramApi({ botToken: 'secret' }, 'getMe', {}), error => !error.message.includes('secret'));
});

test('Feishu replies refresh tokens and split long Unicode text within platform limits', async () => {
  const calls = [];
  const bridge = feishuBridge(async () => {});
  bridge.http = { post: async (url, body) => {
    calls.push({ url, body });
    return { data: url.includes('/auth/') ? { code: 0, tenant_access_token: 'access', expire: 7200 } : { code: 0 } };
  } };
  const text = 'a'.repeat(2999) + '\u{1f600}' + 'z'.repeat(4000);
  await bridge.sendFeishu('message', text);
  await bridge.sendFeishu('message', 'again');
  assert.equal(calls.filter(call => call.url.includes('/auth/')).length, 1);
  const chunks = calls.filter(call => !call.url.includes('/auth/')).map(call => JSON.parse(call.body.content).text);
  assert.equal(chunks.slice(0, -1).join(''), text);
  assert.ok(chunks.every(chunk => chunk.length <= 3000));
  assert.deepEqual(splitText('short', 4000), ['short']);
});
