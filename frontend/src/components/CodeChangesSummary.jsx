import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileDiff } from 'lucide-react';
const DiffModal = React.lazy(() => import('./DiffModal'));
import { collectCodeChanges } from '../utils/codeChanges';
import '../styles/codeChanges.css';

export default function CodeChangesSummary({ messages, workspacePath = '' }) {
  const { i18n } = useTranslation();
  const zh = String(i18n.resolvedLanguage || i18n.language || '').toLowerCase().startsWith('zh');
  const summary = useMemo(() => collectCodeChanges(messages, workspacePath), [messages, workspacePath]);
  const [open, setOpen] = useState(false);
  const [selectedPath, setSelectedPath] = useState(null);
  if (!summary.files.length) return null;
  const selected = summary.files.find(file => file.filePath === selectedPath) || summary.files[0];
  const count = summary.files.length;
  const label = zh ? `${count} 个文件` : `${count} ${count === 1 ? 'File' : 'Files'}`;
  return <div className="saki-code-changes">
    <button type="button" className="saki-code-changes-chip" onClick={() => setOpen(true)}
      aria-haspopup="dialog" aria-expanded={open}
      aria-label={zh ? `查看代码更改：${count} 个文件，新增 ${summary.added} 行，删除 ${summary.removed} 行` : `View changes: ${count} files, ${summary.added} additions, ${summary.removed} deletions`}
      title={zh ? '查看当前会话的全部文件更改' : 'View all file changes in this conversation'}>
      <FileDiff size={13} strokeWidth={1.6} />
      <span>{label}</span>
      <span className="saki-code-added">+{summary.added}</span>
      <span className="saki-code-removed">−{summary.removed}</span>
    </button>
    {open && (
      <React.Suspense fallback={null}>
        <DiffModal isOpen={open} onClose={() => setOpen(false)} fileMetadata={selected}
          files={summary.files} onSelectFile={file => setSelectedPath(file.filePath)} />
      </React.Suspense>
    )}
  </div>;
}
