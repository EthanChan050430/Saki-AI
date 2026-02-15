import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Brain, Plus, Trash2, Edit2, Save, FileText, History, Clock, Search, ChevronRight } from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = `${window.location.protocol}//${window.location.hostname}:3000`;

export default function MemoryManagerModal({ isOpen, onClose, chatHistory }) {
  const { t } = useTranslation();
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({ name: '', content: '' });
  const [showHistorySelector, setShowHistorySelector] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchMemories = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${BACKEND_URL}/api/memories`);
      setMemories(res.data);
    } catch (err) {
      console.error('Failed to fetch memories:', err);
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
      .map(m => `${m.role === 'user' ? '用户' : 'Agent'}: ${m.content || m.parts?.map(p => p.content).join('')}`)
      .join('\n');
    setEditData(prev => ({
      ...prev,
      content: prev.content + (prev.content ? '\n\n' : '') + `--- 来自对话: ${fullChat.title || fullChat.id} ---\n` + chatContent
    }));
    setShowHistorySelector(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[150] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col h-[80vh]">
        {/* Header */}
        <div className="p-6 border-b flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-purple-600">
              <Brain size={24} />
            </div>
            <div>
              <h3 className="font-bold text-gray-800 text-lg">{t('memory')}</h3>
              <p className="text-xs text-gray-500">{t('memory_manager_desc')}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex">
          {isEditing ? (
            <div className="flex-1 flex flex-col p-6 space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">{t('memory_name')}</label>
                  <input 
                    type="text"
                    className="w-full border-2 border-gray-100 rounded-xl px-4 py-2.5 text-sm focus:border-purple-400 focus:ring-0 outline-none transition-all"
                    placeholder="例如: 饮食偏好, 工作习惯..."
                    value={editData.name}
                    onChange={(e) => setEditData({...editData, name: e.target.value})}
                  />
                </div>
                <div className="pt-5">
                   <button 
                     onClick={() => setShowHistorySelector(true)}
                     className="flex items-center gap-2 px-4 py-2.5 bg-purple-50 text-purple-600 rounded-xl text-sm font-bold hover:bg-purple-100 transition-all active:scale-95"
                   >
                     <History size={16} />
                     {t('save_from_history')}
                   </button>
                </div>
              </div>

              <div className="flex-1 flex flex-col">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">{t('memory_content')}</label>
                <textarea 
                  className="flex-1 w-full border-2 border-gray-100 rounded-2xl px-4 py-3 text-sm focus:border-purple-400 focus:ring-0 outline-none transition-all resize-none font-medium custom-scrollbar"
                  placeholder="在此输入需要 Agent 长期记住的内容..."
                  value={editData.content}
                  onChange={(e) => setEditData({...editData, content: e.target.value})}
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button 
                  onClick={() => setIsEditing(false)}
                  className="px-6 py-2.5 text-gray-500 font-bold text-sm hover:bg-gray-100 rounded-xl transition-all"
                >
                  {t('cancel')}
                </button>
                <button 
                  onClick={handleSave}
                  className="px-8 py-2.5 bg-purple-600 text-white font-bold text-sm rounded-xl shadow-lg shadow-purple-200 hover:bg-purple-700 transition-all active:scale-95 flex items-center gap-2"
                >
                  <Save size={18} />
                  {t('save')}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
               <div className="p-4 bg-white border-b flex items-center justify-between gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input 
                      type="text" 
                      placeholder={t('search_file_placeholder')}
                      className="w-full pl-10 pr-4 py-2 bg-gray-100/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <button 
                    onClick={handleCreate}
                    className="bg-purple-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-purple-700 shadow-lg shadow-purple-100 transition-all active:scale-95 flex items-center gap-2 shrink-0"
                  >
                    <Plus size={18} />
                    {t('new_memory')}
                  </button>
               </div>

               <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                  {loading ? (
                    <div className="flex items-center justify-center h-40">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
                    </div>
                  ) : memories.length === 0 ? (
                    <div className="text-center py-20 text-gray-400">
                      <Brain size={48} className="mx-auto mb-4 opacity-10" />
                      <p className="text-sm font-medium">{t('no_history')}</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {memories.filter(m => m.name.includes(searchQuery)).map(memory => (
                        <div key={memory.name} className="group p-5 bg-white border-2 border-gray-50 rounded-2xl hover:border-purple-200 hover:shadow-xl transition-all flex flex-col gap-3 relative">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-400 group-hover:bg-purple-100 group-hover:text-purple-600 transition-colors">
                                <FileText size={20} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-800 truncate">{memory.name}</p>
                                <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-1">
                                  <Clock size={10} />
                                  {memory.time}
                                </div>
                              </div>
                            </div>
                          </div>
                          <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed italic">
                            "{memory.preview}"
                          </p>
                          <div className="pt-2 flex items-center justify-between border-t border-gray-50">
                             <span className="text-[10px] font-bold text-gray-300 uppercase tracking-tighter">{memory.size}</span>
                             <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => handleEdit(memory)} className="p-1.5 hover:bg-purple-50 text-purple-500 rounded-lg transition-colors">
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
            </div>
          )}
        </div>

        {/* History Selector Overlay */}
        {showHistorySelector && (
          <div className="absolute inset-0 bg-white z-[160] flex flex-col animate-in fade-in slide-in-from-bottom-8 duration-300">
             <div className="p-6 border-b flex items-center justify-between bg-gray-50">
                <div className="flex items-center gap-3">
                  <ArrowLeftButton onClick={() => setShowHistorySelector(false)} />
                  <h4 className="font-bold text-gray-800">{t('save_from_history')}</h4>
                </div>
                <button onClick={() => setShowHistorySelector(false)} className="p-2 hover:bg-gray-200 rounded-full">
                  <X size={20} />
                </button>
             </div>
             <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                {(chatHistory || []).map(chat => (
                  <button 
                    key={chat.id}
                    onClick={() => handleSelectHistory(chat)}
                    className="w-full p-4 bg-white border border-gray-100 rounded-xl hover:border-purple-300 hover:bg-purple-50 transition-all flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                       <History size={18} className="text-gray-400 group-hover:text-purple-500" />
                       <div className="text-left min-w-0">
                         <div className="text-sm font-bold text-gray-700 truncate">{chat.title || chat.id}</div>
                         <div className="text-[10px] text-gray-400 mt-0.5">{chat.messagesCount || chat.messages?.length || 0} 条消息</div>
                       </div>
                    </div>
                    <ChevronRight size={16} className="text-gray-300 group-hover:text-purple-400" />
                  </button>
                ))}
             </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ArrowLeftButton({ onClick }) {
  return (
    <button onClick={onClick} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
      <ArrowLeft size={20} className="text-gray-600" />
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
