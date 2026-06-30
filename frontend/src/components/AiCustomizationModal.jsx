import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Camera, RotateCcw } from 'lucide-react';
import botAvatar from '../head.png';

export default function AiCustomizationModal({
  isOpen,
  onClose,
  config,
  setConfig,
  backendUrl
}) {
  const { t } = useTranslation();
  const [promptText, setPromptText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Initialize promptText when modal opens or config changes
  useEffect(() => {
    if (isOpen) {
      setPromptText(config?.systemPrompt || '');
    }
  }, [isOpen, config?.systemPrompt]);

  if (!isOpen) return null;

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${backendUrl}/api/upload`, {
        method: 'POST',
        body: formData
      });
      
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      
      if (data.filename) {
        const imageUrl = `${backendUrl}/uploads/${data.filename}`;
        setConfig({ ...config, aiAvatar: imageUrl });
      } else {
        alert(t('upload_avatar_fail', '上传头像失败'));
      }
    } catch (err) {
      console.error('Failed to upload AI avatar:', err);
      alert(t('upload_avatar_fail', '上传头像失败'));
    } finally {
      setIsUploading(false);
      e.target.value = ''; // Reset input
    }
  };

  const handleRestoreDefaultAvatar = () => {
    setConfig({ ...config, aiAvatar: '' });
  };

  const handleSave = () => {
    setConfig({ ...config, systemPrompt: promptText });
    onClose();
  };

  // Saki's default personality system prompt as visual reference or restore fallback
  const defaultSakiPrompt = '你是16岁的少女Saki（诗琪）。你知识渊博，特别喜欢读书，说话很有少女感，语气亲切，经常使用“呢”、“呀”、“~”等语气词。\n\n在每一个回复中，你必须遵循以下绝对规则：\n1. **严禁输出 "Tool" 或 "Thought" 等前缀**：直接以少女的身份开始对话，不要带有任何系统标识符。\n2. **开头表情**：回复的第一行必须包含一个表情标记 `[expression:文件名.png]`。例如：确认时用 `[expression:ok.png]`；思考时用 `[expression:think.png]`；普通开始用 `[expression:normal.png]`。\n3. **结束表情**：回复的结束也必须带上一个表情标记，如 `[expression:happy.png]`。\n4. 可选表情列表：normal.png, ok.png, no_problem.png, think.png, busy.png, excited.png, happy.png, shy.png, worry.png。\n\n请始终保持Saki（诗琪）的身份进行对话。';

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div 
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px]" 
        onClick={onClose} 
      />
      <div className="relative w-full max-w-[480px] bg-white rounded-2xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.12)] border border-gray-100 animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-100/80">
          <div className="space-y-0.5">
            <h3 className="text-base font-semibold text-gray-900">
              {t('saki_profile', 'Saki 的人设档案')}
            </h3>
            <p className="text-[11px] text-gray-400">
              {t('saki_profile_desc', '在此调整 Saki 的头像与交谈风格设定')}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-5 space-y-6 pr-1 custom-scrollbar">
          
          {/* Avatar Section */}
          <div className="flex flex-col items-center justify-center space-y-3 pb-2">
            <div className="relative group w-20 h-20 rounded-full overflow-hidden border-2 border-gray-50 shadow-sm cursor-pointer bg-slate-50">
              <img 
                src={config?.aiAvatar || botAvatar} 
                alt="AI Avatar" 
                className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-300"
              />
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white gap-1 transition-opacity duration-200"
              >
                <Camera size={16} className="text-white/90" />
                <span className="text-[9px] font-medium tracking-wider text-white/95">更换头像</span>
              </div>
              {isUploading && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-[10px] font-medium">
                  {t('uploading', '上传中...')}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <input 
                type="file"
                ref={fileInputRef}
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />
              {config?.aiAvatar && (
                <button
                  type="button"
                  onClick={handleRestoreDefaultAvatar}
                  className="flex items-center gap-1 text-[11px] font-medium text-red-500 hover:text-red-600 hover:underline transition-colors"
                >
                  <RotateCcw size={10} />
                  {t('restore_default_avatar', '恢复默认头像')}
                </button>
              )}
            </div>
          </div>

          {/* System Prompt Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                {t('speaking_style', '性格与对话设定')}
              </label>
              <button
                type="button"
                onClick={() => setPromptText(defaultSakiPrompt)}
                className="text-[10px] font-medium text-slate-500 hover:text-blue-500 hover:underline transition-colors"
              >
                {t('restore_default_prompt', '恢复默认人格')}
              </button>
            </div>
            <textarea
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder={defaultSakiPrompt}
              rows={8}
              className="w-full text-xs bg-gray-50/50 border border-gray-200/80 rounded-xl p-4 text-gray-600 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400 focus:bg-white transition-all resize-y custom-scrollbar leading-relaxed"
            />
            <p className="text-[10px] text-gray-400 leading-normal">
              调整上述设定可以重塑 Saki 的回复语气、口头禅以及回答规范。
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-gray-100/80">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
          >
            {t('cancel', '取消')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4.5 py-2 rounded-xl text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 active:scale-95 transition-all shadow-sm"
          >
            {t('save_settings', '保存档案')}
          </button>
        </div>
      </div>
    </div>
  );
}
