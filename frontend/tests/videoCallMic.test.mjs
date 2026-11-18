import assert from 'node:assert/strict'
import test from 'node:test'
import { startCallMic, startLocalCallMic } from '../src/utils/videoCallMic.js'

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
  const track = { readyState: 'live', getSettings: () => ({ echoCancellation: true }) }
  const options = { stream: { getAudioTracks: () => [track] },
    backendUrl: '', base: '/', lang: 'zh-CN', signal: controller.signal, speakerLevel: () => 0,
    onSpeech: () => speech.push(performance.now()), onText: text => texts.push(text),
    onStatus: state => statuses.push(state), onError: error => errors.push(error) }
  return { controller, options, nodes, audios, texts, statuses, errors, speech, track }
}
const tick = () => new Promise(resolve => setImmediate(resolve))
const readyResponse = { ok: true, json: async () => ({ state: 'ready' }) }
const loud = (count, amplitude = .1) => Array.from({ length: count }, () => ({ data: new Float32Array(1024).fill(amplitude) }))

function browserRecognizer(t) {
  const saved = globalThis.SpeechRecognition
  const instances = []
  globalThis.SpeechRecognition = class {
    constructor() { this.starts = []; instances.push(this) }
    start(...args) { this.starts.push(args) }
    stop() { this.stops = (this.stops || 0) + 1 }
    abort() { this.aborted = true }
  }
  t.after(() => { globalThis.SpeechRecognition = saved })
  return instances
}

const result = (transcript, isFinal = false) => Object.assign([{ transcript }], { isFinal })

test('browser recognition uses the same live microphone track as the meter and can retry the default input', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const instances = browserRecognizer(t)
  const h = harness(t, async () => {})
  h.track.kind = 'audio'
  startCallMic({ ...h.options, mode: 'browser', onDraft: () => {} })
  const recognition = instances[0]
  assert.deepEqual(recognition.starts, [[h.track]])
  recognition.onerror({ error: 'audio-capture' })
  recognition.onend()
  t.mock.timers.tick(180)
  assert.deepEqual(recognition.starts, [[h.track], []])
  recognition.onresult({ results: [result('你好 Saki', true)] })
  t.mock.timers.tick(250)
  assert.deepEqual(h.texts, ['你好 Saki'])
  assert.deepEqual(h.errors, [])
  h.controller.abort()
})

test('a browser that stops at an interim result sends the finished utterance once', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const instances = browserRecognizer(t)
  const h = harness(t, async () => {})
  startCallMic({ ...h.options, onDraft: () => {} })
  const recognition = instances[0]
  recognition.onspeechstart()
  recognition.onresult({ results: [result('刚才说的已经识别了')] })
  recognition.onspeechend()
  t.mock.timers.tick(450)
  assert.equal(recognition.stops, 1)
  assert.deepEqual(h.texts, [])
  recognition.onend()
  assert.deepEqual(h.texts, ['刚才说的已经识别了'])
  t.mock.timers.tick(1200)
  assert.equal(h.texts.length, 1)
  h.controller.abort()
})

test('a stuck interim result cannot keep a confirmed result from being sent', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const instances = browserRecognizer(t)
  const h = harness(t, async () => {})
  startCallMic({ ...h.options, onDraft: () => {} })
  const recognition = instances[0]
  const final = result('第一句已识别', true)
  recognition.onresult({ results: [final, result('第二')] })
  t.mock.timers.tick(600)
  recognition.onresult({ results: [final, result('第二句')] })
  t.mock.timers.tick(500)
  assert.deepEqual(h.texts, ['第一句已识别'])
  recognition.onresult({ results: [final, result('第二句也识别了', true)] })
  recognition.onend()
  assert.deepEqual(h.texts, ['第一句已识别', '第二句也识别了'])
  h.controller.abort()
})

test('a stalled recognizer sends the ended utterance once and rejects callbacks from its retired instance', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const instances = browserRecognizer(t)
  const h = harness(t, async () => {})
  startCallMic({ ...h.options, onDraft: () => {} })
  const first = instances[0]
  const lateResult = first.onresult
  const lateEnd = first.onend
  first.onspeechstart()
  first.onresult({ results: [result('你能听到我吗')] })
  first.onspeechend()
  t.mock.timers.tick(450)
  assert.equal(first.stops, 1)
  t.mock.timers.tick(1499)
  assert.deepEqual(h.texts, [])
  t.mock.timers.tick(1)
  assert.deepEqual(h.texts, ['你能听到我吗'])
  assert.equal(first.aborted, true)
  t.mock.timers.tick(180)
  assert.equal(instances.length, 2)

  lateResult({ results: [result('你能听到我吗', true)] })
  lateEnd()
  instances[1].onresult({ results: [result('这是下一句话', true)] })
  t.mock.timers.tick(250)
  assert.deepEqual(h.texts, ['你能听到我吗', '这是下一句话'])
  assert.equal(instances.length, 2)
  h.controller.abort()
})

