import test from 'node:test';
import assert from 'node:assert/strict';

test('local TTS retries failed startup and worker crashes without leaving jobs pending', async (t) => {
  let failConstruction = true;
  const workers = [];
  class Worker {
    constructor() {
      if (failConstruction) throw new Error('worker unavailable');
      workers.push(this);
    }
    terminate() { this.terminated = true; }
    postMessage(data) { this.lastMessage = data; }
  }
  const originalWorker = globalThis.Worker;
  globalThis.Worker = Worker;
  t.after(() => {
    if (originalWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = originalWorker;
  });
  const engine = await import('../src/utils/localTtsEngine.js?worker-recovery');
  await assert.rejects(engine.initLocalTts(), /worker unavailable/);
  failConstruction = false;
  const init = engine.initLocalTts();
  assert.equal(engine.initLocalTts(), init);
  workers[0].onmessage({ data: { type: 'progress', status: 'Downloading data... (1/2)' } });
  assert.equal(engine.getLocalTtsState().percent, 50);
  workers[0].onmessage({ data: { type: 'ready' } });
  await init;
  const pending = engine.synthesizeLocalSentence('hello');
  const rejected = assert.rejects(pending, /worker crashed/);
  await Promise.resolve();
  workers[0].onerror({ message: 'worker crashed' });
  await rejected;
  assert.equal(engine.getLocalTtsState().status, 'error');
  assert.equal(workers[0].terminated, true);
  const retry = engine.initLocalTts();
  workers[0].onerror({ message: 'stale error' });
  assert.equal(engine.getLocalTtsState().status, 'loading');
  workers[1].onmessage({ data: { type: 'ready' } });
  await retry;
  assert.equal(engine.getLocalTtsState().status, 'ready');
  const nextJob = engine.synthesizeLocalSentence('hello again');
  const nextRejected = assert.rejects(nextJob, /engine failed/);
  await Promise.resolve();
  workers[1].onmessage({ data: { type: 'error', message: 'engine failed' } });
  await nextRejected;
  assert.equal(workers[1].terminated, true);
});

test('stopping audio settles playback and start failures reach the caller', async (t) => {
  const sources = [];
  let failStart = false;
  class AudioContext {
    constructor({ sampleRate }) { this.sampleRate = sampleRate; }
    createBuffer() { return { getChannelData: () => new Float32Array(2) }; }
    createBufferSource() {
      const source = {
        connect() {},
        disconnect() { this.disconnected = true; },
        start() { if (failStart) throw new Error('audio unavailable'); },
        stop() {},
      };
      sources.push(source);
      return source;
    }
  }
  const originalWindow = globalThis.window;
  globalThis.window = { AudioContext };
  t.after(() => {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  });
  const engine = await import('../src/utils/localTtsEngine.js?playback-stop');
  const playback = engine.playFloat32Audio(new Float32Array(2), 22050);
  engine.stopLocalTtsPlayback();
  await playback;
  assert.equal(sources[0].disconnected, true);
  failStart = true;
  await assert.rejects(engine.playFloat32Audio(new Float32Array(2), 22050), /audio unavailable/);
});
