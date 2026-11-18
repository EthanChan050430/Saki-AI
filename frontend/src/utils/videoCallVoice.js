import { synthesizeLocalSentence } from './localTtsEngine'

const clamp = (n, low, high) => Math.max(low, Math.min(high, n))

export function createVideoCallVoice({ config, backendUrl }) {
  let context, analyser, samples, fallback, finishActive
  let echo = null
  const activeUtterances = new Set()

  const markSpeech = text => {
    const piece = String(text || '').trim()
    if (!piece) return
    const activeEcho = echo && performance.now() <= echo.until ? echo.text : ''
    const combined = activeEcho ? `${activeEcho} ${piece}` : piece
    echo = { text: combined.slice(-600), until: Infinity }
  }
  const markSilence = () => { if (echo) echo.until = performance.now() + 600 }

  function echoReference() {
    return echo && performance.now() <= echo.until ? echo.text : ''
  }

  async function prime() {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return
    try {
      if (!context || context.state === 'closed') context = new AudioContext()
      if (context.state === 'suspended') await context.resume()
    } catch {}
  }

  function playBuffer(buffer, text, signal) {
    if (signal.aborted) return Promise.resolve()
    const source = context.createBufferSource()
    const meter = context.createAnalyser()
    meter.fftSize = 512
    source.buffer = buffer
    source.connect(meter)
    meter.connect(context.destination)
    analyser = meter
    samples = new Float32Array(meter.fftSize)
    return new Promise((resolve, reject) => {
      const finish = (error) => {
        if (finishActive !== stop) return
        finishActive = null
        signal.removeEventListener('abort', stop)
        source.onended = null
        source.disconnect()
        meter.disconnect()
        analyser = null
        markSilence()
        if (error) reject(error)
        else resolve()
      }
      const stop = () => {
        try { source.stop() } catch {}
        finish()
      }
      finishActive = stop
      source.onended = () => finish()
      signal.addEventListener('abort', stop, { once: true })
      try { source.start(); markSpeech(text) } catch (error) { finish(error) }
    })
  }

  function nativeSpeech(text, signal, lang) {
    if (signal.aborted || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return Promise.resolve(false)
    return new Promise(resolve => {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = lang
      const preferred = window.speechSynthesis.getVoices().find(voice => voice.lang.toLowerCase() === lang.toLowerCase())
      if (preferred) utterance.voice = preferred
      activeUtterances.add(utterance)
      let active = true
      let began = false
      let timer = null
      const scheduleTimeout = ms => {
        clearTimeout(timer)
        timer = setTimeout(stop, ms)
      }
      const finish = () => {
        if (!active) return
        active = false
        clearTimeout(timer)
        activeUtterances.delete(utterance)
        signal.removeEventListener('abort', stop)
        fallback = null
        if (began) markSilence()
        if (finishActive === stop) finishActive = null
        resolve(began)
      }
      const stop = () => { window.speechSynthesis.cancel(); finish() }
      // Give the browser engine time to start, then switch to a generous
      // speaking budget refreshed on word/char boundaries.
      scheduleTimeout(8000)
      finishActive = stop
      signal.addEventListener('abort', stop, { once: true })
      utterance.onstart = () => {
        if (!active) return
        began = true
        markSpeech(text)
        fallback = { start: performance.now(), boundary: 0 }
        scheduleTimeout(Math.max(15000, text.length * 450))
      }
      utterance.onboundary = () => {
        if (!active) return
        if (fallback) fallback.boundary = performance.now()
        scheduleTimeout(Math.max(12000, text.length * 350))
      }
      utterance.onend = utterance.onerror = finish
      try {
        if (window.speechSynthesis.paused) window.speechSynthesis.resume()
        window.speechSynthesis.speak(utterance)
      } catch { finish() }
    })
  }

  async function synthesize(text, signal, lang) {
    try {
      if (config.ttsProvider === 'local-wasm') {
        const speech = await synthesizeLocalSentence(text, { sid: Number(config.localTtsSid) || 0, speed: Number(config.localTtsSpeed) || 1 })
        if (signal.aborted) return null
        if (speech?.samples?.length) {
          await prime()
          if (signal.aborted) return null
          const buffer = context.createBuffer(1, speech.samples.length, speech.sampleRate)
          buffer.copyToChannel(speech.samples, 0)
          return buffer
        }
      }
      if (config.ttsProvider === 'gpt-sovits') {
        const textLang = lang.split('-')[0]
        const response = await fetch(`${backendUrl}/api/sovits/proxy/tts`, {
          method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, text_lang: textLang, ref_audio_path: config.sovitsRefAudio,
            prompt_text: config.sovitsRefText || '', prompt_lang: textLang,
            media_type: 'wav', streaming_mode: false, sovits_url: config.sovitsUrl || 'http://127.0.0.1:9880' }),
        })
        if (!response.ok) throw new Error('Voice service unavailable')
        const bytes = await response.arrayBuffer()
        if (signal.aborted) return null
        await prime()
        const buffer = await context.decodeAudioData(bytes)
        return signal.aborted ? null : buffer
      }
    } catch {
      return null
    }
    return null;
  }

  async function playPrepared(buffer, text, signal, lang) {
    if (signal.aborted) return false
    if (buffer) {
      try {
        await prime()
        if (signal.aborted) return false
        await playBuffer(buffer, text, signal)
        return true
      } catch {
        if (signal.aborted) return false
        return nativeSpeech(text, signal, lang)
      }
    }
    return nativeSpeech(text, signal, lang)
  }

  function level(now) {
    if (analyser) {
      analyser.getFloatTimeDomainData(samples)
      let power = 0
      for (const sample of samples) power += sample * sample
      return { voice: clamp(Math.sqrt(power / samples.length) * 6.2, 0, 1), articulation: 0 }
    }
    if (fallback) {
      const beat = fallback.boundary && now - fallback.boundary < 130
      const syllable = Math.max(0, Math.sin((now - fallback.start) / 67) * .68 + Math.sin(now / 102) * .16)
      return { voice: clamp((beat ? .25 : 0) + syllable, 0, .83), articulation: beat ? .6 : .16 }
    }
    return { voice: 0, articulation: 0 }
  }
  return {
    synthesize, playPrepared, prime, level, echoReference,
    close() {
      finishActive?.()
      if (context && context.state !== 'closed') void context.close().catch(() => {})
    },
  }
}
