import { actionState, changeStats } from './agentActivity.js';

const EDIT_TOOLS = new Set(['writefile', 'editfile', 'replaceinfile', 'replaceblocks', 'deletefile']);
const netDiffCache = new WeakMap();

function normalizePath(value) {
  const path = String(value || '').trim().replace(/\\/g, '/');
  const prefix = path.startsWith('//') ? '//' : path.startsWith('/') ? '/' : '';
  const segments = [];
  for (const segment of path.slice(prefix.length).split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..' && segments.length && segments.at(-1) !== '..' && !/^[a-z]:$/i.test(segments.at(-1))) segments.pop();
    else segments.push(segment);
  }
  return prefix + segments.join('/');
}

function resolvePath(path, workspacePath) {
  const normalized = normalizePath(path);
  return workspacePath && !/^(?:[a-z]:\/|\/)/i.test(normalized)
    ? normalizePath(`${workspacePath}/${normalized}`) : normalized;
}

function pathKey(path) {
  return /^(?:[a-z]:\/|\/\/)/i.test(path) ? path.toLowerCase() : path;
}

// Aggregate successful text-file snapshots in conversation order. Repeated
// edits compare the first before-image with the most recent after-image.
export function collectCodeChanges(messages = [], workspacePath = '') {
  const files = new Map();
  const root = normalizePath(workspacePath);
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    for (const part of message.parts || []) {
      if (part.type !== 'action' || !EDIT_TOOLS.has(String(part.data?.type || '').toLowerCase())) continue;
      if (actionState(part) !== 'done') continue;
      const metadata = part.fileMetadata;
      if (!metadata?.filePath || !Object.hasOwn(metadata, 'before') || !Object.hasOwn(metadata, 'after')) continue;
      if (![metadata.before, metadata.after].every(value => value === null || typeof value === 'string')) continue;
      const filePath = resolvePath(metadata.filePath, root);
      const key = pathKey(filePath);
      const previous = files.get(key);
      files.set(key, {
        ...metadata,
        filePath,
        before: previous ? previous.before : metadata.before,
        beforeHash: previous ? previous.beforeHash : metadata.beforeHash,
        editCount: (previous?.editCount || 0) + 1,
        latestSnapshot: metadata,
      });
    }
  }
  const changes = [...files.values()].filter(file => file.before !== file.after).map(file => {
    const displayPath = root && pathKey(file.filePath).startsWith(`${pathKey(root)}/`)
      ? file.filePath.slice(root.length + 1) : file.filePath;
    const { latestSnapshot, ...metadata } = file;
    let cached = netDiffCache.get(latestSnapshot);
    if (!cached || cached.before !== file.before || cached.after !== file.after) {
      cached = { before: file.before, after: file.after, stats: changeStats(file) };
      netDiffCache.set(latestSnapshot, cached);
    }
    return {
      ...metadata, displayPath,
      operation: file.before === null ? 'create' : file.after === null ? 'delete' : 'edit',
      ...cached.stats,
    };
  });
  return {
    files: changes,
    added: changes.reduce((sum, file) => sum + file.added, 0),
    removed: changes.reduce((sum, file) => sum + file.removed, 0),
  };
}
