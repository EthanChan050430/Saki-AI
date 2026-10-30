/**
 * SSE 流式数据帧缓冲调度器
 * 将高频的小分片（几十赫兹的单个字符/词语）合并到浏览器的 requestAnimationFrame 周期，
 * 避免频繁调用 setMessages 导致 React 树大规模重排与掉帧。
 */
export function createStreamUpdateScheduler(onFlush) {
  let rafId = null;
  let isPending = false;

  const schedule = () => {
    isPending = true;
    if (!rafId && typeof window !== 'undefined') {
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        if (isPending) {
          isPending = false;
          onFlush();
        }
      });
    }
  };

  const flushNow = () => {
    if (rafId && typeof window !== 'undefined') {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (isPending) {
      isPending = false;
      onFlush();
    }
  };

  const cancel = () => {
    if (rafId && typeof window !== 'undefined') {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
    isPending = false;
  };

  return { schedule, flushNow, cancel };
}

/**
 * 遍历 Response Stream 并按 SSE 数据行派发事件
 */
export async function readSSEStream(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let stopReceived = false;
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const dataStr = trimmed.slice(6).trim();
        if (dataStr === '[DONE]') {
          stopReceived = true;
          break;
        }

        try {
          const payload = JSON.parse(dataStr);
          const shouldStop = await onEvent(payload);
          if (shouldStop) {
            stopReceived = true;
            break;
          }
        } catch (e) {
          console.warn('[SSE] Failed to parse message line:', trimmed, e);
        }
      }

      if (stopReceived) break;
    }
  } finally {
    reader.releaseLock?.();
  }
}
