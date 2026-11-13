export const QUEUE_STORAGE_KEY = 'saki_chat_queues_v1';
const copy = value => JSON.parse(JSON.stringify(value));
export const emptyQueue = () => ({ items: [], paused: false, note: '' });
const normalizeQueue = queue => queue.items.length ? queue : emptyQueue();

export function restoreQueues(raw) {
  try {
    const parsed = JSON.parse(raw || '{}');
    return Object.fromEntries(Object.entries(parsed).filter(([, q]) => Array.isArray(q?.items)).map(([id, q]) => [id, {
      items: q.items.filter(item => item?.id && typeof item.text === 'string').map(item => ({ ...item, busy: false })),
      paused: true, note: '刷新恢复的队列已暂停，请确认后继续。',
    }]));
  } catch { return {}; }
}

export function createChatQueueStore(initial = {}, publish = () => {}) {
  let queues = initial;
  const get = chatId => queues[chatId] || emptyQueue();
  const update = (chatId, transform) => {
    const nextQueue = normalizeQueue(transform(get(chatId)));
    queues = { ...queues, [chatId]: nextQueue };
    publish(queues);
    return get(chatId);
  };
  return {
    get,
    enqueue(chatId, payload) {
      const item = { ...copy(payload), id: globalThis.crypto.randomUUID(), busy: false };
      update(chatId, q => ({ ...q, items: [...q.items, item] }));
      return item;
    },
    pause: (id, note = '队列已暂停，请确认后继续。') => update(id, q => ({ ...q, paused: true, note })),
    resume: id => update(id, q => ({ ...q, paused: false, note: '' })),
    prepend: (id, item) => update(id, q => ({ ...q, items: [{ ...item, busy: false }, ...q.items] })),
    claim(chatId, itemId) {
      const item = get(chatId).items.find(item => item.id === itemId);
      if (!item || item.busy) return null;
      update(chatId, q => ({ ...q, items: q.items.map(i => i.id === itemId ? { ...i, busy: true, error: '' } : i) }));
      return copy(item);
    },
    take(chatId) {
      const q = get(chatId);
      if (q.paused || !q.items.length || q.items[0].busy) return null;
      return this.claim(chatId, q.items[0].id);
    },
    remove(chatId, itemId, claimed = false) {
      const item = get(chatId).items.find(i => i.id === itemId);
      if (!item || (item.busy && !claimed)) return null;
      update(chatId, q => ({ ...q, items: q.items.filter(i => i.id !== itemId) }));
      return item;
    },
    release: (id, itemId, error) => update(id, q => ({ ...q, items: q.items.map(i => i.id === itemId ? { ...i, busy: false, error } : i) })),
  };
}

export function mergeSteeringEvent(messages, event) {
  if (!event?.steering?.id || !['accepted', 'applied'].includes(event.status)) return messages;
  return messages.map(message => {
    if (message.role !== 'assistant' || String(message.id) !== String(event.assistantMsgId)) return message;
    const records = [...(message.steeringMessages || [])];
    const index = records.findIndex(item => item.id === event.steering.id);
    const previous = records[index];
    const record = { ...previous, ...event.steering, status: previous?.status === 'applied' ? 'applied' : event.status };
    if (index < 0) records.push(record); else records[index] = record;
    return { ...message, steeringMessages: records };
  });
}

export function canAdvanceQueue({ outcome, done, error, approval, stopped }) {
  return !error && !approval && !stopped && (outcome ? outcome === 'completed' : done);
}

export function isComposerComposing(event, composing = false) {
  return composing || event.isComposing || event.nativeEvent?.isComposing || event.keyCode === 229;
}