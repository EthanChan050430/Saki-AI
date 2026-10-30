import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { AlertCircle, Bot, CheckCircle2, MessageCircle, RefreshCw, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { getFeatureLocale } from '../utils/featureLocale';
import { modalBackdropMotion, modalPanelMotion } from '../utils/modalMotion';

function buildDraft(config) {
  const qqbot = config?.thirdPartyChats?.qqbot || {};
  const stt = qqbot.stt || {};
  return {
    enabled: Boolean(qqbot.enabled),
    appId: qqbot.appId || '',
    clientSecret: qqbot.clientSecret || '',
    sandbox: Boolean(qqbot.sandbox),
    markdownSupport: Boolean(qqbot.markdownSupport),
    sttEnabled: stt.enabled !== false,
    sttBaseUrl: stt.baseUrl || '',
    sttApiKey: stt.apiKey || '',
    sttModel: stt.model || 'whisper-1',
  };
}

function StatusPill({ status, ui }) {
  const tone = status?.ok
    ? 'text-green-700 bg-green-50 border-green-200'
    : status?.configured
      ? 'text-amber-700 bg-amber-50 border-amber-200'
      : 'text-[var(--text-secondary)] bg-[var(--surface-bg-light)] border-[var(--surface-border-subtle)]';
  const label = status?.ok
    ? ui.statusConnected
    : status?.configured
      ? ui.statusConfigured
      : ui.statusNotConfigured;

  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>
      {status?.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
      {label}
    </div>
  );
}

export default function ThirdPartyChatModal({ isOpen, onClose, config, setConfig, backendUrl, windowed = false }) {
  const { i18n } = useTranslation();
  const ui = getFeatureLocale(i18n.resolvedLanguage || i18n.language).thirdParty;
  const isZh = String(i18n.resolvedLanguage || i18n.language || '').toLowerCase().startsWith('zh');
  const sttUi = isZh
    ? {
        title: '\u8bed\u97f3\u8f6c\u6587\u5b57\uff08STT\uff09',
        desc: 'QQ \u6536\u5230\u8bed\u97f3\u540e\uff0c\u5148\u8f6c\u6210\u6587\u5b57\u518d\u4ea4\u7ed9 AI\u3002\u7559\u7a7a\u65f6\u4f1a\u56de\u9000\u5230\u5168\u5c40 API \u914d\u7f6e\u3002',
        baseUrl: 'STT API \u5730\u5740',
        baseUrlPlaceholder: '\u4f8b\u5982: https://api.openai.com/v1',
        apiKeyPlaceholder: '\u7559\u7a7a\u5219\u5c1d\u8bd5\u4f7f\u7528\u5168\u5c40 API Key',
        model: 'STT \u6a21\u578b',
      }
    : {
        title: 'Speech to Text (STT)',
        desc: 'When QQ receives voice, transcribe it before sending it to the AI. Leave blank to fall back to the global API config.',
        baseUrl: 'STT API Base URL',
        baseUrlPlaceholder: 'e.g. https://api.openai.com/v1',
        apiKeyPlaceholder: 'Leave blank to try the global API key',
        model: 'STT Model',
      };
  const [selectedApp, setSelectedApp] = useState('qqbot');
  const [draft, setDraft] = useState(() => buildDraft(config));
  const [status, setStatus] = useState(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const apps = useMemo(() => ([
    {
      id: 'qqbot',
      name: ui.qqName,
      description: ui.qqDesc,
    },
  ]), [ui.qqDesc, ui.qqName]);

  const refreshStatus = async () => {
    setIsChecking(true);
    try {
      const res = await axios.get(`${backendUrl}/api/integrations/chat/qqbot/status`);
      setStatus(res.data);
    } catch (error) {
      setStatus({
        ok: false,
        error: error.response?.data?.error || error.message,
        configured: false,
      });
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setDraft(buildDraft(config));
    refreshStatus();
  }, [isOpen, config]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(refreshStatus, 10000);
    return () => clearInterval(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = (key, value) => {
    setDraft(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    const existingQqbot = config.thirdPartyChats?.qqbot || {};
    const existingStt = existingQqbot.stt || {};
    const sttBaseUrl = draft.sttBaseUrl.trim();
    const sttApiKey = draft.sttApiKey.trim();
    const sttModel = draft.sttModel.trim() || 'whisper-1';
    const shouldPersistStt =
      draft.sttEnabled === false ||
      Boolean(sttBaseUrl || sttApiKey || existingStt.provider || existingStt.baseUrl || existingStt.apiKey || sttModel !== 'whisper-1');

    const mergedConfig = {
      ...config,
      thirdPartyChats: {
        ...(config.thirdPartyChats || {}),
        qqbot: {
          ...existingQqbot,
          ...draft,
          ...(shouldPersistStt ? {
            stt: {
              ...existingStt,
              enabled: draft.sttEnabled,
              ...(sttBaseUrl ? { baseUrl: sttBaseUrl } : {}),
              ...(sttApiKey ? { apiKey: sttApiKey } : {}),
              model: sttModel,
            },
          } : {}),
        },
      },
    };

    delete mergedConfig.thirdPartyChats.qqbot.sttEnabled;
    delete mergedConfig.thirdPartyChats.qqbot.sttBaseUrl;
    delete mergedConfig.thirdPartyChats.qqbot.sttApiKey;
    delete mergedConfig.thirdPartyChats.qqbot.sttModel;
    if (!shouldPersistStt) {
      delete mergedConfig.thirdPartyChats.qqbot.stt;
    }

    setIsSaving(true);
    try {
      await axios.post(`${backendUrl}/api/config`, mergedConfig);
      setConfig(mergedConfig);
      await refreshStatus();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div
      className={windowed ? 'h-full w-full' : 'fixed inset-0 z-[115] flex items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4'}
      {...(!windowed ? modalBackdropMotion : {})}
      onClick={!windowed ? onClose : undefined}
    >
      <motion.div data-saki-dialog="true"
        className={windowed ? 'flex h-full w-full flex-col overflow-hidden bg-[var(--surface-bg)]  rounded-[28px] shadow-none text-[var(--text-dark)] ' : 'flex h-full w-full max-w-5xl flex-col overflow-hidden bg-[var(--surface-bg)]  sm:h-auto sm:max-h-[88vh] sm:rounded-3xl shadow-2xl text-[var(--text-dark)] '}
        {...(!windowed ? modalPanelMotion : {})}
        onClick={!windowed ? (event) => event.stopPropagation() : undefined}
      >
        <div className="flex items-center justify-between border-b bg-[var(--surface-bg-light)] px-4 py-2.5 shrink-0">
          <div className="min-w-0">
            <div className="text-sm sm:text-base font-semibold text-[var(--text-dark)] leading-tight truncate">{ui.title}</div>
            <div className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-tight truncate">{ui.subtitle}</div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="border-b bg-[var(--surface-bg-light)] p-4 md:w-72 md:border-b-0 md:border-r">
            <div className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{ui.availableApps}</div>
            <div className="space-y-2">
              {apps.map(app => (
                <button
                  key={app.id}
                  onClick={() => setSelectedApp(app.id)}
                  className={`w-full rounded-2xl border p-3 text-left transition-all ${selectedApp === app.id ? 'border-saki-pink bg-saki-pink/10 shadow-sm' : 'border-[var(--surface-border-subtle)] bg-[var(--surface-bg)] hover:border-[var(--surface-border-subtle)]'}`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`rounded-xl p-2 ${selectedApp === app.id ? 'bg-[#ff75ac] text-white' : 'bg-[var(--surface-bg-light)] text-[var(--text-secondary)]'}`}>
                      <MessageCircle size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[var(--text-dark)]">{app.name}</div>
                      <div className="mt-1 text-[11px] leading-relaxed text-[var(--text-secondary)]">{app.description}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="mx-auto max-w-2xl space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-saki-pink/10 p-3 text-[var(--accent-text)]">
                    <Bot size={22} />
                  </div>
                  <div>
                    <div className="text-base font-semibold text-[var(--text-dark)]">{ui.qqName}</div>
                    <div className="text-sm text-[var(--text-secondary)]">{ui.panelDesc}</div>
                  </div>
                </div>
                <StatusPill status={status} ui={ui} />
              </div>

              <div className="rounded-2xl border border-saki-pink/15 bg-saki-pink/10 px-4 py-3 text-sm text-[var(--accent-text)]">
                <div className="font-semibold">{ui.modelSyncTitle}</div>
                <div className="mt-1 text-xs text-[var(--accent-text)]/80">
                  {ui.modelSyncDesc}
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-[var(--surface-bg)] px-3 py-1 border border-saki-pink/15">
                    Provider: {status?.activeProvider || config.provider || '-'}
                  </span>
                  <span className="rounded-full bg-[var(--surface-bg)] px-3 py-1 border border-saki-pink/15">
                    Model: {status?.activeModel || config.model || '-'}
                  </span>
                </div>
              </div>

              <div className="rounded-3xl border border-[var(--surface-border-subtle)] bg-[var(--surface-bg-light)] p-5 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-[var(--text-dark)]">{ui.enableTitle}</div>
                    <div className="text-xs text-[var(--text-secondary)] mt-1">{ui.enableDesc}</div>
                  </div>
                  <button
                    onClick={() => handleChange('enabled', !draft.enabled)}
                    className={`relative h-6 w-11 rounded-full transition-all ${draft.enabled ? 'bg-[#ff75ac]' : 'bg-[var(--surface-inset)]'}`}
                  >
                    <span className={`absolute top-1 h-4 w-4 rounded-full bg-[var(--surface-bg)] transition-all ${draft.enabled ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">App ID</label>
                    <input
                      value={draft.appId}
                      onChange={(e) => handleChange('appId', e.target.value)}
                      className="w-full rounded-xl border bg-[var(--surface-bg)] px-3 py-2 text-sm outline-none transition-all focus:border-saki-pink focus:ring-2 focus:ring-saki-pink/15"
                      placeholder={ui.appIdPlaceholder}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Client Secret</label>
                    <input
                      type="password"
                      value={draft.clientSecret}
                      onChange={(e) => handleChange('clientSecret', e.target.value)}
                      className="w-full rounded-xl border bg-[var(--surface-bg)] px-3 py-2 text-sm outline-none transition-all focus:border-saki-pink focus:ring-2 focus:ring-saki-pink/15"
                      placeholder={ui.clientSecretPlaceholder}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    onClick={() => handleChange('sandbox', !draft.sandbox)}
                    className={`rounded-2xl border p-4 text-left transition-all ${draft.sandbox ? 'border-saki-pink bg-saki-pink/10' : 'border-[var(--surface-border-subtle)] bg-[var(--surface-bg)] hover:border-[var(--surface-border-subtle)]'}`}
                  >
                    <div className="text-sm font-semibold text-[var(--text-dark)]">{ui.sandboxTitle}</div>
                    <div className="mt-1 text-xs text-[var(--text-secondary)]">{ui.sandboxDesc}</div>
                  </button>
                  <button
                    onClick={() => handleChange('markdownSupport', !draft.markdownSupport)}
                    className={`rounded-2xl border p-4 text-left transition-all ${draft.markdownSupport ? 'border-saki-pink bg-saki-pink/10' : 'border-[var(--surface-border-subtle)] bg-[var(--surface-bg)] hover:border-[var(--surface-border-subtle)]'}`}
                  >
                    <div className="text-sm font-semibold text-[var(--text-dark)]">{ui.markdownTitle}</div>
                    <div className="mt-1 text-xs text-[var(--text-secondary)]">{ui.markdownDesc}</div>
                  </button>
                </div>

                <div className="rounded-2xl border border-[var(--surface-border-subtle)] bg-[var(--surface-bg)] p-4 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-[var(--text-dark)]">{sttUi.title}</div>
                      <div className="mt-1 text-xs text-[var(--text-secondary)]">
                        {sttUi.desc}
                      </div>
                    </div>
                    <button
                      onClick={() => handleChange('sttEnabled', !draft.sttEnabled)}
                      className={`relative h-6 w-11 rounded-full transition-all ${draft.sttEnabled ? 'bg-[#ff75ac]' : 'bg-[var(--surface-inset)]'}`}
                    >
                      <span className={`absolute top-1 h-4 w-4 rounded-full bg-[var(--surface-bg)] transition-all ${draft.sttEnabled ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                        {sttUi.baseUrl}
                      </label>
                      <input
                        value={draft.sttBaseUrl}
                        onChange={(e) => handleChange('sttBaseUrl', e.target.value)}
                        className="w-full rounded-xl border bg-[var(--surface-bg)] px-3 py-2 text-sm outline-none transition-all focus:border-saki-pink focus:ring-2 focus:ring-saki-pink/15"
                        placeholder={sttUi.baseUrlPlaceholder}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                        {isZh ? 'STT API Key' : 'STT API Key'}
                      </label>
                      <input
                        type="password"
                        value={draft.sttApiKey}
                        onChange={(e) => handleChange('sttApiKey', e.target.value)}
                        className="w-full rounded-xl border bg-[var(--surface-bg)] px-3 py-2 text-sm outline-none transition-all focus:border-saki-pink focus:ring-2 focus:ring-saki-pink/15"
                        placeholder={sttUi.apiKeyPlaceholder}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                        {sttUi.model}
                      </label>
                      <input
                        value={draft.sttModel}
                        onChange={(e) => handleChange('sttModel', e.target.value)}
                        className="w-full rounded-xl border bg-[var(--surface-bg)] px-3 py-2 text-sm outline-none transition-all focus:border-saki-pink focus:ring-2 focus:ring-saki-pink/15"
                        placeholder="whisper-1"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-dashed border-[var(--surface-border-subtle)] bg-[var(--surface-bg)] p-5">
                <div className="text-sm font-semibold text-[var(--text-dark)]">{ui.usageTitle}</div>
                <div className="mt-2 space-y-2 text-sm text-[var(--text-secondary)]">
                  <div>{ui.usageNew}</div>
                  <div>{ui.usageDeep}</div>
                  <div>{ui.usagePpt}</div>
                  <div>{ui.usageNormal}</div>
                </div>
              </div>

              {status?.error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {ui.connectionCheckFailed}{status.error}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t bg-[var(--surface-bg-light)] px-4 py-2.5 shrink-0">
          <button
            onClick={refreshStatus}
            disabled={isChecking}
            className="inline-flex items-center gap-1.5 rounded-xl border bg-[var(--surface-bg)] px-3.5 py-1.5 text-xs sm:text-sm font-medium text-[var(--text-dark)] hover:bg-[var(--surface-bg-light)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={14} className={isChecking ? 'animate-spin' : ''} />
            {ui.checkConnection}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#ff75ac] px-4 py-1.5 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-blue-100 hover:bg-saki-pink disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {ui.saveApply}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
