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

export function createChatHistoryStore(publish, cache) {
  let history = [];
  let requestId = 0;
  let lastAppliedRequestId = 0;
  const deleting = new Set();
  const deleted = new Set();

  const publishVisible = () => publish(history.filter(item => !deleting.has(String(item.id))));
  const commit = items => {
    history = items;
    cache(history);
    publishVisible();
  };

  const finishDelete = async (id, deleteEntry) => {
    try {
      await deleteEntry();
    } catch (error) {
      deleting.delete(id);
      publishVisible();
      throw error;
    }

    // Any refresh already started may still contain the deleted entry.
    lastAppliedRequestId = requestId;
    deleting.delete(id);
    deleted.add(id);
    commit(history.filter(item => String(item.id) !== id));
  };

  return {
    restoreCache: items => { history = items; publishVisible(); },
    async refresh(load) {
      const id = ++requestId;
      const items = await load();
      if (id <= lastAppliedRequestId) return;
      lastAppliedRequestId = id;
      commit(items);
    },
    isDeleting: chatId => deleting.has(String(chatId)),
    wasDeleted: chatId => deleted.has(String(chatId)),
    remove(chatId, deleteEntry) {
      const id = String(chatId);
      if (deleting.has(id)) return null;
      deleting.add(id);
      publishVisible();
      return finishDelete(id, deleteEntry);
    },
  };
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

/**
 * Resolves the workspace path belonging to a specific conversation.
 * Priority: active pending request -> session-level workspacePath -> latest user message
 * requestOptions.workspacePath -> latest checkpoint workspacePath -> default ('').
 */
export function resolveSessionWorkspacePath(sessionData = {}, messages = []) {
  if (typeof sessionData?.pendingRequest?.options?.workspacePath === 'string') {
    return sessionData.pendingRequest.options.workspacePath;
  }
  if (typeof sessionData?.workspacePath === 'string') {
    return sessionData.workspacePath;
  }
  const messageList = Array.isArray(messages) && messages.length > 0
    ? messages
    : (Array.isArray(sessionData?.messages) ? sessionData.messages : []);
  for (let i = messageList.length - 1; i >= 0; i -= 1) {
    const msg = messageList[i];
    if (msg?.role === 'user' && typeof msg?.requestOptions?.workspacePath === 'string') {
      return msg.requestOptions.workspacePath;
    }
  }
  for (let i = messageList.length - 1; i >= 0; i -= 1) {
    const msg = messageList[i];
    if (typeof msg?.checkpoint?.workspacePath === 'string') {
      return msg.checkpoint.workspacePath;
    }
  }
  return '';
}

export function applyStreamingActions(message, event = {}, terminal = false) {
  const streamingActions = terminal || event.action
    ? []
    : (Array.isArray(event.streamingActions) ? event.streamingActions : (message.streamingActions || []));
  return { ...message, streamingActions };
}

const TERMINAL_MESSAGE_STATUSES = new Set(['done', 'error', 'interrupted']);

export function hasFinishedAssistantOutput(message) {
  if (!message || typeof message !== 'object') return false;
  if (TERMINAL_MESSAGE_STATUSES.has(message.status) || Boolean(message.runOutcome)) return true;
  const parts = Array.isArray(message.parts) ? message.parts : [];
  const lastPart = parts.at(-1);
  return Boolean(lastPart && lastPart.type === 'text' && String(lastPart.content || '').trim());
}

/**
 * Drops stale `pendingRequest` markers once a loaded message has already finalized
 * and no active backend run or approval gate owns the turn.
 */
export function sanitizeLoadedPendingRequest({ messages = [], pendingRequest = null, isRunning = false } = {}) {
  if (!pendingRequest?.assistantMsgId) return null;
  if (isRunning || pendingRequest.approvalRequest) return pendingRequest;
  const target = (Array.isArray(messages) ? messages : []).find(
    (msg) => msg && String(msg.id) === String(pendingRequest.assistantMsgId)
  );
  if (hasFinishedAssistantOutput(target)) return null;
  return pendingRequest;
}

/**
 * Normalizes a background-recovered snapshot after `/api/chat/running` reports
 * that the active run has ended.
 */
export function reconcileCompletedBackgroundSnapshot({ messages = [], pendingRequest = null, assistantMsgId = null } = {}) {
  const list = Array.isArray(messages) ? messages : [];
  const awaitingApproval = Boolean(pendingRequest?.approvalRequest);
  const nextPendingRequest = awaitingApproval ? pendingRequest : null;
  const targetId = assistantMsgId || pendingRequest?.assistantMsgId || null;

  const nextMessages = list.map((msg) => {
    if (!msg || msg.role !== 'assistant') return msg;
    const isTarget = targetId !== null && String(msg.id) === String(targetId);
    const isStreaming = msg.status === 'streaming';
    if (!isTarget && !isStreaming) return msg;

    const cleared = applyStreamingActions(msg, {}, true);
    if (awaitingApproval && isTarget) {
      return cleared;
    }
    if (TERMINAL_MESSAGE_STATUSES.has(cleared.status)) {
      return cleared;
    }
    const hasCompletedArtifact = hasFinishedAssistantOutput(cleared)
      || (Array.isArray(cleared.generatedFiles) && cleared.generatedFiles.length > 0)
      || cleared.pptData?.status === 'completed'
      || cleared.deepReadingData?.status === 'completed';
    return {
      ...cleared,
      status: hasCompletedArtifact ? 'done' : 'interrupted',
      runOutcome: cleared.runOutcome || (hasCompletedArtifact ? 'completed' : 'stopped'),
    };
  });

  return { messages: nextMessages, pendingRequest: nextPendingRequest };
}