test('a final result arriving before the deadline wins and muting prevents an overdue restart', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const instances = browserRecognizer(t)
  const h = harness(t, async () => {})
  startCallMic({ ...h.options, onDraft: () => {} })
  const recognition = instances[0]
  recognition.onspeechstart()
  recognition.onresult({ results: [result('等我说完')] })
  recognition.onspeechend()
  t.mock.timers.tick(450)
  recognition.onresult({ results: [result('请等我说完。', true)] })
  t.mock.timers.tick(250)
  assert.deepEqual(h.texts, ['请等我说完。'])
  h.controller.abort()
  t.mock.timers.tick(2000)
  assert.deepEqual(h.texts, ['请等我说完。'])
  assert.equal(instances.length, 1)
})

test('browser recognition streams drafts and sends each final once without calling the server', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const instances = browserRecognizer(t)
  let requests = 0
  const h = harness(t, async () => { requests++ })
  const drafts = []
  startCallMic({ ...h.options, echoReference: () => 'Saki 的声音', onDraft: value => drafts.push(value) })
  const recognition = instances[0]
  assert.equal(recognition.lang, 'zh-CN')
  assert.equal(recognition.continuous, true)
  assert.equal(recognition.interimResults, true)
  assert.deepEqual(recognition.starts, [[]])

  const echo = result('Saki 的声音', true)
  recognition.onresult({ results: [echo, result('你好')] })
  assert.deepEqual(drafts, ['你好'])
  assert.deepEqual(h.texts, [])
  const final = result('你好，Saki', true)
  recognition.onresult({ results: [echo, final] })
  t.mock.timers.tick(250)
  recognition.onresult({ results: [echo, final] })
  t.mock.timers.tick(250)
  assert.deepEqual(h.texts, ['你好，Saki'])

  recognition.onerror({ error: 'no-speech' })
  recognition.onend()
  t.mock.timers.tick(180)
  assert.deepEqual(recognition.starts, [[], []])
  recognition.onresult({ results: [result('挂断时说的话', true)] })
  h.controller.abort()
  t.mock.timers.tick(250)
  assert.equal(recognition.aborted, true)
  assert.deepEqual(h.texts, ['你好，Saki'])
  assert.deepEqual(h.errors, [])
  assert.equal(requests, 0)
})

test('browser recognition rejects a short echo even when the final arrives after playback', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const instances = browserRecognizer(t)
  const h = harness(t, async () => {})
  let reference = '好的，我们继续聊刚才的问题。'
  startCallMic({ ...h.options, mode: 'browser', echoReference: () => reference, onDraft: () => {} })
  const recognition = instances[0]
  recognition.onspeechstart()
  reference = ''
  const echo = result('好的', true)
  recognition.onresult({ results: [echo] })
  t.mock.timers.tick(250)
  assert.deepEqual(h.speech, [])
  assert.deepEqual(h.texts, [])

  recognition.onspeechstart()
  recognition.onresult({ results: [echo, result('好的', true)] })
  t.mock.timers.tick(250)
  assert.equal(h.speech.length, 1)
  assert.deepEqual(h.texts, ['好的'])
  h.controller.abort()
})

test('browser barge-in accepts quiet new speech and uses microphone evidence for ambiguous text', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const instances = browserRecognizer(t)
  const h = harness(t, async () => {})
  let nearEndSpeech = false
  startCallMic({
    ...h.options, mode: 'browser', echoReference: () => 'The weather should clear up tomorrow.',
    hasNearEndSpeech: () => nearEndSpeech, onDraft: () => {},
  })
  const recognition = instances[0]
  const garbledEcho = result('The wether should clear up tomorrow', true)
  recognition.onspeechstart()
  recognition.onresult({ results: [garbledEcho] })
  t.mock.timers.tick(250)
  assert.deepEqual(h.speech, [])
  assert.deepEqual(h.texts, [])

  recognition.onspeechstart()
  const quietSpeech = result('Wait, can I ask something?', true)
  recognition.onresult({ results: [garbledEcho, quietSpeech] })
  t.mock.timers.tick(250)
  assert.equal(h.speech.length, 1)
  assert.deepEqual(h.texts, ['Wait, can I ask something?'])

  recognition.onspeechstart()
  nearEndSpeech = true
  recognition.onspeechend()
  nearEndSpeech = false
  const relatedQuestion = result('Will the weather clear up tomorrow morning?', true)
  recognition.onresult({ results: [garbledEcho, quietSpeech, relatedQuestion] })
  t.mock.timers.tick(250)
  assert.equal(h.speech.length, 2)
  assert.deepEqual(h.texts, ['Wait, can I ask something?', 'Will the weather clear up tomorrow morning?'])
  h.controller.abort()
})

test('browser recognition retries network errors before reporting failure without calling the server', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const instances = browserRecognizer(t)
  let requests = 0
  const h = harness(t, async () => { requests++ })
  startCallMic({ ...h.options, mode: 'browser', onDraft: () => {} })
  const recognition = instances[0]
  for (const delay of [400, 800]) {
    const starts = recognition.starts.length
    recognition.onerror({ error: 'network' })
    recognition.onend()
    t.mock.timers.tick(delay - 1)
    assert.equal(recognition.starts.length, starts)
    t.mock.timers.tick(1)
    assert.equal(recognition.starts.length, starts + 1)
    assert.deepEqual(h.errors, [])
  }
  recognition.onerror({ error: 'network' })
  assert.deepEqual(h.errors, ['network'])
  assert.equal(recognition.aborted, true)
  assert.equal(requests, 0)
})

