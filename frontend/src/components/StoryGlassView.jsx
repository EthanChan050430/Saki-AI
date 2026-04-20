import React, { useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BadgeCheck,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Clock3,
  Sparkles,
} from 'lucide-react';
import { BACKEND_URL } from '../utils/backendUrl';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toList(value, limit = 6) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, limit);
  }

  if (typeof value === 'string') {
    return value
      .split(/[,，、\n]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, limit);
  }

  return [];
}

function toEmotionFlavorMap(value, limit = 4) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === 'string') {
        const [emotion = '', flavor = '', reason = ''] = item.split(/\s*(?:->|→|:|：|-)\s*/);
        return {
          emotion: emotion.trim(),
          flavor: flavor.trim(),
          reason: reason.trim(),
        };
      }

      if (!item || typeof item !== 'object') return null;
      return {
        emotion: String(item.emotion || item.mood || item.signal || '').trim(),
        flavor: String(item.flavor || item.note || item.drinkCue || '').trim(),
        reason: String(item.reason || item.explanation || item.why || '').trim(),
      };
    })
    .filter((item) => item?.emotion && item?.flavor)
    .slice(0, limit);
}

function getStageLabel(stage = '', getLocalText) {
  switch (stage) {
    case 'listening':
      return getLocalText('听故事', 'Listening');
    case 'distilling':
      return getLocalText('提取情绪', 'Distilling');
    case 'mixing':
      return getLocalText('调配风味', 'Mixing');
    case 'plating':
      return getLocalText('上杯收尾', 'Plating');
    case 'illustrating':
      return getLocalText('绘制特调', 'Illustrating');
    case 'completed':
      return getLocalText('完成', 'Completed');
    case 'error':
      return getLocalText('生成失败', 'Failed');
    default:
      return getLocalText('准备中', 'Preparing');
  }
}

function getModeMeta(mode = '', getLocalText) {
  if (mode === 'night-bar') {
    return {
      label: getLocalText('夜幕酒馆版', 'Night Bar'),
      badge: 'border-amber-200/40 bg-slate-950/70 text-amber-100',
      panel: 'from-amber-400/18 via-rose-300/10 to-transparent',
      bar: 'from-amber-300 via-orange-300 to-rose-300',
      glow: 'bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.24),transparent_44%)]',
    };
  }

  if (mode === 'zero-proof') {
    return {
      label: getLocalText('无酒精灵感版', 'Zero Proof'),
      badge: 'border-emerald-200/60 bg-emerald-50/80 text-emerald-700',
      panel: 'from-emerald-300/24 via-teal-200/12 to-transparent',
      bar: 'from-emerald-300 via-teal-300 to-cyan-300',
      glow: 'bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.24),transparent_44%)]',
    };
  }

  return {
    label: getLocalText('居家轻饮版', 'Comfort Home'),
    badge: 'border-rose-200/70 bg-rose-50/90 text-rose-700',
    panel: 'from-rose-300/24 via-sky-200/12 to-transparent',
    bar: 'from-rose-300 via-fuchsia-200 to-sky-300',
    glow: 'bg-[radial-gradient(circle_at_top_right,rgba(244,114,182,0.22),transparent_44%)]',
  };
}

const StoryGlassViewVariantContext = React.createContext('light');

