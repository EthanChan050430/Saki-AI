import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Cpu, Terminal, Shield, ExternalLink, RefreshCw, CheckCircle2, Search, Image, ChevronDown, UserCircle, Palette, Plus, Globe, Bot, Volume2, Mic, Music2, Trash2, Brain } from 'lucide-react';
import { motion } from 'framer-motion';
import ImageCropperModal from './ImageCropperModal';
import botAvatar from '../head.png';
import { BACKEND_URL } from '../utils/backendUrl';
import {
  CHAT_PROVIDER_OPTIONS,
  getApiProviderMeta,
  getChatProviderName,
  getChatProviderSubtitle,
  getProviderApiKey,
  getProviderBaseUrl,
  isApiProviderEnabled,
  isChatProviderEnabled,
} from '../utils/chatProviderConfig';
import { modalBackdropMotion, modalPanelMotion } from '../utils/modalMotion';
import { CHAT_BACKGROUNDS, getChatBackgroundPreset, getChatBackgroundSource, selectChatBackground } from '../utils/chatAppearance';
import { localizeWith } from '../utils/localize';
import { fetchProviderModels, normalizeCopilotModelName } from '../utils/modelRefresh';
import {
  getLocalTtsState,
  subscribeLocalTtsStatus,
  initLocalTts,
  synthesizeLocalSentence,
  playFloat32Audio,
} from '../utils/localTtsEngine';

