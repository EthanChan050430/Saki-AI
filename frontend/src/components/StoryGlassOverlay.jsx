import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Download,
  Mic,
  MicOff,
  Palette,
  Play,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  Volume2,
  Wine,
  X,
} from 'lucide-react';
import StoryGlassView from './StoryGlassView';

const STORY_GLASS_BACKGROUND = '/assets/gushibei.png';
const STORY_GLASS_BUBBLE_IMAGE = '/assets/bubble.png';
const STORY_GLASS_MOVIES = {
  defaultIdle: '/assets/movie/default-idle.mp4',
  listening: '/assets/movie/listening.mp4',
  thinkingReply: '/assets/movie/thinking-reply.mp4',
  decidingToMix: '/assets/movie/deciding-to-mix.mp4',
  mixing: '/assets/movie/mixing.mp4',
  served: '/assets/movie/served.mp4',
  idleGesture: '/assets/movie/idle-gesture.mp4',
  continueTalking: '/assets/movie/continue-talking.mp4',
  gameIdleLoop: '/assets/movie/game-idle-loop.mp4',
};
const STORY_GLASS_IDLE_MOVIE_KEYS = ['defaultIdle', 'idleGesture', 'gameIdleLoop'];
const STORY_GLASS_INITIAL_MOVIE_KEY = STORY_GLASS_IDLE_MOVIE_KEYS[0];
const STORY_GLASS_MIXING_INTRO_MS = 1800;
const STORY_GLASS_SHELF_FAVORITES_KEY = 'story_glass_shelf_favorites_v1';
const STORY_GLASS_MOVIE_PRELOAD_GROUPS = {
  initial: ['defaultIdle', 'listening'],
  idle: STORY_GLASS_IDLE_MOVIE_KEYS,
  conversation: ['thinkingReply', 'continueTalking'],
  mixing: ['decidingToMix', 'mixing', 'served'],
};

function isStoryGlassTtsActive() {
  if (typeof window === 'undefined') return false;
  const sovitsAudio = window.currentSovitsAudio;
  return Boolean(
    window.__sakiTtsPending
    || window.speechSynthesis?.speaking
    || (sovitsAudio && !sovitsAudio.paused && !sovitsAudio.ended)
  );
}

function stopStoryGlassSpeechPlayback(onStopSpeech) {
  if (typeof window === 'undefined') return;

  try {
    onStopSpeech?.();
  } catch {}

  try {
    window.speechSynthesis?.cancel?.();
  } catch {}

  const sovitsAudio = window.currentSovitsAudio;
  if (sovitsAudio) {
    try {
      sovitsAudio.pause();
      sovitsAudio.currentTime = 0;
    } catch {}
  }

  window.__sakiTtsPending = false;
  window.__sakiTtsToken = null;
}

function getSpeechLanguage(language = '') {
  const normalized = String(language || '').toLowerCase();
  if (normalized.startsWith('zh-tw')) return 'zh-TW';
  if (normalized.startsWith('zh')) return 'zh-CN';
  if (normalized.startsWith('ja')) return 'ja-JP';
  if (normalized.startsWith('fr')) return 'fr-FR';
  if (normalized.startsWith('en-gb')) return 'en-GB';
  return 'en-US';
}

function compactWhitespace(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function appendTranscript(previous = '', addition = '') {
  const next = compactWhitespace(addition);
  if (!next) return previous;
  const current = String(previous || '').trim();
  if (!current) return next;
  return `${current}\n${next}`;
}

function getStoryStats(text = '', segments = []) {
  const normalized = String(text || '').trim();
  const cjkChars = (normalized.match(/[\u3400-\u9fff]/g) || []).length;
  const latinWords = (normalized.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g) || []).length;
  const storyUnits = cjkChars + latinWords * 2.1;
  const punctuationSentences = (normalized.match(/[。！？!?]+|\.(?:\s|$)/g) || []).length;
  const lineSentences = normalized.split(/\n+/).map(item => item.trim()).filter(Boolean).length;
  const sentenceCount = Math.max(punctuationSentences, lineSentences);
  const segmentCount = Array.isArray(segments) ? segments.length : 0;

  return {
    cjkChars,
    latinWords,
    sentenceCount,
    segmentCount,
    storyUnits,
  };
}

function getReadiness(stats, elapsedMs = 0) {
  const contentScore = Math.min(42, (stats.storyUnits / 92) * 42);
  const sentenceScore = Math.min(22, (stats.sentenceCount / 2) * 22);
  const segmentScore = Math.min(20, (stats.segmentCount / 3) * 20);
  const timeScore = Math.min(16, (elapsedMs / 12000) * 16);
  const score = Math.min(100, Math.round(contentScore + sentenceScore + segmentScore + timeScore));
  const hasEnoughContent = stats.cjkChars >= 72 || stats.latinWords >= 44 || stats.storyUnits >= 92;
  const hasEnoughShape = stats.sentenceCount >= 2 && stats.segmentCount >= 2;
  const hasEnoughTime = elapsedMs >= 7000;

  return {
    score,
    canMix: hasEnoughContent && hasEnoughShape && hasEnoughTime,
  };
}

function createLocalSakiDecision({ storyText = '', turnText = '', turns = [], getLocalText }) {
  const stats = getStoryStats(storyText, turns.filter((turn) => turn.role === 'user'));
  const latest = compactWhitespace(turnText || storyText);
  const excerpt = latest.length > 34 ? `${latest.slice(0, 34)}...` : latest;
  const shouldMix = stats.storyUnits >= 104 && stats.sentenceCount >= 2 && stats.segmentCount >= 2;
  const hasShape = stats.storyUnits >= 64 || stats.sentenceCount >= 2;
  const mood = shouldMix ? 'ready-to-mix' : hasShape ? 'touched-holding' : 'listening';

  return {
    reply: shouldMix
      ? getLocalText(
        '嗯，这段已经有杯口了。它不只是片段，里面有起伏和余温，我想给你调一杯。',
        'Mm, this has a glass now. It is no longer just a fragment; it has a little arc and aftertaste. I want to mix it.'
      )
      : getLocalText(
        excerpt
          ? `我听见了，尤其是「${excerpt}」这里有一点味道。你继续讲，我还想再等它沉一下。`
          : '我在听。等它变成一段真的故事，我再给你一杯。',
        excerpt
          ? `I heard that, especially "${excerpt}". There is flavor there already. Keep going; I want to let it settle a bit more.`
          : 'I am listening. Take your time; when it becomes a real story, I will pour.'
      ),
    shouldMix,
    reason: shouldMix
      ? getLocalText('故事已经有了清楚的情绪线。', 'The story has a clear enough emotional line.')
      : getLocalText('故事还需要再成形一点。', 'The story still needs a little more shape.'),
    mood,
    confidence: shouldMix ? 0.72 : hasShape ? 0.62 : 0.56,
  };
}

function getLatestStoryGlassMessage(messages = [], submittedAt = 0, submittedStory = '') {
  const storyText = compactWhitespace(submittedStory);
  const threshold = Number(submittedAt) ? Number(submittedAt) - 4000 : 0;

  return [...(Array.isArray(messages) ? messages : [])].reverse().find((message) => {
    const data = message?.storyGlassData;
    if (!data) return false;

    const request = compactWhitespace(data.request || '');
    if (storyText && request && request === storyText) return true;

    const numericId = Number(message.id);
    return threshold > 0 && Number.isFinite(numericId) && numericId >= threshold;
  }) || null;
}

function getStoryGlassMessageById(messages = [], messageId = null) {
  const id = String(messageId || '');
  if (!id) return null;
  return (Array.isArray(messages) ? messages : []).find((message) => (
    String(message?.id || '') === id && message?.storyGlassData
  )) || null;
}

function getStoryGlassShelfItems(messages = []) {
  return (Array.isArray(messages) ? messages : [])
    .map((message, index) => ({
      id: String(message?.id || ''),
      index,
      createdAt: Number(message?.clientSavedAt || message?.createdAt || message?.timestamp || message?.id || 0) || 0,
      data: message?.storyGlassData || null,
    }))
    .filter((item) => item.id && item.data)
    .reverse();
}

function resolveStoryGlassShelfImageUrl(source = '', backendUrl = '') {
  const normalized = String(source || '').trim();
  if (!normalized) return '';
  if (normalized.startsWith('data:image/')) return normalized;
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) return normalized;

  const base = String(backendUrl || '').replace(/\/$/, '');
  if (normalized.startsWith('/')) return base ? `${base}${normalized}` : normalized;
  return base ? `${base}/${normalized}` : normalized;
}

function getStoryGlassStatus(data = {}) {
  const status = String(data.status || '').toLowerCase();
  const stage = String(data.currentStage || data.stage || '').toLowerCase();
  if (status === 'error' || stage === 'error' || data.error) return 'error';
  if (status === 'completed' || stage === 'completed') return 'completed';
  if (status === 'running' || status === 'pending' || stage) return 'running';
  return '';
}

const STORY_FLAVOR_SIGNAL_LIBRARY = [
  { zh: '怀旧', en: 'nostalgia', tone: 'amber' },
  { zh: '温柔', en: 'tenderness', tone: 'rose' },
  { zh: '疲惫', en: 'tired light', tone: 'slate' },
  { zh: '心动', en: 'flutter', tone: 'rose' },
  { zh: '勇气', en: 'courage', tone: 'gold' },
  { zh: '孤独', en: 'solitude', tone: 'blue' },
  { zh: '荒诞', en: 'strange spark', tone: 'teal' },
  { zh: '松弛', en: 'soft ease', tone: 'mint' },
];

const STORY_SIGNAL_KEYWORDS = [
  { test: /小时候|以前|曾经|回忆|怀念|老家|过去|nostalgia|remember|used to/i, zh: '怀旧', en: 'nostalgia', tone: 'amber' },
  { test: /喜欢|心动|脸红|暧昧|恋爱|love|crush|heartbeat/i, zh: '心动', en: 'flutter', tone: 'rose' },
  { test: /累|疲惫|困|熬夜|撑不住|tired|exhausted|sleepy/i, zh: '疲惫', en: 'tired light', tone: 'slate' },
  { test: /害怕|紧张|焦虑|担心|怕|nervous|afraid|anxious/i, zh: '紧张', en: 'tension', tone: 'blue' },
  { test: /开心|笑|哈哈|快乐|高兴|happy|laugh|smile/i, zh: '明亮', en: 'bright lift', tone: 'gold' },
  { test: /难过|哭|委屈|孤独|一个人|sad|cry|lonely/i, zh: '孤独', en: 'solitude', tone: 'blue' },
  { test: /勇敢|决定|离开|开始|改变|brave|decide|change/i, zh: '勇气', en: 'courage', tone: 'gold' },
  { test: /奇怪|离谱|荒诞|搞笑|weird|absurd|funny/i, zh: '荒诞', en: 'strange spark', tone: 'teal' },
];

const STORY_FLAVOR_SIGNAL_ZH_MAP = [
  { test: /nostalgia|remember|memory|childhood|home|old/i, zh: '怀旧' },
  { test: /tension|nervous|afraid|anxious|tight|uneasy/i, zh: '紧张' },
  { test: /tender|tenderness|soft|gentle|care|comfort/i, zh: '温柔' },
  { test: /absurd|strange|weird|funny|surreal/i, zh: '荒诞' },
  { test: /tired|exhausted|sleepy|fatigue/i, zh: '疲惫' },
  { test: /flutter|crush|heartbeat|love|blush/i, zh: '心动' },
  { test: /solitude|lonely|alone|quiet/i, zh: '孤独' },
  { test: /courage|brave|decide|change|begin/i, zh: '勇气' },
  { test: /rain|aftertaste|afterglow|lingering/i, zh: '余温' },
  { test: /bright|light|spark|clear/i, zh: '明亮' },
];

function normalizeStoryFlavorSignalLabel(label = '') {
  const value = compactWhitespace(label);
  if (!value) return '';
  if (/[\u3400-\u9fff]/.test(value)) return value.slice(0, 8);
  const mapped = STORY_FLAVOR_SIGNAL_ZH_MAP.find((item) => item.test.test(value));
  if (mapped) return mapped.zh;
  return value
    .replace(/[-_]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .join(' ')
    .slice(0, 12);
}

function pushUniqueSignal(signals, signal, localeIsZh) {
  const label = normalizeStoryFlavorSignalLabel(localeIsZh ? signal.zh || signal.label : signal.en || signal.label);
  if (!label || signals.some((item) => item.label.toLowerCase() === label.toLowerCase())) return;
  signals.push({
    label,
    tone: signal.tone || 'amber',
  });
}

function getSignalItems(value = []) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (typeof item === 'string') {
        return {
          label: compactWhitespace(item),
          tone: STORY_FLAVOR_SIGNAL_LIBRARY[index % STORY_FLAVOR_SIGNAL_LIBRARY.length]?.tone || 'amber',
        };
      }
      if (!item || typeof item !== 'object') return null;
      return {
        label: compactWhitespace(item.label || item.name || item.flavor || item.emotion || item.text),
        tone: item.tone || STORY_FLAVOR_SIGNAL_LIBRARY[index % STORY_FLAVOR_SIGNAL_LIBRARY.length]?.tone || 'amber',
      };
    })
    .filter((item) => item?.label);
}

