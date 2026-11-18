const MODEL_SIZE = 138068830;
const MODEL_SHA256 = '2fc20c60263d89c146fa3a71336d9c6d9bd62d57caa44f10e1f1a764e4149392';
const CACHE_NAME = 'saki-tts-model';
const CACHE_KEY = '/tts-wasm/sherpa-onnx-wasm-main-tts.data?sha256=' + MODEL_SHA256;
let tts = null;

function reportError(error) {
  self.postMessage({ type: 'error', message: error?.message || String(error) });
}

self.addEventListener('unhandledrejection', (event) => reportError(event.reason));

async function downloadModel(url) {
  const controller = new AbortController();
  const signal = controller.signal;
  const deadline = setTimeout(() => controller.abort(), 15 * 60 * 1000);
  const abortStalledDownload = () => setTimeout(() => controller.abort(), 20000);
  let watchdog = abortStalledDownload();
  let reader;
  let loaded = 0;
  let lastPercent = -1;
  try {
    const response = await fetch(url, { signal, credentials: 'same-origin' });
    const length = response.headers.get('content-length');
    if (!response.ok || !response.body || response.headers.get('content-type')?.includes('text/html') ||
        (length && Number(length) !== MODEL_SIZE)) {
      await response.body?.cancel();
      throw new Error('下载线路未返回模型文件，可切换线路或导入已下载的模型。');
    }
    const bytes = new Uint8Array(MODEL_SIZE);
    reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      clearTimeout(watchdog);
      watchdog = abortStalledDownload();
      if (loaded + value.byteLength > MODEL_SIZE) throw new Error('模型文件大小不匹配。');
      bytes.set(value, loaded);
      loaded += value.byteLength;
      const percent = Math.floor(loaded * 100 / MODEL_SIZE);
      if (percent !== lastPercent) {
        lastPercent = percent;
        self.postMessage({ type: 'progress', status: 'Downloading data... (' + loaded + '/' + MODEL_SIZE + ')' });
      }
    }
    if (loaded !== MODEL_SIZE) throw new Error('模型下载不完整，可重试或切换线路。');
    return bytes.buffer;
  } finally {
    clearTimeout(watchdog);
    clearTimeout(deadline);
    await reader?.cancel().catch(() => {});
  }
}

async function getIpCountry(country) {
  if (/^[A-Z]{2}$/.test(country || '')) return country;
  try {
    const response = await fetch('https://api.country.is/', {
      signal: AbortSignal.timeout(3000),
      credentials: 'omit',
      cache: 'no-store',
    });
    if (response.ok) return (await response.json()).country;
  } catch {}
  return '';
}

async function fetchModelSources(sourcesUrl) {
  const response = await fetch(sourcesUrl, { signal: AbortSignal.timeout(5000) });
  return response.ok ? response.json() : {};
}

async function verifyModelPackage(bytes) {
  if (!self.crypto?.subtle) throw new Error('校验模型需要 HTTPS 或 localhost。');
  const digest = await self.crypto.subtle.digest('SHA-256', bytes);
  const sha256 = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
  if (sha256 !== MODEL_SHA256) throw new Error('模型 SHA-256 校验失败，请重新下载。');
  return bytes;
}

async function downloadAutomaticModel(sourcesUrl) {
  self.postMessage({ type: 'selecting-source' });
  const sources = await fetchModelSources(sourcesUrl).catch(() => ({}));
  const country = sources.automatic ? await getIpCountry(sources.country) : '';
  const order = country === 'CN'
    ? ['pan123', 'onedrive', 'github', 'google']
    : ['github', 'google', 'pan123', 'onedrive'];
  const base = new URL(sourcesUrl, self.location.href);
  for (const source of order) {
    const urls = sources.automatic?.[source];
    if (!urls?.length) continue;
    self.postMessage({ type: 'download-source', source });
    for (const url of urls) {
      try {
        const bytes = await downloadModel(new URL(url, base));
        return await verifyModelPackage(bytes);
      } catch {}
    }
  }
  self.postMessage({ type: 'download-source', source: 'server' });
  return null;
}

async function loadModelPackage(file, source, sourcesUrl) {
  const cache = await self.caches?.open(CACHE_NAME).catch(() => null);
  if (!file) {
    const cached = await cache?.match(CACHE_KEY).catch(() => null);
    const cachedBytes = await cached?.arrayBuffer().catch(() => null);
    if (cachedBytes?.byteLength === MODEL_SIZE) return cachedBytes;
    if (source === 'server' || (source === 'auto' && !self.crypto?.subtle)) return null;
  }

  let bytes;
  if (file) {
    if (file.size !== MODEL_SIZE) throw new Error('模型文件大小不匹配，请导入完整的 .data 文件。');
    bytes = await verifyModelPackage(await file.arrayBuffer());
  } else if (source === 'auto') {
    bytes = await downloadAutomaticModel(sourcesUrl);
    if (!bytes) return null;
  } else if (source === 'google') {
    const url = (await fetchModelSources(sourcesUrl)).google;
    if (!url) throw new Error('Google Drive 下载线路暂不可用。');
    self.postMessage({ type: 'download-source', source });
    bytes = await verifyModelPackage(await downloadModel(url));
  } else {
    throw new Error('请先下载模型，再选择导入模型文件。');
  }

  self.postMessage({ type: 'progress', status: 'Running...' });
  try {
    if (!cache) throw new Error('Cache Storage unavailable');
    await cache.put(CACHE_KEY, new Response(file || bytes));
  } catch {
    self.postMessage({ type: 'cache-unavailable' });
  }
  return bytes;
}

async function init(file, source, sourcesUrl) {
  let modelPackage = await loadModelPackage(file, source, sourcesUrl);
  self.Module = {
    locateFile(path, scriptDirectory = "") {
      return scriptDirectory + path;
    },
    getPreloadedPackage(_name, size) {
      if (modelPackage?.byteLength !== size) return null;
      const bytes = modelPackage;
      modelPackage = null;
      return bytes;
    },
    setStatus(status) {
      self.postMessage({ type: "progress", status: status || "" });
    },
    onAbort: reportError,
    onRuntimeInitialized() {
      try {
        tts = createOfflineTts(self.Module);
        self.postMessage({
          type: "ready",
          sampleRate: tts.sampleRate,
          numSpeakers: tts.numSpeakers,
        });
      } catch (error) {
        reportError(error);
      }
    },
  };
  importScripts("sherpa-onnx-tts.js", "sherpa-onnx-wasm-main-tts.js");
}

let initializing = false;
self.onmessage = (e) => {
  const { type, id, text, sid, speed, file, source, sourcesUrl } = e.data || {};
  if (type === "init" && !initializing) {
    initializing = true;
    init(file, source, sourcesUrl).catch(reportError);
    return;
  }
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
