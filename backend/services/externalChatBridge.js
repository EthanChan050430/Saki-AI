const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { timingSafeEqual, createHash } = require('crypto');

function splitText(text, limit) {
  const chunks = [];
  let chunk = '';
  for (const character of String(text || '')) {
    if (chunk.length + character.length > limit) {
      chunks.push(chunk);
      chunk = '';
    }
    chunk += character;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

class ExternalChatBridge {
  constructor({ dataDir, onMessage, http = axios }) {
    this.dataDir = dataDir;
    this.onMessage = onMessage;
    this.http = http;
    this.config = {};
    this.status = {};
    this.seen = new Map();
    this.queues = new Map();
    this.controller = null;
    this.pollTask = null;
    this.signature = '';
    this.syncQueue = Promise.resolve();
  }

  getStatus(platform) {
    const config = this.config[platform] || {};
    const configured = platform === 'telegram'
      ? Boolean(config.botToken?.trim())
      : Boolean(config.appId?.trim() && config.appSecret?.trim() && config.verificationToken?.trim());
    return { enabled: Boolean(config.enabled), configured, ok: false, ...this.status[platform] };
  }

  syncWithConfig(root) {
    const next = this.syncQueue.then(() => this.applyConfig(root));
    this.syncQueue = next.catch(error => console.error('[ExternalChat] Configuration failed:', error.message));
    return next;
  }

  async applyConfig(root) {
    const config = root.thirdPartyChats || {};
    const signature = JSON.stringify([config.telegram, config.feishu]);
    if (signature === this.signature) return;
    this.signature = signature;
    if (this.controller) this.controller.abort();
    if (this.pollTask) await this.pollTask;
    this.config = config;
    this.status = {};
    this.feishuToken = null;
    if (config.telegram?.enabled && this.getStatus('telegram').configured) {
      this.controller = new AbortController();
      this.pollTask = this.pollTelegram(config.telegram, this.controller.signal);
    }
    if (config.feishu?.enabled && this.getStatus('feishu').configured) {
      try {
        await this.getFeishuToken();
        this.status.feishu = { ok: true, running: true, error: null };
      } catch (error) {
        this.status.feishu = { ok: false, error: error.message };
        console.error('[ExternalChat] Feishu authentication failed:', error.message);
      }
    }
  }

  async stop() {
    if (this.controller) this.controller.abort();
    if (this.pollTask) await this.pollTask;
    await Promise.allSettled(this.queues.values());
  }

  async telegramApi(config, method, body, signal) {
    try {
      const response = await this.http.post(`https://api.telegram.org/bot${config.botToken.trim()}/${method}`, body, {
        timeout: 40000, signal,
      });
      if (!response.data.ok) throw new Error(response.data.description || 'Telegram API rejected request');
      return response.data.result;
    } catch (error) {
      if (signal?.aborted) throw new Error('Telegram connection stopped');
      // Axios errors contain the bot token in the request URL.
      throw new Error(`Telegram ${method}: ${error.response?.data?.description || (error.response ? `HTTP ${error.response.status}` : 'request failed')}`);
    }
  }

  async pollTelegram(config, signal) {
    const offsetFile = path.join(this.dataDir, 'telegram_offset.json');
    let offset;
    try {
      offset = await fs.pathExists(offsetFile) ? await fs.readJson(offsetFile) : {};
      const account = createHash('sha256').update(config.botToken).digest('hex');
      if (offset.account !== account) offset = { account, next: 0 };
      const bot = await this.telegramApi(config, 'getMe', {}, signal);
      const webhook = await this.telegramApi(config, 'getWebhookInfo', {}, signal);
      if (webhook.url) throw new Error('Telegram webhook is active. Remove it before enabling long polling.');
      this.status.telegram = { ok: true, running: true, error: null };
      while (!signal.aborted) {
        try {
          const updates = await this.telegramApi(config, 'getUpdates', {
            offset: offset.next, timeout: 25, allowed_updates: ['message'],
          }, signal);
          this.status.telegram = { ok: true, running: true, error: null };
          for (const update of updates) {
            if (signal.aborted) break;
            const message = update.message;
            if (message?.text && !message.from?.is_bot && this.allowed(config, message.from?.id)) {
              const group = message.chat.type !== 'private';
              const mentioned = message.entities?.some(entity => entity.type === 'mention'
                && message.text.slice(entity.offset, entity.offset + entity.length).toLowerCase() === `@${bot.username}`.toLowerCase());
              const commandForBot = new RegExp(`^/\\w+@${bot.username}(?:\\s|$)`, 'i').test(message.text);
              if (!group || mentioned || commandForBot) {
                const text = message.text.replace(new RegExp(`@${bot.username}\\b`, 'gi'), '').trim();
                await this.dispatch({ platform: 'telegram', accountId: String(bot.id), peerId: `${message.chat.id}:${message.message_thread_id || 0}`,
                  senderId: String(message.from.id), senderName: message.from.first_name || String(message.from.id),
                  chatType: group ? 'group' : 'direct', text,
                  deliver: async reply => {
                    for (const chunk of splitText(reply, 4000)) {
                      await this.telegramApi(config, 'sendMessage', { chat_id: message.chat.id, text: chunk,
                        ...(message.message_thread_id ? { message_thread_id: message.message_thread_id } : {}) }, signal);
                    }
                  } }).catch(error => {
                    console.error('[ExternalChat] Telegram message failed:', error.message);
                    this.status.telegram = { ok: false, running: true, error: error.message };
                  });
              }
            }
            offset.next = update.update_id + 1;
            await fs.writeJson(offsetFile, offset);
          }
        } catch (error) {
          if (signal.aborted) break;
          this.status.telegram = { ok: false, running: true, error: error.message };
          console.error('[ExternalChat]', error.message);
          await new Promise(resolve => {
            const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
            const timer = setTimeout(finish, 5000);
            signal.addEventListener('abort', finish, { once: true });
          });
        }
      }
    } catch (error) {
      if (!signal.aborted) {
        this.status.telegram = { ok: false, running: false, error: error.message };
        console.error('[ExternalChat]', error.message);
        this.signature = '';
      }
    }
  }

  allowed(config, senderId) {
    const allowFrom = Array.isArray(config.allowFrom) ? config.allowFrom.map(String) : [];
    return allowFrom.length === 0 || allowFrom.includes(String(senderId));
  }

  dispatch(message) {
    const key = `${message.platform}:${message.accountId}:${message.peerId}`;
    const previous = this.queues.get(key) || Promise.resolve();
    const task = previous.catch(() => {}).then(() => this.onMessage(message));
    this.queues.set(key, task);
    task.finally(() => { if (this.queues.get(key) === task) this.queues.delete(key); }).catch(() => {});
    return task;
  }

  async getFeishuToken() {
    if (this.feishuToken && this.feishuToken.expires > Date.now()) return this.feishuToken.value;
    const config = this.config.feishu || {};
    let response;
    try {
      response = await this.http.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
        app_id: config.appId?.trim(), app_secret: config.appSecret?.trim(),
      }, { timeout: 15000 });
    } catch (error) {
      throw new Error(`Feishu authentication: ${error.response ? `HTTP ${error.response.status}` : 'request failed'}`);
    }
    if (response.data.code !== 0 || !response.data.tenant_access_token) throw new Error(`Feishu: ${response.data.msg || 'missing access token'}`);
    this.feishuToken = { value: response.data.tenant_access_token, expires: Date.now() + Math.max(0, response.data.expire - 60) * 1000 };
    return this.feishuToken.value;
  }

  async sendFeishu(messageId, text) {
    const token = await this.getFeishuToken();
    for (const chunk of splitText(text, 3000)) {
      let response;
      try {
        response = await this.http.post(`https://open.feishu.cn/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/reply`, {
          msg_type: 'text', content: JSON.stringify({ text: chunk }),
        }, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
      } catch (error) {
        throw new Error(`Feishu reply: ${error.response ? `HTTP ${error.response.status}` : 'request failed'}`);
      }
      if (response.data.code !== 0) throw new Error(`Feishu reply: ${response.data.msg}`);
    }
  }

  handleFeishu(body) {
    const config = this.config.feishu || {};
    if (!config.enabled || !this.getStatus('feishu').configured) return { status: 503, body: { error: 'Feishu is disabled or unconfigured' } };
    if (body?.encrypt) return { status: 400, body: { error: 'Encrypted events are not supported; disable Encrypt Key in Feishu event settings' } };
    if (!safeEqual(body?.header?.token || body?.token, config.verificationToken?.trim())) {
      return { status: 403, body: { error: 'Invalid verification token' } };
    }
    if (body.type === 'url_verification') return { status: 200, body: { challenge: body.challenge } };
    const event = body.event;
    if (body.header?.event_type !== 'im.message.receive_v1' || event?.message?.message_type !== 'text') return { status: 200, body: {} };
    const message = event.message;
    const senderId = event.sender?.sender_id?.open_id;
    if (body.header.app_id !== config.appId?.trim() || event.sender?.sender_type !== 'user'
      || !senderId || !this.allowed(config, senderId) || !message.message_id || !message.chat_id) return { status: 200, body: {} };
    if (message.chat_type === 'group' && !message.mentions?.some(mention => mention.id?.open_id === config.botOpenId)) return { status: 200, body: {} };
    let text;
    try { text = JSON.parse(message.content).text; } catch { return { status: 400, body: { error: 'Invalid text message content' } }; }
    if (typeof text !== 'string') return { status: 400, body: { error: 'Missing message text' } };
    for (const mention of message.mentions || []) text = text.split(mention.key).join('');
    text = text.trim();
    if (!text) return { status: 200, body: {} };
    const now = Date.now();
    for (const [id, time] of this.seen) if (now - time > 600000) this.seen.delete(id);
    if (this.seen.has(message.message_id)) return { status: 200, body: {} };
    if (this.seen.size >= 10000) return { status: 503, body: { error: 'Message queue is full' } };
    this.seen.set(message.message_id, now);
    this.dispatch({ platform: 'feishu', accountId: config.appId.trim(), peerId: message.chat_id,
      senderId, senderName: senderId, chatType: message.chat_type === 'p2p' ? 'direct' : 'group', text,
      deliver: reply => this.sendFeishu(message.message_id, reply),
    }).catch(error => {
      this.status.feishu = { ok: false, error: error.message };
      console.error('[ExternalChat] Feishu message failed:', error.message);
    });
    return { status: 200, body: {} };
  }
}

module.exports = { ExternalChatBridge, splitText };
