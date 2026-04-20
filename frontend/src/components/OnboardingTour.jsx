import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';

function clamp(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function createViewportState() {
  if (typeof window === 'undefined') {
    return { width: 1280, height: 800 };
  }
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

export default function OnboardingTour({
  isOpen,
  steps = [],
  stepIndex = 0,
  onNext,
  onSkip,
  labels,
  refreshToken,
}) {
  const step = steps[stepIndex] || null;
  const bubbleRef = useRef(null);
  const [targetRect, setTargetRect] = useState(null);
  const [viewport, setViewport] = useState(createViewportState);
  const [bubbleHeight, setBubbleHeight] = useState(0);

  useEffect(() => {
    if (!isOpen || !step?.selector) {
      setTargetRect(null);
      return undefined;
    }

    let animationFrame = null;
    let resizeObserver = null;
    const timeoutIds = [];

    const measure = () => {
      const element = document.querySelector(step.selector);
      setViewport(createViewportState());

      if (!element) {
        setTargetRect(null);
        return;
      }

      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        setTargetRect(null);
        return;
      }

      setTargetRect({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      });
    };

    const requestMeasure = () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(measure);
    };

    requestMeasure();
    [120, 260, 420].forEach((delay) => {
      timeoutIds.push(window.setTimeout(requestMeasure, delay));
    });

    const element = document.querySelector(step.selector);
    if (element && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(requestMeasure);
      resizeObserver.observe(element);
    }

    window.addEventListener('resize', requestMeasure);
    window.addEventListener('scroll', requestMeasure, true);

    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      timeoutIds.forEach((id) => window.clearTimeout(id));
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', requestMeasure);
      window.removeEventListener('scroll', requestMeasure, true);
    };
  }, [isOpen, step?.selector, refreshToken]);

  useEffect(() => {
    if (!isOpen) {
      setBubbleHeight(0);
      return undefined;
    }

    const measureBubble = () => {
      if (!bubbleRef.current) return;
      const rect = bubbleRef.current.getBoundingClientRect();
      setBubbleHeight(rect.height);
    };

    const animationFrame = requestAnimationFrame(measureBubble);
    window.addEventListener('resize', measureBubble);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', measureBubble);
    };
  }, [isOpen, stepIndex, viewport.width]);

  const layout = useMemo(() => {
    const bubbleWidth = Math.min(360, Math.max(220, viewport.width - 32), viewport.width - 16);
    const measuredBubbleHeight = bubbleHeight || 220;

    if (!targetRect) {
      return {
        bubbleLeft: clamp((viewport.width - bubbleWidth) / 2, 16, Math.max(16, viewport.width - bubbleWidth - 16)),
        bubbleTop: clamp((viewport.height - measuredBubbleHeight) / 2, 24, Math.max(24, viewport.height - measuredBubbleHeight - 24)),
        bubbleWidth,
        highlightRect: null,
      };
    }

    const padding = step?.padding ?? 14;
    const highlightWidth = clamp(targetRect.width + padding * 2, 48, viewport.width - 20);
    const highlightHeight = clamp(targetRect.height + padding * 2, 48, viewport.height - 20);
    const highlightRect = {
      left: clamp(targetRect.left - padding, 10, Math.max(10, viewport.width - highlightWidth - 10)),
      top: clamp(targetRect.top - padding, 10, Math.max(10, viewport.height - highlightHeight - 10)),
      width: highlightWidth,
      height: highlightHeight,
      borderRadius: step?.radius ?? 28,
    };

    const placeAbove = highlightRect.top > viewport.height * 0.55;
    const bubbleTop = placeAbove
      ? clamp(highlightRect.top - measuredBubbleHeight - 18, 16, viewport.height - measuredBubbleHeight - 16)
      : clamp(highlightRect.top + highlightRect.height + 18, 16, viewport.height - measuredBubbleHeight - 16);
    const bubbleLeft = clamp(
      highlightRect.left + highlightRect.width / 2 - bubbleWidth / 2,
      16,
      Math.max(16, viewport.width - bubbleWidth - 16)
    );

    return {
      bubbleLeft,
      bubbleTop,
      bubbleWidth,
      highlightRect,
    };
  }, [bubbleHeight, step, targetRect, viewport.height, viewport.width]);

  if (!step) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="onboarding-tour"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.24 }}
          className="fixed inset-0 z-[170] pointer-events-auto"
        >
          {layout.highlightRect ? (
            <motion.div
              key={step.id}
              initial={{ opacity: 0.9, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0.9, scale: 0.98 }}
              transition={{ duration: 0.22 }}
              className="pointer-events-none absolute border border-white/70 bg-transparent shadow-[0_0_0_9999px_rgba(2,6,23,0.78),0_0_0_1px_rgba(255,255,255,0.35),0_0_42px_rgba(56,189,248,0.22)]"
              style={{
                borderRadius: `${layout.highlightRect.borderRadius}px`,
                height: `${layout.highlightRect.height}px`,
                left: `${layout.highlightRect.left}px`,
                top: `${layout.highlightRect.top}px`,
                width: `${layout.highlightRect.width}px`,
              }}
            />
          ) : (
            <div className="absolute inset-0 bg-slate-950/78" />
          )}

          <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
            <button
              type="button"
              onClick={onSkip}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/40 px-4 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur-md transition-colors hover:bg-black/55"
            >
              <X size={15} />
              <span>{labels.skip}</span>
            </button>
          </div>

          <motion.div
            key={`bubble-${step.id}`}
            ref={bubbleRef}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            className="absolute overflow-hidden rounded-[1.85rem] border border-white/15 bg-slate-950/88 text-white shadow-[0_24px_80px_rgba(15,23,42,0.45)] backdrop-blur-xl"
            style={{
              left: `${layout.bubbleLeft}px`,
              top: `${layout.bubbleTop}px`,
              width: `${layout.bubbleWidth}px`,
            }}
          >
            <div className="border-b border-white/10 bg-white/[0.03] px-5 py-4">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-200/90">
                <Sparkles size={14} />
                <span>{labels.badge}</span>
              </div>
              <h3 className="mt-3 text-lg font-semibold tracking-tight text-white">{step.title}</h3>
            </div>

            <div className="px-5 py-4">
              <p className="text-sm leading-7 text-slate-200/88">{step.description}</p>

              <div className="mt-5 flex items-center justify-between gap-3">
                <div className="text-xs font-medium text-slate-400">
                  {labels.progressPrefix} {stepIndex + 1} / {steps.length}
                </div>
                <button
                  type="button"
                  onClick={onNext}
                  className="inline-flex items-center rounded-full bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-sky-300"
                >
                  {labels.next}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
