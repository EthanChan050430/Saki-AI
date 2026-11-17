const cleanText = value => String(value || '').replace(/\[expression\s*:[^\]]*\]/gi, '')

// Keep raw conversation text available for retrieval, independently of the small
// prompt window selected by the backend. No camera pixels are stored here.
export function callContextHistory(messages = []) {
  let remaining = 1000000
  const result = []
  for (let index = messages.length - 1; index >= 0 && result.length < 500 && remaining > 0; index--) {
    const message = messages[index]
    if (!['user', 'assistant'].includes(message?.role)) continue
    const body = message.content || message.parts?.filter(part => part.type === 'text').map(part => part.content).join('') || ''
    const tools = (message.parts || []).filter(part => part.type === 'action').map(part =>
      `${part.data?.type || part.data?.tool || 'tool'}: ${String(part.observation || '').slice(0, 12000)}`).join('\n')
    const content = cleanText(body).slice(0, Math.min(100000, remaining))
    remaining -= content.length
    const summary = tools.slice(0, Math.min(24000, remaining))
    remaining -= summary.length
    if (content || summary) result.unshift({ id: String(message.id || `chat-${index}`), role: message.role, content, ...(summary ? { summary } : {}) })
  }
  return result
}

export function boundedComponentHistory(events = []) {
  let remaining = 650000
  const kept = [], seen = new Set()
  for (let index = events.length - 1; index >= 0 && kept.length < 100; index--) {
    const event = events[index]
    if (!event?.id || seen.has(event.id)) continue
    seen.add(event.id)
    const size = JSON.stringify(event).length
    if (size > remaining) continue
    remaining -= size
    kept.unshift(event)
  }
  return kept
}

export function restoredComponentHistory(messages = []) {
  return boundedComponentHistory(messages.flatMap(message => Array.isArray(message?.videoCallContext?.componentHistory)
    ? message.videoCallContext.componentHistory : []))
}

export function componentChanges(before, after, { id, at = Date.now(), source = 'agent' }) {
  const changes = []
  for (const side of ['left', 'right']) {
    if (before[side] === after[side]) continue
    if (before[side]) changes.push({ id: `${id}-${side}-close`, kind: 'close', side, at, source,
      reason: after[side] ? 'replaced' : 'closed', component: before[side] })
    if (after[side]) changes.push({ id: `${id}-${side}-show`, kind: 'show', side, at, source, component: after[side] })
  }
  return changes
}

export function applyCallActivity(parts, event) {
  const next = parts.map(part => ({ ...part, ...(part.data ? { data: { ...part.data } } : {}) }))
  if (event.action) {
    const incoming = { ...event.action }
    const kind = incoming.type || incoming.tool || incoming.action
    if (!incoming.type) delete incoming.type
    // The ordinary Agent UI reads data.type; tool-only updates (status) must not
    // rename an action that is already rendering.
    if (kind) incoming.type = kind
    if (incoming.args != null && !Array.isArray(incoming.args)) {
      incoming.args = [typeof incoming.args === 'string' ? incoming.args : JSON.stringify(incoming.args)]
    }
    const id = incoming.id || event.actionId
    if (id) incoming.id = id
    const existing = id ? next.findIndex(part => part.type === 'action' && part.data?.id === id) : -1
    if (existing >= 0) next[existing].data = { ...next[existing].data, ...incoming }
    else {
      if (!incoming.type) incoming.type = 'tool'
      next.push({ type: 'action', data: incoming })
    }
  }
  if (Object.hasOwn(event, 'observation') || event.fileMetadata) {
    const id = event.actionId || event.action?.id
    const candidates = next.map((part, index) => ({ part, index })).filter(({ part }) => part.type === 'action')
    const target = id ? candidates.find(({ part }) => part.data?.id === id) : candidates.at(-1)
    if (target) {
      if (Object.hasOwn(event, 'observation')) target.part.observation = typeof event.observation === 'string' ? event.observation : JSON.stringify(event.observation)
      if (event.fileMetadata) target.part.fileMetadata = event.fileMetadata
      if (!['error', 'cancelled'].includes(target.part.data.status)) target.part.data.status = 'completed'
    }
  }
  return next
}

export function appendCallText(parts, text) {
  const next = [...parts]
  if (next.at(-1)?.type === 'text') next[next.length - 1] = { ...next.at(-1), content: next.at(-1).content + text }
  else next.push({ type: 'text', content: text })
  return next
}

export function settleCallActivities(parts, status) {
  return parts.map(part => {
    if (part.type !== 'action' || part.observation != null || ['completed', 'error', 'cancelled'].includes(part.data?.status)) return part
    return { ...part, data: { ...part.data, status: status === 'error' ? 'error' : 'cancelled' },
      observation: status === 'error' ? 'Error: 通话回复中断，工具未返回完成结果。' : 'Cancelled: 通话已中断，工具未返回完成结果。' }
  })
}
