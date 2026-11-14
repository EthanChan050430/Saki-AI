import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Moon, Music, Sparkles, Smile, ArrowDownToLine, Move, EyeOff, Heart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '../utils/useMediaQuery';

const EXPRESSION_MAP = {
  normal: 'normal',
  happy: 'happy',
  smile: 'happy',
  joy: 'happy',
  cheer: 'happy',
  ok: 'happy',
  great: 'happy',
  excited: 'happy',
  no_problem: 'happy',
  think: 'think',
  thinking: 'think',
  confused: 'think',
  curious: 'think',
  busy: 'think',
  shy: 'shy',
  blush: 'shy',
  embarrassed: 'shy',
  worry: 'worry',
  worried: 'worry',
  sad: 'worry',
  angry: 'worry',
  sleepy: 'sleepy',
  sleep: 'sleepy',
  tired: 'sleepy',
  doze: 'sleepy',
};

const DOZE_IDLE_TIMEOUT_MS = 28000;
const IDLE_CYCLE_MIN_MS = 10000;
const IDLE_CYCLE_MAX_MS = 16000;
const MICRO_HABIT_DURATION_MS = 3900;
const DOCK_SNAP_DISTANCE_PX = 110;
const EDGE_SNAP_MARGIN_PX = 28;
const DOCKED_WIDTH = 178;
const DOCKED_HEIGHT = 178;
const PET_WIDTH = 264;
const PET_HEIGHT = 264;
const EDGE_WIDTH = 220;
const EDGE_HEIGHT = 220;

const DOCKED_IDLE_VARIANTS = ['docked_idle', 'docked_idle_look', 'docked_idle_yawn', 'docked_idle_sway', 'docked_chin_rest', 'docked_fix_hair'];
const FULL_IDLE_VARIANTS = ['full_idle', 'full_idle_look', 'full_idle_stretch', 'full_idle_twirl', 'full_tiptoe', 'full_sip_drink'];
const EDGE_IDLE_VARIANTS = ['edge_idle', 'edge_slip'];

const IDLE_MICRO_HABIT_EXPR = {
  docked_chin_rest: 'chin_rest',
  docked_fix_hair: 'fix_hair',
  full_tiptoe: 'tiptoe',
  full_sip_drink: 'sip_drink',
  edge_slip: 'slip',
};

const EDGE_TAP_REACTIONS = [
  { action: 'happy', zh: '嘿嘿~ 被发现我在偷看你啦♪', en: 'Hehe~ caught me peeking♪' },
  { action: 'shy', zh: '呜…别戳探出来的手啦 (>///<)', en: 'Hey~ don\'t poke my peeking hand (>///<)' },
];

const DOCKED_TAP_REACTIONS = [
  { action: 'tap_wink', zh: '嘿嘿~ 被你发现啦♪', en: 'Hehe~ caught you looking♪' },
  { action: 'tap_wave', zh: '嗨呀~ 有什么想聊的吗？', en: 'Hi there~ Want to chat?' },
  { action: 'tap_surprise', zh: '哇！吓我一跳啦 (>///<)', en: 'Eek! Startled me~ (>///<)' },
];

