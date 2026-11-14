import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Brain, Plus, Trash2, Edit2, Save, FileText, History, Clock, Search, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { BACKEND_URL } from '../utils/backendUrl';
import { modalBackdropMotion, modalPanelMotion } from '../utils/modalMotion';
import { localizeWith } from '../utils/localize';
import MemoryReviewPanel from './MemoryReviewPanel';

const CATEGORY_JA = {
  project: 'プロジェクト',
  general: '一般',
  preference: '好み',
  person: '人物',
  fact: '事実',
  skill: 'スキル',
  knowledge: '知識',
};

export default function MemoryManagerModal({ isOpen, onClose, chatHistory, windowed = false }) {
  const { t, i18n } = useTranslation();
  const getLocalText = (zhText, enText, jaText) => localizeWith(i18n.resolvedLanguage || i18n.language, zhText, enText, jaText);
  const [memories, setMemories] = useState([]);
  const [systemMeta, setSystemMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({ name: '', content: '' });
  const [showHistorySelector, setShowHistorySelector] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [reviewMode, setReviewMode] = useState(false);

  const fetchMemories = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${BACKEND_URL}/api/memories`);
      const nextMemories = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data?.memories)
          ? res.data.memories
          : [];
      setMemories(nextMemories);
      setSystemMeta(res.data?.system || null);
    } catch (err) {
      console.error('Failed to fetch memories:', err);
      setMemories([]);
      setSystemMeta(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMemories();
    }
  }, [isOpen]);

  const handleCreate = () => {
    setEditData({ name: '', content: '' });
    setIsEditing(true);
  };

  const handleEdit = (memory) => {
    // We fetch full content from the new memory-specific endpoint
    axios.get(`${BACKEND_URL}/api/memories/${memory.fileName}`).then(res => {
      setEditData({ name: memory.name, content: res.data.content });
      setIsEditing(true);
    }).catch(err => {
      console.error('Failed to fetch memory content:', err);
      alert(t('read_fail'));
    });
  };

  const handleSave = async () => {
    if (!editData.name || !editData.content) return;
    try {
      await axios.post(`${BACKEND_URL}/api/memories`, editData);
      setIsEditing(false);
      fetchMemories();
    } catch (err) {
      console.error('Failed to save memory:', err);
      alert(t('save_fail'));
    }
  };

  const handleDelete = async (fileName, displayName) => {
    if (!window.confirm(t('delete_confirm', { name: displayName }))) return;
    try {
      await axios.delete(`${BACKEND_URL}/api/memories/${fileName}`);
      fetchMemories();
    } catch (err) {
      console.error('Failed to delete memory:', err);
      alert(t('delete_fail'));
    }
  };

  const handleSelectHistory = async (chat) => {
    let fullChat = { ...chat };
    if (!chat.messages) {
      try {
        const res = await axios.get(`${BACKEND_URL}/api/history/${chat.id}`);
        fullChat = { ...chat, ...res.data };
      } catch (err) {
        console.error('Failed to fetch full history:', err);
        return;
      }
    }

    if (!fullChat.messages) return;

    const chatContent = fullChat.messages
      .map(m => `${m.role === 'user' ? getLocalText('用户', 'User') : 'Agent'}: ${m.content || m.parts?.map(p => p.content).join('')}`)
      .join('\n');
    setEditData(prev => ({
      ...prev,
      content: prev.content + (prev.content ? '\n\n' : '') + getLocalText(`--- 来自对话: ${fullChat.title || fullChat.id} ---\n`, `--- From conversation: ${fullChat.title || fullChat.id} ---\n`) + chatContent
    }));
    setShowHistorySelector(false);
  };

  if (!isOpen) return null;

  const safeMemories = Array.isArray(memories) ? memories : [];
  const normalizedSearch = String(searchQuery || '').trim().toLowerCase();
  const filteredMemories = safeMemories.filter(memory => {
    const name = String(memory?.name || '').toLowerCase();
    const preview = String(memory?.preview || '').toLowerCase();
    const category = String(memory?.category || '').toLowerCase();
    if (!normalizedSearch) return true;
    return name.includes(normalizedSearch) || preview.includes(normalizedSearch) || category.includes(normalizedSearch);
  });

  return (
    <motion.div
      className={windowed ? 'h-full w-full' : 'fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-md p-0 sm:p-4'}
      {...(!windowed ? modalBackdropMotion : {})}
      onClick={!windowed ? onClose : undefined}
    >
      <motion.div data-saki-dialog="true"
        className={windowed ? 'bg-[var(--surface-bg)]  rounded-[28px] w-full h-full shadow-none overflow-hidden flex flex-col text-[var(--text-dark)] ' : 'bg-[var(--surface-bg)]  rounded-none sm:rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col h-full sm:h-[80vh] text-[var(--text-dark)] '}
        {...(!windowed ? modalPanelMotion : {})}
        onClick={!windowed ? (event) => event.stopPropagation() : undefined}
      >
        <div className="px-4 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] sm:pt-2.5 border-b flex items-center justify-between bg-[var(--surface-bg-light)] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-saki-pink/15 flex items-center justify-center text-[var(--accent-text)] shrink-0">
              <Brain size={17} />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-[var(--text-dark)] text-sm sm:text-base leading-tight truncate">{t('memory')}</h3>
              <p className="text-[11px] text-[var(--text-secondary)] leading-tight truncate">{t('memory_manager_desc')}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-[var(--surface-inset)] rounded-lg transition-colors shrink-0">
            <X size={16} className="text-[var(--text-secondary)]" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex">
          {isEditing ? (
            <div className="flex-1 flex flex-col p-4 sm:p-6 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-4 animate-in fade-in slide-in-from-right-4 duration-300 overflow-y-auto">
              <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4">
                <div className="flex-1 min-w-0">
                  <label className="block text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-1.5">{t('memory_name')}</label>
                  <input 
                    type="text"
                    className="w-full border-2 border-[var(--surface-border-subtle)] rounded-xl px-4 py-2.5 text-base sm:text-sm focus:border-saki-pink focus:ring-0 outline-none transition-all"
                    placeholder="例如: 饮食偏好, 工作习惯..."
                    value={editData.name}
                    onChange={(e) => setEditData({...editData, name: e.target.value})}
                  />
                </div>
                <div className="shrink-0">
                   <button 
                     onClick={() => setShowHistorySelector(true)}
                     className="flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2.5 bg-saki-pink/10 text-[var(--accent-text)] rounded-xl text-sm font-bold hover:bg-saki-pink/15 transition-all active:scale-95"
                   >
                     <History size={16} />
                     {t('save_from_history')}
                   </button>
                </div>
              </div>

              <div className="flex-1 flex flex-col min-h-[12rem]">
                <label className="block text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-1.5">{t('memory_content')}</label>
                <textarea 
                  className="flex-1 w-full border-2 border-[var(--surface-border-subtle)] rounded-2xl px-4 py-3 text-base sm:text-sm focus:border-saki-pink focus:ring-0 outline-none transition-all resize-none font-medium custom-scrollbar"
                  placeholder="在此输入需要 Agent 长期记住的内容..."
                  value={editData.content}
                  onChange={(e) => setEditData({...editData, content: e.target.value})}
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button 
                  onClick={() => setIsEditing(false)}
                  className="px-6 py-2.5 text-[var(--text-secondary)] font-bold text-sm hover:bg-[var(--surface-bg-light)] rounded-xl transition-all"
                >
                  {t('cancel')}
                </button>
                <button 
                  onClick={handleSave}
                  className="px-8 py-2.5 bg-saki-pink text-white font-bold text-sm rounded-xl shadow-lg shadow-purple-200 hover:bg-saki-pink transition-all active:scale-95 flex items-center gap-2"
                >
                  <Save size={18} />
                  {t('save')}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-4 pt-3 flex gap-2 border-b border-[var(--surface-border-subtle)] overflow-x-auto no-scrollbar shrink-0">
                <button type="button" onClick={() => setReviewMode(false)}
                  className={`px-3 py-2 text-xs font-bold whitespace-nowrap rounded-t-lg ${!reviewMode ? 'bg-saki-pink/10 text-[var(--accent-text)] border-b-2 border-saki-pink' : 'text-[var(--text-secondary)]'}`}>
                  {getLocalText('记忆列表', 'Saved memories', '保存済みの記憶')}
                </button>
                <button type="button" onClick={() => setReviewMode(true)}
                  className={`px-3 py-2 text-xs font-bold whitespace-nowrap rounded-t-lg ${reviewMode ? 'bg-saki-pink/10 text-[var(--accent-text)] border-b-2 border-saki-pink' : 'text-[var(--text-secondary)]'}`}>
                  {getLocalText('手动整理与校正', 'Review & correct', '手動整理と修正')}
                </button>
              </div>
              {reviewMode ? (
                <MemoryReviewPanel onMemoriesChanged={fetchMemories} language={i18n.resolvedLanguage || i18n.language} />
              ) : (
                <>
               <div className="px-4 py-2.5 bg-[var(--surface-bg)] border-b flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 sm:gap-3 shrink-0">
                  <div className="relative flex-1 min-w-[10rem]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={16} />
                    <input 
                      type="text" 
                      placeholder={t('search_file_placeholder')}
                      className="w-full pl-9 pr-4 py-1.5 bg-[var(--surface-bg-light)] rounded-xl text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-saki-pink/20 transition-all"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <button 
                    onClick={handleCreate}
                    className="bg-saki-pink text-white px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold hover:bg-saki-pink shadow-lg shadow-purple-100 transition-all active:scale-95 flex items-center gap-1.5 shrink-0"
                  >
                    <Plus size={16} />
                    {t('new_memory')}
                  </button>
               </div>

               <div className="flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3 custom-scrollbar">
                  {systemMeta && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
                      <div className="rounded-2xl border border-saki-pink/15 bg-saki-pink/10 px-4 py-3">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">{getLocalText('长期记忆', 'Long-Term', '長期記憶')}</div>
                        <div className="mt-1 text-2xl font-bold text-[var(--text-dark)]">{systemMeta.longTermCount ?? 0}</div>
                      </div>
                      <div className="rounded-2xl border border-saki-pink/15 bg-saki-pink/10 px-4 py-3">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">{getLocalText('短期记忆', 'Short-Term', '短期記憶')}</div>
                        <div className="mt-1 text-2xl font-bold text-[var(--text-dark)]">{systemMeta.shortTermTopicCount ?? 0}</div>
                      </div>
                      <div className="rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-3">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-500">{getLocalText('睡眠队列', 'Sleep Queue', '睡眠キュー')}</div>
                        <div className="mt-1 text-2xl font-bold text-[var(--text-dark)]">{systemMeta.pendingQueueSize ?? 0}</div>
                      </div>
                      <div className="rounded-2xl border border-[var(--surface-border-subtle)] bg-[var(--surface-bg-light)] px-4 py-3">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">{getLocalText('上次睡眠', 'Last Sleep', '前回の睡眠')}</div>
                        <div className="mt-1 text-xs font-semibold text-[var(--text-dark)] break-all">
                          {systemMeta.lastSleepCycleAt || getLocalText('尚未运行', 'Not run yet', '未実行')}
                        </div>
                      </div>
                    </div>
                  )}
                  {loading ? (
                    <div className="flex items-center justify-center h-40">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-saki-pink"></div>
                    </div>
                  ) : safeMemories.length === 0 ? (
                    <div className="text-center py-20 text-[var(--text-tertiary)]">
                      <Brain size={48} className="mx-auto mb-4 opacity-10" />
                      <p className="text-sm font-medium">{t('no_history')}</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredMemories.map(memory => (
                        <div key={memory.name} className="group p-5 bg-[var(--surface-bg)] border-2 border-[var(--surface-border-subtle)] rounded-2xl hover:border-saki-pink/25 hover:shadow-xl transition-all flex flex-col gap-3 relative">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-saki-pink/10 flex items-center justify-center text-[var(--accent-text)] group-hover:bg-saki-pink/15 group-hover:text-[var(--accent-text)] transition-colors">
                                <FileText size={20} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-[var(--text-dark)] truncate">{memory.name}</p>
                                <div className="flex items-center gap-2 text-[10px] text-[var(--text-tertiary)] mt-1">
                                  <Clock size={10} />
                                  {memory.time}
                                </div>
                              </div>
                            </div>
                          </div>
                          <p className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed italic">
                            "{memory.preview}"
                          </p>
                          <div className="flex items-center gap-2 flex-wrap">
                            {memory.category && (
                              <span className="px-2 py-1 rounded-full bg-saki-pink/10 text-[var(--accent-text)] text-[10px] font-bold uppercase tracking-wide">
                                {getLocalText(memory.category, memory.category, CATEGORY_JA[String(memory.category).toLowerCase()] || memory.category)}
                              </span>
                            )}
                            {memory.auto && (
                              <span className="px-2 py-1 rounded-full bg-orange-50 text-orange-600 text-[10px] font-bold uppercase tracking-wide">
                                {getLocalText('自动', 'auto', '自動')}
                              </span>
                            )}
                            {typeof memory.importance === 'number' && (
                              <span className="px-2 py-1 rounded-full bg-[var(--surface-bg-light)] text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-wide">
                                {getLocalText('重要度', 'imp', '重要度')} {memory.importance}
                              </span>
                            )}
                          </div>
                          <div className="pt-2 flex items-center justify-between border-t border-[var(--surface-border-subtle)]">
                             <span className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-tighter">{memory.size}</span>
                             <div className="saki-touch-visible flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                <button onClick={() => handleEdit(memory)} className="p-1.5 hover:bg-saki-pink/10 text-[var(--accent-text)] rounded-lg transition-colors">
                                  <Edit2 size={16} />
                                </button>
                                <button onClick={() => handleDelete(memory.fileName, memory.name)} className="p-1.5 hover:bg-red-50 text-red-400 rounded-lg transition-colors">
                                  <Trash2 size={16} />
                                </button>
                             </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
               </div>
                </>
              )}
            </div>
          )}
        </div>

        {showHistorySelector && (
          <div className="absolute inset-0 bg-[var(--surface-bg)] z-[160] flex flex-col animate-in fade-in slide-in-from-bottom-8 duration-300">
             <div className="px-4 py-2.5 border-b flex items-center justify-between bg-[var(--surface-bg-light)] shrink-0">
                <div className="flex items-center gap-2.5">
                  <ArrowLeftButton onClick={() => setShowHistorySelector(false)} />
                  <h4 className="font-bold text-sm sm:text-base text-[var(--text-dark)]">{t('save_from_history')}</h4>
                </div>
                <button onClick={() => setShowHistorySelector(false)} className="p-1.5 hover:bg-[var(--surface-inset)] rounded-lg">
                  <X size={16} />
                </button>
             </div>
             <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                {(chatHistory || []).map(chat => (
                  <button 
                    key={chat.id}
                    onClick={() => handleSelectHistory(chat)}
                    className="w-full p-4 bg-[var(--surface-bg)] border border-[var(--surface-border-subtle)] rounded-xl hover:border-saki-pink/40 hover:bg-saki-pink/10 transition-all flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                       <History size={18} className="text-[var(--text-tertiary)] group-hover:text-[var(--accent-text)]" />
                       <div className="text-left min-w-0">
                         <div className="text-sm font-bold text-[var(--text-dark)] truncate">{chat.title || chat.id}</div>
                         <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{chat.messagesCount || chat.messages?.length || 0} {getLocalText('条消息', 'messages')}</div>
                       </div>
                    </div>
                    <ChevronRight size={16} className="text-[var(--text-tertiary)] group-hover:text-[var(--accent-text)]" />
                  </button>
                ))}
             </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function ArrowLeftButton({ onClick }) {
  return (
    <button onClick={onClick} className="p-1.5 hover:bg-[var(--surface-inset)] rounded-lg transition-colors">
      <ArrowLeft size={16} className="text-[var(--text-secondary)]" />
    </button>
  );
}

function ArrowLeft({ size, className }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>
    </svg>
  );
}
