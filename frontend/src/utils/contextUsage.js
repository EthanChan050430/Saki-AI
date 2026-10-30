const CONTEXT_DEFAULT_BUDGET_TOKENS = 32000;
const CONTEXT_AUTO_COMPRESS_RATIO = 0.82;
const CONTEXT_RECENT_MESSAGE_COUNT = 8;

function estimateContextTokenCount(text = '') {
  const source = String(text || '');
  if (!source) return 0;
  const cjkChars = (source.match(/[\u3400-\u9fff]/g) || []).length;
  const nonCjkChars = Math.max(0, source.length - cjkChars);
  return Math.ceil(cjkChars * 0.65 + nonCjkChars / 3.8);
}

function getContextBudgetTokens(provider = '', model = '', config = {}) {
  const configured = Number(config?.agentContextBudgetTokens || config?.contextBudgetTokens || config?.contextWindowTokens);
  if (Number.isFinite(configured) && configured >= 8000) return Math.floor(configured);

  const modelId = String(model || '').toLowerCase();
  if (modelId.includes('claude-3-7') || modelId.includes('claude-sonnet-4') || modelId.includes('claude-opus-4')) return 180000;
  if (modelId.includes('gemini-1.5') || modelId.includes('gemini-2')) return 120000;
  if (modelId.includes('gpt-4.1') || modelId.includes('gpt-5') || modelId.includes('o3') || modelId.includes('o4')) return 120000;
  if (String(provider || '').toLowerCase() === 'ollama') return 32768;
  return CONTEXT_DEFAULT_BUDGET_TOKENS;
}

function compactContextText(text = '', maxChars = 700) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 18)).trim()} ...[truncated]`;
}

function serializeMessageForContextEstimate(message = {}) {
  if (!message) return '';

  let text = String(message.content || '').trim();
  if (message.role === 'assistant') {
    const partsText = Array.isArray(message.parts)
      ? message.parts.map((part) => {
          if (part?.type === 'text') return String(part.content || '');
          if (part?.type === 'reasoning') return `<think>${part.content || ''}</think>\n`;
          if (part?.type === 'action') {
            const args = (part.data?.args || [])
              .map((arg) => `"${compactContextText(arg, 600).replace(/"/g, '\\"')}"`)
              .join(', ');
            const observation = compactContextText(part.observation || '', 500);
            return `Tool: ${part.data?.type || 'unknown'}(${args})${observation ? `\nObservation: ${observation}` : ''}`;
          }
          return '';
        }).filter(Boolean).join('\n')
      : '';

    const structuredParts = [
      message.deepReadingData?.summary || message.deepReadingData?.reportHtml,
      message.pptData?.title || message.pptData?.summary,
      message.credibilityCheckData?.summary,
      message.storyGlassData?.sakiComment || message.storyGlassData?.storySummary,
    ].filter(Boolean).map((item) => compactContextText(item, 900));

    text = [Array.isArray(message.parts) ? partsText : text, ...structuredParts].filter(Boolean).join('\n').trim();
  }

  if (!text) return '';
  return `${message.role === 'user' ? 'User' : 'Assistant'}: ${text}`;
}

export function calculateContextStatusFromMessages(messages = [], config = {}) {
  const sourceMessages = Array.isArray(messages) ? messages : [];
  if (sourceMessages.length === 0) return null;

  const budgetTokens = getContextBudgetTokens(config.provider, config.model, config);
  const formattedHistory = sourceMessages
    .map(serializeMessageForContextEstimate)
    .filter(Boolean)
    .join('\n');
  // A measured request belongs to its final assistant message. New user messages
  // and provider/model changes fall back to a clearly labelled estimate.
  const lastMessage = sourceMessages.at(-1);
  const measured = lastMessage?.role === 'assistant' ? lastMessage.contextStatus : null;
  if (measured?.source === 'api' && measured.provider === config.provider && measured.model === config.model) {
    return { ...measured, budgetTokens, percent: Math.min(100, Math.round(measured.usedTokens / budgetTokens * 100)) };
  }
  const usedTokens = estimateContextTokenCount(formattedHistory);
  const autoCompressThreshold = Math.max(8000, Math.floor(budgetTokens * CONTEXT_AUTO_COMPRESS_RATIO));
  const shouldCompress = usedTokens > autoCompressThreshold && sourceMessages.length > CONTEXT_RECENT_MESSAGE_COUNT;
  const keptRecentMessages = shouldCompress
    ? Math.min(CONTEXT_RECENT_MESSAGE_COUNT, sourceMessages.length)
    : sourceMessages.length;

  return {
    usedTokens,
    budgetTokens,
    percent: Math.min(100, Math.round((usedTokens / Math.max(1, budgetTokens)) * 100)),
    compressed: false,
    state: shouldCompress ? 'near-compression' : 'estimated',
    estimated: true,
    messageCount: sourceMessages.length,
    keptRecentMessages,
    compressedMessages: shouldCompress ? Math.max(0, sourceMessages.length - keptRecentMessages) : 0,
    updatedAt: new Date().toISOString(),
  };
}

