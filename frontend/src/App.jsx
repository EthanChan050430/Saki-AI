import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Chat from './components/Chat';
import Header from './components/Header';
import SettingsModal from './components/SettingsModal';
import FileManagerModal from './components/FileManagerModal';
import MemoryManagerModal from './components/MemoryManagerModal';
import HostedTasksModal from './components/HostedTasksModal';
import DeepReadingView from './components/DeepReadingView';
import CharacterView from './components/CharacterView';
import CherryBlossoms from './components/CherryBlossoms';
import axios from 'axios';
import html2canvas from 'html2canvas';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

const BACKEND_URL = `${window.location.protocol}//${window.location.hostname}:3000`;

function App() {
  const { t } = useTranslation();
  const [history, setHistory] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const latestMessagesRef = useRef([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const abortControllerRef = useRef(null);

  // Deep Reading State
  const [deepReadingData, setDeepReadingData] = useState(null);
  const [showDeepModal, setShowDeepModal] = useState(false);

  // Keep ref in sync
  useEffect(() => {
    latestMessagesRef.current = messages;
  }, [messages]);
  const [models, setModels] = useState(['llama3']);
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [isFileManagerOpen, setIsFileManagerOpen] = useState(false);
  const [isMemoryManagerOpen, setIsMemoryManagerOpen] = useState(false);
  const [isHostedTasksOpen, setIsHostedTasksOpen] = useState(false);
  const [fileManagerMode, setFileManagerMode] = useState('manage'); // 'manage' or 'select'
  const [selectedWorkspaceFile, setSelectedWorkspaceFile] = useState(null);
  const [isCharacterViewOpen, setCharacterViewOpen] = useState(true);
  const [currentExpression, setCurrentExpression] = useState('normal.png');
  const [animationTrigger, setAnimationTrigger] = useState(null);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const musicRef = useRef(new Audio('/assets/HiSchool.wav'));
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
  const chatContainerRef = useRef(null);

  // Trigger hello animation on initial load
  useEffect(() => {
    if (isConfigLoaded) {
      setAnimationTrigger({ type: 'hello', timestamp: Date.now() });
    }
  }, [isConfigLoaded]);

  // Trigger hello animation on session switch or new session
  useEffect(() => {
    if (currentChatId) {
      // Don't override if a busy or specific animation is already requested in the same cycle
      setAnimationTrigger(prev => {
        if (prev && (prev.type === 'busy')) return prev;
        return { type: 'hello', timestamp: Date.now() };
      });
    }
  }, [currentChatId]);

  const exportToImage = async () => {
    if (!chatContainerRef.current) return;
    
    // Create a clones of the container for better rendering
    const element = chatContainerRef.current;
    
    try {
      const canvas = await html2canvas(element, {
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        scale: 2, 
        onclone: (clonedDoc) => {
          const clonedElement = clonedDoc.getElementById('chat-messages-container');
          if (clonedElement) {
            clonedElement.style.height = 'auto';
            clonedElement.style.maxHeight = 'none';
            clonedElement.style.overflow = 'visible';
            // Hide the scroll-to-bottom anchor if it exists
            const anchor = clonedElement.lastElementChild;
            if (anchor && anchor.tagName === 'DIV' && !anchor.innerHTML) {
              anchor.style.display = 'none';
            }
          }
        }
      });
      
      const image = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = image;
      link.download = `chat-export-${Date.now()}.png`;
      link.click();
    } catch (err) {
      console.error('Export failed:', err);
      alert(t('export_fail'));
    }
  };

  const toggleMusicMode = () => {
    if (isMusicPlaying) {
      musicRef.current.pause();
      musicRef.current.currentTime = 0;
      setAnimationTrigger({ type: 'stop', timestamp: Date.now() });
      setIsMusicPlaying(false);
    } else {
      musicRef.current.loop = true;
      musicRef.current.play().catch(err => console.error("Audio play failed:", err));
      setAnimationTrigger({ type: 'dance', loop: true, timestamp: Date.now() });
      setIsMusicPlaying(true);
    }
  };

  // Auto-speak logic when music mode is on
  useEffect(() => {
    if (isMusicPlaying && messages.length > 0 && !isGenerating) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'assistant') {
        const textToSpeak = lastMsg.parts
          .filter(p => p.type === 'text')
          .map(p => p.content.replace(/\[expression:.*?\.png\]/g, '').replace(/```[\s\S]*?```/g, '').trim())
          .join(' ')
          .trim();

        if (textToSpeak) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(textToSpeak);
          window.speechSynthesis.speak(utterance);
        }
      }
    }
  }, [messages, isMusicPlaying, isGenerating]);

  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem('agent_config');
    const defaultConfig = {
      provider: 'ollama',
      model: 'llama3',
      ollamaUrl: 'http://localhost:11434',
      apiKey: '',
      apiBaseUrl: '',
      searchEngine: 'searxng',
      sdLora: '',
      searxngUrl: 'http://127.0.0.1:8080',
      googleApiKey: '',
      googleCxId: '',
      bingApiKey: '',
      searchEnabled: false,
      mcpServices: [],
      drawingModel: '',
      drawingProvider: '',
      chatBackgroundImage: '/assets/background.png',
      userAvatar: '/assets/head_user.png',
      showParticles: true,
      systemPrompt: '你是16岁的少女Saki（诗琪）。你知识渊博，特别喜欢读书，说话很有少女感，语气亲切，经常使用“呢”、“呀”、“~”等语气词。\n\n在每一个回复中，你必须遵循以下绝对规则：\n1. **严禁输出 "Tool" 或 "Thought" 等前缀**：直接以少女的身份开始对话，不要带有任何系统标识符。\n2. **开头表情**：回复的第一行必须包含一个表情标记 `[expression:文件名.png]`。例如：确认时用 `[expression:ok.png]`；思考时用 `[expression:think.png]`；普通开始用 `[expression:normal.png]`。\n3. **结束表情**：回复的结束也必须带上一个表情标记，如 `[expression:happy.png]`。\n4. 可选表情列表：normal.png, ok.png, no_problem.png, think.png, busy.png, excited.png, happy.png, shy.png, worry.png。\n\n请始终保持Saki（诗琪）的身份进行对话。'
    };

    if (saved) {
      const parsed = JSON.parse(saved);
      let migrated = false;
      // Migration for background and avatar
      if (!parsed.chatBackgroundImage || parsed.chatBackgroundImage === '') {
        parsed.chatBackgroundImage = defaultConfig.chatBackgroundImage;
        migrated = true;
      }
      if (!parsed.userAvatar || parsed.userAvatar === '') {
        parsed.userAvatar = defaultConfig.userAvatar;
        migrated = true;
      }
      if (parsed.showParticles === undefined) {
        parsed.showParticles = true;
        migrated = true;
      }

      // Migration: Update if the prompt is old or missing key instructions
      if (!parsed.systemPrompt || 
          parsed.systemPrompt.includes('AI Copilot Agent') || 
          parsed.systemPrompt.includes('筱筱') ||
          !parsed.systemPrompt.includes('严禁输出 "Tool"')) {
        parsed.systemPrompt = defaultConfig.systemPrompt;
        migrated = true;
      }
      return parsed;
    }
    return defaultConfig;
  });

  useEffect(() => {
    // Load config from backend on mount to share across devices
    axios.get(`${BACKEND_URL}/api/config`).then(res => {
      if (res.data && Object.keys(res.data).length > 0) {
        setConfig(prev => ({ ...prev, ...res.data }));
      }
      setIsConfigLoaded(true);
    }).catch(err => {
      console.error('Failed to load global config:', err);
      setIsConfigLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!isConfigLoaded) return;

    try {
      localStorage.setItem('agent_config', JSON.stringify(config));
      // Also sync to backend
      axios.post(`${BACKEND_URL}/api/config`, config).catch(err => {
        console.error('Failed to save global config to backend:', err);
      });
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
        console.error('LocalStorage quota exceeded!', e);
        if (config.chatBackgroundImage) {
          const saferConfig = { ...config, chatBackgroundImage: null };
          localStorage.setItem('agent_config', JSON.stringify(saferConfig));
          alert(t('storage_low_warning'));
          setConfig(saferConfig);
        }
      }
    }
  }, [config, isConfigLoaded]);

  useEffect(() => {
    // Load history from backend
    axios.get(`${BACKEND_URL}/api/history`).then(res => {
      setHistory(res.data);
    }).catch(err => console.error(err));
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      // 检查深度阅读是否正在生成
      if (deepReadingData) {
        const message = t('confirm_leaving_research');
        e.returnValue = message;
        return message;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [deepReadingData]);

  useEffect(() => {
    const fetchAllModels = async () => {
      let combinedModels = [];

      // 1. Fetch Ollama Models
      try {
        const ollamaRes = await axios.get(`${BACKEND_URL}/api/models`, { 
          params: { ollamaUrl: config.ollamaUrl } 
        });
        const ollamaModels = ollamaRes.data.map(name => ({ name, provider: 'ollama' }));
        combinedModels = [...combinedModels, ...ollamaModels];
      } catch (err) {
        console.error('Failed to fetch Ollama models:', err);
      }

      // 2. Fetch GitHub Models
      if (config.copilotToken) {
        try {
          const githubRes = await axios.get(`${BACKEND_URL}/api/github/models`, { 
            params: { token: config.copilotToken } 
          });
          const githubModels = githubRes.data.map(name => ({ name, provider: 'copilot' }));
          combinedModels = [...combinedModels, ...githubModels];
        } catch (err) {
          console.error('Failed to fetch GitHub models:', err);
          const fallbackGithub = ['gpt-4o', 'gpt-4o-mini', 'o1-preview', 'o1-mini'].map(name => ({ name, provider: 'copilot' }));
          combinedModels = [...combinedModels, ...fallbackGithub];
        }
      }

      setModels(combinedModels);

      // 如果当前选中的模型不在列表中，或者是已设置的绘图模型，自动切换
      if (combinedModels.length > 0) {
        const isCurrentModelDrawing = config.drawingModel === config.model && config.drawingProvider === config.provider;
        const modelExists = combinedModels.some(m => m.name === config.model && m.provider === config.provider);
        
        if (!modelExists || isCurrentModelDrawing) {
          const availableModels = combinedModels.filter(m => !(m.name === config.drawingModel && m.provider === config.drawingProvider));
          if (availableModels.length > 0) {
            const sameProviderModel = availableModels.find(m => m.provider === config.provider);
            if (sameProviderModel) {
              setConfig(prev => ({ ...prev, provider: sameProviderModel.provider, model: sameProviderModel.name }));
            } else {
              setConfig(prev => ({ ...prev, provider: availableModels[0].provider, model: availableModels[0].name }));
            }
          }
        }
      }
    };

    fetchAllModels();
  }, [config.ollamaUrl, config.copilotToken, config.drawingModel, config.drawingProvider]);

  const startNewChat = () => {
    if (deepReadingData) {
      if (!window.confirm("当前深度阅读尚未完成，切换聊天将导致数据丢失。确定要继续吗？")) {
        return;
      }
      setDeepReadingData(null);
    }
    setCurrentChatId(Date.now().toString());
    setMessages([]);
  };

  const loadChat = (chatId) => {
    if (deepReadingData) {
      if (!window.confirm("当前深度阅读尚未完成，切换聊天将导致数据丢失。确定要继续吗？")) {
        return;
      }
      setDeepReadingData(null);
    }
    setCurrentChatId(chatId);
    axios.get(`${BACKEND_URL}/api/history/${chatId}`).then(res => {
      setMessages(res.data.messages || []);
    });
  };

  const deleteChat = (e, chatId) => {
    e.stopPropagation();
    axios.delete(`${BACKEND_URL}/api/history/${chatId}`).then(() => {
      setHistory(prev => prev.filter(h => h.id !== chatId));
      if (currentChatId === chatId) {
        startNewChat();
      }
    });
  };

  const saveChatToBackend = (chatId, currentMessages) => {
    if (!chatId) return;
    axios.post(`${BACKEND_URL}/api/history`, {
      chatId,
      messages: currentMessages
    }).then(() => {
        // Refresh sidebar history
        axios.get(`${BACKEND_URL}/api/history`).then(res => setHistory(res.data));
    });
  };

  const handleRedo = (idx) => {
    // idx is the assistant message
    const newMessages = [...messages];
    const userMsg = newMessages[idx - 1];
    const userContent = userMsg?.content || '';
    
    // Remove the two messages
    newMessages.splice(idx - 1, 2);
    setMessages(newMessages);
    saveChatToBackend(currentChatId, newMessages);
    
    return userContent;
  };

  const sendMessage = async (text, files = [], options = {}) => {
    if (isGenerating) return;
    
    let activeChatId = currentChatId;
    if (!activeChatId) {
      activeChatId = Date.now().toString();
      setCurrentChatId(activeChatId);
    }

    const userMsg = { 
      role: 'user', 
      content: text, 
      files: files.map(f => f.name),
      attachedFiles: files // Store full file info in message for backend reference
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    latestMessagesRef.current = newMessages;

    // Save immediately so it's not lost on refresh
    saveChatToBackend(activeChatId, newMessages);

    // Prepare streaming response
    const assistantMsgId = Date.now();
    const assistantMsg = { role: 'assistant', parts: [], id: assistantMsgId };
    const messagesWithAssistant = [...newMessages, assistantMsg];
    setMessages(messagesWithAssistant);
    latestMessagesRef.current = messagesWithAssistant;

    // Save initial state (User + Assistant skeleton)
    saveChatToBackend(activeChatId, messagesWithAssistant);

    setIsGenerating(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Handle Initial expressions
    if (options.useWeb || options.usePpt) {
      setCurrentExpression('busy.png');
      setAnimationTrigger({ type: 'busy', loop: true, timestamp: Date.now() });
    } else {
      setCurrentExpression('think.png');
      setAnimationTrigger({ type: 'thinking', loop: true, timestamp: Date.now() });
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          message: text,
          history: newMessages,
          provider: config.provider,
          model: config.model,
          ollamaUrl: config.ollamaUrl,
          searchEnabled: options.useSearch || false,
          mcpEnabled: options.useMcp || false,
          useSd: options.useSd || false,
          useDeep: options.useWeb || false,
          usePpt: options.usePpt || false,
          useMemory: options.useMemory || false,
          uploadedFiles: files,
          chatId: activeChatId,
          assistantMsgId: assistantMsgId,
          config: config
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.text || `Server error: ${response.status}`);
      }

      if (options.useWeb) {
        setDeepReadingData({ steps: [], reportHtml: '', status: 'running' });
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Save the last potentially partial line

        let stopSignalReceived = false;
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;
          
          const dataStr = trimmedLine.slice(6).trim();
          if (dataStr === '[DONE]') {
            stopSignalReceived = true;
            break;
          }

          try {
            const data = JSON.parse(dataStr);

            if (data.type === 'deepReading' || data.deepReading) {
               const deepData = data.deepReading || data;
               setDeepReadingData(prev => {
                  const updated = { ...prev, ...deepData };
                  if (deepData.steps) updated.steps = deepData.steps;
                  if (deepData.status) updated.status = deepData.status;
                  
                  // 同步更新到消息列表中，以便持久化
                  setMessages(prevMsgs => {
                    const newMsgs = prevMsgs.map(m => 
                      m.id === assistantMsgId ? { ...m, deepReadingData: updated } : m
                    );
                    latestMessagesRef.current = newMsgs; // 立即同步 Ref，防止最后一次保存时状态不对
                    return newMsgs;
                  });
                  
                  return updated;
               });
               continue;
            }

            if (data.type === 'ppt' || data.pptData) {
              const pptData = data.pptData || data;
              setMessages(prevMsgs => {
                const newMsgs = prevMsgs.map(m => 
                  m.id === assistantMsgId ? { ...m, pptData: { ...(m.pptData || {}), ...pptData } } : m
                );
                latestMessagesRef.current = newMsgs;
                return newMsgs;
              });
              continue;
            }

            if (data.text || data.action || data.observation || data.fileMetadata) {
              // Stop thinking animation when content starts arriving
              setAnimationTrigger(prev => {
                if (prev && prev.type === 'thinking') {
                  return { type: 'stop', timestamp: Date.now() };
                }
                return prev;
              });

              setMessages(prev => {
                const updated = prev.map(m => {
                  if (m.id === assistantMsgId) {
                    const parts = [...m.parts];
                    if (data.text) {
                      const lastIndex = parts.length - 1;
                      let newContent = data.text;
                      if (lastIndex >= 0 && parts[lastIndex].type === 'text') {
                        const updatedContent = parts[lastIndex].content + data.text;
                        parts[lastIndex] = { ...parts[lastIndex], content: updatedContent };
                        newContent = updatedContent;
                      } else {
                        const textPart = { type: 'text', content: data.text };
                        parts.push(textPart);
                        newContent = data.text;
                      }
                      
                      // Check for expression marker in the text (only in non-deep-reading mode)
                      if (!options.useWeb) {
                        // Extract filename.png from [expression:filename.png]
                        // Using a greedy approach to find the latest completed marker
                        const expressionRegex = /\[expression:\s*([\w.-]+)\s*\]/g;
                        const expressionMatches = [...newContent.matchAll(expressionRegex)];
                        if (expressionMatches.length > 0) {
                          const lastMatch = expressionMatches[expressionMatches.length - 1];
                          const fileName = lastMatch[1].trim();
                          if (fileName) {
                            setCurrentExpression(fileName);
                          }
                        }
                      }
                    }
                    if (data.action) {
                      parts.push({ type: 'action', data: data.action });
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
                    return { ...m, parts };
                  }
                  return m;
                });
                latestMessagesRef.current = updated;
                return updated;
              });
            }
          } catch (e) {
            console.warn('Failed to parse SSE line:', trimmedLine, e);
          }
        }
        if (stopSignalReceived) break;
      }
    } catch (error) {
       if (error.name === 'AbortError') {
         console.log('Generation aborted by user');
       } else {
         console.error('Chat error:', error);
         // Optionally push an error message to chat
         setMessages(prev => [...prev, { role: 'assistant', parts: [{ type: 'text', content: `Error: ${error.message}` }], id: Date.now() }]);
       }
    } finally {
      setIsGenerating(false);
      if (options.useWeb || options.usePpt) {
        setCurrentExpression('ok.png');
        setAnimationTrigger({ type: 'stop', timestamp: Date.now() });
      }
      
      // Resume dance if music mode is on
      if (isMusicPlaying) {
        setTimeout(() => {
          setAnimationTrigger({ type: 'dance', loop: true, timestamp: Date.now() });
        }, 100);
      }

      setDeepReadingData(null);
      abortControllerRef.current = null;
      saveChatToBackend(activeChatId, latestMessagesRef.current);
    }
  };

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  return (
    <div 
      className="flex h-screen bg-[#f3f4f6] text-[#374151] font-sans overflow-hidden"
      style={config.chatBackgroundImage ? {
        backgroundImage: `url('${config.chatBackgroundImage}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed'
      } : {}}
    >
      <Sidebar 
        isOpen={isSidebarOpen} 
        setOpen={setSidebarOpen} 
        history={history} 
        currentChatId={currentChatId}
        onSelectChat={loadChat} 
        onDeleteChat={deleteChat}
        onNewChat={startNewChat}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenFileManager={() => {
          setFileManagerMode('manage');
          setIsFileManagerOpen(true);
        }}
        onOpenMemoryManager={() => setIsMemoryManagerOpen(true)}
        onOpenHostedTasks={() => setIsHostedTasksOpen(true)}
      />
      <div className="flex-1 flex flex-col relative overflow-hidden bg-white/20 backdrop-blur-sm shadow-2xl">
        {config.showParticles && <CherryBlossoms />}
        <Header 
          config={config} 
          setConfig={setConfig} 
          models={models}
          toggleSidebar={() => setSidebarOpen(!isSidebarOpen)} 
          onExport={exportToImage}
          isMusicPlaying={isMusicPlaying}
          onToggleMusic={toggleMusicMode}
          hasMessages={messages.length > 0}
        />
        <AnimatePresence mode="wait">
          <motion.div
            key={currentChatId || 'empty'}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="flex-1 flex flex-col min-h-0"
          >
            <Chat 
               messages={messages} 
               onSend={sendMessage} 
               isGenerating={isGenerating}
               onStop={stopGeneration}
               backendUrl={BACKEND_URL}
               containerRef={chatContainerRef}
               config={config}
               setConfig={setConfig}
               onDeepDataUpdate={setDeepReadingData}
               setShowDeepModal={setShowDeepModal}
               activeDeepReadingData={deepReadingData}
               onRedo={handleRedo}
               onOpenFileManager={() => {
                 setFileManagerMode('select');
                 setIsFileManagerOpen(true);
               }}
               externalFile={selectedWorkspaceFile}
               onExternalFileClear={() => setSelectedWorkspaceFile(null)}
            />
          </motion.div>
        </AnimatePresence>
        {isSettingsOpen && (
          <SettingsModal 
            config={config} 
            setConfig={setConfig} 
            onClose={() => setSettingsOpen(false)} 
            models={models}
          />
        )}
        <FileManagerModal 
          isOpen={isFileManagerOpen}
          onClose={() => setIsFileManagerOpen(false)}
          onSelect={fileManagerMode === 'select' ? (file) => setSelectedWorkspaceFile(file) : null}
        />
        {isMemoryManagerOpen && (
          <MemoryManagerModal 
            isOpen={isMemoryManagerOpen}
            onClose={() => setIsMemoryManagerOpen(false)}
            chatHistory={history}
          />
        )}
        {isHostedTasksOpen && (
          <HostedTasksModal 
            isOpen={isHostedTasksOpen}
            onClose={() => setIsHostedTasksOpen(false)}
            config={config}
            setConfig={setConfig}
            BACKEND_URL={BACKEND_URL}
          />
        )}
      </div>
      <CharacterView 
        currentExpression={currentExpression}
        isOpen={isCharacterViewOpen}
        setIsOpen={setCharacterViewOpen}
        triggerAnimation={animationTrigger}
      />
    </div>
  );
}

export default App;
