import { changeStats } from './agentActivity.js';

export function parseTurns(messages = []) {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  const list = [];
  let currentTurn = null;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === 'user') {
      // Skip hidden story glass overlay prompt
      if (Boolean(msg.requestOptions?.storyGlassOverlay)) continue;

      let preview = '';
      if (typeof msg.content === 'string') {
        preview = msg.content;
      } else if (Array.isArray(msg.parts)) {
        preview = msg.parts
          .filter((p) => p.type === 'text' || p.type === 'reasoning')
          .map((p) => p.content || '')
          .join(' ');
      }

      // Clean internal tags and markdown formatting for a clean one-line summary
      preview = preview
        .replace(/\[expression[:=].*?\.png\]/gi, '')
        .replace(/```[\s\S]*?```/g, '[代码]')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/!\[.*?\]\(.*?\)/g, '[图片]')
        .replace(/\[(.*?)\]\(.*?\)/g, '$1')
        .replace(/^[#*>\-\s]+/gm, '')
        .trim();

      if (!preview && Array.isArray(msg.files) && msg.files.length > 0) {
        const names = msg.files
          .map((f) => (typeof f === 'string' ? f.split(/[\\/]/).pop() : f?.name))
          .filter(Boolean);
        if (names.length > 0) preview = names.join(', ');
      }

      if (!preview) {
        preview = `对话 #${list.length + 1}`;
      }

      // Collapse multiple whitespaces/newlines into a single space
      preview = preview.replace(/\s+/g, ' ').trim();

      const turnId = msg.id || i;
      currentTurn = {
        turnIndex: list.length,
        msgIndex: i,
        msgId: turnId,
        domId: `chat-msg-${turnId}`,
        previewText: preview,
        added: 0,
        removed: 0,
      };
      list.push(currentTurn);
    } else if (msg.role === 'assistant' && currentTurn) {
      // Aggregate file change statistics from assistant tool executions
      if (Array.isArray(msg.parts)) {
        for (const part of msg.parts) {
          if (part?.fileMetadata) {
            const stats = changeStats(part.fileMetadata);
            if (stats) {
              currentTurn.added += stats.added || 0;
              currentTurn.removed += stats.removed || 0;
            }
          }
        }
      }
    }
  }
  return list;
}
