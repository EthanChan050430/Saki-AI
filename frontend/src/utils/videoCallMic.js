import { looksLikeEcho } from './videoCallEcho.js'

const targetRate = 16000

function pcm16(frames, sampleRate) {
  const input = new Float32Array(frames.reduce((sum, frame) => sum + frame.length, 0))
  let cursor = 0
  for (const frame of frames) { input.set(frame, cursor); cursor += frame.length }
  if (sampleRate === targetRate) return Int16Array.from(input, value => Math.round(Math.max(-1, Math.min(1, value)) * 32767))
  const ratio = sampleRate / targetRate
  const output = new Int16Array(Math.floor(input.length / ratio))
  for (let i = 0; i < output.length; i++) {
    const from = Math.floor(i * ratio)
    const end = Math.min(input.length, Math.max(from + 1, Math.floor((i + 1) * ratio)))
    let sum = 0
    for (let j = from; j < end; j++) sum += input[j]
    output[i] = Math.round(Math.max(-1, Math.min(1, sum / (end - from))) * 32767)
  }
  return output
}

// 64 ms frames. Two voiced frames start an utterance because the pre-roll buffer
// already holds the 320 ms before it; six quiet frames end one, and the trailing
// silence is trimmed off before the audio is uploaded.
const VOICED_TO_START = 2
const QUIET_TO_STOP = 6
const MAX_FRAMES = 188
const MIN_FRAMES = 2
const BROWSER_NETWORK_RETRY_DELAYS = [400, 800]
const BROWSER_FINALIZE_DELAY = 450
const BROWSER_END_TIMEOUT = 1500

const matchesPlayback = (text, references, allowApproximate = true) => (
  [...references].some(reference => looksLikeEcho(text, reference, true, allowApproximate))
)

