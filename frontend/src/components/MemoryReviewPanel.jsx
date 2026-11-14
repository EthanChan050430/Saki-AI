import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { BrainCircuit, Check, Loader2, RefreshCw, Save, Trash2, Sparkles } from 'lucide-react';
import { BACKEND_URL } from '../utils/backendUrl';
import { localizeWith } from '../utils/localize';

const localDay = () => {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
};
const itemGroups = [
  { key: 'memoryCandidates', title: ['事实记忆', 'Fact memories', '事実記憶'], kind: 'memory' },
  { key: 'entities', title: ['知识实体', 'Knowledge entities', '知識エンティティ'], kind: 'entity' },
  { key: 'relations', title: ['知识关系', 'Knowledge relations', '知識関係'], kind: 'relation' },
];
const field = (name, value, change, multi = false, label = '') => (
  <label key={name} className="block min-w-0 space-y-1">
    <span className="text-[11px] font-semibold text-[var(--text-tertiary)]">{label || name}</span>
    {multi ? (
      <textarea rows={2} className="w-full rounded-lg border border-[var(--surface-border-subtle)] bg-[var(--surface-bg)] px-2.5 py-2 text-sm outline-none focus:border-saki-pink/60 resize-y"
        value={value ?? ''} onChange={e => change(name, e.target.value)} />
    ) : (
      <input className="w-full rounded-lg border border-[var(--surface-border-subtle)] bg-[var(--surface-bg)] px-2.5 py-2 text-sm outline-none focus:border-saki-pink/60"
        value={value ?? ''} onChange={e => change(name, e.target.value)} />
    )}
  </label>
);

function CandidateEditor({ item, kind, onChange, translate }) {
  const update = (key, value) => onChange({ ...item, [key]: value });
  return (
    <div className={`rounded-xl border p-3 space-y-2 ${item.selected ? 'border-saki-pink/30 bg-saki-pink/5' : 'border-[var(--surface-border-subtle)] bg-[var(--surface-bg-light)]'}`}>
      <label className="flex items-center gap-2 text-sm font-semibold text-[var(--text-dark)] cursor-pointer">
        <input type="checkbox" checked={!!item.selected} onChange={e => update('selected', e.target.checked)} />
        {translate('选择保存', 'Approve', '保存を承認')}
      </label>
      {kind === 'memory' ? (
        <>
          {field('name', item.name, update, false, translate('记忆名称', 'Name', '名前'))}
          {field('summary', item.summary, update, false, translate('摘要', 'Summary', '要約'))}
          {field('content', item.content, update, true, translate('事实内容（可校正）', 'Fact (editable)', '記憶内容'))}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {field('category', item.category, update, false, translate('分类', 'Category', '分類'))}
            {field('factKey', item.factKey, update, false, translate('事实键（可选）', 'Fact key (optional)', 'ファクトキー'))}
          </div>
          {item.evidenceText && <div className="rounded-lg bg-[var(--surface-inset)] px-2.5 py-2 text-xs text-[var(--text-secondary)] break-words">
            <span className="font-semibold">{translate('用户原话：', 'User evidence: ', 'ユーザーの根拠：')}</span>{item.evidenceText}
          </div>}
        </>
      ) : kind === 'entity' ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {field('name', item.name, update)}
            {field('type', item.type, update)}
          </div>
          {field('summary', item.summary, update, true)}
          {field('status', item.status, update)}
          {field('evidence', item.evidence, update, true)}
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {field('subject', item.subject, update)}
            {field('predicate', item.predicate, update)}
            {field('object', item.object, update)}
            {field('objectType', item.objectType, update)}
          </div>
          {field('evidence', item.evidence, update, true)}
        </>
      )}
      {kind !== 'memory' && <p className="text-[11px] text-amber-600">
        {translate('知识图谱建议默认不勾选，请核实来源再批准。', 'Graph proposals are unchecked until you verify them.', '知識グラフは確認後に承認してください。')}
      </p>}
    </div>
  );
}

