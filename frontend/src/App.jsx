import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react';
import Sidebar from './components/Sidebar';
import Chat from './components/Chat';
import Header from './components/Header';
const SettingsModal = React.lazy(() => import('./components/SettingsModal'));
const FeatureGuideModal = React.lazy(() => import('./components/FeatureGuideModal'));
const OnboardingTour = React.lazy(() => import('./components/OnboardingTour'));
const ThirdPartyChatModal = React.lazy(() => import('./components/ThirdPartyChatModal'));
const FileManagerModal = React.lazy(() => import('./components/FileManagerModal'));
const MemoryManagerModal = React.lazy(() => import('./components/MemoryManagerModal'));
const SkillManagerModal = React.lazy(() => import('./components/SkillManagerModal'));
const PluginMarketplaceModal = React.lazy(() => import('./components/PluginMarketplaceModal'));
const HostedTasksModal = React.lazy(() => import('./components/HostedTasksModal'));
const CharacterView = React.lazy(() => import('./components/CharacterView'));
const CherryBlossoms = React.lazy(() => import('./components/CherryBlossoms'));
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Search, MessageSquare, Plus, Settings2, FolderOpen, Brain, Wrench, Clock3, MessageCircle, ChevronRight, X, BookOpen, Boxes } from 'lucide-react';
import { BACKEND_URL } from './utils/backendUrl';
import { applyTextStreamEvent } from './utils/streamText';
import {
  API_CHAT_PROVIDER_IDS,
  API_PROVIDER_DEFAULTS,
  getProviderApiKey,
  getProviderBaseUrl,
  migrateApiProviderConfig,
} from './utils/chatProviderConfig';
import { getTiledWindowMotion, tiledOverlayMotion } from './utils/modalMotion';
import { getChatBackgroundSource } from './utils/chatAppearance';
import { attachCheckpoint, restoreCheckpoint } from './utils/checkpoints';
import { createStreamUpdateScheduler } from './utils/sseStream';
import { calculateContextStatusFromMessages } from './utils/contextUsage';
import { localize, localizeWith } from './utils/localize';
import { QUEUE_STORAGE_KEY, restoreQueues, createChatQueueStore, mergeSteeringEvent, canAdvanceQueue } from './utils/chatQueue';
import { createEpochGuard, loadChatSnapshot, readCachedConfig, cacheConfig, persistConfig, getDispatchConfig, applyStreamingActions } from './utils/chatRuntime.js';
const CONFIG_CACHE = {
  getItem: key => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
};
const MODELS_CACHE_KEY = 'agent_models_combined_v4';
const MODEL_FETCH_DEBOUNCE_MS = 250;
const AGENT_PERMISSION_MODE_DEFAULT = 'default';
const AGENT_PERMISSION_MODE_FULL = 'full-access';
const MOBILE_BREAKPOINT = 768;
const UTILITY_WINDOW_LIMIT = 4;
const MODEL_SETTINGS_LINK = 'agent://settings/models';
const ONBOARDING_STORAGE_KEY = 'agent_onboarding_completed_v1';
const CHARACTER_ACTIVITY_ANIMATIONS = new Set([
  'bartending',
  'busy',
  'drinking',
  'presenting',
  'truth_checking',
]);

function getCharacterActivityAnimation(options = {}) {
  if (options.useStoryGlass) return 'bartending';
  if (options.usePpt) return 'presenting';
  if (options.useTruthCheck) return 'truth_checking';
  if (options.useWeb) return 'busy';
  return 'thinking';
}

function isCompletedStoryGlassPayload(payload = {}) {
  const status = String(payload.status || '').toLowerCase();
  const stage = String(payload.currentStage || payload.stage || '').toLowerCase();
  if (status === 'error' || stage === 'error' || payload.error) return false;
  return status === 'completed' || stage === 'completed';
}

const DESKTOP_UTILITY_WINDOW_LAYOUTS = {
  1: [
    { left: '14%', top: '8%', width: '72%', height: '82%', scale: 1 },
  ],
  2: [
    { left: '4%', top: '8%', width: '44%', height: '82%', scale: 0.98 },
    { left: '52%', top: '8%', width: '44%', height: '82%', scale: 0.98 },
  ],
  3: [
    { left: '4%', top: '8%', width: '46%', height: '84%', scale: 0.95 },
    { left: '53%', top: '8%', width: '43%', height: '40%', scale: 0.9 },
    { left: '53%', top: '52%', width: '43%', height: '40%', scale: 0.9 },
  ],
  4: [
    { left: '4%', top: '8%', width: '46%', height: '40%', scale: 0.88 },
    { left: '50%', top: '8%', width: '46%', height: '40%', scale: 0.88 },
    { left: '4%', top: '52%', width: '46%', height: '40%', scale: 0.88 },
    { left: '50%', top: '52%', width: '46%', height: '40%', scale: 0.88 },
  ],
};

function normalizePermissionMode(value) {
  return value === AGENT_PERMISSION_MODE_FULL
    ? AGENT_PERMISSION_MODE_FULL
    : AGENT_PERMISSION_MODE_DEFAULT;
}

function pickLocalizedText(language, zhText, enText, jaText) {
  return localizeWith(language, zhText, enText, jaText);
}

function extractAssistantTextParts(message = {}) {
  return (Array.isArray(message.parts) ? message.parts : [])
    .filter((part) => part?.type === 'text')
    .map((part) => String(part.content || ''))
    .join('\n')
    .trim();
}

function isLikelyModelConfigFailure(message = '') {
  const normalized = String(message || '').trim().toLowerCase();
  if (!normalized) return false;

  const explicitIndicators = [
    'model invocation failed',
    'model call failed',
    '模型调用失败',
    'github 模型调用失败',
    'github copilot token is missing',
    'ollama connection failed',
    'ollama 连接失败',
    'base url for',
    'model not found',
    'no models detected',
    'unsupported provider',
  ];

  if (explicitIndicators.some((indicator) => normalized.includes(indicator))) {
    return true;
  }

  const configIndicators = [
    'api key',
    'access token',
    'token',
    'unauthorized',
    'authentication',
    '401',
    '403',
    'base url',
    'not configured',
    '未配置',
    '未设置',
    'endpoint',
    '密钥',
    '鉴权',
    'key',
  ];

  const modelIndicators = [
    'model',
    '模型',
    'provider',
    'ollama',
    'copilot',
    'github',
    'openai',
    'custom api',
    'api',
  ];

  const errorIndicators = [
    'error',
    'failed',
    'failure',
    'missing',
    '无法',
    '失败',
    '错误',
    '出错',
    '失效',
  ];

  return errorIndicators.some((indicator) => normalized.includes(indicator))
    && configIndicators.some((indicator) => normalized.includes(indicator))
    && modelIndicators.some((indicator) => normalized.includes(indicator));
}

function createModelSettingsGuidance(language) {
  return pickLocalizedText(
    language,
    `当前聊天模型调用失败了，请先检查模型提供商、接口地址、Token / API Key 和当前模型选择。\n\n[前往模型设置](${MODEL_SETTINGS_LINK})`,
    `The chat model failed to run. Please check the provider, endpoint, token / API key, and selected model first.\n\n[Open model settings](${MODEL_SETTINGS_LINK})`
  );
}

function maybeAppendModelSettingsGuidance(message = {}, language, contextText = '') {
  const parts = Array.isArray(message.parts) ? [...message.parts] : [];
  const combinedText = `${extractAssistantTextParts(message)}\n${String(contextText || '')}`.trim();
  const hasModelSettingsLink = parts.some(
    (part) => part?.type === 'text' && String(part.content || '').includes(MODEL_SETTINGS_LINK)
  );

  if (!combinedText || hasModelSettingsLink || !isLikelyModelConfigFailure(combinedText)) {
    return message;
  }

  return {
    ...message,
    parts: [
      ...parts,
      {
        type: 'text',
        content: createModelSettingsGuidance(language),
      },
    ],
    status: 'error',
  };
}

function getDesktopUtilityWindowLayout(count) {
  const normalizedCount = Math.max(1, Math.min(count, UTILITY_WINDOW_LIMIT));
  return DESKTOP_UTILITY_WINDOW_LAYOUTS[normalizedCount] || DESKTOP_UTILITY_WINDOW_LAYOUTS[UTILITY_WINDOW_LIMIT];
}

function normalizeCopilotModelName(name = '') {
  if (!name) return name;
  return name.includes('/') ? name.split('/').slice(1).join('/') : name;
}