export default function SettingsModal({ config, setConfig, onClose, models, onUpdateProviderModels, windowed = false }) {
  const { t, i18n } = useTranslation();
  const backgroundPreset = getChatBackgroundPreset(config);
  const backgroundPreview = getChatBackgroundSource(config, document.documentElement.dataset.theme, window.innerWidth < 768);
  const getLocalText = (zhText, enText, jaText) => localizeWith(i18n.resolvedLanguage || i18n.language, zhText, enText, jaText);
  const activeApiProvider = getApiProviderMeta(config.provider);
  const activeProviderApiKey = activeApiProvider ? getProviderApiKey(config, activeApiProvider.id) : '';
  const activeProviderBaseUrl = activeApiProvider ? getProviderBaseUrl(config, activeApiProvider.id) : '';
  const configuredApiCount = CHAT_PROVIDER_OPTIONS.filter(provider => isApiProviderEnabled(config, provider.id)).length;
  const getProviderSubText = (provider) => provider.subKey ? t(provider.subKey) : getChatProviderSubtitle(provider, i18n.resolvedLanguage || i18n.language);
  const updateActiveProviderApiKey = (value) => {
    if (!activeApiProvider) return;
    setConfig({
      ...config,
      [activeApiProvider.apiKeyField]: value,
    });
  };
  const updateActiveProviderBaseUrl = (value) => {
    if (!activeApiProvider?.baseUrlField) return;
    setConfig({
      ...config,
      [activeApiProvider.baseUrlField]: value,
    });
  };
  const [deviceFlow, setDeviceFlow] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const pollTimerRef = useRef(null);
  const [sovitsModels, setSovitsModels] = useState({ gpt: [], sovits: [] });
  const [isRefreshingModels, setIsRefreshingModels] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [cacheCleanupMessage, setCacheCleanupMessage] = useState('');
  const [cacheCleanupError, setCacheCleanupError] = useState(false);
  const [customDrawingModels, setCustomDrawingModels] = useState([]);
  const [customDrawingModelsLoading, setCustomDrawingModelsLoading] = useState(false);
  const [customDrawingModelsError, setCustomDrawingModelsError] = useState('');
  const drawingModelsRequestRef = useRef(0);
  const customDrawingConfigRef = useRef(config);
  customDrawingConfigRef.current = config;
  const [apiDetectState, setApiDetectState] = useState({
    loading: false,
    error: '',
    updatedProvider: '',
    detectedByProvider: {},
  });
  const [apiModelFilter, setApiModelFilter] = useState('');
  const apiDetectRequestRef = useRef(0);
  const [allApiDetectState, setAllApiDetectState] = useState({
    loading: false,
    error: '',
    summary: '',
    results: null,
    filter: '',
  });
  const allApiDetectRequestRef = useRef(0);
  const [searxngTestState, setSearxngTestState] = useState({
    loading: false,
    result: null,
    error: '',
  });
  const sovitsAudioInputRef = useRef(null);
  useEffect(() => {
    setApiModelFilter('');
    setApiDetectState(prev => (prev.error ? { ...prev, error: '' } : prev));
  }, [config.provider]);
  useEffect(() => {
    setSearxngTestState(prev => (prev.result || prev.error ? { loading: false, result: null, error: '' } : prev));
  }, [config.searxngUrl, config.searchEngine]);

  const handleTestSearxng = async () => {
    const targetUrl = String(config.searxngUrl || '').trim();
    if (!targetUrl) {
      setSearxngTestState({
        loading: false,
        result: null,
        error: getLocalText('请先填写 SearxNG 地址', 'Please enter a SearxNG URL first', '先に SearxNG URL を入力してください'),
      });
      return;
    }
    setSearxngTestState({ loading: true, result: null, error: '' });
    try {
      const res = await fetch(`${BACKEND_URL}/api/search/searxng/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searxngUrl: targetUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setSearxngTestState({
          loading: false,
          result: null,
          error: data.error || getLocalText('SearxNG 连接测试失败', 'Failed to connect to SearxNG', 'SearxNG 接続テストに失敗しました'),
        });
        return;
      }
      setSearxngTestState({ loading: false, result: data, error: '' });
    } catch (error) {
      setSearxngTestState({
        loading: false,
        result: null,
        error: error.message || getLocalText('SearxNG 连接测试失败', 'Failed to connect to SearxNG', 'SearxNG 接続テストに失敗しました'),
      });
    }
  };

  const selectDetectedModel = (providerId, modelName) => {
    if (!providerId || !modelName) return;
    setConfig(prev => ({
      ...prev,
      provider: providerId,
      model: modelName,
      providerEnabled: {
        ...Object.fromEntries(CHAT_PROVIDER_OPTIONS.map(({ id }) => [id, isChatProviderEnabled(prev, id)])),
        [providerId]: true,
      },
    }));
  };

  const handleDetectProviderModels = async (providerId) => {
    if (!providerId) return;
    const providerTitle = getChatProviderName(providerId, i18n.resolvedLanguage || i18n.language);
    const isApi = Boolean(getApiProviderMeta(providerId));
    const baseUrl = isApi ? String(getProviderBaseUrl(config, providerId) || '').trim() : '';
    const apiKey = isApi ? String(getProviderApiKey(config, providerId) || '').trim() : '';

    if (providerId === 'custom' && !baseUrl) {
      setApiDetectState(prev => ({
        ...prev,
        loading: false,
        error: getLocalText('请先填写基础地址 (Base URL)', 'Please enter a Base URL first', '先にベース URL を入力してください'),
      }));
      return;
    }
    if (isApi && providerId !== 'custom' && !apiKey) {
      setApiDetectState(prev => ({
        ...prev,
        loading: false,
        error: getLocalText(`请先填写 ${providerTitle} API 密钥`, `Please enter your ${providerTitle} API Key first`, `先に ${providerTitle} の API キーを入力してください`),
      }));
      return;
    }

    const requestId = ++apiDetectRequestRef.current;
    setApiDetectState(prev => ({ ...prev, loading: true, error: '' }));

    try {
      const detected = await fetchProviderModels({
        backendUrl: BACKEND_URL,
        provider: providerId,
        ollamaUrl: config.ollamaUrl || '',
        lmstudioUrl: config.lmstudioUrl || '',
        copilotToken: config.copilotToken || '',
        baseUrl,
        apiKey,
      });
      if (requestId !== apiDetectRequestRef.current) return;

      setApiDetectState(prev => ({
        loading: false,
        error: '',
        updatedProvider: providerId,
        detectedByProvider: {
          ...prev.detectedByProvider,
          [providerId]: detected,
        },
      }));
      onUpdateProviderModels?.({ [providerId]: detected }, { enableProviders: [providerId] });
    } catch (error) {
      if (requestId !== apiDetectRequestRef.current) return;
      setApiDetectState(prev => ({
        ...prev,
        loading: false,
        error: error?.message || getLocalText('检测模型列表失败', 'Failed to detect models', 'モデル一覧の検出に失敗しました'),
      }));
    }
  };

  const handleDetectAllEnabledApiModels = async () => {
    const enabledProviderIds = CHAT_PROVIDER_OPTIONS
      .map(item => item.id)
      .filter(id => isChatProviderEnabled(config, id));
    const configuredIds = enabledProviderIds.filter(id => {
      if (id === 'ollama' || id === 'lmstudio') return true;
      if (id === 'copilot') return Boolean(String(config.copilotToken || '').trim());
      if (id === 'custom') return Boolean(getProviderBaseUrl(config, id).trim());
      return Boolean(getProviderApiKey(config, id).trim());
    });

    if (configuredIds.length === 0) {
      setAllApiDetectState(prev => ({
        ...prev,
        loading: false,
        summary: '',
        error: getLocalText(
          '已启用的服务商尚未填写密钥或配置端点',
          'No enabled providers have credentials or endpoints configured',
          '有効なプロバイダーにキーまたはエンドポイントが設定されていません'
        ),
      }));
      return;
    }

    const requestId = ++allApiDetectRequestRef.current;
    setAllApiDetectState(prev => ({ ...prev, loading: true, error: '', summary: '' }));

    const settled = await Promise.allSettled(
      configuredIds.map(async (providerId) => ({
        providerId,
        models: await fetchProviderModels({
          backendUrl: BACKEND_URL,
          provider: providerId,
          ollamaUrl: config.ollamaUrl || '',
          lmstudioUrl: config.lmstudioUrl || '',
          copilotToken: config.copilotToken || '',
          baseUrl: getProviderBaseUrl(config, providerId).trim(),
          apiKey: getProviderApiKey(config, providerId).trim(),
        }),
      }))
    );

    if (requestId !== allApiDetectRequestRef.current) return;

    const updatesByProvider = {};
    const failedProviders = [];
    let totalCount = 0;

    settled.forEach((result, idx) => {
      const providerId = configuredIds[idx];
      if (result.status === 'fulfilled') {
        updatesByProvider[providerId] = result.value.models;
        totalCount += result.value.models.length;
      } else {
        failedProviders.push(getChatProviderName(providerId, i18n.resolvedLanguage || i18n.language));
      }
    });

    const succeededCount = Object.keys(updatesByProvider).length;
    if (succeededCount > 0) {
      onUpdateProviderModels?.(updatesByProvider);
      setApiDetectState(prev => ({
        ...prev,
        detectedByProvider: {
          ...prev.detectedByProvider,
          ...updatesByProvider,
        },
      }));
    }

    setAllApiDetectState(prev => ({
      ...prev,
      loading: false,
      results: succeededCount > 0 ? updatesByProvider : prev.results,
      summary: succeededCount > 0
        ? getLocalText(
            `已检测 ${succeededCount} 个服务商，共 ${totalCount} 个可用模型 · 列表已更新`,
            `Detected ${totalCount} models across ${succeededCount} provider(s) · List updated`,
            `${succeededCount} 個のプロバイダーから ${totalCount} 個のモデルを検出・更新しました`
          )
        : '',
      error: failedProviders.length > 0
        ? getLocalText(
            `部分检测失败：${failedProviders.join('、')}`,
            `Failed for: ${failedProviders.join(', ')}`,
            `検出失敗：${failedProviders.join('・')}`
          )
        : '',
    }));
  };

  const getProviderCatalogModels = (providerId) => {
    if (!providerId) return [];
    if (Object.prototype.hasOwnProperty.call(apiDetectState.detectedByProvider, providerId)) {
      return apiDetectState.detectedByProvider[providerId] || [];
    }
    return Array.isArray(models)
      ? models.filter(m => m?.provider === providerId && m?.label !== `${m?.name} (current)`)
      : [];
  };

  const renderSelectableModelButtons = (providerId, modelList = []) => {
    const normalizedActiveModel = providerId === 'copilot'
      ? normalizeCopilotModelName(config.model)
      : config.model;
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {modelList.map(model => {
          const isSelected = config.provider === providerId && normalizedActiveModel === model.name;
          return (
            <button
              key={`${providerId}:${model.name}`}
              type="button"
              onClick={() => selectDetectedModel(providerId, model.name)}
              title={model.name}
              className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-all min-w-0 ${
                isSelected
                  ? 'border-[#ff75ac] bg-[#ff75ac]/12 text-[#ff75ac] dark:text-[#ff9bc8] font-semibold'
                  : 'border-[var(--surface-border-subtle)] bg-[var(--surface-bg)] text-[var(--text-dark)] hover:border-[#ff75ac]/45 hover:bg-[#ff75ac]/5'
              }`}
            >
              <span className="truncate">{model.label || model.name}</span>
              <span className="flex items-center gap-1 shrink-0">
                {model.supportsVision && <Image size={11} className="text-sky-500" />}
                {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-[#ff75ac]" />}
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  const renderProviderDetectPanel = (providerId, hintText) => {
    const providerModels = getProviderCatalogModels(providerId);
    const hasDetected = Object.prototype.hasOwnProperty.call(apiDetectState.detectedByProvider, providerId);
    const filteredModels = apiModelFilter.trim()
      ? providerModels.filter(m => `${m.label || ''} ${m.name || ''}`.toLowerCase().includes(apiModelFilter.trim().toLowerCase()))
      : providerModels;

    return (
      <>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
          <p className="text-[10px] text-[var(--text-tertiary)]">{hintText}</p>
          <button
            type="button"
            onClick={() => handleDetectProviderModels(providerId)}
            disabled={apiDetectState.loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#ff75ac]/35 bg-[#ff75ac]/10 px-3 py-1.5 text-xs font-semibold text-[#ff75ac] transition-all hover:bg-[#ff75ac] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            <RefreshCw size={12} className={apiDetectState.loading ? 'animate-spin' : ''} />
            {apiDetectState.loading
              ? getLocalText('检测中...', 'Detecting...', '検出中...')
              : getLocalText('检测全部模型', 'Detect All Models', 'すべてのモデルを検出')}
          </button>
        </div>

        {(apiDetectState.error || hasDetected || providerModels.length > 0) && (
          <div className="border-t border-[var(--surface-border-subtle)] pt-3 space-y-2.5">
            {apiDetectState.error && (
              <div role="alert" className="rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300">
                {apiDetectState.error}
              </div>
            )}

            {(hasDetected || providerModels.length > 0) && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
                    {apiDetectState.updatedProvider === providerId ? (
                      <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                    ) : (
                      <Cpu size={13} className="text-[var(--text-tertiary)] shrink-0" />
                    )}
                    <span>
                      {getLocalText(
                        `可用模型 (${providerModels.length})`,
                        `Available Models (${providerModels.length})`,
                        `利用可能なモデル (${providerModels.length})`
                      )}
                    </span>
                    {apiDetectState.updatedProvider === providerId && (
                      <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                        {getLocalText('已更新列表', 'List updated', '更新済み')}
                      </span>
                    )}
                  </div>
                  {providerModels.length > 8 && (
                    <div className="relative">
                      <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
                      <input
                        type="text"
                        value={apiModelFilter}
                        onChange={(e) => setApiModelFilter(e.target.value)}
                        placeholder={getLocalText('筛选模型...', 'Filter models...', 'モデルを検索...')}
                        className="w-36 sm:w-44 rounded-lg border border-[var(--surface-border-subtle)] bg-[var(--surface-bg)] pl-7 pr-2.5 py-1 text-[11px] text-[var(--text-dark)] outline-none focus:border-[#ff75ac]"
                      />
                    </div>
                  )}
                </div>

                {providerModels.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[var(--surface-border-subtle)] bg-[var(--surface-bg)] px-3 py-2.5 text-center text-xs text-[var(--text-tertiary)]">
                    {getLocalText('未检测到可用聊天模型', 'No available chat models detected', '利用可能なチャットモデルが見つかりませんでした')}
                  </div>
                ) : filteredModels.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[var(--surface-border-subtle)] bg-[var(--surface-bg)] px-3 py-2 text-center text-xs text-[var(--text-tertiary)]">
                    {getLocalText('没有匹配的模型', 'No matching models', '一致するモデルがありません')}
                  </div>
                ) : (
                  <div className="max-h-44 overflow-y-auto pr-0.5">
                    {renderSelectableModelButtons(providerId, filteredModels)}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </>
    );
  };

  const refreshCustomDrawingModels = async () => {
    const requestId = ++drawingModelsRequestRef.current;
    const customDrawingUrl = String(config.customDrawingUrl || '').trim();
    const customDrawingKey = String(config.customDrawingKey || '').trim();
    if (!customDrawingUrl || !customDrawingKey) {
      setCustomDrawingModels([]);
      setCustomDrawingModelsError('');
      setCustomDrawingModelsLoading(false);
      return;
    }

    setCustomDrawingModelsLoading(true);
    setCustomDrawingModelsError('');
    try {
      const response = await fetch(`${BACKEND_URL}/api/drawing/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'custom',
          customDrawingUrl,
          customDrawingKey,
          customDrawingModel: customDrawingConfigRef.current.customDrawingModel || '',
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      if (!result.connected) throw new Error(result.error || getLocalText('获取模型列表失败', 'Failed to load models', 'モデル一覧を取得できませんでした'));
      if (requestId !== drawingModelsRequestRef.current) return;
      setCustomDrawingModels(Array.isArray(result.models) ? result.models : []);
    } catch (error) {
      if (requestId !== drawingModelsRequestRef.current) return;
      setCustomDrawingModelsError(error.message || getLocalText('获取模型列表失败', 'Failed to load models', 'モデル一覧を取得できませんでした'));
    } finally {
      if (requestId === drawingModelsRequestRef.current) setCustomDrawingModelsLoading(false);
    }
  };

  useEffect(() => {
    if (config.drawingProvider !== 'custom') return undefined;
    const timer = window.setTimeout(refreshCustomDrawingModels, 500);
    return () => {
      window.clearTimeout(timer);
      drawingModelsRequestRef.current += 1;
    };
  }, [config.drawingProvider, config.customDrawingUrl, config.customDrawingKey]);

  const refreshSovitsModels = async () => {
    setIsRefreshingModels(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/sovits/models`);
      const data = await res.json();
      setSovitsModels(data);
    } catch (err) {
      console.error('Failed to fetch SoVITS models:', err);
    } finally {
      setIsRefreshingModels(false);
    }
  };

  const handleSovitsAudioUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${BACKEND_URL}/api/upload`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.path) {
        setConfig({ ...config, sovitsRefAudio: data.path });
      }
    } catch (err) {
      console.error('Failed to upload reference audio:', err);
    }
  };

  const clearQQBotCache = async () => {
    const confirmed = window.confirm(
      getLocalText(
        '\u8fd9\u4f1a\u6e05\u7a7a QQ \u673a\u5668\u4eba\u6536\u5230\u7684\u56fe\u7247\u3001\u6587\u4ef6\u3001\u8bed\u97f3\u7f13\u5b58\uff0c\u4ee5\u53ca\u751f\u6210\u7684 PDF \u548c\u56fe\u7247\u62a5\u544a\u3002\u5386\u53f2\u6d88\u606f\u91cc\u7684\u76f8\u5173\u4e0b\u8f7d\u94fe\u63a5\u4f1a\u5931\u6548\uff0c\u4f46\u4e0d\u4f1a\u5220\u9664\u4f1a\u8bdd\u548c\u914d\u7f6e\u3002\u786e\u5b9a\u7ee7\u7eed\u5417\uff1f',
        'This will clear QQ bot image/file/voice caches and generated PDF or image reports. Related download links in past messages will stop working, but sessions and settings will stay intact. Continue?'
      )
    );
    if (!confirmed) return;

    setIsClearingCache(true);
    setCacheCleanupError(false);
    setCacheCleanupMessage('');

    try {
      const res = await fetch(`${BACKEND_URL}/api/cache/qqbot/clear`, {
        method: 'POST'
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.success === false) {
        throw new Error(data.error || getLocalText('\u6e05\u7406\u7f13\u5b58\u5931\u8d25', 'Failed to clear cache'));
      }

      const removedFiles = Number(data?.summary?.removedFiles || 0);
      const freedSize = data?.summary?.freedSizeLabel || '0 B';

      setCacheCleanupMessage(
        removedFiles > 0
          ? getLocalText(`\u5df2\u6e05\u7406 ${removedFiles} \u4e2a\u6587\u4ef6\uff0c\u91ca\u653e\u7ea6 ${freedSize}\u3002`, `Cleared ${removedFiles} files and freed about ${freedSize}.`)
          : getLocalText('\u6ca1\u6709\u53d1\u73b0\u53ef\u6e05\u7406\u7684\u7f13\u5b58\u6587\u4ef6\u3002', 'No cache files were found to clear.')
      );
    } catch (err) {
      console.error('Failed to clear QQ bot cache:', err);
      setCacheCleanupError(true);
      setCacheCleanupMessage(
        getLocalText(
          `\u6e05\u7406\u7f13\u5b58\u5931\u8d25\uff1a${err?.message || '\u672a\u77e5\u9519\u8bef'}`,
          `Failed to clear cache: ${err?.message || 'Unknown error'}`
        )
      );
    } finally {
      setIsClearingCache(false);
    }
  };

  const [localTtsStatus, setLocalTtsStatus] = useState(() => getLocalTtsState());

  useEffect(() => {
    return subscribeLocalTtsStatus(setLocalTtsStatus);
  }, []);

  useEffect(() => {
    if (config.ttsProvider === 'gpt-sovits' && sovitsModels.gpt.length === 0) {
      refreshSovitsModels();
    }
  }, [config.ttsProvider]);

  const [cropperData, setCropperData] = useState({
    isOpen: false,
    image: null,
    target: null,
  });

  const handleCropComplete = async (croppedImageUrl) => {
    try {
      const response = await fetch(croppedImageUrl);
      const blob = await response.blob();
      const file = new File([blob], "avatar.jpg", { type: "image/jpeg" });

      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${BACKEND_URL}/api/upload`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (data.filename) {
        const imageUrl = `${BACKEND_URL}/uploads/${data.filename}`;
        if (cropperData.target === 'user') {
          setConfig({ ...config, userAvatar: imageUrl });
        } else {
          setConfig({ ...config, aiAvatar: imageUrl });
        }
      }
      setCropperData({ ...cropperData, isOpen: false });
    } catch (err) {
      console.error('Failed to upload cropped image:', err);
      alert(t('upload_avatar_fail'));
    }
  };

  const startGitHubLogin = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/github/login/device`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.user_code) {
        setDeviceFlow(data);
        setIsPolling(true);
      } else {
        alert(t('login_failed_with_details', { error: data.hint || data.error || t('unknown_error') }));
      }
    } catch (err) {
      console.error('Failed to start GitHub login:', err);
      alert(t('github_start_login_error'));
    }
  };

  useEffect(() => {
    let timeoutId = null;
    let isActive = true;

    const poll = async () => {
      if (!isPolling || !deviceFlow || !isActive) return;

      try {
        const res = await fetch(`${BACKEND_URL}/api/github/login/poll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_code: deviceFlow.device_code })
        });
        const data = await res.json();

        if (!isActive) return;

        if (data.access_token) {
          console.log('Token received successfully!');
          setConfig(prev => ({ ...prev, copilotToken: data.access_token }));
          setIsPolling(false);
          setDeviceFlow(null);
          return;
        }

        if (data.error) {
          if (data.error === 'authorization_pending') {
          } else if (data.error === 'slow_down') {
            console.warn('GitHub suggests slow down, waiting...');
          } else {
            console.error('GitHub Poll Stop Error:', data.error);
            setIsPolling(false);
            setDeviceFlow(null);
            return;
          }
        }
      } catch (err) {
        console.error('Polling fetch error:', err);
      }

      if (isActive && isPolling) {
        timeoutId = setTimeout(poll, (deviceFlow.interval || 5) * 1000);
      }
    };

    if (isPolling && deviceFlow) {
      console.log('Starting polling for GitHub token...');
      poll();
    }

    return () => {
      isActive = false;
      if (timeoutId) {
        console.log('Cleaning up polling timeout...');
        clearTimeout(timeoutId);
      }
    };
  }, [isPolling, deviceFlow, setConfig]);

  return (
    <motion.div
      className={windowed ? 'h-full w-full' : 'fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-md p-0 sm:p-4'}
      {...(!windowed ? modalBackdropMotion : {})}
      onClick={!windowed ? onClose : undefined}
    >
      <motion.div data-saki-dialog="true"
        className={windowed ? 'bg-[var(--surface-bg)]  h-full w-full rounded-[28px] shadow-none overflow-hidden flex flex-col text-[var(--text-dark)] ' : 'bg-[var(--surface-bg)]  sm:rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col h-full sm:h-auto sm:max-h-[90vh] text-[var(--text-dark)] '}
        {...(!windowed ? modalPanelMotion : {})}
        onClick={!windowed ? (event) => event.stopPropagation() : undefined}
      >
        <div className="px-4 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] sm:pt-2.5 border-b border-[var(--surface-border-subtle)] flex items-center justify-between bg-[var(--surface-bg-light)] shrink-0">
          <h3 className="text-sm sm:text-base font-semibold text-[var(--text-dark)] flex items-center gap-2">
            <Shield size={16} className="text-[#ff75ac]" />
            {t('settings')}
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-[var(--surface-inset)] text-[var(--text-secondary)] rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] space-y-6 sm:space-y-8">
          <section>
            <h4 className="text-sm font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-4 flex items-center gap-2">
              <Cpu size={16} />
              {t('ai_provider')}
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {CHAT_PROVIDER_OPTIONS.map(p => (
                <div key={p.id} className="relative">
                <button
                  onClick={() => setConfig({...config, provider: p.id})}
                  className={`w-full p-3 pb-10 border-2 rounded-xl text-left transition-all ${config.provider === p.id ? 'border-[#ff75ac] bg-[#ff75ac]/10 dark:bg-[#ff75ac]/15' : 'border-[var(--surface-border-subtle)]  hover:border-[#ff75ac]/40 '}`}
                >
                  <div className="flex items-center gap-1.5">
                    <div className="min-w-0 flex-1 font-bold text-[var(--text-dark)]  text-sm whitespace-nowrap overflow-hidden text-ellipsis">{getChatProviderName(p.id, i18n.resolvedLanguage || i18n.language)}</div>
                    {isChatProviderEnabled(config, p.id) && (
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                    )}
                  </div>
                  <div className="text-[10px] text-[var(--text-secondary)] mt-0.5 line-clamp-1">{getProviderSubText(p)}</div>
                </button>
                <button
                  type="button" role="switch"
                  aria-checked={isChatProviderEnabled(config, p.id)}
                  aria-label={`${getChatProviderName(p.id, i18n.resolvedLanguage || i18n.language)} ${getLocalText('启用', 'Enabled', '有効')}`}
                  onClick={() => setConfig(prev => ({ ...prev, providerEnabled: {
                    ...Object.fromEntries(CHAT_PROVIDER_OPTIONS.map(({ id }) => [id, isChatProviderEnabled(prev, id)])),
                    [p.id]: !isChatProviderEnabled(prev, p.id),
                  } }))}
                  className={`absolute bottom-3 right-3 w-10 h-5 rounded-full ${isChatProviderEnabled(config, p.id) ? 'bg-[#ff75ac]' : 'bg-[var(--surface-inset)]'}`}
                >
                  <span className={`absolute top-1 w-3 h-3 rounded-full bg-[var(--surface-bg)] transition-all ${isChatProviderEnabled(config, p.id) ? 'left-6' : 'left-1'}`} />
                </button>
                </div>
              ))}
            </div>

            {activeApiProvider && (
              <div className="mt-4 p-4 bg-[var(--surface-bg-light)] border rounded-xl space-y-3">
                {activeApiProvider.id === 'custom' && (
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">{getLocalText('基础地址', 'Base URL', 'ベース URL')}</label>
                    <input
                      type="text"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#ff75ac] outline-none"
                      placeholder="https://api.openai.com/v1"
                      value={activeProviderBaseUrl}
                      onChange={(e) => updateActiveProviderBaseUrl(e.target.value)}
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">{activeApiProvider.name} {getLocalText('API 密钥', 'API Key', 'API キー')}</label>
                  <div className="relative">
                    <input
                      type="password"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#ff75ac] outline-none pr-10"
                      placeholder="sk-..."
                      value={activeProviderApiKey}
                      onChange={(e) => updateActiveProviderApiKey(e.target.value)}
                    />
                    <Shield className="absolute right-3 top-2.5 text-[var(--text-tertiary)]" size={16} />
                  </div>
                </div>
                {renderProviderDetectPanel(
                  activeApiProvider.id,
                  getLocalText('这个 Key 只会保存到当前供应商，不会再和其它 API 共用。', 'This key is stored only for this provider and will not be reused by other APIs.')
                )}
              </div>
            )}
            <div className="mt-4 rounded-xl border bg-[var(--surface-bg-light)] p-4 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 pr-2">
                  <div className="text-sm font-bold text-[var(--text-dark)]">
                    {getLocalText('主页列出全部已启用 API 模型', 'List all enabled API models on Home')}
                  </div>
                  <div className="mt-1 text-[10px] leading-relaxed text-[var(--text-secondary)]">
                    {getLocalText(
                      `开启后，顶部模型列表会拉取所有开关已开启的 API 模型。当前已启用 ${configuredApiCount} 个 API。关闭服务商会保留密钥，但停止获取并隐藏其模型。`,
                      `Fetch models from all APIs enabled by their switches. ${configuredApiCount} API(s) enabled. Disabling a provider keeps credentials but stops fetching and hides its models.`
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setConfig({ ...config, showAllEnabledApiModels: !config.showAllEnabledApiModels })}
                    role="switch" aria-checked={Boolean(config.showAllEnabledApiModels)} aria-label={getLocalText('显示全部已启用模型', 'Show all enabled models')}
                  className={`w-10 h-5 rounded-full transition-all relative shrink-0 ${config.showAllEnabledApiModels ? 'bg-[#ff75ac]' : 'bg-[var(--surface-inset)]'}`}
                  title={getLocalText('切换全部 API 模型列表', 'Toggle all API model listing')}
                >
                  <div className={`absolute top-1 w-3 h-3 rounded-full bg-[var(--surface-bg)] transition-all ${config.showAllEnabledApiModels ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
              {config.showAllEnabledApiModels && configuredApiCount > 0 && (
                <div className="border-t border-[var(--surface-border-subtle)] pt-3 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 text-[11px] text-[var(--text-secondary)]">
                      {allApiDetectState.summary ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                          <CheckCircle2 size={13} className="shrink-0" />
                          {allApiDetectState.summary}
                        </span>
                      ) : (
                        getLocalText('一键检测所有已启用的 API 可用模型并更新列表', 'Detect all models from enabled APIs and update the catalog', '有効なすべての API からモデルを一括検出し更新します')
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleDetectAllEnabledApiModels}
                      disabled={allApiDetectState.loading}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--surface-border-subtle)] bg-[var(--surface-bg)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-dark)] transition-all hover:border-[#ff75ac] hover:text-[#ff75ac] disabled:opacity-50 shrink-0"
                    >
                      <RefreshCw size={11} className={allApiDetectState.loading ? 'animate-spin' : ''} />
                      {allApiDetectState.loading
                        ? getLocalText('正在检测...', 'Detecting...', '検出中...')
                        : getLocalText('检测全部已启用 API', 'Detect All Enabled APIs', '有効な API を一括検出')}
                    </button>
                  </div>
                  {allApiDetectState.error && (
                    <div role="alert" className="rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-1.5 text-[11px] text-red-600 dark:text-red-300">
                      {allApiDetectState.error}
                    </div>
                  )}
                  {allApiDetectState.results && Object.keys(allApiDetectState.results).length > 0 && (
                    <div className="max-h-48 overflow-y-auto space-y-2.5 pr-0.5">
                      {Object.entries(allApiDetectState.results).map(([providerId, providerModels]) => (
                        <div key={providerId} className="space-y-1">
                          <div className="text-[11px] font-semibold text-[var(--text-secondary)]">
                            {getChatProviderName(providerId, i18n.resolvedLanguage || i18n.language)} ({providerModels.length})
                          </div>
                          {providerModels.length > 0 ? (
                            renderSelectableModelButtons(providerId, providerModels)
                          ) : (
                            <div className="text-[11px] text-[var(--text-tertiary)]">
                              {getLocalText('未检测到可用模型', 'No models detected', 'モデルが見つかりませんでした')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {config.provider === 'ollama' && (
              <div className="mt-4 p-4 bg-[var(--surface-bg-light)] border rounded-xl space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2">{t('ollama_endpoint')}</label>
                  <input
                     type="text"
                     className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#ff75ac] outline-none"
                     placeholder="http://localhost:11434"
                     value={config.ollamaUrl || ''}
                     onChange={(e) => setConfig({...config, ollamaUrl: e.target.value})}
                  />
                </div>
                {renderProviderDetectPanel('ollama', t('ollama_tip'))}
              </div>
            )}
            {config.provider === 'lmstudio' && (
              <div className="mt-4 p-4 bg-[var(--surface-bg-light)] border rounded-xl space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2">LMStudio {getLocalText('端点', 'Endpoint', 'エンドポイント')}</label>
                  <input
                     type="text"
                     className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#ff75ac] outline-none"
                     placeholder="http://localhost:1234"
                     value={config.lmstudioUrl || ''}
                     onChange={(e) => setConfig({...config, lmstudioUrl: e.target.value})}
                  />
                </div>
                {renderProviderDetectPanel(
                  'lmstudio',
                  getLocalText('本地 LMStudio 服务端点（默认：http://localhost:1234）', 'Local LMStudio server endpoint (default: http://localhost:1234)', 'ローカル LMStudio サーバーのエンドポイント（既定: http://localhost:1234）')
                )}
              </div>
            )}
            {config.provider === 'copilot' && (
              <div className="mt-4 p-4 bg-[var(--surface-bg-light)] border rounded-xl space-y-4">
                {!config.copilotToken ? (
                  <>
                    <div className="text-xs text-[var(--text-secondary)] bg-saki-pink/10 border border-saki-pink/15 p-3 rounded-lg leading-relaxed">
                      {t('github_auth_desc')}
                    </div>
                    {!deviceFlow ? (
                      <button
                        onClick={startGitHubLogin}
                        className="w-full bg-[var(--code-bg)] text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-[var(--code-bg)] transition-all shadow-lg shadow-slate-200"
                      >
                        {t('github_login_btn')}
                        <ExternalLink size={16} />
                      </button>
                    ) : (
                      <div className="text-center space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase tracking-widest">{t('enter_code_browser')}</div>
                        <div className="text-3xl font-mono font-bold tracking-[0.3em] bg-[var(--surface-bg)] border-2 border-dashed border-saki-pink/25 py-4 rounded-2xl text-[#ff75ac] shadow-inner">
                          {deviceFlow.user_code}
                        </div>
                        <a
                          href={deviceFlow.verification_uri}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 bg-[#ff75ac] text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-saki-pink transition-all"
                        >
                          {t('jump_verify')}
                          <ExternalLink size={14} />
                        </a>
                        <div className="flex items-center justify-center gap-2 text-[11px] text-[var(--accent-text)]">
                          <RefreshCw size={12} className="animate-spin" />
                          {t('waiting_auth')}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center justify-between bg-[var(--surface-bg)] p-4 rounded-xl border border-green-100 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center">
                        <CheckCircle2 size={24} className="text-green-500" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-[var(--text-dark)]">{t('github_authorized')}</div>
                        <div className="text-[10px] text-[var(--text-secondary)] truncate w-32">{getLocalText('令牌', 'Token', 'トークン')}: {config.copilotToken.slice(0, 8)}...</div>
                      </div>
                    </div>
                    <button
                      onClick={() => setConfig({...config, copilotToken: ''})}
                      className="text-xs text-red-500 font-medium hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors border border-red-50"
                    >
                      {t('relogin')}
                    </button>
                  </div>
                )}
                {renderProviderDetectPanel(
                  'copilot',
                  getLocalText('检测当前已授权 GitHub Models 或本地 Copilot 可用模型', 'Detect available models for your authorized GitHub Models / Copilot account', '認証済みの GitHub Models / Copilot で利用可能なモデルを検出します')
                )}
              </div>
            )}
          </section>

          <section>
            <h4 className="text-sm font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-4 flex items-center gap-2">
              <Search size={16} />
              {getLocalText('搜索引擎配置', 'Search Engine', '検索エンジン')}
            </h4>
            <div className="bg-[var(--surface-bg-light)] rounded-xl p-4 border space-y-3">
              <div>
                <label htmlFor="search-provider" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  {getLocalText('搜索服务', 'Search provider', '検索プロバイダー')}
                </label>
                <select
                  id="search-provider"
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-[var(--surface-bg)]"
                  value={config.searchEngine === 'searxng' ? 'searxng' : 'exa'}
                  onChange={event => setConfig({ ...config, searchEngine: event.target.value })}
                >
                  <option value="exa">{getLocalText('默认（Exa 托管搜索）', 'Default (Exa hosted search)', 'デフォルト（Exa ホスト検索）')}</option>
                  <option value="searxng">SearxNG</option>
                </select>
              </div>
              {config.searchEngine === 'searxng' && (
                <div>
                  <label htmlFor="searxng-url" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">{t('searxng_url')}</label>
                  <div className="flex gap-2">
                    <input
                      id="searxng-url"
                      type="url"
                      className="flex-1 border rounded-lg px-3 py-2 text-sm bg-[var(--surface-bg)]"
                      placeholder="http://127.0.0.1:8080"
                      value={config.searxngUrl || ''}
                      onChange={event => setConfig({ ...config, searxngUrl: event.target.value })}
                    />
                    <button
                      type="button"
                      onClick={handleTestSearxng}
                      disabled={searxngTestState.loading}
                      className="px-3 py-2 rounded-lg border text-xs font-medium bg-[var(--surface-bg)] hover:bg-[var(--surface-bg-light)] disabled:opacity-50 inline-flex items-center gap-1.5 shrink-0"
                    >
                      <RefreshCw size={13} className={searxngTestState.loading ? 'animate-spin' : ''} />
                      {searxngTestState.loading
                        ? getLocalText('检测中...', 'Testing...', 'テスト中...')
                        : getLocalText('检测引擎', 'Test & Detect', '接続テスト')}
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs text-[var(--text-secondary)]">{t('searxng_url_tip')}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{getLocalText(
                    '填写后端可访问的实例地址，并在实例 settings.yml 的 search.formats 中启用 json。连接失败时会明确报错，不会自动切换服务。',
                    'Use an instance URL reachable by the backend and enable json in search.formats in its settings.yml. Failures are reported without switching providers.',
                    'バックエンドから接続できる URL を入力し、settings.yml の search.formats で json を有効にしてください。失敗時に自動で切り替えません。'
                  )}</p>
                  {searxngTestState.error && (
                    <div className="mt-2 text-xs text-red-500 bg-red-50/60 border border-red-200/70 rounded-lg px-3 py-2">
                      {searxngTestState.error}
                    </div>
                  )}
                  {searxngTestState.result && (
                    <div className="mt-2 text-xs text-emerald-700 bg-emerald-50/70 border border-emerald-200/80 rounded-lg px-3 py-2 space-y-1">
                      <div className="font-medium flex items-center gap-1.5">
                        <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                        {getLocalText(
                          `连接成功（JSON 接口可用）：已启用 ${searxngTestState.result.enabledEnginesCount || 0} 个引擎，试搜返回 ${searxngTestState.result.sampleResultCount} 条`,
                          `Connected (JSON OK): ${searxngTestState.result.enabledEnginesCount || 0} enabled engines, ${searxngTestState.result.sampleResultCount} probe results`,
                          `接続成功（JSON 有効）: ${searxngTestState.result.enabledEnginesCount || 0} エンジン有効、テスト結果 ${searxngTestState.result.sampleResultCount} 件`
                        )}
                      </div>
                      {searxngTestState.result.categories && Object.keys(searxngTestState.result.categories).length > 0 && (
                        <div className="text-[11px] opacity-85">
                          {['general', 'news', 'it', 'web', 'science']
                            .filter(cat => searxngTestState.result.categories[cat])
                            .map(cat => `${cat}: ${searxngTestState.result.categories[cat]}`)
                            .join(' · ')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          <section>
            <h4 className="text-sm font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-4 flex items-center gap-2">
              <UserCircle size={16} />
              {t('role_prompt_settings')}
            </h4>
            <div className="bg-[var(--surface-bg-light)] rounded-xl p-4 border space-y-3">
              <label className="block text-xs font-medium text-[var(--text-secondary)]">{t('personality_def')}</label>
              <textarea
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#ff75ac] outline-none bg-[var(--surface-bg)] min-h-[100px] resize-none"
                placeholder={t('prompt_placeholder')}
                value={config.systemPrompt || t('saki_personality')}
                onChange={(e) => setConfig({...config, systemPrompt: e.target.value})}
              />
              <p className="text-[10px] text-[var(--text-tertiary)] leading-relaxed">
                {t('prompt_desc')}
              </p>
              <div className="flex items-center justify-between border-t border-[var(--surface-border-subtle)] pt-3 mt-2">
                <div className="pr-4">
                  <label className="block text-xs font-bold text-[var(--text-dark)]">
                    {t('prompt_slimming_title', '极速模式 (本地模型提示词瘦身)')}
                  </label>
                  <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5 leading-relaxed">
                    {t('prompt_slimming_desc', '开启后大幅精简后台系统指令，降低本地大模型的首字延迟并提高响应速度。若遇到工具调用异常，请关闭此模式。')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setConfig({...config, promptSlimming: !config.promptSlimming})}
                  role="switch" aria-checked={Boolean(config.promptSlimming)} aria-label={getLocalText('精简提示词', 'Slim prompts')}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${config.promptSlimming ? 'bg-[#ff75ac]' : 'bg-[var(--surface-inset)]'}`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-[var(--surface-bg)] shadow ring-0 transition duration-200 ease-in-out ${config.promptSlimming ? 'translate-x-4' : 'translate-x-0'}`}
                  />
                </button>
              </div>
            </div>
          </section>

          <section>
            <h4 className="text-sm font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-4 flex items-center gap-2">
              <Image size={16} />
              {t('drawing_model_settings')}
            </h4>
            <div className="bg-[var(--surface-bg-light)] rounded-xl p-4 border space-y-4">
               <div className="text-xs text-[var(--text-secondary)] mb-2">
                 {t('drawing_desc')}
               </div>

               <div className="space-y-4">
                 <div className="flex flex-wrap p-1 bg-[var(--surface-inset)] rounded-lg w-fit max-w-full gap-0.5">
                    <button
                      onClick={() => setConfig({...config, drawingProvider: 'none'})}
                      className={`px-3 py-1.5 text-[11px] font-bold rounded-md transition-all ${config.drawingProvider === 'none' ? 'bg-[var(--surface-bg)] shadow-sm text-[var(--text-secondary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-dark)]'}`}
                    >
                      {t('none')}
                    </button>
                    <button
                      onClick={() => setConfig({...config, drawingProvider: (config.drawingProvider === 'stable-diffusion' || config.drawingProvider === 'none') ? '' : config.drawingProvider})}
                      className={`px-3 py-1.5 text-[11px] font-bold rounded-md transition-all ${(config.drawingProvider !== 'stable-diffusion' && config.drawingProvider !== 'none') ? 'bg-[var(--surface-bg)] shadow-sm text-[#ff75ac]' : 'text-[var(--text-secondary)] hover:text-[var(--text-dark)]'}`}
                    >
                      {t('llm_drawing')}
                    </button>
                    <button
                      onClick={() => setConfig({...config, drawingProvider: 'stable-diffusion'})}
                      className={`px-3 py-1.5 text-[11px] font-bold rounded-md transition-all ${config.drawingProvider === 'stable-diffusion' ? 'bg-[var(--surface-bg)] shadow-sm text-[var(--accent-text)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-dark)]'}`}
                    >
                      {t('sd_drawing')}
                    </button>
                    <button
                      onClick={() => setConfig({...config, drawingProvider: 'custom'})}
                      className={`px-3 py-1.5 text-[11px] font-bold rounded-md transition-all ${config.drawingProvider === 'custom' ? 'bg-[var(--surface-bg)] shadow-sm text-orange-600' : 'text-[var(--text-secondary)] hover:text-[var(--text-dark)]'}`}
                    >
                      {t('custom_drawing')}
                    </button>
                 </div>

                 {config.drawingProvider === 'none' ? (
                   <div className="p-3 bg-[var(--surface-bg)] rounded-lg border border-dashed border-[var(--surface-border-subtle)] text-center">
                     <p className="text-[10px] text-[var(--text-tertiary)] italic">{t('disable_drawing')}</p>
                   </div>
                 ) : config.drawingProvider === 'stable-diffusion' ? (
                   <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                     <div>
                        <label className="block text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">{t('sd_api_url')}</label>
                        <input
                          type="text"
                          className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-saki-pink outline-none bg-[var(--surface-bg)] font-mono"
                          placeholder="http://127.0.0.1:7860/sdapi/v1/txt2img"
                          value={config.sdUrl || 'http://127.0.0.1:7860/sdapi/v1/txt2img'}
                          onChange={(e) => setConfig({...config, sdUrl: e.target.value})}
                        />
                        <p className="text-[10px] text-[var(--text-tertiary)] mt-1">{t('sd_tip')}</p>
                     </div>
                   </div>
                 ) : config.drawingProvider === 'custom' ? (
                    <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                      <div>
                        <label className="block text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">{getLocalText('基础地址', 'Base URL', 'ベース URL')}</label>
                        <input
                          type="text"
                          className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none bg-[var(--surface-bg)] font-mono"
                          placeholder="https://api.openai.com/v1"
                          value={config.customDrawingUrl || ''}
                          onChange={(e) => setConfig({...config, customDrawingUrl: e.target.value})}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">{getLocalText('API 密钥', 'API Key', 'API キー')}</label>
                        <input
                          type="password"
                          className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none bg-[var(--surface-bg)] font-mono"
                          placeholder="sk-..."
                          value={config.customDrawingKey || ''}
                          onChange={(e) => setConfig({...config, customDrawingKey: e.target.value})}
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">{getLocalText('模型 ID', 'Model ID', 'モデル ID')}</label>
                          <button type="button" onClick={refreshCustomDrawingModels} disabled={customDrawingModelsLoading || !config.customDrawingUrl || !config.customDrawingKey} className="text-[10px] text-[var(--text-secondary)] disabled:opacity-50 flex items-center gap-1">
                            <RefreshCw size={12} className={customDrawingModelsLoading ? 'animate-spin' : ''} />
                            {getLocalText('刷新模型', 'Refresh models', 'モデルを更新')}
                          </button>
                        </div>
                        <select
                          className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none bg-[var(--surface-bg)] font-mono"
                          value={config.customDrawingModel || ''}
                          onChange={(e) => setConfig({...config, customDrawingModel: e.target.value})}
                        >
                          <option value="">{customDrawingModelsLoading ? getLocalText('正在获取模型...', 'Loading models...', 'モデルを取得中...') : getLocalText('选择模型 ID', 'Select a model ID', 'モデル ID を選択')}</option>
                          {config.customDrawingModel && !customDrawingModels.includes(config.customDrawingModel) && (
                            <option value={config.customDrawingModel}>{config.customDrawingModel} ({getLocalText('当前配置，不在最新列表中', 'current, not in latest list', '現在の設定、最新一覧にありません')})</option>
                          )}
                          {customDrawingModels.map((modelId) => <option key={modelId} value={modelId}>{modelId}</option>)}
                        </select>
                        {customDrawingModelsError && <p role="alert" className="text-[10px] text-red-500 mt-1">{customDrawingModelsError}</p>}
                        {!customDrawingModelsError && !customDrawingModelsLoading && customDrawingModels.length === 0 && config.customDrawingUrl && config.customDrawingKey && (
                          <p className="text-[10px] text-[var(--text-tertiary)] mt-1">{getLocalText('未发现可用模型', 'No available models found', '利用可能なモデルがありません')}</p>
                        )}
                      </div>
                      <p className="text-[10px] text-[var(--text-tertiary)] mt-1">{t('custom_drawing_tip')}</p>
                    </div>
                 ) : (
                   <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                     <div className="relative">
                       <label className="block text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">{t('select_drawing_model')}</label>
                       <select
                         className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#ff75ac] outline-none bg-[var(--surface-bg)] appearance-none pr-10"
                         value={config.drawingModel ? `${config.drawingProvider}:${config.drawingModel}` : ''}
                         onChange={(e) => {
                           const val = e.target.value;
                           if (!val) {
                             setConfig({...config, drawingModel: '', drawingProvider: ''});
                           } else {
                             const parts = val.split(':');
                             const provider = parts[0];
                             const name = parts.slice(1).join(':');
                             setConfig({...config, drawingProvider: provider, drawingModel: name});
                           }
                         }}
                       >
                         <option value="">{t('disable_drawing')}</option>
                         {models?.filter(m => m.provider !== 'custom').map(m => (
                           <option key={`${m.provider}:${m.name}`} value={`${m.provider}:${m.name}`}>
                             {getChatProviderName(m.provider, i18n.resolvedLanguage || i18n.language)}: {m.name}
                           </option>
                         ))}
                       </select>
                       <div className="absolute right-3 top-8 pointer-events-none text-[var(--text-tertiary)]">
                         <ChevronDown size={16} />
                       </div>
                     </div>
                   </div>
                 )}
               </div>
            </div>
          </section>

          <section>
            <h4 className="text-sm font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-4 flex items-center gap-2">
              <Volume2 size={16} />
              {t('tts_settings')}
            </h4>
            <div className="bg-[var(--surface-bg-light)] rounded-xl p-4 border space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="pr-4">
                  <div className="text-sm font-bold text-[var(--text-dark)]">{getLocalText('自动朗读回复', 'Automatically read replies', '返信を自動読み上げ')}</div>
                  <div className="text-[10px] text-[var(--text-secondary)] mt-1 leading-relaxed">{getLocalText('开启后，Saki 回复完成时会自动使用当前 TTS 播放。', 'Read completed Saki replies with the selected TTS provider.', 'オンにすると、選択した TTS で返信を自動再生します。')}</div>
                </div>
                <button
                  onClick={() => setConfig({ ...config, autoTtsEnabled: config.autoTtsEnabled === false })}
                  role="switch" aria-checked={config.autoTtsEnabled !== false}
                  aria-label={getLocalText('自动朗读回复', 'Automatically read replies', '返信を自動読み上げ')}
                  className={`w-10 h-5 rounded-full transition-all relative shrink-0 ${config.autoTtsEnabled !== false ? 'bg-[#ff75ac]' : 'bg-[var(--surface-inset)]'}`}
                >
                  <div className={`absolute top-1 w-3 h-3 rounded-full bg-[var(--surface-bg)] transition-all ${config.autoTtsEnabled !== false ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
              <div className="flex flex-wrap p-1 bg-[var(--surface-inset)] rounded-lg w-fit gap-0.5">
                <button
                  onClick={() => setConfig({...config, ttsProvider: 'browser'})}
                  className={`px-3 py-1.5 text-[11px] font-bold rounded-md transition-all ${(!config.ttsProvider || config.ttsProvider === 'browser') ? 'bg-[var(--surface-bg)] shadow-sm text-[#ff75ac]' : 'text-[var(--text-secondary)] hover:text-[var(--text-dark)]'}`}
                >
                  {t('browser_tts')}
                </button>
                <button
                  onClick={() => setConfig({...config, ttsProvider: 'local-wasm'})}
                  className={`px-3 py-1.5 text-[11px] font-bold rounded-md transition-all ${config.ttsProvider === 'local-wasm' ? 'bg-[var(--surface-bg)] shadow-sm text-[#ff75ac]' : 'text-[var(--text-secondary)] hover:text-[var(--text-dark)]'}`}
                >
                  {getLocalText('本地模型 (WASM)', 'Local Model (WASM)', 'ローカルモデル (WASM)')}
                </button>
                <button
                  onClick={() => setConfig({...config, ttsProvider: 'gpt-sovits'})}
                  className={`px-3 py-1.5 text-[11px] font-bold rounded-md transition-all ${config.ttsProvider === 'gpt-sovits' ? 'bg-[var(--surface-bg)] shadow-sm text-[var(--accent-text)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-dark)]'}`}
                >
                  GPT-SoVITS
                </button>
              </div>

              {config.ttsProvider === 'local-wasm' && (
                <div className="space-y-3 p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-bg)] animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-[var(--text-dark)]">
                        {getLocalText('浏览器端神经网络语音 (sherpa-onnx WASM)', 'In-Browser Neural TTS (sherpa-onnx WASM)', 'ブラウザ内ニューラル TTS (sherpa-onnx WASM)')}
                      </div>
                      <div className="text-[10px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                        {getLocalText('模型作为静态资源托管，首次加载后自动缓存在本地浏览器中；全程零服务器算力消耗，加载失败时自动回退到浏览器 TTS。', 'Hosted as static files and cached in your browser after first load. Uses zero server compute and falls back to Browser TTS on error.')}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="text-[11px] font-medium text-[var(--text-secondary)]">
                      {localTtsStatus.status === 'idle' && getLocalText('状态：未加载（点击预加载或首次朗读时自动加载）', 'Status: Not loaded')}
                      {localTtsStatus.status === 'loading' && (localTtsStatus.progressText || getLocalText('正在加载模型...', 'Loading model...'))}
                      {localTtsStatus.status === 'ready' && <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{getLocalText('状态：已就绪（本地推理）', 'Status: Ready')}</span>}
                      {localTtsStatus.status === 'error' && <span className="text-rose-500">{localTtsStatus.error}</span>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          initLocalTts().catch(() => {});
                        }}
                        disabled={localTtsStatus.status === 'loading'}
                        className="px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] font-semibold hover:bg-[var(--surface-bg-light)] disabled:opacity-50"
                      >
                        {localTtsStatus.status === 'ready'
                          ? getLocalText('已就绪', 'Ready')
                          : localTtsStatus.status === 'loading'
                            ? `${localTtsStatus.percent || 0}%`
                            : getLocalText('预加载模型', 'Preload')}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const audio = await synthesizeLocalSentence(
                              getLocalText('嗨嗨，我来啦，现在使用的是本地浏览器语音模型哦！', 'Hello! Local browser voice model is active.'),
                              { sid: Number(config.localTtsSid) || 0, speed: Number(config.localTtsSpeed) || 1.0 }
                            );
                            if (audio) await playFloat32Audio(audio.samples, audio.sampleRate);
                          } catch (err) {
                            console.error(err);
                          }
                        }}
                        disabled={localTtsStatus.status === 'loading'}
                        className="px-2.5 py-1.5 rounded-lg bg-[#ff75ac] text-white text-[11px] font-semibold hover:opacity-90 disabled:opacity-50"
                      >
                        {getLocalText('试听', 'Test')}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">
                      <span>{getLocalText('语速', 'Speech Speed', '話速')}</span>
                      <span className="font-mono">{Number(config.localTtsSpeed || 1.0).toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.7"
                      max="1.4"
                      step="0.05"
                      value={config.localTtsSpeed || 1.0}
                      onChange={(e) => setConfig({ ...config, localTtsSpeed: parseFloat(e.target.value) })}
                      className="w-full accent-[#ff75ac]"
                    />
                  </div>
                </div>
              )}

              {config.ttsProvider === 'gpt-sovits' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                  <div>
                    <label className="block text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">{getLocalText('API 地址', 'API URL', 'API URL')}</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="flex-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-saki-pink outline-none bg-[var(--surface-bg)] font-mono"
                        placeholder="http://127.0.0.1:9880"
                        value={config.sovitsUrl || 'http://127.0.0.1:9880'}
                        onChange={(e) => setConfig({...config, sovitsUrl: e.target.value})}
                      />
                      <button
                        onClick={refreshSovitsModels}
                        className="p-2 bg-[var(--surface-bg)] border rounded-lg hover:bg-[var(--surface-bg-light)] text-[var(--accent-text)] transition-all active:scale-95"
                        title={t('refresh_models')}
                      >
                        <RefreshCw size={16} className={isRefreshingModels ? 'animate-spin' : ''} />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">GPT {getLocalText('模型', 'Model', 'モデル')}</label>
                      <select
                        className="w-full border rounded-lg px-2 py-1.5 text-xs bg-[var(--surface-bg)] focus:ring-2 focus:ring-saki-pink outline-none"
                        value={config.sovitsGptModel || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setConfig({...config, sovitsGptModel: val});
                          const url = config.sovitsUrl || 'http://127.0.0.1:9880';
                          fetch(`${BACKEND_URL}/api/sovits/proxy/set_weights?url=${encodeURIComponent(url)}&type=gpt&weights_path=${encodeURIComponent(val)}`).catch(console.error);
                        }}
                      >
                        <option value="">{t('select_model')}</option>
                        {sovitsModels.gpt.map(m => <option key={m} value={m}>{m.split('/').pop()}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">SoVITS {getLocalText('模型', 'Model', 'モデル')}</label>
                      <select
                        className="w-full border rounded-lg px-2 py-1.5 text-xs bg-[var(--surface-bg)] focus:ring-2 focus:ring-saki-pink outline-none"
                        value={config.sovitsSovitsModel || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setConfig({...config, sovitsSovitsModel: val});
                          const url = config.sovitsUrl || 'http://127.0.0.1:9880';
                          fetch(`${BACKEND_URL}/api/sovits/proxy/set_weights?url=${encodeURIComponent(url)}&type=sovits&weights_path=${encodeURIComponent(val)}`).catch(console.error);
                        }}
                      >
                        <option value="">{t('select_model')}</option>
                        {sovitsModels.sovits.map(m => <option key={m} value={m}>{m.split('/').pop()}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">{t('refer_audio')}</label>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => sovitsAudioInputRef.current?.click()}
                        className={`flex-1 border-2 border-dashed rounded-xl p-3 text-xs transition-all flex items-center justify-center gap-2 ${config.sovitsRefAudio ? 'border-saki-pink/40 bg-saki-pink/10 text-[var(--accent-text)]' : 'border-[var(--surface-border-subtle)] text-[var(--text-secondary)] hover:border-saki-pink/40 hover:bg-saki-pink/10'}`}
                      >
                        <Mic size={14} />
                        {config.sovitsRefAudio ? config.sovitsRefAudio.split(/[\\\/]/).pop() : t('upload_refer_audio')}
                      </button>
                      <input type="file" ref={sovitsAudioInputRef} className="hidden" accept="audio/*" onChange={handleSovitsAudioUpload} />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">{t('refer_text')}</label>
                    <textarea
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-saki-pink outline-none bg-[var(--surface-bg)] min-h-[60px] resize-none"
                      value={config.sovitsRefText || ''}
                      onChange={(e) => setConfig({...config, sovitsRefText: e.target.value})}
                      placeholder={t('refer_text_placeholder')}
                    />
                  </div>
                </div>
              )}
            </div>
          </section>

          <section>
            <h4 className="text-sm font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-4 flex items-center gap-2">
              <Music2 size={16} />
              {getLocalText('音乐创作', 'Music Creation')}
            </h4>
            <div className="bg-[var(--surface-bg-light)] rounded-xl p-4 border space-y-4">
              <div className="flex items-center justify-between">
                <div className="pr-4">
                  <div className="text-sm font-bold text-[var(--text-dark)]">
                    {getLocalText('启用纯音乐生成', 'Enable Instrumental Generation')}
                  </div>
                  <div className="text-[10px] text-[var(--text-secondary)] mt-1 leading-relaxed">
                    {getLocalText(
                      '关闭后，Agent 不会暴露 composeMusic 工具，也不会执行 MIDI 音乐生成，适合部署在低配设备上。',
                      'When disabled, the agent hides the composeMusic tool and skips MIDI music generation for low-spec devices.'
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setConfig({ ...config, musicEnabled: config.musicEnabled !== false ? false : true })}
                  role="switch" aria-checked={config.musicEnabled !== false} aria-label={getLocalText('音乐生成', 'Music generation')}
                  className={`w-10 h-5 rounded-full transition-all relative shrink-0 ${config.musicEnabled !== false ? 'bg-emerald-500' : 'bg-[var(--surface-inset)]'}`}
                  title={getLocalText('切换音乐生成开关', 'Toggle music generation')}
                >
                  <div className={`absolute top-1 w-3 h-3 rounded-full bg-[var(--surface-bg)] transition-all ${config.musicEnabled !== false ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
            </div>
          </section>

          <section>
            <h4 className="text-sm font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-4 flex items-center gap-2">
              <Brain size={16} />
              {getLocalText('记忆反思与人工整理', 'Memory review & correction')}
            </h4>
            <div className="bg-[var(--surface-bg-light)] rounded-xl p-4 border space-y-3">
              <div className="text-sm font-bold text-[var(--text-dark)]">
                {getLocalText('仅在记忆面板中手动运行', 'Manual review only')}
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                {getLocalText(
                  '自动离线反思与自动睡眠整理已停用。请前往「记忆系统 → 手动整理与校正」选择日期，生成建议，逐条校正或取消选择后，再确认保存。',
                  'Automatic reflection and sleep consolidation are disabled. Open Memory Manager → Review & correct, generate proposals for a date, then edit and approve before committing.'
                )}
              </p>
              <div className="rounded-lg border border-saki-pink/15 bg-saki-pink/10 px-3 py-2 text-xs text-[var(--accent-text)]">
                {getLocalText('当前使用模型：', 'Configured model: ')}
                <span className="font-semibold">{config.provider || '—'} / {config.model || '—'}</span>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                {getLocalText(
                  '可使用当前配置的 API 模型或本地模型。如果使用云端 API，点击生成将向对应提供商发送当天对话与工作区内容片段，可能产生费用。',
                  'Uses your current API or local chat model. Cloud API review sends conversation and workspace excerpts to that provider and may incur charges.'
                )}
              </p>
            </div>
          </section>

          <section>
            <h4 className="text-sm font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-4 flex items-center gap-2">
              <Palette size={16} />
              {t('interface_custom')}
            </h4>
            <div className="bg-[var(--surface-bg-light)] rounded-xl p-4 border space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--surface-border-subtle)]">
                <div className="flex items-center gap-2">
                  <Globe size={16} className="text-[var(--text-tertiary)]" />
                  <div>
                    <div className="text-sm font-bold text-[var(--text-dark)]">{t('language')}</div>
                  </div>
                </div>
                <select
                  value={i18n.language}
                  onChange={(e) => { localStorage.setItem('saki_user_lang', e.target.value); i18n.changeLanguage(e.target.value); }}
                  className="border rounded-lg px-2 py-1.5 text-xs outline-none bg-[var(--surface-bg)] min-w-[120px]"
                >
                  <option value="zh-CN">简体中文</option>
                  <option value="zh-TW">繁體中文</option>
                  <option value="en-US">English (US)</option>
                  <option value="en-GB">English (UK)</option>
                  <option value="ja">日本語</option>
                  <option value="fr">Français</option>
                </select>
              </div>

              <div className="flex items-center justify-between pb-2 border-b border-[var(--surface-border-subtle)]">
                <div>
                  <div className="text-sm font-bold text-[var(--text-dark)]">{t('particles_effect')}</div>
                  <div className="text-[10px] text-[var(--text-secondary)]">{t('particles_desc')}</div>
                </div>
                <button
                  onClick={() => setConfig({...config, showParticles: !config.showParticles})}
                  role="switch" aria-checked={Boolean(config.showParticles)} aria-label={getLocalText('樱花粒子', 'Sakura particles')}
                  className={`w-10 h-5 rounded-full transition-all relative ${config.showParticles ? 'bg-pink-400' : 'bg-[var(--surface-inset)]'}`}
                >
                  <div className={`absolute top-1 w-3 h-3 rounded-full bg-[var(--surface-bg)] transition-all ${config.showParticles ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-4">{t('avatar_custom')}</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest flex items-center gap-1.5">
                      <UserCircle size={12} />
                      {t('user_avatar')}
                    </div>
                    <div className="flex items-center gap-4">
                      <div
                        className="w-16 h-16 rounded-full border-2 border-dashed border-[var(--surface-border-subtle)] flex items-center justify-center overflow-hidden bg-[var(--surface-bg)] group cursor-pointer hover:border-saki-pink transition-all shadow-sm shrink-0"
                        onClick={() => document.getElementById('avatar-upload').click()}
                      >
                        {config.userAvatar ? (
                          <img src={config.userAvatar} alt="Avatar Preview" className="w-full h-full object-cover" />
                        ) : (
                          <Plus size={20} className="text-[var(--text-tertiary)] group-hover:text-[#ff75ac]" />
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <input
                          id="avatar-upload"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = () => {
                                setCropperData({
                                  isOpen: true,
                                  image: reader.result,
                                  target: 'user'
                                });
                              };
                              reader.readAsDataURL(file);
                              e.target.value = '';
                            }
                          }}
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => document.getElementById('avatar-upload').click()}
                            className="text-[11px] bg-[var(--surface-bg)] border px-3 py-1.5 rounded-lg hover:bg-[var(--surface-bg-light)] font-bold shadow-sm transition-all active:scale-95"
                          >
                            {t('change_avatar')}
                          </button>
                          {config.userAvatar && config.userAvatar !== '/assets/head_user.png' && (
                            <button
                              onClick={() => setConfig({...config, userAvatar: '/assets/head_user.png'})}
                              className="text-[11px] text-red-500 bg-[var(--surface-bg)] border border-red-100 px-3 py-1.5 rounded-lg hover:bg-red-50 font-bold transition-all active:scale-95"
                            >
                              {t('restore_default')}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest flex items-center gap-1.5">
                      <Bot size={12} />
                      {t('ai_avatar')}
                    </div>
                    <div className="flex items-center gap-4">
                      <div
                        className="w-16 h-16 rounded-full border-2 border-dashed border-[var(--surface-border-subtle)] flex items-center justify-center overflow-hidden bg-[var(--surface-bg)] group cursor-pointer hover:border-saki-pink transition-all shadow-sm shrink-0"
                        onClick={() => document.getElementById('ai-avatar-upload').click()}
                      >
                        {config.aiAvatar ? (
                          <img src={config.aiAvatar} alt="AI Avatar Preview" className="w-full h-full object-cover" />
                        ) : (
                          <img src={botAvatar} alt="AI Avatar Preview" className="w-full h-full object-cover opacity-50" />
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <input
                          id="ai-avatar-upload"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = () => {
                                setCropperData({
                                  isOpen: true,
                                  image: reader.result,
                                  target: 'ai'
                                });
                              };
                              reader.readAsDataURL(file);
                              e.target.value = '';
                            }
                          }}
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => document.getElementById('ai-avatar-upload').click()}
                            className="text-[11px] bg-[var(--surface-bg)] border px-3 py-1.5 rounded-lg hover:bg-[var(--surface-bg-light)] font-bold shadow-sm transition-all active:scale-95"
                          >
                            {t('change_ai_avatar')}
                          </button>
                          {config.aiAvatar && (
                            <button
                              onClick={() => setConfig({...config, aiAvatar: ''})}
                              className="text-[11px] text-red-500 bg-[var(--surface-bg)] border border-red-100 px-3 py-1.5 rounded-lg hover:bg-red-50 font-bold transition-all active:scale-95"
                            >
                              {t('restore_default')}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2">{t('background_image')}</label>
                <div className="flex items-center gap-4">
                  <div
                    className="w-24 h-16 rounded-lg border-2 border-dashed border-[var(--surface-border-subtle)] flex items-center justify-center overflow-hidden bg-[var(--surface-bg)] group cursor-pointer hover:border-saki-pink transition-all"
                    onClick={() => document.getElementById('bg-upload').click()}
                  >
                    {backgroundPreview ? (
                      <img src={backgroundPreview} alt="Background Preview" className="w-full h-full object-cover" />
                    ) : (
                      <Plus size={20} className="text-[var(--text-tertiary)] group-hover:text-[#ff75ac]" />
                    )}
                  </div>
                  <div className="flex-1">
                    <input
                      id="bg-upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files[0];
                        if (file) {
                          const formData = new FormData();
                          formData.append('file', file);
                          try {
                            const res = await fetch(`${BACKEND_URL}/api/upload`, {
                              method: 'POST',
                              body: formData
                            });
                            const data = await res.json();
                            if (data.filename) {
                              const imageUrl = `${BACKEND_URL}/uploads/${data.filename}`;
                              setConfig({...config, chatBackgroundImage: imageUrl, chatBackgroundPreset: 'custom'});
                            }
                          } catch (err) {
                            console.error('Failed to upload background:', err);
                            alert(t('upload_bg_fail'));
                          }
                        }
                      }}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => document.getElementById('bg-upload').click()}
                        className="text-xs bg-[var(--surface-bg)] border px-3 py-1.5 rounded-lg hover:bg-[var(--surface-bg-light)] font-medium"
                      >
                        {t('upload_image')}
                      </button>
                      {backgroundPreset !== 'auto' && (
                        <button
                          onClick={() => setConfig(previous => selectChatBackground(previous, 'auto'))}
                          className="text-xs text-red-500 bg-[var(--surface-bg)] border border-red-100 px-3 py-1.5 rounded-lg hover:bg-red-50 font-medium"
                        >
                          {t('restore_default')}
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-[var(--text-tertiary)] mt-2">{t('image_format_tip')}</p>
                  </div>
                </div>
                <div className="saki-background-choices" role="group" aria-label={getLocalText('内置背景', 'Built-in backgrounds')}>
                  {[
                    { id: 'auto', src: CHAT_BACKGROUNDS.day, label: getLocalText('昼夜随主题', 'Follow theme') },
                    { id: 'original', src: CHAT_BACKGROUNDS.original, label: getLocalText('Saki 原景', 'Saki original') },
                    { id: 'day', src: CHAT_BACKGROUNDS.day, label: getLocalText('樱花晴空', 'Sakura daylight') },
                    { id: 'night', src: CHAT_BACKGROUNDS.night, label: getLocalText('月下樱花', 'Moonlit sakura') },
                    { id: 'room', src: CHAT_BACKGROUNDS.room, label: getLocalText('午后小屋', 'Afternoon room') },
                  ].map(background => (
                    <button key={background.id} type="button" className="saki-background-choice"
                      aria-pressed={backgroundPreset === background.id}
                      onClick={() => setConfig(previous => selectChatBackground(previous, background.id))}>
                      <div className={background.id === 'auto' ? 'saki-background-pair' : ''}>
                        <img src={background.src} alt="" loading="lazy" />
                        {background.id === 'auto' && <img src={CHAT_BACKGROUNDS.night} alt="" loading="lazy" />}
                      </div>
                      <span>{background.label}</span>
                      {backgroundPreset === background.id && <CheckCircle2 size={17} aria-hidden="true" />}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-[var(--text-secondary)]">
                  {getLocalText('昼夜随主题会自动切换晴空与夜景；手机端使用专用竖版。上传图片后将固定使用你的自定义背景。', 'Follow theme switches between daylight and night, with portrait artwork on mobile. Uploaded images remain fixed.')}
                </p>
              </div>
            </div>
          </section>

          <section>
            <h4 className="text-sm font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-4 flex items-center gap-2">
              <Trash2 size={16} />
              {getLocalText('\u7f13\u5b58\u6e05\u7406', 'Cache Cleanup')}
            </h4>
            <div className="bg-red-50 rounded-xl p-4 border border-red-100 space-y-4">
              <div>
                <div className="text-sm font-bold text-[var(--text-dark)]">
                  {getLocalText('\u6e05\u7a7a QQ \u673a\u5668\u4eba\u7f13\u5b58\u6587\u4ef6', 'Clear QQ Bot Cache Files')}
                </div>
                <div className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                  {getLocalText(
                    '\u4f1a\u6e05\u7406 QQ \u6536\u5230\u7684\u56fe\u7247\u3001\u6587\u4ef6\u3001\u8bed\u97f3\u7f13\u5b58\uff0c\u4ee5\u53ca\u751f\u6210\u7684 PDF/\u56fe\u7247\u62a5\u544a\u3002\u4e0d\u4f1a\u5220\u9664\u4f1a\u8bdd\u3001\u6a21\u578b\u914d\u7f6e\u3001\u5934\u50cf\u3001\u80cc\u666f\u56fe\u6216\u53c2\u8003\u97f3\u9891\u3002',
                    'Clears QQ image/file/voice caches and generated PDF or image reports. Sessions, model settings, avatars, background images, and reference audio are kept.'
                  )}
                </div>
              </div>

              <div className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                {getLocalText(
                  '\u63d0\u793a\uff1a\u6e05\u7406\u540e\uff0c\u5386\u53f2\u6d88\u606f\u91cc\u6307\u5411\u8fd9\u4e9b\u7f13\u5b58\u6587\u4ef6\u7684\u4e0b\u8f7d\u94fe\u63a5\u53ef\u80fd\u5931\u6548\u3002',
                  'Note: download links to these cached files in previous messages may stop working after cleanup.'
                )}
              </div>

              {cacheCleanupMessage && (
                <div className={`rounded-lg border px-3 py-2 text-xs ${cacheCleanupError ? 'border-red-200 bg-[var(--surface-bg)] text-red-600' : 'border-emerald-200 bg-[var(--surface-bg)] text-emerald-700'}`}>
                  {cacheCleanupMessage}
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={clearQQBotCache}
                  disabled={isClearingCache}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all ${isClearingCache ? 'cursor-not-allowed bg-[var(--surface-inset)] text-[var(--text-secondary)]' : 'bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-100'}`}
                >
                  {isClearingCache ? <RefreshCw size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  {isClearingCache ? getLocalText('\u6b63\u5728\u6e05\u7406...', 'Clearing...') : getLocalText('\u6e05\u9664\u7f13\u5b58', 'Clear Cache')}
                </button>
              </div>
            </div>
          </section>
        </div>


        <div className="p-4 border-t bg-[var(--surface-bg-light)] flex justify-end">
          <button
            onClick={onClose}
            className="bg-[#ff75ac] text-white px-6 py-2 rounded-xl text-sm font-medium hover:bg-saki-pink shadow-lg shadow-blue-100"
          >
            {t('save')}
          </button>
        </div>

        {cropperData.isOpen && (
          <ImageCropperModal
            image={cropperData.image}
            onCropComplete={handleCropComplete}
            onClose={() => setCropperData({ ...cropperData, isOpen: false })}
          />
        )}
      </motion.div>
    </motion.div>
  );
}
