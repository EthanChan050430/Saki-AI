import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Chat from './components/Chat';
import Header from './components/Header';
import SettingsModal from './components/SettingsModal';
import FeatureGuideModal from './components/FeatureGuideModal';
import OnboardingTour from './components/OnboardingTour';
import ThirdPartyChatModal from './components/ThirdPartyChatModal';
import FileManagerModal from './components/FileManagerModal';
import MemoryManagerModal from './components/MemoryManagerModal';
import SkillManagerModal from './components/SkillManagerModal';
import HostedTasksModal from './components/HostedTasksModal';
import CharacterView from './components/CharacterView';
import CherryBlossoms from './components/CherryBlossoms';
import axios from 'axios';
import html2canvas from 'html2canvas';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Search, MessageSquare, Plus, Settings2, FolderOpen, Brain, Wrench, Clock3, MessageCircle, ChevronRight, X, BookOpen } from 'lucide-react';
import { BACKEND_URL } from './utils/backendUrl';
import {
  API_CHAT_PROVIDER_IDS,
  API_PROVIDER_DEFAULTS,
  getProviderApiKey,
  getProviderBaseUrl,
  migrateApiProviderConfig,
} from './utils/chatProviderConfig';
import { getTiledWindowMotion, tiledOverlayMotion } from './utils/modalMotion';
const MODELS_CACHE_KEY = 'agent_models_combined_v4';
const MODEL_FETCH_DEBOUNCE_MS = 250;
const AGENT_PERMISSION_MODE_DEFAULT = 'default';
const AGENT_PERMISSION_MODE_FULL = 'full-access';
const MOBILE_BREAKPOINT = 768;
const UTILITY_WINDOW_LIMIT = 4;
const CONTEXT_DEFAULT_BUDGET_TOKENS = 32000;
const CONTEXT_AUTO_COMPRESS_RATIO = 0.82;
const CONTEXT_RECENT_MESSAGE_COUNT = 8;
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

function pickLocalizedText(language, zhText, enText) {
  return String(language || '').toLowerCase().startsWith('zh') ? zhText : enText;
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

function estimateContextTokenCount(text = '') {
  const source = String(text || '');
  if (!source) return 0;
  const cjkChars = (source.match(/[\u3400-\u9fff]/g) || []).length;
  const nonCjkChars = Math.max(0, source.length - cjkChars);
  return Math.ceil(cjkChars * 0.65 + nonCjkChars / 3.8);
}

function getContextBudgetTokens(provider = '', model = '', config = {}) {
  const configured = Number(config?.agentContextBudgetTokens || config?.contextBudgetTokens || config?.contextWindowTokens);
  if (Number.isFinite(configured) && configured >= 8000) return Math.floor(configured);

  const modelId = String(model || '').toLowerCase();
  if (modelId.includes('claude-3-7') || modelId.includes('claude-sonnet-4') || modelId.includes('claude-opus-4')) return 180000;
  if (modelId.includes('gemini-1.5') || modelId.includes('gemini-2')) return 120000;
  if (modelId.includes('gpt-4.1') || modelId.includes('gpt-5') || modelId.includes('o3') || modelId.includes('o4')) return 120000;
  if (String(provider || '').toLowerCase() === 'ollama') return 32768;
  return CONTEXT_DEFAULT_BUDGET_TOKENS;
}

function compactContextText(text = '', maxChars = 700) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 18)).trim()} ...[truncated]`;
}

function serializeMessageForContextEstimate(message = {}) {
  if (!message) return '';

  let text = String(message.content || '').trim();
  if (message.role === 'assistant') {
    const partsText = Array.isArray(message.parts)
      ? message.parts.map((part) => {
          if (part?.type === 'text') return String(part.content || '');
          if (part?.type === 'action') {
            const args = (part.data?.args || [])
              .map((arg) => `"${compactContextText(arg, 600).replace(/"/g, '\\"')}"`)
              .join(', ');
            const observation = compactContextText(part.observation || '', 500);
            return `Tool: ${part.data?.type || 'unknown'}(${args})${observation ? `\nObservation: ${observation}` : ''}`;
          }
          return '';
        }).filter(Boolean).join('\n')
      : '';

    const structuredParts = [
      message.deepReadingData?.summary || message.deepReadingData?.reportHtml,
      message.pptData?.title || message.pptData?.summary,
      message.credibilityCheckData?.summary,
      message.storyGlassData?.sakiComment || message.storyGlassData?.storySummary,
    ].filter(Boolean).map((item) => compactContextText(item, 900));

    text = [text, partsText, ...structuredParts].filter(Boolean).join('\n');
  }

  if (!text) return '';
  return `${message.role === 'user' ? 'User' : 'Assistant'}: ${text}`;
}

