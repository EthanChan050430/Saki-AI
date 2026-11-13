export const API_CHAT_PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI',
    sub: 'ChatGPT',
    apiKeyField: 'openaiApiKey',
  },
  {
    id: 'nvidia',
    name: 'NVIDIA',
    sub: 'NVIDIA NIM',
    apiKeyField: 'nvidiaApiKey',
  },
  {
    id: 'deepseek',
    name: 'Deepseek',
    sub: '深度求索',
    subEn: 'DeepSeek',
    subJa: 'DeepSeek',
    apiKeyField: 'deepseekApiKey',
  },
  {
    id: 'zhipu',
    name: '智谱 AI',
    nameEn: 'Zhipu AI',
    nameJa: 'Zhipu AI',
    sub: 'GLM',
    apiKeyField: 'zhipuApiKey',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    sub: 'Google',
    apiKeyField: 'geminiApiKey',
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    sub: '海螺 AI',
    subEn: 'Hailuo AI',
    subJa: 'Hailuo AI',
    apiKeyField: 'minimaxApiKey',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    sub: 'Claude',
    apiKeyField: 'anthropicApiKey',
  },
  {
    id: 'moonshot',
    name: 'Moonshot AI',
    sub: '月之暗面',
    subEn: 'Moonshot',
    subJa: 'Moonshot',
    apiKeyField: 'moonshotApiKey',
  },
  {
    id: 'tongyi',
    name: '通义',
    nameEn: 'Tongyi',
    nameJa: 'Tongyi',
    sub: '阿里 Qwen',
    subEn: 'Alibaba Qwen',
    subJa: 'Alibaba Qwen',
    apiKeyField: 'tongyiApiKey',
  },
  {
    id: 'doubao',
    name: '豆包',
    nameEn: 'Doubao',
    nameJa: 'Doubao',
    sub: '字节跳动',
    subEn: 'ByteDance',
    subJa: 'ByteDance',
    apiKeyField: 'doubaoApiKey',
  },
  {
    id: 'custom',
    name: 'Custom',
    subKey: 'custom_api',
    apiKeyField: 'customApiKey',
    baseUrlField: 'customApiBaseUrl',
  },
];

export const CHAT_PROVIDER_OPTIONS = [
  { id: 'ollama', name: 'Ollama', subKey: 'local_model' },
  { id: 'lmstudio', name: 'LMStudio', subKey: 'local_model' },
  { id: 'copilot', name: 'GitHub Models', subKey: 'github_auth' },
  ...API_CHAT_PROVIDERS,
];

export const API_CHAT_PROVIDER_IDS = API_CHAT_PROVIDERS.map((provider) => provider.id);

export const MODEL_PROVIDER_ORDER = [
  'ollama',
  'lmstudio',
  'copilot',
  ...API_CHAT_PROVIDER_IDS,
];

export const API_PROVIDER_DEFAULTS = API_CHAT_PROVIDERS.reduce((defaults, provider) => {
  defaults[provider.apiKeyField] = '';
  if (provider.baseUrlField) defaults[provider.baseUrlField] = '';
  return defaults;
}, {
  showAllEnabledApiModels: false,
});

export function normalizeChatProviderId(provider = '') {
  const normalized = String(provider || '').trim().toLowerCase();
  if (!normalized) return 'ollama';
  return normalized === 'github' ? 'copilot' : normalized;
}

export function getApiProviderMeta(provider = '') {
  const normalized = normalizeChatProviderId(provider);
  return API_CHAT_PROVIDERS.find((item) => item.id === normalized) || null;
}

export function getProviderApiKey(config = {}, provider = '') {
  const meta = getApiProviderMeta(provider);
  if (!meta) return '';

  const directValue = config?.[meta.apiKeyField];
  if (directValue !== undefined && directValue !== null) {
    return String(directValue);
  }

  return meta.id === 'custom' ? String(config?.apiKey || '') : '';
}

export function getProviderBaseUrl(config = {}, provider = '') {
  const meta = getApiProviderMeta(provider);
  if (!meta?.baseUrlField) return '';

  const directValue = config?.[meta.baseUrlField];
  if (directValue !== undefined && directValue !== null) {
    return String(directValue);
  }

  return meta.id === 'custom' ? String(config?.apiBaseUrl || '') : '';
}

export function isApiProviderEnabled(config = {}, provider = '') {
  const meta = getApiProviderMeta(provider);
  return Boolean(meta && isChatProviderEnabled(config, meta.id));
}

export function isChatProviderEnabled(config = {}, provider = '') {
  const id = normalizeChatProviderId(provider);
  const enabled = config.providerEnabled?.[id];
  if (typeof enabled === 'boolean') return enabled;
  return id === 'ollama' || id === normalizeChatProviderId(config.provider);
}

export function migrateApiProviderConfig(config = {}) {
  const next = { ...(config || {}) };
  const activeProvider = normalizeChatProviderId(next.provider);
  const activeMeta = getApiProviderMeta(activeProvider);
  // Migrate credentials before supplying defaults; enablement is independent.
  if (activeMeta && next[activeMeta.apiKeyField] === undefined) {
    next[activeMeta.apiKeyField] = String(next.apiKey || '').trim();
  }

  for (const provider of API_CHAT_PROVIDERS) {
    if (next[provider.apiKeyField] === undefined) {
      next[provider.apiKeyField] = '';
    }
    if (provider.baseUrlField && next[provider.baseUrlField] === undefined) {
      next[provider.baseUrlField] = provider.id === 'custom' ? (next.apiBaseUrl || '') : '';
    }
  }

  if (next.showAllEnabledApiModels === undefined) {
    next.showAllEnabledApiModels = false;
  }
  next.providerEnabled = Object.fromEntries(CHAT_PROVIDER_OPTIONS.map(({ id }) => [id, isChatProviderEnabled(next, id)]));

  return next;
}

export function getChatProviderLabel(provider = '') {
  const normalized = normalizeChatProviderId(provider);
  if (normalized === 'ollama') return 'Ollama';
  if (normalized === 'lmstudio') return 'LMStudio';
  if (normalized === 'copilot') return 'GitHub Models';
  const apiMeta = getApiProviderMeta(normalized);
  return apiMeta?.name || normalized;
}

const pickVariant = (language, zh, en, ja) => {
  const lang = String(language || '').toLowerCase();
  if (lang.startsWith('zh')) return zh;
  if (lang.startsWith('ja')) return ja ?? en ?? zh;
  return en ?? zh;
};

/** Localized provider title for the provider picker / model list. */
export function getChatProviderName(provider = '', language = '') {
  const meta = getApiProviderMeta(provider) || CHAT_PROVIDER_OPTIONS.find((item) => item.id === normalizeChatProviderId(provider));
  if (!meta) return getChatProviderLabel(provider);
  return pickVariant(language, meta.name, meta.nameEn ?? meta.name, meta.nameJa ?? meta.nameEn ?? meta.name);
}

/** Localized provider subtitle (the muted second line under the name). */
export function getChatProviderSubtitle(provider = {}, language = '') {
  if (!provider) return '';
  if (provider.subKey) return provider.subKey;
  return pickVariant(language, provider.sub, provider.subEn ?? provider.sub, provider.subJa ?? provider.subEn ?? provider.sub);
}
