import assert from 'node:assert/strict'
import test from 'node:test'
import { startLocalCallMic } from '../src/utils/videoCallMic.js'

function harness(t, fetcher) {
  const saved = Object.fromEntries(['AudioContext', 'AudioWorkletNode', 'fetch'].map(key => [key, globalThis[key]]))
  const nodes = [], audios = []
  globalThis.AudioContext = class {
    constructor() { this.state = 'running'; this.sampleRate = 16000; this.audioWorklet = { addModule: async () => {} }; audios.push(this) }
    createMediaStreamSource() { return { connect() {} } }
    async resume() {}
    async close() { this.state = 'closed' }
  }
  globalThis.AudioWorkletNode = class {
    constructor() { this.port = { close() { this.closed = true } }; nodes.push(this) }
    connect() {}
  }
  globalThis.fetch = fetcher
  t.after(() => Object.assign(globalThis, saved))
  const controller = new AbortController(), texts = [], statuses = [], errors = [], speech = []
  const options = { stream: { getAudioTracks: () => [{ getSettings: () => ({ echoCancellation: true }) }] },
    backendUrl: '', base: '/', lang: 'zh-CN', signal: controller.signal, speakerLevel: () => 0,
    onSpeech: () => speech.push(performance.now()), onText: text => texts.push(text),
    onStatus: state => statuses.push(state), onError: error => errors.push(error) }
  return { controller, options, nodes, audios, texts, statuses, errors, speech }
}
const tick = () => new Promise(resolve => setImmediate(resolve))
const loud = (count, amplitude = .1) => Array.from({ length: count }, () => ({ data: new Float32Array(1024).fill(amplitude) }))

// Exercise the capture protocol with actual PCM samples, including startup and cancellation.
test('local microphone waits for model readiness, transcribes PCM and cleans up', async t => {
  let ready, posted
  const h = harness(t, async (url, options) => {
    if (url.endsWith('/ready')) return new Promise(resolve => { ready = resolve })
    posted = options.body
    return { ok: true, json: async () => ({ text: '你好，Saki' }) }
  })
  const started = startLocalCallMic(h.options)
  await tick()
  assert.deepEqual(h.statuses, ['starting'])
  assert.equal(h.nodes.length, 0)
  ready({ ok: true })
  await started
  const port = h.nodes[0].port
  for (let i = 0; i < 8; i++) port.onmessage({ data: new Float32Array(1024).fill(.1) })
  for (let i = 0; i < 8; i++) port.onmessage({ data: new Float32Array(1024) })
  await tick()
  assert.ok(posted instanceof Int16Array)
  assert.equal(posted[0], 3277)
  assert.deepEqual(h.texts, ['你好，Saki'])
  assert.deepEqual(h.statuses, ['starting', 'listening', 'transcribing', 'listening'])
  h.controller.abort()
  assert.equal(h.audios[0].state, 'closed')
  assert.equal(port.closed, true)
})

test('hanging up during local model startup never opens a recorder', async t => {
  let ready
  const h = harness(t, async () => new Promise(resolve => { ready = resolve }))
  const started = startLocalCallMic(h.options)
  await tick()
  h.controller.abort()
  ready({ ok: true })
  await started
  assert.equal(h.nodes.length, 0)
  assert.equal(h.audios[0].state, 'closed')
  assert.deepEqual(h.texts, [])
})

test('failed transcription reports failure for browser fallback', async t => {
  const h = harness(t, async url => ({ ok: url.endsWith('/ready') }))
  await startLocalCallMic(h.options)
  const port = h.nodes[0].port
  for (let i = 0; i < 4; i++) port.onmessage({ data: new Float32Array(1024).fill(.1) })
  for (let i = 0; i < 8; i++) port.onmessage({ data: new Float32Array(1024) })
  await tick()
  assert.equal(h.errors.length, 1)
  assert.deepEqual(h.texts, [])
  h.controller.abort()
})

// Endpointing decides how quickly a finished sentence reaches the model, so the
// thresholds themselves are worth pinning down.
function recorder(t) {
  const uploaded = []
  const h = harness(t, async (url, options) => {
    if (url.endsWith('/ready')) return { ok: true }
    uploaded.push(options.body.length)
    return { ok: true, json: async () => ({ text: '' }) }
  })
  return { h, uploaded }
}

test('two voiced frames start an utterance instead of three', async t => {
  const { h } = recorder(t)
  await startLocalCallMic(h.options)
  const port = h.nodes[0].port
  for (const frame of loud(1)) port.onmessage(frame)
  assert.deepEqual(h.speech, [], 'a single frame is noise')
  for (const frame of loud(1)) port.onmessage(frame)
  assert.equal(h.speech.length, 1)
  h.controller.abort()
})

test('trailing silence is trimmed off the uploaded utterance', async t => {
  const { h, uploaded } = recorder(t)
  await startLocalCallMic(h.options)
  const port = h.nodes[0].port
  for (const frame of loud(8)) port.onmessage(frame)
  for (let i = 0; i < 6; i++) port.onmessage({ data: new Float32Array(1024) })
  await tick()
  // 8 voiced + 6 silent frames are captured, but only one silent frame is sent.
  assert.deepEqual(uploaded, [9 * 1024])
  h.controller.abort()
})

test('a soft frame keeps the utterance open rather than cutting the sentence', async t => {
  const { h, uploaded } = recorder(t)
  await startLocalCallMic(h.options)
  const port = h.nodes[0].port
  for (const frame of loud(8)) port.onmessage(frame)
  for (const frame of loud(1, .013)) port.onmessage(frame)
  for (let i = 0; i < 5; i++) port.onmessage({ data: new Float32Array(1024) })
  await tick()
  assert.deepEqual(uploaded, [], 'five silent frames are not enough after a tail consonant')
  port.onmessage({ data: new Float32Array(1024) })
  await tick()
  assert.deepEqual(uploaded, [10 * 1024])
  h.controller.abort()
})

test('speaker bleed while Saki is talking does not trigger immediate barge-in', async t => {
  const { h, uploaded } = recorder(t)
  h.options.speakerLevel = () => 0.25
  await startLocalCallMic(h.options)
  const port = h.nodes[0].port
  for (const frame of loud(4, 0.04)) port.onmessage(frame)
  for (let i = 0; i < 6; i++) port.onmessage({ data: new Float32Array(1024) })
  await tick()
  assert.deepEqual(h.speech, [])
  assert.equal(uploaded.length, 0, 'moderate speaker bleed is rejected at the VAD gate')
  for (const frame of loud(4, 0.08)) port.onmessage(frame)
  for (let i = 0; i < 6; i++) port.onmessage({ data: new Float32Array(1024) })
  await tick()
  assert.deepEqual(h.speech, [], 'louder audio while Saki speaks still waits for echo-filtered transcription')
  assert.equal(uploaded.length, 1, 'captured audio goes to transcription for real barge-in')
  h.controller.abort()
})
