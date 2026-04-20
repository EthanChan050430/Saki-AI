import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Menu, Search, ChevronDown, Image, Music } from 'lucide-react';
import { getChatProviderLabel, MODEL_PROVIDER_ORDER } from '../utils/chatProviderConfig';

export default function Header({
  config,
  setConfig,
  models,
  toggleSidebar,
  onOpenCommandPalette,
  onExport,
  hasMessages,
  isMusicPlaying,
  onToggleMusic
}) {
  const { t } = useTranslation();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const providerLabels = {
    ollama: t('ollama_local'),
    copilot: t('github_models'),
    custom: t('custom_api'),
  };

  const normalizedModelName = config.provider === 'copilot' && config.model?.includes('/')
    ? config.model.split('/').slice(1).join('/')
    : config.model;

  const currentModel = models?.find(m => m.name === normalizedModelName && m.provider === config.provider);
  const currentModelLabel = currentModel?.label || normalizedModelName;
  const shortcutLabel = navigator.platform?.toLowerCase?.().includes('mac') ? 'Cmd K' : 'Ctrl K';

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-white/20 bg-white/35 px-3 backdrop-blur-md sm:px-4">
      <div className="flex items-center gap-2 sm:gap-4">
        <button onClick={toggleSidebar} className="rounded-xl p-2 text-gray-700 transition-colors hover:bg-white/30">
          <Menu size={20} />
        </button>

        <div data-onboarding-id="header-search">
          <button
            onClick={onOpenCommandPalette}
            className="group hidden items-center gap-2 rounded-xl border border-white/40 bg-white/45 px-3 py-1.5 text-left shadow-sm transition-all hover:border-blue-300 hover:bg-white/65 md:flex"
          >
            <Search size={15} className="text-gray-400 transition-colors group-hover:text-blue-500" />
            <span className="text-sm font-medium text-gray-500">{t('search') || 'Search'}</span>
            <span className="rounded-lg bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-500">{shortcutLabel}</span>
          </button>

          <button
            onClick={onOpenCommandPalette}
            className="rounded-xl p-2 text-gray-500 transition-colors hover:bg-white/30 hover:text-blue-600 md:hidden"
            title={t('search') || 'Search'}
          >
            <Search size={18} />
          </button>
        </div>

        <div className="relative" data-onboarding-id="header-model-switcher">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            onBlur={() => setTimeout(() => setIsDropdownOpen(false), 200)}
            className="flex items-center gap-2 rounded-xl border border-white/40 bg-white/45 px-3 py-1.5 shadow-sm transition-all hover:border-blue-300"
          >
            <span className="max-w-[180px] truncate text-sm font-semibold text-gray-800 sm:max-w-[240px]">
              {currentModelLabel}
            </span>
            {currentModel?.supportsVision ? (
              <span title="Vision" className="inline-flex items-center justify-center rounded-md bg-sky-100 p-1 text-sky-600">
                <Image size={12} />
              </span>
            ) : null}
            <ChevronDown size={14} className={`text-gray-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {isDropdownOpen && (
            <div className="absolute left-0 top-full z-50 mt-2 max-h-80 min-w-[260px] overflow-y-auto rounded-2xl border border-gray-200 bg-white py-2 shadow-2xl">
              {models && models.length > 0 ? (
                MODEL_PROVIDER_ORDER.map(provider => {
                  const providerModels = models.filter(
                    m => m.provider === provider && !(m.name === config.drawingModel && m.provider === config.drawingProvider)
                  );
                  if (providerModels.length === 0) return null;

                  return (
                    <div key={provider}>
                      <div className="bg-gray-50/70 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">
                        {providerLabels[provider] || getChatProviderLabel(provider)}
                      </div>
                      {providerModels.map(model => (
                        <button
                          key={`${model.provider}-${model.name}`}
                          onClick={() => {
                            setConfig({ ...config, provider: model.provider, model: model.name });
                            setIsDropdownOpen(false);
                          }}
                          className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition-colors hover:bg-gray-50 ${
                            normalizedModelName === model.name && config.provider === model.provider
                              ? 'bg-blue-50 font-bold text-blue-600'
                              : 'text-gray-700'
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate">{model.label || model.name}</span>
                            {model.supportsVision ? (
                              <span title="Vision" className="inline-flex items-center justify-center rounded-md bg-sky-100 p-1 text-sky-600">
                                <Image size={11} />
                              </span>
                            ) : null}
                          </div>
                          {normalizedModelName === model.name && config.provider === model.provider && (
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                          )}
                        </button>
                      ))}
                    </div>
                  );
                })
              ) : (
                <div className="px-4 py-2 text-xs text-gray-400">{t('no_models_detected')}</div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={onToggleMusic}
          title={isMusicPlaying ? 'Stop Music' : 'Dance & Radio Mode'}
          className={`rounded-xl p-2 transition-all ${
            isMusicPlaying
              ? 'bg-rose-50 text-rose-500'
              : 'text-gray-500 hover:bg-blue-50 hover:text-blue-500'
          }`}
        >
          <Music size={18} className={isMusicPlaying ? 'animate-pulse' : ''} />
        </button>

        <button
          onClick={onExport}
          disabled={!hasMessages}
          title={hasMessages ? t('export_chat_image') : t('no_messages_export')}
          className={`flex items-center gap-1.5 rounded-xl p-2 transition-all ${
            hasMessages
              ? 'text-gray-500 hover:bg-blue-50 hover:text-blue-500'
              : 'cursor-not-allowed text-gray-300 opacity-60'
          }`}
        >
          <Image size={18} />
          <span className="hidden text-xs font-medium md:inline">{t('export')}</span>
        </button>
      </div>
    </header>
  );
}