export function startCallMic({ mode, stream, backendUrl, base, lang, signal, speakerLevel, echoReference = () => '', hasNearEndSpeech = () => false, onSpeech, onDraft, onText, onError }) {
  if (signal.aborted) return

  if (mode === 'server') {
    if (!stream) { onError('audio-capture'); return }
    const fail = () => { if (!signal.aborted) onError('server-unavailable') }
    void startLocalCallMic({
      stream, backendUrl, base, lang, signal, speakerLevel, echoReference, onSpeech,
      onText: value => {
        if (signal.aborted) return
        onSpeech()
        onText(value)
      },
      onError: fail,
    }).catch(fail)
    return
  }

  const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition
  if (!Recognition) { onError('unsupported'); return }

  let recognition
  let inputTrack = stream?.getAudioTracks().find(track => track.kind === 'audio' && track.readyState === 'live')
  let sendTimer, finalizeTimer, endTimer, restartTimer
  let committed = '', draft = '', finalCount = 0, speechEnded = false, endedWithError = false
  let networkFailures = 0
  let retryDelay = 180, nearEndSpeech = false
  const references = new Set()
  const rememberPlayback = () => {
    const reference = echoReference()
    if (reference) references.add(reference)
    nearEndSpeech ||= hasNearEndSpeech()
  }
  const resetSpeechEvidence = () => {
    references.clear()
    nearEndSpeech = false
  }
  const dispatch = () => {
    clearTimeout(sendTimer)
    sendTimer = undefined
    if (!committed || signal.aborted) return
    const value = committed
    committed = ''
    onText(value)
    if (draft && !signal.aborted) onDraft(draft)
  }
  const clearFinalize = () => {
    clearTimeout(finalizeTimer)
    finalizeTimer = undefined
  }
  const clearEndTimer = () => {
    clearTimeout(endTimer)
    endTimer = undefined
  }
  const waitForEnd = () => {
    if (endTimer !== undefined) return
    const current = recognition
    endTimer = setTimeout(() => {
      if (!signal.aborted && recognition === current) finishSession(true)
    }, BROWSER_END_TIMEOUT)
  }
  const requestFinalResult = () => {
    if (!speechEnded || !draft || finalizeTimer !== undefined || endTimer !== undefined) return
    finalizeTimer = setTimeout(() => {
      finalizeTimer = undefined
      if (signal.aborted) return
      // Wait for a final transcript, and restart the recognizer if its session never ends.
      waitForEnd()
      try { recognition.stop?.() } catch {}
    }, BROWSER_FINALIZE_DELAY)
  }
  const releaseRecognition = () => {
    const current = recognition
    recognition = undefined
    if (!current) return
    current.onresult = current.onerror = current.onend = null
    current.onspeechstart = current.onspeechend = null
    try { current.abort() } catch {}
  }
  const stop = () => {
    clearTimeout(sendTimer)
    clearFinalize()
    clearEndTimer()
    clearTimeout(restartTimer)
    signal.removeEventListener('abort', stop)
    releaseRecognition()
  }
  const browserFailed = reason => {
    if (signal.aborted) return
    draft = ''
    stop()
    if (reason !== 'not-allowed') dispatch()
    onDraft('')
    onError(reason)
  }
  const start = () => {
    if (signal.aborted) return
    retryDelay = 180
    endedWithError = false
    try {
      if (!recognition) attachRecognition(new Recognition())
      if (inputTrack?.readyState === 'live') {
        try {
          recognition.start(inputTrack)
          return
        } catch (error) {
          if (!['TypeError', 'NotSupportedError', 'InvalidStateError'].includes(error?.name)) throw error
          inputTrack = undefined
        }
      }
      recognition.start()
    } catch (error) {
      const denied = error?.name === 'NotAllowedError' || error?.name === 'SecurityError'
      browserFailed(denied ? 'not-allowed' : 'start-failed')
    }
  }

  const handleSpeechStart = () => {
    speechEnded = false
    clearFinalize()
    resetSpeechEvidence()
    rememberPlayback()
  }
  const handleSpeechEnd = () => {
    speechEnded = true
    rememberPlayback()
    requestFinalResult()
  }
  const handleResult = event => {
    networkFailures = 0
    const drafts = []
    let hasNewFinal = false
    const previousFinalCount = finalCount
    rememberPlayback()
    const overlapsPlayback = references.size > 0
    for (let i = finalCount; i < event.results.length; i += 1) {
      const result = event.results[i]
      const value = result[0].transcript.trim()
      if (result.isFinal) finalCount = i + 1
      // A clear new transcript can be quiet. Use acoustic evidence only when
      // the text partially resembles playback, where matching is ambiguous.
      if (!value || matchesPlayback(value, references, !nearEndSpeech)) continue
      if (result.isFinal) {
        hasNewFinal = true
        committed += (committed ? ' ' : '') + value
      } else drafts.push(value)
    }
    if (finalCount !== previousFinalCount && event.results.length === finalCount) resetSpeechEvidence()
    draft = drafts.join(' ')
    if (draft) requestFinalResult()
    else clearFinalize()
    if (draft || hasNewFinal) onSpeech(draft, hasNewFinal, overlapsPlayback)
    onDraft([committed, draft].filter(Boolean).join(' '))
    // An interim result for the next clause must not hold a finished clause forever.
    if (committed && (sendTimer === undefined || hasNewFinal || !draft)) {
      clearTimeout(sendTimer)
      sendTimer = setTimeout(dispatch, draft ? 1100 : 250)
    }
  }
  const handleError = ({ error }) => {
    endedWithError = true
    clearFinalize()
    if (error === 'aborted' || error === 'no-speech') {
      waitForEnd()
      return
    }
    if (error === 'audio-capture' && inputTrack) {
      inputTrack = undefined
      waitForEnd()
      return
    }
    if (error === 'network' && networkFailures < BROWSER_NETWORK_RETRY_DELAYS.length) {
      retryDelay = BROWSER_NETWORK_RETRY_DELAYS[networkFailures++]
      waitForEnd()
      return
    }
    browserFailed(error)
  }
  function finishSession(replaceRecognition = false) {
    clearFinalize()
    clearEndTimer()
    if (replaceRecognition) releaseRecognition()
    if (draft && !endedWithError && (!replaceRecognition || speechEnded)) {
      committed += (committed ? ' ' : '') + draft
    }
    draft = ''
    dispatch()
    finalCount = 0
    speechEnded = false
    resetSpeechEvidence()
    onDraft('')
    if (!signal.aborted) restartTimer = setTimeout(start, retryDelay)
  }

  function attachRecognition(current) {
    recognition = current
    // Ignore callbacks already queued by a browser after its old session is replaced.
    const active = handler => event => {
      if (!signal.aborted && recognition === current) handler(event)
    }
    current.lang = lang
    current.continuous = true
    current.interimResults = true
    current.onspeechstart = active(handleSpeechStart)
    current.onspeechend = active(handleSpeechEnd)
    current.onresult = active(handleResult)
    current.onerror = active(handleError)
    current.onend = active(() => finishSession())
  }
  signal.addEventListener('abort', stop, { once: true })
  start()
}