function getStoryFlavorSignals({ text = '', data = null, latestDecision = null, readinessScore = 0, localeIsZh = true } = {}) {
  const signals = [];
  const normalizedText = String(text || '');
  const decisionSignals = getSignalItems(latestDecision?.flavorSignals || latestDecision?.storyFlavors || latestDecision?.flavors);

  decisionSignals.forEach((signal) => pushUniqueSignal(signals, signal, localeIsZh));

  if (signals.length <= 0 && data) {
    const dataTags = [
      ...(Array.isArray(data?.storyTags) ? data.storyTags : []),
      ...(Array.isArray(data?.tastingNotes) ? data.tastingNotes : []),
      ...(Array.isArray(data?.emotionFlavorMap)
        ? data.emotionFlavorMap.flatMap((item) => [item?.emotion, item?.flavor])
        : []),
    ];

    dataTags.forEach((item, index) => {
      const label = compactWhitespace(item);
      if (!label) return;
      pushUniqueSignal(signals, {
        label,
        zh: label,
        en: label,
        tone: STORY_FLAVOR_SIGNAL_LIBRARY[index % STORY_FLAVOR_SIGNAL_LIBRARY.length]?.tone || 'amber',
      }, localeIsZh);
    });
  }

  if (signals.length <= 0 && latestDecision?.fallbackSignals) {
    STORY_SIGNAL_KEYWORDS.forEach((signal) => {
      if (signal.test.test(normalizedText)) {
        pushUniqueSignal(signals, signal, localeIsZh);
      }
    });
  }

  const decisionMood = String(latestDecision?.mood || '').toLowerCase();
  if (signals.length > 0 && decisionMood.includes('ready')) {
    pushUniqueSignal(signals, { zh: '杯口已成', en: 'glass ready', tone: 'gold' }, localeIsZh);
  } else if (signals.length > 0 && (decisionMood.includes('touch') || decisionMood.includes('hold'))) {
    pushUniqueSignal(signals, { zh: '被触动', en: 'touched', tone: 'rose' }, localeIsZh);
  }

  const visibleCount = readinessScore >= 70 ? 8 : readinessScore >= 38 ? 6 : 4;
  return signals.slice(0, visibleCount).map((signal, index) => ({
    ...signal,
    x: [13, 24, 42, 18, 36, 49, 28, 55][index % 8],
    y: [19, 11, 23, 35, 42, 32, 51, 15][index % 8],
    delay: index * 0.42,
  }));
}

function getSignalToneClass(tone = 'amber') {
  switch (tone) {
    case 'rose':
      return 'border-rose-100/28 bg-rose-200/10 text-rose-50 shadow-[0_0_24px_rgba(251,113,133,0.16)]';
    case 'blue':
      return 'border-sky-100/24 bg-sky-200/10 text-sky-50 shadow-[0_0_24px_rgba(125,211,252,0.14)]';
    case 'teal':
      return 'border-teal-100/24 bg-teal-200/10 text-teal-50 shadow-[0_0_24px_rgba(94,234,212,0.14)]';
    case 'mint':
      return 'border-emerald-100/24 bg-emerald-200/10 text-emerald-50 shadow-[0_0_24px_rgba(110,231,183,0.14)]';
    case 'slate':
      return 'border-white/18 bg-slate-200/8 text-white/78 shadow-[0_0_24px_rgba(226,232,240,0.08)]';
    case 'gold':
      return 'border-yellow-100/32 bg-yellow-200/12 text-yellow-50 shadow-[0_0_26px_rgba(253,224,71,0.17)]';
    default:
      return 'border-amber-100/28 bg-amber-200/10 text-amber-50 shadow-[0_0_24px_rgba(251,191,36,0.15)]';
  }
}

function getDecisionMoodMeta(decision = null, getLocalText) {
  const mood = String(decision?.mood || '').toLowerCase();
  const shouldMix = Boolean(decision?.shouldMix);

  if (shouldMix || mood.includes('ready')) {
    return {
      label: getLocalText('准备上杯', 'Ready to pour'),
      detail: getLocalText('这段故事已经有杯口了', 'This story has found its glass'),
      tone: 'gold',
    };
  }

  if (mood.includes('hold') || mood.includes('wait')) {
    return {
      label: getLocalText('还不急', 'Not yet'),
      detail: getLocalText('Saki 想让味道再沉一会儿', 'Saki wants the flavor to settle'),
      tone: 'amber',
    };
  }

  if (mood.includes('touch') || mood.includes('touched')) {
    return {
      label: getLocalText('被触动', 'Touched'),
      detail: getLocalText('这一句已经有余韵', 'This line already has aftertaste'),
      tone: 'rose',
    };
  }

  if (mood.includes('stay') || mood.includes('protect')) {
    return {
      label: getLocalText('先陪你', 'Staying here'),
      detail: getLocalText('这段先不急着变成酒', 'This part does not need a glass yet'),
      tone: 'blue',
    };
  }

  return null;
}

function getVoiceToneMeta({ text = '', isListening = false, readinessScore = 0, localeIsZh = true } = {}) {
  const normalized = String(text || '').trim();
  const cjkChars = (normalized.match(/[\u3400-\u9fff]/g) || []).length;
  const latinWords = (normalized.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g) || []).length;
  const lengthScore = cjkChars + latinWords * 2;
  const hasLaugh = /哈哈|笑|开心|happy|laugh|smile/i.test(normalized);
  const hasSoft = /累|困|难过|委屈|安静|tired|sad|quiet/i.test(normalized);
  const hasTension = /紧张|害怕|焦虑|突然|崩溃|nervous|afraid|anxious|suddenly/i.test(normalized);

  let label = localeIsZh ? '正在成形' : 'taking shape';
  let tone = 'mint';
  if (hasTension) {
    label = localeIsZh ? '语气偏紧' : 'tense edge';
    tone = 'blue';
  } else if (hasLaugh) {
    label = localeIsZh ? '语气变亮' : 'brighter voice';
    tone = 'gold';
  } else if (hasSoft) {
    label = localeIsZh ? '语气放低' : 'softer voice';
    tone = 'rose';
  } else if (readinessScore >= 70 || lengthScore > 120) {
    label = localeIsZh ? '余韵变浓' : 'aftertaste rising';
    tone = 'amber';
  } else if (!isListening) {
    label = localeIsZh ? '停顿里有味道' : 'a pause with flavor';
    tone = 'slate';
  }

  return {
    label,
    tone,
    intensity: Math.min(1, Math.max(0.22, readinessScore / 100 + Math.min(0.28, lengthScore / 360))),
  };
}

function escapeXml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapCardText(value = '', maxChars = 18, maxLines = 3) {
  const text = compactWhitespace(value);
  if (!text) return [];
  const lines = [];
  let cursor = text;
  while (cursor && lines.length < maxLines) {
    if (cursor.length <= maxChars) {
      lines.push(cursor);
      break;
    }
    let end = cursor.lastIndexOf(' ', maxChars);
    if (end < Math.floor(maxChars * 0.55)) end = maxChars;
    lines.push(cursor.slice(0, end).trim());
    cursor = cursor.slice(end).trim();
  }
  if (cursor && lines.length === maxLines) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[.。…]+$/, '')}...`;
  }
  return lines;
}

function getStoryCardText(data = {}, getLocalText) {
  const name = String(data.cocktailName || getLocalText('故事特调', 'Story Glass')).trim();
  const quote = String(data.featuredQuote || data.storySummary || '').trim();
  const sakiComment = String(data.sakiComment || '').trim();
  const tags = Array.isArray(data.storyTags) ? data.storyTags.slice(0, 4).filter(Boolean) : [];

  return [
    `${getLocalText('Saki 为我调了一杯', 'Saki mixed me a glass')}: ${name}`,
    quote ? `「${quote}」` : '',
    sakiComment,
    tags.length ? tags.map((tag) => `#${tag}`).join(' ') : '',
  ].filter(Boolean).join('\n');
}

