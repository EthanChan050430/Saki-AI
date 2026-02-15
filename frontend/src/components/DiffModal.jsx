import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, RotateCcw, FileCode, AlertCircle } from 'lucide-react';
import { diffLines } from 'diff';

const DiffModal = ({ isOpen, onClose, fileMetadata, onRollback }) => {
  const { t } = useTranslation();

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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#1e1e1e] border border-white/10 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5 bg-[#252526]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
              <FileCode size={20} />
            </div>
            <div>
              <h3 className="text-white font-medium">{t('view_changes')} - {fileName}</h3>
              <p className="text-xs text-white/40 font-mono truncate max-w-md">{filePath}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (window.confirm(t('rollback_confirm_diff'))) {
                  onRollback?.(fileMetadata);
                }
              }}
              className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-sm transition-colors"
            >
              <RotateCcw size={16} />
              <span>{t('rollback_changes')}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/5 rounded-lg text-white/60 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 bg-[#1e1e1e] custom-scrollbar">
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
                  <p className="text-sm">{t('no_changes')}</p>
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

        {/* Footer */}
        <div className="p-4 border-t border-white/5 bg-[#252526] flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-white/80 text-sm transition-colors border border-white/10"
          >
            {t('close_window')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DiffModal;
