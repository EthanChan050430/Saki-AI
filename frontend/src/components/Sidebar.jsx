import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { Plus, MessageSquare, Settings as SettingsIcon, ChevronLeft, ChevronRight, Trash2, FolderOpen, Brain, Clock } from 'lucide-react';

export default function Sidebar({ isOpen, setOpen, history, currentChatId, onSelectChat, onDeleteChat, onNewChat, onOpenSettings, onOpenFileManager, onOpenMemoryManager, onOpenHostedTasks }) {
  const { t } = useTranslation();
  const [hasNewTaskResults, setHasNewTaskResults] = useState(false);

  useEffect(() => {
    const checkTasks = async () => {
      try {
        const res = await axios.get(`${window.location.protocol}//${window.location.hostname}:3000/api/hosted-tasks`);
        const data = res.data;
        const lastSeen = parseInt(localStorage.getItem('hostedTasksLastSeen') || '0');
        // Show bubble if there is a result newer than lastSeen
        const hasFresh = Array.isArray(data) && data.some(t => {
          if (!t.results || t.results.length === 0) return false;
          const last = t.results[0];
          return last.timestamp > lastSeen;
        });
        setHasNewTaskResults(hasFresh);
      } catch (e) {}
    };
    checkTasks();
    const interval = setInterval(checkTasks, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleSelectChat = (id) => {
    onSelectChat(id);
    if (window.innerWidth < 768) {
      setOpen(false);
    }
  };

  const handleNewChat = () => {
    onNewChat();
    if (window.innerWidth < 768) {
      setOpen(false);
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <div className={`flex flex-col border-r border-white/10 bg-black/40 backdrop-blur-md text-white transition-all duration-300 z-50 
        ${isOpen ? 'w-64 translate-x-0' : 'w-0 -translate-x-full md:translate-x-0 overflow-hidden'} 
        ${'fixed h-full md:relative md:flex'}`}>
        <div className="p-4 flex flex-col h-full overflow-hidden whitespace-nowrap bg-black/20">
          <button 
            onClick={handleNewChat}
            className="flex items-center gap-2 w-full p-2.5 border border-white/20 bg-white/5 rounded-lg hover:bg-white/10 transition-colors shadow-sm mb-4"
          >
            <Plus size={18} />
            <span className="text-sm font-medium">{t('new_chat')}</span>
          </button>

          <div className="flex-1 overflow-y-auto space-y-1 scrollbar-hide py-2 text-white/80">
            {history.length === 0 ? (
              <div className="text-gray-400 text-sm p-2 text-center">{t('no_history')}</div>
            ) : (
              history.map(item => (
                <div 
                  key={item.id} 
                  className={`group flex items-center gap-2 w-full p-2.5 rounded-lg hover:bg-white/10 text-white/60 text-sm cursor-pointer transition-colors ${currentChatId === item.id ? 'bg-white/20 text-white shadow-inner' : ''}`}
                  onClick={() => handleSelectChat(item.id)}
                >
                  <MessageSquare size={16} className={`shrink-0 ${currentChatId === item.id ? 'text-blue-300' : ''}`} />
                  <span className={`flex-1 truncate ${currentChatId === item.id ? 'font-medium' : ''}`}>{item.title}</span>
                  <button 
                    onClick={(e) => onDeleteChat(e, item.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-300 transition-all rounded"
                    title={t('delete')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="pt-4 border-t border-white/10 space-y-1">
            <button 
              onClick={() => {
                onOpenMemoryManager();
                if (window.innerWidth < 768) {
                  setOpen(false);
                }
              }}
              className="flex items-center gap-2 w-full p-2.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            >
              <Brain size={18} />
              <span className="text-sm font-medium">{t('memory')}</span>
            </button>
            <button 
              onClick={() => {
                localStorage.setItem('hostedTasksLastSeen', Date.now().toString());
                setHasNewTaskResults(false);
                onOpenHostedTasks();
                if (window.innerWidth < 768) {
                  setOpen(false);
                }
              }}
              className="flex items-center gap-2 w-full p-2.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors relative"
            >
              <Clock size={18} />
              <span className="text-sm font-medium">托管任务</span>
              {hasNewTaskResults && (
                <span className="absolute right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
              )}
            </button>
            <button 
              onClick={() => {
                onOpenFileManager();
                if (window.innerWidth < 768) {
                  setOpen(false);
                }
              }}
              className="flex items-center gap-2 w-full p-2.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            >
              <FolderOpen size={18} />
              <span className="text-sm font-medium">{t('file_management')}</span>
            </button>
            <button 
              onClick={() => {
                onOpenSettings();
                if (window.innerWidth < 768) {
                  setOpen(false);
                }
              }}
              className="flex items-center gap-2 w-full p-2.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            >
              <SettingsIcon size={18} />
              <span className="text-sm font-medium">{t('settings')}</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