function createStoryCardSvg(data = {}, getLocalText) {
  const name = String(data.cocktailName || getLocalText('故事特调', 'Story Glass')).trim();
  const englishName = String(data.cocktailNameEn || '').trim();
  const quote = String(data.featuredQuote || data.storySummary || '').trim();
  const sakiComment = String(data.sakiComment || data.cocktailSubtitle || '').trim();
  const tags = Array.isArray(data.storyTags) ? data.storyTags.slice(0, 3).filter(Boolean) : [];
  const quoteLines = wrapCardText(quote, 20, 4);
  const commentLines = wrapCardText(sakiComment, 22, 3);
  const tagText = tags.map((tag) => `#${tag}`).join('  ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1400" viewBox="0 0 900 1400">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1f1308"/>
      <stop offset="45%" stop-color="#102326"/>
      <stop offset="100%" stop-color="#040708"/>
    </linearGradient>
    <linearGradient id="drink" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fef3c7"/>
      <stop offset="42%" stop-color="#fb7185"/>
      <stop offset="100%" stop-color="#14b8a6"/>
    </linearGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="24" result="blur"/>
      <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0.95  0 1 0 0 0.72  0 0 1 0 0.34  0 0 0 0.65 0"/>
      <feBlend in="SourceGraphic"/>
    </filter>
  </defs>
  <rect width="900" height="1400" fill="url(#bg)"/>
  <circle cx="720" cy="160" r="270" fill="#f59e0b" opacity="0.16"/>
  <circle cx="160" cy="1100" r="310" fill="#14b8a6" opacity="0.13"/>
  <path d="M110 1180 C230 1100 305 1180 430 1120 S690 1060 790 1135" fill="none" stroke="#fde68a" stroke-opacity="0.32" stroke-width="3"/>
  <text x="92" y="118" fill="#fde68a" font-size="34" font-family="serif" font-weight="700">Saki Story Glass</text>
  <text x="92" y="172" fill="#ffffff" fill-opacity="0.58" font-size="26" font-family="sans-serif">${escapeXml(getLocalText('由 Saki 调制', 'Mixed by Saki'))}</text>
  <g transform="translate(286 250)" filter="url(#glow)">
    <ellipse cx="164" cy="642" rx="126" ry="24" fill="#000" opacity="0.28"/>
    <path d="M68 98 H260 L232 632 C228 690 198 724 164 724 C130 724 100 690 96 632 Z" fill="none" stroke="#fff7ed" stroke-opacity="0.72" stroke-width="8"/>
    <path d="M82 300 H246 L226 630 C222 674 198 694 164 694 C130 694 106 674 102 630 Z" fill="url(#drink)" opacity="0.82"/>
    <path d="M88 252 C128 226 172 286 246 248" fill="none" stroke="#ffffff" stroke-opacity="0.46" stroke-width="6"/>
    <circle cx="126" cy="362" r="10" fill="#fff" opacity="0.72"/>
    <circle cx="190" cy="456" r="7" fill="#fff" opacity="0.56"/>
    <circle cx="152" cy="544" r="5" fill="#fff" opacity="0.44"/>
  </g>
  <text x="92" y="1030" fill="#fff7ed" font-size="64" font-family="serif" font-weight="800">${escapeXml(name)}</text>
  ${englishName && englishName !== name ? `<text x="92" y="1082" fill="#fde68a" fill-opacity="0.62" font-size="28" font-family="sans-serif">${escapeXml(englishName)}</text>` : ''}
  ${quoteLines.map((line, index) => `<text x="92" y="${1160 + index * 42}" fill="#ffffff" fill-opacity="0.82" font-size="30" font-family="sans-serif">${escapeXml(line)}</text>`).join('')}
  ${commentLines.map((line, index) => `<text x="92" y="${1280 + index * 32}" fill="#ffffff" fill-opacity="0.55" font-size="23" font-family="sans-serif">${escapeXml(line)}</text>`).join('')}
  ${tagText ? `<text x="92" y="1362" fill="#5eead4" fill-opacity="0.75" font-size="24" font-family="sans-serif">${escapeXml(tagText)}</text>` : ''}
</svg>`;
}

function PreferenceGroup({ group, value, onChange, getLocalText }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-amber-100/72">
        <Palette size={13} />
        <span>{getLocalText(group.labels?.zh || '', group.labels?.en || '')}</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {(group.options || []).map((option) => {
          const isActive = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange?.(group.id, option.value)}
              className={`min-h-9 rounded-lg border px-2.5 text-xs font-semibold transition-all ${
                isActive
                  ? 'border-amber-200/55 bg-amber-100/18 text-amber-50 shadow-[0_0_24px_rgba(251,191,36,0.12)]'
                  : 'border-white/10 bg-black/12 text-stone-100/74 hover:border-amber-100/32 hover:bg-amber-100/8'
              }`}
            >
              {getLocalText(option.labels?.zh || '', option.labels?.en || '')}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function VoiceTurn({ turn, placement = 'flow' }) {
  const isSaki = turn.role === 'saki';
  const isLive = Boolean(turn.isLive);
  const isStage = placement !== 'flow';
  const voiceTone = turn.voiceTone || null;
  const toneClass = voiceTone ? getSignalToneClass(voiceTone.tone) : '';
  const bubbleClass = isSaki
    ? 'rounded-br-sm border border-amber-100/24 bg-[rgba(36,22,11,0.30)] text-amber-50 shadow-[0_18px_42px_rgba(0,0,0,0.18)] backdrop-blur-sm'
    : isLive
      ? `rounded-br-sm ${toneClass || 'border border-emerald-200/30 bg-emerald-300/12 text-emerald-50 shadow-[0_0_28px_rgba(110,231,183,0.12)]'} backdrop-blur-sm`
      : 'rounded-br-sm border border-white/14 bg-black/20 text-white/90 shadow-[0_16px_38px_rgba(0,0,0,0.16)] backdrop-blur-sm';
  return (
    <div className={`flex ${isSaki ? 'justify-start' : 'justify-end'}`}>
      <div className={`relative ${isStage ? 'max-w-full' : 'max-w-[86%]'} rounded-[1.15rem] px-3.5 py-2.5 text-sm leading-6 ${bubbleClass}`}>
        <p className="whitespace-pre-wrap">{turn.text}</p>
        {voiceTone ? (
          <div className="mt-2 flex items-center justify-end gap-2 text-[11px] font-semibold text-white/58">
            <span>{voiceTone.label}</span>
            <span className="flex items-end gap-0.5" aria-hidden="true">
              {[0, 1, 2].map((index) => (
                <span
                  key={index}
                  className="block w-1 rounded-full bg-current opacity-70 story-glass-voice-bar"
                  style={{
                    height: `${6 + index * 3}px`,
                    animationDelay: `${index * 0.12}s`,
                    opacity: 0.36 + voiceTone.intensity * 0.44,
                  }}
                />
              ))}
            </span>
          </div>
        ) : null}
        {isLive && !voiceTone ? (
          <div className="mt-1.5 flex justify-end">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-200/80" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ShelfStatus({ data, getLocalText }) {
  const status = getStoryGlassStatus(data);
  const label = status === 'completed'
    ? getLocalText('已上杯', 'Served')
    : status === 'error'
      ? getLocalText('洒了', 'Spilled')
      : getLocalText('调制中', 'Mixing');
  const tone = status === 'completed'
    ? 'bg-emerald-300'
    : status === 'error'
      ? 'bg-rose-300'
      : 'bg-amber-300';

  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-white/54">
      <span className={`h-1.5 w-1.5 rounded-full ${tone}`} />
      {label}
    </span>
  );
}

function getStoredStoryGlassFavorites() {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORY_GLASS_SHELF_FAVORITES_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map((id) => String(id)) : [];
  } catch {
    return [];
  }
}

function StoryGlassShelf({
  items = [],
  activeId = '',
  onSelect,
  onDelete,
  onReplay,
  onContinue,
  backendUrl = '',
  getLocalText,
}) {
  const [favoriteIds, setFavoriteIds] = useState(() => new Set(getStoredStoryGlassFavorites()));
  const [filter, setFilter] = useState('all');

  const toggleFavorite = useCallback((itemId) => {
    const id = String(itemId || '');
    if (!id) return;

    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(STORY_GLASS_SHELF_FAVORITES_KEY, JSON.stringify([...next]));
        } catch {}
      }

      return next;
    });
  }, []);

  const tagFilters = useMemo(() => {
    const counts = new Map();
    items.forEach((item) => {
      const tags = Array.isArray(item.data?.storyTags) ? item.data.storyTags : [];
      tags.forEach((tag) => {
        const normalized = String(tag || '').trim();
        if (!normalized) return;
        counts.set(normalized, (counts.get(normalized) || 0) + 1);
      });
    });

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 4)
      .map(([tag]) => tag);
  }, [items]);

  const visibleItems = useMemo(() => {
    const now = Date.now();
    const recentWindowMs = 14 * 24 * 60 * 60 * 1000;
    const filtered = items.filter((item) => {
      const id = String(item.id || '');
      if (filter === 'favorites') return favoriteIds.has(id);
      if (filter === 'recent') {
        const createdAt = Number(item.createdAt || 0);
        return !createdAt || now - createdAt <= recentWindowMs;
      }
      if (filter.startsWith('tag:')) {
        const tag = filter.slice(4);
        const tags = Array.isArray(item.data?.storyTags) ? item.data.storyTags : [];
        return tags.some((value) => String(value || '').trim() === tag);
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      const aFavorite = favoriteIds.has(String(a.id || '')) ? 1 : 0;
      const bFavorite = favoriteIds.has(String(b.id || '')) ? 1 : 0;
      if (aFavorite !== bFavorite) return bFavorite - aFavorite;
      return Number(b.createdAt || 0) - Number(a.createdAt || 0);
    });
  }, [favoriteIds, filter, items]);

  const favoriteCount = items.filter((item) => favoriteIds.has(String(item.id || ''))).length;
  const recentCount = items.filter((item) => {
    const createdAt = Number(item.createdAt || 0);
    return !createdAt || Date.now() - createdAt <= 14 * 24 * 60 * 60 * 1000;
  }).length;
  const filterButtons = [
    { id: 'all', label: getLocalText('全部', 'All'), count: items.length },
    { id: 'favorites', label: getLocalText('收藏', 'Saved'), count: favoriteCount },
    { id: 'recent', label: getLocalText('最近', 'Recent'), count: recentCount },
  ];

  return (
    <div className="border-t border-white/10 px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-amber-100/64">
          <Wine size={13} />
          <span>{getLocalText('Saki 酒架', 'Saki Shelf')}</span>
        </div>
        <span className="rounded-full border border-white/10 bg-white/7 px-2 py-0.5 text-[10px] font-semibold text-white/48">
          {items.length}
        </span>
      </div>

      {items.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {filterButtons.map((button) => (
            <button
              key={button.id}
              type="button"
              onClick={() => setFilter(button.id)}
              className={`inline-flex min-h-7 items-center gap-1 rounded-md border px-2 text-[10px] font-bold transition-all ${
                filter === button.id
                  ? 'border-amber-100/38 bg-amber-100/16 text-amber-50'
                  : 'border-white/10 bg-white/6 text-white/46 hover:border-white/18 hover:text-white/72'
              }`}
            >
              <span>{button.label}</span>
              <span className="text-white/34">{button.count}</span>
            </button>
          ))}
          {tagFilters.map((tag) => {
            const filterId = `tag:${tag}`;
            return (
              <button
                key={filterId}
                type="button"
                onClick={() => setFilter(filterId)}
                className={`inline-flex min-h-7 items-center rounded-md border px-2 text-[10px] font-bold transition-all ${
                  filter === filterId
                    ? 'border-teal-100/34 bg-teal-200/14 text-teal-50'
                    : 'border-white/10 bg-white/6 text-white/46 hover:border-white/18 hover:text-white/72'
                }`}
              >
                #{tag}
              </button>
            );
          })}
        </div>
      ) : null}

      {items.length > 0 && visibleItems.length > 0 ? (
        <div className="max-h-56 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
          {visibleItems.map((item) => {
            const data = item.data || {};
            const isActive = activeId && String(activeId) === String(item.id);
            const isFavorite = favoriteIds.has(String(item.id || ''));
            const title = String(data.cocktailName || getLocalText('未命名故事杯', 'Untitled Story Glass')).trim();
            const subtitle = String(data.cocktailSubtitle || data.storySummary || data.sakiComment || '').trim();
            const imageUrl = resolveStoryGlassShelfImageUrl(data.coverImageUrl || '', backendUrl);
            const imageAlt = String(data.coverImageAlt || title).trim();
            const imagePending = !imageUrl && (data.currentStage === 'illustrating' || data.illustrationStatus === 'running');
            const quote = String(data.featuredQuote || data.sakiComment || '').trim();
            const tags = Array.isArray(data.storyTags) ? data.storyTags.slice(0, 3).filter(Boolean) : [];
            const servedAt = item.createdAt
              ? new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
              : '';

            return (
              <div
                key={item.id}
                className={`group/shelf relative overflow-hidden rounded-[1rem] border transition-all ${
                  isActive
                    ? 'border-amber-100/34 bg-amber-100/12 shadow-[0_0_26px_rgba(251,191,36,0.10)]'
                    : 'border-white/8 bg-black/10 hover:border-amber-100/24 hover:bg-amber-100/7'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect?.(item.id)}
                  className="block w-full min-w-0 px-3 py-2.5 pr-20 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[1rem] border border-white/14 bg-[linear-gradient(155deg,rgba(251,191,36,0.18),rgba(244,114,182,0.10),rgba(15,23,42,0.35))] shadow-[0_12px_26px_rgba(0,0,0,0.22)]">
                      {imageUrl ? (
                        <>
                          <img
                            src={imageUrl}
                            alt=""
                            aria-hidden="true"
                            className="absolute inset-0 h-full w-full scale-110 object-cover opacity-35 blur-md"
                          />
                          <img
                            src={imageUrl}
                            alt={imageAlt}
                            loading="lazy"
                            className="relative z-10 h-full w-full object-cover"
                            onError={(event) => {
                              event.currentTarget.style.display = 'none';
                            }}
                          />
                        </>
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <div className={`h-10 w-7 rounded-b-full rounded-t-lg border border-white/30 bg-[linear-gradient(180deg,rgba(255,255,255,0.48),rgba(251,191,36,0.24),rgba(94,234,212,0.22))] shadow-[0_8px_18px_rgba(0,0,0,0.22)] ${imagePending ? 'animate-pulse' : ''}`} />
                        </div>
                      )}
                      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.12),transparent_42%,rgba(0,0,0,0.24))]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-amber-50">
                        {title}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <ShelfStatus data={data} getLocalText={getLocalText} />
                        {servedAt ? (
                          <span className="text-[10px] font-semibold text-white/34">{servedAt}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  {subtitle ? (
                    <div className="mt-2 line-clamp-2 text-xs leading-5 text-white/48">
                      {subtitle}
                    </div>
                  ) : null}
                </button>
                {isActive ? (
                  <div className="space-y-2 border-t border-white/8 px-3 pb-3 pt-3">
                    {quote ? (
                      <div className="line-clamp-2 text-xs leading-5 text-amber-50/62">
                        {quote}
                      </div>
                    ) : null}
                    {tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-md border border-white/8 bg-white/7 px-2 py-0.5 text-[10px] font-semibold text-white/48"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onReplay?.(item.id);
                        }}
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-amber-100/14 bg-amber-100/9 px-2.5 text-[11px] font-semibold text-amber-50/72 transition-all hover:border-amber-100/32 hover:bg-amber-100/14"
                      >
                        <Play size={11} />
                        {getLocalText('重听祝酒', 'Replay toast')}
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onContinue?.(item.id);
                        }}
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-teal-100/16 bg-teal-200/10 px-2.5 text-[11px] font-semibold text-teal-50/72 transition-all hover:border-teal-100/32 hover:bg-teal-200/14"
                      >
                        <Mic size={11} />
                        {getLocalText('继续讲这杯', 'Continue this glass')}
                      </button>
                    </div>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleFavorite(item.id);
                  }}
                  className={`absolute right-10 top-2 flex h-7 w-7 items-center justify-center rounded-full border transition-all ${
                    isFavorite
                      ? 'border-amber-100/40 bg-amber-100/18 text-amber-100'
                      : 'border-white/10 bg-black/18 text-white/42 hover:border-amber-100/30 hover:bg-amber-100/12 hover:text-amber-100'
                  }`}
                  title={isFavorite ? getLocalText('取消收藏', 'Unsave') : getLocalText('收藏这杯', 'Save this glass')}
                >
                  <Star size={13} className={isFavorite ? 'fill-current' : ''} />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete?.(item.id);
                  }}
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/18 text-white/42 opacity-100 transition-all hover:border-rose-200/35 hover:bg-rose-500/18 hover:text-rose-100 sm:opacity-0 sm:group-hover/shelf:opacity-100"
                  title={getLocalText('删除这杯', 'Delete this glass')}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      ) : items.length > 0 ? (
        <div className="rounded-[1rem] border border-white/10 bg-white/7 px-3 py-3 text-xs leading-5 text-white/46">
          {getLocalText('没有符合筛选的故事杯。', 'No Story Glass matches this filter.')}
        </div>
      ) : (
        <div className="rounded-[1rem] border border-white/10 bg-white/7 px-3 py-3 text-xs leading-5 text-white/46">
          {getLocalText('还没有上架的故事杯。', 'No Story Glass has been shelved yet.')}
        </div>
      )}
    </div>
  );
}

