import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Minimize2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  loadAnimationPlaybackFrames,
  releaseAllAnimationPlaybackFrames,
  schedulePersistentAnimationWarmup,
} from '../utils/characterAnimationCache';

const MOBILE_BREAKPOINT = 768;
const DEFAULT_ANIMATION_FPS = 24;
const IDLE_ANIMATION_TYPE = 'idle_breath';
const IDLE_VARIANT_ANIMATION_TYPES = ['idle_lookaround'];
const IDLE_VARIANT_MIN_DELAY_MS = 12000;
const IDLE_VARIANT_MAX_DELAY_MS = 22000;
const ANIMATION_PLAYBACK_FPS = {
  drinking: 12,
  idle_breath: 12,
  idle_lookaround: 12,
};

const isIdleAnimationType = (type) => (
  type === IDLE_ANIMATION_TYPE || IDLE_VARIANT_ANIMATION_TYPES.includes(type)
);

const getIdleVariantDelay = () => (
  IDLE_VARIANT_MIN_DELAY_MS
  + Math.random() * (IDLE_VARIANT_MAX_DELAY_MS - IDLE_VARIANT_MIN_DELAY_MS)
);

const getAnimationFrameDuration = (type) => {
  const fps = ANIMATION_PLAYBACK_FPS[type] || DEFAULT_ANIMATION_FPS;
  return 1000 / fps;
};