test('a successful result restores the browser retry budget and muting cancels the next retry', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const instances = browserRecognizer(t)
  const h = harness(t, async () => {})
  startCallMic({ ...h.options, mode: 'browser', onDraft: () => {} })
  const recognition = instances[0]
  recognition.onerror({ error: 'network' })
  recognition.onend()
  t.mock.timers.tick(400)
  recognition.onresult({ results: [result('Hello', true)] })
  t.mock.timers.tick(250)
  assert.deepEqual(h.texts, ['Hello'])

  recognition.onerror({ error: 'network' })
  recognition.onend()
  t.mock.timers.tick(400)
  assert.equal(recognition.starts.length, 3)

  recognition.onerror({ error: 'network' })
  recognition.onend()
  h.controller.abort()
  t.mock.timers.tick(800)
  assert.equal(recognition.starts.length, 3)
  assert.deepEqual(h.errors, [])
})

test('server mode uses only the server and never opens a recorder if disabled', async t => {
  const instances = browserRecognizer(t)
  const requests = []
  const h = harness(t, async url => {
    requests.push(url)
    return { ok: true, json: async () => ({ state: 'unavailable' }) }
  })
  startCallMic({ ...h.options, mode: 'server', onDraft: () => {} })
  await tick()
  assert.deepEqual(requests, ['/api/video-call/transcribe/ready'])
  assert.deepEqual(h.errors, ['server-unavailable'])
  assert.equal(h.audios.length, 0)
  assert.equal(instances.length, 0)
})

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
  ready(readyResponse)
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
  ready(readyResponse)
  await started
  assert.equal(h.nodes.length, 0)
  assert.equal(h.audios.length, 0)
  assert.deepEqual(h.texts, [])
})

test('readiness keeps polling during warm-up and aborts on hang-up', async t => {
  let requests = 0
  const h = harness(t, async () => {
    requests++
    return { ok: true, json: async () => ({ state: 'starting' }) }
  })
  const started = startLocalCallMic(h.options)
  await tick()
  assert.equal(requests, 1)
  assert.equal(h.nodes.length, 0)
  h.controller.abort()
  await started
  assert.equal(h.audios.length, 0)
  assert.equal(requests, 1)
})

test('failed server transcription reports failure', async t => {
  const h = harness(t, async url => url.endsWith('/ready') ? readyResponse : { ok: false })
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
    if (url.endsWith('/ready')) return readyResponse
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

test('quiet speech reaches server transcription while there is no playback', async t => {
  const h = harness(t, async url => url.endsWith('/ready')
    ? readyResponse
    : { ok: true, json: async () => ({ text: '轻声说的话' }) })
  await startLocalCallMic(h.options)
  for (const frame of [...loud(4, .009), ...loud(6, 0)]) h.nodes[0].port.onmessage(frame)
  await tick()
  assert.deepEqual(h.texts, ['轻声说的话'])
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
  for (const frame of loud(2, 0.05)) port.onmessage(frame)
  for (const frame of loud(6, 0)) port.onmessage(frame)
  await tick()
  assert.equal(uploaded.length, 1, 'a short, quieter interruption reaches transcription')
  for (const frame of loud(4, 0.08)) port.onmessage(frame)
  for (let i = 0; i < 6; i++) port.onmessage({ data: new Float32Array(1024) })
  await tick()
  assert.deepEqual(h.speech, [], 'louder audio while Saki speaks still waits for echo-filtered transcription')
  assert.equal(uploaded.length, 2, 'captured audio goes to transcription for real barge-in')
  h.controller.abort()
})

test('server recognition filters delayed echo using the playback that overlapped the recording', async t => {
  let respond
  const h = harness(t, async url => {
    if (url.endsWith('/ready')) return readyResponse
    return new Promise(resolve => { respond = text => resolve({ ok: true, json: async () => ({ text }) }) })
  })
  let reference = '那就这样，我们明天再联系。'
  h.options.echoReference = () => reference
  await startLocalCallMic(h.options)
  const port = h.nodes[0].port
  const capture = async (count, amplitude) => {
    for (const frame of loud(count, amplitude)) port.onmessage(frame)
    for (const frame of loud(6, 0)) port.onmessage(frame)
    await tick()
  }

  await capture(4, 0.1)
  reference = ''
  respond('明天')
  await tick()
  assert.deepEqual(h.speech, [])
  assert.deepEqual(h.texts, [])

  reference = '那就这样，我们明天再联系。'
  await capture(2, 0.04)
  respond('等等，我还有个问题')
  await tick()
  assert.deepEqual(h.texts, ['等等，我还有个问题'])
  h.controller.abort()
})