function StoryGlassStageStyle() {
  return (
    <style>{`
      @keyframes storyFlavorFloat {
        0%, 100% { transform: translate3d(0, 0, 0); opacity: 0.48; }
        50% { transform: translate3d(10px, -14px, 0); opacity: 0.92; }
      }
      @keyframes storyVoiceBar {
        0%, 100% { transform: scaleY(0.45); }
        50% { transform: scaleY(1.08); }
      }
      @keyframes storyMistRise {
        0% { transform: translate3d(0, 12px, 0) scale(0.92); opacity: 0; }
        35% { opacity: 0.72; }
        100% { transform: translate3d(0, -28px, 0) scale(1.08); opacity: 0; }
      }
      @keyframes storyWordPour {
        0% { transform: translate3d(0, 0, 0) scale(1); opacity: 0; }
        18% { opacity: 0.92; }
        100% { transform: translate3d(var(--pour-x), var(--pour-y), 0) scale(0.64); opacity: 0; }
      }
      @keyframes storyServeReveal {
        0% { transform: scale(0.92); opacity: 0; filter: blur(10px); }
        16% { transform: scale(1); opacity: 1; filter: blur(0); }
        78% { opacity: 1; }
        100% { opacity: 0; }
      }
      .story-glass-voice-bar { animation: storyVoiceBar 0.78s ease-in-out infinite; transform-origin: bottom; }
      .story-glass-stage-chip { animation: storyFlavorFloat 6.4s ease-in-out infinite; }
      .story-glass-mist { animation: storyMistRise 3.2s ease-in-out infinite; }
      .story-glass-pour-word { animation: storyWordPour 2.9s cubic-bezier(.2,.8,.2,1) infinite; }
      .story-glass-serve-reveal { animation: storyServeReveal 5.2s ease-in-out both; }
    `}</style>
  );
}

function StoryFlavorStage({ signals = [], active = true }) {
  if (!active || signals.length <= 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-[4] hidden lg:block" aria-hidden="true">
      {signals.map((signal, index) => (
        <div
          key={`${signal.label}-${index}`}
          className="story-glass-stage-chip absolute flex aspect-[431/428] w-[6.65rem] items-center justify-center px-4 py-2.5 text-center text-[15px] font-extrabold text-white/72 drop-shadow-[0_1px_5px_rgba(0,0,0,0.28)]"
          style={{
            left: `${signal.x}%`,
            top: `${signal.y}%`,
            animationDelay: `${signal.delay}s`,
            opacity: 0.74 + Math.min(0.2, index * 0.03),
          }}
        >
          <img
            src={STORY_GLASS_BUBBLE_IMAGE}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-contain opacity-90 drop-shadow-[0_10px_24px_rgba(0,0,0,0.22)]"
          />
          <span className="relative z-10 max-w-[5.55rem] leading-[1.08]">{signal.label}</span>
        </div>
      ))}
    </div>
  );
}

