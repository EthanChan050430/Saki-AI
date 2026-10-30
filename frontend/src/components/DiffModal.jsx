import React, { useEffect, useId, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X, RotateCcw, FileCode, AlertCircle } from 'lucide-react';
import { diffLines } from 'diff';

const DiffModal = ({ isOpen, onClose, fileMetadata, onRollback, files = [], onSelectFile }) => {
  const { t, i18n } = useTranslation();
  const zh = String(i18n.resolvedLanguage || i18n.language || '').toLowerCase().startsWith('zh');
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  const multiFile = files.length > 0 && typeof onSelectFile === 'function';

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    const handleKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current?.(); }
      if (event.key !== 'Tab') return;
      const controls = [...(dialogRef.current?.querySelectorAll('button:not(:disabled), [tabindex="0"]') || [])];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('keydown', handleKey, true);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen]);

  const filePath = fileMetadata?.filePath;
  const before = fileMetadata?.before;
  const after = fileMetadata?.after;
  
  const fileName = useMemo(() => {
    return filePath ? filePath.split(/[\\\/]/).pop() : 'file';
  }, [filePath]);
  
  const oldText = before === null || before === undefined ? "" : (typeof before === 'string' ? before : "");
  const newText = after === null || after === undefined ? "" : (typeof after === 'string' ? after : "");

  const diffRows = useMemo(() => {
    if (!isOpen || !fileMetadata) return [];
    
    const parts = diffLines(oldText, newText);
    const rows = [];
    let leftNo = 1;
    let rightNo = 1;

    parts.forEach((part) => {
      const lines = part.value.split(/\r?\n/);
      if (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
      }

      lines.forEach((line) => {
        if (part.added) {
          rows.push({
            left: { no: '', text: '', type: 'empty' },
            right: { no: rightNo++, text: line, type: 'add' }
          });
        } else if (part.removed) {
          rows.push({
            left: { no: leftNo++, text: line, type: 'del' },
            right: { no: '', text: '', type: 'empty' }
          });
        } else {
          rows.push({
            left: { no: leftNo++, text: line, type: 'normal' },
            right: { no: rightNo++, text: line, type: 'normal' }
          });
        }
      });
    });

    return rows;
  }, [oldText, newText, isOpen, fileMetadata]);

  const hasChanges = diffRows.some((row) => row.left.type !== 'normal' || row.right.type !== 'normal');

  if (!isOpen || !fileMetadata) return null;

  return createPortal(
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className={`bg-[#1e1e1e] border border-white/10 rounded-2xl w-full ${multiFile ? 'max-w-6xl' : 'max-w-5xl'} max-h-[90vh] flex flex-col shadow-2xl overflow-hidden outline-none`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-[#252526] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 bg-blue-500/10 rounded-lg text-blue-400 shrink-0">
              <FileCode size={16} />
            </div>
            <div className="min-w-0">
              <h3 id={titleId} className="text-sm text-white font-medium break-all leading-tight">{t('view_changes')} - {fileName}
                {fileMetadata.operation && <span className="saki-diff-operation">{fileMetadata.operation === 'create' ? (zh ? '新增' : 'Added') : fileMetadata.operation === 'delete' ? (zh ? '删除' : 'Deleted') : (zh ? '修改' : 'Modified')}</span>}
              </h3>
              <p className="text-[11px] text-white/40 font-mono break-all max-w-md leading-tight mt-0.5">{filePath}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onRollback && <button
              onClick={() => {
                if (window.confirm(t('rollback_confirm_diff'))) {
                  onRollback?.(fileMetadata);
                }
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs transition-colors"
            >
              <RotateCcw size={14} />
              <span>{t('rollback_changes')}</span>
            </button>}
            <button
              type="button"
              aria-label={zh ? '关闭代码差异' : 'Close code diff'}
              onClick={onClose}
              className="p-1.5 hover:bg-white/5 rounded-lg text-white/60 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="saki-diff-layout">
          {multiFile && <nav className="saki-diff-files" aria-label={zh ? '更改的文件' : 'Changed files'}>
            <div className="saki-diff-files-heading">{zh ? `${files.length} 个更改的文件` : `${files.length} changed files`}</div>
            {files.map(file => {
              const displayPath = file.displayPath || file.filePath;
              const segments = displayPath.split(/[\\/]/);
              const name = segments.pop();
              return <button type="button" key={file.filePath} className="saki-diff-file-button"
                aria-current={file.filePath === filePath ? 'true' : undefined} onClick={() => onSelectFile(file)} title={file.filePath}>
                <FileCode size={14} />
                <span className="saki-diff-file-info"><span className="saki-diff-file-name">{name}</span>
                  {segments.length > 0 && <span className="saki-diff-file-directory">{segments.join('/')}</span>}
                  <span className="saki-diff-file-stats"><span className="saki-code-added">+{file.added || 0}</span><span className="saki-code-removed">−{file.removed || 0}</span></span>
                </span>
              </button>;
            })}
          </nav>}
        <div className="saki-diff-editor flex-1 overflow-auto p-4 bg-[#1e1e1e] custom-scrollbar">
          {hasChanges ? (
            <div className="border border-white/10 rounded-lg overflow-hidden">
              <div className="grid grid-cols-2 text-[11px] font-mono">
                <div className="bg-[#252526] text-white/50 px-3 py-2 border-r border-white/10">{t('original_version')}</div>
                <div className="bg-[#252526] text-white/50 px-3 py-2">{t('modified_version')}</div>
              </div>
              <div className="divide-y divide-white/5">
                {diffRows.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-2 text-[12px] font-mono">
                    <div className={`flex border-r border-white/10 ${row.left.type === 'del' ? 'bg-red-500/10 text-red-200' : row.left.type === 'empty' ? 'bg-white/5 text-white/30' : 'bg-transparent text-white/70'}`}>
                      <div className="w-12 text-right pr-2 text-white/30 select-none">
                        {row.left.no}
                      </div>
                      <div className="flex-1 whitespace-pre-wrap px-2 py-0.5 break-all">
                        {row.left.text}
                      </div>
                    </div>
                    <div className={`flex ${row.right.type === 'add' ? 'bg-emerald-500/10 text-emerald-200' : row.right.type === 'empty' ? 'bg-white/5 text-white/30' : 'bg-transparent text-white/70'}`}>
                      <div className="w-12 text-right pr-2 text-white/30 select-none">
                        {row.right.no}
                      </div>
                      <div className="flex-1 whitespace-pre-wrap px-2 py-0.5 break-all">
                        {row.right.text}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-32 text-white/30 space-y-4">
              {oldText === newText ? (
                <>
                  <FileCode size={48} className="opacity-20" />
                  <p className="text-sm">{before === null && after !== null ? (zh ? '新建了一个空文件' : 'An empty file was created')
                    : after === null && before !== null ? (zh ? '删除了一个空文件' : 'An empty file was deleted') : t('no_changes')}</p>
                </>
              ) : (
                <>
                  <AlertCircle size={48} className="text-orange-500/50" />
                  <p className="text-sm">{t('cannot_parse_diff')}</p>
                </>
              )}
            </div>
          )}
        </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-white/5 bg-[#252526] flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-white/5 hover:bg-white/10 rounded-xl text-white/80 text-xs transition-colors border border-white/10"
          >
            {t('close_window')}
          </button>
        </div>
      </div>
    </div>, document.body
  );
};

export default DiffModal;
