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
  assert.equal(engine.getLocalTtsState().downloadPhase, '');
  workers[0].onmessage({ data: { type: 'model-cache-miss' } });
  assert.equal(engine.getLocalTtsState().downloadPhase, 'preparing');
  workers[0].onmessage({ data: { type: 'download-source', source: 'onedrive' } });
  assert.equal(engine.getLocalTtsState().activeSource, 'onedrive');
  workers[0].onmessage({ data: { type: 'progress', status: 'Downloading data... (1/2)' } });
  assert.equal(engine.getLocalTtsState().percent, 50);
  assert.deepEqual(engine.getLocalTtsState().downloadProgress, { loaded: 1, total: 2 });
  workers[0].onmessage({ data: { type: 'progress', status: 'Running...' } });
  assert.equal(engine.getLocalTtsState().downloadPhase, 'initializing');
  assert.equal(engine.getLocalTtsState().downloadProgress, null);
  workers[0].onmessage({ data: { type: 'ready' } });
  await init;
  assert.equal(engine.getLocalTtsState().downloadPhase, '');
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
  workers[1].onmessage({ data: { type: 'progress', status: 'Running...' } });
  assert.equal(engine.getLocalTtsState().downloadPhase, '');
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

test('switching the model download source cancels a stalled load and passes the new source to its worker', async (t) => {
  const workers = [];
  const originalWorker = globalThis.Worker;
  globalThis.Worker = class {
    constructor() { workers.push(this); }
    terminate() { this.terminated = true; }
    postMessage(message) { this.message = message; }
  };
  t.after(() => {
    if (originalWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = originalWorker;
  });

  const engine = await import('../src/utils/localTtsEngine.js?source-switch');
  const first = engine.initLocalTts();
  const rejected = assert.rejects(first, /已切换下载线路/);
  engine.setTtsDownloadSource('google');
  await rejected;
  assert.equal(workers[0].terminated, true);
  assert.equal(engine.getLocalTtsState().status, 'idle');

  const second = engine.initLocalTts();
  assert.equal(workers[1].message.source, 'google');
  workers[0].onmessage({ data: { type: 'ready' } });
  assert.equal(engine.getLocalTtsState().status, 'loading');
  workers[1].onmessage({ data: { type: 'ready' } });
  await second;
  assert.equal(engine.getLocalTtsState().status, 'ready');
});
