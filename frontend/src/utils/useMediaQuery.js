import { useState, useEffect } from 'react';

/**
 * 响应式媒体查询统一 Hook
 * 避免多个组件重复绑定 window resize 事件导致强制重排与 CPU 损耗
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQueryList = window.matchMedia(query);
    const listener = (event) => setMatches(event.matches);

    // 现代浏览器支持 addEventListener，兼容老版 Safari addListener
    if (mediaQueryList.addEventListener) {
      mediaQueryList.addEventListener('change', listener);
    } else {
      mediaQueryList.addListener(listener);
    }

    setMatches(mediaQueryList.matches);

    return () => {
      if (mediaQueryList.removeEventListener) {
        mediaQueryList.removeEventListener('change', listener);
      } else {
        mediaQueryList.removeListener(listener);
      }
    };
  }, [query]);

  return matches;
}

export const MOBILE_BREAKPOINT_QUERY = '(max-width: 767px)';

export function useIsMobile() {
  return useMediaQuery(MOBILE_BREAKPOINT_QUERY);
}