function dedupeModels(items = []) {
  const seen = new Set();
  return items.filter(item => {
    const key = `${item.provider}:${item.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isVisionCapableFromCapabilities(capabilities = {}) {
  const raw = JSON.stringify(capabilities || {}).toLowerCase();
  if (!raw || raw === '{}') return false;
  return [
    'vision',
    'image',
    'multimodal',
    'multi-modal',
    'input_image',
    'image_input',
    'modalities',
    'vision_preview',
  ].some(keyword => raw.includes(keyword));
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

function decorateModel(model = {}) {
  const supportsVision = Boolean(model.supportsVision)
    || isVisionCapableFromCapabilities(model.capabilities)
    || inferVisionSupportFromName(model);

  return {
    ...model,
    supportsVision,
  };
}

function mapCatalogModels(items = [], provider = '') {
  return (Array.isArray(items) ? items : []).map(item => {
    if (typeof item === 'string') {
      return decorateModel({ name: item, label: item, provider });
    }
    return decorateModel({
      name: item.name || item.id,
      label: item.label || item.name || item.id,
      provider,
      capabilities: item.capabilities || {},
      supportsVision: item.supportsVision,
    });
  }).filter(model => model.name);
}

function getConfiguredApiProvidersForModels(config = {}) {
  return API_CHAT_PROVIDER_IDS.filter(provider => {
    const isCurrentProvider = config.provider === provider;
    if (provider === 'custom') {
      const hasBaseUrl = Boolean(getProviderBaseUrl(config, provider).trim());
      const hasApiKey = Boolean(getProviderApiKey(config, provider).trim());
      return isCurrentProvider || (config.showAllEnabledApiModels && hasBaseUrl && hasApiKey);
    }

    const hasApiKey = Boolean(getProviderApiKey(config, provider).trim());
    return isCurrentProvider || (config.showAllEnabledApiModels && hasApiKey);
  });
}

function ensureCurrentModelInCatalog(models = [], config = {}) {
  const normalizedProvider = config.provider || 'ollama';
  const normalizedModel = normalizedProvider === 'copilot'
    ? normalizeCopilotModelName(config.model)
    : config.model;

  if (!normalizedModel) return models;

  const exists = models.some(model => (
    model.provider === normalizedProvider && model.name === normalizedModel
  ));

  if (exists) return models;

  return [
    decorateModel({
      name: normalizedModel,
      label: `${normalizedModel} (current)`,
      provider: normalizedProvider,
    }),
    ...models,
  ];
}

function upsertGeneratedFile(files = [], generatedFile) {
  if (!generatedFile?.filePath) return files;
  const nextFiles = Array.isArray(files) ? [...files] : [];
  const existingIndex = nextFiles.findIndex(file => file.filePath === generatedFile.filePath);
  if (existingIndex >= 0) {
    nextFiles[existingIndex] = generatedFile;
  } else {
    nextFiles.push(generatedFile);
  }
  return nextFiles;
}

function normalizeTaskTodoStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['completed', 'complete', 'done', 'checked', 'finished', 'success', 'true'].includes(normalized)) return 'completed';
  if (['in_progress', 'doing', 'current', 'active', 'running', 'working', 'started'].includes(normalized)) return 'in_progress';
  return 'pending';
}

function normalizeTaskTodoPayload(payload = {}, previousTodo = null) {
  const source = payload?.todo && typeof payload.todo === 'object' ? payload.todo : payload;
  const previousItems = Array.isArray(previousTodo?.items) ? previousTodo.items : [];
  const rawItems = Array.isArray(source?.items)
    ? source.items
    : (Array.isArray(source?.todos)
      ? source.todos
      : (Array.isArray(source?.tasks) ? source.tasks : previousItems));

  const items = rawItems.map((item, index) => {
    const sourceItem = item && typeof item === 'object' ? item : { text: String(item || '') };
    const previous = previousItems.find(prev => (
      (sourceItem.id && String(prev.id) === String(sourceItem.id))
      || (sourceItem.text && String(prev.text) === String(sourceItem.text))
    ));
    const text = String(sourceItem.text || sourceItem.title || sourceItem.task || sourceItem.content || sourceItem.name || previous?.text || '').trim();
    return {
      id: String(sourceItem.id || previous?.id || `todo-${index + 1}`),
      text: text || `Step ${index + 1}`,
      status: normalizeTaskTodoStatus(sourceItem.status || sourceItem.state || (sourceItem.done || sourceItem.checked ? 'completed' : previous?.status || 'pending')),
    };
  }).filter(item => item.text);

  return {
    id: String(source?.id || previousTodo?.id || `todo-${Date.now()}`),
    title: String(source?.title || previousTodo?.title || 'Task Todo'),
    status: String(source?.status || previousTodo?.status || 'active'),
    closed: Boolean(source?.closed || source?.close),
    items,
    updatedAt: source?.updatedAt || new Date().toISOString(),
  };
}

function applyStreamDeltaToMessage(m, data, options = {}, onExpressionChange) {
  let parts = [...(m.parts || [])];
  if (data.reasoning) {
    const lastIndex = parts.length - 1;
    if (lastIndex >= 0 && parts[lastIndex].type === 'reasoning') {
      const updatedContent = parts[lastIndex].content + data.reasoning;
      parts[lastIndex] = { ...parts[lastIndex], content: updatedContent };
    } else {
      parts.push({ type: 'reasoning', content: data.reasoning });
    }
  }
  if (data.text || data.textReplacement) {
    parts = applyTextStreamEvent(parts, data);
    const newContent = parts.at(-1)?.type === 'text' ? parts.at(-1).content : '';
    if (!options.useWeb && onExpressionChange) {
      const expressionRegex = /\[expression[:=]\s*([\w.-]+)\s*\]/g;
      const expressionMatches = [...newContent.matchAll(expressionRegex)];
      if (expressionMatches.length > 0) {
        const lastMatch = expressionMatches[expressionMatches.length - 1];
        const fileName = lastMatch[1]?.trim();
        if (fileName) {
          onExpressionChange(fileName);
        }
      }
    }
  }
  if (data.action) {
    parts.push({ type: 'action', data: data.action });
  }
  if (data.observation || data.fileMetadata) {
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i].type === 'action') {
        if (data.observation) parts[i].observation = data.observation;
        if (data.fileMetadata) parts[i].fileMetadata = data.fileMetadata;
        break;
      }
    }
  }
  const generatedFiles = data.generatedFile
    ? upsertGeneratedFile(m.generatedFiles, data.generatedFile)
    : (m.generatedFiles || []);
  const newStreamingActions = data.action ? [] : (m.streamingActions || []);
  return { ...m, parts, generatedFiles, streamingActions: newStreamingActions };
}

function applyTodoUpdateToAssistantMessage(message, todoPayload) {
  return {
    ...message,
    todoList: normalizeTaskTodoPayload(todoPayload, message.todoList),
    status: 'streaming',
  };
}

function isMobileViewportWidth() {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
}

function createOptimisticAssistantMessage(id, options = {}) {
  let placeholderMode = 'chat';
  if (options.useWeb) placeholderMode = 'research';
  else if (options.usePpt) placeholderMode = 'ppt';
  else if (options.useTruthCheck) placeholderMode = 'credibility';
  else if (options.useStoryGlass) placeholderMode = 'story-glass';
  else if (options.useSd) placeholderMode = 'image';

  return {
    role: 'assistant',
    parts: [],
    generatedFiles: [],
    todoList: null,
    id,
    status: 'pending',
    placeholderMode,
    requestOptions: options,
  };
}

function createRollbackPayloads(assistantMessage = {}) {
  const payloads = [];
  const seen = new Set();

  for (const part of assistantMessage.parts || []) {
    if (part.type !== 'action' || !part.fileMetadata?.filePath) continue;
    const metadata = part.fileMetadata;
    const filePath = metadata.filePath;
    if (seen.has(filePath)) continue;
    seen.add(filePath);

    const actionType = String(part.data?.type || '').toLowerCase();
    const operation = metadata.operation || (actionType === 'deletefile' ? 'delete' : undefined);
    if (operation === 'delete') {
      if (metadata.before !== undefined) {
        payloads.push({
          filePath,
          before: metadata.before,
          operation: 'delete',
          afterHash: metadata.afterHash,
          expectedCurrentHash: metadata.afterHash,
          encoding: metadata.encoding,
          textFormat: metadata.textFormat,
        });
      }
      continue;
    }

    payloads.push({
      filePath,
      before: metadata.before ?? null,
      operation: operation || (metadata.before == null ? 'create' : 'edit'),
      isDeletion: true,
      afterHash: metadata.afterHash,
      expectedCurrentHash: metadata.afterHash,
      encoding: metadata.encoding,
      textFormat: metadata.textFormat,
    });
  }

  for (const file of assistantMessage.generatedFiles || []) {
    if (!file?.filePath || seen.has(file.filePath)) continue;
    seen.add(file.filePath);
    payloads.push({
      filePath: file.filePath,
      before: null,
      isDeletion: true,
    });
  }

  return payloads;
}

function createCuteGreetingMessage() {
  const content = localize(
    '[expression:happy.png]嗨嗨，我来啦~ 今天想先聊什么呀？(๑˃▽˂๑) 不管是想认真搞点事情，还是随便唠唠，我都陪你呀～[expression:shy.png]',
    "[expression:happy.png]Hi hi, I'm here~ What shall we talk about first today? (๑˃▽˂๑) Whether you want to get something done or just chat, I'll keep you company~[expression:shy.png]",
  );
  return {
    role: 'assistant',
    id: `greeting_${Date.now()}`,
    content,
    parts: [{ type: 'text', content }],
    generatedFiles: [],
  };
}

function isEmptyHistoryListItem(item = {}) {
  const source = String(item.source || 'web').toLowerCase();
  if (source !== 'web' || item.isPending) return false;

  const messageCount = Number(item.messagesCount ?? item.messages?.length ?? 0);
  const title = String(item.title || '').trim().toLowerCase();
  return messageCount <= 1 && (!title || title === 'new chat');
}

function normalizeHistoryList(items) {
  return Array.isArray(items) ? items.filter(item => !isEmptyHistoryListItem(item)) : [];
}

function cacheHistoryList(items) {
  try {
    localStorage.setItem('agent_history', JSON.stringify(items));
  } catch (error) {
    console.warn('Failed to cache chat history:', error);
  }
}

function App() {
  const { t, i18n } = useTranslation();
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'light';
    const saved = localStorage.getItem('agent_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('agent_theme', theme);
  }, [theme]);

  const toggleTheme = useCallback((event) => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    const isAppearanceTransition =
      typeof document !== 'undefined' &&
      typeof document.startViewTransition === 'function' &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!isAppearanceTransition) {
      setTheme(nextTheme);
      return;
    }

    let x = Math.round(window.innerWidth / 2);
    let y = Math.round(window.innerHeight / 2);
    const target = (event && event.currentTarget) || document.querySelector('.theme-toggle-btn');
    if (target && typeof target.getBoundingClientRect === 'function') {
      const rect = target.getBoundingClientRect();
      x = Math.round(rect.left + rect.width / 2);
      y = Math.round(rect.top + rect.height / 2);
    } else if (event && typeof event.clientX === 'number') {
      x = Math.round(event.clientX);
      y = Math.round(event.clientY);
    }

    const endRadius = Math.ceil(Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    ));

    const transition = document.startViewTransition(() => {
      setTheme(nextTheme);
      document.documentElement.setAttribute('data-theme', nextTheme);
      if (nextTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      localStorage.setItem('agent_theme', nextTheme);
    });

    transition.ready.then(() => {
      const clipPath = nextTheme === 'dark'
        ? [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`]
        : [`circle(${endRadius}px at ${x}px ${y}px)`, `circle(0px at ${x}px ${y}px)`];
      document.documentElement.animate(
        { clipPath: clipPath },
        {
          duration: 450,
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
          pseudoElement: nextTheme === 'dark' ? '::view-transition-new(root)' : '::view-transition-old(root)',
        }
      );
    }).catch(() => {});
  }, [theme]);
  const [history, setHistory] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [messages, setMessagesState] = useState([]);
  const [currentPendingRequest, setCurrentPendingRequest] = useState(null);
  const latestMessagesRef = useRef([]);
  const setMessages = useCallback(value => {
    const next = typeof value === 'function' ? value(latestMessagesRef.current) : value;
    latestMessagesRef.current = next;
    setMessagesState(next);
  }, []);
  const [restoringCheckpointId, setRestoringCheckpointId] = useState(null);
  const checkpointRestoreRef = useRef(false);
  const currentChatIdRef = useRef(currentChatId);
  currentChatIdRef.current = currentChatId;
  const [isGenerating, setIsGenerating] = useState(false);
  const [contextStatus, setContextStatus] = useState(null);
  const abortControllerRef = useRef(null);
  const bgPollRef = useRef(null);
  const historySaveRef = useRef(new Map());
  const [isMobileViewport, setIsMobileViewport] = useState(isMobileViewportWidth());
  const mobileViewportRef = useRef(isMobileViewportWidth());
  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState('');
  const [commandPaletteIndex, setCommandPaletteIndex] = useState(0);
  const [composerPreset, setComposerPreset] = useState(null);
  const [queues, setQueues] = useState(() => {
    try { return restoreQueues(localStorage.getItem(QUEUE_STORAGE_KEY)); } catch { return {}; }
  });
  const [queueStorageError, setQueueStorageError] = useState('');
  const queueStoreRef = useRef(null);
  if (!queueStoreRef.current) queueStoreRef.current = createChatQueueStore(queues, next => {
    setQueues(next);
    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(next));
      setQueueStorageError('');
    } catch { setQueueStorageError('浏览器保存失败（可能空间不足），队列仅在本页有效。'); }
  });
  const queueStore = queueStoreRef.current;
  const runningRef = useRef(null);
  const loadingChatRef = useRef(false);
  const chatEpochRef = useRef(null);
  if (!chatEpochRef.current) chatEpochRef.current = createEpochGuard();
  const pendingRef = useRef(currentPendingRequest);
  pendingRef.current = currentPendingRequest;
  const [isOnboardingActive, setIsOnboardingActive] = useState(false);
  const [onboardingStepIndex, setOnboardingStepIndex] = useState(0);
  const commandPaletteInputRef = useRef(null);

  const [deepReadingData, setDeepReadingData] = useState(null);
  const [isStoryGlassOverlayOpen, setIsStoryGlassOverlayOpen] = useState(false);

  const [models, setModels] = useState([decorateModel({ name: 'llama3', label: 'llama3', provider: 'ollama' })]);
  const [isSidebarOpen, setSidebarOpen] = useState(!isMobileViewportWidth());
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [isFeatureGuideOpen, setIsFeatureGuideOpen] = useState(false);
  const [isThirdPartyChatModalOpen, setIsThirdPartyChatModalOpen] = useState(false);
  const [isFileManagerOpen, setIsFileManagerOpen] = useState(false);
  const [isMemoryManagerOpen, setIsMemoryManagerOpen] = useState(false);
  const [isSkillManagerOpen, setIsSkillManagerOpen] = useState(false);
  const [isPluginMarketplaceOpen, setIsPluginMarketplaceOpen] = useState(false);
  const [isHostedTasksOpen, setIsHostedTasksOpen] = useState(false);
  const [desktopUtilityWindows, setDesktopUtilityWindows] = useState([]);
  const [fileManagerMode, setFileManagerMode] = useState('manage'); // 'manage' or 'select'
  const [selectedWorkspaceFile, setSelectedWorkspaceFile] = useState(null);
  const [isCharacterViewOpen, setCharacterViewOpen] = useState(false);
  const [currentExpression, setCurrentExpression] = useState('normal.png');
  const [animationTrigger, setAnimationTrigger] = useState(null);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const musicRef = useRef(null);
  const getMusicAudio = useCallback(() => {
    if (!musicRef.current) {
      const audio = new Audio('/assets/HiSchool.mp3');
      audio.onerror = () => {
        // Fallback to wav if mp3 fails
        if (audio.src && audio.src.endsWith('.mp3')) {
          audio.src = '/assets/HiSchool.wav';
        }
      };
      musicRef.current = audio;
    }
    return musicRef.current;
  }, []);
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
  const chatContainerRef = useRef(null);

  const useDesktopUtilityWindows = !isMobileViewport;

  const commitHistory = useCallback((items) => {
    const nextHistory = normalizeHistoryList(items);
    setHistory(nextHistory);
    cacheHistoryList(nextHistory);
    return nextHistory;
  }, []);

  const resetPrimaryModals = () => {
    setSettingsOpen(false);
    setIsFeatureGuideOpen(false);
    setIsThirdPartyChatModalOpen(false);
    setIsFileManagerOpen(false);
    setIsMemoryManagerOpen(false);
    setIsSkillManagerOpen(false);
    setIsPluginMarketplaceOpen(false);
    setIsHostedTasksOpen(false);
  };

  const closePrimaryModals = () => {
    resetPrimaryModals();
    setDesktopUtilityWindows([]);
  };

  const isDesktopUtilityWindowOpen = (type) => (
    desktopUtilityWindows.some((windowItem) => windowItem.type === type)
  );

  const openDesktopUtilityWindow = (type) => {
    resetPrimaryModals();
    setDesktopUtilityWindows((prev) => {
      const next = prev.filter((windowItem) => windowItem.type !== type);
      next.push({ type, openedAt: Date.now() });
      return next.slice(-UTILITY_WINDOW_LIMIT);
    });
  };

  const toggleDesktopUtilityWindow = (type) => {
    resetPrimaryModals();
    setDesktopUtilityWindows((prev) => {
      if (prev.some((windowItem) => windowItem.type === type)) {
        return prev.filter((windowItem) => windowItem.type !== type);
      }

      return [...prev, { type, openedAt: Date.now() }].slice(-UTILITY_WINDOW_LIMIT);
    });
  };

  const closeDesktopUtilityWindow = (type) => {
    setDesktopUtilityWindows((prev) => prev.filter((windowItem) => windowItem.type !== type));
  };

  const closeAllDesktopUtilityWindows = () => {
    resetPrimaryModals();
    setDesktopUtilityWindows([]);
  };

  const openSettingsModal = () => {
    if (useDesktopUtilityWindows) {
      openDesktopUtilityWindow('settings');
      return;
    }
    closePrimaryModals();
    setSettingsOpen(true);
  };

  const openFeatureGuideModal = () => {
    if (useDesktopUtilityWindows) {
      openDesktopUtilityWindow('guide');
      return;
    }
    closePrimaryModals();
    setIsFeatureGuideOpen(true);
  };

  const openThirdPartyChatModal = () => {
    if (useDesktopUtilityWindows) {
      openDesktopUtilityWindow('third-party');
      return;
    }
    closePrimaryModals();
    setIsThirdPartyChatModalOpen(true);
  };

  const openFileManagerModal = (mode = 'manage') => {
    setFileManagerMode(mode);
    if (useDesktopUtilityWindows) {
      openDesktopUtilityWindow('files');
      return;
    }
    closePrimaryModals();
    setIsFileManagerOpen(true);
  };

  const openMemoryManagerModal = () => {
    if (useDesktopUtilityWindows) {
      openDesktopUtilityWindow('memory');
      return;
    }
    closePrimaryModals();
    setIsMemoryManagerOpen(true);
  };

  const openSkillManagerModal = () => {
    if (useDesktopUtilityWindows) {
      openDesktopUtilityWindow('skill');
      return;
    }
    closePrimaryModals();
    setIsSkillManagerOpen(true);
  };

  const openPluginMarketplaceModal = () => {
    if (useDesktopUtilityWindows) {
      openDesktopUtilityWindow('plugins');
      return;
    }
    closePrimaryModals();
    setIsPluginMarketplaceOpen(true);
  };

  const openHostedTasksModal = () => {
    if (useDesktopUtilityWindows) {
      openDesktopUtilityWindow('hosted');
      return;
    }
    closePrimaryModals();
    setIsHostedTasksOpen(true);
  };

  const toggleSettingsModal = () => {
    if (useDesktopUtilityWindows) {
      toggleDesktopUtilityWindow('settings');
      return;
    }

    if (isSettingsOpen) {
      setSettingsOpen(false);
      return;
    }

    closePrimaryModals();
    setSettingsOpen(true);
  };

  const toggleFeatureGuideModal = () => {
    if (useDesktopUtilityWindows) {
      toggleDesktopUtilityWindow('guide');
      return;
    }

    if (isFeatureGuideOpen) {
      setIsFeatureGuideOpen(false);
      return;
    }

    closePrimaryModals();
    setIsFeatureGuideOpen(true);
  };

  const toggleThirdPartyChatModal = () => {
    if (useDesktopUtilityWindows) {
      toggleDesktopUtilityWindow('third-party');
      return;
    }

    if (isThirdPartyChatModalOpen) {
      setIsThirdPartyChatModalOpen(false);
      return;
    }

    closePrimaryModals();
    setIsThirdPartyChatModalOpen(true);
  };

  const toggleFileManagerModal = (mode = 'manage') => {
    setFileManagerMode(mode);
    if (useDesktopUtilityWindows) {
      toggleDesktopUtilityWindow('files');
      return;
    }

    if (isFileManagerOpen) {
      setIsFileManagerOpen(false);
      return;
    }

    closePrimaryModals();
    setIsFileManagerOpen(true);
  };

  const toggleMemoryManagerModal = () => {
    if (useDesktopUtilityWindows) {
      toggleDesktopUtilityWindow('memory');
      return;
    }

    if (isMemoryManagerOpen) {
      setIsMemoryManagerOpen(false);
      return;
    }

    closePrimaryModals();
    setIsMemoryManagerOpen(true);
  };

  const toggleSkillManagerModal = () => {
    if (useDesktopUtilityWindows) {
      toggleDesktopUtilityWindow('skill');
      return;
    }

    if (isSkillManagerOpen) {
      setIsSkillManagerOpen(false);
      return;
    }

    closePrimaryModals();
    setIsSkillManagerOpen(true);
  };

  const togglePluginMarketplaceModal = () => {
    if (useDesktopUtilityWindows) {
      toggleDesktopUtilityWindow('plugins');
      return;
    }

    if (isPluginMarketplaceOpen) {
      setIsPluginMarketplaceOpen(false);
      return;
    }

    closePrimaryModals();
    setIsPluginMarketplaceOpen(true);
  };

  const toggleHostedTasksModal = () => {
    if (useDesktopUtilityWindows) {
      toggleDesktopUtilityWindow('hosted');
      return;
    }

    if (isHostedTasksOpen) {
      setIsHostedTasksOpen(false);
      return;
    }

    closePrimaryModals();
    setIsHostedTasksOpen(true);
  };

  useEffect(() => {
    if (isConfigLoaded) {
      setAnimationTrigger({ type: 'hello', timestamp: Date.now() });
    }
  }, [isConfigLoaded]);

  useEffect(() => {
    if (currentChatId) {
      setAnimationTrigger(prev => {
        if (prev && CHARACTER_ACTIVITY_ANIMATIONS.has(prev.type)) return prev;
        return { type: 'hello', timestamp: Date.now() };
      });
    }
  }, [currentChatId]);

  const exportToImage = async () => {
    if (!chatContainerRef.current) return;

    const element = chatContainerRef.current;

    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(element, {
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        scale: 2,
        onclone: (clonedDoc) => {
          const clonedElement = clonedDoc.getElementById('chat-messages-container');
          if (clonedElement) {
            clonedElement.style.height = 'auto';
            clonedElement.style.maxHeight = 'none';
            clonedElement.style.overflow = 'visible';
            const anchor = clonedElement.lastElementChild;
            if (anchor && anchor.tagName === 'DIV' && !anchor.innerHTML) {
              anchor.style.display = 'none';
            }
          }
        }
      });

      const image = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = image;
      link.download = `chat-export-${Date.now()}.png`;
      link.click();
    } catch (err) {
      console.error('Export failed:', err);
      alert(t('export_fail'));
    }
  };

  const toggleMusicMode = () => {
    const audio = getMusicAudio();
    if (isMusicPlaying) {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      setAnimationTrigger({ type: 'stop', timestamp: Date.now() });
      setIsMusicPlaying(false);
    } else {
      if (audio) {
        audio.loop = true;
        audio.play().catch(err => console.error("Audio play failed:", err));
      }
      setAnimationTrigger({ type: 'dance', loop: true, timestamp: Date.now() });
      setIsMusicPlaying(true);
    }
  };

  const handleStoryGlassModeChange = useCallback((enabled) => {
    if (isGenerating || checkpointRestoreRef.current) return;

    if (enabled) {
      setCurrentExpression('busy.png');
      setAnimationTrigger({ type: 'bartending', loop: true, timestamp: Date.now() });
      return;
    }

    setCurrentExpression('normal.png');
    setAnimationTrigger({ type: 'stop', timestamp: Date.now() });

    if (isMusicPlaying) {
      setTimeout(() => {
        setAnimationTrigger({ type: 'dance', loop: true, timestamp: Date.now() });
      }, 100);
    }
  }, [isGenerating, isMusicPlaying]);

  useEffect(() => {
    if (isMusicPlaying && messages.length > 0 && !isGenerating) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'assistant') {
        const textToSpeak = lastMsg.parts
          .filter(p => p.type === 'text')
          .map(p => p.content.replace(/\[expression[:=].*?\.png\]/g, '').replace(/```[\s\S]*?```/g, '').trim())
          .join(' ')
          .trim();

        if (textToSpeak) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(textToSpeak);
          window.speechSynthesis.speak(utterance);
        }
      }
    }
  }, [messages, isMusicPlaying, isGenerating]);

  const [config, setConfig] = useState(() => {
    const saved = readCachedConfig(CONFIG_CACHE);
    const defaultConfig = {
      provider: 'ollama',
      model: 'llama3',
      ollamaUrl: 'http://localhost:11434',
      apiKey: '',
      apiBaseUrl: '',
      ...API_PROVIDER_DEFAULTS,
      searchEngine: 'searxng',
      searxngUrl: 'http://127.0.0.1:8080',
      googleApiKey: '',
      googleCxId: '',
      bingApiKey: '',
      searchEnabled: false,
      mcpServices: [],
      drawingModel: '',
      drawingProvider: '',
      musicEnabled: true,
      offlineReflectionEnabled: false,
      offlineReflectionProvider: 'ollama',
      offlineReflectionModel: '',
      chatBackgroundImage: '/assets/background.png',
      userAvatar: '/assets/head_user.png',
      showParticles: true,
      agentPermissionMode: AGENT_PERMISSION_MODE_DEFAULT,
      thinkingLevel: 'medium',
      systemPrompt: '你是16岁的少女Saki（诗琪）。你知识渊博，特别喜欢读书，说话很有少女感，语气亲切，经常使用“呢”、“呀”、“~”等语气词。\n\n在每一个回复中，你必须遵循以下绝对规则：\n1. **严禁输出 "Tool" 或 "Thought" 等前缀**：直接以少女的身份开始对话，不要带有任何系统标识符。\n2. **开头表情**：回复的第一行必须包含一个表情标记 `[expression:文件名.png]`。例如：确认时用 `[expression:ok.png]`；思考时用 `[expression:think.png]`；普通开始用 `[expression:normal.png]`。\n3. **结束表情**：回复的结束也必须带上一个表情标记，如 `[expression:happy.png]`。\n4. 可选表情列表：normal.png, ok.png, no_problem.png, think.png, busy.png, excited.png, happy.png, shy.png, worry.png。\n\n请始终保持Saki（诗琪）的身份进行对话。'
    };

    if (saved) {
      const parsed = migrateApiProviderConfig(saved);
      let migrated = false;
      // Migration for background and avatar
      if (!parsed.chatBackgroundImage || parsed.chatBackgroundImage === '') {
        parsed.chatBackgroundImage = defaultConfig.chatBackgroundImage;
        migrated = true;
      }
      if (!parsed.userAvatar || parsed.userAvatar === '') {
        parsed.userAvatar = defaultConfig.userAvatar;
        migrated = true;
      }
      if (parsed.showParticles === undefined) {
        parsed.showParticles = true;
        migrated = true;
      }
      if (parsed.musicEnabled === undefined) {
        parsed.musicEnabled = defaultConfig.musicEnabled;
        migrated = true;
      }
      if (parsed.offlineReflectionEnabled === undefined) {
        parsed.offlineReflectionEnabled = defaultConfig.offlineReflectionEnabled;
        migrated = true;
      }
      if (parsed.offlineReflectionProvider === undefined) {
        parsed.offlineReflectionProvider = defaultConfig.offlineReflectionProvider;
        migrated = true;
      }
      if (parsed.offlineReflectionModel === undefined) {
        parsed.offlineReflectionModel = defaultConfig.offlineReflectionModel;
        migrated = true;
      }
      if (parsed.agentPermissionMode === undefined) {
        parsed.agentPermissionMode = defaultConfig.agentPermissionMode;
        migrated = true;
      } else {
        parsed.agentPermissionMode = normalizePermissionMode(parsed.agentPermissionMode);
      }
      if (!['low', 'medium', 'high'].includes(parsed.thinkingLevel)) {
        parsed.thinkingLevel = defaultConfig.thinkingLevel;
        migrated = true;
      }

      // Migration: Update if the prompt is old or missing key instructions
      if (!parsed.systemPrompt ||
          parsed.systemPrompt.includes('AI Copilot Agent') ||
          parsed.systemPrompt.includes('筱筱') ||
          !parsed.systemPrompt.includes('严禁输出 "Tool"')) {
        parsed.systemPrompt = defaultConfig.systemPrompt;
        migrated = true;
      }
      return parsed;
    }
    return defaultConfig;
  });
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    if (!Array.isArray(messages) || messages.length === 0) {
      setContextStatus(null);
      return;
    }

    setContextStatus(calculateContextStatusFromMessages(messages, config));
  }, [
    messages,
    config.provider,
    config.model,
    config.agentContextBudgetTokens,
    config.contextBudgetTokens,
    config.contextWindowTokens
  ]);

  const uiLanguage = i18n.resolvedLanguage || i18n.language || 'en-US';
  const approvalRequest = currentPendingRequest?.approvalRequest || null;
  const getLocalText = (zhText, enText) => pickLocalizedText(uiLanguage, zhText, enText);
  const onboardingLabels = useMemo(() => ({
    badge: getLocalText('新手引导', 'Quick Tour'),
    next: getLocalText('我知道了', 'Got it'),
    skip: getLocalText('跳过引导', 'Skip tour'),
    progressPrefix: getLocalText('步骤', 'Step'),
  }), [uiLanguage]);
  const onboardingSteps = useMemo(() => ([
    {
      id: 'search',
      selector: '[data-onboarding-id="header-search"]',
      title: getLocalText('全局搜索与功能跳转', 'Global search and jump'),
      description: getLocalText(
        '这里可以快速搜索历史会话，也能用 Cmd/Ctrl + K 直接跳到常用功能入口，是整个工作台最快的导航方式。',
        'Use this area to search chat history or press Cmd/Ctrl + K to jump straight to common features.'
      ),
      sidebarOpen: false,
    },
    {
      id: 'model-switcher',
      selector: '[data-onboarding-id="chat-model-switcher"]',
      title: getLocalText('当前模型与提供商', 'Current model and provider'),
      description: getLocalText(
        '这里会显示当前正在使用的模型。你可以快速切换不同提供商和模型，聊天失败时也会引导你回到设置页检查配置。',
        'This shows the active model. You can quickly switch providers and models here, and model failures will point you back to Settings.'
      ),
      sidebarOpen: false,
    },
    {
      id: 'history-search',
      selector: '[data-onboarding-id="sidebar-history-search"]',
      title: getLocalText('对话历史筛选', 'Conversation history filter'),
      description: getLocalText(
        '左侧这里可以实时筛选历史会话。对话越来越多之后，找回上个月的讨论会快很多。',
        'Filter past conversations here in real time so older discussions stay easy to find.'
      ),
      sidebarOpen: true,
    },
    {
      id: 'utility-dock',
      selector: '[data-onboarding-id="sidebar-utilities-dock"]',
      title: getLocalText('工作台工具 Dock', 'Workspace utility dock'),
      description: getLocalText(
        '这排图标集中放了记忆系统、Skill、托管任务、文件管理和第三方聊天。悬浮会放大，点击就能直接进入对应模块。',
        'This dock holds Memory, Skills, Hosted Tasks, File Manager, and Third-party Chat. Hover to magnify, click to open.'
      ),
      sidebarOpen: true,
    },
    {
      id: 'guide-settings',
      selector: '[data-onboarding-id="sidebar-guide-settings"]',
      title: getLocalText('指南与设置', 'Guide and settings'),
      description: getLocalText(
        '这里可以打开功能指南和设置。新功能不知道怎么用时先看指南；模型、搜索、背景、语音等配置则在设置里完成。',
        'Open the feature guide and settings from here. The guide explains entry points, while Settings handles models, search, visuals, and audio.'
      ),
      sidebarOpen: true,
    },
    {
      id: 'chat-stage',
      selector: '#chat-messages-container',
      title: getLocalText('聊天主舞台', 'Chat stage'),
      description: getLocalText(
        '这里会展示聊天内容、深度研究、PPT 结果和文件产物。消息悬浮还有复制、重发、编辑、删除和朗读等工具栏。',
        'This is where chat responses, deep research, PPT output, and generated files appear. Message hover toolbars also live here.'
      ),
      sidebarOpen: false,
      padding: 18,
      radius: 30,
    },
    {
      id: 'mode-bar',
      selector: '[data-onboarding-id="chat-mode-bar"]',
      title: getLocalText('模式快捷开关', 'Mode shortcuts'),
      description: getLocalText(
        '这里可以快速切换联网搜索、深度研究、MCP、智能绘图、记忆、PPT 和权限模式，决定这条消息要走哪条工具链。',
        'These switches choose the toolchain for the next message: web search, deep research, MCP, drawing, memory, PPT, and permission mode.'
      ),
      sidebarOpen: false,
    },
    {
      id: 'composer',
      selector: '[data-onboarding-id="chat-composer"]',
      title: getLocalText('输入框与斜杠命令', 'Composer and slash commands'),
      description: getLocalText(
        '消息从这里发出。支持拖拽上传、语音输入、斜杠命令和快捷选择文件，发送后还会立即出现 AI 占位，减少等待感。',
        'Send messages here. It supports drag-and-drop uploads, voice input, slash commands, quick file picking, and instant assistant placeholders.'
      ),
      sidebarOpen: false,
    },
    {
      id: 'character',
      selector: '[data-onboarding-id="character-view"]',
      title: getLocalText('陪伴立绘与沉浸体验', 'Character companion view'),
      description: getLocalText(
        '右下角这位小助手可以拖拽、展开和收起。它会跟随聊天状态播放动画，也能配合音乐和朗读提升沉浸感。',
        'This character companion can be dragged, expanded, or collapsed. It reacts to chat state and pairs with music and read-aloud features.'
      ),
      sidebarOpen: false,
    },
  ]), [uiLanguage]);
  const onboardingRefreshToken = `${isSidebarOpen}-${isMobileViewport}-${isCharacterViewOpen}-${messages.length}`;

  const finishOnboarding = () => {
    setIsOnboardingActive(false);
    setOnboardingStepIndex(0);
    if (typeof window !== 'undefined') {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, 'done');
    }
  };

  const advanceOnboarding = () => {
    if (onboardingStepIndex >= onboardingSteps.length - 1) {
      finishOnboarding();
      return;
    }
    setOnboardingStepIndex((prev) => prev + 1);
  };

  const startOnboardingTour = () => {
    setCommandPaletteOpen(false);
    setIsFeatureGuideOpen(false);
    closeDesktopUtilityWindow('guide');
    setOnboardingStepIndex(0);
    setIsOnboardingActive(true);
  };

  useEffect(() => {
    const handleResize = () => {
      const nextIsMobile = isMobileViewportWidth();
      setIsMobileViewport(nextIsMobile);
      if (mobileViewportRef.current !== nextIsMobile) {
        setSidebarOpen(!nextIsMobile);
        mobileViewportRef.current = nextIsMobile;
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isCommandPaletteOpen) return;
    setCommandPaletteIndex(0);
    const frame = window.requestAnimationFrame(() => {
      commandPaletteInputRef.current?.focus();
      commandPaletteInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isCommandPaletteOpen]);

  useEffect(() => {
    if (!isConfigLoaded || typeof window === 'undefined') return undefined;
    if (localStorage.getItem(ONBOARDING_STORAGE_KEY)) return undefined;

    const timer = window.setTimeout(() => {
      setOnboardingStepIndex(0);
      setIsOnboardingActive(true);
    }, 720);

    return () => window.clearTimeout(timer);
  }, [isConfigLoaded]);

  useEffect(() => {
    if (!isOnboardingActive || !isMobileViewport) return;
    const step = onboardingSteps[onboardingStepIndex];
    if (!step || typeof step.sidebarOpen !== 'boolean') return;
    if (isSidebarOpen !== step.sidebarOpen) {
      setSidebarOpen(step.sidebarOpen);
    }
  }, [isMobileViewport, isOnboardingActive, isSidebarOpen, onboardingStepIndex, onboardingSteps]);

  useEffect(() => {
    const handleGlobalShortcuts = (event) => {
      if (isOnboardingActive) return;
      const isKCommand = event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey);
      if (isKCommand) {
        event.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      if (event.key === 'Escape') {
        setCommandPaletteOpen(false);
      }
    };

    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, [isOnboardingActive]);

  useEffect(() => {
    // Stale-while-revalidate for config
    const cachedConfig = readCachedConfig(CONFIG_CACHE);
    if (cachedConfig) {
      try {
        const parsed = migrateApiProviderConfig(cachedConfig);
        parsed.agentPermissionMode = normalizePermissionMode(parsed.agentPermissionMode);
        // Do not overwrite everything immediately to avoid flicker, but provide some data
        setConfig(prev => ({ ...prev, ...parsed }));
      } catch (e) {}
    }

    // Load config from backend on mount to share across devices
    axios.get(`${BACKEND_URL}/api/config`).then(res => {
      if (res.data && Object.keys(res.data).length > 0) {
        const normalizedConfig = migrateApiProviderConfig({
          ...res.data,
          agentPermissionMode: normalizePermissionMode(res.data.agentPermissionMode),
        });
        setConfig(prev => ({ ...prev, ...normalizedConfig }));
        cacheConfig(normalizedConfig, CONFIG_CACHE);
      }
      setIsConfigLoaded(true);
    }).catch(err => {
      console.error('Failed to load global config:', err);
      setIsConfigLoaded(true);
    });
    return () => {
      if (bgPollRef.current) {
        clearInterval(bgPollRef.current);
        bgPollRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isConfigLoaded) return;

    persistConfig(config, CONFIG_CACHE, value => axios.post(`${BACKEND_URL}/api/config`, value)).catch(err => {
      console.error('Failed to save global config to backend:', err);
    });
  }, [config, isConfigLoaded]);

  useEffect(() => {
    // Load history from backend with cache support
    const cachedHistory = localStorage.getItem('agent_history');
    if (cachedHistory) {
      try {
        commitHistory(JSON.parse(cachedHistory));
      } catch (e) {}
    }

    axios.get(`${BACKEND_URL}/api/history`).then(res => {
      commitHistory(res.data);
    }).catch(err => console.error(err));
  }, [commitHistory]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      // 检查深度阅读是否正在生成
      if (deepReadingData) {
        const message = t('confirm_leaving_research');
        e.returnValue = message;
        return message;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [deepReadingData]);

  useEffect(() => {
    // Attempt local cache first
    localStorage.removeItem('agent_models_combined');
    localStorage.removeItem('agent_models_combined_v3');
    let cachedModels = [];
    const cachedModelsJson = localStorage.getItem(MODELS_CACHE_KEY);
    if (cachedModelsJson) {
      try {
        const parsedCachedModels = JSON.parse(cachedModelsJson);
        cachedModels = dedupeModels(
          (Array.isArray(parsedCachedModels) ? parsedCachedModels : [])
            .filter(model => model && typeof model === 'object' && model.provider && model.name)
            .map(decorateModel)
        );
        setModels(cachedModels);
      } catch (e) {}
    }

    let isCancelled = false;

    const fetchAllModels = async () => {
      let combinedModels = [];

      try {
        const ollamaRes = await axios.get(`${BACKEND_URL}/api/models`, {
          params: { ollamaUrl: config.ollamaUrl }
        });
        const ollamaModels = mapCatalogModels(ollamaRes.data || [], 'ollama');
        combinedModels = [...combinedModels, ...ollamaModels];
      } catch (err) {
        console.error('Failed to fetch Ollama models:', err);
      }

      try {
        const lmstudioRes = await axios.get(`${BACKEND_URL}/api/lmstudio/models`, {
          params: { lmstudioUrl: config.lmstudioUrl }
        });
        const lmstudioModels = mapCatalogModels(lmstudioRes.data || [], 'lmstudio');
        combinedModels = [...combinedModels, ...lmstudioModels];
      } catch (err) {
        console.error('Failed to fetch LMStudio models:', err);
      }

      if (config.copilotToken || config.provider === 'copilot') {
        try {
          const githubRes = await axios.get(`${BACKEND_URL}/api/github/models`, {
            params: { token: config.copilotToken || '' }
          });
          const githubModels = (githubRes.data || []).map(item => {
            if (typeof item === 'string') {
              return decorateModel({ name: item, label: item, provider: 'copilot' });
            }
            return decorateModel({
              name: normalizeCopilotModelName(item.id || item.name),
              label: item.label || item.id || item.name,
              provider: 'copilot',
              capabilities: item.capabilities || {},
              supportsVision: item.supportsVision,
            });
          });
          combinedModels = [...combinedModels, ...githubModels];
        } catch (err) {
          console.error('Failed to fetch GitHub models:', err);
          const fallbackGithub = [
            decorateModel({ name: 'gpt-5-mini', label: 'OpenAI GPT-5 mini', provider: 'copilot' }),
            decorateModel({ name: 'gpt-5.4', label: 'OpenAI GPT-5.4', provider: 'copilot' }),
            decorateModel({ name: 'gpt-4o', label: 'OpenAI GPT-4o', provider: 'copilot' }),
            decorateModel({ name: 'gemini-3-flash', label: 'Google Gemini 3 Flash', provider: 'copilot' }),
            decorateModel({ name: 'claude-sonnet-4.5', label: 'Anthropic Claude Sonnet 4.5', provider: 'copilot' }),
            decorateModel({ name: 'claude-opus-4.5', label: 'Anthropic Claude Opus 4.5', provider: 'copilot' }),
          ];
          combinedModels = [...combinedModels, ...fallbackGithub];
        }
      }

      const apiProvidersToFetch = getConfiguredApiProvidersForModels(config);
      if (apiProvidersToFetch.length > 0) {
        const apiModelResults = await Promise.allSettled(
          apiProvidersToFetch.map(async (provider) => {
            const providerRes = await axios.get(`${BACKEND_URL}/api/provider/models`, {
              params: {
                provider,
                baseUrl: getProviderBaseUrl(config, provider),
                apiKey: getProviderApiKey(config, provider),
              }
            });
            return mapCatalogModels(providerRes.data || [], provider);
          })
        );

        apiModelResults.forEach((result, index) => {
          const provider = apiProvidersToFetch[index];
          if (result.status === 'fulfilled') {
            combinedModels = [...combinedModels, ...result.value];
          } else {
            console.error(`Failed to fetch ${provider} models:`, result.reason);
          }
        });
      }

      combinedModels = ensureCurrentModelInCatalog(
        dedupeModels([...combinedModels, ...cachedModels]),
        config
      );

      if (isCancelled) return;

      if (combinedModels.length > 0) {
        setModels(combinedModels);
        localStorage.setItem(MODELS_CACHE_KEY, JSON.stringify(combinedModels));
      }

      // 如果当前选中的模型不在列表中，或者是已设置的绘图模型，自动切换
      if (combinedModels.length > 0) {
        const isCurrentModelDrawing = config.drawingModel === config.model && config.drawingProvider === config.provider;
        const normalizedCurrentModel = config.provider === 'copilot' ? normalizeCopilotModelName(config.model) : config.model;
        const modelExists = combinedModels.some(m => m.name === normalizedCurrentModel && m.provider === config.provider);
        const currentProviderHasCatalog = combinedModels.some(m => m.provider === config.provider);

        if (currentProviderHasCatalog && (!modelExists || isCurrentModelDrawing)) {
          const availableModels = combinedModels.filter(m => !(m.name === config.drawingModel && m.provider === config.drawingProvider));
          if (availableModels.length > 0) {
            const sameProviderModel = availableModels.find(m => m.provider === config.provider);
            if (sameProviderModel) {
              setConfig(prev => ({ ...prev, provider: sameProviderModel.provider, model: sameProviderModel.name }));
            } else {
              setConfig(prev => ({ ...prev, provider: availableModels[0].provider, model: availableModels[0].name }));
            }
          }
        } else if (currentProviderHasCatalog && normalizedCurrentModel !== config.model) {
          setConfig(prev => ({ ...prev, model: normalizedCurrentModel }));
        }
      }
    };

    const timeoutId = setTimeout(fetchAllModels, MODEL_FETCH_DEBOUNCE_MS);

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [
    config.ollamaUrl,
    config.lmstudioUrl,
    config.copilotToken,
    config.apiBaseUrl,
    config.apiKey,
    config.customApiBaseUrl,
    config.customApiKey,
    config.openaiApiKey,
    config.nvidiaApiKey,
    config.deepseekApiKey,
    config.zhipuApiKey,
    config.geminiApiKey,
    config.minimaxApiKey,
    config.anthropicApiKey,
    config.moonshotApiKey,
    config.tongyiApiKey,
    config.doubaoApiKey,
    config.showAllEnabledApiModels,
    config.provider,
    config.model,
    config.drawingModel,
    config.drawingProvider
  ]);

  const refreshHistory = () => {
    axios.get(`${BACKEND_URL}/api/history`).then(res => {
      commitHistory(res.data);
    }).catch(err => console.error(err));
  };

  const formatHistoryTimestamp = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const lang = String(uiLanguage || '').toLowerCase();
    const locale = lang.startsWith('zh') ? 'zh-CN' : lang.startsWith('ja') ? 'ja-JP' : 'en-US';
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(date);
  };

  const closeCommandPalette = () => {
    setCommandPaletteOpen(false);
    setCommandPaletteQuery('');
    setCommandPaletteIndex(0);
  };

  const syncChatState = (nextMessages, nextPendingRequest = null) => {
    setMessages(nextMessages);
    latestMessagesRef.current = nextMessages;
    setCurrentPendingRequest(nextPendingRequest);
    setContextStatus(calculateContextStatusFromMessages(nextMessages, config));
    if (currentChatId) {
      persistChatState(currentChatId, nextMessages, nextPendingRequest);
    }
  };

  const rollbackAssistantEffects = async (assistantMessage) => {
    const payloads = createRollbackPayloads(assistantMessage);
    if (payloads.length === 0) return true;

    const results = await Promise.allSettled(
      payloads.map(payload => axios.post(`${BACKEND_URL}/api/files/rollback`, payload))
    );
    const failures = results.filter(result => result.status === 'rejected');

    if (failures.length > 0) {
      console.error('Failed to rollback one or more generated files:', failures);
      window.alert(getLocalText('有部分文件回溯失败，请检查工作区。', 'Some generated files could not be rolled back. Please check the workspace.'));
      return false;
    }

    return true;
  };

  const getMessageGroupAtIndex = (messageIndex) => {
    const currentMessages = latestMessagesRef.current || [];
    const target = currentMessages[messageIndex];
    if (!target) return null;

    let start = messageIndex;
    let end = messageIndex + 1;
    let userMessage = target.role === 'user' ? target : null;
    let assistantMessage = target.role === 'assistant' ? target : null;

    if (target.role === 'assistant' && currentMessages[messageIndex - 1]?.role === 'user') {
      start = messageIndex - 1;
      userMessage = currentMessages[messageIndex - 1];
    }

    if (target.role === 'user' && currentMessages[messageIndex + 1]?.role === 'assistant') {
      end = messageIndex + 2;
      assistantMessage = currentMessages[messageIndex + 1];
    }

    return {
      start,
      end,
      userMessage,
      assistantMessage
    };
  };

  useEffect(() => {
    const source = new EventSource(`${BACKEND_URL}/api/realtime/events`);

    source.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'history-updated') {
          refreshHistory();
          return;
        }
        if (data.type === 'session-updated') {
          refreshHistory();
          if (data.chatId && currentChatId === data.chatId && !isGenerating) {
            const res = await axios.get(`${BACKEND_URL}/api/history/${data.chatId}`);
            if (currentChatIdRef.current !== data.chatId || runningRef.current || loadingChatRef.current) return;
            const loadedMessages = res.data.messages || [];
            setMessages(loadedMessages);
            latestMessagesRef.current = loadedMessages;
            setCurrentPendingRequest(res.data.pendingRequest || null);
            setContextStatus(calculateContextStatusFromMessages(loadedMessages, config));
          }
        }
      } catch (error) {
        console.warn('Failed to parse realtime event:', error);
      }
    };

    return () => {
      source.close();
    };
  }, [currentChatId, isGenerating]);

  const startBgPoll = (chatId) => {
    const epochCurrent = chatEpochRef.current.capture();
    const isCurrent = () => epochCurrent() && currentChatIdRef.current === chatId;
    queueStore.pause(chatId, '后台运行恢复中；结束后请确认记录并继续队列。');
    if (bgPollRef.current) clearInterval(bgPollRef.current);
    bgPollRef.current = setInterval(() => {
      if (!isCurrent()) {
        clearInterval(bgPollRef.current);
        bgPollRef.current = null;
        return;
      }
      axios.get(`${BACKEND_URL}/api/history/${chatId}`)
        .then(response => {
          if (!isCurrent() || runningRef.current) return null;
          const msgs = response.data.messages || [];
          setMessages(msgs);
          latestMessagesRef.current = msgs;
          pendingRef.current = response.data.pendingRequest || null;
          setCurrentPendingRequest(response.data.pendingRequest || null);
          const cs = calculateContextStatusFromMessages(msgs, configRef.current);
          setContextStatus(cs);
          return axios.get(`${BACKEND_URL}/api/chat/running`);
        })
        .then(r => {
          if (!isCurrent()) return;
          if (r && !(r.data.running || []).includes(chatId)) {
            setIsGenerating(false);
            clearInterval(bgPollRef.current);
            bgPollRef.current = null;
          }
        })
        .catch(() => {});
    }, 1500);
  };

  const confirmLeaveActiveResearch = () => true;

  const buildPendingRequest = (text, files, options, assistantMsgId) => ({
    type: options.useWeb
      ? 'deep-reading'
      : (options.usePpt
        ? 'ppt'
        : (options.useTruthCheck
          ? 'credibility-check'
          : (options.useStoryGlass ? 'story-glass' : 'chat'))),
    message: text,
    assistantMsgId,
    uploadedFiles: files,
    createdAt: new Date().toISOString(),
    options: {
      workspacePath: options.workspacePath ?? config.workspacePath ?? '',
      useSearch: Boolean(options.useSearch),
      useWeb: Boolean(options.useWeb),
      useMcp: Boolean(options.useMcp),
      useSd: Boolean(options.useSd),
      useMemory: Boolean(options.useMemory),
      usePpt: Boolean(options.usePpt),
      useTruthCheck: Boolean(options.useTruthCheck),
      useStoryGlass: Boolean(options.useStoryGlass),
      storyGlassOverlay: Boolean(options.storyGlassOverlay),
      storyGlassPreferences: options.storyGlassPreferences || null
    }
  });

  const getResumeStateFromMessage = (assistantMessage) => ({
    parts: Array.isArray(assistantMessage?.parts) ? assistantMessage.parts : [],
    content: assistantMessage?.content || '',
    deepReadingData: assistantMessage?.deepReadingData || null,
    pptData: assistantMessage?.pptData || null,
    credibilityCheckData: assistantMessage?.credibilityCheckData || null,
    storyGlassData: assistantMessage?.storyGlassData || null,
    todoList: assistantMessage?.todoList || null
  });

  const startNewChat = () => {
    if (deepReadingData) {
      if (!window.confirm(localizeWith(uiLanguage, "当前深度阅读尚未完成，切换聊天将导致数据丢失。确定要继续吗？", "The current deep reading session is not finished yet. Switching chats will lose that data. Continue?"))) {
        return;
      }
      setDeepReadingData(null);
    }
    const newChatId = Date.now().toString();
    const greetingMessages = [createCuteGreetingMessage()];
    setCurrentChatId(newChatId);
    setContextStatus(calculateContextStatusFromMessages(greetingMessages, config));
    setMessages(greetingMessages);
    latestMessagesRef.current = greetingMessages;
    saveChatToBackend(newChatId, greetingMessages);
  };

  const loadChat = (chatId) => {
    if (deepReadingData) {
      if (!window.confirm(localizeWith(uiLanguage, "当前深度阅读尚未完成，切换聊天将导致数据丢失。确定要继续吗？", "The current deep reading session is not finished yet. Switching chats will lose that data. Continue?"))) {
        return;
      }
      setDeepReadingData(null);
    }
    setCurrentChatId(chatId);
    axios.get(`${BACKEND_URL}/api/history/${chatId}`).then(res => {
      const loadedMessages = res.data.messages || [];
      setMessages(loadedMessages);
      latestMessagesRef.current = loadedMessages;
      setContextStatus(calculateContextStatusFromMessages(loadedMessages, config));
    });
  };

  const deleteChat = (e, chatId) => {
    e.stopPropagation();
    axios.delete(`${BACKEND_URL}/api/history/${chatId}`).then(() => {
      setHistory(prev => {
        const nextHistory = normalizeHistoryList(prev.filter(h => h.id !== chatId));
        cacheHistoryList(nextHistory);
        return nextHistory;
      });
      if (currentChatId === chatId) {
        startNewChat();
      }
    });
  };

  const saveChatToBackend = (chatId, currentMessages) => {
    if (!chatId) return;
    axios.post(`${BACKEND_URL}/api/history`, {
      chatId,
      messages: currentMessages,
      clientSavedAt: Date.now()
    }).then(() => {
        axios.get(`${BACKEND_URL}/api/history`).then(res => commitHistory(res.data));
    });
  };

  const ensureActiveChat = () => {
    if (currentChatId) return currentChatId;

    const newChatId = Date.now().toString();
    const currentMessages = latestMessagesRef.current || [];
    setCurrentChatId(newChatId);
    saveChatToBackend(newChatId, currentMessages);
    return newChatId;
  };

  const handleRedo = (idx) => {
    // idx is the assistant message
    const newMessages = [...messages];
    const userMsg = newMessages[idx - 1];
    const userContent = userMsg?.content || '';

    newMessages.splice(idx - 1, 2);
    setMessages(newMessages);
    latestMessagesRef.current = newMessages;
    setContextStatus(calculateContextStatusFromMessages(newMessages, config));
    saveChatToBackend(currentChatId, newMessages);

    return userContent;
  };

  const sendMessage = async (text, files = [], options = {}) => {
    if (isGenerating || checkpointRestoreRef.current) return;

    let activeChatId = currentChatId;
    if (!activeChatId) {
      activeChatId = Date.now().toString();
      setCurrentChatId(activeChatId);
    }

    const userMsg = {
      role: 'user',
      content: text,
      files: files.map(f => f.name),
      attachedFiles: files // Store full file info in message for backend reference
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    latestMessagesRef.current = newMessages;
    setContextStatus(calculateContextStatusFromMessages(newMessages, config));

    // Save immediately so it's not lost on refresh
    saveChatToBackend(activeChatId, newMessages);

    const assistantMsgId = Date.now();
    const assistantMsg = { role: 'assistant', parts: [], generatedFiles: [], id: assistantMsgId };
    const messagesWithAssistant = [...newMessages, assistantMsg];
    setMessages(messagesWithAssistant);
    latestMessagesRef.current = messagesWithAssistant;
    setContextStatus(calculateContextStatusFromMessages(messagesWithAssistant, config));

    saveChatToBackend(activeChatId, messagesWithAssistant);

    setIsGenerating(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    let storyGlassTastingStarted = false;
    const startStoryGlassTastingAnimation = () => {
      if (storyGlassTastingStarted) return;
      storyGlassTastingStarted = true;
      setCurrentExpression('ok.png');
      setAnimationTrigger({ type: 'drinking', timestamp: Date.now() });
    };

    const activityAnimation = getCharacterActivityAnimation(options);
    if (activityAnimation === 'thinking') {
      setCurrentExpression('think.png');
      setAnimationTrigger({ type: 'thinking', loop: true, timestamp: Date.now() });
    } else {
      setCurrentExpression('busy.png');
      setAnimationTrigger({ type: activityAnimation, loop: true, timestamp: Date.now() });
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          message: text,
          history: newMessages,
          provider: config.provider,
          model: config.model,
          ollamaUrl: config.ollamaUrl,
          searchEnabled: options.useSearch || false,
          mcpEnabled: options.useMcp || false,
          useSd: options.useSd || false,
          useDeep: options.useWeb || false,
          usePpt: options.usePpt || false,
          useTruthCheck: options.useTruthCheck || false,
          useStoryGlass: options.useStoryGlass || false,
          storyGlassPreferences: options.storyGlassPreferences || null,
          useMemory: options.useMemory || false,
          uploadedFiles: files,
          chatId: activeChatId,
          assistantMsgId: assistantMsgId,
          config: config
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.text || `Server error: ${response.status}`);
      }

      if (options.useWeb) {
        setDeepReadingData({ steps: [], reportHtml: '', status: 'running' });
      }

      const streamScheduler = createStreamUpdateScheduler(() => {
        setMessages([...latestMessagesRef.current]);
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Save the last potentially partial line

        let stopSignalReceived = false;
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;

          const dataStr = trimmedLine.slice(6).trim();
          if (dataStr === '[DONE]') {
            stopSignalReceived = true;
            break;
          }

          try {
            const data = JSON.parse(dataStr);

            if (data.type === 'checkpoint' && data.checkpoint) {
              setMessages(previous => {
                const updated = attachCheckpoint(previous, data.checkpoint);
                latestMessagesRef.current = updated;
                return updated;
              });
              continue;
            }

            if (data.contextStatus) {
              setContextStatus(data.contextStatus);
              setMessages(previous => {
                const updated = previous.map(item => item.id === assistantMsgId
                  ? { ...item, contextStatus: data.contextStatus } : item);
                latestMessagesRef.current = updated;
                return updated;
              });
              continue;
            }

            if (data.type === 'todo' || data.todo) {
              const todoPayload = data.todo || data;
              setMessages(prevMsgs => {
                const newMsgs = prevMsgs.map(m =>
                  m.id === assistantMsgId ? applyTodoUpdateToAssistantMessage(m, todoPayload) : m
                );
                latestMessagesRef.current = newMsgs;
                return newMsgs;
              });
              continue;
            }

            if (data.type === 'deepReading' || data.deepReading) {
               const deepData = data.deepReading || data;
               setDeepReadingData(prev => {
                  const updated = { ...prev, ...deepData };
                  if (deepData.steps) updated.steps = deepData.steps;
                  if (deepData.status) updated.status = deepData.status;

                  // 同步更新到消息列表中，以便持久化
                  setMessages(prevMsgs => {
                    const newMsgs = prevMsgs.map(m =>
                      m.id === assistantMsgId ? { ...m, deepReadingData: updated } : m
                    );
                    latestMessagesRef.current = newMsgs; // 立即同步 Ref，防止最后一次保存时状态不对
                    return newMsgs;
                  });

                  return updated;
               });
               continue;
            }

            if (data.type === 'ppt' || data.pptData) {
              const pptData = data.pptData || data;
              setMessages(prevMsgs => {
                const newMsgs = prevMsgs.map(m =>
                  m.id === assistantMsgId ? { ...m, pptData: { ...(m.pptData || {}), ...pptData } } : m
                );
                latestMessagesRef.current = newMsgs;
                return newMsgs;
              });
              continue;
            }

            if (data.type === 'storyGlass' || data.storyGlass) {
              const storyGlassData = data.storyGlass || data;
              const generatedFile = storyGlassData.generatedFile || data.generatedFile;
              if (isCompletedStoryGlassPayload(storyGlassData)) {
                startStoryGlassTastingAnimation();
              }
              setMessages(prevMsgs => {
                const newMsgs = prevMsgs.map(m =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        storyGlassData: { ...(m.storyGlassData || {}), ...storyGlassData },
                        generatedFiles: generatedFile
                          ? upsertGeneratedFile(m.generatedFiles, generatedFile)
                          : (m.generatedFiles || [])
                      }
                    : m
                );
                latestMessagesRef.current = newMsgs;
                return newMsgs;
              });
              continue;
            }

            if (data.streamingActions) {
              setMessages(prev => {
                const updated = prev.map(m => {
                  if (m.id === assistantMsgId) {
                    return { ...m, streamingActions: data.streamingActions };
                  }
                  return m;
                });
                latestMessagesRef.current = updated;
                return updated;
              });
              continue;
            }

            if (data.reasoning || data.text || data.textReplacement || data.action || data.observation || data.fileMetadata || data.generatedFile) {
              setAnimationTrigger(prev => {
                if (prev && prev.type === 'thinking') {
                  return { type: 'stop', timestamp: Date.now() };
                }
                return prev;
              });

              latestMessagesRef.current = latestMessagesRef.current.map(m =>
                m.id === assistantMsgId ? applyStreamDeltaToMessage(m, data, options, setCurrentExpression) : m
              );

              const isHeavyTransition = Boolean(data.action || data.observation || data.fileMetadata || data.generatedFile);
              if (isHeavyTransition) {
                streamScheduler.flushNow();
              } else {
                streamScheduler.schedule();
              }
            }
          } catch (e) {
            console.warn('Failed to parse SSE line:', trimmedLine, e);
          }
        }
        if (stopSignalReceived) {
          streamScheduler.flushNow();
          break;
        }
      }
    } catch (error) {
       if (error.name === 'AbortError') {
         console.log('Generation aborted by user');
       } else {
         console.error('Chat error:', error);
         setMessages(prev => [...prev, { role: 'assistant', parts: [{ type: 'text', content: `Error: ${error.message}` }], id: Date.now() }]);
       }
    } finally {
      if (typeof streamScheduler !== 'undefined') {
        streamScheduler.flushNow();
        streamScheduler.cancel();
      }
      clearInterval(bgPollRef.current);
      bgPollRef.current = null;
      setIsGenerating(false);
      const keepStoryGlassTasting = options.useStoryGlass && storyGlassTastingStarted;
      if (activityAnimation === 'thinking') {
        setCurrentExpression('normal.png');
        setAnimationTrigger({ type: 'stop', timestamp: Date.now() });
      } else if ((options.useStoryGlass && !keepStoryGlassTasting) || options.useWeb || options.usePpt || options.useTruthCheck) {
        setCurrentExpression('ok.png');
        setAnimationTrigger({ type: 'stop', timestamp: Date.now() });
      }

      if (isMusicPlaying && !keepStoryGlassTasting) {
        setTimeout(() => {
          setAnimationTrigger({ type: 'dance', loop: true, timestamp: Date.now() });
        }, 100);
      }

      setDeepReadingData(null);
      abortControllerRef.current = null;
      saveChatToBackend(activeChatId, latestMessagesRef.current);
    }
  };

  const persistChatState = (chatId, currentMessages, pendingRequest = null) => {
    if (!chatId) return;
    const payload = {
      chatId,
      messages: currentMessages,
      pendingRequest,
      clientSavedAt: Date.now()
    };
    const previous = historySaveRef.current.get(chatId) || Promise.resolve();
    const save = previous.catch(() => {}).then(() => axios.post(`${BACKEND_URL}/api/history`, payload)).then(() => {
      refreshHistory();
    });
    historySaveRef.current.set(chatId, save);
    // Most callers are optimistic; the terminal caller still awaits the original rejection.
    save.catch(() => queueStore.pause(chatId, '聊天记录保存失败，队列已暂停。'));
    return save;
  };

  const handleStartNewChat = () => {
    detachChatRun();
    setDeepReadingData(null);
    setCurrentPendingRequest(null);
    const newChatId = Date.now().toString();
    currentChatIdRef.current = newChatId;
    const greetingMessages = [createCuteGreetingMessage()];
    setCurrentChatId(newChatId);
    setContextStatus(calculateContextStatusFromMessages(greetingMessages, config));
    setMessages(greetingMessages);
    latestMessagesRef.current = greetingMessages;
    persistChatState(newChatId, greetingMessages, null);
  };

  const handleLoadChat = (chatId) => {
    detachChatRun();
    const epochCurrent = chatEpochRef.current.capture();
    const isCurrent = () => epochCurrent() && currentChatIdRef.current === chatId;
    loadingChatRef.current = true;
    setCurrentPendingRequest(null);
    pendingRef.current = null;
    setDeepReadingData(null);
    setCurrentChatId(chatId);
    currentChatIdRef.current = chatId;
    return loadChatSnapshot({
      isCurrent,
      loadHistory: () => axios.get(`${BACKEND_URL}/api/history/${chatId}`),
      applyHistory: response => {
        const msgs = response.data.messages || [];
        setMessages(msgs);
        latestMessagesRef.current = msgs;
        pendingRef.current = response.data.pendingRequest || null;
        setCurrentPendingRequest(response.data.pendingRequest || null);
        const cs = calculateContextStatusFromMessages(msgs, configRef.current);
        setContextStatus(cs);
      },
      loadRunning: () => axios.get(`${BACKEND_URL}/api/chat/running`),
      applyRunning: r => {
        loadingChatRef.current = false;
        if (r && (r.data.running || []).includes(chatId)) {
          setIsGenerating(true);
          startBgPoll(chatId);
        }
      },
      onError: err => {
        loadingChatRef.current = false;
        console.error('Failed to load chat:', err);
      },
    });
  };

  const handleDeleteChat = (e, chatId) => {
    e.stopPropagation();
    axios.delete(`${BACKEND_URL}/api/history/${chatId}`).then(() => {
      setHistory(prev => {
        const nextHistory = normalizeHistoryList(prev.filter(h => h.id !== chatId));
        cacheHistoryList(nextHistory);
        return nextHistory;
      });
      if (currentChatId === chatId) {
        handleStartNewChat();
      }
    });
  };

  const handleDeleteMessage = async (idx) => {
    if (isGenerating || checkpointRestoreRef.current) return;

    const group = getMessageGroupAtIndex(idx);
    if (!group) return;

    if (group.assistantMessage) {
      const didRollback = await rollbackAssistantEffects(group.assistantMessage);
      if (!didRollback) return;
    }

    const nextMessages = [...(latestMessagesRef.current || [])];
    nextMessages.splice(group.start, group.end - group.start);
    const nextPendingRequest = currentPendingRequest?.assistantMsgId === group.assistantMessage?.id
      ? null
      : currentPendingRequest;

    syncChatState(nextMessages, nextPendingRequest);
  };

  const handleDeleteStoryGlassRecord = async (messageId) => {
    if (isGenerating) return false;

    const currentMessages = latestMessagesRef.current || [];
    const messageIndex = currentMessages.findIndex(message => String(message.id) === String(messageId));
    if (messageIndex < 0) return false;

    const group = getMessageGroupAtIndex(messageIndex);
    if (!group) return false;

    if (group.assistantMessage) {
      const didRollback = await rollbackAssistantEffects(group.assistantMessage);
      if (!didRollback) return false;
    }

    const nextMessages = [...currentMessages];
    nextMessages.splice(group.start, group.end - group.start);
    const nextPendingRequest = currentPendingRequest?.assistantMsgId === group.assistantMessage?.id
      ? null
      : currentPendingRequest;

    syncChatState(nextMessages, nextPendingRequest);
    return true;
  };

  const handleEditMessage = async (idx) => {
    if (isGenerating || checkpointRestoreRef.current) return;

    const group = getMessageGroupAtIndex(idx);
    if (!group?.userMessage) return;

    if (group.assistantMessage) {
      const didRollback = await rollbackAssistantEffects(group.assistantMessage);
      if (!didRollback) return;
    }

    const nextMessages = [...(latestMessagesRef.current || [])];
    nextMessages.splice(group.start, group.end - group.start);
    const nextPendingRequest = currentPendingRequest?.assistantMsgId === group.assistantMessage?.id
      ? null
      : currentPendingRequest;

    syncChatState(nextMessages, nextPendingRequest);
    setComposerPreset({
      text: group.userMessage.content || '',
      files: Array.isArray(group.userMessage.attachedFiles) ? group.userMessage.attachedFiles : [],
      timestamp: Date.now()
    });
  };

  const handleUpdateMessageText = (idx, newText) => {
    const nextMessages = [...(latestMessagesRef.current || messages)];
    const msg = nextMessages[idx];
    if (msg) {
      let updatedMsg;
      if (msg.content !== undefined) {
        updatedMsg = { ...msg, content: newText };
      } else if (Array.isArray(msg.parts)) {
        const nextParts = [];
        let textAdded = false;
        msg.parts.forEach(p => {
          if (p.type === 'action') {
            nextParts.push(p);
          } else if (p.type === 'text') {
            if (!textAdded) {
              nextParts.push({ type: 'text', content: newText });
              textAdded = true;
            }
          }
        });
        if (!textAdded) {
          nextParts.push({ type: 'text', content: newText });
        }
        updatedMsg = { ...msg, parts: nextParts };
      } else {
        updatedMsg = { ...msg, content: newText };
      }

      nextMessages[idx] = updatedMsg;
      // Editing any part of the request invalidates later measured snapshots.
      for (let i = idx; i < nextMessages.length; i++) {
        nextMessages[i] = { ...nextMessages[i], contextStatus: null };
      }
      syncChatState(nextMessages);
    }
  };

  const streamPendingAssistantResponse = async ({
    activeChatId,
    requestMessage,
    historyForRequest,
    assistantMsgId,
    files = [],
    options = {},
    pendingRequest,
    resumeState = null,
    approvalDecision = null
  }) => {
    // Old stream finalizers can drain the queue through an old render closure.
    // Snapshot current model / credentials / permissions only at actual dispatch.
    const config = getDispatchConfig(configRef, options);
    const generationStartTime = Date.now();
    const run = { chatId: activeChatId, assistantMsgId, stopped: false };
    runningRef.current = run;
    pendingRef.current = pendingRequest;
    setCurrentPendingRequest(pendingRequest);
    setIsGenerating(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    let completed = false;
    let runOutcome = null;
    let streamError = false;
    let shouldClearPending = false;
    let nextPendingRequest = pendingRequest;
    let storyGlassTastingStarted = false;
    const startStoryGlassTastingAnimation = () => {
      if (storyGlassTastingStarted) return;
      storyGlassTastingStarted = true;
      setCurrentExpression('ok.png');
      setAnimationTrigger({ type: 'drinking', timestamp: Date.now() });
    };

    const activityAnimation = getCharacterActivityAnimation(options);
    if (activityAnimation === 'thinking') {
      setCurrentExpression('think.png');
      setAnimationTrigger({ type: 'thinking', loop: true, timestamp: Date.now() });
    } else {
      setCurrentExpression('busy.png');
      setAnimationTrigger({ type: activityAnimation, loop: true, timestamp: Date.now() });
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          message: requestMessage,
          history: historyForRequest,
          provider: config.provider,
          model: config.model,
          ollamaUrl: config.ollamaUrl,
          searchEnabled: options.useSearch || false,
          mcpEnabled: options.useMcp || false,
          useSd: options.useSd || false,
          useDeep: options.useWeb || false,
          usePpt: options.usePpt || false,
          useTruthCheck: options.useTruthCheck || false,
          useStoryGlass: options.useStoryGlass || false,
          storyGlassPreferences: options.storyGlassPreferences || null,
          useMemory: options.useMemory || false,
          uploadedFiles: files,
          chatId: activeChatId,
          assistantMsgId,
          config: { ...config, workspacePath: options.workspacePath ?? config.workspacePath ?? '' },
          resumeState,
          approvalDecision
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.text || `Server error: ${response.status}`);
      }

      if (options.useWeb) {
        setDeepReadingData(resumeState?.deepReadingData || { steps: [], reportHtml: '', status: 'running' });
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (currentChatIdRef.current !== activeChatId || runningRef.current !== run) {
          await reader.cancel();
          return;
        }
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let stopSignalReceived = false;
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;

          const dataStr = trimmedLine.slice(6).trim();
          if (dataStr === '[DONE]') {
            completed = true;
            stopSignalReceived = true;
            break;
          }

          try {
            const data = JSON.parse(dataStr);

            if (data.type === 'steering') {
              if (String(data.assistantMsgId) === String(assistantMsgId)) {
                const updated = mergeSteeringEvent(latestMessagesRef.current, data);
                latestMessagesRef.current = updated;
                setMessages(updated);
              }
              continue;
            }
            if (data.type === 'runOutcome' && String(data.assistantMsgId) === String(assistantMsgId)) {
              runOutcome = data.outcome;
              if (data.approvalRequest) nextPendingRequest = { ...nextPendingRequest, approvalRequest: data.approvalRequest };
              if (data.outcome !== 'completed') queueStore.pause(activeChatId);
              continue;
            }
            if (data.type === 'error' || data.error || /^\s*(执行失败|错误[:：]|Error:)/i.test(data.text || '')) {
              streamError = true;
              queueStore.pause(activeChatId, String(data.error || data.text || '流响应错误'));
            }

            if (data.type === 'checkpoint' && data.checkpoint) {
              setMessages(previous => {
                const updated = attachCheckpoint(previous, data.checkpoint);
                latestMessagesRef.current = updated;
                return updated;
              });
              continue;
            }

            if (data.contextStatus) {
              setContextStatus(data.contextStatus);
              setMessages(previous => {
                const updated = previous.map(item => item.id === assistantMsgId
                  ? { ...item, contextStatus: data.contextStatus } : item);
                latestMessagesRef.current = updated;
                return updated;
              });
              continue;
            }

            if (data.type === 'todo' || data.todo) {
              const todoPayload = data.todo || data;
              setMessages(prevMsgs => {
                const newMsgs = prevMsgs.map(m =>
                  m.id === assistantMsgId ? applyTodoUpdateToAssistantMessage(m, todoPayload) : m
                );
                latestMessagesRef.current = newMsgs;
                return newMsgs;
              });
              continue;
            }

            if (data.type === 'deepReading' || data.deepReading) {
              const deepData = data.deepReading || data;
              setDeepReadingData(prev => {
                const updated = { ...(prev || {}), ...deepData };
                if (deepData.steps) updated.steps = deepData.steps;
                if (deepData.status) updated.status = deepData.status;

                setMessages(prevMsgs => {
                  const newMsgs = prevMsgs.map(m =>
                    m.id === assistantMsgId ? { ...m, deepReadingData: updated, status: 'streaming' } : m
                  );
                  latestMessagesRef.current = newMsgs;
                  return newMsgs;
                });

                return updated;
              });
              continue;
            }

            if (data.type === 'ppt' || data.pptData) {
              const pptData = data.pptData || data;
              setMessages(prevMsgs => {
                const newMsgs = prevMsgs.map(m =>
                  m.id === assistantMsgId ? { ...m, pptData: { ...(m.pptData || {}), ...pptData }, status: 'streaming' } : m
                );
                latestMessagesRef.current = newMsgs;
                return newMsgs;
              });
              continue;
            }

            if (data.type === 'credibilityCheck' || data.credibilityCheck) {
              const credibilityCheckData = data.credibilityCheck || data;
              setMessages(prevMsgs => {
                const newMsgs = prevMsgs.map(m =>
                  m.id === assistantMsgId
                    ? { ...m, credibilityCheckData: { ...(m.credibilityCheckData || {}), ...credibilityCheckData }, status: 'streaming' }
                    : m
                );
                latestMessagesRef.current = newMsgs;
                return newMsgs;
              });
              continue;
            }

            if (data.type === 'storyGlass' || data.storyGlass) {
              const storyGlassData = data.storyGlass || data;
              const generatedFile = storyGlassData.generatedFile || data.generatedFile;
              if (isCompletedStoryGlassPayload(storyGlassData)) {
                startStoryGlassTastingAnimation();
              }
              setMessages(prevMsgs => {
                const newMsgs = prevMsgs.map(m =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        storyGlassData: { ...(m.storyGlassData || {}), ...storyGlassData },
                        generatedFiles: generatedFile
                          ? upsertGeneratedFile(m.generatedFiles, generatedFile)
                          : (m.generatedFiles || []),
                        status: 'streaming'
                      }
                    : m
                );
                latestMessagesRef.current = newMsgs;
                return newMsgs;
              });
              continue;
            }

            if (data.approvalRequest) {
              queueStore.pause(activeChatId, '等待审批，队列已暂停。');
              nextPendingRequest = {
                ...(nextPendingRequest || pendingRequest || {}),
                approvalRequest: data.approvalRequest
              };
              setCurrentPendingRequest(nextPendingRequest);
              persistChatState(activeChatId, latestMessagesRef.current, nextPendingRequest);
              continue;
            }

            if (Array.isArray(data.streamingActions)) {
              setMessages(previous => previous.map(message => message.id === assistantMsgId
                ? applyStreamingActions(message, data) : message));
            }

            if (data.reasoning || data.text || data.textReplacement || data.action || data.observation || data.fileMetadata || data.generatedFile) {
              setAnimationTrigger(prev => {
                if (prev && prev.type === 'thinking') {
                  return { type: 'stop', timestamp: Date.now() };
                }
                return prev;
              });

              setMessages(prev => {
                const updated = prev.map(m => {
                  if (m.id === assistantMsgId) {
                    let parts = Array.isArray(m.parts) ? [...m.parts] : [];
                    let rawText = m.rawText || '';
                    if (data.reasoning) {
                      const lastIndex = parts.length - 1;
                      if (lastIndex >= 0 && parts[lastIndex].type === 'reasoning') {
                        const updatedContent = parts[lastIndex].content + data.reasoning;
                        parts[lastIndex] = { ...parts[lastIndex], content: updatedContent };
                      } else {
                        const reasoningPart = { type: 'reasoning', content: data.reasoning };
                        parts.push(reasoningPart);
                      }
                    }
                    if (data.text || data.textReplacement) {
                      parts = applyTextStreamEvent(parts, data);
                      const newContent = parts.at(-1)?.type === 'text' ? parts.at(-1).content : '';
                      if (data.textReplacement) {
                        const count = Math.max(0, Math.floor(Number(data.textReplacement.length) || 0));
                        rawText = rawText.slice(0, Math.max(0, rawText.length - count)) + String(data.textReplacement.text ?? '');
                      } else {
                        rawText += data.text;
                      }

                      if (!options.useWeb) {
                        const expressionRegex = /\[expression[:=]\s*([\w.-]+)\s*\]/g;
                        const expressionMatches = [...newContent.matchAll(expressionRegex)];
                        if (expressionMatches.length > 0) {
                          const fileName = expressionMatches[expressionMatches.length - 1][1]?.trim();
                          if (fileName) {
                            setCurrentExpression(fileName);
                          }
                        }
                      }
                    }
                    if (data.action) {
                      parts.push({ type: 'action', data: data.action });
                      rawText += `\n[Tool Call: ${data.action.tool || data.action.action}(${JSON.stringify(data.action.args || {})})]\n`;
                    }
                    if (data.observation || data.fileMetadata) {
                      for (let i = parts.length - 1; i >= 0; i--) {
                        if (parts[i].type === 'action') {
                          if (data.observation) {
                            parts[i].observation = data.observation;
                            rawText += `\n[Observation: ${String(data.observation)}]\n`;
                          }
                          if (data.fileMetadata) {
                            parts[i].fileMetadata = data.fileMetadata;
                            rawText += `\n[File Metadata: ${JSON.stringify(data.fileMetadata)}]\n`;
                          }
                          break;
                        }
                      }
                    }
                    const generatedFiles = data.generatedFile
                      ? upsertGeneratedFile(m.generatedFiles, data.generatedFile)
                      : (m.generatedFiles || []);
                    return { ...applyStreamingActions(m, data), parts, generatedFiles, rawText, status: 'streaming' };
                  }
                  return m;
                });
                latestMessagesRef.current = updated;
                return updated;
              });
            }
          } catch (e) {
            console.warn('Failed to parse SSE line:', trimmedLine, e);
            streamError = true;
          }
        }

        if (stopSignalReceived) break;
      }
    } catch (error) {
      if (currentChatIdRef.current !== activeChatId || runningRef.current !== run) return;
      streamError = true;
      queueStore.pause(activeChatId);
      if (error.name === 'AbortError') {
        shouldClearPending = true;
        console.log('Generation aborted by user');
      } else {
        shouldClearPending = true;
        console.error('Chat error:', error);
        setMessages(prevMsgs => {
          const newMsgs = prevMsgs.map(message => {
            if (message.id !== assistantMsgId) return message;
            const parts = Array.isArray(message.parts) ? [...message.parts] : [];
            if (parts.length === 0) {
              parts.push({
                type: 'text',
                content: isLikelyModelConfigFailure(error.message)
                  ? getLocalText('当前聊天模型调用失败了，请先检查模型配置。', 'The chat model failed to run. Please check your model settings first.')
                  : getLocalText('抱歉，这次响应失败了，请稍后重试。', 'Sorry, the response failed. Please try again.')
              });
            }
            const enhancedMessage = maybeAppendModelSettingsGuidance(
              { ...message, parts, status: 'error' },
              uiLanguage,
              error.message
            );
            return { ...enhancedMessage, status: 'error' };
          });
          latestMessagesRef.current = newMsgs;
          return newMsgs;
        });
      }
    } finally {
      if (currentChatIdRef.current !== activeChatId || runningRef.current !== run) return;
      clearInterval(bgPollRef.current);
      bgPollRef.current = null;
      setIsGenerating(false);
      const keepStoryGlassTasting = options.useStoryGlass && storyGlassTastingStarted;
      if (activityAnimation === 'thinking') {
        setCurrentExpression('normal.png');
        setAnimationTrigger({ type: 'stop', timestamp: Date.now() });
      } else if ((options.useStoryGlass && !keepStoryGlassTasting) || options.useWeb || options.usePpt || options.useTruthCheck) {
        setCurrentExpression('ok.png');
        setAnimationTrigger({ type: 'stop', timestamp: Date.now() });
      }

      if (isMusicPlaying && !keepStoryGlassTasting) {
        setTimeout(() => {
          setAnimationTrigger({ type: 'dance', loop: true, timestamp: Date.now() });
        }, 100);
      }

      setDeepReadingData(null);
      abortControllerRef.current = null;
      const awaitingApproval = runOutcome === 'awaitingApproval' || Boolean(nextPendingRequest?.approvalRequest);
      const finalAssistant = latestMessagesRef.current.find(message => String(message.id) === String(assistantMsgId));
      streamError ||= finalAssistant?.status === 'error' || isLikelyModelConfigFailure(extractAssistantTextParts(finalAssistant));
      const successful = canAdvanceQueue({ outcome: runOutcome, done: completed, error: streamError, approval: awaitingApproval, stopped: run.stopped });
      if (!successful) queueStore.pause(activeChatId, awaitingApproval ? '等待审批，队列已暂停。' : '任务未成功完成，队列已暂停。');
      const finalPendingRequest = awaitingApproval ? nextPendingRequest : (completed || shouldClearPending || runOutcome ? null : nextPendingRequest);
      const durationMs = Date.now() - generationStartTime;
      const newMsgs = latestMessagesRef.current.map(message => (
          message.id === assistantMsgId
            ? (() => {
                const enhancedMessage = maybeAppendModelSettingsGuidance(message, uiLanguage);
                return {
                  ...applyStreamingActions(enhancedMessage, {}, true),
                  runOutcome,
                  generationDurationMs: durationMs,
                  status: successful
                    ? (enhancedMessage.status === 'error' ? 'error' : 'done')
                    : (streamError || runOutcome === 'error' || enhancedMessage.status === 'error' ? 'error' : 'interrupted')
                };
              })()
            : message
        ));
      latestMessagesRef.current = newMsgs;
      setMessages(newMsgs);
      pendingRef.current = finalPendingRequest;
      setCurrentPendingRequest(finalPendingRequest);
      let saved = true;
      try { await persistChatState(activeChatId, newMsgs, finalPendingRequest); }
      catch {
        saved = false;
        queueStore.pause(activeChatId, '聊天记录保存失败，队列已暂停，请确认后继续。');
      }
      if (currentChatIdRef.current !== activeChatId || runningRef.current !== run) return;
      runningRef.current = null;
      if (successful && saved) void drainQueue(activeChatId);
    }
  };

  const sendMessageWithContext = async ({ text, files = [], options = {}, baseMessages = null }) => {
    if (runningRef.current || bgPollRef.current || loadingChatRef.current || checkpointRestoreRef.current) return false;
    const config = getDispatchConfig(configRef, options);

    let activeChatId = currentChatIdRef.current;
    if (!activeChatId) {
      activeChatId = Date.now().toString();
      setCurrentChatId(activeChatId);
    }
    currentChatIdRef.current = activeChatId;

    const historyBase = Array.isArray(baseMessages) ? baseMessages : (latestMessagesRef.current || []);
    const normalizedOptions = {
      workspacePath: options.workspacePath ?? config.workspacePath ?? '',
      useSearch: Boolean(options.useSearch),
      useWeb: Boolean(options.useWeb),
      useMcp: Boolean(options.useMcp),
      useSd: Boolean(options.useSd),
      useMemory: Boolean(options.useMemory),
      usePpt: Boolean(options.usePpt),
      useTruthCheck: Boolean(options.useTruthCheck),
      useStoryGlass: Boolean(options.useStoryGlass),
      storyGlassOverlay: Boolean(options.storyGlassOverlay),
      storyGlassPreferences: options.storyGlassPreferences || null
    };

    const userMsg = {
      role: 'user',
      id: `user_${Date.now()}`,
      content: text,
      files: files.map(f => f.name),
      attachedFiles: files,
      requestOptions: normalizedOptions
    };
    const newMessages = [...historyBase, userMsg];
    setMessages(newMessages);
    latestMessagesRef.current = newMessages;
    setContextStatus(calculateContextStatusFromMessages(newMessages, config));

    const assistantMsgId = Date.now();
    const assistantMsg = createOptimisticAssistantMessage(assistantMsgId, normalizedOptions);
    const messagesWithAssistant = [...newMessages, assistantMsg];
    const pendingRequest = buildPendingRequest(text, files, normalizedOptions, assistantMsgId);

    setMessages(messagesWithAssistant);
    latestMessagesRef.current = messagesWithAssistant;
    setCurrentPendingRequest(pendingRequest);
    setContextStatus(calculateContextStatusFromMessages(messagesWithAssistant, config));
    persistChatState(activeChatId, messagesWithAssistant, pendingRequest);

    await streamPendingAssistantResponse({
      activeChatId,
      requestMessage: text,
      historyForRequest: newMessages,
      assistantMsgId,
      files,
      options: normalizedOptions,
      pendingRequest
    });
    return true;
  };

  const handleRestoreCheckpoint = async (message) => {
    if (!message?.checkpoint?.id || !currentChatId || isGenerating || checkpointRestoreRef.current) return false;
    const chatId = currentChatId;
    checkpointRestoreRef.current = true;
    setRestoringCheckpointId(message.checkpoint.id);
    try {
      const result = await restoreCheckpoint(BACKEND_URL, chatId, message.checkpoint.id);
      if (currentChatIdRef.current === chatId) {
        setMessages(result.messages);
        latestMessagesRef.current = result.messages;
        setCurrentPendingRequest(null);
        setDeepReadingData(null);
        setContextStatus(calculateContextStatusFromMessages(result.messages, config));
        setComposerPreset({
          timestamp: Date.now(), text: result.userMessage.content || '',
          files: result.userMessage.attachedFiles || [], options: result.userMessage.requestOptions || {},
        });
        setConfig(previous => ({ ...previous, workspacePath: result.userMessage.requestOptions?.workspacePath ?? result.checkpoint.workspacePath }));
      }
      refreshHistory();
      return true;
    } catch (error) {
      window.alert(`${getLocalText('还原检查点失败', 'Could not restore checkpoint')}: ${error.message}`);
      return false;
    } finally {
      checkpointRestoreRef.current = false;
      setRestoringCheckpointId(null);
    }
  };

  const handleSendMessage = async (text, files = [], options = {}) => {
    if (loadingChatRef.current || checkpointRestoreRef.current) return false;
    const chatId = currentChatIdRef.current || ensureActiveChat();
    currentChatIdRef.current = chatId;
    const payload = { text, files, options: { ...options, workspacePath: options.workspacePath ?? config.workspacePath ?? '' } };
    if (runningRef.current || isGenerating || pendingRef.current || queueStore.get(chatId).paused || queueStore.get(chatId).items.length) {
      queueStore.enqueue(chatId, payload);
      if (!runningRef.current && !isGenerating && !pendingRef.current) void drainQueue(chatId);
      return true;
    }
    void sendMessageWithContext(payload);
    return true;
  };

  const drainQueue = async (chatId) => {
    if (currentChatIdRef.current !== chatId || runningRef.current || bgPollRef.current || loadingChatRef.current || pendingRef.current || checkpointRestoreRef.current) return;
    const item = queueStore.take(chatId);
    if (!item) return;
    // No await between reservation and send: history is read by sendMessageWithContext at dispatch time.
    queueStore.remove(chatId, item.id, true);
    const sent = await sendMessageWithContext({ text: item.text, files: item.files, options: item.options });
    if (sent === false) {
      queueStore.pause(chatId, '发送尚未就绪，队列已暂停。');
      queueStore.prepend(chatId, item);
    }
  };

  const handleQueueRemove = (itemId, edit = false) => {
    const chatId = currentChatIdRef.current;
    const item = queueStore.remove(chatId, itemId);
    if (item && edit) {
      queueStore.pause(chatId, '已撤回到输入框；修改后请重新发送入队，再继续队列。');
      setComposerPreset({ timestamp: Date.now(), text: item.text, files: item.files, options: item.options });
    }
  };

  const handleQueueSteer = async (itemId) => {
    const chatId = currentChatIdRef.current;
    const pending = pendingRef.current;
    if (!isGenerating || !pending?.assistantMsgId || pending.approvalRequest || loadingChatRef.current) return;
    const item = queueStore.claim(chatId, itemId);
    if (!item) return;
    try {
      const response = await axios.post(`${BACKEND_URL}/api/chat/stream/${encodeURIComponent(chatId)}/steer`, {
        assistantMsgId: pending.assistantMsgId, text: item.text, files: item.files,
      });
      if (response.status !== 202) throw new Error('引导未被接受');
      if (currentChatIdRef.current === chatId) {
        const updated = mergeSteeringEvent(latestMessagesRef.current, response.data);
        latestMessagesRef.current = updated;
        setMessages(updated);
      }
      queueStore.remove(chatId, itemId, true);
    } catch (error) {
      queueStore.release(chatId, itemId, String(error.response?.data?.error || error.response?.data?.text || error.message));
      queueStore.pause(chatId, '引导失败，已保留队列项，请确认后重试或继续队列。');
    }
    if (currentChatIdRef.current === chatId) void drainQueue(chatId);
  };

  const handleAppendStoryGlassConversation = (turns = [], metadata = {}) => {
    const normalizedTurns = (Array.isArray(turns) ? turns : [])
      .map((turn) => {
        const role = turn?.role === 'saki' || turn?.role === 'assistant' ? 'assistant' : 'user';
        const content = String(turn?.text || turn?.content || '').trim();
        return { role, content };
      })
      .filter((turn) => turn.content);

    if (!normalizedTurns.some((turn) => turn.role === 'user')) return;

    let activeChatId = currentChatId;
    if (!activeChatId) {
      activeChatId = Date.now().toString();
      setCurrentChatId(activeChatId);
    }

    const createdAt = Date.now();
    const archiveOptions = {
      storyGlassConversationArchive: true,
      storyGlassOverlay: false,
      voiceFirst: Boolean(metadata.voiceFirst),
      storyGlassPreferences: metadata.preferences || null,
    };
    const storyGlassConversationData = {
      source: metadata.source || 'story-glass',
      startedAt: metadata.startedAt || null,
      endedAt: metadata.endedAt || new Date().toISOString(),
    };
    const archivedMessages = normalizedTurns.map((turn, index) => {
      const id = `story_glass_archive_${createdAt}_${index}`;
      if (turn.role === 'assistant') {
        return {
          role: 'assistant',
          id,
          content: turn.content,
          parts: [{ type: 'text', content: turn.content }],
          generatedFiles: [],
          status: 'done',
          requestOptions: archiveOptions,
          storyGlassConversationData,
        };
      }

      return {
        role: 'user',
        id,
        content: turn.content,
        files: [],
        attachedFiles: [],
        requestOptions: archiveOptions,
        storyGlassConversationData,
      };
    });

    const nextMessages = [...(latestMessagesRef.current || []), ...archivedMessages];
    setMessages(nextMessages);
    latestMessagesRef.current = nextMessages;
    setContextStatus(calculateContextStatusFromMessages(nextMessages, config));
    return persistChatState(activeChatId, nextMessages, currentPendingRequest || null);
  };

  const handleRedoMessage = async (idx) => {
    if (isGenerating || checkpointRestoreRef.current) return;

    const group = getMessageGroupAtIndex(idx);
    if (!group?.userMessage) return;

    if (group.assistantMessage) {
      const didRollback = await rollbackAssistantEffects(group.assistantMessage);
      if (!didRollback) return;
    }

    const nextMessages = [...(latestMessagesRef.current || [])];
    nextMessages.splice(group.start, group.end - group.start);
    const nextPendingRequest = currentPendingRequest?.assistantMsgId === group.assistantMessage?.id
      ? null
      : currentPendingRequest;

    setMessages(nextMessages);
    latestMessagesRef.current = nextMessages;
    setCurrentPendingRequest(nextPendingRequest);
    setContextStatus(calculateContextStatusFromMessages(nextMessages, config));
    persistChatState(currentChatId, nextMessages, nextPendingRequest);

    await sendMessageWithContext({
      text: group.userMessage.content || '',
      files: Array.isArray(group.userMessage.attachedFiles) ? group.userMessage.attachedFiles : [],
      options: group.userMessage.requestOptions || {},
      baseMessages: nextMessages
    });
  };

  const handleContinuePendingChat = async (chatId) => {
    if (isGenerating || checkpointRestoreRef.current) return;
    const originChatId = currentChatIdRef.current;
    loadingChatRef.current = true;
    queueStore.pause(chatId, '恢复任务后请确认并继续队列。');

    try {
      const res = await axios.get(`${BACKEND_URL}/api/history/${chatId}`);
      if (currentChatIdRef.current !== originChatId) return;
      loadingChatRef.current = false;
      currentChatIdRef.current = chatId;
      const sessionMessages = res.data.messages || [];
      const pendingRequest = res.data.pendingRequest || null;

      setCurrentChatId(chatId);
      setDeepReadingData(null);

      if (!pendingRequest?.assistantMsgId) {
        setMessages(sessionMessages);
        latestMessagesRef.current = sessionMessages;
        setCurrentPendingRequest(null);
        setContextStatus(calculateContextStatusFromMessages(sessionMessages, config));
        return;
      }

      const existingAssistantMsg = sessionMessages.find(
        m => String(m.id) === String(pendingRequest.assistantMsgId)
      );
      const assistantMsg = existingAssistantMsg || {
        role: 'assistant',
        parts: [],
        generatedFiles: [],
        id: pendingRequest.assistantMsgId
      };
      const baseHistory = sessionMessages.filter(
        m => String(m.id) !== String(pendingRequest.assistantMsgId)
      );
      const hydratedMessages = existingAssistantMsg ? sessionMessages : [...baseHistory, assistantMsg];
      const resumeState = getResumeStateFromMessage(assistantMsg);

      setMessages(hydratedMessages);
      latestMessagesRef.current = hydratedMessages;
      setCurrentPendingRequest(pendingRequest);
      setContextStatus(calculateContextStatusFromMessages(hydratedMessages, config));

      if (pendingRequest?.approvalRequest) {
        return;
      }

      await streamPendingAssistantResponse({
        activeChatId: chatId,
        requestMessage: pendingRequest.message || baseHistory[baseHistory.length - 1]?.content || '',
        historyForRequest: baseHistory,
        assistantMsgId: pendingRequest.assistantMsgId,
        files: pendingRequest.uploadedFiles || [],
        options: pendingRequest.options || {},
        pendingRequest,
        resumeState
      });
    } catch (error) {
      console.error('Failed to continue chat:', error);
    } finally {
      if (currentChatIdRef.current === chatId || currentChatIdRef.current === originChatId) loadingChatRef.current = false;
    }
  };

  const handleCancelPendingChat = async (chatId) => {
    if (!chatId) return;
    queueStore.pause(chatId, '已取消待续任务，队列已暂停。');

    if (String(currentChatId) === String(chatId) && isGenerating) {
      stopGeneration();
      return;
    }

    try {
      const res = await axios.get(`${BACKEND_URL}/api/history/${chatId}`);
      const sessionMessages = Array.isArray(res.data.messages) ? res.data.messages : [];
      const pendingRequest = res.data.pendingRequest || null;
      const nextMessages = sessionMessages.map((message) => (
        pendingRequest?.assistantMsgId
          && String(message.id) === String(pendingRequest.assistantMsgId)
          ? { ...message, status: message.status === 'error' ? 'error' : 'interrupted' }
          : message
      ));

      await axios.post(`${BACKEND_URL}/api/history`, {
        chatId,
        messages: nextMessages,
        pendingRequest: null,
        clientSavedAt: Date.now()
      });

      if (String(currentChatId) === String(chatId)) {
        setMessages(nextMessages);
        latestMessagesRef.current = nextMessages;
        setCurrentPendingRequest(null);
        setContextStatus(calculateContextStatusFromMessages(nextMessages, config));
      }
      refreshHistory();
    } catch (error) {
      console.error('Failed to stop pending chat:', error);
    }
  };

  const handleApprovalDecision = async (approved) => {
    queueStore.pause(currentChatIdRef.current, '审批后请确认并继续队列。');
    if (isGenerating || checkpointRestoreRef.current) return;

    const pendingRequest = currentPendingRequest;
    const activeApprovalRequest = pendingRequest?.approvalRequest;
    if (!pendingRequest?.assistantMsgId || !activeApprovalRequest || !currentChatId) return;

    const sessionMessages = latestMessagesRef.current || [];
    const existingAssistantMsg = sessionMessages.find(
      m => String(m.id) === String(pendingRequest.assistantMsgId)
    );

    if (!approved) {
      const cancelText = getLocalText('已取消这次敏感操作。', 'Cancelled the sensitive action.');
      const updatedMessages = sessionMessages.map(message => {
        if (String(message.id) !== String(pendingRequest.assistantMsgId)) return message;
        const parts = Array.isArray(message.parts) ? [...message.parts] : [];
        parts.push({ type: 'text', content: cancelText });
        return { ...message, parts };
      });

      setMessages(updatedMessages);
      latestMessagesRef.current = updatedMessages;
      setCurrentPendingRequest(null);
      persistChatState(currentChatId, updatedMessages, null);
      return;
    }

    const assistantMsg = existingAssistantMsg || {
      role: 'assistant',
      parts: [],
      generatedFiles: [],
      id: pendingRequest.assistantMsgId
    };
    const baseHistory = sessionMessages.filter(
      m => String(m.id) !== String(pendingRequest.assistantMsgId)
    );
    const resumeState = getResumeStateFromMessage(assistantMsg);
    const nextPendingRequest = { ...pendingRequest };
    delete nextPendingRequest.approvalRequest;

    setCurrentPendingRequest(nextPendingRequest);
    persistChatState(currentChatId, latestMessagesRef.current, nextPendingRequest);

    await streamPendingAssistantResponse({
      activeChatId: currentChatId,
      requestMessage: pendingRequest.message || baseHistory[baseHistory.length - 1]?.content || '',
      historyForRequest: baseHistory,
      assistantMsgId: pendingRequest.assistantMsgId,
      files: pendingRequest.uploadedFiles || [],
      options: pendingRequest.options || {},
      pendingRequest: nextPendingRequest,
      resumeState,
      approvalDecision: {
        signature: activeApprovalRequest.signature,
        toolName: activeApprovalRequest.toolName,
        args: activeApprovalRequest.args || []
      }
    });
  };

  const stopGeneration = () => {
    const chatId = currentChatIdRef.current;
    queueStore.pause(chatId, '已停止，队列已暂停。');
    if (runningRef.current) runningRef.current.stopped = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (chatId) {
      axios.post(`${BACKEND_URL}/api/chat/stream/${chatId}/stop`).then(() => {
        if (currentChatIdRef.current !== chatId || runningRef.current) return;
        // Poll-only runs have no local stream finally block; refresh their stopped state.
        return axios.get(`${BACKEND_URL}/api/history/${chatId}`).then(response => {
          if (currentChatIdRef.current !== chatId || runningRef.current) return;
          setMessages(response.data.messages || []);
          pendingRef.current = response.data.pendingRequest || null;
          setCurrentPendingRequest(pendingRef.current);
          setIsGenerating(false);
        });
      }).catch(() => {
        if (currentChatIdRef.current === chatId && !runningRef.current) startBgPoll(chatId);
      });
    }
    clearInterval(bgPollRef.current);
    bgPollRef.current = null;
  };

  function detachChatRun() {
    chatEpochRef.current.invalidate();
    const previous = currentChatIdRef.current;
    if (previous) queueStore.pause(previous, '切换会话后队列已暂停。');
    runningRef.current = null;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    clearInterval(bgPollRef.current);
    bgPollRef.current = null;
    loadingChatRef.current = false;
    pendingRef.current = null;
    setIsGenerating(false);
    setComposerPreset(null);
  }

  const handleSkipAction = async (actionId) => {
    if (!actionId) return false;
    try {
      await axios.post(`${BACKEND_URL}/api/agent/actions/${encodeURIComponent(actionId)}/skip`);
      return true;
    } catch (error) {
      console.warn('Failed to skip action:', error);
      return false;
    }
  };

  const getApprovalReasonText = (request) => {
    switch (request?.reasonKey) {
      case 'sandbox-terminal-sensitive':
        return getLocalText('这条终端命令会修改沙盒内的文件或运行状态。', 'This terminal command will modify files or runtime state inside the sandbox.');
      case 'sandbox-terminal-network':
        return getLocalText('这条终端命令可能访问网络或发送数据。', 'This terminal command may access the network or send data.');
      case 'sandbox-terminal-script':
        return getLocalText('这条终端命令会执行内联脚本，风险更高。', 'This terminal command runs an inline script and carries higher risk.');
      case 'sandbox-file-overwrite':
        return getLocalText('这会覆盖沙盒中已有文件。', 'This will overwrite an existing file inside the sandbox.');
      case 'sandbox-file-edit':
        return getLocalText('这会修改沙盒中的现有文件。', 'This will modify an existing file inside the sandbox.');
      case 'sandbox-file-delete':
        return getLocalText('这会删除沙盒中的文件。', 'This will delete a file inside the sandbox.');
      case 'sandbox-task-schedule':
        return getLocalText('这会新增、删除或改动托管任务。', 'This will add, remove, or modify a hosted task.');
      case 'sandbox-skill-install':
        return getLocalText('这会安装或更新技能内容。', 'This will install or update a skill.');
      default:
        return request?.reason || getLocalText('这项操作需要你确认后才能继续。', 'This action requires your approval before it can continue.');
    }
  };

  const commandPaletteActions = [
    {
      id: 'new-chat',
      label: getLocalText('新建对话', 'New chat'),
      description: getLocalText('开始一个新的聊天会话', 'Start a fresh conversation'),
      icon: Plus,
      keywords: 'new chat conversation',
      run: () => handleStartNewChat()
    },
    {
      id: 'settings',
      label: getLocalText('打开设置', 'Open settings'),
      description: getLocalText('调整模型、权限和界面配置', 'Adjust models, permissions, and UI settings'),
      icon: Settings2,
      keywords: 'settings configuration model',
      run: openSettingsModal
    },
    {
      id: 'guide',
      label: getLocalText('功能指南', 'Feature guide'),
      description: getLocalText('查看功能入口、快捷方式和使用说明', 'Browse feature entry points, shortcuts, and usage help'),
      icon: BookOpen,
      keywords: 'guide wiki help onboarding feature',
      run: openFeatureGuideModal
    },
    {
      id: 'files',
      label: getLocalText('文件管理', 'File manager'),
      description: getLocalText('查看和管理工作区文件', 'Browse and manage workspace files'),
      icon: FolderOpen,
      keywords: 'files workspace upload',
      run: () => openFileManagerModal('manage')
    },
    {
      id: 'memory',
      label: getLocalText('记忆管理', 'Memory manager'),
      description: getLocalText('搜索和整理长期记忆', 'Search and organize long-term memory'),
      icon: Brain,
      keywords: 'memory notes context',
      run: openMemoryManagerModal
    },
    {
      id: 'plugins',
      label: getLocalText('插件市场', 'Plugin marketplace'),
      description: getLocalText('浏览并安装绑定 MCP 与专属技能的插件', 'Browse and install MCP + Skill plugins'),
      icon: Boxes,
      keywords: 'plugins mcp marketplace market 插件 扩展',
      run: openPluginMarketplaceModal
    },
    {
      id: 'skills',
      label: getLocalText('技能系统', 'Skill system'),
      description: getLocalText('查看和管理技能', 'Review and manage skills'),
      icon: Wrench,
      keywords: 'skills tools',
      run: openSkillManagerModal
    },
    {
      id: 'tasks',
      label: getLocalText('托管任务', 'Hosted tasks'),
      description: getLocalText('查看计划任务和结果', 'Inspect scheduled tasks and results'),
      icon: Clock3,
      keywords: 'tasks cron schedule',
      run: openHostedTasksModal
    },
    {
      id: 'third-party',
      label: getLocalText('第三方聊天', 'Third-party chats'),
      description: getLocalText('切换到外部聊天源', 'Jump into connected external chats'),
      icon: MessageCircle,
      keywords: 'third party external qq',
      run: openThirdPartyChatModal
    }
  ];

  const normalizedPaletteQuery = commandPaletteQuery.trim().toLowerCase();
  const filteredPaletteActions = commandPaletteActions.filter(action => {
    if (!normalizedPaletteQuery) return true;
    return `${action.label} ${action.description} ${action.keywords}`.toLowerCase().includes(normalizedPaletteQuery);
  }).map(action => ({ ...action, type: 'action' }));

  const filteredPaletteChats = history.filter(item => {
    if (!normalizedPaletteQuery) return true;
    const searchable = `${item.title || ''} ${item.source || ''} ${formatHistoryTimestamp(item.updatedAt)}`.toLowerCase();
    return searchable.includes(normalizedPaletteQuery);
  }).slice(0, normalizedPaletteQuery ? 12 : 8).map(item => ({
    ...item,
    type: 'chat',
    icon: MessageSquare,
    description: formatHistoryTimestamp(item.updatedAt)
  }));

  const commandPaletteResults = [...filteredPaletteActions, ...filteredPaletteChats];
  const activeUtilityKeys = useDesktopUtilityWindows
    ? [
        ...(isDesktopUtilityWindowOpen('guide') ? ['guide'] : []),
        ...(isDesktopUtilityWindowOpen('memory') ? ['memory'] : []),
        ...(isDesktopUtilityWindowOpen('skill') ? ['skill'] : []),
        ...(isDesktopUtilityWindowOpen('hosted') ? ['hosted'] : []),
        ...(isDesktopUtilityWindowOpen('files') ? ['files'] : []),
        ...(isDesktopUtilityWindowOpen('third-party') ? ['third-party'] : []),
        ...(isDesktopUtilityWindowOpen('settings') ? ['settings'] : []),
      ]
    : [
        ...(isFeatureGuideOpen ? ['guide'] : []),
        ...(isMemoryManagerOpen ? ['memory'] : []),
        ...(isSkillManagerOpen ? ['skill'] : []),
        ...(isPluginMarketplaceOpen ? ['plugins'] : []),
        ...(isHostedTasksOpen ? ['hosted'] : []),
        ...(isFileManagerOpen ? ['files'] : []),
        ...(isThirdPartyChatModalOpen ? ['third-party'] : []),
        ...(isSettingsOpen ? ['settings'] : []),
      ];

  const handleCommandPaletteSelect = (item) => {
    if (!item) return;
    closeCommandPalette();

    if (item.type === 'chat') {
      handleLoadChat(item.id);
      return;
    }

    item.run?.();
  };

  const handleCommandPaletteKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCommandPaletteIndex(prev => Math.min(prev + 1, Math.max(commandPaletteResults.length - 1, 0)));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCommandPaletteIndex(prev => Math.max(prev - 1, 0));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      handleCommandPaletteSelect(commandPaletteResults[commandPaletteIndex] || commandPaletteResults[0]);
    }
  };

  const desktopUtilityWindowLayout = getDesktopUtilityWindowLayout(desktopUtilityWindows.length);

  const renderDesktopUtilityWindow = (windowType) => {
    switch (windowType) {
      case 'guide':
        return (
          <FeatureGuideModal
            isOpen={true}
            onClose={() => closeDesktopUtilityWindow('guide')}
            onStartOnboarding={startOnboardingTour}
            windowed={true}
          />
        );
      case 'settings':
        return (
          <SettingsModal
            config={config}
            setConfig={setConfig}
            onClose={() => closeDesktopUtilityWindow('settings')}
            models={models}
            windowed={true}
          />
        );
      case 'third-party':
        return (
          <ThirdPartyChatModal
            isOpen={true}
            onClose={() => closeDesktopUtilityWindow('third-party')}
            config={config}
            setConfig={setConfig}
            backendUrl={BACKEND_URL}
            windowed={true}
          />
        );
      case 'files':
        return (
          <FileManagerModal
            workspacePath={config.workspacePath || ''}
            isOpen={true}
            onClose={() => closeDesktopUtilityWindow('files')}
            onSelect={fileManagerMode === 'select' ? (file) => setSelectedWorkspaceFile(file) : null}
            windowed={true}
          />
        );
      case 'memory':
        return (
          <MemoryManagerModal
            isOpen={true}
            onClose={() => closeDesktopUtilityWindow('memory')}
            chatHistory={history}
            windowed={true}
          />
        );
      case 'skill':
        return (
          <SkillManagerModal
            isOpen={true}
            onClose={() => closeDesktopUtilityWindow('skill')}
            windowed={true}
          />
        );
      case 'plugins':
        return (
          <PluginMarketplaceModal
            isOpen={true}
            onClose={() => closeDesktopUtilityWindow('plugins')}
            windowed={true}
          />
        );
      case 'hosted':
        return (
          <HostedTasksModal
            isOpen={true}
            onClose={() => closeDesktopUtilityWindow('hosted')}
            config={config}
            setConfig={setConfig}
            BACKEND_URL={BACKEND_URL}
            windowed={true}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Suspense fallback={null}>
    <div
      className="flex h-screen bg-[#f0f4f9] dark:bg-[#0b0c10] text-[#1d1d1f] dark:text-[#f5f5f7] font-sans overflow-hidden transition-colors duration-300 relative"
      data-saki-background={getChatBackgroundSource(config, theme, isMobileViewport)}
      style={{
        backgroundImage: `url(${JSON.stringify(getChatBackgroundSource(config, theme, isMobileViewport))})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed'
      }}
    >
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-[15%] -left-[10%] w-[55%] h-[55%] rounded-full bg-gradient-to-br from-[#ff75ac]/18 dark:from-[#ff75ac]/12 to-transparent blur-3xl opacity-75" />
        <div className="absolute top-[20%] -right-[15%] w-[50%] h-[50%] rounded-full bg-gradient-to-bl from-[#af52de]/15 dark:from-[#7c3aed]/12 to-transparent blur-3xl opacity-60" />
        <div className="absolute -bottom-[15%] left-[25%] w-[45%] h-[45%] rounded-full bg-gradient-to-tr from-[#34c759]/12 dark:from-[#3b82f6]/10 to-transparent blur-3xl opacity-50" />
      </div>
      <Sidebar
        isOpen={isSidebarOpen}
        setOpen={setSidebarOpen}
        history={history}
        currentChatId={currentChatId}
        onSelectChat={handleLoadChat}
        onDeleteChat={handleDeleteChat}
        onNewChat={handleStartNewChat}
        onContinueChat={handleContinuePendingChat}
        onCancelPendingChat={handleCancelPendingChat}
        onToggleGuide={toggleFeatureGuideModal}
        onToggleSettings={toggleSettingsModal}
        onToggleFileManager={() => toggleFileManagerModal('manage')}
        onToggleMemoryManager={toggleMemoryManagerModal}
        onToggleSkillManager={toggleSkillManagerModal}
        onTogglePluginMarketplace={togglePluginMarketplaceModal}
        onToggleHostedTasks={toggleHostedTasksModal}
        onToggleThirdPartyChats={toggleThirdPartyChatModal}
        activeUtilityKeys={activeUtilityKeys}
        isUtilityLayerActive={useDesktopUtilityWindows && desktopUtilityWindows.length > 0}
      />
      <div className="flex-1 min-w-0 flex flex-col relative overflow-hidden bg-white/30 dark:bg-[#12131a]/40 shadow-2xl z-10 border-l border-white/20 dark:border-white/5">
        {config.showParticles && window.__SAKI_RUNTIME__?.profile !== 'light' && <CherryBlossoms />}
        <Header
          toggleSidebar={() => setSidebarOpen(!isSidebarOpen)}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          onExport={exportToImage}
          isMusicPlaying={isMusicPlaying}
          onToggleMusic={toggleMusicMode}
          hasMessages={messages.length > 0}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
        <AnimatePresence mode="wait">
          <motion.div
            key={currentChatId || 'empty'}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="flex-1 flex flex-col min-h-0"
          >
            <Chat
               messages={messages}
               onSend={handleSendMessage}
               queue={queues[currentChatId]}
               queueStorageError={queueStorageError}
               onQueueRemove={handleQueueRemove}
               onQueueSteer={handleQueueSteer}
               onQueueResume={() => {
                 if (loadingChatRef.current || pendingRef.current?.approvalRequest) return;
                 queueStore.resume(currentChatIdRef.current);
                 void drainQueue(currentChatIdRef.current);
               }}
               isGenerating={isGenerating}
               onStop={stopGeneration}
               onCancelPendingChat={handleCancelPendingChat}
               currentChatId={currentChatId}
               onSkipAction={handleSkipAction}
               onRestoreCheckpoint={handleRestoreCheckpoint}
               restoringCheckpointId={restoringCheckpointId}
               backendUrl={BACKEND_URL}
               containerRef={chatContainerRef}
               config={config}
               setConfig={setConfig}
               onDeepDataUpdate={setDeepReadingData}
               activeDeepReadingData={deepReadingData}
               currentPendingRequest={currentPendingRequest}
               contextStatus={contextStatus}
               onRedo={handleRedoMessage}
               onDeleteMessage={handleDeleteMessage}
               onDeleteStoryGlassRecord={handleDeleteStoryGlassRecord}
               onEditMessage={handleEditMessage}
               onUpdateMessageText={handleUpdateMessageText}
               onOpenFileManager={() => openFileManagerModal('select')}
               onOpenSettings={openSettingsModal}
               externalFile={selectedWorkspaceFile}
               onExternalFileClear={() => setSelectedWorkspaceFile(null)}
               composerPreset={composerPreset}
               onComposerPresetConsumed={() => setComposerPreset(null)}
               onStoryGlassModeChange={handleStoryGlassModeChange}
               storyGlassOverlayOpen={isStoryGlassOverlayOpen}
               onStoryGlassOverlayOpenChange={setIsStoryGlassOverlayOpen}
               onAppendStoryGlassConversation={handleAppendStoryGlassConversation}
               onEnsureChat={ensureActiveChat}
               models={models}
            />
          </motion.div>
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {useDesktopUtilityWindows && desktopUtilityWindows.length > 0 && (
        <motion.div
          key="desktop-utility-overlay"
          {...tiledOverlayMotion}
          className="fixed inset-0 z-[120] pointer-events-none"
        >
          <div className="absolute inset-0 bg-slate-950/25 dark:bg-black/50 backdrop-blur-[2px] pointer-events-auto" onClick={closeAllDesktopUtilityWindows} />
            {desktopUtilityWindows.length > 1 && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.28, delay: 0.08 } }}
                exit={{ opacity: 0, y: -8, transition: { duration: 0.18 } }}
                className="absolute right-6 top-6 z-20 pointer-events-auto"
              >
                <button
                  type="button"
                  onClick={closeAllDesktopUtilityWindows}
                  className="inline-flex items-center gap-2 rounded-full border border-white/50 dark:border-white/10 bg-white/80 dark:bg-[#202230]/90 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 shadow-[0_20px_60px_rgba(15,23,42,0.18)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.5)] transition-colors hover:bg-white dark:hover:bg-[#2a2d3e]"
                >
                  <X size={15} />
                  <span>{getLocalText('全部关闭', 'Close all')}</span>
                </button>
              </motion.div>
            )}
            <div className="relative h-full w-full">
              <AnimatePresence initial={false}>
              {desktopUtilityWindows.map((windowItem, index) => {
                const layout = desktopUtilityWindowLayout[index] || desktopUtilityWindowLayout[desktopUtilityWindowLayout.length - 1];
                const windowMotion = getTiledWindowMotion(index);
                return (
                  <motion.div
                    key={windowItem.type}
                    layout
                    initial={windowMotion.initial}
                    animate={windowMotion.animate}
                    exit={windowMotion.exit}
                    transition={{ layout: windowMotion.layout }}
                    className="absolute p-2 pointer-events-auto"
                    style={{
                      height: layout.height,
                      left: layout.left,
                      top: layout.top,
                      width: layout.width,
                      zIndex: index + 1,
                    }}
                  >
                    <div className="h-full w-full overflow-hidden rounded-[32px] border border-white/45 dark:border-white/10 bg-white/70 dark:bg-[#161822]/85 shadow-[0_28px_90px_rgba(15,23,42,0.28)] dark:shadow-[0_28px_90px_rgba(0,0,0,0.65)] backdrop-blur-2xl">
                      <div
                        className="h-full w-full"
                        style={{
                          height: `${100 / layout.scale}%`,
                          transform: `scale(${layout.scale})`,
                          transformOrigin: 'top left',
                          width: `${100 / layout.scale}%`,
                        }}
                      >
                        {renderDesktopUtilityWindow(windowItem.type)}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
        </AnimatePresence>
        <AnimatePresence>
          {!useDesktopUtilityWindows && isFeatureGuideOpen && (
            <FeatureGuideModal
              key="feature-guide-modal"
              isOpen={true}
              onClose={() => setIsFeatureGuideOpen(false)}
              onStartOnboarding={startOnboardingTour}
            />
          )}
          {!useDesktopUtilityWindows && isSettingsOpen && (
            <SettingsModal
              key="settings-modal"
              config={config}
              setConfig={setConfig}
              onClose={() => setSettingsOpen(false)}
              models={models}
            />
          )}
          {!useDesktopUtilityWindows && isThirdPartyChatModalOpen && (
            <ThirdPartyChatModal
              key="third-party-modal"
              isOpen={true}
              onClose={() => setIsThirdPartyChatModalOpen(false)}
              config={config}
              setConfig={setConfig}
              backendUrl={BACKEND_URL}
            />
          )}
          {!useDesktopUtilityWindows && isFileManagerOpen && (
            <FileManagerModal
              workspacePath={config.workspacePath || ''}
              key="file-manager-modal"
              isOpen={true}
              onClose={() => setIsFileManagerOpen(false)}
              onSelect={fileManagerMode === 'select' ? (file) => setSelectedWorkspaceFile(file) : null}
            />
          )}
          {!useDesktopUtilityWindows && isMemoryManagerOpen && (
            <MemoryManagerModal
              key="memory-modal"
              isOpen={true}
              onClose={() => setIsMemoryManagerOpen(false)}
              chatHistory={history}
            />
          )}
          {!useDesktopUtilityWindows && isSkillManagerOpen && (
            <SkillManagerModal
              key="skill-modal"
              isOpen={true}
              onClose={() => setIsSkillManagerOpen(false)}
            />
          )}
          {!useDesktopUtilityWindows && isPluginMarketplaceOpen && (
            <PluginMarketplaceModal
              key="plugin-marketplace-modal"
              isOpen={true}
              onClose={() => setIsPluginMarketplaceOpen(false)}
            />
          )}
          {!useDesktopUtilityWindows && isHostedTasksOpen && (
            <HostedTasksModal
              key="hosted-tasks-modal"
              isOpen={true}
              onClose={() => setIsHostedTasksOpen(false)}
              config={config}
              setConfig={setConfig}
              BACKEND_URL={BACKEND_URL}
            />
          )}
        </AnimatePresence>
      {isCommandPaletteOpen && (
        <div
          className="fixed inset-0 z-[130] bg-slate-950/45 backdrop-blur-sm px-4 py-10"
          onClick={closeCommandPalette}
        >
          <div
            className="mx-auto flex h-full max-h-[min(42rem,calc(100vh-5rem))] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] border border-white/40 dark:border-white/10 bg-white/95 dark:bg-[#161720]/95 shadow-2xl backdrop-blur-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-gray-100 dark:border-white/10 px-4 py-2.5">
              <div className="flex items-center gap-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 px-3.5 py-2 shadow-sm">
                <Search size={16} className="text-gray-400" />
                <input
                  ref={commandPaletteInputRef}
                  value={commandPaletteQuery}
                  onChange={(event) => {
                    setCommandPaletteQuery(event.target.value);
                    setCommandPaletteIndex(0);
                  }}
                  onKeyDown={handleCommandPaletteKeyDown}
                  placeholder={getLocalText('搜索对话或跳转到功能…', 'Search chats or jump to a feature...')}
                  className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500"
                />
                <div className="hidden rounded-lg bg-gray-100 dark:bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-gray-500 dark:text-gray-400 sm:block">
                  {navigator.platform?.toLowerCase?.().includes('mac') ? 'Cmd K' : 'Ctrl K'}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3">
              {commandPaletteResults.length === 0 ? (
                <div className="flex h-full items-center justify-center rounded-[1.5rem] border border-dashed border-gray-200 bg-gray-50/70 text-sm text-gray-500">
                  {getLocalText('没有匹配的历史或功能', 'No matching chats or actions')}
                </div>
              ) : (
                <div className="space-y-1">
                  {commandPaletteResults.map((item, index) => {
                    const Icon = item.icon;
                    const isActive = index === commandPaletteIndex;
                    return (
                      <button
                        key={`${item.type}-${item.id}`}
                        onClick={() => handleCommandPaletteSelect(item)}
                        onMouseEnter={() => setCommandPaletteIndex(index)}
                        className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all ${
                          isActive ? 'bg-[#ff75ac]/15 text-[#ff75ac] dark:text-[#ff9bc8] shadow-sm' : 'hover:bg-gray-50 dark:hover:bg-white/5 text-gray-700 dark:text-gray-200'
                        }`}
                      >
                        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${isActive ? 'bg-gradient-to-br from-[#ff75ac] to-[#ff5b9a] text-white' : 'bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400'}`}>
                          <Icon size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold">{item.label || item.title}</span>
                            {item.type === 'chat' && item.isPending && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                                {getLocalText('进行中', 'Pending')}
                              </span>
                            )}
                          </div>
                          <div className="truncate text-xs text-gray-500">
                            {item.description || item.external?.title || item.source || ''}
                          </div>
                        </div>
                        <ChevronRight size={16} className={isActive ? 'text-[#ff75ac]' : 'text-gray-300 dark:text-gray-600'} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <CharacterView lowResourceMode={window.__SAKI_RUNTIME__?.profile === 'light' || window.__SAKI_RUNTIME__?.animations === false}
        currentExpression={currentExpression}
        isOpen={isCharacterViewOpen}
        setIsOpen={setCharacterViewOpen}
        triggerAnimation={animationTrigger}
      />
      <OnboardingTour
        isOpen={isOnboardingActive}
        steps={onboardingSteps}
        stepIndex={onboardingStepIndex}
        onNext={advanceOnboarding}
        onSkip={finishOnboarding}
        labels={onboardingLabels}
        refreshToken={onboardingRefreshToken}
      />
      {approvalRequest && !isGenerating && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-xl rounded-3xl border border-white/20 dark:border-white/10 bg-white/95 dark:bg-[#161822]/95 p-6 shadow-2xl backdrop-blur-xl text-gray-900 dark:text-gray-100">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-600">
              {getLocalText('敏感操作确认', 'Sensitive Action')}
            </div>
            <h2 className="mt-2 text-xl font-bold text-gray-900 dark:text-white">
              {getLocalText('需要你的确认', 'Approval required')}
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
              {getLocalText(
                '当前处于默认权限。下面这项敏感操作只有在你确认后才会继续执行。',
                'Default permission is active. This sensitive action will continue only after you approve it.'
              )}
            </p>

            <div className="mt-5 space-y-3">
              <div className="rounded-2xl bg-gray-50 dark:bg-white/5 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                  {getLocalText('工具', 'Tool')}
                </div>
                <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                  {approvalRequest.toolName || 'unknown'}
                </div>
              </div>

              <div className="rounded-2xl bg-gray-50 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                  {getLocalText('原因', 'Reason')}
                </div>
                <div className="mt-1 text-sm leading-6 text-gray-700 dark:text-gray-200">
                  {getApprovalReasonText(approvalRequest)}
                </div>
              </div>

              <div className="rounded-2xl bg-slate-950 px-4 py-3 text-white">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {getLocalText('请求内容', 'Requested action')}
                </div>
                <pre className="mt-2 whitespace-pre-wrap break-all text-xs leading-6 text-slate-100">
                  {approvalRequest.summary || (approvalRequest.args || []).join(', ')}
                </pre>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => handleApprovalDecision(false)}
                className="rounded-2xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-100"
              >
                {getLocalText('取消', 'Cancel')}
              </button>
              <button
                onClick={() => handleApprovalDecision(true)}
                className="rounded-2xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-amber-500/25 transition hover:bg-amber-600"
              >
                {getLocalText('确认继续', 'Approve and continue')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </Suspense>
  );
}

export default App;
