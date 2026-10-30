import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen, Brain, ChevronRight, Terminal, Search, Globe, FolderOpen, PencilLine, Server, Loader2, AlertCircle, Clock, FileDiff, Undo2, X, Copy, Check, Palette, Music2, GitBranch } from 'lucide-react';
import { actionKind, actionCategory, actionState, changeStats, fileName, activitySegments, activityBatches, activitySummary } from '../utils/agentActivity';
import '../styles/agentActivity.css';

function useLocale() {
  const { i18n } = useTranslation();
  const zh = String(i18n.resolvedLanguage || i18n.language || '').toLowerCase().startsWith('zh');
  return (chinese, english) => zh ? chinese : english;
}

function useDisclosure(defaultOpen = false) {
  const [choice, setChoice] = useState(null);
  const open = choice ?? defaultOpen;
  return [open, () => setChoice(!open)];
}

function ChangeCount({ added, removed }) {
  if (!added && !removed) return null;
  return <span className="agent-change-count" aria-label={`+${added} −${removed}`}><span>+{added}</span><span>−{removed}</span></span>;
}

function ActivityIcon({ part, state }) {
  if (state === 'running' || state === 'streaming') return <Loader2 size={14} className="agent-activity-spinner" />;
  if (state === 'error') return <AlertCircle size={14} />;
  if (state === 'approval') return <Clock size={14} />;
  const kind = actionKind(part);
  const Icon = part.type === 'reasoning' ? Brain : kind === 'browse' ? Globe : kind === 'draw' ? Palette
    : kind === 'composemusic' ? Music2 : { read: BookOpen, edit: PencilLine, command: Terminal, search: Search, explore: FolderOpen }[actionCategory(part)] || Server;
  return <Icon size={14} strokeWidth={1.6} />;
}

function summaryText(counts, local) {
  return [
    counts.read && local(`阅读 ${counts.read} 个文件`, `Read ${counts.read} file${counts.read === 1 ? '' : 's'}`),
    counts.edit && local(`修改 ${counts.edit} 个文件`, `Changed ${counts.edit} file${counts.edit === 1 ? '' : 's'}`),
    counts.command && local(`运行 ${counts.command} 条命令`, `Ran ${counts.command} command${counts.command === 1 ? '' : 's'}`),
    counts.search && local(`检索 ${counts.search} 次`, `${counts.search} search${counts.search === 1 ? '' : 'es'}`),
    counts.explore && local(`探索 ${counts.explore} 次`, `${counts.explore} exploration${counts.explore === 1 ? '' : 's'}`),
    counts.tool && local(`调用 ${counts.tool} 个工具`, `${counts.tool} tool call${counts.tool === 1 ? '' : 's'}`),
  ].filter(Boolean).join(local('，', ', '));
}

function ToolTarget({ part }) {
  const local = useLocale();
  const kind = actionKind(part);
  const args = part.data?.args || [];
  const category = actionCategory(part);
  const target = String(part.fileMetadata?.filePath || args[0] || '');
  const file = ['read', 'edit'].includes(category);
  const labels = {
    readfile: local('阅读', 'Read'), readfilechunk: local('阅读', 'Read'), planfileread: local('规划阅读', 'Plan reading'),
    readskill: local('阅读技能', 'Read skill'), readmemory: local('读取记忆', 'Read memory'), inspectopenhubskill: local('查看技能', 'Inspect skill'),
    writefile: local('写入', 'Write'), editfile: local('编辑', 'Edit'), replaceinfile: local('编辑', 'Edit'), replaceblocks: local('编辑', 'Edit'),
    deletefile: local('删除', 'Delete'), ensuredir: local('创建目录', 'Create folder'), createprojectfolder: local('创建项目', 'Create project'),
    terminal: local('运行命令', 'Run command'), search: local('搜索', 'Search'), browse: local('浏览', 'Browse'),
    listdir: local('查看目录', 'List directory'), getrepomap: local('查看代码结构', 'Explore code'),
    draw: local('生成图片', 'Generate image'), composemusic: local('创作音乐', 'Compose music'),
    diagram: local('绘制图表', 'Render diagram'), manage_hosted_tasks: local('管理定时任务', 'Manage scheduled tasks'),
    savememory: local('保存记忆', 'Save memory'), searchskills: local('查找技能', 'Find skills'),
  };
  const range = kind === 'readfile' || kind === 'editfile';
  return <>
    <span className="agent-action-label">{labels[kind] || part.data?.type || local('工具调用', 'Tool call')}</span>
    {target && <span className={file ? 'agent-file-chip' : 'agent-action-preview'} title={target}>{file ? fileName(target) : target.replace(/\s+/g, ' ')}</span>}
    {range && args[1] && <span className="agent-line-range">{local('行', 'lines')} {args[1]}{args[2] ? `–${args[2]}` : ''}</span>}
    {kind === 'readfilechunk' && args[1] && <span className="agent-line-range">{local('分块', 'chunk')} {args[1]}</span>}
  </>;
}

