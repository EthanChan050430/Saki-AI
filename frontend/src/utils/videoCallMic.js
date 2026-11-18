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

export async function startLocalCallMic({ stream, backendUrl, base, lang, signal, speakerLevel, onSpeech, onText, onError, onStatus = () => {} }) {
  if (signal.aborted) return
  const Audio = globalThis.AudioContext || globalThis.webkitAudioContext
  if (!Audio) throw new Error('当前浏览器不支持本机语音采集。')
  const audio = new Audio()
  let node
  const close = () => {
    node?.port.close()
    signal.removeEventListener('abort', close)
    if (audio.state !== 'closed') void audio.close().catch(() => {})
  }
  signal.addEventListener('abort', close, { once: true })
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
  try {
    await Promise.all([audio.audioWorklet.addModule(`${base}assets/video-call/mic-capture.js`), prepare()])
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
  let floor = .006
  const submit = frames => {
    if (frames.length < MIN_FRAMES) return
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
        if (text) onText(text)
      }
    }).catch(error => { if (!signal.aborted) onError(error) })
  }
  node.port.onmessage = ({ data: frame }) => {
    if (signal.aborted) return
    let energy = 0
    for (const value of frame) energy += value * value
    const level = Math.sqrt(energy / frame.length)
    const output = speakerLevel()
    const gate = Math.max(.009, floor * 2.6) + output * (echoCancellation ? .14 : .22)
    const heard = level > gate
    // Hysteresis keeps the utterance open through a soft consonant or a short
    // pause instead of cutting the last word of a sentence in half.
    const active = level > gate * .78
    if (!heard) floor += (Math.min(.014, level) - floor) * (level < floor ? .05 : .012)
    if (!started) {
      lead = [...lead.slice(-5), frame]
      voiced = heard ? voiced + 1 : 0
      if (voiced < VOICED_TO_START) return
      started = true
      utterance = lead
      lead = []
      quiet = 0
      // Only interrupt immediately on raw energy when Saki is silent; while she
      // is speaking, wait for transcription + echo filtering so speaker bleed
      // does not cut her off mid-sentence.
      if (!output) onSpeech()
      return
    }
    utterance.push(frame)
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
