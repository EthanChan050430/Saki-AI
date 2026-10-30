import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { parseTurns } from '../utils/chatTurnParser.js';

export { parseTurns };

export default function ChatTurnNavigator({
  messages = [],
  containerRef,
  minTurns = 3,
}) {
  const [activeTurnIndex, setActiveTurnIndex] = useState(0);
  const [hoveredTurnIndex, setHoveredTurnIndex] = useState(null);
  const [isHovered, setIsHovered] = useState(false);
  const leaveTimerRef = useRef(null);
  const activeItemRef = useRef(null);
  const listContainerRef = useRef(null);

  // Parse turns from messages
  const turns = useMemo(() => parseTurns(messages), [messages]);

  // Track active turn based on container scroll position
  useEffect(() => {
    const container = containerRef?.current;
    if (!container || turns.length === 0) return;

    let ticking = false;

    const updateActiveTurn = () => {
      const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;
      if (isAtBottom) {
        setActiveTurnIndex(turns.length - 1);
        ticking = false;
        return;
      }

      const containerRect = container.getBoundingClientRect();
      let activeIdx = 0;

      for (let i = 0; i < turns.length; i++) {
        const el = document.getElementById(turns[i].domId);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        // The message is considered active if it reaches upper-middle of viewport
        if (rect.top <= containerRect.top + containerRect.height * 0.45) {
          activeIdx = i;
        }
      }
      setActiveTurnIndex(activeIdx);
      ticking = false;
    };

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateActiveTurn);
        ticking = true;
      }
    };

    updateActiveTurn();

    container.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [turns, containerRef]);

  // Scroll active item into view inside preview popup when opened
  useEffect(() => {
    if (isHovered && activeItemRef.current && listContainerRef.current) {
      activeItemRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isHovered]);

  const handleMouseEnter = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
    }
    leaveTimerRef.current = setTimeout(() => {
      setIsHovered(false);
      setHoveredTurnIndex(null);
    }, 220);
  }, []);

  const scrollToTurn = useCallback(
    (turn) => {
      const container = containerRef?.current;
      const el = document.getElementById(turn.domId);
      if (!container || !el) return;

      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const targetScrollTop = container.scrollTop + (elRect.top - containerRect.top) - 24;

      container.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth',
      });

      setActiveTurnIndex(turn.turnIndex);
      setIsHovered(false);
      setHoveredTurnIndex(null);

      // Momentary subtle highlight pulse on the target message
      el.classList.remove('saki-message-highlight');
      void el.offsetWidth; // trigger reflow
      el.classList.add('saki-message-highlight');
      setTimeout(() => {
        el.classList.remove('saki-message-highlight');
      }, 1900);
    },
    [containerRef]
  );

  // If conversation count is below threshold, do not display
  if (turns.length < minTurns) {
    return null;
  }

  return (
    <div
      className="hidden sm:flex absolute right-2 sm:right-3.5 top-1/2 -translate-y-1/2 z-30 select-none pointer-events-none"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      data-testid="chat-turn-navigator"
    >
      <div className="relative flex items-center justify-end pointer-events-auto">
        {/* Floating Preview Popover Card */}
        <div
          className={`absolute right-full pr-2.5 top-1/2 -translate-y-1/2 transition-all duration-200 origin-right ${
            isHovered
              ? 'opacity-100 scale-100 pointer-events-auto translate-x-0'
              : 'opacity-0 scale-95 pointer-events-none translate-x-1.5'
          }`}
        >
          <div className="w-[300px] sm:w-[340px] max-w-[calc(100vw-5rem)] rounded-2xl bg-white/95 dark:bg-[#181922]/95 backdrop-blur-2xl border border-[#ff75ac]/25 dark:border-white/10 shadow-[0_16px_48px_rgba(255,117,172,0.18)] dark:shadow-[0_20px_56px_rgba(0,0,0,0.55)] p-2">
            <div
              ref={listContainerRef}
              className="flex flex-col gap-0.5 max-h-[min(480px,70vh)] overflow-y-auto custom-scrollbar pr-0.5"
            >
              {turns.map((turn, idx) => {
                const isHoveredItem = hoveredTurnIndex === idx;
                const isActiveItem = activeTurnIndex === idx;
                const hasDiff = turn.added > 0 || turn.removed > 0;

                return (
                  <button
                    key={turn.msgId}
                    ref={isActiveItem ? activeItemRef : null}
                    type="button"
                    onClick={() => scrollToTurn(turn)}
                    onMouseEnter={() => setHoveredTurnIndex(idx)}
                    className={`group flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-left transition-all duration-150 cursor-pointer w-full border ${
                      isHoveredItem
                        ? 'bg-[#ff75ac]/15 dark:bg-[#ff75ac]/20 text-[#b92761] dark:text-[#ff9bc8] border-[#ff75ac]/35 shadow-sm font-medium'
                        : isActiveItem && hoveredTurnIndex === null
                        ? 'bg-[#ff75ac]/10 dark:bg-[#ff75ac]/15 text-[#b92761] dark:text-[#ff9bc8] border-[#ff75ac]/25 font-medium'
                        : 'border-transparent text-[var(--text-dark)] hover:bg-[#ff75ac]/8 dark:hover:bg-white/[0.05] hover:text-[#b92761] dark:hover:text-[#ff9bc8]'
                    }`}
                    title={turn.previewText}
                  >
                    <span className="truncate text-xs sm:text-[13px] leading-normal flex-1 min-w-0 font-normal">
                      {turn.previewText}
                    </span>
                    {hasDiff && (
                      <div className="shrink-0 flex items-center gap-1.5 text-xs font-mono select-none pl-1">
                        {turn.added > 0 && (
                          <span className="saki-code-added font-semibold font-mono">
                            +{turn.added}
                          </span>
                        )}
                        {turn.removed > 0 && (
                          <span className="saki-code-removed font-semibold font-mono">
                            −{turn.removed}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Vertical Dots Rail Strip */}
        <div
          className={`flex flex-col items-center gap-2 py-2 px-1 rounded-full transition-all duration-200 cursor-pointer max-h-[calc(100vh-12rem)] overflow-y-auto no-scrollbar ${
            isHovered
              ? 'bg-white/80 dark:bg-[#181922]/90 shadow-[0_4px_16px_rgba(255,117,172,0.15)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.5)] backdrop-blur-xl px-1.5 py-2.5 border border-[#ff75ac]/25 dark:border-white/10'
              : 'bg-transparent'
          }`}
        >
          {turns.map((turn, idx) => {
            const isActive = activeTurnIndex === idx;
            const isHoveredDot = hoveredTurnIndex === idx;

            let dotClass = 'bg-slate-400/70 dark:bg-white/25';
            if (isActive && isHoveredDot) {
              dotClass =
                'bg-[#ff75ac] shadow-[0_0_12px_rgba(255,117,172,0.85)] scale-125 ring-2 ring-[#ff75ac]/40';
            } else if (isActive) {
              dotClass =
                'bg-[#ff75ac] shadow-[0_0_10px_rgba(255,117,172,0.7)] scale-110';
            } else if (isHoveredDot) {
              dotClass = 'bg-[#ff75ac]/80 dark:bg-[#ff9bc8] scale-125 shadow-[0_0_6px_rgba(255,117,172,0.5)]';
            }

            return (
              <button
                key={turn.msgId}
                type="button"
                onClick={() => scrollToTurn(turn)}
                onMouseEnter={() => setHoveredTurnIndex(idx)}
                className="group relative p-1 focus:outline-none flex items-center justify-center cursor-pointer"
                aria-label={`跳转到第 ${idx + 1} 轮对话: ${turn.previewText}`}
                title={turn.previewText}
              >
                <div
                  className={`w-2 h-2 rounded-full transition-all duration-150 ${dotClass}`}
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
