import { BACKEND_URL } from './backendUrl.js';

const STATUS_IDLE = 'idle';
const STATUS_LOADING = 'loading';
const STATUS_READY = 'ready';
const STATUS_ERROR = 'error';

let worker = null;
let engineState = {
  status: STATUS_IDLE,
  progressText: '',
  percent: 0,
  sampleRate: 16000,
  numSpeakers: 1,
  error: null,
  cacheUnavailable: false,
  activeSource: '',
  downloadPhase: '',
  downloadProgress: null,
};

let initPromise = null;
let cancelInit = null;
const SOURCE_KEY = 'saki:tts-download-source:v2';
const SOURCE_NAMES = ['auto', 'server', 'github', 'google', 'onedrive', 'pan123'];
let downloadSource = 'auto';
try {
  const saved = globalThis.localStorage?.getItem(SOURCE_KEY);
  if (SOURCE_NAMES.includes(saved)) downloadSource = saved;
} catch {}

export function getTtsDownloadSource() {
  return downloadSource;
}

export function setTtsDownloadSource(source) {
  if (!SOURCE_NAMES.includes(source) || source === downloadSource) return;
  downloadSource = source;
  try { globalThis.localStorage?.setItem(SOURCE_KEY, source); } catch {}
  cancelInit?.();
}

const MODEL_SOURCES_API = `${BACKEND_URL}/api/tts/model-sources`;

