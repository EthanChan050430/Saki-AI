// Apply only explicit stream corrections. Repeated words or paragraphs in a
// normal delta are user-visible content and must not be heuristically removed.
export function applyTextStreamEvent(parts = [], event = {}) {
  const next = [...parts];
  let text = typeof event.text === 'string' ? event.text : '';
  if (event.textReplacement) {
    text = String(event.textReplacement.text ?? '');
    let remaining = Math.max(0, Math.floor(Number(event.textReplacement.length) || 0));
    for (let index = next.length - 1; index >= 0 && remaining > 0; index -= 1) {
      const part = next[index];
      if (part.type === 'action') break;
      if (part.type !== 'text') continue;
      const content = String(part.content || '');
      const removed = Math.min(content.length, remaining);
      remaining -= removed;
      if (removed === content.length) next.splice(index, 1);
      else next[index] = { ...part, content: content.slice(0, content.length - removed) };
    }
  }
  if (text) {
    const last = next.length - 1;
    if (next[last]?.type === 'text') next[last] = { ...next[last], content: next[last].content + text };
    else next.push({ type: 'text', content: text });
  }
  return next;
}
