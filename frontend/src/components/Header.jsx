import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Menu, Search, Image, Music, Sun, Moon, Globe, ChevronDown } from 'lucide-react';
import { changeSakiLang } from '../i18n';

const LANG_OPTIONS = [
  { code: 'zh-CN', label: '简体中文', short: '中文' },
  { code: 'en-US', label: 'English', short: 'EN' },
  { code: 'ja',    label: '日本語', short: '日本語' },
];

const resolveOption = (language) => {
  const value = String(language || 'en-US').toLowerCase();
  if (value.startsWith('zh')) return LANG_OPTIONS[0];
  if (value.startsWith('ja')) return LANG_OPTIONS[2];
  return LANG_OPTIONS[1];
};

const isOptionActive = (option, language) => {
  const value = String(language || 'en-US').toLowerCase();
  if (option.code === 'zh-CN') return value.startsWith('zh');
  if (option.code === 'ja') return value.startsWith('ja');
  return !value.startsWith('zh') && !value.startsWith('ja');
};

export default function Header({
  toggleSidebar,
  onOpenCommandPalette,
  onExport,
  isExporting = false,
  hasMessages,
  isMusicPlaying,
  onToggleMusic,
  theme = 'light',
  onToggleTheme
}) {
  const { t, i18n } = useTranslation();
  const activeLang = i18n.resolvedLanguage || i18n.language;
  const currentLang = resolveOption(activeLang);
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef(null);
  const exportRef = useRef(null);

  useEffect(() => {
    const closeExport = event => {
      if (exportRef.current && (event.key === 'Escape' || (event.type === 'mousedown' && !exportRef.current.contains(event.target)))) {
        exportRef.current.open = false;
      }
    };
    document.addEventListener('mousedown', closeExport);
    document.addEventListener('keydown', closeExport);
    return () => {
      document.removeEventListener('mousedown', closeExport);
      document.removeEventListener('keydown', closeExport);
    };
  }, []);

  useEffect(() => {
    if (!langOpen) return undefined;
    const handlePointerDown = (event) => {
      if (!langRef.current?.contains(event.target)) setLangOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setLangOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [langOpen]);

  const searchLabel = t('search', { defaultValue: 'Search' });
  const shortcutLabel = navigator.platform?.toLowerCase?.().includes('mac') ? 'Cmd K' : 'Ctrl K';

  return (
    <header className="saki-topbar sticky top-0 z-20 flex h-11 items-center justify-between border-b border-white/20 bg-white/40 px-3 backdrop-blur-xl transition-colors duration-300 dark:border-white/10 dark:bg-[#12131a]/55 sm:px-3.5">
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={toggleSidebar}
          className="rounded-lg p-1.5 text-gray-700 transition-colors hover:bg-white/40 hover:text-[#ff75ac] dark:text-gray-200 dark:hover:bg-white/10 dark:hover:text-[#ff9bc8]"
          title={t('toggle_sidebar') || 'Toggle Sidebar'}
          aria-label={t('toggle_sidebar') || 'Toggle sidebar'}
        >
          <Menu size={18} />
        </button>


        <div data-onboarding-id="header-search">
          <button
            onClick={onOpenCommandPalette}
            className="group hidden items-center gap-2 rounded-lg border border-white/45 bg-white/50 px-2.5 py-1 text-left shadow-sm backdrop-blur-md transition-all hover:border-[#ff75ac]/40 hover:bg-white/80 dark:border-white/10 dark:bg-white/5 dark:hover:border-[#ff75ac]/40 dark:hover:bg-white/10 md:flex"
          >
            <Search size={14} className="text-gray-400 transition-colors group-hover:text-[#ff75ac] dark:text-gray-500 dark:group-hover:text-[#ff9bc8]" />
            <span className="text-xs font-medium text-gray-600 transition-colors group-hover:text-gray-900 dark:text-gray-300 dark:group-hover:text-white">
              {searchLabel}
            </span>
            <span className="rounded-md bg-gray-100/80 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 dark:bg-white/10 dark:text-gray-400">
              {shortcutLabel}
            </span>
          </button>

          <button
            onClick={onOpenCommandPalette}
            className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-white/40 hover:text-[#ff75ac] dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-[#ff9bc8] md:hidden"
            title={searchLabel}
            aria-label={searchLabel}
          >
            <Search size={16} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        <div className="relative" ref={langRef}>
          <button
            type="button"
            onClick={() => setLangOpen((open) => !open)}
            aria-haspopup="listbox"
            aria-expanded={langOpen}
            aria-label={t('language')}
            title={t('language')}
            className="flex h-8 items-center gap-1 rounded-lg border border-white/40 bg-white/50 px-2 text-gray-700 shadow-sm backdrop-blur-md transition-all hover:border-[#ff75ac]/40 hover:bg-white/85 hover:text-[#ff75ac] dark:border-white/10 dark:bg-white/10 dark:text-gray-200 dark:hover:border-[#ff75ac]/50 dark:hover:bg-white/15 dark:hover:text-[#ff9bc8]"
          >
            <Globe size={14} className="shrink-0" />
            <span className="hidden text-[11px] font-semibold sm:inline">{currentLang.short}</span>
            <ChevronDown size={12} className={`shrink-0 transition-transform duration-200 ${langOpen ? 'rotate-180' : ''}`} />
          </button>

          {langOpen && (
            <ul
              role="listbox"
              className="absolute right-0 top-[calc(100%+6px)] z-30 min-w-[9.5rem] overflow-hidden rounded-xl border border-white/50 bg-white/95 p-1 shadow-lg shadow-black/10 backdrop-blur-xl dark:border-white/10 dark:bg-[#1b1c24]/95"
            >
              {LANG_OPTIONS.map((option) => {
                const active = isOptionActive(option, activeLang);
                return (
                  <li key={option.code}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        changeSakiLang(option.code);
                        setLangOpen(false);
                      }}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                        active
                          ? 'bg-[#ff75ac]/15 text-[#ff75ac] dark:bg-[#ff75ac]/20 dark:text-[#ff9bc8]'
                          : 'text-gray-700 hover:bg-[#ff75ac]/10 hover:text-[#ff75ac] dark:text-gray-200 dark:hover:bg-white/10 dark:hover:text-[#ff9bc8]'
                      }`}
                    >
                      <span>{option.label}</span>
                      {active && <span className="text-[10px] font-bold">●</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <button
          onClick={onToggleTheme}
          title={theme === 'dark' ? (t('switch_to_light') || '切换至浅色模式') : (t('switch_to_dark') || '切换至深色模式')}
          className="theme-toggle-btn group relative flex h-8 w-8 items-center justify-center rounded-lg border border-white/40 bg-white/50 text-gray-700 shadow-sm backdrop-blur-md transition-all hover:scale-105 hover:border-[#ff75ac]/40 hover:bg-white/85 hover:text-[#ff75ac] active:scale-95 dark:border-white/10 dark:bg-white/10 dark:text-gray-200 dark:hover:border-[#ff75ac]/50 dark:hover:bg-white/15 dark:hover:text-[#ff9bc8]"
          aria-label={theme === 'dark' ? (t('switch_to_light') || '切换至浅色模式') : (t('switch_to_dark') || '切换至深色模式')}
        >
          {theme === 'dark' ? (
            <Sun size={15} className="text-amber-400 transition-transform duration-300 group-hover:rotate-45" />
          ) : (
            <Moon size={15} className="text-[#ff75ac] transition-transform duration-300 group-hover:-rotate-12" />
          )}
        </button>

        <button
          onClick={onToggleMusic}
          title={isMusicPlaying ? (t('stop_music') || 'Stop Music') : (t('music_mode') || 'Dance & Radio Mode')}
          aria-pressed={isMusicPlaying}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all ${
            isMusicPlaying
              ? 'border-rose-200 bg-rose-50/80 text-rose-500 dark:border-rose-500/30 dark:bg-rose-500/20 dark:text-rose-300'
              : 'border-white/40 bg-white/50 text-gray-600 shadow-sm backdrop-blur-md hover:border-[#ff75ac]/40 hover:bg-white/85 hover:text-[#ff75ac] dark:border-white/10 dark:bg-white/10 dark:text-gray-300 dark:hover:border-[#ff75ac]/40 dark:hover:bg-white/15 dark:hover:text-[#ff9bc8]'
          }`}
        >
          <Music size={15} className={isMusicPlaying ? 'animate-pulse text-[#ff75ac]' : ''} />
        </button>

        <details ref={exportRef} className="relative">
        <summary
          aria-label={t('export')}
          aria-disabled={!hasMessages || isExporting}
          onClick={event => { if (!hasMessages || isExporting) event.preventDefault(); }}
          title={hasMessages ? t('export') : t('no_messages_export')}
          className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 transition-all ${
            hasMessages
              ? 'border-white/40 bg-white/50 text-gray-600 shadow-sm backdrop-blur-md hover:border-[#ff75ac]/40 hover:bg-white/85 hover:text-[#ff75ac] dark:border-white/10 dark:bg-white/10 dark:text-gray-300 dark:hover:border-[#ff75ac]/40 dark:hover:bg-white/15 dark:hover:text-[#ff9bc8]'
              : 'cursor-not-allowed border-gray-300/70 bg-white/35 text-gray-500 shadow-sm dark:border-white/15 dark:bg-white/5 dark:text-gray-400'
          }`}
        >
          <Image size={15} />
          <span className="hidden text-xs font-medium md:inline">{isExporting ? '…' : t('export')}</span>
        </summary>
        <div className="absolute right-0 top-10 z-50 min-w-40 rounded-xl border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
          {[['md', 'Markdown (.md)'], ['pdf', 'PDF (.pdf)'], ['png', 'PNG (.png)']].map(([format, label]) => (
            <button key={format} type="button" disabled={!hasMessages || isExporting}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-40 dark:text-gray-200 dark:hover:bg-gray-800"
              onClick={event => { event.currentTarget.closest('details').open = false; onExport(format); }}>{label}</button>
          ))}
        </div>
        </details>
      </div>
    </header>
  );
}
