let tts = null;

self.Module = {
  locateFile: function (path, scriptDirectory = "") {
    return scriptDirectory + path;
  },
  setStatus: function (status) {
    self.postMessage({ type: "progress", status: status || "" });
  },
  onRuntimeInitialized: function () {
    try {
      tts = createOfflineTts(self.Module);
      self.postMessage({
        type: "ready",
        sampleRate: tts.sampleRate,
        numSpeakers: tts.numSpeakers,
      });
    } catch (e) {
      self.postMessage({
        type: "error",
        message: "TTS init failed: " + (e?.message || e),
      });
    }
  },
};

importScripts("sherpa-onnx-wasm-main-tts.js");
importScripts("sherpa-onnx-tts.js");

self.onmessage = (e) => {
  const { type, id, text, sid, speed } = e.data || {};
  if (type !== "generate") return;

  if (!tts) {
    self.postMessage({
      type: "result",
      id,
      error: "TTS engine is not ready yet",
    });
    return;
  }

  try {
    const audio = tts.generate({
      text: String(text || ""),
      sid: Number(sid) || 0,
      speed: Number(speed) || 1.0,
    });
    const samples = audio.samples;
    const sampleRate = audio.sampleRate || tts.sampleRate;
    self.postMessage(
      {
        type: "result",
        id,
        samples,
        sampleRate,
      },
      [samples.buffer],
    );
  } catch (err) {
    self.postMessage({
      type: "result",
      id,
      error: err?.message || String(err),
    });
  }
};
