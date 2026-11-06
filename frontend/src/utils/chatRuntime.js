// Identity (not chat ID) distinguishes A -> B -> A and repeated loads of A.
export function createEpochGuard() {
  let epoch = 0;
  return {
    invalidate() { epoch += 1; },
    capture() {
      const captured = epoch;
      return () => captured === epoch;
    },
  };
}

export async function loadChatSnapshot({ isCurrent, loadHistory, applyHistory, loadRunning, applyRunning, onError }) {
  try {
    const history = await loadHistory();
    if (!isCurrent()) return;
    applyHistory(history);
    if (!isCurrent()) return;
    const running = await loadRunning();
    if (!isCurrent()) return;
    applyRunning(running);
  } catch (error) {
    if (isCurrent()) onError(error);
  }
}

export function readCachedConfig(storage) {
  try { return JSON.parse(storage.getItem('agent_config') || 'null'); }
  catch { return null; }
}

export function cacheConfig(config, storage) {
  try { storage.setItem('agent_config', JSON.stringify(config)); }
  catch { /* Cache is optional; backend persistence must still run. */ }
}

export function persistConfig(config, storage, saveBackend) {
  cacheConfig(config, storage);
  return saveBackend(config);
}

export function getDispatchConfig(configRef, options = {}) {
  const config = configRef.current;
  return { ...config, workspacePath: options.workspacePath ?? config.workspacePath ?? '' };
}

export function applyStreamingActions(message, event = {}, terminal = false) {
  const streamingActions = terminal || event.action
    ? []
    : (Array.isArray(event.streamingActions) ? event.streamingActions : (message.streamingActions || []));
  return { ...message, streamingActions };
}