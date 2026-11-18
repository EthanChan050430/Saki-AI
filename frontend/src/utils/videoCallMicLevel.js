// Monitor the existing microphone stream independently of transcription startup.
// The analyser has no speaker connection, so microphone audio is never played back.
export function monitorCallMicLevel(stream, onLevel) {
  const Audio = globalThis.AudioContext || globalThis.webkitAudioContext
  let audio, source, analyser, frame, stopped = false, level = 0, previous = 0
  const stop = () => {
    if (stopped) return
    stopped = true
    cancelAnimationFrame(frame)
    source?.disconnect()
    analyser?.disconnect()
    stream.getAudioTracks().forEach(track => track.removeEventListener('ended', stop))
    if (audio && audio.state !== 'closed') void audio.close().catch(() => {})
    onLevel(0)
  }
  try {
    if (!Audio) return stop
    audio = new Audio()
    source = audio.createMediaStreamSource(stream)
    analyser = audio.createAnalyser()
    analyser.fftSize = 1024
    source.connect(analyser)
    const samples = new Float32Array(analyser.fftSize)
    const tick = now => {
      if (stopped) return
      if (now - previous >= 40) {
        analyser.getFloatTimeDomainData(samples)
        let power = 0
        for (const sample of samples) power += sample * sample
        const rms = Math.sqrt(power / samples.length)
        // Map -54..-12 dBFS to the capsule height; ignore the noise floor.
        const target = rms > .002 ? Math.max(0, Math.min(1, (20 * Math.log10(rms) + 54) / 42)) : 0
        level += (target - level) * (target > level ? .65 : .22)
        onLevel(level < .005 ? 0 : level, rms)
        previous = now
      }
      frame = requestAnimationFrame(tick)
    }
    stream.getAudioTracks().forEach(track => track.addEventListener('ended', stop, { once: true }))
    void audio.resume().catch(stop)
    frame = requestAnimationFrame(tick)
  } catch { stop() }
  return stop
}
