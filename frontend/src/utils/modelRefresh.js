export function mergeModelCatalog(fresh, cached, refreshedProviders) {
  return [...fresh, ...cached.filter(model => !refreshedProviders.has(model.provider))];
}

export function startModelRefresh({ refresh, onError, window, document, intervalMs = 60000, delayMs = 250 }) {
  let stopped = false;
  let running = false;
  const run = async () => {
    if (stopped || running || document.visibilityState === 'hidden') return;
    running = true;
    try {
      await refresh();
    } catch (error) {
      onError(error);
    } finally {
      running = false;
    }
  };
  const timeout = window.setTimeout(run, delayMs);
  const interval = window.setInterval(run, intervalMs);
  window.addEventListener('focus', run);
  window.addEventListener('online', run);
  document.addEventListener('visibilitychange', run);
  return () => {
    stopped = true;
    window.clearTimeout(timeout);
    window.clearInterval(interval);
    window.removeEventListener('focus', run);
    window.removeEventListener('online', run);
    document.removeEventListener('visibilitychange', run);
  };
}
