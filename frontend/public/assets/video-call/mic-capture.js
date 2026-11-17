class CallMicCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.frame = new Float32Array(Math.round(sampleRate * .064))
    this.cursor = 0
  }

  process(inputs) {
    const values = inputs[0]?.[0]
    if (!values) return true
    for (const value of values) {
      this.frame[this.cursor++] = value
      if (this.cursor !== this.frame.length) continue
      this.port.postMessage(this.frame, [this.frame.buffer])
      this.frame = new Float32Array(this.cursor)
      this.cursor = 0
    }
    return true
  }
}
registerProcessor('call-mic-capture', CallMicCapture)
