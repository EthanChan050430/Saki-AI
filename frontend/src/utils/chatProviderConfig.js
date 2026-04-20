export const API_CHAT_PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI',
    sub: 'ChatGPT',
    apiKeyField: 'openaiApiKey',
  },
  {
    id: 'deepseek',
    name: 'Deepseek',
    sub: '深度求索',
    apiKeyField: 'deepseekApiKey',
  },
  {
    id: 'zhipu',
    name: '智谱 AI',
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
    apiKeyField: 'moonshotApiKey',
  },
  {
    id: 'tongyi',
    name: '通义',
    sub: '阿里 Qwen',
    apiKeyField: 'tongyiApiKey',
  },
  {
    id: 'doubao',
    name: '豆包',
    sub: '字节跳动',
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
  if (!meta) return false;

  const apiKey = getProviderApiKey(config, meta.id).trim();
  if (meta.id === 'custom') {
    return Boolean(getProviderBaseUrl(config, meta.id).trim() && apiKey);
  }

  return Boolean(apiKey);
}

export function migrateApiProviderConfig(config = {}) {
  const next = { ...(config || {}) };

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

  const activeProvider = normalizeChatProviderId(next.provider);
  const activeMeta = getApiProviderMeta(activeProvider);
  const legacyApiKey = String(next.apiKey || '').trim();

  if (activeMeta && legacyApiKey && !String(next[activeMeta.apiKeyField] || '').trim()) {
    next[activeMeta.apiKeyField] = legacyApiKey;
  }

  if (activeProvider === 'custom' && !String(next.customApiBaseUrl || '').trim() && next.apiBaseUrl) {
    next.customApiBaseUrl = next.apiBaseUrl;
  }

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
