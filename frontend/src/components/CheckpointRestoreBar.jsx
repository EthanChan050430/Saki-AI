import React from 'react';
import { useTranslation } from 'react-i18next';
import { GitBranch, Loader2 } from 'lucide-react';
import '../styles/checkpoints.css';

export default function CheckpointRestoreBar({ message, visible, disabled, restoring, onRestore }) {
  const { i18n } = useTranslation();
  const zh = String(i18n.resolvedLanguage || i18n.language || '').toLowerCase().startsWith('zh');
  return <div className={`saki-checkpoint-boundary ${visible || restoring ? 'is-visible' : ''}`}>
    <span className="saki-checkpoint-rule" />
    <button type="button" disabled={disabled || restoring} onClick={() => onRestore(message)}
      className="saki-checkpoint-button" aria-label={zh ? '还原检查点' : 'Restore checkpoint'}
      title={disabled && !restoring ? (zh ? '请先停止正在运行的任务' : 'Stop the running task first')
        : (zh ? '撤回此消息及之后的对话，并恢复工作区文件，包括终端修改和删除；不含工作区外文件、Git 元数据和会话存储。' : 'Rewind this message and later conversation and restore workspace files, including terminal edits and deletions. External files, Git metadata, and session storage are excluded.')}>
      <span>{restoring ? (zh ? '正在还原…' : 'Restoring…') : (zh ? '还原检查点' : 'Restore checkpoint')}</span>
      <span className="saki-checkpoint-dot">·</span>
      {restoring ? <Loader2 size={13} className="saki-checkpoint-spinner" /> : <GitBranch size={13} strokeWidth={1.6} />}
    </button>
    <span className="saki-checkpoint-rule" />
  </div>;
}