function DetailCard({ icon: Icon, title, children, variant = null }) {
  const inheritedVariant = useContext(StoryGlassViewVariantContext);
  const isBar = (variant || inheritedVariant) === 'bar';
  const cardClassName = isBar
    ? 'rounded-[1.05rem] border border-amber-100/12 bg-[linear-gradient(145deg,rgba(255,244,214,0.07),rgba(1,9,11,0.22))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_44px_rgba(0,0,0,0.22)] backdrop-blur-[10px]'
    : 'rounded-[1.4rem] border border-white/65 bg-white/78 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)] backdrop-blur-md';
  const titleClassName = isBar
    ? 'mb-3 flex items-center gap-2 text-sm font-semibold text-amber-50/88'
    : 'mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700';
  const iconClassName = isBar
    ? 'flex h-8 w-8 items-center justify-center rounded-lg border border-amber-100/14 bg-black/22 text-amber-100/82'
    : 'flex h-8 w-8 items-center justify-center rounded-2xl bg-slate-100 text-slate-600';

  return (
    <div className={cardClassName}>
      <div className={titleClassName}>
        <span className={iconClassName}>
          <Icon size={15} />
        </span>
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

function resolveStoryGlassImageUrl(source = '') {
  const normalized = String(source || '').trim();
  if (!normalized) return '';
  if (normalized.startsWith('data:image/')) return normalized;
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) return normalized;
  return `${BACKEND_URL}${normalized}`;
}

export default function StoryGlassView({
  data = {},
  isEmbedded = false,
  onRemix = null,
  remixActions = [],
  variant = 'light',
}) {
  const { i18n } = useTranslation();
  const [detailsOpen, setDetailsOpen] = useState(true);
  const localeIsZh = String(i18n.resolvedLanguage || i18n.language || '').toLowerCase().startsWith('zh');
  const getLocalText = (zhText, enText) => (localeIsZh ? zhText : enText);

  const progress = clamp(Number(data.progress) || 0, 0, 100);
  const tags = toList(data.storyTags, 5);
  const tastingNotes = toList(data.tastingNotes, 4);
  const emotionFlavorMap = toEmotionFlavorMap(data.emotionFlavorMap, 4);
  const recipeList = toList(data.recipeList, 6);
  const pairings = toList(data.pairingSuggestions, 4);
  const modeMeta = getModeMeta(data.recipeMode, getLocalText);
  const stageLabel = getStageLabel(data.currentStage, getLocalText);
  const isRunning = data.status === 'running' || data.status === 'pending';
  const isError = data.status === 'error';
  const name = String(data.cocktailName || getLocalText('故事特调', 'Story Glass')).trim();
  const englishName = String(data.cocktailNameEn || '').trim();
  const subtitle = String(data.cocktailSubtitle || '').trim();
  const quote = String(data.featuredQuote || '').trim();
  const storySummary = String(data.storySummary || '').trim();
  const flavorDescription = String(data.flavorDescription || '').trim();
  const glassware = String(data.glassware || '').trim();
  const garnish = String(data.garnish || '').trim();
  const servingMoment = String(data.servingMoment || '').trim();
  const sakiComment = String(data.sakiComment || '').trim();
  const coverImageUrl = resolveStoryGlassImageUrl(data.coverImageUrl || '');
  const coverImageAlt = String(data.coverImageAlt || `${name} illustration`).trim();
  const illustrationPending = !coverImageUrl && (data.currentStage === 'illustrating' || data.illustrationStatus === 'running');
  const hasHeroVisual = Boolean(coverImageUrl || illustrationPending);
  const canRemix = typeof onRemix === 'function' && !isRunning && !isError && remixActions.length > 0;
  const isBar = variant === 'bar';
  const outerClassName = isEmbedded
    ? (isBar ? 'rounded-[1.15rem]' : 'rounded-[1.8rem]')
    : (isBar ? 'rounded-[1.25rem]' : 'rounded-[2rem]');
  const summaryGridClass = isEmbedded
    ? '2xl:grid-cols-[minmax(0,1.12fr)_minmax(280px,0.88fr)]'
    : 'xl:grid-cols-[minmax(0,1.12fr)_minmax(280px,0.88fr)]';
  const heroGridClass = hasHeroVisual
    ? (isEmbedded
      ? '2xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.98fr)] 2xl:items-start'
      : 'lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.98fr)] lg:items-start')
    : '';
  const detailsGridClass = isEmbedded ? '2xl:grid-cols-2' : 'lg:grid-cols-2';
  const shellClassName = isBar
    ? `relative overflow-hidden border border-amber-100/12 bg-[linear-gradient(145deg,rgba(12,21,19,0.56),rgba(3,8,9,0.30)_42%,rgba(38,20,8,0.32))] ${outerClassName} shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_30px_96px_rgba(0,0,0,0.36)] text-amber-50 backdrop-blur-[8px]`
    : `relative overflow-hidden border border-white/60 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(249,250,251,0.92))] ${outerClassName} shadow-[0_24px_70px_rgba(15,23,42,0.12)]`;
  const modeWashClassName = isBar
    ? 'absolute inset-0 bg-[linear-gradient(118deg,rgba(251,191,36,0.10),transparent_34%,rgba(20,184,166,0.07)_70%,transparent)]'
    : `absolute inset-0 bg-gradient-to-br ${modeMeta.panel}`;
  const glowClassName = isBar
    ? 'absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),transparent_24%,rgba(0,0,0,0.14))]'
    : `absolute inset-0 ${modeMeta.glow}`;
  const softLightAClassName = isBar
    ? 'absolute left-0 top-0 h-px w-full bg-[linear-gradient(90deg,transparent,rgba(253,230,138,0.48),transparent)]'
    : 'absolute -left-16 top-10 h-40 w-40 rounded-full bg-white/45 blur-3xl';
  const softLightBClassName = isBar
    ? 'absolute bottom-0 left-8 right-8 h-px bg-[linear-gradient(90deg,transparent,rgba(94,234,212,0.26),transparent)]'
    : 'absolute -bottom-12 right-0 h-48 w-48 rounded-full bg-sky-200/25 blur-3xl';
  const chipClassName = isBar
    ? 'inline-flex items-center gap-1.5 rounded-md border border-amber-100/16 bg-black/18 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-50/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md'
    : 'inline-flex items-center gap-1.5 rounded-full border border-slate-200/70 bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 shadow-sm';
  const modeBadgeClassName = isBar
    ? 'inline-flex items-center rounded-md border border-amber-100/16 bg-amber-100/10 px-3 py-1 text-xs font-semibold text-amber-50/72 shadow-sm backdrop-blur-md'
    : `inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold shadow-sm ${modeMeta.badge}`;
  const stageChipClassName = isBar
    ? `inline-flex items-center rounded-md border px-3 py-1 text-xs font-semibold shadow-sm backdrop-blur-md ${
      isError
        ? 'border-rose-200/30 bg-rose-950/26 text-rose-100'
        : 'border-white/12 bg-black/16 text-white/62'
    }`
    : `inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold shadow-sm ${
      isError
        ? 'border-rose-200 bg-rose-50 text-rose-600'
        : 'border-slate-200/70 bg-white/85 text-slate-500'
    }`;
  const heroSurfaceClassName = isBar
    ? 'overflow-hidden rounded-[1.1rem] border border-amber-100/12 bg-[linear-gradient(140deg,rgba(255,244,214,0.08),rgba(3,12,13,0.28)_42%,rgba(0,0,0,0.10))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_20px_54px_rgba(0,0,0,0.24)] sm:p-6'
    : 'overflow-hidden rounded-[1.7rem] border border-white/70 bg-[linear-gradient(140deg,rgba(255,255,255,0.95),rgba(248,250,252,0.86))] p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] sm:p-6';
  const moodSurfaceClassName = isBar
    ? 'rounded-[1.1rem] border border-amber-100/12 bg-[linear-gradient(160deg,rgba(255,244,214,0.07),rgba(2,12,13,0.24))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_50px_rgba(0,0,0,0.22)]'
    : 'rounded-[1.7rem] border border-white/70 bg-[linear-gradient(160deg,rgba(255,255,255,0.95),rgba(241,245,249,0.88))] p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)]';
  const eyebrowClassName = isBar
    ? 'text-[11px] font-semibold uppercase tracking-[0.26em] text-amber-50/44'
    : 'text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-400';
  const smallEyebrowClassName = isBar
    ? 'text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-50/44'
    : 'text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400';
  const titleClassName = isBar
    ? 'mt-2 break-words text-3xl font-black tracking-tight text-amber-50 drop-shadow-[0_2px_18px_rgba(0,0,0,0.38)] sm:text-[2.25rem]'
    : 'mt-2 break-words text-3xl font-black tracking-tight text-slate-900 sm:text-[2.25rem]';
  const mutedClassName = isBar ? 'text-white/48' : 'text-slate-400';
  const bodyClassName = isBar ? 'text-white/72' : 'text-slate-700';
  const secondaryBodyClassName = isBar ? 'text-white/55' : 'text-slate-500';
  const quoteClassName = isBar
    ? 'mt-5 rounded-[0.95rem] border-l border-amber-100/28 bg-black/16 px-4 py-4 text-sm leading-7 text-amber-50/76 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-[6px]'
    : 'mt-5 rounded-[1.45rem] border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.84),rgba(255,255,255,0.62))] px-4 py-4 text-sm leading-7 text-slate-700 shadow-sm';
  const tagClassName = isBar
    ? 'rounded-md border border-amber-100/12 bg-black/16 px-3 py-1 text-xs font-semibold text-amber-50/62 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
    : 'rounded-full border border-white/70 bg-white/85 px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm';
  const visualFrameClassName = isBar
    ? 'relative self-start overflow-hidden rounded-[1.05rem] border border-amber-100/14 bg-[linear-gradient(165deg,rgba(255,244,214,0.08),rgba(2,12,13,0.36))] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_52px_rgba(0,0,0,0.28)]'
    : 'relative self-start overflow-hidden rounded-[1.7rem] border border-white/80 bg-[linear-gradient(165deg,rgba(255,255,255,0.94),rgba(241,245,249,0.86))] shadow-[0_18px_45px_rgba(15,23,42,0.1)]';
  const moodMapPanelClassName = isBar
    ? 'mt-5 rounded-[1rem] border border-amber-100/12 bg-black/14 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
    : 'mt-5 rounded-[1.3rem] border border-white/70 bg-white/72 px-4 py-3 shadow-sm';
  const moodMapItemClassName = isBar
    ? 'rounded-xl border border-white/8 bg-white/6 px-3 py-2.5'
    : 'rounded-2xl border border-slate-100 bg-slate-50/72 px-3 py-2.5';
  const progressTrackClassName = isBar
    ? 'mt-2 h-2 overflow-hidden rounded-full bg-white/10'
    : 'mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200/80';
  const noteClassName = isBar
    ? 'mt-5 rounded-[1rem] border border-amber-100/12 bg-[linear-gradient(145deg,rgba(251,191,36,0.10),rgba(0,0,0,0.16))] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
    : 'mt-5 rounded-[1.3rem] border border-white/70 bg-white/78 px-4 py-3 shadow-sm';
  const errorClassName = isBar
    ? 'mt-5 rounded-[1rem] border border-rose-200/24 bg-rose-950/30 px-4 py-3 text-sm leading-7 text-rose-100'
    : 'mt-5 rounded-[1.3rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-7 text-rose-600';
  const detailsButtonClassName = isBar
    ? 'mt-4 inline-flex items-center gap-2 rounded-md border border-amber-100/14 bg-black/18 px-3.5 py-2 text-xs font-semibold text-amber-50/68 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-all hover:border-amber-100/28 hover:bg-amber-100/10 hover:text-amber-50'
    : 'mt-4 inline-flex items-center gap-2 rounded-full border border-white/75 bg-white/85 px-3.5 py-2 text-xs font-semibold text-slate-600 shadow-sm transition-all hover:bg-white';
  const remixPanelClassName = isBar
    ? 'mt-4 rounded-[1.05rem] border border-amber-100/12 bg-black/16 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-md'
    : 'mt-4 rounded-[1.35rem] border border-white/70 bg-white/72 px-4 py-3 shadow-sm backdrop-blur-md';
  const remixButtonClassName = isBar
    ? 'inline-flex items-center gap-1.5 rounded-md border border-amber-100/16 bg-amber-100/10 px-3 py-1.5 text-xs font-semibold text-amber-50/78 shadow-sm transition-all hover:border-amber-100/34 hover:bg-amber-100/18 hover:text-amber-50'
    : 'inline-flex items-center gap-1.5 rounded-full border border-rose-100 bg-white/85 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition-all hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700';
  const detailTextClassName = isBar ? 'text-sm leading-7 text-white/72' : 'text-sm leading-7 text-slate-700';
  const detailMutedTextClassName = isBar ? 'text-sm leading-7 text-white/46' : 'text-sm leading-7 text-slate-500';
  const detailChipClassName = isBar
    ? 'rounded-md border border-amber-100/12 bg-black/14 px-3 py-1 text-xs font-semibold text-amber-50/62'
    : 'rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600';
  const recipeItemClassName = isBar
    ? 'rounded-xl border border-white/8 bg-white/6 px-3 py-2.5 text-sm text-white/72'
    : 'rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 text-sm text-slate-700';
  const serveTextClassName = isBar ? 'space-y-3 text-sm leading-7 text-white/72' : 'space-y-3 text-sm leading-7 text-slate-700';
  const detailMetaClassName = isBar ? 'space-y-1 text-white/58' : 'space-y-1 text-slate-600';
  const pairingChipClassName = isBar
    ? 'rounded-md border border-amber-100/12 bg-black/14 px-3 py-1.5 text-xs font-semibold text-amber-50/62 shadow-sm'
    : 'rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm';

  return (
    <StoryGlassViewVariantContext.Provider value={variant}>
      <section className={shellClassName}>
      <div className={modeWashClassName} />
      <div className={glowClassName} />
      <div className={softLightAClassName} />
      <div className={softLightBClassName} />

      <div className="relative z-10 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={chipClassName}>
            <Sparkles size={12} className="text-rose-500" />
            {getLocalText('故事杯', 'Story Glass')}
          </span>
          <span className={modeBadgeClassName}>
            {String(data.recipeModeLabel || modeMeta.label)}
          </span>
          <span className={stageChipClassName}>
            {stageLabel}
          </span>
        </div>

        <div className={`mt-4 grid gap-4 ${summaryGridClass}`}>
          <div className={heroSurfaceClassName}>
            <div className={`grid gap-5 ${heroGridClass}`}>
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className={eyebrowClassName}>
                      {getLocalText('Saki 为你调了一杯', 'Saki mixed this for you')}
                    </div>
                    <h3 className={titleClassName}>
                      {name}
                    </h3>
                    {englishName ? (
                      <div className={`mt-1 text-sm font-semibold uppercase tracking-[0.18em] ${mutedClassName}`}>
                        {englishName}
                      </div>
                    ) : null}
                    {subtitle ? (
                      <p className={`mt-3 max-w-2xl text-sm leading-7 ${isBar ? 'text-white/64' : 'text-slate-600'}`}>
                        {subtitle}
                      </p>
                    ) : null}
                  </div>
                  {!hasHeroVisual ? (
                    <div className={`hidden h-20 w-20 shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] sm:flex sm:items-center sm:justify-center ${
                      isBar
                        ? 'rounded-xl border border-amber-100/14 bg-black/16'
                        : 'rounded-[1.8rem] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(241,245,249,0.82))]'
                    }`}>
                      <div className={`h-14 w-14 rounded-full bg-gradient-to-br ${modeMeta.bar} opacity-80 blur-[1px]`} />
                    </div>
                  ) : null}
                </div>

                {quote ? (
                    <div className={quoteClassName}>
                    “{quote}”
                  </div>
                ) : null}

                {tags.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className={tagClassName}
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              {hasHeroVisual ? (
                <div className={visualFrameClassName}>
                  <div className="relative aspect-[16/9] overflow-hidden bg-[radial-gradient(circle_at_top,rgba(244,114,182,0.16),transparent_48%),linear-gradient(160deg,rgba(15,23,42,0.94),rgba(51,65,85,0.84))]">
                    {coverImageUrl ? (
                      <>
                        <img
                          src={coverImageUrl}
                          alt=""
                          aria-hidden="true"
                          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-2xl saturate-125"
                        />
                        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.2),rgba(15,23,42,0.4))]" />
                        <div className={`absolute inset-x-[14%] bottom-[10%] h-[22%] rounded-full bg-gradient-to-r ${modeMeta.bar} opacity-30 blur-3xl`} />
                        <div className="absolute inset-[1.1rem] rounded-[1.45rem] border border-white/18 bg-white/6 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-[2px]" />
                        <div className="absolute inset-[1.65rem] overflow-hidden rounded-[1.15rem]">
                          <img
                            src={coverImageUrl}
                            alt={coverImageAlt}
                            loading="lazy"
                            className="h-full w-full object-cover shadow-[0_20px_60px_rgba(15,23,42,0.42)]"
                          />
                        </div>
                      </>
                    ) : (
                      <div className="relative flex h-full items-center justify-center overflow-hidden">
                        <div className={`absolute inset-x-[14%] bottom-[12%] h-[24%] rounded-full bg-gradient-to-r ${modeMeta.bar} opacity-32 blur-3xl`} />
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.18),transparent_24%),radial-gradient(circle_at_80%_18%,rgba(255,255,255,0.12),transparent_20%)]" />
                        <div className="relative flex flex-col items-center gap-4 px-6 text-center text-white/90">
                          <div className={`h-24 w-[4.75rem] rounded-b-[2.3rem] rounded-t-[1rem] border border-white/35 bg-gradient-to-b ${modeMeta.bar} shadow-[0_10px_30px_rgba(15,23,42,0.28)]`} />
                          <div className="space-y-1">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-white/65">
                              {getLocalText('杯中写照', 'Drink Portrait')}
                            </div>
                            <div className="text-sm font-medium text-white/88">
                              {getLocalText('Saki 正在绘制这杯特调', 'Saki is painting this drink')}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
                      <span className="rounded-full border border-white/45 bg-black/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/90 backdrop-blur-md">
                        {getLocalText('杯中写照', 'Drink Portrait')}
                      </span>
                      <div className={`h-10 w-10 shrink-0 rounded-2xl bg-gradient-to-br ${modeMeta.bar} opacity-80 shadow-[0_8px_24px_rgba(15,23,42,0.24)]`} />
                    </div>

                    {(glassware || garnish) ? (
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4">
                        <div className="flex flex-wrap gap-2">
                          {glassware ? (
                            <span className="rounded-full border border-white/45 bg-black/24 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur-md">
                              {getLocalText('杯型', 'Glassware')}: {glassware}
                            </span>
                          ) : null}
                          {garnish ? (
                            <span className="rounded-full border border-white/45 bg-black/24 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur-md">
                              {getLocalText('点缀', 'Garnish')}: {garnish}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className={moodSurfaceClassName}>
            <div className={smallEyebrowClassName}>
              {getLocalText('情绪折射', 'Mood Reflection')}
            </div>

            {storySummary ? (
              <p className={`mt-3 text-sm leading-7 ${bodyClassName}`}>
                {storySummary}
              </p>
            ) : (
              <p className={`mt-3 text-sm leading-7 ${secondaryBodyClassName}`}>
                {getLocalText('Saki 正在从你的故事里提取情绪和风味线索。', 'Saki is distilling mood and flavor cues from your story.')}
              </p>
            )}

            {emotionFlavorMap.length > 0 ? (
              <div className={moodMapPanelClassName}>
                <div className={`mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] ${isBar ? 'text-amber-50/42' : 'text-slate-400'}`}>
                  {getLocalText('情绪变风味', 'Mood To Flavor')}
                </div>
                <div className="space-y-2.5">
                  {emotionFlavorMap.map((item) => (
                    <div key={`${item.emotion}-${item.flavor}`} className={moodMapItemClassName}>
                      <div className={`flex flex-wrap items-center gap-2 text-xs font-bold ${isBar ? 'text-amber-50/78' : 'text-slate-700'}`}>
                        <span>{item.emotion}</span>
                        <span className="text-rose-400">→</span>
                        <span>{item.flavor}</span>
                      </div>
                      {item.reason ? (
                        <p className={`mt-1.5 text-xs leading-6 ${isBar ? 'text-white/48' : 'text-slate-500'}`}>
                          {item.reason}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {isRunning ? (
              <div className="mt-5">
                <div className={`flex items-center justify-between text-xs font-semibold ${secondaryBodyClassName}`}>
                  <span>{stageLabel}</span>
                  <span>{progress}%</span>
                </div>
                <div className={progressTrackClassName}>
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${modeMeta.bar} transition-all duration-500`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            ) : null}

            {sakiComment ? (
              <div className={noteClassName}>
                <div className={`mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] ${isBar ? 'text-amber-50/42' : 'text-slate-400'}`}>
                  {getLocalText('Saki 备注', 'Saki Note')}
                </div>
                <p className={`text-sm leading-7 ${bodyClassName}`}>
                  {sakiComment}
                </p>
              </div>
            ) : null}

            {isError && data.error ? (
              <div className={errorClassName}>
                {String(data.error)}
              </div>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setDetailsOpen((prev) => !prev)}
          className={detailsButtonClassName}
        >
          {detailsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {detailsOpen
            ? getLocalText('收起调制细节', 'Hide details')
            : getLocalText('展开调制细节', 'Show details')}
        </button>

        {canRemix ? (
          <div className={remixPanelClassName}>
            <div className={`mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] ${isBar ? 'text-amber-50/42' : 'text-slate-400'}`}>
              <Sparkles size={12} className="text-rose-500" />
              {getLocalText('再调一下', 'Remix')}
            </div>
            <div className="flex flex-wrap gap-2">
              {remixActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => onRemix(action)}
                  className={remixButtonClassName}
                >
                  <Sparkles size={12} className="text-rose-400" />
                  {getLocalText(action.labels?.zh || '', action.labels?.en || '')}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {detailsOpen ? (
          <div className={`mt-4 grid gap-3 ${detailsGridClass}`}>
            <DetailCard icon={BadgeCheck} title={getLocalText('风味线索', 'Flavor Notes')}>
              {flavorDescription ? (
                <p className={detailTextClassName}>
                  {flavorDescription}
                </p>
              ) : (
                <p className={detailMutedTextClassName}>
                  {getLocalText('风味描述正在整理中。', 'Flavor notes are still being prepared.')}
                </p>
              )}
              {tastingNotes.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {tastingNotes.map((item) => (
                    <span
                      key={item}
                      className={detailChipClassName}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              ) : null}
            </DetailCard>

            <DetailCard icon={BookOpen} title={getLocalText('配方清单', 'Recipe')}>
              {recipeList.length > 0 ? (
                <div className="space-y-2">
                  {recipeList.map((item) => (
                    <div
                      key={item}
                      className={recipeItemClassName}
                    >
                      {item}
                    </div>
                  ))}
                </div>
              ) : (
                <p className={detailMutedTextClassName}>
                  {getLocalText('配方还在最后校对。', 'The recipe is still being finalized.')}
                </p>
              )}
            </DetailCard>

            <DetailCard icon={Clock3} title={getLocalText('上杯方式', 'Serve It')}>
              <div className={serveTextClassName}>
                {servingMoment ? (
                  <p>{servingMoment}</p>
                ) : (
                  <p className={isBar ? 'text-white/46' : 'text-slate-500'}>
                    {getLocalText('适饮时刻会在调制完成后出现。', 'The serving moment will appear after plating.')}
                  </p>
                )}
                {(glassware || garnish) ? (
                  <div className={detailMetaClassName}>
                    {glassware ? <div>{getLocalText('杯型', 'Glassware')}: {glassware}</div> : null}
                    {garnish ? <div>{getLocalText('点缀', 'Garnish')}: {garnish}</div> : null}
                  </div>
                ) : null}
              </div>
            </DetailCard>

            <DetailCard icon={Sparkles} title={getLocalText('搭配建议', 'Pairings')}>
              {pairings.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {pairings.map((item) => (
                    <span
                      key={item}
                      className={pairingChipClassName}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              ) : (
                <p className={detailMutedTextClassName}>
                  {getLocalText('搭配建议正在补全中。', 'Pairing suggestions are on the way.')}
                </p>
              )}
            </DetailCard>
          </div>
        ) : null}
      </div>
      </section>
    </StoryGlassViewVariantContext.Provider>
  );
}