const FULL_TAP_REACTIONS = [
  { action: 'tap_wink', zh: '今天也要元气满满哦~ ✨', en: 'Stay cheerful today! ✨' },
  { action: 'tap_wave', zh: '在这里呢~ 随时叫我吧♪', en: 'Right here~ Call me anytime♪' },
  { action: 'tap_spin', zh: '好耶~ 转个圈圈开心一下！', en: 'Yay~ Happy little spin!' },
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const mapExpressionKey = (rawExpression) => {
  if (!rawExpression) return 'normal';
  const normalized = String(rawExpression).trim().toLowerCase().replace(/\.png$/i, '');
  return EXPRESSION_MAP[normalized] || 'normal';
};

const CharacterView = ({
  currentExpression = 'normal.png',
  isOpen,
  setIsOpen,
  triggerAnimation,
  lowResourceMode = false,
  isGenerating = false,
  isMusicPlaying = false,
  dockHostEl = undefined,
}) => {
  const { i18n } = useTranslation();
  const isZh = (i18n?.language || 'zh').toLowerCase().startsWith('zh');
  const isMobile = useIsMobile();
  const dockedWidth = isMobile ? 112 : DOCKED_WIDTH;
  const dockedHeight = isMobile ? 112 : DOCKED_HEIGHT;
  const petWidth = isMobile ? 172 : PET_WIDTH;
  const petHeight = isMobile ? 172 : PET_HEIGHT;
  const edgeWidth = isMobile ? 148 : EDGE_WIDTH;
  const edgeHeight = isMobile ? 148 : EDGE_HEIGHT;
  const dockedRightInset = isMobile ? 10 : 24;

  const [mode, setMode] = useState('docked'); // 'docked' | 'pet' | 'edge-left' | 'edge-right' | 'hidden'
  const [petPos, setPetPos] = useState(() => ({
    x: typeof window !== 'undefined' ? Math.max(12, window.innerWidth - (window.innerWidth < 768 ? 172 : PET_WIDTH) - 20) : 800,
    y: typeof window !== 'undefined' ? Math.max(80, window.innerHeight - (window.innerWidth < 768 ? 172 : PET_HEIGHT) - 120) : 320,
  }));
  const [edgeY, setEdgeY] = useState(() => (typeof window !== 'undefined' ? Math.max(80, window.innerHeight - (window.innerWidth < 768 ? 148 : EDGE_HEIGHT) - 140) : 260));
  const [dockAnchor, setDockAnchor] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isNearDockZone, setIsNearDockZone] = useState(false);
  const [nearEdgeSnap, setNearEdgeSnap] = useState(null); // null | 'left' | 'right'
  const [isHovered, setIsHovered] = useState(false);
  const [isTouchMenuOpen, setIsTouchMenuOpen] = useState(false);
  const rootRef = useRef(null);

  const [manualAction, setManualAction] = useState(null); // null | 'think' | 'doze' | 'dance' | 'happy' | 'shy' | 'tap_wink' | 'tap_wave' | 'tap_surprise' | 'tap_spin'
  const [idleAnimName, setIdleAnimName] = useState('docked_idle');
  const [dragAnimName, setDragAnimName] = useState('full_drag_dangle');
  const [isAutoDozing, setIsAutoDozing] = useState(false);
  const [isUserTyping, setIsUserTyping] = useState(false);
  const [bubbleText, setBubbleText] = useState('');
  const [webpFailed, setWebpFailed] = useState({});

  const tapCountRef = useRef(0);
  const lastTapIdxRef = useRef(-1);
  const tapTimerRef = useRef(null);
  const bubbleTimerRef = useRef(null);
  const dozeTimerRef = useRef(null);
  const manualActionTimerRef = useRef(null);
  const typingTimerRef = useRef(null);
  const lastHoverCuriousRef = useRef(0);
  const prevGeneratingRef = useRef(isGenerating);

  const dragStateRef = useRef({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
    startedMode: 'docked',
  });

  const showBubble = useCallback((text, duration = 2600) => {
    setBubbleText(text);
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    bubbleTimerRef.current = setTimeout(() => setBubbleText(''), duration);
  }, []);

  const resetDozeTimer = useCallback(() => {
    setIsAutoDozing(false);
    if (dozeTimerRef.current) clearTimeout(dozeTimerRef.current);
    if (isGenerating || isMusicPlaying || lowResourceMode) return;
    dozeTimerRef.current = setTimeout(() => {
      setIsAutoDozing(true);
    }, DOZE_IDLE_TIMEOUT_MS);
  }, [isGenerating, isMusicPlaying, lowResourceMode]);

  useEffect(() => {
    resetDozeTimer();
    return () => {
      if (dozeTimerRef.current) clearTimeout(dozeTimerRef.current);
    };
  }, [currentExpression, triggerAnimation, isGenerating, isMusicPlaying, mode, resetDozeTimer]);

  // Measure chat composer (.saki-input-shell) so docked Saki rests right on top of it
  const updateDockAnchor = useCallback(() => {
    const hostComposer = dockHostEl?.isConnected ? dockHostEl.nextElementSibling : null;
    const el = (hostComposer && hostComposer.matches?.('[data-onboarding-id="chat-composer"], .saki-input-shell'))
      ? hostComposer
      : document.querySelector('[data-onboarding-id="chat-composer"], .saki-input-shell');
    if (!el) {
      setDockAnchor(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 20) {
      setDockAnchor(null);
      return;
    }
    setDockAnchor({
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
    });
  }, [dockHostEl]);

  useEffect(() => {
    updateDockAnchor();
    const interval = setInterval(updateDockAnchor, 400);
    window.addEventListener('resize', updateDockAnchor);
    window.addEventListener('scroll', updateDockAnchor, true);
    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', updateDockAnchor);
      window.removeEventListener('scroll', updateDockAnchor, true);
    };
  }, [updateDockAnchor]);

  useEffect(() => {
    if (isDragging) {
      updateDockAnchor();
    }
  }, [isDragging, updateDockAnchor]);

  // Keep pet inside viewport on window resize or mobile size change
  useEffect(() => {
    const handleResize = () => {
      setPetPos((prev) => ({
        x: clamp(prev.x, 8, Math.max(8, window.innerWidth - petWidth - 8)),
        y: clamp(prev.y, 52, Math.max(52, window.innerHeight - petHeight - 8)),
      }));
      setEdgeY((prev) => clamp(prev, 52, Math.max(52, window.innerHeight - edgeHeight - 20)));
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [petWidth, petHeight, edgeHeight]);

  useEffect(() => {
    if (!isTouchMenuOpen) return undefined;
    const handleOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setIsTouchMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleOutside);
    return () => document.removeEventListener('pointerdown', handleOutside);
  }, [isTouchMenuOpen]);

  useEffect(() => {
    if (isOpen && mode === 'hidden') {
      setMode('pet');
      setIsOpen?.(false);
    }
  }, [isOpen, mode, setIsOpen]);

  useEffect(() => () => {
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    if (dozeTimerRef.current) clearTimeout(dozeTimerRef.current);
    if (manualActionTimerRef.current) clearTimeout(manualActionTimerRef.current);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
  }, []);

  const triggerTemporaryAction = useCallback((action, durationMs = 6500) => {
    setManualAction(action);
    setIsAutoDozing(false);
    if (manualActionTimerRef.current) clearTimeout(manualActionTimerRef.current);
    if (durationMs > 0) {
      manualActionTimerRef.current = setTimeout(() => {
        setManualAction(null);
      }, durationMs);
    }
  }, []);

  const isAutoDozingRef = useRef(isAutoDozing);
  useEffect(() => {
    isAutoDozingRef.current = isAutoDozing;
  }, [isAutoDozing]);

  // Watch composer typing so docked Saki attentively looks down at user input (and wakes up if dozing)
  useEffect(() => {
    const handleTypingActivity = (event) => {
      const target = event.target;
      if (!target || typeof target.closest !== 'function') return;
      const inComposer = Boolean(target.closest('.saki-input-shell, [data-onboarding-id="chat-composer"]'))
        || (target.tagName === 'TEXTAREA' && !target.closest('[role="dialog"]'));
      if (!inComposer) return;

      const wasDozing = isAutoDozingRef.current;
      resetDozeTimer();
      if (wasDozing) {
        triggerTemporaryAction('wake', 3200);
      }
      setIsUserTyping(true);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => setIsUserTyping(false), 2400);
    };

    document.addEventListener('input', handleTypingActivity, true);
    document.addEventListener('keydown', handleTypingActivity, true);
    return () => {
      document.removeEventListener('input', handleTypingActivity, true);
      document.removeEventListener('keydown', handleTypingActivity, true);
    };
  }, [resetDozeTimer, triggerTemporaryAction]);

  useEffect(() => {
    if (prevGeneratingRef.current && !isGenerating && mode !== 'hidden') {
      triggerTemporaryAction('celebrate', 3400);
      showBubble(isZh ? '搞定啦~ ✨' : 'All done~ ✨', 2000);
    }
    prevGeneratingRef.current = isGenerating;
  }, [isGenerating, mode, triggerTemporaryAction, showBubble, isZh]);

  useEffect(() => {
    if (!triggerAnimation) return;
    if (triggerAnimation.type === 'stop') {
      setManualAction(null);
      return;
    }
    if (triggerAnimation.type === 'dance') {
      setManualAction('dance');
    } else if (triggerAnimation.type === 'thinking' || triggerAnimation.type === 'bartending') {
      setManualAction('think');
    } else if (triggerAnimation.type === 'hello' || triggerAnimation.type === 'presenting') {
      triggerTemporaryAction('happy', 3500);
    } else if (triggerAnimation.type === 'chuo') {
      triggerTemporaryAction('shy', 2800);
    }
  }, [triggerAnimation, triggerTemporaryAction]);

  const mappedExpression = useMemo(() => mapExpressionKey(currentExpression), [currentExpression]);

  useEffect(() => {
    const isEdgeMode = mode === 'edge-left' || mode === 'edge-right';
    const variants = isEdgeMode ? EDGE_IDLE_VARIANTS : mode === 'pet' ? FULL_IDLE_VARIANTS : DOCKED_IDLE_VARIANTS;
    const baseIdle = variants[0];
    if (!variants.includes(idleAnimName)) {
      setIdleAnimName(baseIdle);
      return undefined;
    }
    if (lowResourceMode || isGenerating || isMusicPlaying || manualAction || isAutoDozing || isUserTyping || mappedExpression !== 'normal') {
      return undefined;
    }
    if (idleAnimName !== baseIdle) {
      const returnTimer = setTimeout(() => {
        setIdleAnimName(baseIdle);
      }, MICRO_HABIT_DURATION_MS);
      return () => clearTimeout(returnTimer);
    }
    const delay = IDLE_CYCLE_MIN_MS + Math.random() * (IDLE_CYCLE_MAX_MS - IDLE_CYCLE_MIN_MS);
    const timer = setTimeout(() => {
      const candidates = variants.filter((v) => v !== baseIdle && !webpFailed[v]);
      if (candidates.length > 0) {
        setIdleAnimName(candidates[Math.floor(Math.random() * candidates.length)]);
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [mode, idleAnimName, lowResourceMode, isGenerating, isMusicPlaying, manualAction, isAutoDozing, isUserTyping, mappedExpression, webpFailed]);

  useEffect(() => {
    if (!isDragging) {
      setDragAnimName('full_drag_dangle');
      return undefined;
    }
    const startPout = Math.random() < 0.3;
    setDragAnimName(startPout ? 'full_drag_pout' : 'full_drag_dangle');
    if (startPout) {
      showBubble(isZh ? '哼！干嘛突然把人家拎起来~' : 'Hmph! Why lift me up all of a sudden~', 2200);
    }
    const timer = setTimeout(() => {
      setDragAnimName('full_drag_pout');
      showBubble(
        isZh
          ? (Math.random() < 0.5 ? '唔…快放我下来啦！' : '哼！再拎着我要生气咯 (>^<)')
          : 'Mmph... put me down already! (>^<)',
        2200,
      );
    }, 1700);
    return () => clearTimeout(timer);
  }, [isDragging, showBubble, isZh]);

  const visualAsset = useMemo(() => {
    const isEdgeMode = mode === 'edge-left' || mode === 'edge-right';
    const folder = isEdgeMode ? 'edge' : mode === 'pet' ? 'full' : 'docked';
    const prefix = isEdgeMode ? 'edge' : mode === 'pet' ? 'full' : 'docked';

    let expr = mappedExpression;
    let animName = idleAnimName.startsWith(`${prefix}_`) ? idleAnimName : `${prefix}_idle`;
    if (expr === 'normal' && IDLE_MICRO_HABIT_EXPR[animName]) {
      expr = IDLE_MICRO_HABIT_EXPR[animName];
    }

    if (isDragging) {
      expr = dragAnimName === 'full_drag_pout' ? 'drag_pout' : 'drag_dangle';
      animName = dragAnimName;
    } else if (manualAction === 'wake') {
      expr = isEdgeMode ? 'sleepy' : 'wake';
      animName = isEdgeMode ? 'edge_idle' : `${prefix}_wake`;
    } else if (manualAction === 'land') {
      expr = mode === 'pet' ? 'land' : 'normal';
      animName = mode === 'pet' ? 'full_land' : `${prefix}_idle`;
    } else if (manualAction === 'peek_in') {
      expr = isEdgeMode ? 'peek_in' : 'normal';
      animName = isEdgeMode ? 'edge_peek_in' : `${prefix}_idle`;
    } else if (manualAction === 'curious') {
      expr = isEdgeMode ? 'happy' : 'curious';
      animName = isEdgeMode ? 'edge_happy' : `${prefix}_curious`;
    } else if (manualAction === 'celebrate') {
      expr = mode === 'docked' ? 'clap' : mode === 'pet' ? 'cheer' : 'happy';
      animName = mode === 'docked' ? 'docked_clap' : mode === 'pet' ? 'full_cheer' : 'edge_happy';
    } else if (manualAction === 'peace' || manualAction === 'headpat' || manualAction === 'heart_pose') {
      if (isEdgeMode) {
        expr = manualAction === 'headpat' ? 'shy' : 'happy';
        animName = manualAction === 'headpat' ? 'edge_shy' : 'edge_happy';
      } else {
        expr = manualAction;
        animName = `${prefix}_${manualAction}`;
      }
    } else if (manualAction === 'dance' || isMusicPlaying) {
      expr = 'happy';
      animName = mode === 'pet' ? 'full_dance' : isEdgeMode ? 'edge_happy' : 'docked_idle_sway';
    } else if (manualAction === 'tap_wink' || manualAction === 'tap_wave' || manualAction === 'tap_surprise' || manualAction === 'tap_spin') {
      expr = manualAction === 'tap_surprise' ? 'shy' : 'happy';
      if (isEdgeMode) {
        animName = manualAction === 'tap_surprise' ? 'edge_shy' : 'edge_happy';
      } else if (mode === 'pet' && manualAction === 'tap_surprise') {
        animName = 'full_shy';
      } else if (mode === 'docked' && manualAction === 'tap_spin') {
        animName = 'docked_happy';
      } else {
        animName = `${prefix}_${manualAction}`;
      }
    } else if (manualAction === 'doze' || (isAutoDozing && !isGenerating && expr === 'normal')) {
      expr = 'sleepy';
      animName = `${prefix}_doze`;
    } else if (isGenerating || expr === 'think') {
      expr = 'think';
      animName = `${prefix}_think`;
    } else if (manualAction === 'shy' || expr === 'shy') {
      expr = 'shy';
      animName = `${prefix}_shy`;
    } else if (expr === 'worry') {
      expr = 'worry';
      animName = `${prefix}_worry`;
    } else if (manualAction === 'happy' || expr === 'happy') {
      expr = 'happy';
      animName = `${prefix}_happy`;
    } else if (expr === 'sleepy') {
      animName = `${prefix}_doze`;
    } else if (isUserTyping && mode === 'docked') {
      expr = 'watch_typing';
      animName = 'docked_watch_typing';
    }

    const animSrc = !lowResourceMode && !webpFailed[animName]
      ? `/assets/saki/anim/${animName}.webp?v=3`
      : null;
    const staticSrc = `/assets/saki/${folder}/${expr}.png?v=3`;

    return {
      src: animSrc || staticSrc,
      fallbackSrc: staticSrc,
      animName,
      expr,
      isAnimated: Boolean(animSrc),
    };
  }, [mode, isDragging, dragAnimName, idleAnimName, mappedExpression, manualAction, isMusicPlaying, isAutoDozing, isGenerating, isUserTyping, lowResourceMode, webpFailed]);

  const getDockedRect = useCallback(() => {
    if (dockAnchor) {
      return {
        x: clamp(dockAnchor.right - dockedWidth - dockedRightInset, 8, window.innerWidth - dockedWidth - 8),
        y: clamp(dockAnchor.top - dockedHeight + 1, 48, window.innerHeight - dockedHeight - 12),
      };
    }
    return {
      x: Math.max(8, window.innerWidth - dockedWidth - dockedRightInset),
      y: Math.max(48, window.innerHeight - dockedHeight - 96),
    };
  }, [dockAnchor, dockedWidth, dockedHeight, dockedRightInset]);

  const checkNearDockZone = useCallback((x, y) => {
    if (!dockAnchor) return false;
    const petCenterX = x + petWidth / 2;
    const petBottomY = y + petHeight;
    const withinHorizontal = petCenterX >= dockAnchor.left - 40 && petCenterX <= dockAnchor.right + 40;
    const nearTopEdge = Math.abs(petBottomY - dockAnchor.top) < DOCK_SNAP_DISTANCE_PX
      || Math.abs((y + petHeight * 0.5) - dockAnchor.top) < DOCK_SNAP_DISTANCE_PX;
    return withinHorizontal && nearTopEdge;
  }, [dockAnchor, petWidth, petHeight]);

  const handleTap = useCallback(() => {
    resetDozeTimer();
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);

    if (tapCountRef.current >= 3) {
      tapCountRef.current = 0;
      triggerTemporaryAction(mode === 'docked' ? 'tap_surprise' : 'shy', 3000);
      showBubble(isZh ? '唔…别一直戳我啦 (>///<)' : 'Hey~ stop poking me! (>///<)');
      return;
    }

    tapTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, 550);

    if (isAutoDozing || manualAction === 'doze') {
      setManualAction(null);
      triggerTemporaryAction('wake', 3400);
      showBubble(isZh ? '唔嗯…醒啦！刚刚差点睡着了~' : 'Mmph... I am awake!');
      return;
    }

    const isEdgeMode = mode === 'edge-left' || mode === 'edge-right';
    const pool = isEdgeMode ? EDGE_TAP_REACTIONS : mode === 'docked' ? DOCKED_TAP_REACTIONS : FULL_TAP_REACTIONS;
    let nextIdx = Math.floor(Math.random() * pool.length);
    if (pool.length > 1 && nextIdx === lastTapIdxRef.current) {
      nextIdx = (nextIdx + 1) % pool.length;
    }
    lastTapIdxRef.current = nextIdx;
    const pick = pool[nextIdx];
    triggerTemporaryAction(pick.action, 3200);
    showBubble(isZh ? pick.zh : pick.en);
  }, [resetDozeTimer, triggerTemporaryAction, showBubble, isZh, isAutoDozing, manualAction, mode]);

  const handlePointerDown = (event) => {
    if (event.button !== 0 && event.button !== undefined) return;
    if (event.target.closest('button')) return;

    event.preventDefault();
    resetDozeTimer();

    const isTouchPointer = event.pointerType && event.pointerType !== 'mouse';
    const currentRect = event.currentTarget.getBoundingClientRect();
    dragStateRef.current = {
      active: true,
      moved: false,
      isTouchPointer,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - currentRect.left,
      offsetY: event.clientY - currentRect.top,
      startedMode: mode,
    };

    const handleWindowMove = (moveEvent) => {
      const state = dragStateRef.current;
      if (!state.active) return;

      const dx = moveEvent.clientX - state.startX;
      const dy = moveEvent.clientY - state.startY;
      const dist = Math.hypot(dx, dy);

      if (!state.moved && dist > 10) {
        state.moved = true;
        setIsDragging(true);
        setIsTouchMenuOpen(false);
        if (state.startedMode === 'docked' || state.startedMode === 'edge-left' || state.startedMode === 'edge-right') {
          setMode('pet');
          state.offsetX = petWidth / 2;
          state.offsetY = petHeight * 0.28;
        }
      }

      if (state.moved) {
        const nextX = clamp(moveEvent.clientX - state.offsetX, 8, window.innerWidth - petWidth - 8);
        const nextY = clamp(moveEvent.clientY - state.offsetY, 48, window.innerHeight - petHeight - 8);
        setPetPos({ x: nextX, y: nextY });
        const nearDock = checkNearDockZone(nextX, nextY);
        setIsNearDockZone(nearDock);
        if (!nearDock) {
          if (nextX <= EDGE_SNAP_MARGIN_PX) {
            setNearEdgeSnap('left');
          } else if (nextX + petWidth >= window.innerWidth - EDGE_SNAP_MARGIN_PX) {
            setNearEdgeSnap('right');
          } else {
            setNearEdgeSnap(null);
          }
        } else {
          setNearEdgeSnap(null);
        }
      }
    };

    const handleWindowUp = (upEvent) => {
      window.removeEventListener('pointermove', handleWindowMove);
      window.removeEventListener('pointerup', handleWindowUp);
      window.removeEventListener('pointercancel', handleWindowUp);

      const state = dragStateRef.current;
      dragStateRef.current.active = false;
      setIsDragging(false);

      if (!state.moved) {
        handleTap();
        if (state.isTouchPointer || !window.matchMedia?.('(hover: hover)').matches) {
          setIsTouchMenuOpen((prev) => !prev);
        }
        return;
      }

      const finalX = clamp(upEvent.clientX - state.offsetX, 8, window.innerWidth - petWidth - 8);
      const finalY = clamp(upEvent.clientY - state.offsetY, 48, window.innerHeight - petHeight - 8);
      setIsNearDockZone(false);
      setNearEdgeSnap(null);

      if (checkNearDockZone(finalX, finalY)) {
        setMode('docked');
        showBubble(isZh ? '趴回对话框啦~' : 'Back on the chat box~', 1800);
      } else if (finalX <= EDGE_SNAP_MARGIN_PX) {
        setEdgeY(clamp(finalY, 56, window.innerHeight - edgeHeight - 24));
        setMode('edge-left');
        triggerTemporaryAction('peek_in', 3200);
        showBubble(isZh ? '贴在左边陪着你~' : 'Peeking from the left edge~', 2000);
      } else if (finalX + petWidth >= window.innerWidth - EDGE_SNAP_MARGIN_PX) {
        setEdgeY(clamp(finalY, 56, window.innerHeight - edgeHeight - 24));
        setMode('edge-right');
        triggerTemporaryAction('peek_in', 3200);
        showBubble(isZh ? '贴在右边偷看你~' : 'Peeking from the right edge~', 2000);
      } else {
        setMode('pet');
        triggerTemporaryAction('land', 750);
      }
    };

    window.addEventListener('pointermove', handleWindowMove);
    window.addEventListener('pointerup', handleWindowUp);
    window.addEventListener('pointercancel', handleWindowUp);
  };

  if (mode === 'hidden') {
    return (
      <button
        type="button"
        onClick={() => {
          setIsTouchMenuOpen(false);
          setMode('docked');
          showBubble(isZh ? '我回来啦~' : 'I am back~', 2000);
        }}
        className="fixed top-[calc(3.25rem+env(safe-area-inset-top))] right-3 sm:top-auto sm:bottom-5 sm:right-5 z-[95] flex items-center gap-2 rounded-full border border-[#ff75ac]/35 bg-white/85 dark:bg-[#181b28]/90 px-3 py-1.5 text-xs font-semibold text-[#ff5b9a] shadow-lg backdrop-blur-md transition hover:scale-105"
        title={isZh ? '唤出 Saki' : 'Show Saki'}
        data-onboarding-id="character-view"
      >
        <img src="/assets/saki/docked/normal.png" alt="Saki" className="h-7 w-7 rounded-full object-cover" />
        <span>Saki</span>
      </button>
    );
  }

  const dockedPos = getDockedRect();
  const isEdgeMode = mode === 'edge-left' || mode === 'edge-right';
  const activeX = mode === 'docked'
    ? dockedPos.x
    : mode === 'edge-left'
      ? 0
      : mode === 'edge-right'
        ? (typeof window !== 'undefined' ? window.innerWidth - edgeWidth : 800)
        : petPos.x;
  const activeY = mode === 'docked' ? dockedPos.y : isEdgeMode ? edgeY : petPos.y;
  const activeW = mode === 'docked' ? dockedWidth : isEdgeMode ? edgeWidth : petWidth;
  const activeH = mode === 'docked' ? dockedHeight : isEdgeMode ? edgeHeight : petHeight;
  const isMenuBarVisible = (isHovered || isTouchMenuOpen) && !isDragging;
  const resolvedDockHost = mode === 'docked'
    ? (dockHostEl?.isConnected
        ? dockHostEl
        : (typeof document !== 'undefined' ? document.querySelector('[data-saki-dock-host="true"]') : null))
    : null;
  const isDockedPortaled = mode === 'docked' && Boolean(resolvedDockHost?.isConnected);
  const placeBarOnLeft = mode === 'edge-right'
    ? true
    : mode === 'edge-left'
      ? false
      : isDockedPortaled
        ? true
        : (typeof window === 'undefined' || activeX + activeW + 56 > window.innerWidth || activeX + activeW / 2 > window.innerWidth * 0.55);

  const sakiCharacterNode = (
      <div
        ref={rootRef}
        onPointerDown={handlePointerDown}
        onMouseEnter={() => {
          if (typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches) {
            setIsHovered(true);
          }
          resetDozeTimer();
          if (
            !isDragging
            && !isGenerating
            && !manualAction
            && !isAutoDozing
            && !isUserTyping
            && mappedExpression === 'normal'
            && Date.now() - lastHoverCuriousRef.current > 14000
          ) {
            lastHoverCuriousRef.current = Date.now();
            triggerTemporaryAction('curious', 3200);
          }
        }}
        onMouseLeave={() => setIsHovered(false)}
        data-onboarding-id="character-view"
        data-saki-mode={mode}
        style={
          isDockedPortaled
            ? {
                right: dockedRightInset,
                bottom: -1,
                width: dockedWidth,
                height: dockedHeight,
                touchAction: 'none',
              }
            : {
                left: activeX,
                top: activeY,
                width: activeW,
                height: activeH,
                touchAction: 'none',
              }
        }
        className={`${
          isDockedPortaled
            ? 'pointer-events-auto absolute z-[18]'
            : `fixed ${mode === 'docked' ? 'z-[18]' : 'z-[30]'}`
        } select-none ${
          isDragging
            ? 'cursor-grabbing'
            : isDockedPortaled
              ? 'cursor-grab'
              : 'cursor-grab transition-[left,top,width,height] duration-300 ease-out'
        }`}
      >
        <AnimatePresence>
          {bubbleText && (
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.92 }}
              transition={{ duration: 0.18 }}
              className={`pointer-events-none absolute bottom-full mb-1.5 w-max max-w-[min(210px,calc(100vw-2rem))] rounded-2xl border border-[#ff75ac]/30 bg-white/95 dark:bg-[#1a1c28]/95 px-3 py-1.5 text-center text-[11px] sm:text-xs font-medium text-slate-700 dark:text-slate-100 shadow-lg backdrop-blur-md ${
                isDockedPortaled || placeBarOnLeft
                  ? 'right-0 sm:left-1/2 sm:right-auto sm:-translate-x-1/2'
                  : 'left-1/2 -translate-x-1/2'
              }`}
            >
              {bubbleText}
              <div className={`absolute top-full border-x-[6px] border-t-[6px] border-x-transparent border-t-white/95 dark:border-t-[#1a1c28]/95 ${
                isDockedPortaled || placeBarOnLeft
                  ? 'right-6 sm:left-1/2 sm:right-auto sm:-translate-x-1/2'
                  : 'left-1/2 -translate-x-1/2'
              }`} />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isMenuBarVisible && (
            <motion.div
              initial={{ opacity: 0, x: placeBarOnLeft ? 4 : -4, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: placeBarOnLeft ? 4 : -4, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className={`absolute z-20 ${
                mode === 'docked' ? 'bottom-1' : 'top-1/2 -translate-y-1/2'
              } ${
                mode === 'pet'
                  ? (placeBarOnLeft ? 'right-[calc(100%-44px)] pr-1.5' : 'left-[calc(100%-44px)] pl-1.5')
                  : isEdgeMode
                    ? (placeBarOnLeft ? 'right-[calc(100%-56px)] pr-1.5' : 'left-[calc(100%-56px)] pl-1.5')
                    : (placeBarOnLeft ? 'right-full pr-1.5' : 'left-full pl-1.5')
              }`}
            >
              <div className="flex flex-col items-center gap-0.5 rounded-full border border-white/40 dark:border-white/15 bg-white/90 dark:bg-[#181b28]/90 px-1 py-1.5 shadow-xl backdrop-blur-md">
              <button
                type="button"
                onClick={() => {
                  triggerTemporaryAction('heart_pose', 3800);
                  showBubble(isZh ? '给你比个大大的心~ ♡' : 'Sending you a big heart~ ♡', 2000);
                }}
                className={`rounded-full p-1 hover:bg-[#ff75ac]/15 hover:text-[#ff5b9a] ${
                  manualAction === 'heart_pose' ? 'bg-[#ff75ac]/15 text-[#ff5b9a]' : 'text-slate-600 dark:text-slate-200'
                }`}
                title={isZh ? '双手比心' : 'Heart Pose'}
              >
                <Heart size={13} />
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerTemporaryAction('peace', 3800);
                  showBubble(isZh ? '耶~ 咔嚓！可爱满分 ✌️' : 'Peace~ Snap! Cute 100% ✌️', 2000);
                }}
                className={`rounded-full p-1 hover:bg-[#ff75ac]/15 hover:text-[#ff5b9a] ${
                  manualAction === 'peace' ? 'bg-[#ff75ac]/15 text-[#ff5b9a]' : 'text-slate-600 dark:text-slate-200'
                }`}
                title={isZh ? '比耶卖萌' : 'Peace Sign'}
              >
                <Sparkles size={13} />
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerTemporaryAction('headpat', 3800);
                  showBubble(isZh ? '唔嗯~ 被摸摸头好舒服呀 🥰' : 'Mmph~ Headpats feel so cozy 🥰', 2200);
                }}
                className={`rounded-full p-1 hover:bg-[#ff75ac]/15 hover:text-[#ff5b9a] ${
                  manualAction === 'headpat' ? 'bg-[#ff75ac]/15 text-[#ff5b9a]' : 'text-slate-600 dark:text-slate-200'
                }`}
                title={isZh ? '摸摸头' : 'Headpat'}
              >
                <Smile size={13} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setManualAction((prev) => (prev === 'doze' ? null : 'doze'));
                  if (manualAction !== 'doze') showBubble(isZh ? '呼…打个盹…' : 'Zzz...', 2000);
                }}
                className={`rounded-full p-1 hover:bg-[#ff75ac]/15 hover:text-[#ff5b9a] ${
                  manualAction === 'doze' || isAutoDozing ? 'bg-[#ff75ac]/15 text-[#ff5b9a]' : 'text-slate-600 dark:text-slate-200'
                }`}
                title={isZh ? '打盹' : 'Doze'}
              >
                <Moon size={13} />
              </button>
              {mode === 'pet' && (
                <button
                  type="button"
                  onClick={() => setManualAction((prev) => (prev === 'dance' ? null : 'dance'))}
                  className={`rounded-full p-1 hover:bg-[#ff75ac]/15 hover:text-[#ff5b9a] ${
                    manualAction === 'dance' ? 'bg-[#ff75ac]/15 text-[#ff5b9a]' : 'text-slate-600 dark:text-slate-200'
                  }`}
                  title={isZh ? '跳舞' : 'Dance'}
                >
                  <Music size={13} />
                </button>
              )}
              {mode === 'docked' ? (
                <button
                  type="button"
                  onClick={() => {
                    const start = getDockedRect();
                    setPetPos({
                      x: clamp(start.x - 16, 8, window.innerWidth - petWidth - 8),
                      y: clamp(start.y - 120, 56, window.innerHeight - petHeight - 8),
                    });
                    setMode('pet');
                    showBubble(isZh ? '变身全身桌宠！' : 'Full-body pet mode!', 2000);
                  }}
                  className="rounded-full p-1 text-slate-600 dark:text-slate-200 hover:bg-[#ff75ac]/15 hover:text-[#ff5b9a]"
                  title={isZh ? '变成全身桌宠' : 'Pop out as desktop pet'}
                >
                  <Move size={13} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMode('docked');
                    setManualAction(null);
                    showBubble(isZh ? '趴回对话框啦~' : 'Docked on chat box~', 1800);
                  }}
                  className="rounded-full p-1 text-slate-600 dark:text-slate-200 hover:bg-[#ff75ac]/15 hover:text-[#ff5b9a]"
                  title={isZh ? '趴回对话框' : 'Dock on chat box'}
                >
                  <ArrowDownToLine size={13} />
                </button>
              )}
              <button
                type="button"
                onClick={() => setMode('hidden')}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-200/60 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-white"
                title={isZh ? '暂时收起' : 'Hide Saki'}
              >
                <EyeOff size={13} />
              </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative flex h-full w-full items-end justify-center">
          <img
            src={visualAsset.src}
            alt="Saki"
            draggable={false}
            onError={() => {
              if (visualAsset.animName) {
                setWebpFailed((prev) => ({ ...prev, [visualAsset.animName]: true }));
              }
            }}
            className={`h-full w-full object-contain drop-shadow-[0_8px_16px_rgba(15,23,42,0.18)] ${
              mode === 'edge-left' ? 'scale-x-[-1]' : ''
            }`}
          />
        </div>
      </div>
  );

  // Only suppress during a zero-composer swap tick so docked Saki never disappears while the chat box is visible.
  const hasLiveComposer = Boolean(
    isDockedPortaled
    || (typeof document !== 'undefined' && document.querySelector('[data-onboarding-id="chat-composer"], .saki-input-shell'))
  );
  const renderedSakiNode = mode === 'docked' && dockHostEl !== undefined
    ? (isDockedPortaled ? createPortal(sakiCharacterNode, resolvedDockHost) : (hasLiveComposer ? sakiCharacterNode : null))
    : sakiCharacterNode;

  return (
    <>
      <AnimatePresence>
        {isDragging && isNearDockZone && dockAnchor && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed z-[90] rounded-2xl border-2 border-dashed border-[#ff75ac] bg-[#ff75ac]/10 shadow-[0_0_24px_rgba(255,117,172,0.28)]"
            style={{
              left: dockAnchor.left,
              top: dockAnchor.top - 4,
              width: dockAnchor.width,
              height: dockAnchor.bottom - dockAnchor.top + 8,
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isDragging && nearEdgeSnap && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`pointer-events-none fixed top-16 bottom-6 z-[90] w-6 border-2 border-dashed border-[#ff75ac] bg-[#ff75ac]/15 shadow-[0_0_24px_rgba(255,117,172,0.28)] ${
              nearEdgeSnap === 'left' ? 'left-0 rounded-r-2xl border-l-0' : 'right-0 rounded-l-2xl border-r-0'
            }`}
          />
        )}
      </AnimatePresence>

      {renderedSakiNode}
    </>
  );
};

export default CharacterView;