function calculateContextStatusFromMessages(messages = [], config = {}) {
  const sourceMessages = Array.isArray(messages) ? messages : [];
  if (sourceMessages.length === 0) return null;

  const budgetTokens = getContextBudgetTokens(config.provider, config.model, config);
  const formattedHistory = sourceMessages
    .map(serializeMessageForContextEstimate)
    .filter(Boolean)
    .join('\n');
  const usedTokens = estimateContextTokenCount(formattedHistory) + 5500;
  const autoCompressThreshold = Math.max(8000, Math.floor(budgetTokens * CONTEXT_AUTO_COMPRESS_RATIO));
  const shouldCompress = usedTokens > autoCompressThreshold && sourceMessages.length > CONTEXT_RECENT_MESSAGE_COUNT;
  const keptRecentMessages = shouldCompress
    ? Math.min(CONTEXT_RECENT_MESSAGE_COUNT, sourceMessages.length)
    : sourceMessages.length;

  return {
    usedTokens,
    budgetTokens,
    percent: Math.min(100, Math.round((usedTokens / Math.max(1, budgetTokens)) * 100)),
    compressed: false,
    state: shouldCompress ? 'near-compression' : 'estimated',
    estimated: true,
    messageCount: sourceMessages.length,
    keptRecentMessages,
    compressedMessages: shouldCompress ? Math.max(0, sourceMessages.length - keptRecentMessages) : 0,
    updatedAt: new Date().toISOString(),
  };
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
  const content = '[expression:happy.png]嗨嗨，我来啦~ 今天想先聊什么呀？(๑˃▽˂๑) 不管是想认真搞点事情，还是随便唠唠，我都陪你呀～[expression:shy.png]';
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
  const [history, setHistory] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [currentPendingRequest, setCurrentPendingRequest] = useState(null);
  const latestMessagesRef = useRef([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [contextStatus, setContextStatus] = useState(null);
  const abortControllerRef = useRef(null);
  const [isMobileViewport, setIsMobileViewport] = useState(isMobileViewportWidth());
  const mobileViewportRef = useRef(isMobileViewportWidth());
  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState('');
  const [commandPaletteIndex, setCommandPaletteIndex] = useState(0);
  const [composerPreset, setComposerPreset] = useState(null);
  const [isOnboardingActive, setIsOnboardingActive] = useState(false);
  const [onboardingStepIndex, setOnboardingStepIndex] = useState(0);
  const commandPaletteInputRef = useRef(null);

  // Deep Reading State
  const [deepReadingData, setDeepReadingData] = useState(null);
  const [isStoryGlassOverlayOpen, setIsStoryGlassOverlayOpen] = useState(false);

  // Keep ref in sync
  useEffect(() => {
    latestMessagesRef.current = messages;
  }, [messages]);
  const [models, setModels] = useState([decorateModel({ name: 'llama3', label: 'llama3', provider: 'ollama' })]);
  const [isSidebarOpen, setSidebarOpen] = useState(!isMobileViewportWidth());
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [isFeatureGuideOpen, setIsFeatureGuideOpen] = useState(false);
  const [isThirdPartyChatModalOpen, setIsThirdPartyChatModalOpen] = useState(false);
  const [isFileManagerOpen, setIsFileManagerOpen] = useState(false);
  const [isMemoryManagerOpen, setIsMemoryManagerOpen] = useState(false);
  const [isSkillManagerOpen, setIsSkillManagerOpen] = useState(false);
  const [isHostedTasksOpen, setIsHostedTasksOpen] = useState(false);
  const [desktopUtilityWindows, setDesktopUtilityWindows] = useState([]);
  const [fileManagerMode, setFileManagerMode] = useState('manage'); // 'manage' or 'select'
  const [selectedWorkspaceFile, setSelectedWorkspaceFile] = useState(null);
  const [isCharacterViewOpen, setCharacterViewOpen] = useState(false);
  const [currentExpression, setCurrentExpression] = useState('normal.png');
  const [animationTrigger, setAnimationTrigger] = useState(null);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const musicRef = useRef(new Audio('/assets/HiSchool.wav'));
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

  // Trigger hello animation on initial load
  useEffect(() => {
    if (isConfigLoaded) {
      setAnimationTrigger({ type: 'hello', timestamp: Date.now() });
    }
  }, [isConfigLoaded]);

  // Trigger hello animation on session switch or new session
  useEffect(() => {
    if (currentChatId) {
      // Don't override if a working animation is already requested in the same cycle
      setAnimationTrigger(prev => {
        if (prev && CHARACTER_ACTIVITY_ANIMATIONS.has(prev.type)) return prev;
        return { type: 'hello', timestamp: Date.now() };
      });
    }
  }, [currentChatId]);

  const exportToImage = async () => {
    if (!chatContainerRef.current) return;
    
    // Create a clones of the container for better rendering
    const element = chatContainerRef.current;
    
    try {
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
            // Hide the scroll-to-bottom anchor if it exists
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
    if (isMusicPlaying) {
      musicRef.current.pause();
      musicRef.current.currentTime = 0;
      setAnimationTrigger({ type: 'stop', timestamp: Date.now() });
      setIsMusicPlaying(false);
    } else {
      musicRef.current.loop = true;
      musicRef.current.play().catch(err => console.error("Audio play failed:", err));
      setAnimationTrigger({ type: 'dance', loop: true, timestamp: Date.now() });
      setIsMusicPlaying(true);
    }
  };

  const handleStoryGlassModeChange = useCallback((enabled) => {
    if (isGenerating) return;

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

  // Auto-speak logic when music mode is on
  useEffect(() => {
    if (isMusicPlaying && messages.length > 0 && !isGenerating) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'assistant') {
        const textToSpeak = lastMsg.parts
          .filter(p => p.type === 'text')
          .map(p => p.content.replace(/\[expression:.*?\.png\]/g, '').replace(/```[\s\S]*?```/g, '').trim())
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
    const saved = localStorage.getItem('agent_config');
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
      systemPrompt: '你是16岁的少女Saki（诗琪）。你知识渊博，特别喜欢读书，说话很有少女感，语气亲切，经常使用“呢”、“呀”、“~”等语气词。\n\n在每一个回复中，你必须遵循以下绝对规则：\n1. **严禁输出 "Tool" 或 "Thought" 等前缀**：直接以少女的身份开始对话，不要带有任何系统标识符。\n2. **开头表情**：回复的第一行必须包含一个表情标记 `[expression:文件名.png]`。例如：确认时用 `[expression:ok.png]`；思考时用 `[expression:think.png]`；普通开始用 `[expression:normal.png]`。\n3. **结束表情**：回复的结束也必须带上一个表情标记，如 `[expression:happy.png]`。\n4. 可选表情列表：normal.png, ok.png, no_problem.png, think.png, busy.png, excited.png, happy.png, shy.png, worry.png。\n\n请始终保持Saki（诗琪）的身份进行对话。'
    };

    if (saved) {
      const parsed = migrateApiProviderConfig(JSON.parse(saved));
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
      selector: '[data-onboarding-id="header-model-switcher"]',
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
    const cachedConfig = localStorage.getItem('agent_config');
    if (cachedConfig) {
      try {
        const parsed = migrateApiProviderConfig(JSON.parse(cachedConfig));
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
        localStorage.setItem('agent_config', JSON.stringify(normalizedConfig));
      }
      setIsConfigLoaded(true);
    }).catch(err => {
      console.error('Failed to load global config:', err);
      setIsConfigLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!isConfigLoaded) return;

    // Cache to localStorage
    try {
      localStorage.setItem('agent_config', JSON.stringify(config));
      // Also sync to backend
      axios.post(`${BACKEND_URL}/api/config`, config).catch(err => {
        console.error('Failed to save global config to backend:', err);
      });
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
        console.error('LocalStorage quota exceeded!', e);
      }
    }
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
    const cachedModels = localStorage.getItem(MODELS_CACHE_KEY);
    if (cachedModels) {
      try {
        setModels(JSON.parse(cachedModels));
      } catch (e) {}
    }

    let isCancelled = false;

    const fetchAllModels = async () => {
      let combinedModels = [];

      // 1. Fetch Ollama Models
      try {
        const ollamaRes = await axios.get(`${BACKEND_URL}/api/models`, { 
          params: { ollamaUrl: config.ollamaUrl } 
        });
        const ollamaModels = mapCatalogModels(ollamaRes.data || [], 'ollama');
        combinedModels = [...combinedModels, ...ollamaModels];
      } catch (err) {
        console.error('Failed to fetch Ollama models:', err);
      }

      // 1.5. Fetch LMStudio Models
      try {
        const lmstudioRes = await axios.get(`${BACKEND_URL}/api/lmstudio/models`, { 
          params: { lmstudioUrl: config.lmstudioUrl } 
        });
        const lmstudioModels = mapCatalogModels(lmstudioRes.data || [], 'lmstudio');
        combinedModels = [...combinedModels, ...lmstudioModels];
      } catch (err) {
        console.error('Failed to fetch LMStudio models:', err);
      }

      // 2. Fetch GitHub Models
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

      // 3. Fetch enabled API provider models
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

      combinedModels = ensureCurrentModelInCatalog(dedupeModels(combinedModels), config);

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
    return new Intl.DateTimeFormat(String(uiLanguage || '').toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US', {
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

  const confirmLeaveActiveResearch = () => {
    if (!deepReadingData) return true;
    return window.confirm("褰撳墠娣卞害闃呰灏氭湭瀹屾垚锛屽垏鎹㈣亰澶╁皢瀵艰嚧鏁版嵁涓㈠け銆傜‘瀹氳缁х画鍚楋紵");
  };

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
      if (!window.confirm("当前深度阅读尚未完成，切换聊天将导致数据丢失。确定要继续吗？")) {
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
      if (!window.confirm("当前深度阅读尚未完成，切换聊天将导致数据丢失。确定要继续吗？")) {
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
        // Refresh sidebar history
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
    
    // Remove the two messages
    newMessages.splice(idx - 1, 2);
    setMessages(newMessages);
    latestMessagesRef.current = newMessages;
    setContextStatus(calculateContextStatusFromMessages(newMessages, config));
    saveChatToBackend(currentChatId, newMessages);
    
    return userContent;
  };

  const sendMessage = async (text, files = [], options = {}) => {
    if (isGenerating) return;
    
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

    // Prepare streaming response
    const assistantMsgId = Date.now();
    const assistantMsg = { role: 'assistant', parts: [], generatedFiles: [], id: assistantMsgId };
    const messagesWithAssistant = [...newMessages, assistantMsg];
    setMessages(messagesWithAssistant);
    latestMessagesRef.current = messagesWithAssistant;
    setContextStatus(calculateContextStatusFromMessages(messagesWithAssistant, config));

    // Save initial state (User + Assistant skeleton)
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

    // Handle Initial expressions
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

            if (data.contextStatus) {
              setContextStatus(data.contextStatus);
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

            if (data.text || data.action || data.observation || data.fileMetadata || data.generatedFile) {
              // Stop thinking animation when content starts arriving
              setAnimationTrigger(prev => {
                if (prev && prev.type === 'thinking') {
                  return { type: 'stop', timestamp: Date.now() };
                }
                return prev;
              });

              setMessages(prev => {
                const updated = prev.map(m => {
                  if (m.id === assistantMsgId) {
                    const parts = [...m.parts];
                    if (data.text) {
                      const lastIndex = parts.length - 1;
                      let newContent = data.text;
                      if (lastIndex >= 0 && parts[lastIndex].type === 'text') {
                        const updatedContent = parts[lastIndex].content + data.text;
                        parts[lastIndex] = { ...parts[lastIndex], content: updatedContent };
                        newContent = updatedContent;
                      } else {
                        const textPart = { type: 'text', content: data.text };
                        parts.push(textPart);
                        newContent = data.text;
                      }
                      
                      // Check for expression marker in the text (only in non-deep-reading mode)
                      if (!options.useWeb) {
                        // Extract filename.png from [expression:filename.png]
                        // Using a greedy approach to find the latest completed marker
                        const expressionRegex = /\[expression:\s*([\w.-]+)\s*\]/g;
                        const expressionMatches = [...newContent.matchAll(expressionRegex)];
                        if (expressionMatches.length > 0) {
                          const lastMatch = expressionMatches[expressionMatches.length - 1];
                          const fileName = lastMatch[1].trim();
                          if (fileName) {
                            setCurrentExpression(fileName);
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
                    return { ...m, parts, generatedFiles };
                  }
                  return m;
                });
                latestMessagesRef.current = updated;
                return updated;
              });
            }
          } catch (e) {
            console.warn('Failed to parse SSE line:', trimmedLine, e);
          }
        }
        if (stopSignalReceived) break;
      }
    } catch (error) {
       if (error.name === 'AbortError') {
         console.log('Generation aborted by user');
       } else {
         console.error('Chat error:', error);
         // Optionally push an error message to chat
         setMessages(prev => [...prev, { role: 'assistant', parts: [{ type: 'text', content: `Error: ${error.message}` }], id: Date.now() }]);
       }
    } finally {
      setIsGenerating(false);
      const keepStoryGlassTasting = options.useStoryGlass && storyGlassTastingStarted;
      if ((options.useStoryGlass && !keepStoryGlassTasting) || options.useWeb || options.usePpt || options.useTruthCheck) {
        setCurrentExpression('ok.png');
        setAnimationTrigger({ type: 'stop', timestamp: Date.now() });
      }
      
      // Resume dance if music mode is on
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
    return axios.post(`${BACKEND_URL}/api/history`, {
      chatId,
      messages: currentMessages,
      pendingRequest,
      clientSavedAt: Date.now()
    }).then(() => {
      refreshHistory();
    });
  };

  const handleStartNewChat = () => {
    if (!confirmLeaveActiveResearch()) return;
    setDeepReadingData(null);
    setCurrentPendingRequest(null);
    const newChatId = Date.now().toString();
    const greetingMessages = [createCuteGreetingMessage()];
    setCurrentChatId(newChatId);
    setContextStatus(calculateContextStatusFromMessages(greetingMessages, config));
    setMessages(greetingMessages);
    latestMessagesRef.current = greetingMessages;
    persistChatState(newChatId, greetingMessages, null);
  };

  const handleLoadChat = (chatId) => {
    if (!confirmLeaveActiveResearch()) return;
    setDeepReadingData(null);
    setCurrentChatId(chatId);
    axios.get(`${BACKEND_URL}/api/history/${chatId}`).then(res => {
      const loadedMessages = res.data.messages || [];
      setMessages(loadedMessages);
      latestMessagesRef.current = loadedMessages;
      setCurrentPendingRequest(res.data.pendingRequest || null);
      setContextStatus(calculateContextStatusFromMessages(loadedMessages, config));
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
    if (isGenerating) return;

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
    if (isGenerating) return;

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
    const generationStartTime = Date.now();
    setCurrentPendingRequest(pendingRequest);
    setIsGenerating(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    let completed = false;
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
          config,
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
        if (done) break;

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

            if (data.contextStatus) {
              setContextStatus(data.contextStatus);
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
              nextPendingRequest = {
                ...(nextPendingRequest || pendingRequest || {}),
                approvalRequest: data.approvalRequest
              };
              setCurrentPendingRequest(nextPendingRequest);
              persistChatState(activeChatId, latestMessagesRef.current, nextPendingRequest);
              continue;
            }

            if (data.text || data.action || data.observation || data.fileMetadata || data.generatedFile) {
              setAnimationTrigger(prev => {
                if (prev && prev.type === 'thinking') {
                  return { type: 'stop', timestamp: Date.now() };
                }
                return prev;
              });

              setMessages(prev => {
                const updated = prev.map(m => {
                  if (m.id === assistantMsgId) {
                    const parts = Array.isArray(m.parts) ? [...m.parts] : [];
                    let rawText = m.rawText || '';
                    if (data.text) {
                      const lastIndex = parts.length - 1;
                      let newContent = data.text;
                      if (lastIndex >= 0 && parts[lastIndex].type === 'text') {
                        const updatedContent = parts[lastIndex].content + data.text;
                        parts[lastIndex] = { ...parts[lastIndex], content: updatedContent };
                        newContent = updatedContent;
                      } else {
                        parts.push({ type: 'text', content: data.text });
                        newContent = data.text;
                      }

                      rawText += data.text;

                      if (!options.useWeb) {
                        const expressionRegex = /\[expression:\s*([\w.-]+)\s*\]/g;
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
                    return { ...m, parts, generatedFiles, rawText, status: 'streaming' };
                  }
                  return m;
                });
                latestMessagesRef.current = updated;
                return updated;
              });
            }
          } catch (e) {
            console.warn('Failed to parse SSE line:', trimmedLine, e);
          }
        }

        if (stopSignalReceived) break;
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Generation aborted by user');
      } else {
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
      setIsGenerating(false);
      const keepStoryGlassTasting = options.useStoryGlass && storyGlassTastingStarted;
      if ((options.useStoryGlass && !keepStoryGlassTasting) || options.useWeb || options.usePpt || options.useTruthCheck) {
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
      const finalPendingRequest = completed ? null : nextPendingRequest;
      const durationMs = Date.now() - generationStartTime;
      setMessages(prevMsgs => {
        const newMsgs = prevMsgs.map(message => (
          message.id === assistantMsgId
            ? (() => {
                const enhancedMessage = maybeAppendModelSettingsGuidance(message, uiLanguage);
                return {
                  ...enhancedMessage,
                  generationDurationMs: durationMs,
                  status: completed
                    ? (enhancedMessage.status === 'error' ? 'error' : 'done')
                    : (enhancedMessage.status === 'error' ? 'error' : 'interrupted')
                };
              })()
            : message
        ));
        latestMessagesRef.current = newMsgs;
        return newMsgs;
      });
      setCurrentPendingRequest(finalPendingRequest);
      persistChatState(activeChatId, latestMessagesRef.current, finalPendingRequest);
    }
  };

  const sendMessageWithContext = async ({ text, files = [], options = {}, baseMessages = null }) => {
    if (isGenerating) return;

    let activeChatId = currentChatId;
    if (!activeChatId) {
      activeChatId = Date.now().toString();
      setCurrentChatId(activeChatId);
    }

    const historyBase = Array.isArray(baseMessages) ? baseMessages : (latestMessagesRef.current || []);
    const normalizedOptions = {
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
  };

  const handleSendMessage = async (text, files = [], options = {}) => {
    await sendMessageWithContext({ text, files, options });
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
    if (isGenerating) return;

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
    if (isGenerating) return;
    if (!confirmLeaveActiveResearch()) return;

    try {
      const res = await axios.get(`${BACKEND_URL}/api/history/${chatId}`);
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
    }
  };

  const handleApprovalDecision = async (approved) => {
    if (isGenerating) return;

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
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

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
    <div 
      className="flex h-screen bg-[#f3f4f6] text-[#374151] font-sans overflow-hidden"
      style={config.chatBackgroundImage ? {
        backgroundImage: `url('${config.chatBackgroundImage}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed'
      } : {}}
    >
      <Sidebar 
        isOpen={isSidebarOpen} 
        setOpen={setSidebarOpen} 
        history={history} 
        currentChatId={currentChatId}
        onSelectChat={handleLoadChat} 
        onDeleteChat={handleDeleteChat}
        onNewChat={handleStartNewChat}
        onContinueChat={handleContinuePendingChat}
        onToggleGuide={toggleFeatureGuideModal}
        onToggleSettings={toggleSettingsModal}
        onToggleFileManager={() => toggleFileManagerModal('manage')}
        onToggleMemoryManager={toggleMemoryManagerModal}
        onToggleSkillManager={toggleSkillManagerModal}
        onToggleHostedTasks={toggleHostedTasksModal}
        onToggleThirdPartyChats={toggleThirdPartyChatModal}
        activeUtilityKeys={activeUtilityKeys}
        isUtilityLayerActive={useDesktopUtilityWindows && desktopUtilityWindows.length > 0}
      />
      <div className="flex-1 flex flex-col relative overflow-hidden bg-white/20 backdrop-blur-sm shadow-2xl">
        {config.showParticles && <CherryBlossoms />}
        <Header 
          config={config} 
          setConfig={setConfig} 
          models={models}
          toggleSidebar={() => setSidebarOpen(!isSidebarOpen)} 
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          onExport={exportToImage}
          isMusicPlaying={isMusicPlaying}
          onToggleMusic={toggleMusicMode}
          hasMessages={messages.length > 0}
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
               isGenerating={isGenerating}
               onStop={stopGeneration}
               onSkipAction={handleSkipAction}
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
            />
          </motion.div>
        </AnimatePresence>
        <AnimatePresence>
          {useDesktopUtilityWindows && desktopUtilityWindows.length > 0 && (
          <motion.div
            key="desktop-utility-overlay"
            {...tiledOverlayMotion}
            className="fixed inset-0 z-[105] pointer-events-none"
          >
            <div className="absolute inset-0 bg-slate-950/18 backdrop-blur-[2px] pointer-events-auto" />
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
                  className="inline-flex items-center gap-2 rounded-full border border-white/50 bg-white/78 px-4 py-2 text-sm font-semibold text-slate-700 shadow-[0_20px_60px_rgba(15,23,42,0.18)] transition-colors hover:bg-white"
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
                    <div className="h-full w-full overflow-hidden rounded-[32px] border border-white/45 bg-white/60 shadow-[0_28px_90px_rgba(15,23,42,0.28)] backdrop-blur-xl">
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
      </div>
      {isCommandPaletteOpen && (
        <div
          className="fixed inset-0 z-[130] bg-slate-950/45 backdrop-blur-sm px-4 py-10"
          onClick={closeCommandPalette}
        >
          <div
            className="mx-auto flex h-full max-h-[min(42rem,calc(100vh-5rem))] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] border border-white/20 bg-white/95 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                <Search size={18} className="text-gray-400" />
                <input
                  ref={commandPaletteInputRef}
                  value={commandPaletteQuery}
                  onChange={(event) => {
                    setCommandPaletteQuery(event.target.value);
                    setCommandPaletteIndex(0);
                  }}
                  onKeyDown={handleCommandPaletteKeyDown}
                  placeholder={getLocalText('搜索对话或跳转到功能…', 'Search chats or jump to a feature...')}
                  className="flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
                />
                <div className="hidden rounded-xl bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-500 sm:block">
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
                          isActive ? 'bg-blue-50 text-blue-700 shadow-sm' : 'hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${isActive ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
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
                        <ChevronRight size={16} className={isActive ? 'text-blue-500' : 'text-gray-300'} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <CharacterView 
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
          <div className="w-full max-w-xl rounded-3xl border border-white/20 bg-white/95 p-6 shadow-2xl backdrop-blur-xl">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-600">
              {getLocalText('敏感操作确认', 'Sensitive Action')}
            </div>
            <h2 className="mt-2 text-xl font-bold text-gray-900">
              {getLocalText('需要你的确认', 'Approval required')}
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              {getLocalText(
                '当前处于默认权限。下面这项敏感操作只有在你确认后才会继续执行。',
                'Default permission is active. This sensitive action will continue only after you approve it.'
              )}
            </p>

            <div className="mt-5 space-y-3">
              <div className="rounded-2xl bg-gray-50 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                  {getLocalText('工具', 'Tool')}
                </div>
                <div className="mt-1 text-sm font-semibold text-gray-900">
                  {approvalRequest.toolName || 'unknown'}
                </div>
              </div>

              <div className="rounded-2xl bg-gray-50 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                  {getLocalText('原因', 'Reason')}
                </div>
                <div className="mt-1 text-sm leading-6 text-gray-700">
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
  );
}

export default App;