export async function startLocalCallMic({ stream, backendUrl, base, lang, signal, speakerLevel, echoReference = () => '', onSpeech, onText, onError, onStatus = () => {} }) {
  if (signal.aborted) return
  const Audio = globalThis.AudioContext || globalThis.webkitAudioContext
  if (!Audio) throw new Error('当前浏览器不支持本机语音采集。')
  const prepare = async () => {
    onStatus('starting')
    const startup = AbortSignal.any([signal, AbortSignal.timeout(185000)])
    while (!startup.aborted) {
      const response = await fetch(`${backendUrl}/api/video-call/transcribe/ready`, {
        cache: 'no-store', signal: startup,
      })
      if (!response.ok) throw new Error('本机语音服务启动失败。')
      const { state } = await response.json()
      if (state === 'ready' || state === undefined) return
      if (state !== 'starting') throw new Error('本机语音服务启动失败。')
      startup.throwIfAborted()
      await new Promise(resolve => {
        const done = () => {
          clearTimeout(timer)
          startup.removeEventListener('abort', done)
          resolve()
        }
        const timer = setTimeout(done, 1500)
        startup.addEventListener('abort', done, { once: true })
      })
    }
    startup.throwIfAborted()
  }
  try { await prepare() } catch (error) {
    if (!signal.aborted) throw error
    return
  }
  if (signal.aborted) return
  const audio = new Audio()
  let node
  const close = () => {
    node?.port.close()
    signal.removeEventListener('abort', close)
    if (audio.state !== 'closed') void audio.close().catch(() => {})
  }
  signal.addEventListener('abort', close, { once: true })
  try {
    await audio.audioWorklet.addModule(`${base}assets/video-call/mic-capture.js`)
    if (signal.aborted) { close(); return }
    node = new AudioWorkletNode(audio, 'call-mic-capture', { outputChannelCount: [1] })
    audio.createMediaStreamSource(stream).connect(node)
    node.connect(audio.destination)
    await audio.resume()
    if (signal.aborted) { close(); return }
    onStatus('listening')
  } catch (error) {
    close()
    if (!signal.aborted) throw error
    return
  }
  const echoCancellation = stream.getAudioTracks()[0]?.getSettings()?.echoCancellation
  let lead = [], utterance = [], voiced = 0, quiet = 0, started = false, pending = Promise.resolve()
  let floor = .004
  const submit = captured => {
    const frames = captured.map(({ frame }) => frame)
    if (frames.length < MIN_FRAMES) return
    // Keep the playback reference from capture time even if ASR is queued.
    const references = new Set(captured.map(({ reference }) => reference).filter(Boolean))
    pending = pending.then(async () => {
      if (signal.aborted) return
      onStatus('transcribing')
      const response = await fetch(`${backendUrl}/api/video-call/transcribe?language=${encodeURIComponent(lang.split('-')[0])}`, {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: pcm16(frames, audio.sampleRate),
        signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]),
      })
      if (!response.ok) throw new Error('语音转写中断')
      const { text } = await response.json()
      if (!signal.aborted) {
        onStatus('listening')
        if (text && !matchesPlayback(text, references)) onText(text)
      }
    }).catch(error => { if (!signal.aborted) onError(error) })
  }
  node.port.onmessage = ({ data: frame }) => {
    if (signal.aborted) return
    let energy = 0
    for (const value of frame) energy += value * value
    const level = Math.sqrt(energy / frame.length)
    const reference = echoReference()
    const output = Math.max(speakerLevel(), reference ? .15 : 0)
    const captured = { frame, reference }
    const noiseGate = output ? Math.max(.0156, floor * 2.6) : Math.max(.006, floor * 1.8)
    const gate = noiseGate + output * (echoCancellation ? .10 : .16)
    const heard = level > gate
    // Hysteresis keeps the utterance open through a soft consonant or a short
    // pause instead of cutting the last word of a sentence in half.
    const active = level > gate * .78
    if (!heard) floor += (Math.min(.014, level) - floor) * (level < floor ? .05 : .012)
    if (!started) {
      lead = [...lead.slice(-5), captured]
      voiced = heard ? voiced + 1 : 0
      if (voiced < VOICED_TO_START) return
      started = true
      utterance = lead
      lead = []
      quiet = 0
      // Only interrupt immediately on raw energy when Saki is silent; while she
      // is speaking, wait for transcription + echo filtering so speaker bleed
      // does not cut her off mid-sentence.
      if (!output && !utterance.some(({ reference }) => reference)) onSpeech()
      return
    }
    utterance.push(captured)
    quiet = active ? 0 : quiet + 1
    if (quiet < QUIET_TO_STOP && utterance.length < MAX_FRAMES) return
    // Silence tail only, keeping one frame so the last phoneme stays intact.
    const trimming = quiet > 1 && utterance.length - quiet >= MIN_FRAMES
    submit(trimming ? utterance.slice(0, utterance.length - quiet + 1) : utterance)
    utterance = []
    started = false
    voiced = quiet = 0
  }
}
