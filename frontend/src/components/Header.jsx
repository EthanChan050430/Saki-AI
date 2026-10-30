import React from 'react';
import { useTranslation } from 'react-i18next';
import { Menu, Search, Image, Music, Sun, Moon } from 'lucide-react';

export default function Header({
  toggleSidebar,
  onOpenCommandPalette,
  onExport,
  hasMessages,
  isMusicPlaying,
  onToggleMusic,
  theme = 'light',
  onToggleTheme
}) {
  const { t, i18n } = useTranslation();
  const searchLabel = t('search', { defaultValue: String(i18n.resolvedLanguage || i18n.language).startsWith('zh') ? '搜索' : 'Search' });
  const shortcutLabel = navigator.platform?.toLowerCase?.().includes('mac') ? 'Cmd K' : 'Ctrl K';

  return (
    <header className="saki-topbar sticky top-0 z-20 flex h-11 items-center justify-between border-b border-white/20 bg-white/40 px-3 backdrop-blur-xl transition-colors duration-300 dark:border-white/10 dark:bg-[#12131a]/55 sm:px-3.5">
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={toggleSidebar}
          className="rounded-lg p-1.5 text-gray-700 transition-colors hover:bg-white/40 hover:text-[#ff75ac] dark:text-gray-200 dark:hover:bg-white/10 dark:hover:text-[#ff9bc8]"
          title={t('toggle_sidebar') || 'Toggle Sidebar'}
          aria-label="Toggle sidebar"
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
        {/* Dark / Light Theme Toggle */}
        <button
          onClick={onToggleTheme}
          title={theme === 'dark' ? (t('switch_to_light') || '切换至浅色模式') : (t('switch_to_dark') || '切换至深色模式')}
          className="theme-toggle-btn group relative flex h-8 w-8 items-center justify-center rounded-lg border border-white/40 bg-white/50 text-gray-700 shadow-sm backdrop-blur-md transition-all hover:scale-105 hover:border-[#ff75ac]/40 hover:bg-white/85 hover:text-[#ff75ac] active:scale-95 dark:border-white/10 dark:bg-white/10 dark:text-gray-200 dark:hover:border-[#ff75ac]/50 dark:hover:bg-white/15 dark:hover:text-[#ff9bc8]"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? (
            <Sun size={15} className="text-amber-400 transition-transform duration-300 group-hover:rotate-45" />
          ) : (
            <Moon size={15} className="text-[#ff75ac] transition-transform duration-300 group-hover:-rotate-12" />
          )}
        </button>

        <button
          onClick={onToggleMusic}
          title={isMusicPlaying ? 'Stop Music' : 'Dance & Radio Mode'}
          aria-pressed={isMusicPlaying}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all ${
            isMusicPlaying
              ? 'border-rose-200 bg-rose-50/80 text-rose-500 dark:border-rose-500/30 dark:bg-rose-500/20 dark:text-rose-300'
              : 'border-white/40 bg-white/50 text-gray-600 shadow-sm backdrop-blur-md hover:border-[#ff75ac]/40 hover:bg-white/85 hover:text-[#ff75ac] dark:border-white/10 dark:bg-white/10 dark:text-gray-300 dark:hover:border-[#ff75ac]/40 dark:hover:bg-white/15 dark:hover:text-[#ff9bc8]'
          }`}
        >
          <Music size={15} className={isMusicPlaying ? 'animate-pulse text-[#ff75ac]' : ''} />
        </button>

        <button
          onClick={onExport}
          disabled={!hasMessages}
          title={hasMessages ? t('export_chat_image') : t('no_messages_export')}
          className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 transition-all ${
            hasMessages
              ? 'border-white/40 bg-white/50 text-gray-600 shadow-sm backdrop-blur-md hover:border-[#ff75ac]/40 hover:bg-white/85 hover:text-[#ff75ac] dark:border-white/10 dark:bg-white/10 dark:text-gray-300 dark:hover:border-[#ff75ac]/40 dark:hover:bg-white/15 dark:hover:text-[#ff9bc8]'
              : 'cursor-not-allowed border-gray-300/70 bg-white/35 text-gray-500 shadow-sm dark:border-white/15 dark:bg-white/5 dark:text-gray-400'
          }`}
        >
          <Image size={15} />
          <span className="hidden text-xs font-medium md:inline">{t('export')}</span>
        </button>
      </div>
    </header>
  );
}
