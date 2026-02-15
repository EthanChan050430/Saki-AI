import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Cpu, Server, Terminal, Shield, ExternalLink, RefreshCw, CheckCircle2, Image, ChevronDown, UserCircle, Palette, Plus, Globe, Bot, Search, Volume2, Mic, Network } from 'lucide-react';
import ImageCropperModal from './ImageCropperModal';
import botAvatar from '../head.png';

const BACKEND_URL = `${window.location.protocol}//${window.location.hostname}:3000`;

export default function SettingsModal({ config, setConfig, onClose, models }) {
  const { t, i18n } = useTranslation();
  const [mcpConfigText, setMcpConfigText] = useState(config.mcpConfig ? JSON.stringify(config.mcpConfig, null, 2) : '{\n  "mcpServers": {}\n}');
  const [deviceFlow, setDeviceFlow] = useState(null); // { user_code, device_code, verification_uri, interval }
  const [isPolling, setIsPolling] = useState(false);
  const pollTimerRef = useRef(null);
  const [sovitsModels, setSovitsModels] = useState({ gpt: [], sovits: [] });
  const [isRefreshingModels, setIsRefreshingModels] = useState(false);
  const sovitsAudioInputRef = useRef(null);

  const refreshSovitsModels = async () => {
    setIsRefreshingModels(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/sovits/models`);
      const data = await res.json();
      setSovitsModels(data);
    } catch (err) {
      console.error('Failed to fetch SoVITS models:', err);
    } finally {
      setIsRefreshingModels(false);
    }
  };

  const handleSovitsAudioUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${BACKEND_URL}/api/upload`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.path) {
        setConfig({ ...config, sovitsRefAudio: data.path });
      }
    } catch (err) {
      console.error('Failed to upload reference audio:', err);
    }
  };

  useEffect(() => {
    if (config.ttsProvider === 'gpt-sovits' && sovitsModels.gpt.length === 0) {
      refreshSovitsModels();
    }
  }, [config.ttsProvider]);

  // States for Image Cropper
  const [cropperData, setCropperData] = useState({
    isOpen: false,
    image: null,
    target: null, // 'user' or 'ai'
  });

  const handleCropComplete = async (croppedImageUrl) => {
    try {
      // 1. Convert blob URL to File object
      const response = await fetch(croppedImageUrl);
      const blob = await response.blob();
      const file = new File([blob], "avatar.jpg", { type: "image/jpeg" });

      // 2. Upload to server
      const formData = new FormData();
      formData.append('file', file);
      
      const res = await fetch(`${BACKEND_URL}/api/upload`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      
      if (data.filename) {
        const imageUrl = `${BACKEND_URL}/uploads/${data.filename}`;
        if (cropperData.target === 'user') {
          setConfig({ ...config, userAvatar: imageUrl });
        } else {
          setConfig({ ...config, aiAvatar: imageUrl });
        }
      }
      setCropperData({ ...cropperData, isOpen: false });
    } catch (err) {
      console.error('Failed to upload cropped image:', err);
      alert(t('upload_avatar_fail'));
    }
  };

  const startGitHubLogin = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/github/login/device`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.user_code) {
        setDeviceFlow(data);
        setIsPolling(true);
      } else {
        alert(t('login_failed_with_details', { error: data.hint || data.error || t('unknown_error') }));
      }
    } catch (err) {
      console.error('Failed to start GitHub login:', err);
      alert(t('github_start_login_error'));
    }
  };

  useEffect(() => {
    let timeoutId = null;
    let isActive = true;

    const poll = async () => {
      if (!isPolling || !deviceFlow || !isActive) return;

      try {
        const res = await fetch(`${BACKEND_URL}/api/github/login/poll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_code: deviceFlow.device_code })
        });
        const data = await res.json();
        
        if (!isActive) return;

        if (data.access_token) {
          console.log('Token received successfully!');
          setConfig(prev => ({ ...prev, copilotToken: data.access_token }));
          setIsPolling(false);
          setDeviceFlow(null);
          return;
        }

        if (data.error) {
          if (data.error === 'authorization_pending') {
            // Keep polling
          } else if (data.error === 'slow_down') {
            // Just wait for the next cycle
            console.warn('GitHub suggests slow down, waiting...');
          } else {
            console.error('GitHub Poll Stop Error:', data.error);
            setIsPolling(false);
            setDeviceFlow(null);
            return;
          }
        }
      } catch (err) {
        console.error('Polling fetch error:', err);
      }

      // Schedule next poll - Using setTimeout to prevent overlapping requests
      if (isActive && isPolling) {
        timeoutId = setTimeout(poll, (deviceFlow.interval || 5) * 1000);
      }
    };

    if (isPolling && deviceFlow) {
      console.log('Starting polling for GitHub token...');
      poll();
    }

    return () => {
      isActive = false;
      if (timeoutId) {
        console.log('Cleaning up polling timeout...');
        clearTimeout(timeoutId);
      }
    };
  }, [isPolling, deviceFlow, setConfig]);

  const addMcp = () => {
    if (!mcpUrl) return;
    const newMcp = [...(config.mcpServices || []), mcpUrl];
    setConfig({ ...config, mcpServices: newMcp });
    setMcpUrl('');
    // Persist to backend
    fetch(`${BACKEND_URL}/api/mcp/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mcpServices: newMcp })
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[110] flex items-center justify-center p-0 sm:p-4">
      <div className="bg-white sm:rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col h-full sm:h-auto sm:max-h-[90vh]">
        <div className="p-4 border-b flex items-center justify-between bg-gray-50 shrink-0">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <Shield size={18} className="text-blue-500" />
            {t('settings')}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Network Settings */}
          <section>
            <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Network size={16} />
              {t('network_settings') || 'Network Settings'}
            </h4>
            <div className="bg-gray-50 p-4 border rounded-xl flex items-center justify-between">
              <div>
                <label className="text-sm font-semibold text-gray-800">{t('remote_access') || 'Remote Access (LAN)'}</label>
                <p className="text-xs text-gray-500 mt-0.5 max-w-[300px]">{t('remote_access_desc') || 'Allow other devices on the same network to access Saki (Requires Restart).'}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className={`text-xs font-medium px-2 py-0.5 rounded ${config.remoteAccess ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                  {config.remoteAccess ? 'ON' : 'OFF'}
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={config.remoteAccess || false}
                    onChange={(e) => {
                      setConfig({ ...config, remoteAccess: e.target.checked });
                    }}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>
          </section>

          {/* AI Providers */}
          <section>
            <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Cpu size={16} />
              {t('ai_provider')}
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { id: 'ollama', name: 'Ollama', sub: t('local_model') },
                { id: 'copilot', name: 'GitHub Models', sub: t('github_auth') },
                { id: 'openai', name: 'OpenAI', sub: 'ChatGPT' },
                { id: 'deepseek', name: 'Deepseek', sub: '深度求索' },
                { id: 'zhipu', name: '智谱 AI', sub: 'GLM' },
                { id: 'gemini', name: 'Gemini', sub: 'Google' },
                { id: 'minimax', name: 'MiniMax', sub: '海螺 AI' },
                { id: 'anthropic', name: 'Anthropic', sub: 'Claude' },
                { id: 'moonshot', name: 'Moonshot AI', sub: '月之暗面' },
                { id: 'tongyi', name: '通义', sub: '阿里 Qwen' },
                { id: 'doubao', name: '豆包', sub: '字节跳动' },
                { id: 'custom', name: 'Custom', sub: t('custom_api') },
              ].map(p => (
                <button 
                  key={p.id}
                  onClick={() => setConfig({...config, provider: p.id})}
                  className={`p-3 border-2 rounded-xl text-left transition-all ${config.provider === p.id ? 'border-blue-500 bg-blue-50' : 'hover:border-gray-300'}`}
                >
                  <div className="font-bold text-gray-900 text-sm whitespace-nowrap overflow-hidden text-ellipsis">{p.name}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{p.sub}</div>
                </button>
              ))}
            </div>

            {/* Config details based on provider */}
            {config.provider !== 'ollama' && config.provider !== 'copilot' && (
              <div className="mt-4 p-4 bg-gray-50 border rounded-xl space-y-3">
                {config.provider === 'custom' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Base URL</label>
                    <input 
                      type="text"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="https://api.openai.com/v1"
                      value={config.apiBaseUrl || ''}
                      onChange={(e) => setConfig({...config, apiBaseUrl: e.target.value})}
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">API Key</label>
                  <div className="relative">
                    <input 
                      type="password"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none pr-10"
                      placeholder="sk-..."
                      value={config.apiKey || ''}
                      onChange={(e) => setConfig({...config, apiKey: e.target.value})}
                    />
                    <Shield className="absolute right-3 top-2.5 text-gray-400" size={16} />
                  </div>
                </div>
                <p className="text-[10px] text-gray-400">{t('api_key_tip')}</p>
              </div>
            )}
            {config.provider === 'ollama' && (
              <div className="mt-4 p-4 bg-gray-50 border rounded-xl">
                <label className="block text-xs font-medium text-gray-500 mb-2">{t('ollama_endpoint')}</label>
                <input 
                   type="text"
                   className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                   placeholder="http://localhost:11434"
                   value={config.ollamaUrl || ''}
                   onChange={(e) => setConfig({...config, ollamaUrl: e.target.value})}
                />
                <p className="text-[10px] text-gray-400 mt-2">{t('ollama_tip')}</p>
              </div>
            )}
            {config.provider === 'copilot' && (
              <div className="mt-4 p-4 bg-gray-50 border rounded-xl space-y-4">
                {!config.copilotToken ? (
                  <>
                    <div className="text-xs text-gray-500 bg-blue-50 border border-blue-100 p-3 rounded-lg leading-relaxed">
                      {t('github_auth_desc')}
                    </div>
                    {!deviceFlow ? (
                      <button 
                        onClick={startGitHubLogin}
                        className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
                      >
                        {t('github_login_btn')}
                        <ExternalLink size={16} />
                      </button>
                    ) : (
                      <div className="text-center space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{t('enter_code_browser')}</div>
                        <div className="text-3xl font-mono font-bold tracking-[0.3em] bg-white border-2 border-dashed border-blue-200 py-4 rounded-2xl text-blue-600 shadow-inner">
                          {deviceFlow.user_code}
                        </div>
                        <a 
                          href={deviceFlow.verification_uri} 
                          target="_blank" 
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 transition-all"
                        >
                          {t('jump_verify')}
                          <ExternalLink size={14} />
                        </a>
                        <div className="flex items-center justify-center gap-2 text-[11px] text-blue-400">
                          <RefreshCw size={12} className="animate-spin" />
                          {t('waiting_auth')}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-green-100 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center">
                        <CheckCircle2 size={24} className="text-green-500" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-gray-800">{t('github_authorized')}</div>
                        <div className="text-[10px] text-gray-500 truncate w-32">Token: {config.copilotToken.slice(0, 8)}...</div>
                      </div>
                    </div>
                    <button 
                      onClick={() => setConfig({...config, copilotToken: ''})}
                      className="text-xs text-red-500 font-medium hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors border border-red-50"
                    >
                      {t('relogin')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Search Engine Config */}
          <section>
            <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Search size={16} />
              {t('search_engine_config')}
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { id: 'off', name: t('none'), sub: t('disabled') },
                { id: 'searxng', name: 'SearxNG', sub: '(Local)' },
                { id: 'google', name: 'Google', sub: 'Custom Search' },
                { id: 'bing', name: 'Bing', sub: 'Azure' },
                { id: 'duckduckgo', name: 'DuckDuckGo', sub: '(Free)' },
              ].map(s => (
                <button 
                  key={s.id}
                  onClick={() => setConfig({...config, searchEngine: s.id})}
                  className={`p-3 border-2 rounded-xl text-left transition-all ${config.searchEngine === s.id ? 'border-blue-500 bg-blue-50' : 'hover:border-gray-300'}`}
                >
                  <div className="font-bold text-gray-900 text-sm">{s.name}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">{s.sub}</div>
                </button>
              ))}
            </div>

            {config.searchEngine === 'searxng' && (
              <div className="mt-4 p-4 bg-gray-50 border rounded-xl space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">{t('searxng_url')}</label>
                  <input 
                    type="text"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="http://127.0.0.1:8080"
                    value={config.searxngUrl || ''}
                    onChange={(e) => setConfig({...config, searxngUrl: e.target.value})}
                  />
                  <p className="text-[10px] text-gray-400 mt-2">{t('searxng_url_tip')}</p>
                </div>
              </div>
            )}

            {config.searchEngine === 'google' && (
              <div className="mt-4 p-4 bg-gray-50 border rounded-xl space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Google API Key</label>
                  <input 
                    type="password"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="AIza..."
                    value={config.googleApiKey || ''}
                    onChange={(e) => setConfig({...config, googleApiKey: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Google CX ID</label>
                  <input 
                    type="text"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Search Engine ID"
                    value={config.googleCxId || ''}
                    onChange={(e) => setConfig({...config, googleCxId: e.target.value})}
                  />
                </div>
              </div>
            )}

            {config.searchEngine === 'bing' && (
              <div className="mt-4 p-4 bg-gray-50 border rounded-xl space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Bing API Key</label>
                  <input 
                    type="password"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Azure Key"
                    value={config.bingApiKey || ''}
                    onChange={(e) => setConfig({...config, bingApiKey: e.target.value})}
                  />
                </div>
              </div>
            )}
          </section>

          {/* Model Personality */}
          <section>
            <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <UserCircle size={16} />
              {t('role_prompt_settings')}
            </h4>
            <div className="bg-gray-50 rounded-xl p-4 border space-y-3">
              <label className="block text-xs font-medium text-gray-500">{t('personality_def')}</label>
              <textarea 
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white min-h-[100px] resize-none"
                placeholder={t('prompt_placeholder')}
                value={config.systemPrompt || t('saki_personality')}
                onChange={(e) => setConfig({...config, systemPrompt: e.target.value})}
              />
              <p className="text-[10px] text-gray-400 leading-relaxed">
                {t('prompt_desc')}
              </p>
            </div>
          </section>

          {/* Drawing Model Settings */}
          <section>
            <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Image size={16} />
              {t('drawing_model_settings')}
            </h4>
            <div className="bg-gray-50 rounded-xl p-4 border space-y-4">
               <div className="text-xs text-gray-500 mb-2">
                 {t('drawing_desc')}
               </div>

               <div className="space-y-4">
                 {/* 选项卡切换 */}
                 <div className="flex p-1 bg-gray-200 rounded-lg w-fit">
                    <button 
                      onClick={() => setConfig({...config, drawingProvider: 'none'})}
                      className={`px-3 py-1.5 text-[11px] font-bold rounded-md transition-all ${config.drawingProvider === 'none' ? 'bg-white shadow-sm text-gray-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      {t('none')}
                    </button>
                    <button 
                      onClick={() => setConfig({...config, drawingProvider: (config.drawingProvider === 'stable-diffusion' || config.drawingProvider === 'none') ? '' : config.drawingProvider})}
                      className={`px-3 py-1.5 text-[11px] font-bold rounded-md transition-all ${(config.drawingProvider !== 'stable-diffusion' && config.drawingProvider !== 'none') ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      {t('llm_drawing')}
                    </button>
                    <button 
                      onClick={() => setConfig({...config, drawingProvider: 'stable-diffusion'})}
                      className={`px-3 py-1.5 text-[11px] font-bold rounded-md transition-all ${config.drawingProvider === 'stable-diffusion' ? 'bg-white shadow-sm text-purple-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      {t('sd_drawing')}
                    </button>
                    <button 
                      onClick={() => setConfig({...config, drawingProvider: 'custom'})}
                      className={`px-3 py-1.5 text-[11px] font-bold rounded-md transition-all ${config.drawingProvider === 'custom' ? 'bg-white shadow-sm text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      {t('custom_drawing')}
                    </button>
                 </div>

                 {config.drawingProvider === 'none' ? (
                   <div className="p-3 bg-white/50 rounded-lg border border-dashed border-gray-300 text-center">
                     <p className="text-[10px] text-gray-400 italic">{t('disable_drawing')}</p>
                   </div>
                 ) : config.drawingProvider === 'stable-diffusion' ? (
                   <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                     <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{t('sd_api_url')}</label>
                        <input 
                          type="text"
                          className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none bg-white font-mono"
                          placeholder="http://127.0.0.1:7860"
                          value={config.sdUrl || 'http://127.0.0.1:7860'}
                          onChange={(e) => setConfig({...config, sdUrl: e.target.value})}
                        />
                        <p className="text-[10px] text-gray-400 mt-1">{t('sd_tip')}</p>
                     </div>
                   </div>
                 ) : config.drawingProvider === 'custom' ? (
                    <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Base URL</label>
                        <input 
                          type="text"
                          className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none bg-white font-mono"
                          placeholder="https://api.openai.com/v1"
                          value={config.customDrawingUrl || ''}
                          onChange={(e) => setConfig({...config, customDrawingUrl: e.target.value})}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">API Key</label>
                        <input 
                          type="password"
                          className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none bg-white font-mono"
                          placeholder="sk-..."
                          value={config.customDrawingKey || ''}
                          onChange={(e) => setConfig({...config, customDrawingKey: e.target.value})}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Model ID</label>
                        <input 
                          type="text"
                          className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none bg-white font-mono"
                          placeholder="dall-e-3"
                          value={config.customDrawingModel || ''}
                          onChange={(e) => setConfig({...config, customDrawingModel: e.target.value})}
                        />
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1">{t('custom_drawing_tip')}</p>
                    </div>
                 ) : (
                   <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                     <div className="relative">
                       <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{t('select_drawing_model')}</label>
                       <select 
                         className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white appearance-none pr-10"
                         value={config.drawingModel ? `${config.drawingProvider}:${config.drawingModel}` : ''}
                         onChange={(e) => {
                           const val = e.target.value;
                           if (!val) {
                             setConfig({...config, drawingModel: '', drawingProvider: ''});
                           } else {
                             const parts = val.split(':');
                             const provider = parts[0];
                             const name = parts.slice(1).join(':');
                             setConfig({...config, drawingProvider: provider, drawingModel: name});
                           }
                         }}
                       >
                         <option value="">{t('disable_drawing')}</option>
                         {models?.filter(m => m.provider !== 'custom').map(m => (
                           <option key={`${m.provider}:${m.name}`} value={`${m.provider}:${m.name}`}>
                             {m.provider === 'ollama' ? 'Ollama' : 'GitHub'}: {m.name}
                           </option>
                         ))}
                       </select>
                       <div className="absolute right-3 top-8 pointer-events-none text-gray-400">
                         <ChevronDown size={16} />
                       </div>
                     </div>
                   </div>
                 )}
               </div>
            </div>
          </section>

          {/* TTS Settings */}
          <section>
            <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Volume2 size={16} />
              {t('tts_settings')}
            </h4>
            <div className="bg-gray-50 rounded-xl p-4 border space-y-4">
              <div className="flex p-1 bg-gray-200 rounded-lg w-fit">
                <button 
                  onClick={() => setConfig({...config, ttsProvider: 'browser'})}
                  className={`px-3 py-1.5 text-[11px] font-bold rounded-md transition-all ${(!config.ttsProvider || config.ttsProvider === 'browser') ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {t('browser_tts')}
                </button>
                <button 
                  onClick={() => setConfig({...config, ttsProvider: 'gpt-sovits'})}
                  className={`px-3 py-1.5 text-[11px] font-bold rounded-md transition-all ${config.ttsProvider === 'gpt-sovits' ? 'bg-white shadow-sm text-purple-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  GPT-SoVITS
                </button>
              </div>

              {config.ttsProvider === 'gpt-sovits' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">API URL</label>
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        className="flex-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none bg-white font-mono"
                        placeholder="http://127.0.0.1:9880"
                        value={config.sovitsUrl || 'http://127.0.0.1:9880'}
                        onChange={(e) => setConfig({...config, sovitsUrl: e.target.value})}
                      />
                      <button 
                        onClick={refreshSovitsModels}
                        className="p-2 bg-white border rounded-lg hover:bg-gray-50 text-purple-600 transition-all active:scale-95"
                        title={t('refresh_models')}
                      >
                        <RefreshCw size={16} className={isRefreshingModels ? 'animate-spin' : ''} />
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">GPT Model</label>
                      <select 
                        className="w-full border rounded-lg px-2 py-1.5 text-xs bg-white focus:ring-2 focus:ring-purple-500 outline-none"
                        value={config.sovitsGptModel || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setConfig({...config, sovitsGptModel: val});
                          const url = config.sovitsUrl || 'http://127.0.0.1:9880';
                          fetch(`${BACKEND_URL}/api/sovits/proxy/set_weights?url=${encodeURIComponent(url)}&type=gpt&weights_path=${encodeURIComponent(val)}`).catch(console.error);
                        }}
                      >
                        <option value="">{t('select_model')}</option>
                        {sovitsModels.gpt.map(m => <option key={m} value={m}>{m.split('/').pop()}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">SoVITS Model</label>
                      <select 
                        className="w-full border rounded-lg px-2 py-1.5 text-xs bg-white focus:ring-2 focus:ring-purple-500 outline-none"
                        value={config.sovitsSovitsModel || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setConfig({...config, sovitsSovitsModel: val});
                          const url = config.sovitsUrl || 'http://127.0.0.1:9880';
                          fetch(`${BACKEND_URL}/api/sovits/proxy/set_weights?url=${encodeURIComponent(url)}&type=sovits&weights_path=${encodeURIComponent(val)}`).catch(console.error);
                        }}
                      >
                        <option value="">{t('select_model')}</option>
                        {sovitsModels.sovits.map(m => <option key={m} value={m}>{m.split('/').pop()}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{t('refer_audio')}</label>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => sovitsAudioInputRef.current?.click()}
                        className={`flex-1 border-2 border-dashed rounded-xl p-3 text-xs transition-all flex items-center justify-center gap-2 ${config.sovitsRefAudio ? 'border-purple-300 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-500 hover:border-purple-300 hover:bg-purple-50'}`}
                      >
                        <Mic size={14} />
                        {config.sovitsRefAudio ? config.sovitsRefAudio.split(/[\\\/]/).pop() : t('upload_refer_audio')}
                      </button>
                      <input type="file" ref={sovitsAudioInputRef} className="hidden" accept="audio/*" onChange={handleSovitsAudioUpload} />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{t('refer_text')}</label>
                    <textarea 
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none bg-white min-h-[60px] resize-none"
                      value={config.sovitsRefText || ''}
                      onChange={(e) => setConfig({...config, sovitsRefText: e.target.value})}
                      placeholder={t('refer_text_placeholder')}
                    />
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Interface Settings */}
          <section>
            <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Palette size={16} />
              {t('interface_custom')}
            </h4>
            <div className="bg-gray-50 rounded-xl p-4 border space-y-4">
              {/* Language Selector */}
              <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <Globe size={16} className="text-gray-400" />
                  <div>
                    <div className="text-sm font-bold text-gray-800">{t('language')}</div>
                  </div>
                </div>
                <select
                  value={i18n.language}
                  onChange={(e) => i18n.changeLanguage(e.target.value)}
                  className="border rounded-lg px-2 py-1.5 text-xs outline-none bg-white min-w-[120px]"
                >
                  <option value="zh-CN">简体中文</option>
                  <option value="zh-TW">繁體中文</option>
                  <option value="en-US">English (US)</option>
                  <option value="en-GB">English (UK)</option>
                  <option value="ja">日本語</option>
                  <option value="fr">Français</option>
                </select>
              </div>

              <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                <div>
                  <div className="text-sm font-bold text-gray-800">{t('particles_effect')}</div>
                  <div className="text-[10px] text-gray-500">{t('particles_desc')}</div>
                </div>
                <button 
                  onClick={() => setConfig({...config, showParticles: !config.showParticles})}
                  className={`w-10 h-5 rounded-full transition-all relative ${config.showParticles ? 'bg-pink-400' : 'bg-gray-300'}`}
                >
                  <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${config.showParticles ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-4">{t('avatar_custom')}</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* User Avatar */}
                  <div className="space-y-3">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                      <UserCircle size={12} />
                      {t('user_avatar')}
                    </div>
                    <div className="flex items-center gap-4">
                      <div 
                        className="w-16 h-16 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden bg-white group cursor-pointer hover:border-blue-400 transition-all shadow-sm shrink-0"
                        onClick={() => document.getElementById('avatar-upload').click()}
                      >
                        {config.userAvatar ? (
                          <img src={config.userAvatar} alt="Avatar Preview" className="w-full h-full object-cover" />
                        ) : (
                          <Plus size={20} className="text-gray-400 group-hover:text-blue-500" />
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <input 
                          id="avatar-upload"
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={(e) => {
                            const file = e.target.files[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = () => {
                                setCropperData({
                                  isOpen: true,
                                  image: reader.result,
                                  target: 'user'
                                });
                              };
                              reader.readAsDataURL(file);
                              e.target.value = ''; // Reset to allow same file again
                            }
                          }}
                        />
                        <div className="flex flex-wrap gap-2">
                          <button 
                            onClick={() => document.getElementById('avatar-upload').click()}
                            className="text-[11px] bg-white border px-3 py-1.5 rounded-lg hover:bg-gray-50 font-bold shadow-sm transition-all active:scale-95"
                          >
                            {t('change_avatar')}
                          </button>
                          {config.userAvatar && config.userAvatar !== '/assets/head_user.png' && (
                            <button 
                              onClick={() => setConfig({...config, userAvatar: '/assets/head_user.png'})}
                              className="text-[11px] text-red-500 bg-white border border-red-100 px-3 py-1.5 rounded-lg hover:bg-red-50 font-bold transition-all active:scale-95"
                            >
                              {t('restore_default')}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* AI Avatar */}
                  <div className="space-y-3">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                      <Bot size={12} />
                      {t('ai_avatar')}
                    </div>
                    <div className="flex items-center gap-4">
                      <div 
                        className="w-16 h-16 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden bg-white group cursor-pointer hover:border-blue-400 transition-all shadow-sm shrink-0"
                        onClick={() => document.getElementById('ai-avatar-upload').click()}
                      >
                        {config.aiAvatar ? (
                          <img src={config.aiAvatar} alt="AI Avatar Preview" className="w-full h-full object-cover" />
                        ) : (
                          <img src={botAvatar} alt="AI Avatar Preview" className="w-full h-full object-cover opacity-50" />
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <input 
                          id="ai-avatar-upload"
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={(e) => {
                            const file = e.target.files[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = () => {
                                setCropperData({
                                  isOpen: true,
                                  image: reader.result,
                                  target: 'ai'
                                });
                              };
                              reader.readAsDataURL(file);
                              e.target.value = '';
                            }
                          }}
                        />
                        <div className="flex flex-wrap gap-2">
                          <button 
                            onClick={() => document.getElementById('ai-avatar-upload').click()}
                            className="text-[11px] bg-white border px-3 py-1.5 rounded-lg hover:bg-gray-50 font-bold shadow-sm transition-all active:scale-95"
                          >
                            {t('change_ai_avatar')}
                          </button>
                          {config.aiAvatar && (
                            <button 
                              onClick={() => setConfig({...config, aiAvatar: ''})}
                              className="text-[11px] text-red-500 bg-white border border-red-100 px-3 py-1.5 rounded-lg hover:bg-red-50 font-bold transition-all active:scale-95"
                            >
                              {t('restore_default')}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">{t('background_image')}</label>
                <div className="flex items-center gap-4">
                  <div 
                    className="w-24 h-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden bg-white group cursor-pointer hover:border-blue-400 transition-all"
                    onClick={() => document.getElementById('bg-upload').click()}
                  >
                    {config.chatBackgroundImage ? (
                      <img src={config.chatBackgroundImage} alt="Background Preview" className="w-full h-full object-cover" />
                    ) : (
                      <Plus size={20} className="text-gray-400 group-hover:text-blue-500" />
                    )}
                  </div>
                  <div className="flex-1">
                    <input 
                      id="bg-upload"
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={async (e) => {
                        const file = e.target.files[0];
                        if (file) {
                          const formData = new FormData();
                          formData.append('file', file);
                          try {
                            const res = await fetch(`${BACKEND_URL}/api/upload`, {
                              method: 'POST',
                              body: formData
                            });
                            const data = await res.json();
                            if (data.filename) {
                              const imageUrl = `${BACKEND_URL}/uploads/${data.filename}`;
                              setConfig({...config, chatBackgroundImage: imageUrl});
                            }
                          } catch (err) {
                            console.error('Failed to upload background:', err);
                            alert(t('upload_bg_fail'));
                          }
                        }
                      }}
                    />
                    <div className="flex gap-2">
                      <button 
                        onClick={() => document.getElementById('bg-upload').click()}
                        className="text-xs bg-white border px-3 py-1.5 rounded-lg hover:bg-gray-50 font-medium"
                      >
                        {t('upload_image')}
                      </button>
                      {config.chatBackgroundImage && config.chatBackgroundImage !== '/assets/background.png' && (
                        <button 
                          onClick={() => setConfig({...config, chatBackgroundImage: '/assets/background.png'})}
                          className="text-xs text-red-500 bg-white border border-red-100 px-3 py-1.5 rounded-lg hover:bg-red-50 font-medium"
                        >
                          {t('restore_default')}
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-2">{t('image_format_tip')}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* MCP Services */}
          <section>
            <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Server size={16} />
              {t('mcp_config')}
</h4>
            <div className="bg-gray-50 rounded-xl p-4 border space-y-4">
              <div className="text-xs text-gray-500 leading-relaxed">
                {t('mcp_config_desc')}
              </div>
              <textarea 
                className="w-full border rounded-lg px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-blue-500 outline-none bg-white min-h-[200px] resize-none"
                value={mcpConfigText}
                onChange={(e) => {
                  setMcpConfigText(e.target.value);
                  try {
                    const parsed = JSON.parse(e.target.value);
                    setConfig({ ...config, mcpConfig: parsed });
                  } catch (e) {
                    // Invalid JSON - don't update config yet
                  }
                }}
              />
              <p className="text-[10px] text-gray-400">{t('mcp_tip')}</p>
            </div>
          </section>
        </div>


        <div className="p-4 border-t bg-gray-50 flex justify-end">
          <button 
            onClick={onClose}
            className="bg-blue-600 text-white px-6 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 shadow-lg shadow-blue-100"
          >
            {t('save')}
          </button>
        </div>

        {cropperData.isOpen && (
          <ImageCropperModal 
            image={cropperData.image} 
            onCropComplete={handleCropComplete} 
            onClose={() => setCropperData({ ...cropperData, isOpen: false })} 
          />
        )}
      </div>
    </div>
  );
}
