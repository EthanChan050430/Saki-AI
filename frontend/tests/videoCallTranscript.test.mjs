import assert from 'node:assert/strict'
import test from 'node:test'
import { addCallRecords, mergeCallRecords, toChatRecord } from '../src/utils/videoCallTranscript.js'

const userTurn = (order, content = '我问一句') => ({ role: 'user', id: `call-a-${order}-u`, content })
const assistantTurn = (order, content = '我答一句') => ({ role: 'assistant', id: `call-a-${order}-a`, content })

test('call turns become ordinary chat messages', () => {
  assert.deepEqual(toChatRecord(assistantTurn(0, '你好呀')), {
    role: 'assistant', id: 'call-a-0-a', status: 'done', parts: [{ type: 'text', content: '你好呀' }],
  })
  assert.deepEqual(toChatRecord(userTurn(0, '在吗')), { role: 'user', id: 'call-a-0-u', content: '在吗' })
})

test('attached files and generated files survive the conversion', () => {
  const files = [{ name: '截图.jpg', path: '/uploads/a.jpg' }]
  assert.deepEqual(toChatRecord({ ...userTurn(1), attachedFiles: files }).attachedFiles, files)
  assert.deepEqual(toChatRecord({ ...userTurn(1), attachedFiles: files }).files, ['截图.jpg'])
  const generated = [{ filePath: '/files/r.docx', name: 'r.docx' }]
  assert.deepEqual(toChatRecord({ ...assistantTurn(1), generatedFiles: generated }).generatedFiles, generated)
})

test('turns without content or files are dropped instead of leaving an empty bubble', () => {
  assert.equal(toChatRecord(assistantTurn(2, '   ')), null)
  assert.equal(toChatRecord({ role: 'system', id: 'x', content: 'y' }), null)
  assert.equal(toChatRecord({ role: 'user', content: '没有 id' }), null)
  assert.ok(toChatRecord({ ...assistantTurn(2, ''), generatedFiles: [{ filePath: '/files/a.pdf' }] }))
})

test('a turn arriving twice is only appended once', () => {
  const first = addCallRecords([], [userTurn(0), assistantTurn(0)])
  assert.equal(first.length, 2)
  const replayed = addCallRecords(first, [userTurn(0), assistantTurn(0), userTurn(1)])
  assert.equal(replayed.length, 3)
  assert.equal(replayed.at(-1).id, 'call-a-1-u')
})

test('call messages continue the chat instead of replacing it', () => {
  const base = [
    { role: 'user', id: 1, content: '之前问过的问题' },
    { role: 'assistant', id: 2, parts: [{ type: 'text', content: '之前答过的内容' }] },
  ]
  const merged = mergeCallRecords({ base, records: [userTurn(0), assistantTurn(0)] })
  assert.equal(merged.length, 4)
  assert.deepEqual(merged.slice(0, 2), base)
  assert.equal(merged[2].content, '我问一句')
  assert.equal(merged[3].parts[0].content, '我答一句')
})

test('replaying the transcript on hang-up does not duplicate messages', () => {
  const base = [{ role: 'user', id: 1, content: '旧消息' }]
  const records = [userTurn(0), assistantTurn(0), userTurn(1), assistantTurn(1)]
  const once = mergeCallRecords({ base, records })
  const twice = mergeCallRecords({ base, records: [...records, ...records] })
  assert.deepEqual(twice, once)
  assert.equal(twice.length, 5)
})

test('ids that collide with existing chat messages are not duplicated', () => {
  const base = [{ role: 'user', id: 'call-a-0-u', content: '已经在会话里了' }]
  const merged = mergeCallRecords({ base, records: [userTurn(0), assistantTurn(0)] })
  assert.equal(merged.length, 2)
  assert.equal(merged[0].content, '已经在会话里了')
})

test('an interrupted call still keeps the turns that already happened', () => {
  // The user spoke, the reply was cut off by hang-up: only the user turn exists.
  const merged = mergeCallRecords({ base: [{ role: 'user', id: 1, content: '你好' }], records: [userTurn(0, '我还没说完')] })
  assert.equal(merged.length, 2)
  assert.equal(merged.at(-1).role, 'user')
})

test('empty or malformed input never throws', () => {
  assert.deepEqual(mergeCallRecords(), [])
  assert.deepEqual(mergeCallRecords({ base: null, records: null }), [])
  assert.deepEqual(addCallRecords(null, null), [])
})
