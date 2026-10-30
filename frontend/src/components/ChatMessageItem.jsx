import React, { memo } from 'react';
import { Paperclip, FileText, Download } from 'lucide-react';
import AgentMessageParts from './AgentActivity';
import CheckpointRestoreBar from './CheckpointRestoreBar';
const DeepReadingView = React.lazy(() => import('./DeepReadingView'));
const PPTView = React.lazy(() => import('./PPTView'));
const CredibilityCheckView = React.lazy(() => import('./CredibilityCheckView'));
const StoryGlassView = React.lazy(() => import('./StoryGlassView'));

export const ChatMessageItem = memo(function ChatMessageItem({
  message: m,
  index: idx,
  isGenerating,
  isLastMessage,
  checkpointOwner,
  config,
  botAvatar,
  editingMsgIdx,
  editingMsgText,
  setEditingMsgIdx,
  setEditingMsgText,
  onUpdateMessageText,
  onEditMessage,
  onDeleteMessage,
  onRestoreCheckpoint,
  restoringCheckpointId,
  hoveredCheckpointId,
  setHoveredCheckpointId,
  copiedIdx,
  readingIdx,
  copyToClipboard,
  speakText,
  handleRedoAction,
  setDiagnosticsMsg,
  openStoryGlassArchive,
  currentPendingRequest,
  onOpenSettings,
  setIsAiCustomizationOpen,
  setDiffModalFile,
  setIsDiffModalOpen,
  handleRollback,
  onSkipAction,
  handleStoryGlassRemix,
  handleGeneratedFileDownload,
  STORY_GLASS_REMIX_ACTIONS,
  getLocalText,
  t,
  estimateMessageTokens,
  MessageBubbleToolbar,
  StoryGlassArchiveCard,
  AssistantPendingCard,
  MessageContent,
  ToolObservation,
  MusicFileCard,
}) {
  const isAssistant = m.role === 'assistant';
  const isStoryGlassOverlayMessage = Boolean(m.requestOptions?.storyGlassOverlay);
  const isStoryGlassOverlayAssistant = Boolean(
    isAssistant && (isStoryGlassOverlayMessage || (m.placeholderMode === 'story-glass' || m.storyGlassData))
  );

  if (isStoryGlassOverlayAssistant && StoryGlassArchiveCard) {
    return (
      <div key={m.id || idx} id={`chat-msg-${m.id || idx}`} className="flex gap-4">
        <button
          type="button"
          onClick={() => setIsAiCustomizationOpen(true)}
          className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-white/60 dark:border-white/10 cursor-pointer hover:opacity-80 transition-all hover:scale-105 active:scale-95 shadow-sm flex items-center justify-center bg-white/70 dark:bg-white/10"
          title={t('edit_ai_settings', '编辑 AI 设定')}
          aria-label={t('edit_ai_settings', '编辑 AI 设定')}
        >
          <img src={config.aiAvatar || botAvatar} alt="Bot" className="w-full h-full object-cover" />
        </button>
        <StoryGlassArchiveCard
          message={m}
          getLocalText={getLocalText}
          onOpen={() => openStoryGlassArchive(m.id)}
        />
      </div>
    );
  }

  const visibleGeneratedFiles = Array.isArray(m.generatedFiles)
    ? m.generatedFiles.filter((file) => !(file?.kind === 'story-glass-illustration' && m.storyGlassData?.coverImageUrl))
    : [];
  const hasAssistantText = Array.isArray(m.parts) && m.parts.some(
    part => (part.type === 'text' || part.type === 'reasoning') && part.content.replace(/\[expression[:=].*?\.png\]/g, '').trim()
  );
  const hasAssistantContent = hasAssistantText
    || (Array.isArray(m.parts) && m.parts.some(part => part.type === 'action'))
    || Boolean(m.deepReadingData)
    || Boolean(m.pptData)
    || Boolean(m.credibilityCheckData)
    || Boolean(m.storyGlassData)
    || visibleGeneratedFiles.length > 0;
  const isPendingRequestMessage = currentPendingRequest?.assistantMsgId
    && String(currentPendingRequest.assistantMsgId) === String(m.id);
  const showPendingState = isAssistant
    && !hasAssistantContent
    && (isPendingRequestMessage || (isGenerating && isLastMessage))
    && m.status !== 'interrupted'
    && m.status !== 'error'
    && m.status !== 'done';
  const hideToolbar = isAssistant && isGenerating && isLastMessage && showPendingState;

  return (
    <div
      key={m.id || idx}
      id={`chat-msg-${m.id || idx}`}
      data-message-id={m.id || idx}
      className="saki-chat-message"
      onMouseEnter={() => setHoveredCheckpointId(checkpointOwner?.checkpoint?.id || null)}
      onMouseLeave={() => setHoveredCheckpointId(null)}
    >
      {m.role === 'user' && m.checkpoint?.id && onRestoreCheckpoint && (
        <CheckpointRestoreBar
          message={m}
          visible={hoveredCheckpointId === m.checkpoint.id}
          disabled={isGenerating || Boolean(restoringCheckpointId)}
          restoring={restoringCheckpointId === m.checkpoint.id}
          onRestore={onRestoreCheckpoint}
        />
      )}
      <div className={`flex gap-4 ${m.role === 'user' ? 'justify-end' : ''}`}>
        {isAssistant && (
          <button
            type="button"
            onClick={() => setIsAiCustomizationOpen(true)}
            className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-white/60 dark:border-white/10 cursor-pointer hover:opacity-80 transition-all hover:scale-105 active:scale-95 shadow-sm flex items-center justify-center bg-white/70 dark:bg-white/10"
            title={t('edit_ai_settings', '编辑 AI 设定')}
            aria-label={t('edit_ai_settings', '编辑 AI 设定')}
          >
            <img src={config.aiAvatar || botAvatar} alt="Bot" className="w-full h-full object-cover" />
          </button>
        )}
        <div className={`relative ${editingMsgIdx === idx ? 'w-[550px] max-w-full' : 'max-w-[85%]'} group/message ${m.role === 'user' ? 'order-1' : ''}`}>
          {!(hideToolbar || editingMsgIdx === idx) && MessageBubbleToolbar && (
            <MessageBubbleToolbar
              align={m.role === 'user' ? 'end' : 'start'}
              isAssistant={isAssistant}
              message={m}
              canRedo={isAssistant}
              canEdit={true}
              copied={copiedIdx === idx}
              speaking={readingIdx === idx}
              onCopy={() => copyToClipboard(idx, m)}
              onSpeak={() => speakText(idx, m)}
              onRedo={() => handleRedoAction(idx)}
              onEdit={() => {
                if (m.role === 'user') {
                  onEditMessage?.(idx);
                } else {
                  setEditingMsgIdx(idx);
                  const getMessageEditText = (msg) => {
                    if (msg.content) return msg.content;
                    if (Array.isArray(msg.parts)) {
                      return msg.parts
                        .filter(p => p.type === 'text')
                        .map(p => p.content)
                        .join('\n');
                    }
                    return '';
                  };
                  setEditingMsgText(getMessageEditText(m));
                }
              }}
              onDelete={() => onDeleteMessage?.(idx)}
              onOpenDiagnostics={() => setDiagnosticsMsg(m)}
              labels={{
                copy: copiedIdx === idx ? t('copied') : t('copy'),
                read: readingIdx === idx ? t('listening') : t('listen'),
                redo: t('redo'),
                edit: getLocalText('编辑', 'Edit'),
                delete: t('delete'),
                diagnostics: getLocalText('查看诊断详情', 'View Diagnostics')
              }}
            />
          )}

          <div className={`rounded-2xl p-4 transition-all ${editingMsgIdx === idx ? 'shadow-xl w-full' : 'hover:translate-y-[-1px] hover:shadow-lg'} ${
            m.role === 'user'
              ? 'bg-gradient-to-br from-[#ff75ac] to-[#ff5b9a] text-white shadow-[0_8px_24px_rgba(255,117,172,0.3)] rounded-tr-none rounded-2xl p-4'
              : showPendingState
                ? ''
                : 'bg-white/85 dark:bg-[#181922]/85 border border-white/65 dark:border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.04)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.35)] backdrop-blur-xl rounded-tl-none rounded-2xl p-4 text-gray-800 dark:text-[#f5f5f7]'
          }`}>
            {editingMsgIdx === idx ? (
              <div className="flex flex-col gap-4 pointer-events-auto w-full animate-in fade-in duration-200">
                <div className="relative rounded-2xl border border-slate-200/80 bg-slate-50/50 p-1 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] backdrop-blur-sm focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                  <textarea
                    value={editingMsgText}
                    onChange={(e) => setEditingMsgText(e.target.value)}
                    className="w-full min-h-[160px] resize-y rounded-xl bg-transparent px-4 py-3 pb-8 text-sm font-normal leading-relaxed text-slate-700 placeholder-slate-400 focus:outline-none"
                    placeholder={getLocalText("编辑消息内容...", "Edit message content...")}
                    autoFocus
                  />
                  <div className="absolute bottom-2.5 right-4 text-[9px] font-semibold text-slate-400 font-mono pointer-events-none select-none">
                    {estimateMessageTokens({ content: editingMsgText })} tokens
                  </div>
                </div>
                <div className="flex justify-end items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setEditingMsgIdx(null)}
                    className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 active:scale-98 transition-all shadow-sm"
                  >
                    {getLocalText("取消", "Cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateMessageText?.(idx, editingMsgText);
                      setEditingMsgIdx(null);
                    }}
                    className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:from-blue-600 hover:to-indigo-700 active:scale-98 transition-all shadow-md shadow-blue-500/10"
                  >
                    {getLocalText("保存修改", "Save Changes")}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {isAssistant && (
                  <div className="flex flex-col">
                    {showPendingState && AssistantPendingCard ? (
                      <AssistantPendingCard
                        mode={m.placeholderMode}
                        status={m.status}
                        isGenerating={isGenerating && isLastMessage}
                        getLocalText={getLocalText}
                      />
                    ) : isAssistant && !hasAssistantContent && m.status === 'interrupted' ? (
                      <div className="py-3 text-sm text-[var(--text-secondary)]">
                        {getLocalText('这次生成已结束。', 'This generation was stopped.')}
                      </div>
                    ) : isAssistant && !hasAssistantContent && m.status === 'error' ? (
                      <div className="py-3 text-sm text-rose-500">
                        {getLocalText('这次生成失败了。', 'This generation failed.')}
                      </div>
                    ) : (
                      <>
                        <AgentMessageParts
                          parts={m.parts || []}
                          streamingActions={m.streamingActions || []}
                          isGenerating={isGenerating && isLastMessage}
                          status={m.status}
                          durationMs={m.generationDurationMs}
                          renderText={(part) => (
                            <MessageContent
                              content={part.content}
                              isGenerating={isGenerating && isLastMessage}
                              onOpenSettings={onOpenSettings}
                            />
                          )}
                          renderOutput={(part) => <ToolObservation action={part.data} observation={part.observation} />}
                          onViewChanges={(data) => {
                            setDiffModalFile(data);
                            setIsDiffModalOpen(true);
                          }}
                          onRollback={handleRollback}
                          onSkipAction={onSkipAction}
                        />
                        {m.deepReadingData && (
                          <React.Suspense fallback={null}>
                            <div className="mt-4 w-full">
                              <DeepReadingView data={m.deepReadingData} isEmbedded={true} />
                            </div>
                          </React.Suspense>
                        )}
                        {m.pptData && (
                          <React.Suspense fallback={null}>
                            <div className="mt-4 w-full">
                              <PPTView data={m.pptData} isEmbedded={true} />
                            </div>
                          </React.Suspense>
                        )}
                        {m.credibilityCheckData && (
                          <React.Suspense fallback={null}>
                            <div className="mt-4 w-full">
                              <CredibilityCheckView data={m.credibilityCheckData} isEmbedded={true} />
                            </div>
                          </React.Suspense>
                        )}
                        {m.storyGlassData && (
                          <React.Suspense fallback={null}>
                            <div className="mt-4 w-full">
                              <StoryGlassView
                                data={m.storyGlassData}
                                isEmbedded={true}
                                onRemix={(action) => handleStoryGlassRemix(m.storyGlassData, action)}
                                remixActions={STORY_GLASS_REMIX_ACTIONS}
                              />
                            </div>
                          </React.Suspense>
                        )}
                        {visibleGeneratedFiles.length > 0 && (
                          <div className="mt-4 flex flex-col gap-2">
                            {visibleGeneratedFiles.map((file, fileIdx) => (
                              file.kind === 'music-composition' && MusicFileCard ? (
                                <MusicFileCard
                                  key={`${file.filePath || file.name || 'generated'}-${fileIdx}`}
                                  file={file}
                                  onDownload={handleGeneratedFileDownload}
                                />
                              ) : (
                                <button
                                  type="button"
                                  key={`${file.filePath || file.name || 'generated'}-${fileIdx}`}
                                  onClick={() => handleGeneratedFileDownload(file)}
                                  className="w-full flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50/80 px-3 py-3 text-left transition-all hover:bg-blue-100/80 hover:border-blue-200"
                                  title={file.filePath || file.relativePath || file.name}
                                >
                                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm shrink-0">
                                    <FileText size={18} />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-semibold text-gray-800">
                                      {file.name || file.relativePath || file.filePath}
                                    </div>
                                    <div className="truncate text-[11px] text-gray-500">
                                      {file.relativePath || file.filePath}
                                    </div>
                                  </div>
                                  <div className="shrink-0 flex items-center gap-2 text-blue-600">
                                    {file.sizeLabel && (
                                      <span className="text-[11px] font-semibold text-blue-500">{file.sizeLabel}</span>
                                    )}
                                    <Download size={16} />
                                  </div>
                                </button>
                              )
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
                {m.role === 'user' && <div className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</div>}
              </>
            )}
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
        </div>
        {m.role === 'user' && (
          <div className="w-8 h-8 rounded-full overflow-hidden border border-white/20 shrink-0 order-2">
            <img src={config.userAvatar || '/assets/head_user.png'} alt="User" className="w-full h-full object-cover" />
          </div>
        )}
      </div>
    </div>
  );
});

export default ChatMessageItem;