const CharacterView = ({ currentExpression, isOpen, setIsOpen, triggerAnimation }) => {
  const { t } = useTranslation();
  const expressionUrl = `/assets/expression/${currentExpression || 'normal.png'}`;
  const phoneUrl = '/assets/Phone.png';
  const [clickCount, setClickCount] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showAngry, setShowAngry] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < MOBILE_BREAKPOINT);
  const [isDesktopHovered, setIsDesktopHovered] = useState(false);
  const [displayedImageSrc, setDisplayedImageSrc] = useState(expressionUrl);
  const clickTimerRef = useRef(null);
  const clickCountRef = useRef(0);
  const animationRequestRef = useRef(null);
  const startTimeRef = useRef(null);
  const animationRunIdRef = useRef(0);
  const lastRenderedFrameRef = useRef(-1);
  const activeAnimationTypeRef = useRef(null);
  const idleVariantTimerRef = useRef(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isAnimating) {
      setDisplayedImageSrc(expressionUrl);
    }
  }, [expressionUrl, isAnimating]);

  useEffect(() => {
    schedulePersistentAnimationWarmup();
  }, []);

  useEffect(() => {
    if (!triggerAnimation) return;
    if (triggerAnimation.type === 'stop') {
      stopAnimation({ resumeIdle: triggerAnimation.resumeIdle !== false });
      return;
    }
    startSequenceAnimation(triggerAnimation.type || 'hello', triggerAnimation.loop || false);
  }, [triggerAnimation]);

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      if (idleVariantTimerRef.current) clearTimeout(idleVariantTimerRef.current);
      if (animationRequestRef.current) cancelAnimationFrame(animationRequestRef.current);
      animationRunIdRef.current += 1;
      releaseAllAnimationPlaybackFrames();
    };
  }, []);

  const handleCharacterTap = (event) => {
    event.stopPropagation();
    if (!isOpen) {
      setIsOpen(true);
      return;
    }
    handleClick();
  };

  const handleClick = () => {
    setShowAngry(true);
    setTimeout(() => setShowAngry(false), 1000);

    const nextCount = clickCountRef.current + 1;
    clickCountRef.current = nextCount;
    setClickCount(nextCount);

    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);

    if (nextCount >= 3) {
      startSequenceAnimation('chuo', false);
      clickCountRef.current = 0;
      setClickCount(0);
    } else {
      clickTimerRef.current = setTimeout(() => {
        clickCountRef.current = 0;
        setClickCount(0);
      }, 500);
    }
  };

  const clearIdleVariantTimer = () => {
    if (idleVariantTimerRef.current) {
      clearTimeout(idleVariantTimerRef.current);
      idleVariantTimerRef.current = null;
    }
  };

  const scheduleIdleVariant = () => {
    clearIdleVariantTimer();
    if (!IDLE_VARIANT_ANIMATION_TYPES.length) return;

    idleVariantTimerRef.current = setTimeout(() => {
      if (activeAnimationTypeRef.current !== IDLE_ANIMATION_TYPE) return;
      startSequenceAnimation(IDLE_VARIANT_ANIMATION_TYPES[0], false, {
        resumeIdle: true,
        idleVariant: true,
      });
    }, getIdleVariantDelay());
  };

  const startIdleAnimation = () => {
    startSequenceAnimation(IDLE_ANIMATION_TYPE, true, {
      resumeIdle: false,
      idleLoop: true,
    });
  };

  const stopAnimation = ({ resumeIdle = false } = {}) => {
    clearIdleVariantTimer();
    animationRunIdRef.current += 1;
    activeAnimationTypeRef.current = null;
    setIsAnimating(false);
    lastRenderedFrameRef.current = -1;
    if (animationRequestRef.current) {
      cancelAnimationFrame(animationRequestRef.current);
      animationRequestRef.current = null;
    }
    setDisplayedImageSrc(expressionUrl);

    if (resumeIdle) {
      const stoppedRunId = animationRunIdRef.current;
      requestAnimationFrame(() => {
        if (animationRunIdRef.current === stoppedRunId && !activeAnimationTypeRef.current) {
          startIdleAnimation();
        }
      });
    }
  };

  const startSequenceAnimation = async (type = 'chuo', loop = false, options = {}) => {
    const normalizedType = type || 'hello';
    const shouldResumeIdle = options.resumeIdle !== false && !loop;
    const isIdleLoop = options.idleLoop || normalizedType === IDLE_ANIMATION_TYPE;
    const runId = animationRunIdRef.current + 1;
    animationRunIdRef.current = runId;
    activeAnimationTypeRef.current = normalizedType;
    clearIdleVariantTimer();

    if (animationRequestRef.current) {
      cancelAnimationFrame(animationRequestRef.current);
      animationRequestRef.current = null;
    }

    lastRenderedFrameRef.current = -1;

    try {
      const frames = await loadAnimationPlaybackFrames(normalizedType);
      if (!frames.length || animationRunIdRef.current !== runId) {
        return;
      }

      setIsAnimating(true);
      setDisplayedImageSrc(frames[0].src);

      const frameDuration = getAnimationFrameDuration(normalizedType);
      startTimeRef.current = performance.now();

      const animate = (time) => {
        if (animationRunIdRef.current !== runId) {
          return;
        }

        const elapsed = time - startTimeRef.current;
        const currentFrame = Math.floor(elapsed / frameDuration);

        if (!loop && currentFrame >= frames.length) {
          if (shouldResumeIdle || isIdleAnimationType(normalizedType)) {
            startIdleAnimation();
          } else {
            stopAnimation({ resumeIdle: false });
          }
          return;
        }

        const frameIndex = loop ? currentFrame % frames.length : currentFrame;

        if (frameIndex !== lastRenderedFrameRef.current) {
          const frame = frames[frameIndex];
          if (frame) {
            setDisplayedImageSrc(frame.src);
            lastRenderedFrameRef.current = frameIndex;
          }
        }

        animationRequestRef.current = requestAnimationFrame(animate);
      };

      if (isIdleLoop) {
        scheduleIdleVariant();
      }

      animationRequestRef.current = requestAnimationFrame(animate);
    } catch (error) {
      console.warn(`Failed to start character animation "${normalizedType}".`, error);
      if (animationRunIdRef.current === runId) {
        stopAnimation({ resumeIdle: !isIdleAnimationType(normalizedType) });
      }
    }
  };

  const CharacterDisplay = ({ compact = false, mobile = false }) => (
    <div
      className={`relative ${
        compact ? 'h-[94px] w-[94px]' : mobile ? 'h-[460px] w-full' : 'h-[590px] w-full'
      } bg-contain bg-center bg-no-repeat`}
      style={!compact ? { backgroundImage: `url(${phoneUrl})` } : undefined}
    >
      {showAngry && !compact && (
        <div className="pointer-events-none absolute left-[20%] top-1/4 z-10 -translate-x-1/2 -translate-y-10 animate-bounce">
          <img src="/assets/angry_qipao.png" alt="Angry" className="h-16 w-16 object-contain" />
        </div>
      )}
      <div className={`absolute inset-0 flex items-center justify-center overflow-hidden ${compact ? '' : 'pointer-events-none'}`}>
        <img
          src={displayedImageSrc}
          alt="Character"
          className={
            compact
              ? 'h-[86%] w-auto object-contain drop-shadow-xl'
              : mobile
                ? 'pointer-events-auto max-h-[38%] w-auto scale-[1.1] transform object-contain'
                : 'pointer-events-auto max-h-[46%] w-auto scale-[1.28] transform object-contain'
          }
          decoding="sync"
          loading="eager"
          fetchpriority="high"
          draggable={false}
          onClick={handleCharacterTap}
          onError={(event) => {
            event.target.src = '/assets/expression/normal.png';
          }}
        />
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <motion.div
        drag
        dragMomentum={false}
        className={`fixed bottom-24 right-4 z-[100] ${isOpen ? 'w-40' : 'w-[94px]'} touch-none`}
        data-onboarding-id="character-view"
      >
        {isOpen ? (
          <div className="relative w-full" onClick={() => setIsOpen(false)}>
            <CharacterDisplay mobile />
          </div>
        ) : (
          <button
            onClick={() => setIsOpen(true)}
            className="overflow-hidden rounded-full border border-white/30 bg-white/18 p-1 shadow-2xl backdrop-blur-md"
            title={t('video_call')}
          >
            <CharacterDisplay compact />
          </button>
        )}
      </motion.div>
    );
  }

  if (!isOpen) {
    return (
      <motion.button
        drag
        dragMomentum={false}
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-[95] overflow-hidden rounded-full border border-white/30 bg-white/20 p-1 shadow-2xl backdrop-blur-md"
        data-onboarding-id="character-view"
        title={t('video_call')}
      >
        <CharacterDisplay compact />
      </motion.button>
    );
  }

  return (
    <motion.div
      drag
      dragMomentum={false}
      className="fixed right-6 top-20 z-[95] w-[320px] cursor-grab active:cursor-grabbing"
      data-onboarding-id="character-view"
    >
      <button
        onClick={() => setIsOpen(false)}
        className={`absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/75 text-gray-600 shadow-lg backdrop-blur-md transition hover:bg-white hover:text-gray-900 ${
          isDesktopHovered ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        title={t('video_call')}
      >
        <Minimize2 size={16} />
      </button>

      <div
        className="w-full"
        onMouseEnter={() => setIsDesktopHovered(true)}
        onMouseLeave={() => setIsDesktopHovered(false)}
      >
        <CharacterDisplay />
      </div>
    </motion.div>
  );
};

export default CharacterView;