export default function MemoryReviewPanel({ onMemoriesChanged, language = 'zh' }) {
  const translate = (zh, en, ja) => localizeWith(language, zh, en, ja);
  const [overview, setOverview] = useState(null);
  const [draft, setDraft] = useState(null);
  const [pendingChanges, setPendingChanges] = useState({});
  const [day, setDay] = useState(localDay);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`${BACKEND_URL}/api/memory/review`);
      setOverview(data);
      setDraft(data.draft || null);
      setPendingChanges(current => Object.fromEntries((data.pending || []).map(item => [
        item.id, current[item.id] || {
          name: item.name || `${item.category || 'Memory'}: ${item.topicLabel || item.summary || item.id}`,
          content: item.content || '',
          summary: item.summary || '',
          category: item.category || 'general',
          factKey: item.factKey || '',
        },
      ])));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const action = async (label, task) => {
    setBusy(label);
    setError('');
    setNotice('');
    try {
      const message = await task();
      if (message) setNotice(message);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setBusy('');
    }
  };

  const generate = () => action('generate', async () => {
    const { data } = await axios.post(`${BACKEND_URL}/api/memory/review/generate`, { dateKey: day }, { timeout: 240000 });
    setDraft(data.draft);
    setOverview(prev => ({ ...prev, draft: data.draft }));
    return translate('已生成待审核草稿，不会自动写入长期记忆。', 'Draft ready. Nothing has been committed.', '下書きを生成しました。');
  });
  const updateItem = (key, id, value) => setDraft(current => ({
    ...current,
    [key]: current[key].map(item => item.id === id ? value : item),
  }));
  const saveDraft = async () => {
    if (!draft) throw new Error('No review draft');
    const { data } = await axios.patch(`${BACKEND_URL}/api/memory/review/draft`, {
      draftId: draft.id, summary: draft.summary,
      memoryCandidates: draft.memoryCandidates, entities: draft.entities, relations: draft.relations,
    });
    setDraft(data.draft);
    return data.draft;
  };
  const commit = () => action('commit', async () => {
    const selectedCount = [...draft.memoryCandidates, ...draft.entities, ...draft.relations].filter(item => item.selected).length;
    if (!window.confirm(translate(
      `确认将勾选的 ${selectedCount} 条建议写入记忆吗？`,
      `Commit ${selectedCount} selected proposals to memory?`,
      `${selectedCount} 件の候補を保存しますか？`,
    ))) return '';
    const saved = await saveDraft();
    const { data } = await axios.post(`${BACKEND_URL}/api/memory/review/commit`, { draftId: saved.id });
    await load();
    onMemoriesChanged?.();
    return translate(`已保存 ${data.savedCount} 条记忆、${data.entityCount} 个实体、${data.relationCount} 条关系。`,
      `Saved ${data.savedCount} memories, ${data.entityCount} entities and ${data.relationCount} relations.`,
      '保存が完了しました。');
  });
  const discard = () => action('discard', async () => {
    if (!window.confirm(translate('确定丢弃整份反思草稿？', 'Discard the entire draft?', '下書きを破棄しますか？'))) return '';
    await axios.delete(`${BACKEND_URL}/api/memory/review/draft/${encodeURIComponent(draft.id)}`);
    await load();
    return translate('草稿已丢弃。', 'Draft discarded.', '下書きを破棄しました。');
  });
  const decidePending = (candidate, actionType) => action(`pending-${candidate.id}`, async () => {
    if (actionType === 'discard' && !window.confirm(translate('确定丢弃这条待整理记忆？', 'Discard this candidate?', 'この候補を破棄しますか？'))) return '';
    await axios.post(`${BACKEND_URL}/api/memory/review/pending/${encodeURIComponent(candidate.id)}`, {
      action: actionType, changes: pendingChanges[candidate.id] || {},
    });
    await load();
    onMemoriesChanged?.();
    return actionType === 'approve' ? translate('已核对并保存记忆。', 'Memory approved.', '記憶を保存しました。')
      : translate('已丢弃候选。', 'Candidate discarded.', '候補を破棄しました。');
  });

  const pending = overview?.pending || [];
  const model = overview?.model;
  const external = model && !['ollama', 'lmstudio'].includes(model.provider);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar text-[var(--text-dark)]">
      <div className="rounded-2xl border border-[var(--surface-border-subtle)] bg-[var(--surface-bg-light)] p-4 space-y-3">
        <div className="flex items-center gap-2 font-bold text-sm"><BrainCircuit size={18} className="text-[var(--accent-text)]" />
          {translate('手动 AI 反思', 'Manual AI reflection', '手動AI振り返り')}
        </div>
        <p className="text-xs text-[var(--text-secondary)]">
          {translate('只在点击时生成建议；全部结果先进入草稿，必须人工审核后才会写入。', 'Generate suggestions only when clicked. Review every draft before committing.', '手動実行後、確認した内容のみ保存されます。')}
        </p>
        <p className="text-xs font-semibold">{translate('当前模型：', 'Current model: ', '現在のモデル：')}
          {model ? `${model.provider} / ${model.model}` : translate('尚未配置', 'Not configured', '未設定')}
        </p>
        {external && <p className="text-xs text-amber-600">
          {translate('注意：点击生成会把所选日期的对话摘要和工作区文件片段发送给当前 API 提供商，可能产生费用。', 'Generating will send summaries and workspace excerpts to the configured API provider and may incur charges.', '実行時に会話とファイルの要約がAPIに送信され、料金が発生する場合があります。')}
        </p>}
        <div className="flex gap-2 flex-wrap items-center">
          <input type="date" value={day} onChange={e => setDay(e.target.value)}
            className="rounded-lg border border-[var(--surface-border-subtle)] bg-[var(--surface-bg)] px-3 py-2 text-xs" />
          <button disabled={!!busy || !model || !!draft} onClick={generate}
            className="flex items-center gap-1.5 rounded-lg bg-saki-pink px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
            {busy === 'generate' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {translate('生成反思建议', 'Generate suggestions', '候補を生成')}
          </button>
          <button disabled={!!busy} onClick={load}
            className="flex items-center gap-1 rounded-lg border border-[var(--surface-border-subtle)] px-3 py-2 text-xs">
            <RefreshCw size={13}/>{translate('刷新', 'Refresh', '更新')}
          </button>
        </div>
      </div>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 break-words">{error}</div>}
      {notice && <div role="status" className="rounded-lg bg-[var(--surface-bg-light)] p-3 text-xs">{notice}</div>}
      {loading && <div className="text-xs text-[var(--text-tertiary)]">{translate('正在加载…', 'Loading…', '読み込み中…')}</div>}

      {draft && <div className="rounded-2xl border border-saki-pink/25 p-4 space-y-4">
        <div className="flex flex-wrap justify-between gap-2">
          <h4 className="text-sm font-bold">{translate('待审核反思草稿', 'Reflection draft', '確認待ちの下書き')} · {draft.dateKey}</h4>
          <span className="text-xs text-[var(--text-tertiary)]">{draft.selection?.provider} / {draft.selection?.model}</span>
        </div>
        <label className="block space-y-1">
          <span className="text-xs text-[var(--text-tertiary)]">{translate('整体摘要（可修改）', 'Overview (editable)', '要約')}</span>
          <textarea rows={3} value={draft.summary || ''} onChange={e => setDraft({ ...draft, summary: e.target.value })}
            className="w-full rounded-lg border border-[var(--surface-border-subtle)] bg-[var(--surface-bg)] p-2 text-sm resize-y" />
        </label>
        {itemGroups.map(group => <div key={group.key} className="space-y-2">
          <h5 className="text-xs font-bold">{translate(...group.title)} ({(draft[group.key] || []).length})</h5>
          {(draft[group.key] || []).map(item => <CandidateEditor key={item.id} item={item} kind={group.kind}
            translate={translate} onChange={value => updateItem(group.key, item.id, value)} />)}
        </div>)}
        <div className="flex flex-wrap justify-end gap-2">
          <button disabled={!!busy} onClick={() => action('save', async () => { await saveDraft(); return translate('草稿已保存。', 'Draft saved.', '保存しました。'); })}
            className="flex items-center gap-1 rounded-lg border border-[var(--surface-border-subtle)] px-3 py-2 text-xs font-semibold disabled:opacity-50"><Save size={14}/>{translate('保存草稿', 'Save draft', '下書き保存')}</button>
          <button disabled={!!busy || draft.status === 'committing'} onClick={discard}
            className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs text-red-600 disabled:opacity-50"><Trash2 size={14}/>{translate('丢弃草稿', 'Discard', '破棄')}</button>
          <button disabled={!!busy} onClick={commit}
            className="flex items-center gap-1 rounded-lg bg-saki-pink px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Check size={14}/>{translate('确认并写入记忆', 'Approve and commit', '確認して保存')}</button>
        </div>
      </div>}

      <div className="space-y-3">
        <h4 className="text-sm font-bold">{translate('睡眠队列 · 人工整理', 'Pending memories · manual review', '保留中の記憶')} ({pending.length})</h4>
        {!pending.length && <p className="text-xs text-[var(--text-tertiary)]">{translate('暂时没有待整理记忆。', 'No pending memories.', '保留中の記憶はありません。')}</p>}
        {pending.map(candidate => {
          const edited = pendingChanges[candidate.id] || {};
          const setEdited = (key, value) => setPendingChanges(current => ({
            ...current, [candidate.id]: { ...(current[candidate.id] || {}), [key]: value },
          }));
          return <div key={candidate.id} className="rounded-xl border border-[var(--surface-border-subtle)] p-3 space-y-2">
            <div className="flex flex-wrap justify-between gap-1 text-xs">
              <span className="font-semibold">{candidate.topicLabel || candidate.name || candidate.category}</span>
              <span className="text-[var(--text-tertiary)]">{candidate.source || 'queue'}</span>
            </div>
            {field('name', edited.name, setEdited, false, translate('名称', 'Name', '名前'))}
            {field('summary', edited.summary, setEdited, true, translate('摘要', 'Summary', '要約'))}
            {field('content', edited.content, setEdited, true, translate('内容（可校正）', 'Content (editable)', '内容'))}
            {field('factKey', edited.factKey, setEdited, false, translate('事实键（可选）', 'Fact key (optional)', 'ファクトキー'))}
            <div className="flex justify-end gap-2">
              <button disabled={!!busy} onClick={() => decidePending(candidate, 'discard')}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 disabled:opacity-50">{translate('丢弃', 'Discard', '破棄')}</button>
              <button disabled={!!busy} onClick={() => decidePending(candidate, 'approve')}
                className="rounded-lg bg-saki-pink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{translate('校正并保存', 'Approve', '承認して保存')}</button>
            </div>
          </div>;
        })}
      </div>
    </div>
  );
}
