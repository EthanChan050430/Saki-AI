import React, { useState, useEffect, useRef } from 'react';
import { X, Play, Plus, Trash2, RefreshCw, CheckCircle, AlertCircle, MessageSquare, ChevronRight, Clock, Loader2, Search, Palette, Brain, Server } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import Chat from './Chat';
import { getFeatureLocale } from '../utils/featureLocale';
import { modalBackdropMotion, modalPanelMotion } from '../utils/modalMotion';

function upsertGeneratedFile(files = [], generatedFile) {
  if (!generatedFile?.filePath) return files;
  const nextFiles = Array.isArray(files) ? [...files] : [];
  const existingIndex = nextFiles.findIndex(file => file.filePath === generatedFile.filePath);
  if (existingIndex >= 0) {
    nextFiles[existingIndex] = generatedFile;
  } else {
    nextFiles.push(generatedFile);
  }
  return nextFiles;
}

function getScheduleLabel(ui, scheduleType) {
  const map = {
    daily: ui.scheduleDaily,
    weekly: ui.scheduleWeekly,
    monthly: ui.scheduleMonthly,
    once: ui.scheduleOnce,
  };
  return map[scheduleType] || scheduleType;
}

export default function HostedTasksModal({ isOpen, onClose, config, setConfig, BACKEND_URL, windowed = false }) {
  const { t, i18n } = useTranslation();
  const ui = getFeatureLocale(i18n.resolvedLanguage || i18n.language).hostedTasks;
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newTask, setNewTask] = useState({
    desc: '',
    task: '',
    scheduleType: 'daily',
    time: '08:00',
    options: {
      useSearch: true,
      useMcp: false,
      useSd: false,
      useMemory: true,
    },
  });
  const [selectedTaskHistory, setSelectedTaskHistory] = useState(null);
  const [viewingChatSession, setViewingChatSession] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const abortControllerRef = useRef(null);
  const chatContainerRef = useRef(null);
  const latestSessionMessagesRef = useRef([]);

  useEffect(() => {
    if (viewingChatSession) {
      latestSessionMessagesRef.current = viewingChatSession.messages;
    }
  }, [viewingChatSession?.id]);

  const handleSendMessage = async (text, files = [], options = {}) => {
    if (!text.trim() && files.length === 0) return;
    if (isGenerating || !viewingChatSession) return;

    const sentMsgId = Date.now();
    const assistantMsgId = sentMsgId + 1;
    const userMsg = {
      role: 'user',
      content: text,
      files: files.map(f => f.name),
      attachedFiles: files,
      id: sentMsgId,
    };

    setIsGenerating(true);
    setViewingChatSession(prev => {
      const newMsgs = [...prev.messages, userMsg];
      latestSessionMessagesRef.current = newMsgs;
      return { ...prev, messages: newMsgs };
    });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          message: text,
          history: latestSessionMessagesRef.current,
          provider: config.provider,
          model: config.model,
          ollamaUrl: config.ollamaUrl,
          searchEnabled: options.useSearch !== undefined ? options.useSearch : true,
          mcpEnabled: options.useMcp || false,
          useSd: options.useSd || false,
          useDeep: options.useWeb || false,
          usePpt: options.usePpt || false,
          useMemory: options.useMemory !== undefined ? options.useMemory : true,
          uploadedFiles: files,
          chatId: viewingChatSession.id,
          config,
        }),
      });

      if (!response.ok) throw new Error('Failed to send message');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      setViewingChatSession(prev => {
        if (prev.messages.some(m => m.id === assistantMsgId)) return prev;
        const newMsgs = [...prev.messages, { role: 'assistant', parts: [], generatedFiles: [], id: assistantMsgId }];
        latestSessionMessagesRef.current = newMsgs;
        return { ...prev, messages: newMsgs };
      });

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;

          const dataStr = trimmedLine.slice(6).trim();
          if (dataStr === '[DONE]') break;

          try {
            const data = JSON.parse(dataStr);

            setViewingChatSession(prev => {
              const newMsgs = prev.messages.map(m => {
                if (m.id === assistantMsgId) {
                  const parts = [...(m.parts || [])];
                  const textBit = data.text || data.content;

                  if (textBit && data.type !== 'action') {
                    const lastIdx = parts.length - 1;
                    if (lastIdx >= 0 && parts[lastIdx].type === 'text') {
                      parts[lastIdx] = { ...parts[lastIdx], content: parts[lastIdx].content + textBit };
                    } else {
                      parts.push({ type: 'text', content: textBit });
                    }
                  }

                  if (data.type === 'action' || data.action) {
                    parts.push({ type: 'action', data: data.data || data.action });
                  }

                  if (data.observation || data.fileMetadata) {
                    for (let i = parts.length - 1; i >= 0; i--) {
                      if (parts[i].type === 'action') {
                        if (data.observation) parts[i].observation = data.observation;
                        if (data.fileMetadata) parts[i].fileMetadata = data.fileMetadata;
                        break;
                      }
                    }
                  }

                  const generatedFiles = data.generatedFile
                    ? upsertGeneratedFile(m.generatedFiles, data.generatedFile)
                    : (m.generatedFiles || []);

                  return { ...m, parts, generatedFiles };
                }
                return m;
              });
              latestSessionMessagesRef.current = newMsgs;
              return { ...prev, messages: newMsgs };
            });
          } catch (e) {
            console.error('Error parsing SSE', e);
          }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('Stream error:', e);
        alert(`Send failed: ${e.message}`);
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsGenerating(false);
    }
  };

  const handleRedo = (idx) => {
    const newMessages = [...viewingChatSession.messages];
    const userMsg = newMessages[idx - 1];
    if (!userMsg) return;

    const filtered = newMessages.slice(0, idx - 1);
    setViewingChatSession(prev => ({ ...prev, messages: filtered }));
    handleSendMessage(userMsg.content, userMsg.attachedFiles || []);
  };

  useEffect(() => {
    if (isOpen) {
      fetchTasks();
      const interval = setInterval(fetchTasks, 5000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const fetchTasks = async () => {
    if (tasks.length === 0) setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/hosted-tasks`);
      const data = await res.json();
      setTasks(data);

      if (selectedTaskHistory) {
        const updated = data.find(t => t.id === selectedTaskHistory.id);
        if (updated) setSelectedTaskHistory(updated);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newTask.desc || !newTask.task) return;
    try {
      await fetch(`${BACKEND_URL}/api/hosted-tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTask),
      });
      setNewTask({
        desc: '',
        task: '',
        scheduleType: 'daily',
        time: '08:00',
        options: {
          useSearch: true,
          useMcp: false,
          useSd: false,
          useMemory: true,
        },
      });
      fetchTasks();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!confirm(ui.confirmDeleteTask)) return;
    try {
      await fetch(`${BACKEND_URL}/api/hosted-tasks/${id}`, { method: 'DELETE' });
      fetchTasks();
    } catch (e) {
      console.error(e);
    }
  };

  const handleClearHistory = async (id, e) => {
    e.stopPropagation();
    if (!confirm(ui.confirmClearHistory)) return;
    try {
      await fetch(`${BACKEND_URL}/api/hosted-tasks/${id}/history`, { method: 'DELETE' });
      fetchTasks();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteResult = async (taskId, index, e) => {
    e.stopPropagation();
    if (!confirm(ui.confirmDeleteRecord)) return;
    try {
      await fetch(`${BACKEND_URL}/api/hosted-tasks/${taskId}/history/${index}`, { method: 'DELETE' });
      fetchTasks();
    } catch (e) {
      console.error(e);
    }
  };

  const handleRunNow = async (id, e) => {
    e.stopPropagation();
    try {
      await fetch(`${BACKEND_URL}/api/hosted-tasks/${id}/run`, { method: 'POST' });
      fetchTasks();
    } catch (e) {
      console.error(e);
    }
  };

  const fetchSessionDetails = async (sessionId) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/history/${sessionId}`);
      const data = await res.json();
      setViewingChatSession({ id: sessionId, messages: data.messages || [] });
    } catch (e) {
      console.error('Failed to load session:', e);
      alert(ui.loadHistoryFailed);
    }
  };

  if (!isOpen) return null;

  return (
    <motion.div
      className={windowed ? 'h-full w-full' : 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4'}
      {...(!windowed ? modalBackdropMotion : {})}
      onClick={!windowed ? onClose : undefined}
    >
      <motion.div
        className={windowed ? 'bg-white rounded-[28px] shadow-none w-full h-full flex flex-col overflow-hidden' : 'bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden'}
        {...(!windowed ? modalPanelMotion : {})}
        onClick={!windowed ? (event) => event.stopPropagation() : undefined}
      >
        <div className="p-4 border-b flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
              <Clock size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800">{ui.title}</h2>
              <p className="text-xs text-gray-500">{ui.subtitle}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          <div className={`flex-1 overflow-y-auto p-4 border-r bg-gray-50/10 ${selectedTaskHistory || viewingChatSession ? 'hidden lg:block' : ''}`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-gray-700 flex items-center gap-2">
                {ui.taskList}
                <span className="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{tasks.length}</span>
              </h3>
              <button onClick={fetchTasks} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors" title={t('refresh_models')}>
                <RefreshCw size={16} className={loading ? 'animate-spin text-blue-500' : 'text-gray-400'} />
              </button>
            </div>

            <div className="bg-white p-5 rounded-2xl mb-6 shadow-sm border border-gray-100">
              <div className="flex flex-col gap-3 mb-3">
                <input
                  placeholder={ui.taskNamePlaceholder}
                  className="w-full p-3 text-sm rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  value={newTask.desc}
                  onChange={e => setNewTask({ ...newTask, desc: e.target.value })}
                />
                <div className="flex gap-2">
                  <select
                    className="shrink-0 w-28 p-3 text-sm rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white cursor-pointer"
                    value={newTask.scheduleType}
                    onChange={e => setNewTask({ ...newTask, scheduleType: e.target.value })}
                  >
                    <option value="daily">{ui.scheduleDaily}</option>
                    <option value="weekly">{ui.scheduleWeekly}</option>
                    <option value="monthly">{ui.scheduleMonthly}</option>
                    <option value="once">{ui.scheduleOnce}</option>
                  </select>
                  <input
                    type="text"
                    placeholder={newTask.scheduleType === 'daily' ? ui.timePlaceholderDaily : ui.timePlaceholderOther}
                    className="flex-1 min-w-0 p-3 text-sm rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-mono"
                    value={newTask.time}
                    onChange={e => setNewTask({ ...newTask, time: e.target.value })}
                  />
                </div>
              </div>
              <div className="relative mb-3">
                <textarea
                  placeholder={ui.taskPromptPlaceholder}
                  className="w-full p-3 pb-12 text-sm rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none h-32 resize-none transition-all"
                  value={newTask.task}
                  onChange={e => setNewTask({ ...newTask, task: e.target.value })}
                />
                <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1 p-1 bg-white/80 backdrop-blur-sm rounded-lg border border-gray-100 shadow-sm">
                  <button
                    onClick={() => setNewTask(prev => ({ ...prev, options: { ...prev.options, useSearch: !prev.options.useSearch } }))}
                    className={`p-1.5 rounded-md transition-all ${newTask.options.useSearch ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:bg-gray-100'}`}
                    title={ui.featureSearch}
                  >
                    <Search size={16} />
                  </button>
                  <button
                    onClick={() => setNewTask(prev => ({ ...prev, options: { ...prev.options, useMcp: !prev.options.useMcp } }))}
                    className={`p-1.5 rounded-md transition-all ${newTask.options.useMcp ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:bg-gray-100'}`}
                    title={ui.featureMcp}
                  >
                    <Server size={16} />
                  </button>
                  <button
                    onClick={() => setNewTask(prev => ({ ...prev, options: { ...prev.options, useSd: !prev.options.useSd } }))}
                    className={`p-1.5 rounded-md transition-all ${newTask.options.useSd ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:bg-gray-100'}`}
                    title={ui.featureSd}
                  >
                    <Palette size={16} />
                  </button>
                  <button
                    onClick={() => setNewTask(prev => ({ ...prev, options: { ...prev.options, useMemory: !prev.options.useMemory } }))}
                    className={`p-1.5 rounded-md transition-all ${newTask.options.useMemory ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:bg-gray-100'}`}
                    title={ui.featureMemory}
                  >
                    <Brain size={16} />
                  </button>
                  <div className="ml-auto flex items-center gap-2 pr-1">
                    <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">{ui.features}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={handleAdd}
                className="w-full bg-blue-600 text-white py-3 rounded-xl hover:bg-blue-700 transition flex items-center justify-center gap-2 font-bold shadow-lg shadow-blue-500/25 active:scale-[0.98]"
              >
                <Plus size={18} /> {ui.addTask}
              </button>
            </div>

            <div className="space-y-3">
              {tasks.map(task => (
                <div
                  key={task.id}
                  onClick={() => setSelectedTaskHistory(task)}
                  className={`bg-white border rounded-2xl p-4 cursor-pointer transition-all relative group ${selectedTaskHistory?.id === task.id ? 'ring-2 ring-blue-500 shadow-xl' : 'hover:shadow-md border-gray-100 hover:border-gray-200'}`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-gray-800 truncate">{task.desc}</h4>
                        {task.status === 'running' && (
                          <span className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-full animate-pulse">
                            <Loader2 size={10} className="animate-spin" /> {ui.running}
                          </span>
                        )}
                        {task.status === 'completed' && task.scheduleType === 'once' && (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-[10px] font-bold rounded-full">{ui.completed}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-1.5 font-medium">
                        <div className="flex items-center gap-1 mr-1">
                          {task.options?.useSearch && <Search size={10} className="text-blue-500" />}
                          {task.options?.useMcp && <Server size={10} className="text-purple-500" />}
                          {task.options?.useSd && <Palette size={10} className="text-pink-500" />}
                          {task.options?.useMemory && <Brain size={10} className="text-amber-500" />}
                        </div>
                        <span className={`capitalize px-2 py-0.5 rounded-full font-bold ${
                          task.scheduleType === 'once' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'
                        }`}>
                          {getScheduleLabel(ui, task.scheduleType)}
                        </span>
                        <span className="bg-gray-100 px-2 py-0.5 rounded-full font-mono text-gray-600">{task.time}</span>
                        {task.lastRun && <span className="opacity-60 hidden sm:inline">{ui.lastRun}: {new Date(task.lastRun).toLocaleString()}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1 ml-2">
                      <button
                        disabled={task.status === 'running'}
                        onClick={(e) => handleRunNow(task.id, e)}
                        className={`p-2 rounded-xl transition-all flex items-center gap-1 ${
                          task.status === 'running' ? 'opacity-30 cursor-not-allowed' : 'text-green-600 hover:bg-green-50'
                        }`}
                        title={ui.runNow}
                      >
                        <Play size={18} fill="currentColor" />
                      </button>
                      <button
                        onClick={(e) => handleDelete(task.id, e)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors opacity-0 group-hover:opacity-100"
                        title={t('delete')}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>

                  {task.results && task.results.length > 0 && (
                    <div className="mt-3 p-3 bg-gray-50/50 rounded-xl text-[12px] text-gray-600 line-clamp-2 border border-gray-100/50 italic leading-relaxed">
                      "{task.results[0].summary}"
                    </div>
                  )}
                </div>
              ))}
              {tasks.length === 0 && (
                <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-gray-100">
                  <Clock size={48} className="mx-auto text-gray-100 mb-4" />
                  <p className="text-gray-400 text-sm font-medium">{ui.emptyState}</p>
                </div>
              )}
            </div>
          </div>

          <div className={`flex-1 flex flex-col h-full overflow-hidden bg-white ${!selectedTaskHistory ? 'items-center justify-center p-10 text-gray-300' : ''}`}>
            {selectedTaskHistory ? (
              <div className="flex flex-col h-full w-full animate-in slide-in-from-right duration-200">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50/30">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setSelectedTaskHistory(null)}
                      className="lg:hidden p-2 hover:bg-gray-100 rounded-full"
                    >
                      <ChevronRight className="rotate-180" size={20} />
                    </button>
                    <div>
                      <h3 className="font-bold text-gray-800">{selectedTaskHistory.desc}</h3>
                      <p className="text-xs text-gray-500 flex items-center gap-2">
                        {ui.historyTitle}
                        <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                        {selectedTaskHistory.results?.length || 0}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedTaskHistory.results?.length > 0 && (
                      <button
                        onClick={(e) => handleClearHistory(selectedTaskHistory.id, e)}
                        className="px-3 py-1.5 text-[11px] font-bold text-red-500 hover:bg-red-50 rounded-full transition-colors flex items-center gap-1"
                      >
                        <Trash2 size={12} /> {ui.clearHistory}
                      </button>
                    )}
                    <div className="px-3 py-1 bg-white border border-gray-100 rounded-full shadow-sm text-[10px] font-bold text-gray-400">
                      RECORDS
                    </div>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gray-50/30">
                  {selectedTaskHistory.results?.map((res, idx) => (
                    <div
                      key={idx}
                      onClick={() => res.sessionId && fetchSessionDetails(res.sessionId)}
                      className={`group p-4 rounded-2xl border bg-white transition-all hover:shadow-lg hover:border-blue-300 ${res.sessionId ? 'cursor-pointer' : ''}`}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${res.success ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                            {res.success ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-gray-800">
                              {res.success ? ui.recordSuccess : ui.recordFailed}
                            </p>
                            <p className="text-[10px] text-gray-400">
                              {new Date(res.timestamp).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {res.sessionId && (
                            <div className="text-[10px] text-blue-600 font-bold bg-blue-50 px-2 py-1 rounded-full flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                              {ui.detail} <ChevronRight size={10} strokeWidth={3} />
                            </div>
                          )}
                          <button
                            onClick={(e) => handleDeleteResult(selectedTaskHistory.id, idx, e)}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                            title={ui.deleteRecord}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="text-sm text-gray-600 leading-relaxed font-medium line-clamp-3">
                        {res.summary}
                      </div>
                    </div>
                  ))}
                  {!selectedTaskHistory.results?.length && (
                    <div className="text-center py-20 text-gray-400 flex flex-col items-center gap-2">
                      <AlertCircle size={32} className="opacity-20" />
                      <p className="text-sm">{ui.noRecords}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center">
                <MessageSquare size={64} className="mx-auto mb-4 opacity-5 translate-y-2" />
                <p className="text-gray-400 text-sm font-medium">{ui.selectTaskHint}</p>
              </div>
            )}
          </div>
        </div>

        {viewingChatSession && (
          <div className="absolute inset-0 bg-white z-[60] flex flex-col animate-in slide-in-from-right duration-300 shadow-2xl">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50/50 backdrop-blur-md sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setViewingChatSession(null)}
                  className="p-2 hover:bg-gray-200 rounded-xl transition-all shadow-sm bg-white"
                >
                  <ChevronRight className="rotate-180" size={20} />
                </button>
                <div>
                  <h3 className="font-bold text-gray-800">{ui.chatDetailTitle}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-gray-400 font-mono">ID: {viewingChatSession.id}</span>
                    <span className="w-0.5 h-0.5 rounded-full bg-gray-300"></span>
                    <span className="text-[10px] text-blue-500 font-bold">{ui.hostedMode}</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setViewingChatSession(null)} className="p-2 hover:bg-red-50 hover:text-red-500 rounded-full transition-colors text-gray-400">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden bg-[#f4f7f9]/50 flex flex-col">
              <Chat
                messages={viewingChatSession.messages}
                onSend={handleSendMessage}
                isGenerating={isGenerating}
                onStop={stopGeneration}
                backendUrl={BACKEND_URL}
                containerRef={chatContainerRef}
                config={config}
                setConfig={setConfig}
                onRedo={handleRedo}
                onDeepDataUpdate={() => {}}
                setShowDeepModal={() => {}}
                onOpenFileManager={() => {}}
              />
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
