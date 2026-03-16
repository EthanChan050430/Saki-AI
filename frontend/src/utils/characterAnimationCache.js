const ANIMATION_CACHE_NAME = 'character-animation-cache-v1';
const ANIMATION_CACHE_STATE_KEY = 'character_animation_cache_state_v1';
const ANIMATION_CACHE_VERSION = '2026-03-16-v1';

const buildFrameRange = (start, end, missing = []) => {
  const missingFrames = new Set(missing);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index).filter(
    (frame) => !missingFrames.has(frame),
  );
};

export const ANIMATION_FRAME_MANIFEST = {
  busy: buildFrameRange(0, 144),
  chuo: buildFrameRange(1, 145),
  dance: buildFrameRange(1, 145),
  hello: buildFrameRange(1, 145),
  thinking: buildFrameRange(1, 145, [30, 44, 45, 46, 79, 87, 99, 115]),
};

const playbackFramesByAnimation = new Map();
const playbackPromiseByAnimation = new Map();
let persistentCachePromise = null;
let warmupScheduled = false;

const canUseLocalStorage = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
const canUsePersistentCache = () => typeof window !== 'undefined' && 'caches' in window;

const getAnimationFrames = (type) => ANIMATION_FRAME_MANIFEST[type] || ANIMATION_FRAME_MANIFEST.hello;
const getFrameUrl = (type, frameNumber) => `/assets/animate/${type}/${frameNumber}.png`;

const decodeImage = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'sync';
    image.loading = 'eager';
    image.onload = async () => {
      try {
        if (typeof image.decode === 'function') {
          await image.decode();
        }
      } catch {}
      resolve(image);
    };
    image.onerror = () => reject(new Error(`Failed to decode frame: ${src}`));
    image.src = src;
  });

const readCacheState = () => {
  if (!canUseLocalStorage()) {
    return { version: ANIMATION_CACHE_VERSION, animations: {} };
  }

  try {
    const raw = window.localStorage.getItem(ANIMATION_CACHE_STATE_KEY);
    if (!raw) {
      return { version: ANIMATION_CACHE_VERSION, animations: {} };
    }

    const parsed = JSON.parse(raw);
    return {
      version: parsed.version || ANIMATION_CACHE_VERSION,
      animations: parsed.animations || {},
    };
  } catch (error) {
    console.warn('Failed to parse character animation cache state.', error);
    return { version: ANIMATION_CACHE_VERSION, animations: {} };
  }
};

const writeCacheState = (state) => {
  if (!canUseLocalStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(ANIMATION_CACHE_STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Failed to persist character animation cache state.', error);
  }
};

const mapWithConcurrency = async (items, concurrency, mapper) => {
  const results = new Array(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
};

const ensurePersistentCacheReady = async () => {
  if (!canUsePersistentCache()) {
    return null;
  }

  if (!persistentCachePromise) {
    persistentCachePromise = (async () => {
      const cacheState = readCacheState();
      if (cacheState.version !== ANIMATION_CACHE_VERSION) {
        await caches.delete(ANIMATION_CACHE_NAME);
        writeCacheState({ version: ANIMATION_CACHE_VERSION, animations: {} });
      }

      return caches.open(ANIMATION_CACHE_NAME);
    })();
  }

  return persistentCachePromise;
};

const getFrameResponse = async (cache, url) => {
  if (!cache) {
    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) {
      throw new Error(`Failed to fetch animation frame: ${url}`);
    }
    return response;
  }

  const cachedResponse = await cache.match(url);
  if (cachedResponse) {
    return cachedResponse;
  }

  const networkResponse = await fetch(url, { cache: 'force-cache' });
  if (!networkResponse.ok) {
    throw new Error(`Failed to fetch animation frame: ${url}`);
  }

  await cache.put(url, networkResponse.clone());
  return networkResponse;
};

const markAnimationPersisted = (type) => {
  const cacheState = readCacheState();
  writeCacheState({
    version: ANIMATION_CACHE_VERSION,
    animations: {
      ...cacheState.animations,
      [type]: {
        cachedAt: Date.now(),
        frameCount: getAnimationFrames(type).length,
      },
    },
  });
};

const isAnimationPersisted = (cacheState, type) => {
  const entry = cacheState.animations?.[type];
  return (
    cacheState.version === ANIMATION_CACHE_VERSION &&
    entry?.frameCount === getAnimationFrames(type).length
  );
};

export const loadAnimationPlaybackFrames = async (type) => {
  const normalizedType = ANIMATION_FRAME_MANIFEST[type] ? type : 'hello';

  if (playbackFramesByAnimation.has(normalizedType)) {
    return playbackFramesByAnimation.get(normalizedType);
  }

  if (playbackPromiseByAnimation.has(normalizedType)) {
    return playbackPromiseByAnimation.get(normalizedType);
  }

  const playbackPromise = (async () => {
    const frames = getAnimationFrames(normalizedType);
    const cache = await ensurePersistentCacheReady();
    const createdBlobUrls = [];

    try {
      const loadedFrames = await mapWithConcurrency(frames, 6, async (frameNumber) => {
        const frameUrl = getFrameUrl(normalizedType, frameNumber);

        if (!cache) {
          const image = await decodeImage(frameUrl);
          return { frameNumber, src: frameUrl, image };
        }

        const response = await getFrameResponse(cache, frameUrl);
        const blobUrl = URL.createObjectURL(await response.blob());
        createdBlobUrls.push(blobUrl);
        const image = await decodeImage(blobUrl);
        return { frameNumber, src: blobUrl, image };
      });

      playbackFramesByAnimation.set(normalizedType, loadedFrames);
      return loadedFrames;
    } catch (error) {
      createdBlobUrls.forEach((blobUrl) => URL.revokeObjectURL(blobUrl));
      throw error;
    }
  })();

  playbackPromiseByAnimation.set(normalizedType, playbackPromise);

  try {
    return await playbackPromise;
  } finally {
    playbackPromiseByAnimation.delete(normalizedType);
  }
};

export const releaseAnimationPlaybackFrames = (type) => {
  const frames = playbackFramesByAnimation.get(type);
  if (!frames) {
    return;
  }

  frames.forEach((frame) => {
    if (typeof frame.src === 'string' && frame.src.startsWith('blob:')) {
      URL.revokeObjectURL(frame.src);
    }
  });

  playbackFramesByAnimation.delete(type);
};

export const releaseAllAnimationPlaybackFrames = () => {
  Array.from(playbackFramesByAnimation.keys()).forEach((type) => {
    releaseAnimationPlaybackFrames(type);
  });
};

export const schedulePersistentAnimationWarmup = () => {
  if (warmupScheduled || !canUsePersistentCache()) {
    return;
  }

  warmupScheduled = true;

  const runWarmup = () => {
    (async () => {
      const cache = await ensurePersistentCacheReady();
      if (!cache) {
        return;
      }

      let cacheState = readCacheState();

      for (const type of Object.keys(ANIMATION_FRAME_MANIFEST)) {
        if (isAnimationPersisted(cacheState, type)) {
          continue;
        }

        for (const frameNumber of getAnimationFrames(type)) {
          const frameUrl = getFrameUrl(type, frameNumber);
          await getFrameResponse(cache, frameUrl);
        }

        markAnimationPersisted(type);
        cacheState = readCacheState();
      }
    })().catch((error) => {
      console.warn('Failed to warm character animation cache.', error);
    });
  };

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(runWarmup, { timeout: 1500 });
  } else {
    window.setTimeout(runWarmup, 800);
  }
};
