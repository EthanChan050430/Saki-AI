// A video call is not a separate conversation: every turn belongs to the chat it
// was opened from, so it must behave like ordinary chat history there. These
// helpers convert call turns into chat messages and merge them idempotently, so a
// turn is never duplicated when the call ends or the tab is reopened mid-session.

export function toChatRecord(record) {
  const id = record?.id;
  if (!id) return null;
  // A turn that failed before producing anything is withdrawn from the chat and
  // handed back to the composer instead of leaving a half exchange behind.
  if (record.removed) return null;
  if (record.role === 'assistant') {
    const content = String(record.content || '');
    const generatedFiles = Array.isArray(record.generatedFiles) ? record.generatedFiles : [];
    const parts = Array.isArray(record.parts) && record.parts.length ? record.parts : (content ? [{ type: 'text', content }] : []);
    const failed = record.status === 'error' || record.status === 'cancelled';
    // Tool-only turns are real work: keep them even before/without any prose.
    if (!content.trim() && !generatedFiles.length && !parts.some(part => part.type === 'action') && !failed) return null;
    return {
      role: 'assistant',
      id,
      status: record.status || 'done',
      parts,
      ...(generatedFiles.length ? { generatedFiles } : {}),
      ...(record.videoCallContext ? { videoCallContext: record.videoCallContext } : {}),
      ...(record.videoCall ? { videoCall: true, revision: Number(record.revision) || 0 } : {}),
    };
  }
  if (record.role !== 'user') return null;
  const attachedFiles = Array.isArray(record.attachedFiles) ? record.attachedFiles : [];
  return {
    role: 'user',
    id,
    content: String(record.content || ''),
    ...(attachedFiles.length ? { files: attachedFiles.map(file => file.name), attachedFiles } : {}),
    ...(record.videoCall ? { videoCall: true, revision: Number(record.revision) || 0 } : {}),
  };
}

// `base` is the chat history captured when the call opened; `records` is every
// turn the call has produced. Merging is by id, so replaying the same turns is a
// no-op and re-opening the call cannot append them twice.
export function mergeCallRecords({ base = [], records = [] } = {}) {
  const merged = Array.isArray(base) ? [...base] : [];
  const seen = new Set(merged.map(message => String(message.id)));
  for (const record of Array.isArray(records) ? records : []) {
    const message = toChatRecord(record);
    if (!message || seen.has(String(message.id))) continue;
    seen.add(String(message.id));
    merged.push(message);
  }
  return merged;
}

// Turns stream while they run: the same message id arrives repeatedly with a
// growing revision. Only a strictly newer snapshot may replace the stored one, so
// an old hang-up replay can never erase newer content or tool results.
export function addCallRecords(existing = [], incoming = []) {
  const kept = Array.isArray(existing) ? existing : [];
  const next = [...kept];
  let changed = false;
  const positions = new Map(next.map((record, index) => [String(record?.id), index]));
  for (const record of Array.isArray(incoming) ? incoming : []) {
    if (!record?.id) continue;
    const key = String(record.id);
    const index = positions.get(key);
    if (index == null) {
      positions.set(key, next.length);
      next.push(record);
      changed = true;
      continue;
    }
    const previous = next[index];
    const previousRevision = Number(previous?.revision) || 0;
    const revision = Number(record?.revision) || 0;
    if (previousRevision && !revision) continue;
    if (revision > previousRevision) { next[index] = record; changed = true; }
  }
  return changed ? next : kept;
}

// A chat message and a call record describe the same assistant turn; the call
// record is the authoritative snapshot while the call is open.
export function sameCallRecords(a = [], b = []) {
  if (a.length !== b.length) return false;
  return a.every((record, index) => record === b[index]
    || (record?.id === b[index]?.id && Number(record?.revision) === Number(b[index]?.revision)));
}
