import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { callContextHistory, boundedComponentHistory, restoredComponentHistory, componentChanges, applyCallActivity, appendCallText, settleCallActivities } from '../src/utils/videoCallContext.js'
import { addCallRecords, toChatRecord } from '../src/utils/videoCallTranscript.js'
import { readSSEStream } from '../src/utils/sseStream.js'

test('history keeps ids, tool summaries and a hard size ceiling', () => {
  const messages = [
    { id: 'm1', role: 'user', content: '第一句' },
    { id: 'm2', role: 'assistant', parts: [{ type: 'action', data: { type: 'search' }, observation: '结果' }, { type: 'text', content: '答案' }] },
    { id: 'm3', role: 'tool', content: 'ignored' },
    { id: 'm4', role: 'user', content: 'x'.repeat(200000) },
  ]
  const history = callContextHistory(messages)
  assert.deepEqual(history.map(item => item.id), ['m1', 'm2', 'm4'])
  assert.match(history[1].summary, /search: 结果/)
  assert.equal(history[1].content, '答案')
  assert.equal(history.at(-1).content.length, 100000)
})

test('component events are bounded and restored once across messages', () => {
  const events = Array.from({ length: 130 }, (_, index) => ({ id: `e${index}`, kind: 'show', side: 'left', component: { title: `T${index}` } }))
  assert.equal(boundedComponentHistory(events).length, 100)
  const messages = [
    { videoCallContext: { componentHistory: events.slice(0, 5) } },
    { videoCallContext: { componentHistory: events.slice(0, 5) } },
    { videoCallContext: { componentHistory: [{ id: 'e5', kind: 'close', side: 'left' }] } },
  ]
  assert.deepEqual(restoredComponentHistory(messages).map(event => event.id), ['e0', 'e1', 'e2', 'e3', 'e4', 'e5'])
})

test('a replaced panel produces a close event before the new show', () => {
  const before = { left: { id: 'old' }, right: null }
  const after = { left: { id: 'new' }, right: null }
  const changes = componentChanges(before, after, { id: 'p1', at: 5, source: 'agent' })
  assert.deepEqual(changes.map(event => event.kind), ['close', 'show'])
  assert.equal(changes[0].component.id, 'old')
  assert.equal(changes[1].component.id, 'new')
})

test('activity events merge into the same action until its observation arrives', () => {
  let parts = applyCallActivity([], { action: { id: 'a1', type: 'search', args: ['天气'] } })
  parts = applyCallActivity(parts, { action: { id: 'a1', status: 'completed' }, actionId: 'a1', observation: '晴天' })
  assert.equal(parts.length, 1)
  assert.equal(parts[0].data.type, 'search')
  assert.equal(parts[0].observation, '晴天')
  assert.equal(parts[0].data.status, 'completed')
  parts = applyCallActivity(parts, { action: { id: 'a2', tool: 'viewCallCamera' } })
  assert.equal(parts[1].data.type, 'viewCallCamera', 'the ordinary UI reads data.type')
  parts = appendCallText(parts, '看到')
  parts = appendCallText(parts, '你了')
  assert.equal(parts.at(-1).content, '看到你了')
})

test('interrupting a turn settles unfinished tools without inventing success', () => {
  let parts = applyCallActivity([], { action: { id: 'a1', type: 'search', args: ['x'] } })
  parts = settleCallActivities(parts, 'cancelled')
  assert.equal(parts[0].data.status, 'cancelled')
  assert.match(parts[0].observation, /Cancelled/)
  const settled = applyCallActivity([], { action: { id: 'a2', type: 'search' } })
  assert.deepEqual(settleCallActivities(settled, 'error')[0].data.status, 'error')
})

test('the chat record keeps tool parts, status and component context', () => {
  const record = toChatRecord({
    role: 'assistant', id: 'a1', content: '', status: 'streaming', videoCall: true, revision: 3,
    parts: [{ type: 'action', data: { id: 't1', type: 'search' }, observation: '结果' }],
    videoCallContext: { componentHistory: [{ id: 'e1', kind: 'show', side: 'left', component: { title: '旧表' } }] },
  })
  assert.equal(record.status, 'streaming')
  assert.equal(record.parts[0].data.type, 'search')
  assert.equal(record.revision, 3)
  assert.equal(record.videoCallContext.componentHistory[0].id, 'e1')
})

test('newer revisions replace a streaming turn while stale replays are ignored', () => {
  const first = { id: 'a1', role: 'assistant', content: '你', revision: 1, videoCall: true, parts: [{ type: 'text', content: '你' }] }
  const second = { id: 'a1', role: 'assistant', content: '你好', revision: 2, videoCall: true, parts: [{ type: 'text', content: '你好' }] }
  let records = addCallRecords([], [first])
  records = addCallRecords(records, [second])
  assert.equal(records.length, 1)
  assert.equal(records[0].content, '你好')
  records = addCallRecords(records, [first])
  assert.equal(records[0].content, '你好', 'an older hang-up snapshot must not overwrite newer content')
  assert.equal(addCallRecords(records, [first]), records, 'unchanged input keeps identity so the chat is not re-rendered')
})

test('readSSEStream cancels the reader on early stop or [DONE] but not when naturally done', async () => {
  const encoder = new TextEncoder()
  const makeResponse = chunks => {
    const ops = []
    let index = 0
    const reader = {
      async read() {
        if (index >= chunks.length) return { done: true, value: undefined }
        return { done: false, value: encoder.encode(chunks[index++]) }
      },
      async cancel() { ops.push('cancel') },
      releaseLock() { ops.push('releaseLock') },
    }
    return { response: { body: { getReader: () => reader } }, ops }
  }

  const early = makeResponse(['data: {"error":"boom"}\n\n', 'data: {"text":"ignored"}\n\n'])
  await readSSEStream(early.response, async event => Boolean(event.error))
  assert.deepEqual(early.ops, ['cancel', 'releaseLock'])

  const doneMarker = makeResponse(['data: [DONE]\n\n', 'data: {"text":"trailing"}\n\n'])
  await readSSEStream(doneMarker.response, async () => false)
  assert.deepEqual(doneMarker.ops, ['cancel', 'releaseLock'])

  const natural = makeResponse(['data: {"text":"hi"}\n\n'])
  const events = []
  await readSSEStream(natural.response, async event => { events.push(event); return false })
  assert.equal(events.length, 1)
  assert.deepEqual(natural.ops, ['releaseLock'])
})

test('VideoCall bounds runtime.componentHistory, syncs quality compact mode, and VideoCallComponent checks image URLs', async () => {
  const callSource = await readFile(new URL('../src/components/VideoCall.jsx', import.meta.url), 'utf8')
  const compSource = await readFile(new URL('../src/components/VideoCallComponent.jsx', import.meta.url), 'utf8')
  assert.match(callSource, /quality\.setCompact\(compact\)/)
  assert.match(callSource, /state\.componentHistory\s*=\s*boundedComponentHistory\(\[\.\.\.state\.componentHistory,\s*\.\.\.changes\]\)/)
  assert.match(compSource, /callImageUrl\(component\.url\)/)
  assert.match(compSource, /urlTransform=\{callContentUrl\}/)
})
