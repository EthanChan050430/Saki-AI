import { diffLines } from 'diff';

const diffCache = new WeakMap();
export const actionKind = (part) => String(part?.data?.type || '').toLowerCase();
export const fileName = (path = '') => String(path).split(/[\\/]/).filter(Boolean).pop() || String(path);

export function actionCategory(part) {
  const kind = actionKind(part);
  if (['readfile', 'readfilechunk', 'planfileread', 'readskill', 'readmemory', 'inspectopenhubskill'].includes(kind)) return 'read';
  if (['writefile', 'editfile', 'replaceinfile', 'replaceblocks', 'deletefile', 'ensuredir', 'createprojectfolder'].includes(kind)) return 'edit';
  if (kind === 'terminal') return 'command';
  if (['search', 'browse'].includes(kind)) return 'search';
  if (['listdir', 'getrepomap', 'searchskills', 'listskills', 'searchopenhubskills', 'searchmemories', 'listmemories'].includes(kind)) return 'explore';
  return 'tool';
}

export function actionState(part, active = false) {
  const output = String(part.observation ?? '').trim();
  if (/^(?:Approval required|Waiting for approval)/i.test(output)) return 'approval';
  if (/^(?:Error\b|MCP Error\b|Permission denied\b|Command failed\b|.*?exit code [1-9]\d*\b)/i.test(output)) return 'error';
  if (/^Skipped:/i.test(output)) return 'skipped';
  if (part.data?.isStreaming) return active ? 'streaming' : 'interrupted';
  if (actionKind(part) === 'terminal' && /^(?:STDOUT|STDERR):/i.test(output)) return active ? 'running' : 'interrupted';
  if (active && actionKind(part) === 'terminal' && !/^Command (?:succeeded|failed)/i.test(output)) return 'running';
  if (output || part.fileMetadata) return 'done';
  return active ? 'running' : 'interrupted';
}

export function changeStats(metadata) {
  if (!metadata) return { added: 0, removed: 0 };
  const before = typeof metadata.before === 'string' ? metadata.before : '';
  const after = typeof metadata.after === 'string' ? metadata.after : '';
  const cached = diffCache.get(metadata);
  if (cached?.before === before && cached?.after === after) return cached.stats;
  const stats = { added: 0, removed: 0 };
  for (const part of diffLines(before, after)) {
    const lines = part.value.split(/\r?\n/);
    if (lines.at(-1) === '') lines.pop();
    if (part.added) stats.added += lines.length;
    if (part.removed) stats.removed += lines.length;
  }
  diffCache.set(metadata, { before, after, stats });
  return stats;
}

// Keep text in its original position. Only consecutive activities are grouped.
export function activitySegments(parts = [], streamingActions = []) {
  const entries = parts.map((part, index) => ({ ...part, key: `part-${index}` }));
  for (const [index, action] of streamingActions.entries()) {
    const args = Array.isArray(action.args) ? action.args : [];
    const duplicate = entries.some(part => part.type === 'action' && actionKind(part) === String(action.name || '').toLowerCase()
      && part.observation == null && JSON.stringify(part.data?.args || []) === JSON.stringify(args));
    if (!duplicate) entries.push({ type: 'action', key: `stream-${action.index ?? index}`, data: { type: action.name, args, isStreaming: true } });
  }
  const segments = [];
  for (const entry of entries) {
    if (entry.type === 'text') {
      if (!String(entry.content || '').replace(/\[expression[:=].*?\]/g, '').trim()) continue;
      segments.push({ type: 'text', key: entry.key, part: entry });
    } else if (entry.type === 'action' || (entry.type === 'reasoning' && entry.content?.trim())) {
      const last = segments.at(-1);
      if (last?.type === 'activity') last.parts.push(entry);
      else segments.push({ type: 'activity', key: entry.key, parts: [entry] });
    }
  }
  return segments;
}

export function activityBatches(parts) {
  const batches = [];
  for (const part of parts) {
    const category = part.type === 'reasoning' ? 'reasoning' : actionCategory(part);
    const last = batches.at(-1);
    if (last?.category === category && category !== 'reasoning' && category !== 'tool') last.parts.push(part);
    else batches.push({ key: part.key, category, parts: [part] });
  }
  return batches;
}

export function activitySummary(parts) {
  const counts = { read: 0, edit: 0, command: 0, search: 0, explore: 0, tool: 0, reasoning: 0 };
  const files = { read: new Set(), edit: new Set() };
  const stats = { added: 0, removed: 0 };
  let errors = 0, interrupted = 0, approvals = 0;
  for (const part of parts) {
    if (part.type === 'reasoning') { counts.reasoning++; continue; }
    const category = actionCategory(part);
    if (files[category]) {
      const target = String(part.fileMetadata?.filePath || part.data?.args?.[0] || part.key).replace(/\\/g, '/');
      files[category].add(target);
      counts[category] = files[category].size;
    } else counts[category]++;
    const state = actionState(part);
    if (state === 'error') errors++;
    if (state === 'interrupted' || state === 'skipped') interrupted++;
    if (state === 'approval') approvals++;
    const changes = changeStats(part.fileMetadata);
    stats.added += changes.added;
    stats.removed += changes.removed;
  }
  return { counts, ...stats, errors, interrupted, approvals, steps: parts.length };
}
