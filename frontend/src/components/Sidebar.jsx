import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  MessageSquare,
  BookOpen,
  Settings as SettingsIcon,
  Trash2,
  FolderOpen,
  Brain,
  Clock,
  Wrench,
  MessageCircle,
  Search,
} from 'lucide-react';
import { getFeatureLocale } from '../utils/featureLocale';

const MOBILE_BREAKPOINT = 768;

function isMobileViewport() {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
}

export default function Sidebar({
  isOpen,
  setOpen,
  history,
  currentChatId,
  onSelectChat,
  onDeleteChat,
  onNewChat,
  onContinueChat,
  onToggleGuide,
  onToggleSettings,
  onToggleFileManager,
  onToggleMemoryManager,
  onToggleSkillManager,
  onToggleHostedTasks,
  onToggleThirdPartyChats,
  activeUtilityKeys = [],
  isUtilityLayerActive = false,
}) {
  const { t, i18n } = useTranslation();
  const ui = getFeatureLocale(i18n.resolvedLanguage || i18n.language);
  const isChineseUi = String(i18n.resolvedLanguage || i18n.language || '').toLowerCase().startsWith('zh');
  const getLocalText = (zhText, enText) => (isChineseUi ? zhText : enText);
  const [hasNewTaskResults, setHasNewTaskResults] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobile, setIsMobile] = useState(isMobileViewport());
  const activeUtilityKeySet = new Set(activeUtilityKeys);

  useEffect(() => {
    const handleResize = () => setIsMobile(isMobileViewport());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const checkTasks = async () => {
      try {
        const res = await fetch(`${window.location.origin}/api/hosted-tasks`);
        const data = await res.json();
        const lastSeen = parseInt(localStorage.getItem('hostedTasksLastSeen') || '0', 10);
        const hasFresh = Array.isArray(data) && data.some((task) => {
          if (!task.results || task.results.length === 0) return false;
          return task.results[0].timestamp > lastSeen;
        });
        setHasNewTaskResults(hasFresh);
      } catch {
        // Ignore background polling errors.
      }
    };

    checkTasks();
    const interval = setInterval(checkTasks, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleMobileClose = () => {
    if (isMobile) setOpen(false);
  };

  const handleSelectChat = (chatId) => {
    onSelectChat(chatId);
    handleMobileClose();
  };

  const handleNewChat = () => {
    onNewChat();
    handleMobileClose();
  };

  const formatTimestamp = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const locale = isChineseUi ? 'zh-CN' : 'en-US';
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredHistory = history.filter((item) => {
    if (!normalizedQuery) return true;
    return `${item.title || ''} ${item.source || ''} ${formatTimestamp(item.updatedAt)}`.toLowerCase().includes(normalizedQuery);
  });

  const utilityActions = [
    {
      key: 'memory',
      label: t('memory'),
      icon: Brain,
      onClick: () => {
        onToggleMemoryManager?.();
        handleMobileClose();
      },
    },
    {
      key: 'skill',
      label: ui.sidebar.skillSystem,
      icon: Wrench,
      onClick: () => {
        onToggleSkillManager?.();
        handleMobileClose();
      },
    },
    {
      key: 'hosted',
      label: ui.sidebar.hostedTasks,
      icon: Clock,
      badge: hasNewTaskResults,
      onClick: () => {
        localStorage.setItem('hostedTasksLastSeen', Date.now().toString());
        setHasNewTaskResults(false);
        onToggleHostedTasks?.();
        handleMobileClose();
      },
    },
    {
      key: 'files',
      label: t('file_management'),
      icon: FolderOpen,
      onClick: () => {
        onToggleFileManager?.();
        handleMobileClose();
      },
    },
    {
      key: 'third-party',
      label: ui.sidebar.thirdPartyChat,
      icon: MessageCircle,
      onClick: () => {
        onToggleThirdPartyChats?.();
        handleMobileClose();
      },
    },
  ];
  const [hoveredUtilityKey, setHoveredUtilityKey] = useState(null);
  const hoveredUtilityIndex = utilityActions.findIndex((action) => action.key === hoveredUtilityKey);

  const getDockButtonMetrics = (index) => {
    if (hoveredUtilityIndex < 0) {
      return {
        buttonSize: 36,
        iconSize: 14,
        labelTop: 33,
        slotWidth: 36,
        translateY: 0,
        zIndex: 1,
      };
    }

    const distance = Math.abs(index - hoveredUtilityIndex);

    if (distance === 0) {
      return {
        buttonSize: 48,
        iconSize: 18,
        labelTop: 42,
        slotWidth: 48,
        translateY: -10,
        zIndex: 30,
      };
    }

    if (distance === 1) {
      return {
        buttonSize: 42,
        iconSize: 16,
        labelTop: 37,
        slotWidth: 42,
        translateY: -5,
        zIndex: 20,
      };
    }

    if (distance === 2) {
      return {
        buttonSize: 38,
        iconSize: 15,
        labelTop: 34,
        slotWidth: 38,
        translateY: -2,
        zIndex: 10,
      };
    }

    return {
      buttonSize: 36,
      iconSize: 14,
      labelTop: 33,
      slotWidth: 36,
      translateY: 0,
      zIndex: 1,
    };
  };

  const desktopWidthClass = isOpen
    ? 'md:w-72 md:opacity-100 md:pointer-events-auto md:border-r'
    : 'md:w-0 md:opacity-0 md:pointer-events-none md:border-r-0';

  return (
    <>
      {isMobile && isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 ${isUtilityLayerActive ? 'z-[120]' : 'z-50'} flex h-full w-[18rem] max-w-[88vw] flex-col overflow-hidden border-white/10 bg-black/55 text-white shadow-2xl backdrop-blur-xl transition-all duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } ${desktopWidthClass} md:relative md:translate-x-0 md:shadow-none`}
      >
        <div className="flex h-full flex-col overflow-hidden bg-black/15 px-4 py-4">
          <button
            onClick={handleNewChat}
            className="mb-4 flex w-full items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-3 py-3 text-left text-sm font-semibold text-white transition-colors hover:bg-white/15"
          >
            <Plus size={18} />
            <span>{t('new_chat')}</span>
          </button>

          <div className="mb-4 rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5" data-onboarding-id="sidebar-history-search">
            <div className="flex items-center gap-2 text-white/70">
              <Search size={15} />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={getLocalText('实时搜索历史...', 'Filter history...')}
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
              />
            </div>
          </div>

          <div className="flex-1 space-y-1 overflow-y-auto py-1 text-white/85 scrollbar-hide">
            {filteredHistory.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-4 text-center text-sm text-white/45">
                {normalizedQuery ? getLocalText('没有匹配的对话', 'No matching chats') : t('no_history')}
              </div>
            ) : (
              filteredHistory.map((item) => (
                <div
                  key={item.id}
                  className={`group relative flex cursor-pointer items-start gap-3 rounded-2xl px-3 py-3 text-sm transition-all ${
                    currentChatId === item.id ? 'bg-white/18 text-white shadow-inner' : 'hover:bg-white/10'
                  }`}
                  onClick={() => handleSelectChat(item.id)}
                >
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${currentChatId === item.id ? 'bg-blue-500/30 text-blue-200' : 'bg-white/10 text-white/60'}`}>
                    <MessageSquare size={16} />
                  </div>
                  <div className="min-w-0 flex-1 pr-8">
                    <div className={`truncate leading-5 ${currentChatId === item.id ? 'font-semibold' : 'font-medium'}`}>
                      {item.title}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-white/35">
                      <span>{formatTimestamp(item.updatedAt)}</span>
                      {item.source === 'qqbot' && <span>QQ</span>}
                    </div>
                    {item.isPending && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-amber-200">
                          {getLocalText('进行中', 'Pending')}
                        </span>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            onContinueChat?.(item.id);
                          }}
                          className="rounded-full bg-blue-500/15 px-3 py-1 text-[10px] font-semibold text-blue-200 transition-colors hover:bg-blue-500/25"
                          title="Continue"
                        >
                          {getLocalText('继续', 'Continue')}
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={(event) => onDeleteChat(event, item.id)}
                    className="absolute right-3 top-3 rounded-full p-1 text-white/30 transition-all hover:bg-white/10 hover:text-red-300 md:opacity-0 md:group-hover:opacity-100"
                    title={t('delete')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
            <div
              data-onboarding-id="sidebar-utilities-dock"
              className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.07] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-[padding] duration-200 ease-out"
              onMouseLeave={() => setHoveredUtilityKey(null)}
            >
              <div className="flex items-end justify-center gap-0.5">
                {utilityActions.map((action, index) => {
                  const Icon = action.icon;
                  const isLabelVisible = hoveredUtilityKey === action.key;
                  const isOpen = activeUtilityKeySet.has(action.key);
                  const dockMetrics = getDockButtonMetrics(index);
                  return (
                    <div
                      key={action.key}
                      className="relative flex shrink-0 flex-col items-center justify-end transition-[width] duration-200 ease-out"
                      style={{ width: `${dockMetrics.slotWidth}px` }}
                    >
                      <button
                        onClick={action.onClick}
                        onMouseEnter={() => setHoveredUtilityKey(action.key)}
                        onFocus={() => setHoveredUtilityKey(action.key)}
                        onBlur={() => setHoveredUtilityKey(null)}
                        className={`relative flex shrink-0 items-center justify-center rounded-xl border transition-[width,height,background-color,border-color,color,box-shadow,transform] duration-200 ease-out focus:outline-none focus:ring-2 focus:ring-white/20 ${
                          isOpen
                            ? 'border-amber-300/75 bg-amber-300/[0.16] text-amber-50 shadow-[0_0_0_1px_rgba(252,211,77,0.35),0_0_24px_rgba(251,191,36,0.28),inset_0_1px_0_rgba(255,255,255,0.22)]'
                            : 'border-transparent bg-white/[0.06] text-white/70 hover:bg-white/[0.12] hover:text-white'
                        }`}
                        style={{
                          height: `${dockMetrics.buttonSize}px`,
                          transform: `translateY(${dockMetrics.translateY}px)`,
                          width: `${dockMetrics.buttonSize}px`,
                          zIndex: dockMetrics.zIndex,
                        }}
                        title={action.label}
                      >
                        <Icon size={dockMetrics.iconSize} />
                        {action.badge && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.15)]" />}
                      </button>
                      <span
                        className={`pointer-events-none absolute left-1/2 top-[2.05rem] z-10 w-max max-w-[5.75rem] -translate-x-1/2 whitespace-nowrap text-center text-[10px] font-medium tracking-[0.12em] text-white/78 transition-all duration-200 ease-out ${
                          isLabelVisible ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
                        }`}
                        style={{ top: `${dockMetrics.labelTop}px` }}
                      >
                        {action.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2" data-onboarding-id="sidebar-guide-settings">
              <SidebarAction
                label={getLocalText('功能指南', 'Guide')}
                icon={BookOpen}
                onClick={() => {
                  onToggleGuide?.();
                  handleMobileClose();
                }}
                active={activeUtilityKeySet.has('guide')}
                className="justify-center bg-white/[0.08] text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:bg-white/[0.14]"
              />
              <SidebarAction
                label={t('settings')}
                icon={SettingsIcon}
                onClick={() => {
                  onToggleSettings?.();
                  handleMobileClose();
                }}
                active={activeUtilityKeySet.has('settings')}
                className="justify-center bg-white/[0.08] text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:bg-white/[0.14]"
              />
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function SidebarAction({ label, icon: Icon, onClick, badge = false, active = false, className = '' }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left text-sm font-medium transition-[border-color,background-color,color,box-shadow] ${className} ${
        active
          ? 'border-amber-300/75 bg-amber-300/[0.14] text-amber-50 shadow-[0_0_0_1px_rgba(252,211,77,0.28),0_0_24px_rgba(251,191,36,0.22)]'
          : 'border-transparent text-white/70 hover:bg-white/10 hover:text-white'
      }`}
    >
      <Icon size={18} />
      <span>{label}</span>
      {badge && <span className="absolute right-3 h-2 w-2 rounded-full bg-red-500 animate-pulse" />}
    </button>
  );
}