export async function getTtsModelSources() {
  const response = await fetch(MODEL_SOURCES_API, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('无法获取模型下载线路。');
  return response.json();
}
let jobCounter = 0;
const pendingJobs = new Map();
const listeners = new Set();

let activeAudioCtx = null;
let activeSource = null;
let finishActivePlayback = null;

function notifyListeners() {
  const snapshot = { ...engineState };
  listeners.forEach((cb) => {
    try {
      cb(snapshot);
    } catch (error) {
      console.error('Local TTS status listener failed:', error);
    }
  });
}

function updateState(patch) {
  engineState = { ...engineState, ...patch };
  notifyListeners();
}

export function getLocalTtsState() {
  return { ...engineState };
}

export function subscribeLocalTtsStatus(cb) {
  listeners.add(cb);
  cb({ ...engineState });
  return () => listeners.delete(cb);
}

export function initLocalTts(file) {
  if (engineState.status === STATUS_READY && worker) {
    return Promise.resolve({ ...engineState });
  }
  if (initPromise) return initPromise;

  let resolveInit;
  let rejectInit;
  const currentInit = new Promise((resolve, reject) => {
    resolveInit = resolve;
    rejectInit = reject;
  });
  initPromise = currentInit;
  updateState({
    status: STATUS_LOADING, progressText: '正在加载本地语音模型...', percent: 0, error: null,
    cacheUnavailable: false, activeSource: '', downloadPhase: '', downloadProgress: null,
  });

  try {
    worker = new Worker('/tts-wasm/saki-tts.worker.js?v=4');
  } catch (err) {
    const msg = err?.message || '无法启动语音 Web Worker';
    updateState({ status: STATUS_ERROR, error: msg, progressText: msg });
    if (initPromise === currentInit) initPromise = null;
    rejectInit(new Error(msg));
    return currentInit;
  }

  const currentWorker = worker;
  const failInit = (msg, cancelled = false) => {
    if (worker !== currentWorker) return;
    currentWorker.terminate();
    worker = null;
    cancelInit = null;
    if (initPromise === currentInit) initPromise = null;
    for (const job of pendingJobs.values()) job.reject(new Error(msg));
    pendingJobs.clear();
    rejectInit(new Error(msg));
    updateState(cancelled
      ? { status: STATUS_IDLE, error: null, progressText: '', percent: 0, downloadPhase: '', downloadProgress: null }
      : { status: STATUS_ERROR, error: msg, progressText: msg });
  };
  cancelInit = () => failInit('已切换下载线路。', true);
  currentWorker.onerror = (err) => failInit(err?.message || 'WASM 语音引擎加载失败');

  currentWorker.onmessage = (e) => {
    if (worker !== currentWorker) return;
    const data = e.data || {};
    if (data.type === 'model-cache-miss') {
      updateState({ downloadPhase: 'preparing' });
      return;
    }

    if (data.type === 'selecting-source') {
      updateState({ downloadPhase: 'selecting', progressText: '正在按 IP 归属地选择下载线路...' });
      return;
    }

    if (data.type === 'download-source') {
      updateState({
        activeSource: data.source, percent: 0, progressText: '正在连接模型下载线路...',
        downloadPhase: 'connecting', downloadProgress: null,
      });
      return;
    }

    if (data.type === 'progress') {
      const raw = String(data.status || '');
      const match = raw.match(/Downloading data\.\.\. \((\d+)\/(\d+)\)/);
      if (match) {
        const loaded = Number(match[1]);
        const total = Number(match[2]) || 1;
        const pct = Math.min(100, Math.floor((loaded / total) * 100));
        if (engineState.downloadPhase === 'downloading' && engineState.percent === pct && engineState.downloadProgress?.total === total) return;
        const loadedMb = (loaded / (1024 * 1024)).toFixed(1);
        const totalMb = (total / (1024 * 1024)).toFixed(1);
        updateState({
          progressText: `正在下载语音模型 ${pct}% (${loadedMb}/${totalMb} MB)`,
          percent: pct,
          downloadPhase: 'downloading',
          downloadProgress: { loaded, total },
        });
      } else if (raw === 'Running...') {
        updateState({
          progressText: '正在初始化语音推理引擎...', percent: 99,
          downloadPhase: engineState.downloadPhase && 'initializing', downloadProgress: null,
        });
      }
      return;
    }

    if (data.type === 'cache-unavailable') {
      updateState({ cacheUnavailable: true });
      return;
    }

    if (data.type === 'ready') {
      cancelInit = null;
      if (initPromise === currentInit) initPromise = null;
      updateState({
        status: STATUS_READY,
        progressText: '本地语音模型已就绪',
        percent: 100,
        downloadPhase: '',
        downloadProgress: null,
        sampleRate: data.sampleRate || 16000,
        numSpeakers: data.numSpeakers || 1,
        error: null,
      });
      resolveInit({ ...engineState });
      return;
    }

    if (data.type === 'error') {
      failInit(data.message || '语音引擎初始化失败');
      return;
    }

    if (data.type === 'result') {
      const job = pendingJobs.get(data.id);
      if (!job) return;
      pendingJobs.delete(data.id);
      if (data.error) job.reject(new Error(data.error));
      else job.resolve({ samples: data.samples, sampleRate: data.sampleRate });
    }
  };
  try {
    currentWorker.postMessage({ type: 'init', file, source: downloadSource, sourcesUrl: MODEL_SOURCES_API });
  } catch (error) {
    failInit(error?.message || '无法启动模型加载。');
  }
  return currentInit;
}

export async function synthesizeLocalSentence(text, { sid = 0, speed = 1.0 } = {}) {
  const clean = String(text || '').trim();
  if (!clean) return null;

  await initLocalTts();
  const id = ++jobCounter;
  return new Promise((resolve, reject) => {
    pendingJobs.set(id, { resolve, reject });
    try {
      worker.postMessage({ type: 'generate', id, text: clean, sid, speed });
    } catch (error) {
      pendingJobs.delete(id);
      reject(error);
    }
  });
}

export function stopLocalTtsPlayback() {
  if (activeSource) {
    const source = activeSource;
    try {
      source.stop();
    } catch (error) {
      console.warn('Local TTS playback stop failed:', error);
    } finally {
      finishActivePlayback?.();
    }
  }
}

export async function playFloat32Audio(samples, sampleRate, shouldAbort) {
  if (!samples || samples.length === 0) return;
  if (shouldAbort && shouldAbort()) return;

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) throw new Error('浏览器不支持 Web Audio API');

  if (!activeAudioCtx || activeAudioCtx.sampleRate !== sampleRate) {
    if (activeAudioCtx) {
      try {
        await activeAudioCtx.close?.();
      } catch (error) {
        console.warn('Local TTS audio context close failed:', error);
      }
    }
    activeAudioCtx = new AudioCtx({ sampleRate });
  }
  if (activeAudioCtx.state === 'suspended') {
    await activeAudioCtx.resume?.();
  }
  if (shouldAbort && shouldAbort()) return;

  stopLocalTtsPlayback();
  const buffer = activeAudioCtx.createBuffer(1, samples.length, sampleRate);
  buffer.getChannelData(0).set(samples);

  const source = activeAudioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(activeAudioCtx.destination);
  activeSource = source;

  await new Promise((resolve, reject) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      source.onended = null;
      source.disconnect();
      if (activeSource === source) {
        activeSource = null;
        finishActivePlayback = null;
      }
      resolve();
    };
    finishActivePlayback = done;
    source.onended = done;
    try {
      source.start(0);
    } catch (error) {
      reject(error);
      done();
    }
  });
}

export function splitTtsSentences(text) {
  const raw = String(text || '')
    .replace(/\r\n/g, '\n')
    .trim();
  if (!raw) return [];

  const parts = raw
    .split(/(?<=[。！？!?；;\n])\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

  const merged = [];
  for (const part of parts) {
    if (merged.length > 0 && part.length < 5) {
      merged[merged.length - 1] += part;
    } else if (merged.length > 0 && merged[merged.length - 1].length < 8) {
      merged[merged.length - 1] += part;
    } else {
      merged.push(part);
    }
  }
  return merged;
}