function StoryWarmthCup({ score = 0, signals = [], isListening = false, isMixing = false, isDone = false, getLocalText }) {
  const normalized = Math.max(0, Math.min(100, Number(score) || 0));
  const fillHeight = Math.max(16, Math.min(82, normalized * 0.72 + (isMixing || isDone ? 22 : 0)));
  const label = isDone
    ? getLocalText('杯口已亮', 'Glass lit')
    : isMixing
      ? getLocalText('正在入杯', 'Pouring')
      : normalized >= 72
        ? getLocalText('余韵很浓', 'Strong aftertaste')
        : normalized >= 38
          ? getLocalText('雾气升起', 'Mist rising')
          : getLocalText('味道初醒', 'First notes');

  return (
    <div className="border-t border-white/10 px-4 py-4">
      <div className="mb-3 flex items-center justify-between text-xs font-semibold text-white/68">
        <span>{getLocalText('杯中火候', 'Glass Warmth')}</span>
        <span className="text-amber-50/72">{label}</span>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative h-40 w-24 shrink-0">
          {/* Mists */}
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="story-glass-mist absolute left-1/2 top-0 h-10 w-3 rounded-full bg-amber-100/22 blur-sm"
              style={{
                marginLeft: `${(index - 1) * 12}px`,
                animationDelay: `${index * 0.55}s`,
                opacity: isListening || normalized > 20 ? 1 : 0.35,
              }}
            />
          ))}

          {/* Cup Rim - Back inner edge */}
          <div className="absolute left-1/2 top-5 h-3 w-16 -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-t border-amber-100/30 bg-white/5" />

          {/* Cup Bowl */}
          <div className="absolute left-1/2 top-5 h-20 w-16 -translate-x-1/2 overflow-hidden rounded-b-full rounded-t-sm border-x border-b border-white/20 bg-[radial-gradient(ellipse_at_35%_25%,rgba(255,255,255,0.1),transparent_40%),rgba(0,0,0,0.15)] shadow-[inset_6px_0_12px_rgba(255,255,255,0.1),inset_-6px_0_16px_rgba(0,0,0,0.15)]">
            {/* Liquid Container */}
            <div
              className="absolute bottom-0 left-0 right-0 w-full transition-[height] duration-700 ease-in-out"
              style={{ height: `${fillHeight}%` }}
            >
              {/* Liquid Body */}
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(254,243,199,0.85),rgba(251,113,133,0.55)_40%,rgba(20,184,166,0.65))] opacity-90 shadow-[0_-8px_24px_rgba(251,191,36,0.2)]" />
              {/* Liquid Surface */}
              <div className="absolute -top-1.5 left-0 right-0 h-3 rounded-[50%] bg-[rgba(254,243,199,0.7)] shadow-[inset_0_-1px_3px_rgba(0,0,0,0.15)]" />
            </div>
            
            {/* Glass Highlights */}
            <div className="absolute left-[12%] top-[8%] h-[75%] w-[15%] rounded-[50%] bg-white/15 blur-[3px]" />
            <div className="absolute right-[8%] top-[15%] h-[55%] w-[8%] rounded-[50%] bg-white/10 blur-[3px]" />
          </div>

          {/* Cup Rim - Front overlapping edge */}
          <div className="absolute left-1/2 top-5 h-3 w-16 -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-b border-white/30 shadow-[0_1px_3px_rgba(255,255,255,0.05)]" />

          {/* Stem */}
          <div className="absolute left-1/2 top-[6.25rem] h-[2.5rem] w-1.5 -translate-x-1/2 rounded-full border border-white/10 bg-[linear-gradient(90deg,rgba(255,255,255,0.25),rgba(253,230,138,0.05),rgba(0,0,0,0.2))] shadow-[0_0_12px_rgba(255,255,255,0.05)]" />

          {/* Base Plate */}
          <div className="absolute bottom-[0.8rem] left-1/2 h-2 w-[4.5rem] -translate-x-1/2 rounded-[50%] border border-white/20 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.12),rgba(0,0,0,0.25)_80%)] shadow-[inset_0_1px_2px_rgba(255,255,255,0.15),0_6px_16px_rgba(0,0,0,0.3)]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1.5">
            {signals.slice(0, 5).map((signal) => (
              <span
                key={signal.label}
                className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${getSignalToneClass(signal.tone)}`}
              >
                {signal.label}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs leading-5 text-white/42">
            {getLocalText('这些味道会在上杯时被 Saki 收进酒里。', 'These notes will be pulled into the glass when Saki serves.')}
          </p>
        </div>
      </div>
    </div>
  );
}

function MixingRitualStage({ signals = [], getLocalText }) {
  const visibleSignals = signals.slice(0, 8);

  return (
    <div className="relative flex min-h-[24rem] flex-col items-center justify-center overflow-hidden text-center">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(253,230,138,0.16),transparent_34%),radial-gradient(circle_at_56%_68%,rgba(94,234,212,0.10),transparent_32%)]" />
      <div className="relative h-40 w-40">
        <div className="absolute inset-0 rounded-full border border-amber-100/14 bg-amber-100/5 blur-sm" />
        <div className="absolute left-1/2 top-8 h-28 w-20 -translate-x-1/2 overflow-hidden rounded-b-[2.3rem] rounded-t-xl border border-amber-100/34 bg-black/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_22px_62px_rgba(0,0,0,0.30)]">
          <div className="absolute bottom-0 left-0 right-0 h-[72%] rounded-t-2xl bg-[linear-gradient(180deg,rgba(254,243,199,0.92),rgba(251,113,133,0.55)_46%,rgba(20,184,166,0.68))]" />
          <div className="absolute inset-x-4 top-7 h-2 rounded-full bg-white/42 blur-[1px]" />
        </div>
        {visibleSignals.map((signal, index) => (
          <span
            key={`${signal.label}-${index}`}
            className="story-glass-pour-word absolute left-1/2 top-1/2 flex aspect-[431/428] w-[4.5rem] items-center justify-center px-2 py-2 text-center text-[14px] font-bold text-white/72"
            style={{
              '--pour-x': `${(index % 2 === 0 ? -1 : 1) * (80 + index * 11)}px`,
              '--pour-y': `${88 + (index % 3) * 22}px`,
              animationDelay: `${index * 0.24}s`,
            }}
          >
            <img
              src={STORY_GLASS_BUBBLE_IMAGE}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-contain opacity-88"
            />
            <span className="relative z-10 max-w-[3.65rem] leading-tight drop-shadow-md">{signal.label}</span>
          </span>
        ))}
      </div>
      <div className="relative mt-5 text-xl font-semibold text-amber-50">
        {getLocalText('Saki 正在把故事收进杯里', 'Saki is pulling the story into the glass')}
      </div>
      <div className="relative mt-2 max-w-md text-sm leading-6 text-white/54">
        {getLocalText('情绪、停顿和画面正在变成酒液的颜色、气泡和余韵。', 'Mood, pauses, and images are becoming color, bubbles, and aftertaste.')}
      </div>
    </div>
  );
}

function ServingReveal({ data = {}, signals = [], getLocalText }) {
  const name = String(data.cocktailName || getLocalText('故事特调', 'Story Glass')).trim();
  return (
    <div className="pointer-events-none absolute inset-0 z-[35] flex items-center justify-center bg-[radial-gradient(circle_at_50%_52%,rgba(253,230,138,0.18),transparent_34%,rgba(0,0,0,0.16)_74%,transparent)]">
      <div className="story-glass-serve-reveal relative flex flex-col items-center text-center">
        <div className="absolute -inset-24 rounded-full bg-amber-100/12 blur-3xl" />
        <div className="relative h-44 w-32">
          <div className="absolute bottom-0 left-1/2 h-36 w-24 -translate-x-1/2 overflow-hidden rounded-b-[2.7rem] rounded-t-xl border border-amber-50/62 bg-black/18 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_26px_72px_rgba(0,0,0,0.34)] backdrop-blur-sm">
            <div className="absolute bottom-0 left-0 right-0 h-[78%] rounded-t-3xl bg-[linear-gradient(180deg,rgba(254,243,199,0.95),rgba(251,113,133,0.60)_42%,rgba(20,184,166,0.74))]" />
            <div className="absolute inset-x-4 top-8 h-2 rounded-full bg-white/48 blur-[1px]" />
          </div>
          {signals.slice(0, 5).map((signal, index) => (
            <span
              key={`${signal.label}-${index}`}
              className="absolute flex aspect-[431/428] w-[4.25rem] items-center justify-center px-2 py-2 text-center text-[13px] font-bold text-white/72"
              style={{
                left: `${index % 2 ? 68 : -10}%`,
                top: `${12 + index * 14}%`,
              }}
            >
              <img
                src={STORY_GLASS_BUBBLE_IMAGE}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 h-full w-full object-contain opacity-90"
              />
              <span className="relative z-10 max-w-[3.45rem] leading-tight drop-shadow-md">{signal.label}</span>
            </span>
          ))}
        </div>
        <div className="relative mt-3 rounded-[1.2rem] border border-amber-50/28 bg-black/22 px-8 py-5 shadow-[0_24px_74px_rgba(0,0,0,0.30)] backdrop-blur-md">
          <div className="text-sm font-semibold text-amber-100/68">
            {getLocalText('上杯', 'Served')}
          </div>
          <div className="mt-1 text-3xl font-black text-amber-50">
            {name}
          </div>
        </div>
      </div>
    </div>
  );
}

function StoryShareCard({ data = {}, backendUrl = '', getLocalText, onShare, onDownload }) {
  const name = String(data.cocktailName || getLocalText('故事特调', 'Story Glass')).trim();
  const englishName = String(data.cocktailNameEn || '').trim();
  const quote = String(data.featuredQuote || data.storySummary || '').trim();
  const sakiComment = String(data.sakiComment || data.cocktailSubtitle || '').trim();
  const tags = Array.isArray(data.storyTags) ? data.storyTags.slice(0, 4).filter(Boolean) : [];
  const imageUrl = resolveStoryGlassShelfImageUrl(data.coverImageUrl || '', backendUrl);

  return (
    <section className="mt-4 grid gap-4 lg:grid-cols-[minmax(18rem,0.62fr)_minmax(0,1fr)]">
      <div className="relative overflow-hidden rounded-[1.15rem] border border-amber-100/16 bg-[linear-gradient(150deg,rgba(44,24,9,0.62),rgba(6,18,19,0.46)_54%,rgba(1,5,6,0.32))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_22px_70px_rgba(0,0,0,0.28)] backdrop-blur-md">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_12%,rgba(253,230,138,0.18),transparent_34%),radial-gradient(circle_at_12%_86%,rgba(94,234,212,0.12),transparent_30%)]" />
        <div className="relative aspect-[3/4] overflow-hidden rounded-[0.9rem] border border-amber-50/12 bg-black/24">
          {imageUrl ? (
            <>
              <img src={imageUrl} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-24 blur-xl" />
              <img src={imageUrl} alt={name} className="absolute inset-x-[8%] top-[9%] h-[45%] w-[84%] rounded-[0.8rem] object-cover shadow-[0_20px_54px_rgba(0,0,0,0.32)]" />
            </>
          ) : (
            <div className="absolute inset-x-[30%] top-[12%] h-[45%] rounded-b-[2.4rem] rounded-t-xl border border-white/34 bg-[linear-gradient(180deg,rgba(254,243,199,0.86),rgba(251,113,133,0.48)_48%,rgba(20,184,166,0.62))] shadow-[0_24px_60px_rgba(0,0,0,0.24)]" />
          )}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,rgba(0,0,0,0.18)_42%,rgba(0,0,0,0.82)_100%)]" />
          <div className="absolute bottom-0 left-0 right-0 p-5">
            <div className="text-xs font-semibold text-amber-100/62">
              {getLocalText('由 Saki 调制', 'Mixed by Saki')}
            </div>
            <div className="mt-2 text-2xl font-black leading-tight text-amber-50">
              {name}
            </div>
            {englishName && englishName !== name ? (
              <div className="mt-1 text-xs font-semibold text-white/42">{englishName}</div>
            ) : null}
            {quote ? (
              <div className="mt-4 line-clamp-3 text-sm leading-6 text-white/76">
                「{quote}」
              </div>
            ) : null}
            {tags.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span key={tag} className="rounded-md border border-white/10 bg-white/8 px-2 py-0.5 text-[10px] font-semibold text-white/58">
                    #{tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="rounded-[1.15rem] border border-amber-100/12 bg-black/16 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md">
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-50">
          <Sparkles size={15} />
          {getLocalText('故事酒卡', 'Story Card')}
        </div>
        {sakiComment ? (
          <p className="mt-3 text-sm leading-7 text-white/62">
            {sakiComment}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onShare}
            className="inline-flex items-center gap-2 rounded-md border border-amber-100/22 bg-amber-100/12 px-3.5 py-2 text-xs font-bold text-amber-50 transition-all hover:border-amber-100/42 hover:bg-amber-100/18"
          >
            <Share2 size={14} />
            {getLocalText('分享文案', 'Share')}
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex items-center gap-2 rounded-md border border-white/12 bg-white/8 px-3.5 py-2 text-xs font-bold text-white/72 transition-all hover:border-white/22 hover:bg-white/12 hover:text-white"
          >
            <Download size={14} />
            {getLocalText('保存酒卡', 'Save card')}
          </button>
        </div>
      </div>
    </section>
  );
}

export default function StoryGlassOverlay({
  isOpen,
  onClose,
  onSubmitStory,
  isGenerating = false,
  messages = [],
  preferences = {},
  preferenceGroups = [],
  onPreferenceChange,
  remixActions = [],
  onRemix,
  onSpeak,
  onStopSpeech,
  backendUrl = '',
  config = {},
  reviewMessageId = null,
  onReviewMessageChange,
  onDeleteRecord,
  onArchiveConversation,
}) {
  const { i18n } = useTranslation();
  const localeIsZh = String(i18n.resolvedLanguage || i18n.language || '').toLowerCase().startsWith('zh');
  const getLocalText = useCallback((zhText, enText) => (localeIsZh ? zhText : enText), [localeIsZh]);

  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [segments, setSegments] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [submittedAt, setSubmittedAt] = useState(0);
  const [submittedStory, setSubmittedStory] = useState('');
  const [timeTick, setTimeTick] = useState(0);
  const [sakiTurns, setSakiTurns] = useState([]);
  const [isSakiThinking, setIsSakiThinking] = useState(false);
  const [isSakiSpeaking, setIsSakiSpeaking] = useState(false);
  const [isControlsOpen, setIsControlsOpen] = useState(true);
  const [rackReviewMessageId, setRackReviewMessageId] = useState('');
  const [idleMovieIndex, setIdleMovieIndex] = useState(0);
  const [isMixingIntroActive, setIsMixingIntroActive] = useState(false);
  const [activeMovieSrc, setActiveMovieSrc] = useState(STORY_GLASS_MOVIES[STORY_GLASS_INITIAL_MOVIE_KEY]);
  const [previousMovieSrc, setPreviousMovieSrc] = useState('');
  const [movieFadeReady, setMovieFadeReady] = useState(true);
  const [servingRevealKey, setServingRevealKey] = useState('');

  const recognitionRef = useRef(null);
  const shouldListenRef = useRef(false);
  const openedAtRef = useRef(0);
  const firstSpeechAtRef = useRef(0);
  const lastFinalAtRef = useRef(0);
  const submittedStoryRef = useRef('');
  const ttsEnabledRef = useRef(true);
  const isOpenRef = useRef(false);
  const isGeneratingRef = useRef(false);
  const completionSpeechRef = useRef('');
  const onSpeakRef = useRef(onSpeak);
  const onSubmitStoryRef = useRef(onSubmitStory);
  const onStopSpeechRef = useRef(onStopSpeech);
  const preferencesRef = useRef(preferences);
  const configRef = useRef(config);
  const sakiTurnsRef = useRef([]);
  const listeningRetryTimerRef = useRef(null);
  const processedSegmentCountRef = useRef(0);
  const isSakiThinkingRef = useRef(false);
  const isSakiSpeakingRef = useRef(false);
  const conversationArchivedRef = useRef(false);
  const activeMovieSrcRef = useRef(STORY_GLASS_MOVIES[STORY_GLASS_INITIAL_MOVIE_KEY]);
  const movieTransitionFrameRef = useRef(0);
  const movieTransitionTimerRef = useRef(0);
  const preloadedMovieElementsRef = useRef(new Map());
  const servingRevealTimerRef = useRef(0);
  const mixingIntroTimerRef = useRef(0);

  const finalTranscript = transcript.trim();
  const liveTranscript = [
    ...segments.slice(processedSegmentCountRef.current).map((segment) => segment.text),
    interimText,
  ].filter(Boolean).join('\n').trim();
  const currentMixableStory = useMemo(
    () => appendTranscript(finalTranscript, interimText),
    [finalTranscript, interimText]
  );
  const elapsedMs = firstSpeechAtRef.current ? Date.now() - firstSpeechAtRef.current : 0;
  const stats = useMemo(() => getStoryStats(finalTranscript, segments), [finalTranscript, segments]);
  const readiness = useMemo(() => getReadiness(stats, elapsedMs), [stats, elapsedMs, timeTick]);
  const shelfItems = useMemo(() => getStoryGlassShelfItems(messages), [messages]);
  const effectiveReviewMessageId = reviewMessageId || rackReviewMessageId;
  const activeMessage = useMemo(
    () => getStoryGlassMessageById(messages, effectiveReviewMessageId)
      || getLatestStoryGlassMessage(messages, submittedAt, submittedStory),
    [effectiveReviewMessageId, messages, submittedAt, submittedStory]
  );
  const storyGlassData = activeMessage?.storyGlassData || null;
  const glassStatus = getStoryGlassStatus(storyGlassData || {});
  const isCompleted = glassStatus === 'completed';
  const isReviewMode = Boolean(effectiveReviewMessageId);
  const isMixing = Boolean(submittedStory || isReviewMode) && !isCompleted && glassStatus !== 'error';

  const statusText = useMemo(() => {
    if (glassStatus === 'error') return getLocalText('这杯洒了，稍后重调', 'This glass spilled; retry later');
    if (isCompleted) return getLocalText('Saki 已经上杯', 'Saki has served the glass');
    if (isMixing) return getLocalText('Saki 正在调酒', 'Saki is mixing');
    if (isSakiThinking) return getLocalText('Saki 正在回味这一段', 'Saki is tasting this turn');
    if (isListening) return getLocalText('Saki 正在听', 'Saki is listening');
    return getLocalText('故事杯', 'Story Glass');
  }, [glassStatus, getLocalText, isCompleted, isListening, isMixing, isSakiThinking]);

  useEffect(() => {
    isOpenRef.current = isOpen;
    if (!isOpen) {
      setRackReviewMessageId('');
    }
  }, [isOpen]);

  useEffect(() => {
    onSpeakRef.current = onSpeak;
  }, [onSpeak]);

  useEffect(() => {
    onSubmitStoryRef.current = onSubmitStory;
  }, [onSubmitStory]);

  useEffect(() => {
    onStopSpeechRef.current = onStopSpeech;
  }, [onStopSpeech]);

  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    sakiTurnsRef.current = sakiTurns;
  }, [sakiTurns]);

  useEffect(() => {
    isSakiThinkingRef.current = isSakiThinking;
  }, [isSakiThinking]);

  useEffect(() => {
    isSakiSpeakingRef.current = isSakiSpeaking;
  }, [isSakiSpeaking]);

  useEffect(() => {
    isGeneratingRef.current = isGenerating;
  }, [isGenerating]);

  useEffect(() => {
    submittedStoryRef.current = submittedStory;
  }, [submittedStory]);

  useEffect(() => {
    ttsEnabledRef.current = ttsEnabled;
  }, [ttsEnabled]);

  const buildArchiveTurns = useCallback(() => {
    const archivedTurns = (sakiTurnsRef.current || [])
      .map((turn) => ({
        id: turn.id || `${turn.role || 'turn'}-${Date.now()}`,
        role: turn.role === 'saki' ? 'saki' : 'user',
        text: String(turn.text || '').trim(),
      }))
      .filter((turn) => turn.text);

    const pendingUserText = [
      ...segments.slice(processedSegmentCountRef.current).map((segment) => segment.text),
      interimText,
    ].filter(Boolean).join('\n').trim();

    const hasArchivedUserText = (value) => {
      const normalized = compactWhitespace(value);
      if (!normalized) return true;
      return archivedTurns.some((turn) => (
        turn.role === 'user' && compactWhitespace(turn.text) === normalized
      ));
    };

    if (pendingUserText && !hasArchivedUserText(pendingUserText)) {
      archivedTurns.push({
        id: `user-pending-${Date.now()}`,
        role: 'user',
        text: pendingUserText,
      });
    } else if (!archivedTurns.some((turn) => turn.role === 'user') && finalTranscript) {
      archivedTurns.push({
        id: `user-transcript-${Date.now()}`,
        role: 'user',
        text: finalTranscript,
      });
    }

    return archivedTurns;
  }, [finalTranscript, interimText, segments]);

  const archiveConversationIfNeeded = useCallback(() => {
    if (conversationArchivedRef.current || submittedStoryRef.current || isReviewMode) return;
    if (typeof onArchiveConversation !== 'function') return;

    const turnsToArchive = buildArchiveTurns();
    if (!turnsToArchive.some((turn) => turn.role === 'user' && turn.text)) return;

    conversationArchivedRef.current = true;
    return onArchiveConversation(turnsToArchive, {
      source: 'story-glass',
      voiceFirst: true,
      startedAt: openedAtRef.current || Date.now(),
      endedAt: Date.now(),
      preferences: preferencesRef.current || {},
    });
  }, [buildArchiveTurns, isReviewMode, onArchiveConversation]);

  const handleClose = useCallback(async () => {
    try {
      await Promise.resolve(archiveConversationIfNeeded());
    } catch (error) {
      console.warn('[StoryGlass] Failed to archive conversation before closing:', error);
    }
    onClose?.();
  }, [archiveConversationIfNeeded, onClose]);

  useEffect(() => {
    if (!isOpen || !ttsEnabled) {
      isSakiSpeakingRef.current = false;
      setIsSakiSpeaking(false);
      return undefined;
    }

    const syncSpeakingState = () => {
      const active = isStoryGlassTtsActive();
      isSakiSpeakingRef.current = active;
      setIsSakiSpeaking(active);
    };

    syncSpeakingState();
    const timer = window.setInterval(syncSpeakingState, 140);
    return () => window.clearInterval(timer);
  }, [isOpen, ttsEnabled]);

  useEffect(() => {
    if (!isOpen || submittedStory || isReviewMode) return undefined;
    const timer = window.setInterval(() => {
      setTimeTick(prev => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isOpen, isReviewMode, submittedStory]);

  useEffect(() => {
    if (!isOpen || submittedStory || isReviewMode || isSakiThinking || isListening) return undefined;
    const timer = window.setInterval(() => {
      setIdleMovieIndex(prev => (prev + 1) % STORY_GLASS_IDLE_MOVIE_KEYS.length);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [isListening, isOpen, isReviewMode, isSakiThinking, submittedStory]);

  const preloadStoryGlassMovies = useCallback((movieKeys = []) => {
    if (typeof document === 'undefined') return;

    const cache = preloadedMovieElementsRef.current;
    movieKeys.forEach((key) => {
      const src = STORY_GLASS_MOVIES[key];
      if (!src || cache.has(src)) return;

      const video = document.createElement('video');
      video.src = src;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'auto';
      try {
        video.load();
      } catch {}
      cache.set(src, video);
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;

    let cancelled = false;
    let idleId = 0;
    let timerId = 0;
    const preloadInitialMovies = () => {
      if (cancelled) return;
      preloadStoryGlassMovies(STORY_GLASS_MOVIE_PRELOAD_GROUPS.initial);
    };

    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(preloadInitialMovies, { timeout: 700 });
    } else {
      timerId = window.setTimeout(preloadInitialMovies, 160);
    }

    return () => {
      cancelled = true;
      if (idleId && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      }
      if (timerId) {
        window.clearTimeout(timerId);
      }
      preloadedMovieElementsRef.current.clear();
    };
  }, [isOpen, preloadStoryGlassMovies]);

  const stopListening = useCallback(() => {
    shouldListenRef.current = false;
    if (listeningRetryTimerRef.current) {
      window.clearTimeout(listeningRetryTimerRef.current);
      listeningRetryTimerRef.current = null;
    }
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onend = null;
      try {
        recognition.stop();
      } catch {}
    }
    setIsListening(false);
    setInterimText('');
  }, []);

  const speakSakiLine = useCallback(async (text, speechId = 'story-glass') => {
    const line = String(text || '').trim();
    if (!line || !ttsEnabledRef.current || typeof onSpeakRef.current !== 'function') return;

    isSakiSpeakingRef.current = true;
    setIsSakiSpeaking(true);
    try {
      await Promise.resolve(onSpeakRef.current(line, speechId));
    } catch (error) {
      console.warn('[StoryGlass] TTS playback failed:', error);
    } finally {
      isSakiSpeakingRef.current = false;
      setIsSakiSpeaking(false);
    }
  }, []);

  const startListening = useCallback(() => {
    if (!isOpenRef.current || isGeneratingRef.current || submittedStoryRef.current) return;
    if (ttsEnabledRef.current && isStoryGlassTtsActive()) {
      if (listeningRetryTimerRef.current) {
        window.clearTimeout(listeningRetryTimerRef.current);
        listeningRetryTimerRef.current = null;
      }
      stopStoryGlassSpeechPlayback(onStopSpeechRef.current);
      isSakiSpeakingRef.current = false;
      setIsSakiSpeaking(false);
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceError(getLocalText('当前浏览器不支持语音识别。', 'Speech recognition is not supported by this browser.'));
      setIsListening(false);
      return;
    }

    stopListening();
    setVoiceError('');

    const recognition = new SpeechRecognition();
    recognition.lang = getSpeechLanguage(i18n.resolvedLanguage || i18n.language);
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interim = '';
      const finals = [];

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = compactWhitespace(result?.[0]?.transcript || '');
        if (!text) continue;

        if (result.isFinal) {
          finals.push(text);
        } else {
          interim = `${interim}${interim ? ' ' : ''}${text}`;
        }
      }

      if (finals.length > 0) {
        const now = Date.now();
        if (!firstSpeechAtRef.current) {
          firstSpeechAtRef.current = now;
        }
        lastFinalAtRef.current = now;
        setTranscript(prev => finals.reduce((current, item) => appendTranscript(current, item), prev));
        setSegments(prev => [
          ...prev,
          ...finals.map((text, index) => ({ id: `${now}-${index}`, text, at: now })),
        ]);
      }

      setInterimText(compactWhitespace(interim));
    };

    recognition.onerror = (event) => {
      const error = event?.error || 'unknown';
      shouldListenRef.current = false;
      if (error === 'no-speech' || error === 'aborted') {
        setVoiceError('');
      } else {
        setVoiceError(getLocalText(`语音识别暂时不可用：${error}`, `Speech recognition is unavailable: ${error}`));
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      if (!shouldListenRef.current || !isOpenRef.current || isGeneratingRef.current || submittedStoryRef.current) {
        return;
      }

      window.setTimeout(() => {
        if (shouldListenRef.current && isOpenRef.current && !isGeneratingRef.current && !submittedStoryRef.current) {
          startListening();
        }
      }, 280);
    };

    shouldListenRef.current = true;
    recognitionRef.current = recognition;

    try {
      recognition.start();
      setIsListening(true);
    } catch (error) {
      setVoiceError(getLocalText('麦克风没有启动成功。', 'The microphone could not start.'));
      shouldListenRef.current = false;
      recognitionRef.current = null;
      setIsListening(false);
    }
  }, [getLocalText, i18n.language, i18n.resolvedLanguage, stopListening]);

  const mixStory = useCallback((storyValue = finalTranscript, reason = 'saki', decision = {}) => {
    const story = String(storyValue || '').trim();
    if (!story || submittedStoryRef.current || isGeneratingRef.current) return;

    stopListening();
    if (mixingIntroTimerRef.current) {
      window.clearTimeout(mixingIntroTimerRef.current);
      mixingIntroTimerRef.current = 0;
    }
    setIsMixingIntroActive(true);
    mixingIntroTimerRef.current = window.setTimeout(() => {
      mixingIntroTimerRef.current = 0;
      setIsMixingIntroActive(false);
    }, STORY_GLASS_MIXING_INTRO_MS);

    const now = Date.now();
    setSubmittedAt(now);
    setSubmittedStory(story);
    submittedStoryRef.current = story;

    if (ttsEnabledRef.current) {
      onSpeakRef.current?.(
        getLocalText('我听到了。等我把这段故事调成一杯。', 'I heard it. Let me mix this story into a glass.'),
        'story-glass-mixing'
      );
    }

    onSubmitStoryRef.current?.(story, {
      ...(preferencesRef.current || {}),
      trigger: reason,
      voiceFirst: true,
      storyGlassOverlay: true,
      sakiDecision: {
        reason: decision.reason || '',
        confidence: decision.confidence || 0,
        mood: decision.mood || '',
      },
    });
  }, [finalTranscript, getLocalText, stopListening]);

  const handleMixNow = useCallback(() => {
    const story = String(currentMixableStory || '').trim();
    if (!story || submittedStoryRef.current || isGeneratingRef.current || isSakiThinkingRef.current) return;

    stopStoryGlassSpeechPlayback(onStopSpeechRef.current);
    mixStory(story, 'manual', {
      reason: 'manual',
      confidence: Math.max(0.68, Math.min(0.96, readiness.score / 100)),
      mood: 'ready-to-mix',
    });
  }, [currentMixableStory, mixStory, readiness.score]);

  const requestSakiDecision = useCallback(async (forceAll = false) => {
    if (!isOpenRef.current || submittedStoryRef.current || isGeneratingRef.current || isSakiThinkingRef.current) return;

    const currentSegments = segments;
    const startIndex = forceAll ? 0 : processedSegmentCountRef.current;
    const newSegments = currentSegments.slice(startIndex);
    const turnText = newSegments.map((segment) => segment.text).filter(Boolean).join('\n').trim();
    const storyText = finalTranscript.trim();
    if (!storyText || (!turnText && !forceAll)) return;

    processedSegmentCountRef.current = currentSegments.length;
    stopListening();
    setIsControlsOpen(false);
    setIsSakiThinking(true);

    const userTurn = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: turnText || storyText,
    };
    const turnsForRequest = [...sakiTurnsRef.current, userTurn];
    setSakiTurns(turnsForRequest);

    let decision = null;
    try {
      const runtimeConfig = configRef.current || {};
      const response = await fetch(`${backendUrl}/api/story-glass/listen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyText,
          turnText: userTurn.text,
          turns: turnsForRequest,
          preferences: preferencesRef.current || {},
          provider: runtimeConfig.provider,
          model: runtimeConfig.model,
          ollamaUrl: runtimeConfig.ollamaUrl,
          config: runtimeConfig,
        }),
      });

      if (!response.ok) {
        throw new Error(`Story Glass listen failed: ${response.status}`);
      }
      decision = await response.json();
    } catch (error) {
      console.warn('[StoryGlass] Falling back to local Saki decision:', error);
      decision = createLocalSakiDecision({
        storyText,
        turnText: userTurn.text,
        turns: turnsForRequest,
        getLocalText,
      });
    }

    if (!isOpenRef.current || submittedStoryRef.current) {
      setIsSakiThinking(false);
      return;
    }

    const replyText = String(decision?.reply || '').trim()
      || getLocalText('我听见了。你继续讲，我再判断什么时候给你一杯。', 'I heard you. Keep going; I will decide when to pour.');
    const sakiTurn = {
      id: `saki-${Date.now()}`,
      role: 'saki',
      text: replyText,
      decision,
    };
    const nextTurns = [...turnsForRequest, sakiTurn];
    sakiTurnsRef.current = nextTurns;
    setSakiTurns(nextTurns);

    setIsSakiThinking(false);
    await speakSakiLine(replyText, `story-glass-reply-${Date.now()}`);

    if (decision?.shouldMix) {
      mixStory(storyText, 'saki-decision', decision);
      return;
    }

    window.setTimeout(() => {
      if (isOpenRef.current && !submittedStoryRef.current && !isGeneratingRef.current) {
        startListening();
      }
    }, 1400);
  }, [backendUrl, finalTranscript, getLocalText, mixStory, segments, speakSakiLine, startListening, stopListening]);

  const continueWithSaki = useCallback(() => {
    stopListening();
    onReviewMessageChange?.('');
    setRackReviewMessageId('');

    openedAtRef.current = Date.now();
    firstSpeechAtRef.current = 0;
    lastFinalAtRef.current = 0;
    completionSpeechRef.current = '';
    submittedStoryRef.current = '';
    conversationArchivedRef.current = false;
    processedSegmentCountRef.current = 0;
    sakiTurnsRef.current = [];
    if (mixingIntroTimerRef.current) {
      window.clearTimeout(mixingIntroTimerRef.current);
      mixingIntroTimerRef.current = 0;
    }

    setTranscript('');
    setInterimText('');
    setSegments([]);
    setSakiTurns([]);
    setIsSakiThinking(false);
    setIsSakiSpeaking(false);
    setVoiceError('');
    setSubmittedAt(0);
    setSubmittedStory('');
    setTimeTick(prev => prev + 1);
    setIdleMovieIndex(0);
    setIsMixingIntroActive(false);

    if (ttsEnabledRef.current) {
      onSpeakRef.current?.(
        getLocalText('我在。你继续讲，下一杯让我从故事里听出来。', 'I am here. Keep telling me; I will listen for the next glass.'),
        'story-glass-continue'
      );
    }

    window.setTimeout(() => {
      if (isOpenRef.current && !isGeneratingRef.current && !submittedStoryRef.current) {
        startListening();
      }
    }, 220);
  }, [getLocalText, onReviewMessageChange, startListening, stopListening]);

  const selectShelfItem = useCallback((messageId) => {
    const nextId = String(messageId || '');
    if (!nextId) return;
    stopListening();
    setRackReviewMessageId(nextId);
    onReviewMessageChange?.(nextId);
    setSubmittedStory('');
    submittedStoryRef.current = '';
  }, [onReviewMessageChange, stopListening]);

  const deleteShelfItem = useCallback(async (messageId) => {
    const targetId = String(messageId || '');
    if (!targetId || typeof onDeleteRecord !== 'function') return;

    const target = shelfItems.find(item => String(item.id) === targetId);
    const name = String(target?.data?.cocktailName || getLocalText('这杯故事杯', 'this Story Glass')).trim();
    const confirmed = typeof window === 'undefined'
      ? true
      : window.confirm(getLocalText(`要从酒架上删除「${name}」吗？`, `Delete "${name}" from the shelf?`));
    if (!confirmed) return;

    const deleted = await onDeleteRecord(targetId);
    if (deleted === false) return;

    if (String(activeMessage?.id || '') === targetId || String(effectiveReviewMessageId || '') === targetId) {
      continueWithSaki();
    }
  }, [activeMessage?.id, continueWithSaki, effectiveReviewMessageId, getLocalText, onDeleteRecord, shelfItems]);

  const replayShelfToast = useCallback((messageId) => {
    const target = shelfItems.find(item => String(item.id) === String(messageId || ''));
    const data = target?.data || {};
    const line = String(data.sakiComment || data.featuredQuote || data.cocktailSubtitle || '').trim();
    if (!line) return;
    speakSakiLine(line, `story-glass-toast-${Date.now()}`);
  }, [shelfItems, speakSakiLine]);

  const shareStoryCard = useCallback(async () => {
    if (!storyGlassData) return;
    const text = getStoryCardText(storyGlassData, getLocalText);
    const title = String(storyGlassData.cocktailName || getLocalText('故事酒卡', 'Story Card')).trim();

    try {
      if (navigator.share) {
        await navigator.share({ title, text });
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        window.alert?.(getLocalText('故事酒卡文案已复制。', 'Story card text copied.'));
      }
    } catch (error) {
      console.warn('[StoryGlass] Share failed:', error);
    }
  }, [getLocalText, storyGlassData]);

  const downloadStoryCard = useCallback(() => {
    if (!storyGlassData || typeof document === 'undefined') return;

    const svg = createStoryCardSvg(storyGlassData, getLocalText);
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const name = String(storyGlassData.cocktailNameEn || storyGlassData.cocktailName || 'story-glass')
      .replace(/[\\/:*?"<>|]+/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 64) || 'story-glass';
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name}-card.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [getLocalText, storyGlassData]);

  useEffect(() => {
    if (!isOpen || submittedStory || isGenerating || isSakiThinking || !finalTranscript) return undefined;
    if (segments.length <= processedSegmentCountRef.current) return undefined;

    const pauseMs = lastFinalAtRef.current ? Date.now() - lastFinalAtRef.current : 0;
    const waitMs = Math.max(700, 1300 - pauseMs);
    const timer = window.setTimeout(() => {
      if (!submittedStoryRef.current && !isSakiThinkingRef.current) {
        requestSakiDecision(false);
      }
    }, waitMs);

    return () => window.clearTimeout(timer);
  }, [finalTranscript, isGenerating, isOpen, isSakiThinking, requestSakiDecision, segments.length, submittedStory]);

  useEffect(() => {
    if (!isOpen) {
      stopListening();
      return undefined;
    }

    openedAtRef.current = Date.now();
    firstSpeechAtRef.current = 0;
    lastFinalAtRef.current = 0;
    completionSpeechRef.current = '';
    submittedStoryRef.current = '';
    processedSegmentCountRef.current = 0;
    sakiTurnsRef.current = [];
    setTranscript('');
    setInterimText('');
    setSegments([]);
    setSakiTurns([]);
    setIsSakiThinking(false);
    setIsSakiSpeaking(false);
    setVoiceError('');
    setSubmittedAt(0);
    setSubmittedStory('');
    setIdleMovieIndex(0);
    setIsMixingIntroActive(false);
    if (mixingIntroTimerRef.current) {
      window.clearTimeout(mixingIntroTimerRef.current);
      mixingIntroTimerRef.current = 0;
    }

    if (isReviewMode) {
      stopListening();
      return () => {
        stopListening();
      };
    }

    if (ttsEnabledRef.current) {
      onSpeakRef.current?.(
        getLocalText('我在听。故事有了味道，我再给你一杯。', 'I am listening. When the story has flavor, I will serve a glass.'),
        'story-glass-open'
      );
    }

    const timer = window.setTimeout(() => {
      startListening();
    }, 220);

    return () => {
      window.clearTimeout(timer);
      stopListening();
    };
  }, [getLocalText, isOpen, isReviewMode, startListening, stopListening]);

  useEffect(() => {
    if (!isOpen || isReviewMode || !ttsEnabled || !isCompleted || !storyGlassData) return;

    const key = `${activeMessage?.id || ''}-${storyGlassData.cocktailName || ''}-${storyGlassData.sakiComment || ''}`;
    if (completionSpeechRef.current === key) return;
    completionSpeechRef.current = key;

    const line = storyGlassData.sakiComment
      || getLocalText(`这杯「${storyGlassData.cocktailName || '故事杯'}」调好了。`, `Your "${storyGlassData.cocktailName || 'Story Glass'}" is ready.`);
    onSpeakRef.current?.(line, 'story-glass-complete');
  }, [activeMessage?.id, getLocalText, isCompleted, isOpen, isReviewMode, storyGlassData, ttsEnabled]);

  useEffect(() => {
    if (!isOpen || isReviewMode || !isCompleted || !storyGlassData) return undefined;

    const key = `${activeMessage?.id || ''}-${storyGlassData.cocktailName || ''}-served`;
    setServingRevealKey(key);
    if (servingRevealTimerRef.current) {
      window.clearTimeout(servingRevealTimerRef.current);
    }
    servingRevealTimerRef.current = window.setTimeout(() => {
      servingRevealTimerRef.current = 0;
      setServingRevealKey('');
    }, 5200);

    return () => {
      if (servingRevealTimerRef.current) {
        window.clearTimeout(servingRevealTimerRef.current);
        servingRevealTimerRef.current = 0;
      }
    };
  }, [activeMessage?.id, isCompleted, isOpen, isReviewMode, storyGlassData]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!ttsEnabled) {
      stopStoryGlassSpeechPlayback(onStopSpeechRef.current);
    }
  }, [ttsEnabled]);

  const targetMovieIsResultLayout = Boolean(submittedStory || isReviewMode || storyGlassData);
  const targetMovieStageIsMixing = targetMovieIsResultLayout && !isCompleted && glassStatus !== 'error';
  const targetMovieStageIsDone = isCompleted || Boolean(isReviewMode && storyGlassData);
  const targetMovieIdleKey = STORY_GLASS_IDLE_MOVIE_KEYS[idleMovieIndex % STORY_GLASS_IDLE_MOVIE_KEYS.length] || 'gameIdleLoop';
  const targetStoryGlassMovieKey = (() => {
    if (targetMovieStageIsDone) return 'served';
    if (targetMovieStageIsMixing || submittedStory) return isMixingIntroActive ? 'decidingToMix' : 'mixing';
    if (isSakiThinking) return 'thinkingReply';
    if (!targetMovieIsResultLayout && readiness.score >= 72 && finalTranscript) return 'decidingToMix';
    if (isListening) return 'listening';
    if (!isListening && sakiTurns.length > 0) return 'continueTalking';
    return targetMovieIdleKey;
  })();
  const targetStoryGlassMovieSrc = STORY_GLASS_MOVIES[targetStoryGlassMovieKey] || STORY_GLASS_MOVIES[STORY_GLASS_INITIAL_MOVIE_KEY];
  useEffect(() => {
    if (!isOpen) return;

    if (targetMovieStageIsMixing || targetMovieStageIsDone || targetStoryGlassMovieKey === 'decidingToMix') {
      preloadStoryGlassMovies(STORY_GLASS_MOVIE_PRELOAD_GROUPS.mixing);
      return;
    }

    if (targetStoryGlassMovieKey === 'thinkingReply' || targetStoryGlassMovieKey === 'continueTalking') {
      preloadStoryGlassMovies(STORY_GLASS_MOVIE_PRELOAD_GROUPS.conversation);
      return;
    }

    if (STORY_GLASS_IDLE_MOVIE_KEYS.includes(targetStoryGlassMovieKey)) {
      preloadStoryGlassMovies(STORY_GLASS_MOVIE_PRELOAD_GROUPS.idle);
    }
  }, [
    isOpen,
    preloadStoryGlassMovies,
    targetMovieStageIsDone,
    targetMovieStageIsMixing,
    targetStoryGlassMovieKey,
  ]);
  const latestDecision = useMemo(
    () => [...sakiTurns].reverse().find((turn) => turn.role === 'saki' && turn.decision)?.decision || null,
    [sakiTurns]
  );
  const stageFlavorSignals = useMemo(() => getStoryFlavorSignals({
    text: [finalTranscript, liveTranscript, submittedStory, storyGlassData?.storySummary, storyGlassData?.featuredQuote].filter(Boolean).join('\n'),
    data: storyGlassData,
    latestDecision,
    readinessScore: isCompleted ? 100 : readiness.score,
    localeIsZh,
  }), [finalTranscript, isCompleted, latestDecision, liveTranscript, localeIsZh, readiness.score, storyGlassData, submittedStory]);
  const voiceToneMeta = useMemo(() => getVoiceToneMeta({
    text: liveTranscript || finalTranscript,
    isListening,
    readinessScore: readiness.score,
    localeIsZh,
  }), [finalTranscript, isListening, liveTranscript, localeIsZh, readiness.score]);
  const decisionMoodMeta = useMemo(
    () => getDecisionMoodMeta(latestDecision, getLocalText),
    [getLocalText, latestDecision]
  );

  useEffect(() => {
    const clearMovieTransitionTimers = () => {
      if (movieTransitionFrameRef.current) {
        window.cancelAnimationFrame(movieTransitionFrameRef.current);
        movieTransitionFrameRef.current = 0;
      }
      if (movieTransitionTimerRef.current) {
        window.clearTimeout(movieTransitionTimerRef.current);
        movieTransitionTimerRef.current = 0;
      }
    };

    if (!isOpen) {
      clearMovieTransitionTimers();
      activeMovieSrcRef.current = targetStoryGlassMovieSrc;
      setActiveMovieSrc(targetStoryGlassMovieSrc);
      setPreviousMovieSrc('');
      setMovieFadeReady(true);
      return undefined;
    }

    if (!targetStoryGlassMovieSrc || targetStoryGlassMovieSrc === activeMovieSrcRef.current) {
      return undefined;
    }

    clearMovieTransitionTimers();
    const outgoingMovieSrc = activeMovieSrcRef.current || STORY_GLASS_MOVIES[STORY_GLASS_INITIAL_MOVIE_KEY];
    activeMovieSrcRef.current = targetStoryGlassMovieSrc;
    setPreviousMovieSrc(outgoingMovieSrc);
    setActiveMovieSrc(targetStoryGlassMovieSrc);
    setMovieFadeReady(false);

    movieTransitionFrameRef.current = window.requestAnimationFrame(() => {
      movieTransitionFrameRef.current = window.requestAnimationFrame(() => {
        movieTransitionFrameRef.current = 0;
        setMovieFadeReady(true);
      });
    });

    movieTransitionTimerRef.current = window.setTimeout(() => {
      movieTransitionTimerRef.current = 0;
      setPreviousMovieSrc('');
    }, 1200);

    return undefined;
  }, [isOpen, targetStoryGlassMovieSrc]);

  useEffect(() => () => {
    if (movieTransitionFrameRef.current) {
      window.cancelAnimationFrame(movieTransitionFrameRef.current);
    }
    if (movieTransitionTimerRef.current) {
      window.clearTimeout(movieTransitionTimerRef.current);
    }
    if (servingRevealTimerRef.current) {
      window.clearTimeout(servingRevealTimerRef.current);
    }
    if (mixingIntroTimerRef.current) {
      window.clearTimeout(mixingIntroTimerRef.current);
    }
    preloadedMovieElementsRef.current.clear();
  }, []);

  if (!isOpen || typeof document === 'undefined') return null;

  const isResultLayout = targetMovieIsResultLayout;
  const stageIsMixing = targetMovieStageIsMixing;
  const stageIsDone = targetMovieStageIsDone;
  const isMixNowDisabled = Boolean(
    submittedStory
    || isGenerating
    || isSakiThinking
    || !currentMixableStory
  );
  const overlayGridClass = isResultLayout
    ? 'grid min-h-full gap-3 sm:gap-4 lg:h-full lg:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)] lg:items-end'
    : 'relative flex min-h-full flex-col gap-3 sm:gap-4 lg:grid lg:h-full lg:grid-cols-[minmax(16rem,21rem)_minmax(0,1fr)] lg:items-end';
  const controlsPanelClass = isResultLayout
    ? 'order-3 max-h-[42dvh] overflow-y-auto rounded-[1.1rem] border border-amber-100/10 bg-[linear-gradient(160deg,rgba(27,18,9,0.44),rgba(4,13,14,0.22))] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_62px_rgba(0,0,0,0.26)] backdrop-blur-[10px] lg:order-1 lg:mb-5 lg:max-h-[calc(100vh-7.5rem)] custom-scrollbar'
    : 'order-2 max-h-[34dvh] overflow-y-auto rounded-[1.1rem] border border-amber-100/10 bg-[linear-gradient(160deg,rgba(27,18,9,0.44),rgba(4,13,14,0.22))] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_62px_rgba(0,0,0,0.26)] backdrop-blur-[10px] lg:order-1 lg:mb-5 lg:max-h-[calc(100vh-7.5rem)] custom-scrollbar';
  const mainPanelClass = isResultLayout
    ? 'order-1 flex min-h-[28rem] min-w-0 flex-col overflow-hidden rounded-[1.15rem] border border-amber-100/10 bg-[linear-gradient(155deg,rgba(7,24,24,0.46),rgba(0,0,0,0.18)_48%,rgba(39,20,7,0.24))] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_30px_92px_rgba(0,0,0,0.34)] backdrop-blur-[8px] sm:min-h-[36rem] lg:order-2 lg:mb-5 lg:max-h-[calc(100vh-7.5rem)]'
    : 'order-1 relative h-[calc(100dvh-8.5rem)] min-h-[28rem] overflow-visible sm:min-h-[32rem] lg:pointer-events-none lg:absolute lg:inset-0 lg:z-20 lg:order-none lg:h-auto lg:min-h-0';
  const latestSakiTurn = [...sakiTurns].reverse().find((turn) => turn.role === 'saki') || null;
  const latestUserTurn = liveTranscript
    ? {
      id: 'live-user-voice',
      role: 'user',
      text: liveTranscript,
      isLive: true,
      voiceTone: voiceToneMeta,
    }
    : (() => {
      const turn = [...sakiTurns].reverse().find((item) => item.role === 'user') || null;
      return turn ? { ...turn, voiceTone: voiceToneMeta } : null;
    })();
  const sakiStageTurn = latestSakiTurn || (isSakiThinking
    ? {
      id: 'saki-thinking',
      role: 'saki',
      text: getLocalText('Saki 正在回味这一段。', 'Saki is tasting this turn.'),
    }
    : null);

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[170] overflow-hidden bg-slate-950 text-white">
      <StoryGlassStageStyle />
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url("${STORY_GLASS_BACKGROUND}")` }}
      />
      {previousMovieSrc ? (
        <video
          key={`previous-${previousMovieSrc}`}
          className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-[1100ms] ease-in-out ${movieFadeReady ? 'opacity-0' : 'opacity-100'}`}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster={STORY_GLASS_BACKGROUND}
          aria-hidden="true"
        >
          <source src={previousMovieSrc} type="video/mp4" />
        </video>
      ) : null}
      <video
        key={`active-${activeMovieSrc}`}
        className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-[1100ms] ease-in-out ${previousMovieSrc ? (movieFadeReady ? 'opacity-100' : 'opacity-0') : 'opacity-100'}`}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster={STORY_GLASS_BACKGROUND}
        aria-hidden="true"
      >
        <source src={activeMovieSrc || targetStoryGlassMovieSrc} type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_48%_74%_at_56%_47%,transparent_0%,transparent_53%,rgba(0,0,0,0.18)_76%,rgba(0,0,0,0.34)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,9,8,0.52)_0%,rgba(5,9,8,0.18)_18%,transparent_34%,transparent_66%,rgba(2,12,15,0.24)_82%,rgba(2,12,15,0.54)_100%)]" />
      <div className="absolute inset-x-0 top-0 h-[18vh] bg-[linear-gradient(180deg,rgba(0,0,0,0.18),transparent)]" />
      <div className="absolute inset-x-0 bottom-0 h-[26vh] bg-[linear-gradient(180deg,transparent,rgba(2,8,9,0.50)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-[18vh] bg-[linear-gradient(180deg,transparent_0%,rgba(0,0,0,0.72)_56%,#000_100%)]" />
      <div className="absolute inset-x-[3%] bottom-[6.25rem] hidden h-px bg-[linear-gradient(90deg,transparent,rgba(253,230,138,0.38),rgba(94,234,212,0.18),transparent)] lg:block" />
      <StoryFlavorStage signals={stageFlavorSignals} active={!isResultLayout || stageIsMixing} />
      {servingRevealKey && storyGlassData ? (
        <ServingReveal data={storyGlassData} signals={stageFlavorSignals} getLocalText={getLocalText} />
      ) : null}

      <div className="relative z-10 flex h-full flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-200/28 bg-black/24 text-amber-100 shadow-[0_12px_30px_rgba(0,0,0,0.22)] backdrop-blur-md">
              <Sparkles size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-amber-50 sm:text-lg">
                {getLocalText('给 Saki 讲故事', 'Tell Saki A Story')}
              </h2>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-white/62">
                <span className={`h-1.5 w-1.5 rounded-full ${isListening ? 'bg-emerald-300' : isMixing ? 'bg-amber-300' : 'bg-white/38'}`} />
                <span className="truncate">{statusText}</span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setTtsEnabled(prev => !prev)}
              className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-all ${
                ttsEnabled
                  ? 'border-amber-200/45 bg-amber-100 text-stone-950'
                  : 'border-white/18 bg-black/22 text-white/72 hover:bg-white/10'
              }`}
              title={getLocalText('TTS', 'TTS')}
            >
              <Volume2 size={17} />
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/18 bg-black/22 text-white/78 transition-all hover:bg-white/10 hover:text-white"
              title={getLocalText('关闭', 'Close')}
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 sm:px-6 lg:overflow-hidden">
          <div className={overlayGridClass}>
            <aside className={controlsPanelClass}>
              <button
                type="button"
                onClick={() => setIsControlsOpen(prev => !prev)}
                className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-amber-100/64">
                    <SlidersHorizontal size={13} />
                    <span>{getLocalText('调酒台', 'Mixing Desk')}</span>
                  </div>
                  <div className="mt-1 text-sm font-semibold text-amber-50">
                    {getLocalText('风味偏好', 'Flavor Preference')}
                  </div>
                </div>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/14 bg-white/8 text-amber-50">
                  {isControlsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </button>

              {isControlsOpen ? (
                <div className="px-4 pb-4">
                  <div className="space-y-5">
                    {preferenceGroups.map((group) => (
                      <PreferenceGroup
                        key={group.id}
                        group={group}
                        value={preferences?.[group.id]}
                        onChange={onPreferenceChange}
                        getLocalText={getLocalText}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              <StoryWarmthCup
                score={isCompleted ? 100 : readiness.score}
                signals={stageFlavorSignals}
                isListening={isListening}
                isMixing={stageIsMixing}
                isDone={stageIsDone}
                getLocalText={getLocalText}
              />

              <StoryGlassShelf
                items={shelfItems}
                activeId={activeMessage?.id || effectiveReviewMessageId}
                onSelect={selectShelfItem}
                onDelete={deleteShelfItem}
                onReplay={replayShelfToast}
                onContinue={continueWithSaki}
                backendUrl={backendUrl}
                getLocalText={getLocalText}
              />
            </aside>

            <aside className={mainPanelClass}>
              {!isResultLayout && latestDecision && decisionMoodMeta ? (
                <div className={`pointer-events-auto absolute right-[6vw] top-[7vh] hidden max-w-[22rem] rounded-[0.95rem] border px-3 py-2 text-xs shadow-[0_18px_44px_rgba(0,0,0,0.20)] backdrop-blur-md lg:block ${getSignalToneClass(decisionMoodMeta.tone)}`}>
                  <div className="flex items-center gap-2 font-bold">
                    <Sparkles size={13} />
                    <span>{decisionMoodMeta.label}</span>
                  </div>
                  <div className="mt-1 leading-5 text-white/58">
                    {decisionMoodMeta.detail}
                  </div>
                </div>
              ) : null}

              {!isResultLayout ? (
                <div className="relative h-full min-h-[28rem] w-full sm:min-h-[32rem]">
                  <div className="contents">
                    {sakiStageTurn || latestUserTurn || voiceError ? (
                      <div className="contents">
                        {sakiStageTurn ? (
                          <div className="pointer-events-auto absolute left-2 top-4 w-[min(38rem,calc(100vw-2rem))] sm:left-[10vw] sm:top-[7vh] lg:left-[11.8vw] lg:top-[4.5vh] lg:w-[31rem] xl:w-[34rem]">
                            <VoiceTurn key={sakiStageTurn.id} turn={sakiStageTurn} placement="stage" />
                          </div>
                        ) : null}
                        {latestUserTurn ? (
                          <div className="pointer-events-auto absolute bottom-[8.25rem] right-1 w-[min(24rem,calc(100vw-2rem))] sm:right-8 lg:bottom-[22vh] lg:right-[10vw] lg:w-[24rem]">
                            <VoiceTurn key={latestUserTurn.id} turn={latestUserTurn} placement="stage" />
                          </div>
                        ) : null}
                        {voiceError ? (
                          <div className="pointer-events-auto absolute bottom-[8.25rem] right-1 w-[min(24rem,calc(100vw-2rem))] rounded-[0.85rem] border border-rose-300/24 bg-rose-950/34 px-3 py-2 text-xs leading-5 text-rose-100 sm:right-8 lg:bottom-[22vh] lg:right-[10vw] lg:w-[24rem]">
                            {voiceError}
                          </div>
                        ) : null}
                        {false && isSakiThinking ? (
                          <div className="flex items-center gap-2 px-2 py-1 text-xs font-semibold text-amber-100/72">
                            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-100" />
                            {getLocalText('Saki 正在回味这一段', 'Saki is tasting this turn')}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="pointer-events-auto absolute bottom-4 right-3 flex flex-col items-center text-center sm:right-8 lg:bottom-[19vh] lg:right-[3vw]">
                    <button
                      type="button"
                      onClick={isListening ? stopListening : startListening}
                      disabled={isSakiThinking}
                      className={`flex h-24 w-24 items-center justify-center rounded-full border transition-all active:scale-95 ${
                        isListening
                          ? 'border-emerald-200/70 bg-emerald-300 text-slate-950 shadow-[0_0_42px_rgba(110,231,183,0.28)]'
                          : isSakiThinking
                            ? 'cursor-wait border-white/18 bg-white/10 text-white/36'
                            : 'border-amber-100/50 bg-amber-100 text-stone-950 shadow-[0_0_42px_rgba(251,191,36,0.24)] hover:bg-amber-50'
                      }`}
                      title={isListening
                        ? getLocalText('暂停聆听', 'Pause listening')
                        : isSakiSpeaking
                          ? getLocalText('打断并聆听', 'Interrupt and listen')
                          : getLocalText('开始聆听', 'Start listening')}
                    >
                      {isListening ? <MicOff size={34} /> : <Mic size={34} />}
                    </button>

                    <button
                      type="button"
                      onClick={handleMixNow}
                      disabled={isMixNowDisabled}
                      className={`mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-bold shadow-[0_14px_34px_rgba(0,0,0,0.22)] backdrop-blur-md transition-all active:scale-95 ${
                        isMixNowDisabled
                          ? 'cursor-not-allowed border-white/12 bg-black/18 text-white/32'
                          : 'border-amber-100/46 bg-amber-100/18 text-amber-50 hover:border-amber-100/70 hover:bg-amber-100/26'
                      }`}
                      title={getLocalText('现在调制', 'Mix now')}
                    >
                      <Wine size={15} />
                      <span>{getLocalText('现在调制', 'Mix now')}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 custom-scrollbar sm:px-5">
                  {storyGlassData ? (
                    <div className="mx-auto w-full max-w-[82rem]">
                      <StoryGlassView
                        data={storyGlassData}
                        isEmbedded={false}
                        variant="bar"
                        onRemix={onRemix ? (action) => onRemix(storyGlassData, action) : null}
                        remixActions={remixActions}
                      />
                      {isCompleted ? (
                        <StoryShareCard
                          data={storyGlassData}
                          backendUrl={backendUrl}
                          getLocalText={getLocalText}
                          onShare={shareStoryCard}
                          onDownload={downloadStoryCard}
                        />
                      ) : null}
                      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                        <button
                          type="button"
                          onClick={continueWithSaki}
                          className="inline-flex items-center gap-2 rounded-md border border-amber-100/34 bg-amber-100/16 px-5 py-2.5 text-sm font-bold text-amber-50 shadow-[0_0_28px_rgba(251,191,36,0.12)] backdrop-blur-md transition-all hover:border-amber-100/55 hover:bg-amber-100/24"
                        >
                          <Mic size={16} />
                          {getLocalText('继续和 Saki 讲故事', 'Keep Talking With Saki')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <MixingRitualStage signals={stageFlavorSignals} getLocalText={getLocalText} />
                  )}
                </div>
              )}
            </aside>
          </div>
        </main>
      </div>
    </div>,
    document.body
  );
}
