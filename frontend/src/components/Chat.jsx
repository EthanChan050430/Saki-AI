import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import ReactDOM from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, Plus, Paperclip, ChevronDown, ChevronUp, Bot, User, Terminal, Square, Search, Globe, Server, Palette, Download, Activity, Share2, Copy, Volume2, RotateCcw, Check, X, FileDiff, Undo2, HardDrive, Brain, Presentation, Mic, MicOff } from 'lucide-react';
import DeepReadingView from './DeepReadingView';
import PPTView from './PPTView';
import Mermaid from './Mermaid';
import DiffModal from './DiffModal';
import botAvatar from '../head.png';

const urlTransform = (url) => {
  if (!url) return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('data:image/')) return trimmed;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('mailto:') || trimmed.startsWith('tel:')) return trimmed;
  return '';
};

export default function Chat({
  messages,
  onSend,
  isGenerating,
  onStop,
  backendUrl,
  containerRef,
  config,
  setConfig,
  onDeepDataUpdate,
  setShowDeepModal,
  activeDeepReadingData,
  onRedo,
  onOpenFileManager,
  externalFile,
  onExternalFileClear
}) {
  const { t, i18n } = useTranslation();
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef(null);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [readingIdx, setReadingIdx] = useState(null);
  const [files, setFiles] = useState([]);
  const [useWeb, setUseWeb] = useState(false);
  const [useMcp, setUseMcp] = useState(false);
  const [useSd, setUseSd] = useState(false);
  const [useMemory, setUseMemory] = useState(false);
  const [usePpt, setUsePpt] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const plusMenuRef = useRef(null);

  // Handle external file selection (e.g. from Workspace)
  useEffect(() => {
    if (externalFile) {
      setFiles(prev => [...prev, externalFile]);
      onExternalFileClear?.();
    }
  }, [externalFile, onExternalFileClear]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(event.target)) {
        setShowPlusMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 当深度阅读开启时，关闭其他开关，并打开联网搜索
  useEffect(() => {
    if (useWeb) {
      if (!config.searchEnabled) {
        setConfig(prev => ({ ...prev, searchEnabled: true }));
      }
      setUseMcp(false);
      setUseSd(false);
    }
  }, [useWeb]);

  const [mcpStatus, setMcpStatus] = useState(null);
  const [sdStatus, setSdStatus] = useState(null);
  const [sovitsStatus, setSovitsStatus] = useState(null);
  const [showMcpStatus, setShowMcpStatus] = useState(false);
  const [showSdStatus, setShowSdStatus] = useState(false);
  const [showSovitsStatus, setShowSovitsStatus] = useState(false);
  const [diffModalFile, setDiffModalFile] = useState(null);
  const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);
  const prevMessageCountRef = useRef(0);

  const handleRollback = async (fileMetadata) => {
    if (!window.confirm(t('file_rollback_confirm', { filename: fileMetadata.filePath.split(/[\\\/]/).pop() }))) return;
    try {
      const res = await fetch(`${backendUrl}/api/files/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: fileMetadata.filePath,
          before: fileMetadata.before
        })
      });
      if (res.ok) {
        alert(t('file_rollback_success'));
        setIsDiffModalOpen(false);
      } else {
        const err = await res.json();
        alert(`${t('rollback_fail')}: ${err.error || 'Unknown Error'}`);
      }
    } catch (e) {
      alert(`${t('network_error')}: ${e.message}`);
    }
  };

  const fileInputRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    let interval;
    if (useSd || showSdStatus) {
      const fetchSdStatus = async () => {
        try {
          const sdUrl = config.sdUrl || 'http://127.0.0.1:7860';
          const res = await fetch(`${backendUrl}/api/sd/status?url=${encodeURIComponent(sdUrl)}`);
          const data = await res.json();
          setSdStatus(data);
        } catch (e) {
          console.error("Failed to fetch SD status", e);
        }
      };
      fetchSdStatus();
      interval = setInterval(fetchSdStatus, 5000);
    }
    return () => interval && clearInterval(interval);
  }, [useSd, showSdStatus, backendUrl, config.sdUrl]);

  useEffect(() => {
    let interval;
    if (useMcp || showMcpStatus) {
      const fetchStatus = async () => {
        try {
          const res = await fetch(`${backendUrl}/api/mcp/status`);
          const data = await res.json();
          setMcpStatus(data);
        } catch (e) {
          console.error("Failed to fetch MCP status", e);
        }
      };
      fetchStatus();
      interval = setInterval(fetchStatus, 3000);
    }
    return () => interval && clearInterval(interval);
  }, [useMcp, showMcpStatus, backendUrl]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isNewMessage = messages.length > prevMessageCountRef.current;
    const isAssistantReplying = isGenerating && messages.length > 0 && messages[messages.length - 1].role === 'assistant';
    
    // Check if user is near bottom (within 150px)
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;

    // Only auto-scroll if it's a new message or if user is already browsing at the bottom
    if (isNewMessage || (isAssistantReplying && isAtBottom)) {
      endRef.current?.scrollIntoView({ behavior: isNewMessage ? 'auto' : 'smooth' });
    }

    prevMessageCountRef.current = messages.length;
  }, [messages, isGenerating]);

  const handleSend = () => {
    if (isGenerating) {
      onStop();
      return;
    }
    if (!input.trim() && files.length === 0) return;
    onSend(input, files, { useSearch: config.searchEnabled, useWeb, useMcp, useSd, useMemory, usePpt });
    setInput('');
    setFiles([]);
    if (isRecording) stopRecording();
  };

  const startRecording = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert(t('browser_not_support_speech'));
      return;
    }

    const recognition = new SpeechRecognition();
    
    // Set language based on current i18n language
    const langMap = {
      'zh-CN': 'zh-CN',
      'zh-TW': 'zh-TW',
      'en-US': 'en-US',
      'en-GB': 'en-GB',
      'ja': 'ja-JP',
      'fr': 'fr-FR'
    };
    recognition.lang = langMap[i18n.language] || 'zh-CN';
    
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          setInput(prev => prev + event.results[i][0].transcript);
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  useEffect(() => {
    let interval;
    if (config.ttsProvider === 'gpt-sovits') {
      const fetchSovitsStatus = async () => {
        try {
          const url = config.sovitsUrl || 'http://127.0.0.1:9880';
          const res = await axios.get(`${backendUrl}/api/sovits/status`, {
            params: { url }
          });
          setSovitsStatus(res.data);
        } catch (e) {
          setSovitsStatus({ connected: false });
        }
      };
      fetchSovitsStatus();
      interval = setInterval(fetchSovitsStatus, 5000);
    } else {
      setSovitsStatus(null);
    }
    return () => interval && clearInterval(interval);
  }, [config.ttsProvider, config.sovitsUrl, backendUrl]);

  const handleFileChange = async (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length === 0) return;

    for (const file of selectedFiles) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await fetch(`${backendUrl}/api/upload`, {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (data.filename) {
          setFiles((prev) => [
            ...prev,
            {
              name: data.filename,
              path: data.path,
              content: data.content,
              isImage: data.isImage,
            },
          ]);
        }
      } catch (err) {
        console.error('File upload failed:', err);
      }
    }
    // Clear input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getCleanText = (parts) => {
    if (!parts) return "";
    return parts
      .filter(p => p.type === 'text')
      .map(p => p.content.replace(/\[expression:.*?\.png\]/g, '').replace(/```[\s\S]*?```/g, '').trim())
      .filter(t => t.length > 0)
      .join('\n\n')
      .trim();
  };

  const copyToClipboard = (idx, parts) => {
    const text = getCleanText(parts);
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    });
  };

  const speakText = async (idx, parts) => {
    if (readingIdx === idx) {
      if (config.ttsProvider === 'gpt-sovits') {
        if (window.currentSovitsAudio) {
          window.currentSovitsAudio.pause();
          window.currentSovitsAudio = null;
        }
      } else {
        window.speechSynthesis.cancel();
      }
      setReadingIdx(null);
      return;
    }

    const text = getCleanText(parts);
    if (!text) return;

    if (config.ttsProvider === 'gpt-sovits') {
      setReadingIdx(idx);
      try {
        const langMap = { 'zh-CN': 'zh', 'en-US': 'en', 'ja': 'ja', 'fr': 'fr' };
        const lang = langMap[i18n.language] || 'zh';

        const payload = {
          text: text,
          text_lang: lang,
          ref_audio_path: config.sovitsRefAudio,
          prompt_text: config.sovitsRefText || '',
          prompt_lang: lang,
          media_type: 'wav',
          streaming_mode: false,
          sovits_url: config.sovitsUrl || 'http://127.0.0.1:9880'
        };

        const response = await fetch(`${backendUrl}/api/sovits/proxy/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.message || 'TTS request failed');
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        
        if (window.currentSovitsAudio) {
          window.currentSovitsAudio.pause();
        }
        window.currentSovitsAudio = audio;
        
        audio.onended = () => {
          setReadingIdx(null);
          URL.revokeObjectURL(url);
          window.currentSovitsAudio = null;
        };
        audio.onerror = (e) => {
          console.error("Audio playback error", e);
          setReadingIdx(null);
        };
        await audio.play();

      } catch (err) {
        console.error('SoVITS TTS Error:', err);
        setReadingIdx(null);
        if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
          alert('无法连接到 GPT-SoVITS 服务。请确保已通过 start.bat 或手动启动服务，并检查设置中的 API 地址是否正确（默认 http://127.0.0.1:9880）。');
        } else {
          alert('GPT-SoVITS 错误: ' + err.message);
        }
      }
    } else {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => setReadingIdx(null);
      setReadingIdx(idx);
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleRedoAction = (idx) => {
    if (onRedo) {
      const originalInput = onRedo(idx);
      setInput(originalInput);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-transparent relative">
      <div
        id="chat-messages-container"
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 relative custom-scrollbar"
      >
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl overflow-hidden mx-auto mb-4 border border-gray-100">
                <img src={config.aiAvatar || botAvatar} alt="Bot" className="w-full h-full object-cover" />
              </div>
              <h2 className="text-xl font-semibold text-gray-800">{t('welcome_title')}</h2>
              <p className="text-gray-500 mt-2">{t('welcome_desc')}</p>
            </div>
          </div>
        )}
        {messages.map((m, idx) => (
          <div key={idx} className={`flex gap-4 ${m.role === 'user' ? 'justify-end' : ''}`}>
            {m.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-gray-200">
                <img src={config.aiAvatar || botAvatar} alt="Bot" className="w-full h-full object-cover" />
              </div>
            )}
            <div className={`max-w-[85%] space-y-2 ${m.role === 'user' ? 'order-1' : ''}`}>
              <div className={`rounded-2xl p-4 shadow-sm backdrop-blur-sm ${m.role === 'user' ? 'bg-blue-600/90 text-white' : 'bg-white/80 border border-gray-100'}`}>
                {m.role === 'assistant' && (
                  <div className="flex flex-col">
                    {(m.parts || []).map((part, i) => (
                      <React.Fragment key={i}>
                        {part.type === 'action' && (
                          <TerminalBlock
                            action={part.data}
                            observation={part.observation}
                            fileMetadata={part.fileMetadata}
                            onViewChanges={(data) => {
                              setDiffModalFile(data);
                              setIsDiffModalOpen(true);
                            }}
                            onRollback={handleRollback}
                          />
                        )}
                        {part.type === 'text' && <MessageContent content={part.content} isGenerating={isGenerating} />}
                      </React.Fragment>
                    ))}
                    {/* Thinking Indicator */}
                    {m.role === 'assistant' && isGenerating && idx === messages.length - 1 &&
                      (!m.parts || m.parts.length === 0 || !m.parts.some(p => p.type === 'text' && p.content.replace(/\[expression:.*?\.png\]/g, '').trim())) && (
                        <div className="flex items-center mt-1">
                          <img src="/assets/Thinking.gif" alt="Thinking..." className="h-8 w-auto rounded-lg" />
                        </div>
                      )}
                    {/* Deep Reading Result */}
                    {m.deepReadingData && (
                      <div className="mt-4 w-full">
                        <DeepReadingView data={m.deepReadingData} isEmbedded={true} />
                      </div>
                    )}
                    {/* PPT Result */}
                    {m.pptData && (
                      <div className="mt-4 w-full">
                        <PPTView data={m.pptData} isEmbedded={true} />
                      </div>
                    )}
                  </div>
                )}
                {m.role === 'user' && <div className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</div>}
                {m.files && m.files.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.files.map((f, i) => (
                      <div key={i} className="flex items-center gap-1.5 bg-black/10 px-2 py-1 rounded text-xs">
                        <Paperclip size={12} />
                        {f}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {m.role === 'assistant' && (!isGenerating || idx < messages.length - 1) && (
                <div className="flex items-center gap-3 px-2 pt-1 animate-in fade-in slide-in-from-top-1 duration-300">
                  <button
                    onClick={() => copyToClipboard(idx, m.parts)}
                    className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-blue-600 transition-all bg-white/50 backdrop-blur-sm px-2 py-1 rounded-lg border border-white/20 hover:border-blue-200 hover:shadow-sm"
                    title={t('copy_content')}
                  >
                    {copiedIdx === idx ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                    {copiedIdx === idx ? t('copied') : t('copy')}
                  </button>
                  <button
                    onClick={() => speakText(idx, m.parts)}
                    className={`flex items-center gap-1 text-[10px] transition-all bg-white/50 backdrop-blur-sm px-2 py-1 rounded-lg border border-white/20 hover:border-blue-200 hover:shadow-sm ${readingIdx === idx ? 'text-blue-600 ring-1 ring-blue-100 shadow-inner' : 'text-gray-500 hover:text-blue-600'}`}
                    title={t('read_aloud')}
                  >
                    <Volume2 size={12} className={readingIdx === idx ? 'animate-pulse' : ''} />
                    {readingIdx === idx ? t('listening') : t('listen')}
                  </button>
                  <button
                    onClick={() => handleRedoAction(idx)}
                    className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-orange-600 transition-all bg-white/50 backdrop-blur-sm px-2 py-1 rounded-lg border border-white/20 hover:border-orange-200 hover:shadow-sm"
                    title={t('redo_action')}
                  >
                    <RotateCcw size={12} />
                    {t('redo')}
                  </button>
                </div>
              )}
            </div>
            {m.role === 'user' && (
              <div className="w-8 h-8 rounded-full overflow-hidden border border-white/20 shrink-0 order-2">
                <img src={config.userAvatar || '/assets/head_user.png'} alt="User" className="w-full h-full object-cover" />
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="p-4 border-t border-white/10 bg-transparent">
        <div className="max-w-4xl mx-auto">
          {files.length > 0 && (
            <div className="flex gap-2 mb-2 px-1">
              {files.map((f, i) => (
                <div key={i} className="text-xs bg-white/20 backdrop-blur-md border border-white/20 px-2 py-1 rounded-full flex items-center gap-1.5 text-white">
                  <Paperclip size={12} className="text-white/60" />
                  <span>{f.name}</span>
                  <button onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))} className="hover:text-red-300">×</button>
                </div>
              ))}
            </div>
          )}
          <div className="relative flex items-end gap-2 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl focus-within:border-blue-400 transition-colors p-2 flex-wrap shadow-lg">
            <div className="flex w-full flex-wrap gap-2 mb-1 px-1 shrink-0 pb-1">
              <button
                onClick={() => setConfig({ ...config, searchEnabled: !config.searchEnabled })}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-bold transition-all shrink-0 ${config.searchEnabled ? 'bg-blue-600 text-white shadow-md' : 'bg-white/40 text-gray-800 border border-white/40 hover:bg-white/60'}`}
                title={t('search_function')}
              >
                <Search size={14} className={config.searchEnabled ? 'text-white' : 'text-blue-600'} />
                {t('web_search')}
              </button>
              <button
                onClick={() => setUseWeb(!useWeb)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-bold transition-all shrink-0 ${useWeb ? 'bg-green-600 text-white shadow-md' : 'bg-white/40 text-gray-800 border border-white/40 hover:bg-white/60'}`}
                title={t('deep_research')}
              >
                <Globe size={14} className={useWeb ? 'text-white' : 'text-green-600'} />
                {t('deep_research')}
              </button>
              <div
                className="relative shrink-0"
                onMouseEnter={() => setShowMcpStatus(true)}
                onMouseLeave={() => setShowMcpStatus(false)}
              >
                <button
                  onClick={async () => {
                    const hasConfig = config?.mcpConfig?.mcpServers && Object.keys(config.mcpConfig.mcpServers).length > 0;
                    if (!hasConfig) {
                      alert(t('configure_mcp_first'));
                      return;
                    }

                    const nextState = !useMcp;
                    setUseMcp(nextState);

                    if (nextState) {
                      // 开启时立即触发后端初始化
                      try {
                        await fetch(`${backendUrl}/api/mcp/init`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ mcpServers: config.mcpConfig.mcpServers })
                        });
                      } catch (e) {
                        console.error("Failed to init MCP", e);
                      }
                    }
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${useMcp ? 'bg-purple-600 text-white shadow-md' : 'bg-white/40 text-gray-800 border border-white/40 hover:bg-white/60'}`}
                  title={t('mcp_service')}
                >
                  <Server size={14} className={useMcp ? 'text-white' : 'text-purple-600'} />
                  {t('mcp_service')}
                </button>

                {showMcpStatus && mcpStatus && (
                  <div className="absolute bottom-full left-0 pb-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <div className="w-48 bg-white/90 backdrop-blur-xl border border-white/20 shadow-xl rounded-xl p-3 text-gray-700 font-sans">
                          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">{t('service_status')}</div>
                      <div className="space-y-2">
                        {Object.entries(mcpStatus).length > 0 ? (
                          Object.entries(mcpStatus).map(([name, info]) => (
                            <div key={name} className="flex flex-col gap-0.5">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="truncate flex-1 pr-2 font-medium">{name}</span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className={`w-1.5 h-1.5 rounded-full ${info.connected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-400'}`}></span>
                                  <span className="text-gray-400">{info.connected ? t('tools_count', { count: info.toolCount }) : t('connect_fail')}</span>
                                </div>
                              </div>
                              {info.error && !info.connected && (
                                <div className="text-[9px] text-red-400 truncate opacity-80" title={info.error}>
                                  {info.error}
                                </div>
                              )}
                            </div>
                          ))
                        ) : (
                          <div className="text-[11px] text-gray-400 italic">{t('connecting_server')}</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div
                className="relative shrink-0"
                onMouseEnter={() => setShowSdStatus(true)}
                onMouseLeave={() => setShowSdStatus(false)}
              >
                <button
                  onClick={() => setUseSd(!useSd)}
                  disabled={config.drawingProvider === 'none'}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${config.drawingProvider === 'none' ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-400' : useSd ? 'bg-pink-600 text-white shadow-md' : 'bg-white/40 text-gray-800 border border-white/40 hover:bg-white/60'}`}
                  title={t('intelligent_drawing')}
                >
                  <Palette size={14} className={config.drawingProvider === 'none' ? 'text-gray-400' : useSd ? 'text-white' : 'text-pink-600'} />
                  {t('intelligent_drawing')}
                </button>

                {showSdStatus && sdStatus && (
                  <div className="absolute bottom-full left-0 pb-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <div className="w-56 bg-white/90 backdrop-blur-xl border border-white/20 shadow-xl rounded-xl p-3 text-gray-700 font-sans">
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center justify-between">
                        {t('sd_status')}
                        <span className={`w-1.5 h-1.5 rounded-full ${sdStatus.connected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-400'}`}></span>
                      </div>

                      {sdStatus.connected ? (
                        <div className="space-y-2">
                          <label className="block text-[10px] text-gray-400 mb-1">{t('select_model')}</label>
                          <select
                            className="w-full border border-white/20 rounded-md px-2 py-1 text-[11px] bg-white/50 outline-none focus:ring-1 focus:ring-pink-500"
                            value={config.sdModel || ''}
                            onChange={(e) => setConfig({ ...config, sdModel: e.target.value })}
                          >
                            <option value="">{t('default_model')}</option>
                            {sdStatus.models.map(m => (
                              <option key={m} value={m}>{m.split(' [')[0]}</option>
                            ))}
                          </select>
                          <div className="text-[9px] text-pink-500 font-medium">{t('drawing_model_change_tip')}</div>

                          {sdStatus.loras && sdStatus.loras.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-white/20">
                              <label className="block text-[10px] text-gray-400 mb-1">{t('select_lora')}</label>
                              <select
                                className="w-full border border-white/20 rounded-md px-2 py-1 text-[11px] bg-white/50 outline-none focus:ring-1 focus:ring-pink-500"
                                value={config.sdLora || ''}
                                onChange={(e) => setConfig({ ...config, sdLora: e.target.value })}
                              >
                                <option value="">{t('no_lora')}</option>
                                {sdStatus.loras.map(l => (
                                  <option key={l} value={l}>{l}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-[11px] text-red-400 bg-red-50 p-2 rounded-lg break-all">
                          {sdStatus.error || '无法连接到 SD API，请检查地址是否正确并开启了 --api'}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => setUseMemory(!useMemory)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${useMemory ? 'bg-purple-600 text-white shadow-md' : 'bg-white/40 text-gray-800 border border-white/40 hover:bg-white/60'}`}
                title={t('memory')}
              >
                <Brain size={14} className={useMemory ? 'text-white' : 'text-purple-600'} />
                {t('memory')}
              </button>
              <button
                onClick={() => setUsePpt(!usePpt)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${usePpt ? 'bg-orange-600 text-white shadow-md' : 'bg-white/40 text-gray-800 border border-white/40 hover:bg-white/60'}`}
                title={t('smart_ppt')}
              >
                <Presentation size={14} className={usePpt ? 'text-white' : 'text-orange-600'} />
                <span>{t('smart_ppt')}</span>
              </button>
            </div>
            <div className="relative" ref={plusMenuRef}>
              <button
                onClick={() => setShowPlusMenu(!showPlusMenu)}
                className={`p-2.5 rounded-xl transition-all ${showPlusMenu ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-blue-600 hover:bg-white/20'}`}
              >
                <Plus size={20} />
              </button>

              {showPlusMenu && (
                <div className="absolute bottom-full left-0 mb-2 w-48 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden py-2 animate-in fade-in slide-in-from-bottom-2 duration-200 z-[100]">
                  <button
                    onClick={() => {
                      setShowPlusMenu(false);
                      onOpenFileManager?.();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                  >
                    <Server size={18} className="text-gray-400 group-hover:text-blue-500" />
                    <span className="font-bold">{t('workspace')}</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowPlusMenu(false);
                      fileInputRef.current?.click();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                  >
                    <HardDrive size={18} className="text-gray-400 group-hover:text-blue-500" />
                    <span className="font-bold">{t('local_files')}</span>
                  </button>
                </div>
              )}
            </div>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              multiple
              onChange={handleFileChange}
            />
            <textarea
              rows={1}
              value={input}
              onFocus={(e) => {
                e.target.placeholder = '';
              }}
              onBlur={(e) => {
                if (!input) e.target.placeholder = t('ask_placeholder');
              }}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
              placeholder={t('ask_placeholder')}
              className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none resize-none py-2.5 text-sm max-h-48 text-gray-900 font-medium placeholder-gray-500"
            />
            <button
              onClick={toggleRecording}
              className={`p-2.5 rounded-xl transition-all active:scale-95 ${isRecording ? 'bg-red-500 text-white shadow-lg animate-pulse' : 'text-gray-500 hover:text-blue-600 hover:bg-white/20'}`}
              title={isRecording ? t('voice_stop') : t('voice_input')}
            >
              {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            <button
              onClick={handleSend}
              className={`p-2.5 rounded-xl transition-all active:scale-95 ${isGenerating ? 'bg-red-500/80 text-white shadow-lg' : (input.trim() || files.length > 0 ? 'bg-blue-600/80 text-white shadow-lg' : 'bg-white/20 text-gray-600')}`}
            >
              {isGenerating ? <div className="w-4 h-4 bg-white rounded-sm" /> : <Send size={20} />}
            </button>
          </div>
          <p className="text-[10px] text-center text-gray-400 mt-2">{t('ai_accuracy_tip')}</p>
        </div>
      </div>

      <DiffModal
        isOpen={isDiffModalOpen}
        onClose={() => setIsDiffModalOpen(false)}
        fileMetadata={diffModalFile}
        onRollback={handleRollback}
      />
    </div>
  );
}

function MessageContent({ content, isGenerating }) {
  const { t } = useTranslation();
  const [zoomImage, setZoomImage] = useState(null);
  if (!content) return null;
  let processedContent = content;

  // 1. 移除表情标记 [expression:...]，避免在聊天框显示
  processedContent = processedContent.replace(/\[expression:.*?\]/g, '');

  // 2. 增强型标识提取：处理多种思考标记并将它们统一转换为标准 <think> 标签
  if (!processedContent.includes('<think>')) {
      // 2a. 处理 Thinking.. ... ...done thinking.
      const dotsRegex = /Thinking\.\.([\s\S]*?)\.\.\.done thinking\./i;
      const dotsMatch = processedContent.match(dotsRegex);
      if (dotsMatch) {
          processedContent = processedContent.replace(dotsMatch[0], `<think>${dotsMatch[1].trim()}</think>`);
      }

      // 2b. 处理 Thought: ... Response: 结构
      const thoughtRegex = /(?:[`*]*)(?:Thought|思考|思考过程)[:：](?:[`*]*)\s*([\s\S]*?)(?=(?:\n\s*(?:[`*]*)(?:Response|回答|Tool|工具|Observation)[:：])|$)/i;
      const tMatch = processedContent.match(thoughtRegex);
      if (tMatch) {
          const thoughtText = tMatch[1].trim();
          const rest = processedContent.replace(tMatch[0], '').trim();
          const cleanedRest = rest.replace(/^(?:[`*]*)(?:Response|回答)[:：](?:[`*]*)\s*/i, '');
          if (thoughtText.includes('<think>')) {
              processedContent = `${thoughtText}\n${cleanedRest}`;
          } else {
              processedContent = `<think>${thoughtText}</think>\n${cleanedRest}`;
          }
      }
  }

  // 3. 处理流式传输中的标签不完整问题
  // 3a. 有开头无结尾：补齐结尾
  if (processedContent.includes('<think>') && !processedContent.includes('</think>')) {
    processedContent += '</think>';
  }
  // 3b. 有结尾无开头：可能来自上一个 Part 被截断，补齐开头以便解析
  if (processedContent.includes('</think>') && !processedContent.includes('<think>')) {
    processedContent = '<think>' + processedContent;
  }

  // 4. 分割内容
  const parts = processedContent.split(/(<think>[\s\S]*?<\/think>)/g);

  return (
    <div className="prose prose-sm max-w-none">
      {parts.map((part, i) => {
        const trimmedPart = part.trim();
        if (trimmedPart.startsWith('<think>')) {
          const thinkText = trimmedPart
            .replace(/^<think>/i, '')
            .replace(/<\/think>$/i, '')
            .trim();
          return <ThinkingBlock key={i} text={thinkText} />;
        }
        if (!trimmedPart) return null;

        // 5. 彻底清洗：移除残余标识
        const cleanedPart = part
          .replace(/^(?:[`*]*)(?:Assistant|User|用户|Tool|工具|Thought|思考|Response|回答|Observation|结果)[:：\s]?(?:[`*]*)\s*/gmi, '')
          .replace(/\n(?:[`*]*)(?:Assistant|User|用户|Tool|工具|Thought|思考|Response|回答|Observation|结果)[:：\s]?(?:[`*]*)\s*/gmi, '\n')
          .replace(/(?:[`*]*)(?:Tool|工具)[:：\s]?\w+\([\s\S]*?\)/gmi, '')
          // 移除残留的标签
          .replace(/<\/?think>/gi, '')
          .replace(/(?:[`*]*)(?:Assistant|User|用户|Tool|工具|Thought|思考|Response|回答|Observation|结果)[:：\s]?(?:[`*]*)\s*$/i, '')
          .trim();

        if (!cleanedPart) return null;

        return (
          <ReactMarkdown
            key={i}
            remarkPlugins={[remarkGfm]}
            urlTransform={urlTransform}
            components={{
              p: ({ children }) => <div className="mb-4 last:mb-0 leading-relaxed">{children}</div>,
              code: ({ node, inline, className, children, ...props }) => {
                const match = /language-(\w+)/.exec(className || '');
                if (!inline && match && match[1] === 'mermaid') {
                  const chartCode = String(children).replace(/\n$/, '');
                  // 如果正在生成中，且代码块末尾没有明显的闭合迹象，或者长度还在剧烈变化，可以考虑暂不渲染
                  // 但 Mermaid 组件内部已经有了语法检查和延迟渲染
                  return <Mermaid chart={chartCode} />;
                }
                return (
                  <code className={className} {...props}>
                    {children}
                  </code>
                );
              },
              img: ({ node, ...props }) => {
                const [hover, setHover] = useState(false);
                if (!props.src) return null;
                return (
                  <div
                    className="relative group inline-block my-2 w-full"
                    onMouseEnter={() => setHover(true)}
                    onMouseLeave={() => setHover(false)}
                  >
                    <img
                      {...props}
                      className="rounded-xl border shadow-md max-w-full h-auto cursor-zoom-in hover:opacity-95 transition-opacity bg-white"
                      style={{ minHeight: '100px', display: 'block' }}
                      onClick={() => setZoomImage(props.src)}
                      onError={(e) => {
                        e.target.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNlYjVjNWMiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHg9IjMiIHk9IjMiIHJ4PSIyIiByeT0iMiIvPjxsaW5lIHgxPSIzIiB5MT0iOSIgeDI9IjIxIiB5Mj0iOSIvPjxsbmUgeDE9IjkiIHkxPSIzIiB4Mj0iOSIgeTI9IjIxIi8+PC9zdmc+';
                        e.target.className = 'w-12 h-12 opacity-20 mx-auto py-8';
                      }}
                    />
                    {hover && !props.src?.includes('svg+xml') && (
                      <div className="absolute top-3 right-3 flex gap-2 animate-in fade-in zoom-in duration-200">
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const response = await fetch(props.src);
                              const blob = await response.blob();
                              const url = URL.createObjectURL(blob);
                              const link = document.createElement('a');
                              link.href = url;
                              link.download = `agent-draw-${Date.now()}.png`;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                              URL.revokeObjectURL(url);
                            } catch (err) {
                              console.error('Download failed:', err);
                              const link = document.createElement('a');
                              link.href = props.src;
                              link.download = `agent-draw-${Date.now()}.png`;
                              link.click();
                            }
                          }}
                          className="bg-black/70 hover:bg-black/90 text-white p-2.5 rounded-full backdrop-blur-md shadow-xl transition-all"
                          title={t('download_image')}
                        >
                          <Download size={18} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              }
            }}
          >
            {cleanedPart}
          </ReactMarkdown>
        );
      })}
      {zoomImage && ReactDOM.createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300 pointer-events-auto"
          onClick={() => setZoomImage(null)}
        >
          <button className="absolute top-4 right-4 text-white/60 hover:text-white p-2">
            <X size={32} />
          </button>
          <img
            src={zoomImage}
            alt="Zoom"
            className="max-w-full max-h-full object-contain rounded shadow-2xl animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          />
        </div>,
        document.body
      )}
    </div>
  );
}

function ThinkingBlock({ text }) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  if (!text) return null;

  // 移除可能在思考块内部出现的 Response: 标记（容错）
  const cleanedText = text.replace(/(?:[`*]*)(?:Response|回答)[:：](?:[`*]*)\s*[\s\S]*$/i, '').trim();
  if (!cleanedText) return null;

  return (
    <div className="my-3 border-l-2 border-amber-200 pl-3 bg-amber-50/20 rounded-r-xl transition-all duration-300">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-amber-600/70 text-[11px] py-1.5 hover:text-amber-700 font-medium transition-colors"
      >
        <div className={`p-0.5 rounded-full bg-amber-100 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
          <ChevronDown size={12} />
        </div>
        <span>{isOpen ? t('hide_thoughts') : t('show_thoughts')}</span>
      </button>
      {isOpen && (
        <div className="text-gray-500 text-[11px] pb-3 pr-2 leading-relaxed animate-in fade-in slide-in-from-top-1 duration-200">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {cleanedText}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}

function TerminalBlock({ action, observation, fileMetadata, onViewChanges, onRollback }) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(action.type === 'draw' || action.type === 'diagram');
  const getLabel = () => {
    switch (action.type) {
      case 'search': return t('search_action');
      case 'draw': return t('draw_action');
      case 'terminal': return t('terminal_action');
      case 'writeFile': return t('writeFile_action');
      case 'editFile': return t('editFile_action');
      case 'readFile': return t('readFile_action');
      case 'deleteFile': return t('deleteFile_action');
      case 'diagram': return t('diagram_action');
      default: return t('default_action');
    }
  };

  const getContent = () => {
    if (action.type === 'writeFile') return `${t('path_label')}: ${action.args[0]}\n${t('content_label')}:\n${action.args[1]}`;
    if (action.type === 'diagram') return t('diagram_rendering');
    return action.args.join(' ');
  };

  // 如果是图表，使用更简洁的样式
  if (action.type === 'diagram' && observation) {
    return <Mermaid chart={observation} />;
  }

  return (
    <div className="my-4 rounded-lg overflow-hidden border border-gray-200 bg-white shadow-sm font-mono text-sm max-w-full">
      <div className="bg-gray-50 px-4 py-2 flex items-center relative border-b">
        <div className="flex gap-1.5 cursor-pointer z-10" onClick={() => setIsExpanded(!isExpanded)}>
          <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
          <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
          <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div>
        </div>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-gray-500 text-xs font-sans font-medium">{getLabel()}</span>
        </div>
        <div className="ml-auto flex items-center gap-2 z-10">
          {fileMetadata && (
            <div className="flex items-center gap-2 mr-2">
              <button
                onClick={() => onViewChanges?.(fileMetadata)}
                className="flex items-center gap-1 px-2 py-0.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 rounded text-[10px] font-sans transition-colors pointer-events-auto"
                title="查看代码差异"
              >
                <FileDiff size={12} />
                <span>{t('view_changes_action')}</span>
              </button>
              <button
                onClick={() => onRollback?.(fileMetadata)}
                className="flex items-center gap-1 px-2 py-0.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 rounded text-[10px] font-sans transition-colors pointer-events-auto"
                title={action.type === 'deleteFile' ? t('restore_action') : t('rollback_action')}
              >
                <Undo2 size={12} />
                <span>{action.type === 'deleteFile' ? t('restore_action_label') : t('rollback_action')}</span>
              </button>
            </div>
          )}
          <Terminal size={14} className="text-gray-400" />
        </div>
      </div>
      <div className="p-3 text-gray-700 whitespace-pre-wrap break-all leading-relaxed bg-gray-50/30">
        <span className="text-blue-500 mr-2">$</span>
        {getContent()}
      </div>
      {observation && (
        <div className="border-t bg-white">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center justify-between px-4 py-2 text-[11px] text-gray-500 hover:bg-gray-50 transition-colors border-b border-dashed"
          >
            <span className="flex items-center gap-1.5">
              {action.type === 'search' ? t('view_search_results') : t('view_execution_output')}
              {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </span>
          </button>
          {isExpanded && (
            <div className={`p-4 text-xs text-gray-600 bg-gray-50/50 ${action.type === 'draw' || action.type === 'diagram' ? 'max-h-none' : 'max-h-60'} overflow-y-auto font-sans leading-relaxed`}>
              <div className="prose prose-sm max-w-none">
                {action.type === 'diagram' ? (
                  <Mermaid chart={observation} />
                ) : (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    urlTransform={urlTransform}
                    components={{
                      p: ({ children }) => <div className="mb-2 last:mb-0 leading-relaxed">{children}</div>,
                      code: ({ node, inline, className, children, ...props }) => {
                        const match = /language-(\w+)/.exec(className || '');
                        if (!inline && match && match[1] === 'mermaid') {
                          return <Mermaid chart={String(children).replace(/\n$/, '')} />;
                        }
                        return (
                          <code className={className} {...props}>
                            {children}
                          </code>
                        );
                      },
                      img: ({ node, ...props }) => {
                        const [hover, setHover] = useState(false);
                        const [localZoom, setLocalZoom] = useState(null);
                        if (!props.src) return null;
                        return (
                          <>
                            <div
                              className="relative group inline-block my-2 w-full"
                              onMouseEnter={() => setHover(true)}
                              onMouseLeave={() => setHover(false)}
                            >
                              <img
                                {...props}
                                className="rounded-xl border shadow-md max-w-full h-auto cursor-zoom-in hover:opacity-95 transition-opacity bg-white"
                                style={{ minHeight: '100px', display: 'block' }}
                                onClick={() => setLocalZoom(props.src)}
                                onError={(e) => {
                                  console.error('Image render failed. Logic observation length:', props.src?.length);
                                  e.target.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNlYjVjNWMiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHg9IjMiIHk9IjMiIHJ4PSIyIiByeT0iMiIvPjxsaW5lIHgxPSIzIiB5MT0iOSIgeDI9IjIxIiB5Mj0iOSIvPjxsbmUgeDE9IjkiIHkxPSIzIiB4Mj0iOSIgeTI9IjIxIi8+PC9zdmc+';
                                  e.target.className = 'w-12 h-12 opacity-20 mx-auto py-8';
                                }}
                              />
                              {hover && !props.src?.includes('svg+xml') && (
                                <div className="absolute top-3 right-3 flex gap-2 animate-in fade-in zoom-in duration-200">
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      try {
                                        const response = await fetch(props.src);
                                        const blob = await response.blob();
                                        const url = URL.createObjectURL(blob);
                                        const link = document.createElement('a');
                                        link.href = url;
                                        link.download = `agent-draw-${Date.now()}.png`;
                                        document.body.appendChild(link);
                                        link.click();
                                        document.body.removeChild(link);
                                        URL.revokeObjectURL(url);
                                      } catch (err) {
                                        console.error('Download failed:', err);
                                        const link = document.createElement('a');
                                        link.href = props.src;
                                        link.download = `agent-draw-${Date.now()}.png`;
                                        link.click();
                                      }
                                    }}
                                    className="bg-black/70 hover:bg-black/90 text-white p-2.5 rounded-full backdrop-blur-md shadow-xl transition-all"
                                    title={t('download_image')}
                                  >
                                    <Download size={18} />
                                  </button>
                                </div>
                              )}
                            </div>
                            {localZoom && ReactDOM.createPortal(
                              <div
                                className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300 pointer-events-auto"
                                onClick={() => setLocalZoom(null)}
                              >
                                <button className="absolute top-4 right-4 text-white/60 hover:text-white p-2">
                                  <X size={32} />
                                </button>
                                <img
                                  src={localZoom}
                                  alt="Zoom"
                                  className="max-w-full max-h-full object-contain rounded shadow-2xl animate-in zoom-in-95 duration-300"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>,
                              document.body
                            )}
                          </>
                        );
                      }
                    }}
                  >
                    {observation}
                  </ReactMarkdown>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
