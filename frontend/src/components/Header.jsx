import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import { Menu, Search, Image, Music, Sun, Moon, Globe, ChevronDown, Upload, Play, Pause, SkipForward, Trash2, Video, MessageCircle, Bot, MessageSquarePlus } from 'lucide-react';
import { changeSakiLang } from '../i18n';
import { localizeWith } from '../utils/localize';
import { activeUiLanguage, uiLanguages } from '../utils/uiLanguageOptions';

export default function Header({
  isSidebarOpen = true,
  toggleSidebar,
  onNewChat,
  onOpenCommandPalette,
  onVideoCall,
  videoCallDisabled,
  onExport,
  isExporting = false,
  hasMessages,
  isMusicPlaying,
  onToggleMusic,
  musicPlaylist = [],
  currentMusicIndex = 0,
  onSelectMusic,
  onUploadMusic,
  onRemoveMusic,
  theme = 'light',
  onToggleTheme,
  appMode = 'work',
  onAppModeChange
}) {
  const { t, i18n } = useTranslation();
  const shouldReduceMotion = useReducedMotion();
  const activeLang = i18n.resolvedLanguage || i18n.language;
  const currentLang = activeUiLanguage(activeLang);
  const [langOpen, setLangOpen] = useState(false);
  const [musicOpen, setMusicOpen] = useState(false);
  const langRef = useRef(null);
  const musicRef = useRef(null);
  const exportRef = useRef(null);

  useEffect(() => {
    const closeExport = event => {
      if (exportRef.current && (event.key === 'Escape' || (event.type === 'pointerdown' && !exportRef.current.contains(event.target)))) {
        exportRef.current.open = false;
      }
    };
    document.addEventListener('pointerdown', closeExport);
    document.addEventListener('keydown', closeExport);
    return () => {
      document.removeEventListener('pointerdown', closeExport);
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
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [langOpen]);

  useEffect(() => {
    if (!musicOpen) return undefined;
    const handlePointerDown = (event) => {
      if (!musicRef.current?.contains(event.target)) setMusicOpen(false);
    };
    const handleKeyDown = (event) => { if (event.key === 'Escape') setMusicOpen(false); };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [musicOpen]);

  const searchLabel = t('search', { defaultValue: 'Search' });
  const shortcutLabel = navigator.platform?.toLowerCase?.().includes('mac') ? 'Cmd K' : 'Ctrl K';
  const chatModeHint = localizeWith(activeLang,
    'Chat 模式：不加载 Agent 提示词，响应更快；搜索、查证、生图、深度研究、记忆和 PPT 仍可用',
    'Chat mode: no agent prompt, faster replies; search, fact-check, image generation, deep research, memory and PPT still work',
    'チャットモード：エージェントプロンプトを使わず高速応答。検索・真偽確認・画像生成・深掘り調査・記憶・PPTは利用可能');
  const workModeHint = localizeWith(activeLang,
    'Work 模式：完整 Agent，可读写工作区文件、执行终端任务',
    'Work mode: full agent with workspace file and terminal tools',
    'ワークモード：ワークスペースのファイル操作やターミナル実行を含む完全なエージェント');
  const modeGroupLabel = localizeWith(activeLang, 'Chat / Work 模式', 'Chat / Work mode', 'Chat / Work モード');
  const pillTransition = shouldReduceMotion
    ? { duration: 0.15 }
    : { type: 'spring', stiffness: 460, damping: 34, mass: 0.85 };
  const modeOptions = [
    {
      id: 'chat',
      label: 'Chat',
      hint: chatModeHint,
      Icon: MessageCircle,
      activeRotate: -6,
      inactiveClass: 'text-gray-600 hover:text-sky-600 dark:text-gray-300 dark:hover:text-sky-300',
      pillBackground: 'linear-gradient(135deg, #38bdf8 0%, #22d3ee 52%, #3b82f6 100%)',
      pillShadow: '0 2px 10px rgba(56, 189, 248, 0.36), inset 0 1px 0 rgba(255, 255, 255, 0.48)',
    },
    {
      id: 'work',
      label: 'Work',
      hint: workModeHint,
      Icon: Bot,
      activeRotate: 6,
      inactiveClass: 'text-gray-600 hover:text-[#ff5b9a] dark:text-gray-300 dark:hover:text-[#ff9bc8]',
      pillBackground: 'linear-gradient(135deg, #ff85b7 0%, #ff6fa8 52%, #f43f8e 100%)',
      pillShadow: '0 2px 10px rgba(255, 117, 172, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.48)',
    },
  ];

  return (
    <header className="saki-topbar sticky top-0 z-20 flex min-h-[2.75rem] h-11 items-center justify-between gap-2 border-b border-white/20 bg-white/40 pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] backdrop-blur-xl transition-colors duration-300 dark:border-white/10 dark:bg-[#12131a]/55 sm:px-3.5">
      <div className="flex min-w-0 items-center gap-1 sm:gap-2.5">
        <button
          onClick={toggleSidebar}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-gray-700 transition-colors hover:bg-white/40 hover:text-[#ff75ac] dark:text-gray-200 dark:hover:bg-white/10 dark:hover:text-[#ff9bc8]"
          title={t('toggle_sidebar') || 'Toggle Sidebar'}
          aria-label={t('toggle_sidebar') || 'Toggle sidebar'}
        >
          <Menu size={18} />
        </button>

        <AnimatePresence initial={false}>
          {!isSidebarOpen && onNewChat && (
            <motion.button
              key="header-new-chat"
              type="button"
              onClick={onNewChat}
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.85, width: 0 }}
              animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, width: '2rem' }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.85, width: 0 }}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.92 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              title={t('new_chat') || '新建对话'}
              aria-label={t('new_chat') || '新建对话'}
              className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl text-gray-700 transition-colors hover:bg-white/40 hover:text-[#ff75ac] dark:text-gray-200 dark:hover:bg-white/10 dark:hover:text-[#ff9bc8]"
            >
              <MessageSquarePlus size={16} className="shrink-0" />
            </motion.button>
          )}
        </AnimatePresence>

        <LayoutGroup id="header-app-mode">
          <div
            className={`relative flex h-8 shrink-0 items-center gap-0.5 rounded-xl border bg-white/55 p-0.5 shadow-[0_2px_10px_rgba(31,38,135,0.06),inset_0_1px_0_rgba(255,255,255,0.85)] backdrop-blur-xl transition-colors duration-300 dark:bg-white/[0.06] dark:shadow-[0_2px_12px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.12)] ${
              appMode === 'chat'
                ? 'border-sky-300/50 dark:border-sky-400/25'
                : 'border-[#ff75ac]/35 dark:border-[#ff75ac]/30'
            }`}
            role="group"
            aria-label={modeGroupLabel}
          >
            {modeOptions.map(({ id, label, hint, Icon, activeRotate, inactiveClass, pillBackground, pillShadow }) => {
              const isActive = appMode === id;
              return (
                <motion.button
                  key={id}
                  type="button"
                  onClick={() => onAppModeChange?.(id)}
                  aria-pressed={isActive}
                  title={hint}
                  whileTap={shouldReduceMotion ? undefined : { scale: 0.94 }}
                  className={`relative flex h-full select-none items-center gap-1.5 !rounded-[10px] px-1.5 text-[11px] font-semibold tracking-wide transition-colors duration-200 sm:px-2.5 ${
                    isActive
                      ? 'text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.12)]'
                      : inactiveClass
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="saki-app-mode-pill"
                      aria-hidden="true"
                      transition={pillTransition}
                      style={{
                        background: pillBackground,
                        boxShadow: pillShadow,
                      }}
                      className="absolute inset-0 rounded-[0.6rem] ring-1 ring-white/25"
                    />
                  )}
                  <motion.span
                    className="relative z-10 flex items-center justify-center"
                    animate={
                      shouldReduceMotion
                        ? undefined
                        : {
                            scale: isActive ? 1.08 : 1,
                            rotate: isActive ? activeRotate : 0,
                          }
                    }
                    transition={{ type: 'spring', stiffness: 500, damping: 24 }}
                  >
                    <Icon size={13} className="shrink-0" />
                  </motion.span>
                  <span className="relative z-10 hidden sm:inline">{label}</span>
                </motion.button>
              );
            })}
          </div>
        </LayoutGroup>

        <div data-onboarding-id="header-search">
          <button
            onClick={onOpenCommandPalette}
            className="group hidden h-8 items-center gap-2 rounded-xl border border-white/45 bg-white/50 px-2.5 text-left shadow-sm backdrop-blur-md transition-all hover:border-[#ff75ac]/40 hover:bg-white/80 dark:border-white/10 dark:bg-white/5 dark:hover:border-[#ff75ac]/40 dark:hover:bg-white/10 md:flex"
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
            className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-white/40 hover:text-[#ff75ac] dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-[#ff9bc8] md:hidden"
            title={searchLabel}
            aria-label={searchLabel}
          >
            <Search size={16} />
          </button>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {onVideoCall && (
          <motion.button
            type="button"
            onClick={onVideoCall}
            disabled={videoCallDisabled}
            whileHover={shouldReduceMotion || videoCallDisabled ? undefined : { y: -0.5 }}
            whileTap={shouldReduceMotion || videoCallDisabled ? undefined : { scale: 0.95 }}
            aria-label={activeLang?.startsWith('zh') ? '视频通话' : 'Video call'}
            title={activeLang?.startsWith('zh') ? '视频通话' : 'Video call'}
            className="group relative flex h-8 w-8 items-center justify-center gap-1.5 rounded-xl border border-[#ff75ac]/35 bg-gradient-to-br from-white/75 via-[#fff0f6]/75 to-[#ffe0ee]/70 px-0 text-xs font-semibold text-[#b92761] shadow-[0_2px_10px_rgba(255,117,172,0.14),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md transition-all duration-200 hover:border-[#ff75ac]/60 hover:from-white/95 hover:to-[#ffd6e8]/85 hover:text-[#ff5b9a] hover:shadow-[0_4px_14px_rgba(255,117,172,0.24),inset_0_1px_0_rgba(255,255,255,0.95)] disabled:pointer-events-none disabled:opacity-45 dark:border-[#ff75ac]/30 dark:from-[#ff75ac]/20 dark:via-[#ff75ac]/15 dark:to-[#ff5b9a]/10 dark:text-[#ffb3d3] dark:shadow-[0_2px_12px_rgba(255,117,172,0.12),inset_0_1px_0_rgba(255,255,255,0.14)] dark:hover:border-[#ff75ac]/55 dark:hover:from-[#ff75ac]/30 dark:hover:via-[#ff75ac]/20 dark:hover:to-[#ff5b9a]/20 dark:hover:text-[#ffd1e6] dark:hover:shadow-[0_4px_16px_rgba(255,117,172,0.24)] sm:w-auto sm:px-2.5"
          >
            <span className="relative flex items-center justify-center">
              <Video size={14} className="transition-transform duration-200 group-hover:scale-110" />
              {!videoCallDisabled && (
                <span
                  aria-hidden="true"
                  className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[#ff5b9a] ring-2 ring-white/80 dark:ring-[#1b1c24]/80"
                />
              )}
            </span>
            <span className="hidden sm:inline">{activeLang?.startsWith('zh') ? '视频通话' : 'Video call'}</span>
          </motion.button>
        )}

        <div className="flex h-8 items-center gap-0.5 rounded-xl border border-white/50 bg-white/55 p-0.5 shadow-[0_2px_10px_rgba(31,38,135,0.06),inset_0_1px_0_rgba(255,255,255,0.85)] backdrop-blur-xl transition-colors duration-300 dark:border-white/10 dark:bg-white/[0.07] dark:shadow-[0_2px_12px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.12)] sm:gap-1">
          <div className="relative" ref={langRef}>
            <button
              type="button"
              onClick={() => {
                setMusicOpen(false);
                setLangOpen((open) => !open);
              }}
              aria-haspopup="listbox"
              aria-expanded={langOpen}
              aria-label={t('language')}
              title={t('language')}
              className={`flex h-7 w-[30px] items-center justify-center gap-1 !rounded-[10px] transition-all sm:w-auto sm:px-2 ${
                langOpen
                  ? 'bg-[#ff75ac]/15 text-[#ff75ac] dark:bg-[#ff75ac]/20 dark:text-[#ff9bc8]'
                  : 'text-gray-700 hover:bg-white/75 hover:text-[#ff75ac] dark:text-gray-200 dark:hover:bg-white/10 dark:hover:text-[#ff9bc8]'
              }`}
            >
              <Globe size={14} className="shrink-0" />
              <span className="hidden text-[11px] font-semibold sm:inline">{currentLang.short}</span>
              <ChevronDown size={11} className={`hidden shrink-0 transition-transform duration-200 sm:inline ${langOpen ? 'rotate-180' : ''}`} />
            </button>

            {langOpen && (
              <ul
                role="listbox"
                className="absolute right-0 top-[calc(100%+8px)] z-30 min-w-[9.5rem] overflow-hidden rounded-2xl border border-white/50 bg-white/95 p-1.5 shadow-xl shadow-black/10 backdrop-blur-xl dark:border-white/10 dark:bg-[#1b1c24]/95"
              >
                {uiLanguages.map((option) => {
                  const active = option === currentLang;
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
                        className={`flex w-full items-center justify-between gap-2 !rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors sm:py-1.5 ${
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

          <span aria-hidden="true" className="hidden h-3.5 w-px bg-black/[0.06] dark:bg-white/10 sm:block" />

          <button
            onClick={onToggleTheme}
            title={theme === 'dark' ? (t('switch_to_light') || '切换至浅色模式') : (t('switch_to_dark') || '切换至深色模式')}
            className="theme-toggle-btn group relative flex h-7 w-[30px] items-center justify-center !rounded-[10px] text-gray-700 transition-all hover:bg-white/75 hover:text-[#ff75ac] active:scale-95 dark:text-gray-200 dark:hover:bg-white/10 dark:hover:text-[#ff9bc8] sm:w-7"
            aria-label={theme === 'dark' ? (t('switch_to_light') || '切换至浅色模式') : (t('switch_to_dark') || '切换至深色模式')}
          >
            {theme === 'dark' ? (
              <Sun size={15} className="text-amber-400 transition-transform duration-300 group-hover:rotate-45" />
            ) : (
              <Moon size={15} className="text-[#ff75ac] transition-transform duration-300 group-hover:-rotate-12" />
            )}
          </button>

          <span aria-hidden="true" className="hidden h-3.5 w-px bg-black/[0.06] dark:bg-white/10 sm:block" />

          <div
            className="relative"
            ref={musicRef}
            onMouseEnter={() => {
              if (window.matchMedia('(hover: hover) and (min-width: 768px)').matches) setMusicOpen(true);
            }}
            onMouseLeave={() => {
              if (window.matchMedia('(hover: hover) and (min-width: 768px)').matches) setMusicOpen(false);
            }}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setMusicOpen(false);
            }}
          >
            <button
              type="button"
              onClick={() => {
                setLangOpen(false);
                const isTouchOrMobile = window.matchMedia('(max-width: 767px), (hover: none)').matches;
                if (isTouchOrMobile || musicPlaylist.length === 0) {
                  setMusicOpen((open) => !open);
                } else {
                  onToggleMusic?.();
                }
              }}
              title={isMusicPlaying ? (t('stop_music') || 'Stop Music') : (t('music_mode') || 'Dance & Radio Mode')}
              aria-pressed={isMusicPlaying}
              aria-expanded={musicOpen}
              aria-label={t('music_mode')}
              className={`flex h-7 w-[30px] items-center justify-center !rounded-[10px] transition-all sm:w-7 ${
                isMusicPlaying
                  ? 'bg-rose-500/15 text-rose-500 dark:bg-rose-500/20 dark:text-rose-300'
                  : musicOpen
                    ? 'bg-[#ff75ac]/15 text-[#ff75ac] dark:bg-[#ff75ac]/20 dark:text-[#ff9bc8]'
                    : 'text-gray-600 hover:bg-white/75 hover:text-[#ff75ac] dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-[#ff9bc8]'
              }`}
            >
              <Music size={15} className={isMusicPlaying ? 'animate-pulse text-[#ff75ac]' : ''} />
            </button>
            {musicOpen && (
              <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(18.5rem,calc(100vw-1rem))]">
                <div className="rounded-2xl border border-white/50 bg-white/95 p-2.5 shadow-xl shadow-black/10 backdrop-blur-xl dark:border-white/10 dark:bg-[#1b1c24]/95">
                  <div className="mb-2 flex items-center justify-between px-1">
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-200">{t('music_playlist', { defaultValue: '播放列表' })}</span>
                    <label className="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-[#ff75ac] transition-colors hover:bg-[#ff75ac]/10">
                      <Upload size={13} /> {t('upload_music', { defaultValue: '上传音乐' })}
                      <input type="file" accept="audio/*" multiple className="hidden" onChange={(event) => { onUploadMusic?.(event.target.files); event.target.value = ''; }} />
                    </label>
                  </div>
                  {musicPlaylist.length === 0 ? (
                    <div className="px-2 py-4 text-center text-[11px] text-gray-400">{t('no_music', { defaultValue: '暂无音乐，请上传音频文件' })}</div>
                  ) : (
                    <div className="max-h-52 space-y-1 overflow-y-auto">
                      {musicPlaylist.map((track, index) => (
                        <div key={track.id} className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${index === currentMusicIndex ? 'bg-[#ff75ac]/12 text-[#ff75ac]' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/10'}`}>
                          <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => onSelectMusic?.(index)} title={track.name}>{track.name}</button>
                          {index === currentMusicIndex && (isMusicPlaying ? <Pause size={13} /> : <Play size={13} />)}
                          <button type="button" className="saki-touch-visible rounded p-1 text-gray-400 opacity-100 transition-opacity hover:text-rose-500 md:opacity-0 md:group-hover:opacity-100" onClick={() => onRemoveMusic?.(index)} aria-label={t('delete') || '删除'}><Trash2 size={13} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                  {musicPlaylist.length > 0 && (
                    <div className="mt-2 flex items-center justify-between gap-2 border-t border-gray-200/70 px-1 pt-2 dark:border-white/10">
                      <span className="min-w-0 flex-1 truncate text-[11px] text-gray-500 dark:text-gray-400">{musicPlaylist[currentMusicIndex]?.name}</span>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={onToggleMusic}
                          title={isMusicPlaying ? (t('stop_music') || 'Pause') : (t('music_mode') || 'Play')}
                          aria-label={isMusicPlaying ? (t('stop_music') || 'Pause') : (t('music_mode') || 'Play')}
                          className="flex h-7 w-7 items-center justify-center !rounded-lg bg-[#ff75ac]/15 text-[#ff75ac] transition-colors hover:bg-[#ff75ac]/25"
                        >
                          {isMusicPlaying ? <Pause size={13} /> : <Play size={13} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectMusic?.((currentMusicIndex + 1) % musicPlaylist.length)}
                          title={t('next_music') || '下一首'}
                          aria-label={t('next_music') || '下一首'}
                          className="flex h-7 w-7 items-center justify-center !rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-[#ff75ac] dark:text-gray-300 dark:hover:bg-white/10"
                        >
                          <SkipForward size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <span aria-hidden="true" className="hidden h-3.5 w-px bg-black/[0.06] dark:bg-white/10 sm:block" />

          <details ref={exportRef} className="relative">
            <summary
              aria-label={t('export')}
              aria-disabled={!hasMessages || isExporting}
              onClick={event => {
                setLangOpen(false);
                setMusicOpen(false);
                if (!hasMessages || isExporting) event.preventDefault();
              }}
              title={hasMessages ? t('export') : t('no_messages_export')}
              className={`flex h-7 w-[30px] cursor-pointer list-none items-center justify-center gap-1.5 rounded-[10px] transition-all [&::-webkit-details-marker]:hidden sm:w-auto sm:px-2 ${
                hasMessages
                  ? 'text-gray-600 hover:bg-white/75 hover:text-[#ff75ac] dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-[#ff9bc8]'
                  : 'cursor-not-allowed text-gray-400/80 dark:text-gray-500'
              }`}
            >
              <Image size={15} />
              <span className="hidden text-xs font-medium md:inline">{isExporting ? '…' : t('export')}</span>
            </summary>
            <div className="absolute right-0 top-[calc(100%+8px)] z-50 min-w-40 rounded-2xl border border-white/50 bg-white/95 p-1.5 shadow-xl shadow-black/10 backdrop-blur-xl dark:border-white/10 dark:bg-[#1b1c24]/95">
              {[['md', 'Markdown (.md)'], ['pdf', 'PDF (.pdf)'], ['png', 'PNG (.png)']].map(([format, label]) => (
                <button key={format} type="button" disabled={!hasMessages || isExporting}
                  className="block w-full !rounded-lg px-3 py-2 text-left text-xs font-medium text-gray-700 hover:bg-[#ff75ac]/10 hover:text-[#ff75ac] disabled:opacity-40 dark:text-gray-200 dark:hover:bg-white/10 dark:hover:text-[#ff9bc8]"
                  onClick={event => { event.currentTarget.closest('details').open = false; onExport(format); }}>{label}</button>
              ))}
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