function CopyDetail({ text }) {
  const local = useLocale();
  const [copied, setCopied] = useState(false);
  return <button type="button" className="agent-detail-copy" aria-label={local('复制详情', 'Copy details')} onClick={async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); }
  }}>{copied ? <Check size={12} /> : <Copy size={12} />}{copied ? local('已复制', 'Copied') : local('复制', 'Copy')}</button>;
}

function ToolRow({ part, active, onViewChanges, onRollback, onSkipAction, renderOutput }) {
  const local = useLocale();
  const id = useId();
  const [open, toggle] = useDisclosure(false);
  const [skipRequested, setSkipRequested] = useState(false);
  const [skipFailed, setSkipFailed] = useState(false);
  const state = actionState(part, active);
  const args = Array.isArray(part.data?.args) ? part.data.args : [];
  const kind = actionKind(part);
  const stats = changeStats(part.fileMetadata);
  const statuses = { error: local('失败', 'Failed'), approval: local('等待批准', 'Needs approval'), skipped: local('已跳过', 'Skipped'), interrupted: local('已中断', 'Interrupted'), streaming: local('生成参数中', 'Preparing'), running: local('执行中', 'Running') };
  const canSkip = state === 'running' && kind === 'terminal' && part.data?.id && onSkipAction;
  const input = args.map((arg, index) => typeof arg === 'string' ? `${args.length > 1 ? `${index + 1}. ` : ''}${arg}` : JSON.stringify(arg, null, 2)).join('\n\n');
  const output = String(part.observation ?? '');
  const hasChanges = part.fileMetadata && typeof onViewChanges === 'function';
  return <div className={`agent-tool-step agent-state-${state}`} data-activity-state={state}>
    <div className="agent-step-line">
      <button type="button" className="agent-step-toggle" onClick={toggle} aria-expanded={open} aria-controls={id}>
        <span className="agent-step-icon"><ActivityIcon part={part} state={state} /></span>
        <span className="agent-step-description"><ToolTarget part={part} /><ChangeCount {...stats} /></span>
        {statuses[state] && <span className="agent-step-status" role={state === 'running' ? 'status' : undefined}>{statuses[state]}</span>}
        <ChevronRight size={12} className={`agent-disclosure ${open ? 'is-open' : ''}`} />
      </button>
      {canSkip && <button type="button" className="agent-skip-button" disabled={skipRequested} onClick={async () => {
        setSkipRequested(true); setSkipFailed(false);
        try { if (!await onSkipAction(part.data.id)) { setSkipRequested(false); setSkipFailed(true); } }
        catch { setSkipRequested(false); setSkipFailed(true); }
      }}><X size={12} />{skipRequested ? local('正在跳过', 'Skipping') : local('跳过', 'Skip')}</button>}
    </div>
    {skipFailed && <p className="agent-step-notice" role="alert">{local('跳过失败，请重试。', 'Could not skip. Please try again.')}</p>}
    {open && <div id={id} className="agent-step-detail">
      <div className="agent-detail-toolbar">
        <span title={String(part.fileMetadata?.filePath || '')}>{part.fileMetadata?.filePath || part.data?.type}</span>
        <div className="agent-detail-actions">
          {hasChanges && <button type="button" onClick={() => onViewChanges(part.fileMetadata)}><FileDiff size={12} />{local('查看差异', 'View changes')}</button>}
          {part.fileMetadata && onRollback && <button type="button" onClick={() => onRollback(part.fileMetadata)}><Undo2 size={12} />{kind === 'deletefile' ? local('恢复', 'Restore') : local('撤销', 'Undo')}</button>}
          <CopyDetail text={[input, output].filter(Boolean).join('\n\n')} />
        </div>
      </div>
      {input && <div className="agent-detail-section"><span className="agent-detail-label">{local('输入', 'Input')}</span><pre>{input}</pre></div>}
      {output && <div className="agent-detail-section"><span className="agent-detail-label">{local('结果', 'Result')}</span>
        {renderOutput && !['terminal', 'readfile', 'readfilechunk', 'planfileread'].includes(kind)
          ? <div className="agent-rich-result">{renderOutput(part)}</div>
          : <pre>{output.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')}</pre>}
      </div>}
      {!output && <p className="agent-step-notice">{active ? local('等待工具返回结果…', 'Waiting for the result…') : local('没有可用的执行结果。', 'No execution result is available.')}</p>}
    </div>}
  </div>;
}

export function ThinkingBlock({ text, defaultOpen = false, active = defaultOpen }) {
  const local = useLocale();
  const id = useId();
  const [open, toggle] = useDisclosure(false);
  const cleaned = String(text || '').replace(/(?:[`*]*)(?:Response|回答)[:：](?:[`*]*)\s*[\s\S]*$/i, '').replace(/^<think>/i, '').replace(/<\/think>$/i, '').trim();
  if (!cleaned) return null;
  return <div className="agent-thinking-step">
    <button type="button" className="agent-step-toggle" onClick={toggle} aria-expanded={open} aria-controls={id}>
      <span className="agent-step-icon">{active ? <Loader2 size={14} className="agent-activity-spinner" /> : <Brain size={14} strokeWidth={1.6} />}</span>
      <span>{active ? local('正在思考', 'Thinking') : local('思考过程', 'Thought process')}</span>
      <ChevronRight size={12} className={`agent-disclosure ${open ? 'is-open' : ''}`} />
    </button>
    {open && <div id={id} className="agent-thinking-detail"><ReactMarkdown remarkPlugins={[remarkGfm]}>{cleaned}</ReactMarkdown></div>}
  </div>;
}

function ToolBatch({ batch, activeKey, ...props }) {
  const local = useLocale();
  const id = useId();
  const active = batch.parts.some(part => part.key === activeKey);
  const [open, toggle] = useDisclosure(active);
  if (batch.parts.length === 1) return <ToolRow part={batch.parts[0]} active={active} {...props} />;
  const summary = activitySummary(batch.parts);
  return <div className="agent-tool-batch">
    <button type="button" className="agent-step-toggle agent-batch-toggle" onClick={toggle} aria-expanded={open} aria-controls={id}>
      <span className="agent-step-icon"><ActivityIcon part={batch.parts[0]} state={active ? 'running' : 'done'} /></span>
      <span>{summaryText(summary.counts, local)}</span>
      <ChangeCount {...summary} />
      {summary.errors > 0 && <span className="agent-error-count">{local(`${summary.errors} 项失败`, `${summary.errors} failed`)}</span>}
      <ChevronRight size={12} className={`agent-disclosure ${open ? 'is-open' : ''}`} />
    </button>
    {open && <div id={id} className="agent-batch-children">{batch.parts.map(part => <ToolRow key={part.key} part={part} active={part.key === activeKey} {...props} />)}</div>}
  </div>;
}

function ActivityGroup({ parts, activeKey, status, durationMs, ...props }) {
  const local = useLocale();
  const id = useId();
  const active = parts.some(part => part.key === activeKey);
  const [open, toggle] = useDisclosure(active);
  if (parts.length === 1) {
    const part = parts[0];
    return <section className="agent-activity-group" aria-label={local('执行过程', 'Agent activity')}>
      {part.type === 'reasoning'
        ? <ThinkingBlock text={part.content} active={active} />
        : <ToolRow part={part} active={active} {...props} />}
    </section>;
  }
  const summary = activitySummary(parts);
  const unfinished = summary.interrupted > 0 || ['interrupted', 'error', 'pending', 'paused'].includes(status);
  const label = active ? local(`正在执行 · ${summary.steps} 个步骤`, `Working · ${summary.steps} steps`)
    : summary.approvals ? local('等待批准', 'Waiting for approval')
      : unfinished || summary.errors ? local(`执行了 ${summary.steps} 个步骤`, `${summary.steps} steps`)
        : local(`已完成 ${summary.steps} 个步骤`, `Completed ${summary.steps} steps`);
  const duration = Number(durationMs) > 0 ? Math.round(durationMs / 1000) : 0;
  return <section className="agent-activity-group" aria-label={local('执行过程', 'Agent activity')}>
    <button type="button" className="agent-activity-summary" onClick={toggle} aria-expanded={open} aria-controls={id}>
      {active ? <Loader2 size={13} className="agent-activity-spinner" /> : <GitBranch size={13} strokeWidth={1.6} />}
      <span>{label}</span>
      {duration > 0 && !active && <span className="agent-duration">{duration >= 60 ? `${Math.floor(duration / 60)}m ${duration % 60}s` : `${duration}s`}</span>}
      <ChangeCount {...summary} />
      {summary.errors > 0 && <span className="agent-error-count">{local(`${summary.errors} 项失败`, `${summary.errors} failed`)}</span>}
      {unfinished && !active && <span className="agent-step-status">{local('未完成', 'Incomplete')}</span>}
      <ChevronRight size={12} className={`agent-disclosure ${open ? 'is-open' : ''}`} />
    </button>
    {!open && <div className="agent-activity-caption">{summaryText(summary.counts, local) || local('查看思考过程', 'View thought process')}</div>}
    {open && <div id={id} className="agent-activity-timeline">{activityBatches(parts).map(batch => batch.category === 'reasoning'
      ? <ThinkingBlock key={batch.key} text={batch.parts[0].content} active={batch.key === activeKey} />
      : <ToolBatch key={batch.key} batch={batch} activeKey={activeKey} {...props} />)}</div>}
  </section>;
}

export default function AgentMessageParts({ parts = [], streamingActions = [], isGenerating = false, status, durationMs, renderText, ...props }) {
  const segments = activitySegments(parts, streamingActions);
  const last = segments.at(-1);
  const activeKey = isGenerating && last?.type === 'activity' ? last.parts.at(-1)?.key : null;
  const groups = segments.filter(segment => segment.type === 'activity').length;
  return <div className="agent-message-parts">{segments.map(segment => segment.type === 'text'
    ? <React.Fragment key={segment.key}>{renderText(segment.part)}</React.Fragment>
    : <ActivityGroup key={segment.key} parts={segment.parts} activeKey={activeKey} status={status} durationMs={groups === 1 ? durationMs : undefined} {...props} />)}</div>;
}
