import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Menu, Search, Globe, ChevronDown, Image, Music } from 'lucide-react';

export default function Header({ config, setConfig, models, toggleSidebar, onExport, hasMessages, isMusicPlaying, onToggleMusic }) {
  const { t } = useTranslation();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  return (
    <header className="h-14 border-b border-white/20 bg-white/30 flex items-center justify-between px-4 z-10 shrink-0 sticky top-0 backdrop-blur-md">
      <div className="flex items-center gap-4">
        <button onClick={toggleSidebar} className="p-2 hover:bg-white/20 rounded-lg transition-colors text-gray-700">
          <Menu size={20} />
        </button>
        <div className="relative">
          <button 
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            onBlur={() => setTimeout(() => setIsDropdownOpen(false), 200)}
            className="flex items-center gap-2 px-3 py-1.5 border border-white/40 bg-white/40 backdrop-blur-sm rounded-lg hover:border-blue-400 transition-all shadow-sm"
          >
            <span className="text-sm font-semibold text-gray-800">{config.model}</span>
            <ChevronDown size={14} className={`text-gray-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {isDropdownOpen && (
            <div className="absolute top-full left-0 mt-2 bg-white border border-[#e5e7eb] rounded-xl shadow-xl min-w-[260px] max-h-80 overflow-y-auto z-50 py-2 animate-in fade-in zoom-in duration-200">
              {models && models.length > 0 ? (
                <>
                  {/* 分组显示模型 */}
                  {['ollama', 'copilot'].map(provider => {
                    const providerModels = models.filter(m => m.provider === provider && !(m.name === config.drawingModel && m.provider === config.drawingProvider));
                    if (providerModels.length === 0) return null;
                    return (
                      <div key={provider}>
                        <div className="px-4 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-50/50">
                          {provider === 'ollama' ? t('ollama_local') : t('github_models')}
                        </div>
                        {providerModels.map(m => (
                          <button 
                            key={`${m.provider}-${m.name}`} 
                            onClick={() => {
                              setConfig({...config, provider: m.provider, model: m.name});
                              setIsDropdownOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2 hover:bg-gray-50 text-sm flex items-center justify-between ${config.model === m.name && config.provider === m.provider ? 'bg-blue-50 text-blue-600 font-bold' : ''}`}
                          >
                            <span>{m.name}</span>
                            {config.model === m.name && config.provider === m.provider && <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </>
              ) : (
                <div className="px-4 py-2 text-xs text-gray-400">{t('no_models_detected')}</div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={onToggleMusic}
          title={isMusicPlaying ? "Stop Music" : "Dance & Radio Mode"}
          className={`p-2 rounded-lg transition-all flex items-center gap-1.5 ${
            isMusicPlaying 
              ? "text-rose-500 bg-rose-50" 
              : "text-gray-500 hover:text-blue-500 hover:bg-blue-50"
          }`}
        >
          <Music size={18} className={isMusicPlaying ? "animate-pulse" : ""} />
        </button>
        <button 
          onClick={onExport}
          disabled={!hasMessages}
          title={hasMessages ? t('export_chat_image') : t('no_messages_export')}
          className={`p-2 rounded-lg transition-all flex items-center gap-1.5 ${
            hasMessages 
              ? "text-gray-500 hover:text-blue-500 hover:bg-blue-50 cursor-pointer" 
              : "text-gray-300 cursor-not-allowed opacity-50"
          }`}
        >
          <Image size={18} />
          <span className="text-xs font-medium hidden md:inline">{t('export')}</span>
        </button>
      </div>
    </header>
  );
}
