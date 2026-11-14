export function dedupeModels(items = []) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).filter(item => {
    const key = `${item?.provider || ''}:${item?.name || ''}`;
    if (!item?.provider || !item?.name || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isVisionCapableFromCapabilities(capabilities = {}) {
  const visionKeys = new Set(['vision', 'image', 'multimodal', 'multi-modal', 'input_image', 'image_input', 'vision_preview']);
  if (typeof capabilities === 'string') return visionKeys.has(capabilities.toLowerCase());
  if (Array.isArray(capabilities)) return capabilities.some(isVisionCapableFromCapabilities);
  if (!capabilities || typeof capabilities !== 'object') return false;
  return Object.entries(capabilities).some(([key, value]) => (
    (visionKeys.has(key.toLowerCase()) && value === true)
    || isVisionCapableFromCapabilities(value)
  ));
}

function inferVisionSupportFromName(model = {}) {
  const text = `${model.provider || ''} ${model.name || ''} ${model.label || ''}`.toLowerCase();
  return [
    'vision',
    'vl',
    '4o',
    'gemini',
    'llava',
    'bakllava',
    'minicpm-v',
    'minicpmv',
    'qwen-vl',
    'qwen2-vl',
    'qwen2.5-vl',
    'qwen2.5vl',
    'internvl',
    'moondream',
    'pixtral',
  ].some(keyword => text.includes(keyword));
}

export function decorateModel(model = {}) {
  const supportsVision = typeof model.supportsVision === 'boolean'
    ? model.supportsVision
    : isVisionCapableFromCapabilities(model.capabilities) || inferVisionSupportFromName(model);

  return {
    ...model,
    supportsVision,
  };
}

export function normalizeCopilotModelName(name = '') {
  if (!name) return name;
  return name.includes('/') ? name.split('/').slice(1).join('/') : name;
}

export function mapCatalogModels(items = [], provider = '') {
  return (Array.isArray(items) ? items : []).map(item => {
    if (typeof item === 'string') {
      const normalizedName = provider === 'copilot' ? normalizeCopilotModelName(item) : item;
      return decorateModel({ name: normalizedName, label: item, provider });
    }
    const targetProvider = provider || item.provider || '';
    const rawName = targetProvider === 'copilot'
      ? normalizeCopilotModelName(item.id || item.name)
      : (item.name || item.id);
    return decorateModel({
      name: rawName,
      label: item.label || item.name || item.id,
      provider: targetProvider,
      capabilities: item.capabilities || {},
      supportsVision: item.supportsVision,
    });
  }).filter(model => model.name && model.provider);
}

export function mergeModelCatalog(fresh, cached, refreshedProviders) {
  return [...fresh, ...cached.filter(model => !refreshedProviders.has(model.provider))];
}

export function applyProviderModelUpdates(currentModels = [], updatesByProvider = {}) {
  const providerEntries = Object.entries(updatesByProvider || {}).filter(([provider]) => Boolean(provider));
  if (providerEntries.length === 0) {
    return dedupeModels(Array.isArray(currentModels) ? currentModels : []);
  }
  const refreshedProviders = new Set(providerEntries.map(([provider]) => provider));
  const freshModels = providerEntries.flatMap(([provider, items]) => mapCatalogModels(items, provider));
  return dedupeModels(mergeModelCatalog(freshModels, Array.isArray(currentModels) ? currentModels : [], refreshedProviders));
}

export async function fetchProviderModels({
  backendUrl = '',
  provider = '',
  ollamaUrl = '',
  lmstudioUrl = '',
  copilotToken = '',
  baseUrl = '',
  apiKey = '',
  fetchImpl = fetch,
} = {}) {
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  let endpoint = '';

  if (normalizedProvider === 'ollama') {
    const params = new URLSearchParams();
    if (ollamaUrl) params.set('ollamaUrl', String(ollamaUrl));
    const query = params.toString();
    endpoint = `${backendUrl}/api/models${query ? `?${query}` : ''}`;
  } else if (normalizedProvider === 'lmstudio') {
    const params = new URLSearchParams();
    if (lmstudioUrl) params.set('lmstudioUrl', String(lmstudioUrl));
    const query = params.toString();
    endpoint = `${backendUrl}/api/lmstudio/models${query ? `?${query}` : ''}`;
  } else if (normalizedProvider === 'copilot') {
    const params = new URLSearchParams({ token: String(copilotToken || '') });
    endpoint = `${backendUrl}/api/github/models?${params.toString()}`;
  } else {
    const params = new URLSearchParams({
      provider: String(provider || ''),
      baseUrl: String(baseUrl || ''),
      apiKey: String(apiKey || ''),
    });
    endpoint = `${backendUrl}/api/provider/models?${params.toString()}`;
  }

  const response = await fetchImpl(endpoint);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `HTTP ${response.status}`);
  }
  if (!Array.isArray(payload)) {
    throw new Error('Invalid model catalog response');
  }
  return mapCatalogModels(payload, normalizedProvider || provider);
}

export async function fetchApiProviderModels(options = {}) {
  return fetchProviderModels(options);
}

export function startModelRefresh({ refresh, onError, window, document, intervalMs = 60000, delayMs = 250 }) {
  let stopped = false;
  let running = false;
  const run = async () => {
    if (stopped || running || document.visibilityState === 'hidden') return;
    running = true;
    try {
      await refresh();
    } catch (error) {
      onError(error);
    } finally {
      running = false;
    }
  };
  const timeout = window.setTimeout(run, delayMs);
  const interval = window.setInterval(run, intervalMs);
  window.addEventListener('focus', run);
  window.addEventListener('online', run);
  document.addEventListener('visibilitychange', run);
  return () => {
    stopped = true;
    window.clearTimeout(timeout);
    window.clearInterval(interval);
    window.removeEventListener('focus', run);
    window.removeEventListener('online', run);
    document.removeEventListener('visibilitychange', run);
  };
}
