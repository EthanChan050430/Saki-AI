import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  CornerLeftUp,
  Cpu,
  Folder,
  FolderOpen,
  Image,
  Loader2,
  Plus,
  Shield,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { readWorkspaceResponse } from '../utils/workspaceApi';

export default function MobileControlHub({
  open,
  onOpenChange,
  config,
  setConfig,
  models,
  modelProviderLogos,
  modelProviderOrder,
  getChatProviderName,
  uiLanguage,
  backendUrl,
  isChatMode,
  isGenerating,
  permissionMode,
  permissionDefaultMode,
  permissionFullMode,
  onOpenSettings,
  getLocalText,
  t,
}) {
  const rootRef = useRef(null);
  const requestRef = useRef(0);
  const [view, setView] = useState('main'); // 'main' | 'modelDetails' | 'workspace'
  const [modelDetails, setModelDetails] = useState(null);
  const [providerFilter, setProviderFilter] = useState(config?.provider || 'ollama');

  // Workspace browser state
  const [listing, setListing] = useState(null);
  const [pathInput, setPathInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const normalizedCurrentModel =
    config?.provider === 'copilot' && config?.model?.includes('/')
      ? config.model.split('/').slice(1).join('/')
      : config?.model;
  const currentModelObj = models?.find(
    (item) => item.provider === config?.provider && item.name === normalizedCurrentModel,
  );
  const currentModelLabel = currentModelObj?.label || config?.model || getLocalText('选择模型', 'Select model');

  const selectedPath = config?.workspacePath || '';
  const workspaceLabel = selectedPath
    ? selectedPath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || selectedPath
    : getLocalText('默认工作区', 'Default');

  const isFullPermission = permissionMode === permissionFullMode;

  useEffect(() => {
    if (!open) return undefined;
    const handleOutside = (event) => {
      if (event.type === 'keydown') {
        if (event.key === 'Escape') onOpenChange(false);
        return;
      }
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        onOpenChange(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleOutside);
    };
  }, [open, onOpenChange]);

  const handleToggle = () => {
    const next = !open;
    if (next) {
      setView('main');
      setModelDetails(null);
      setProviderFilter(config?.provider || 'ollama');
      setError('');
    }
    onOpenChange(next);
  };

  const browseWorkspace = async (path) => {
    const request = ++requestRef.current;
    setBusy(true);
    setError('');
    setListing(null);
    try {
      const response = await fetch(
        `${backendUrl}/api/workspace/directories?path=${encodeURIComponent(path || '')}`,
      );
      const data = await readWorkspaceResponse(response, getLocalText);
      if (
        typeof data.currentPath !== 'string' ||
        !Array.isArray(data.directories) ||
        !Array.isArray(data.roots)
      ) {
        throw new Error(
          getLocalText(
            '工作区目录响应不完整，请重启后端后重试。',
            'The folder response is incomplete. Restart the backend and try again.',
          ),
        );
      }
      if (request !== requestRef.current) return;
      setListing(data);
      setPathInput(data.currentPath);
    } catch (err) {
      if (request === requestRef.current) setError(err.message);
    } finally {
      if (request === requestRef.current) setBusy(false);
    }
  };

  const selectWorkspace = async (path) => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${backendUrl}/api/workspace/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      const data = await readWorkspaceResponse(response, getLocalText);
      if (typeof data.path !== 'string' || typeof data.resolvedPath !== 'string') {
        throw new Error(
          getLocalText(
            '工作区选择响应不完整，请重启后端后重试。',
            'The selection response is incomplete. Restart the backend and try again.',
          ),
        );
      }
      setConfig((prev) => ({ ...prev, workspacePath: data.path }));
      setView('main');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const filteredModels = (models || [])
    .filter((item) => item.provider === providerFilter)
    .filter((item) => !(item.name === config?.drawingModel && item.provider === config?.drawingProvider));

  return (
    <div ref={rootRef} className="relative min-w-0 !shrink max-w-full md:hidden">
      <button
        type="button"
        onClick={handleToggle}
        className={`saki-chip-btn max-w-full min-w-0 !gap-1.5 !px-2.5 ${open ? 'is-active' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={getLocalText('模型、工作区与权限设置', 'Model, workspace and permission settings')}
      >
        <Cpu size={13} className="shrink-0 text-saki-pink" />
        <span className="min-w-0 truncate">{currentModelLabel}</span>
        {!isChatMode && (
          <>
            <span className="h-3 w-px shrink-0 bg-slate-400/35 dark:bg-white/15" aria-hidden="true" />
            <span
              className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400"
              title={selectedPath || getLocalText('默认工作区 · data/files', 'Default workspace · data/files')}
            >
              <FolderOpen size={12} className="shrink-0" />
              <span className="hidden min-[390px]:inline max-w-[4.25rem] truncate">{workspaceLabel}</span>
            </span>
            <span
              className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                isFullPermission
                  ? 'bg-rose-500/18 text-rose-600 dark:bg-rose-500/25 dark:text-rose-400'
                  : 'bg-slate-500/10 text-[var(--text-secondary)] dark:bg-white/10'
              }`}
              title={
                isFullPermission
                  ? getLocalText('全部允许', 'Allow all')
                  : getLocalText('按需确认', 'Ask when needed')
              }
            >
              <Shield size={10} className="shrink-0" />
            </span>
          </>
        )}
        <ChevronDown
          size={11}
          className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={getLocalText('会话控制', 'Session controls')}
          data-saki-popup="mobile-hub"
          className="saki-popup z-[125] flex flex-col overflow-hidden rounded-2xl border border-[var(--control-border)] bg-[var(--popup-bg)] text-[var(--text-dark)] shadow-2xl backdrop-blur-2xl"
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--control-border)] px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              {view !== 'main' ? (
                <button
                  type="button"
                  onClick={() => {
                    setView('main');
                    setModelDetails(null);
                    setError('');
                  }}
                  className="rounded-lg p-1 text-[var(--text-secondary)] hover:bg-[var(--surface-inset)]"
                  aria-label={getLocalText('返回', 'Back')}
                >
                  <ArrowLeft size={15} />
                </button>
              ) : (
                <SlidersHorizontal size={14} className="text-saki-pink" />
              )}
              <span className="text-xs font-bold tracking-wide">
                {view === 'workspace'
                  ? getLocalText('选择工作区文件夹', 'Choose workspace folder')
                  : view === 'modelDetails'
                    ? modelDetails?.label || modelDetails?.name
                    : getLocalText('会话控制', 'Session controls')}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-dark)]"
              aria-label={getLocalText('关闭', 'Close')}
            >
              <X size={15} />
            </button>
          </div>

          {view === 'main' && (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              {/* Workspace & Permission Quick Card (Agent Mode) */}
              {!isChatMode && (
                <div className="mx-2.5 mt-2.5 space-y-2 rounded-xl border border-[var(--control-border)] bg-[var(--surface-inset)]/65 p-2.5">
                  {/* Permission Segmented Toggle */}
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                      <span>{getLocalText('访问权限', 'Access permissions')}</span>
                      <span className={isFullPermission ? 'text-rose-500' : ''}>
                        {isFullPermission
                          ? getLocalText('完全访问', 'Unrestricted')
                          : getLocalText('安全确认', 'Safe prompt')}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 rounded-xl border border-[var(--control-border)] bg-[var(--popup-bg)]/75 p-0.5">
                      <button
                        type="button"
                        disabled={isGenerating}
                        onClick={() =>
                          setConfig((prev) => ({
                            ...prev,
                            agentPermissionMode: permissionDefaultMode,
                          }))
                        }
                        className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition-all disabled:opacity-50 ${
                          !isFullPermission
                            ? 'bg-[var(--surface-inset)] font-bold text-[var(--text-dark)] shadow-sm'
                            : 'font-medium text-[var(--text-secondary)]'
                        }`}
                      >
                        <Shield size={12} className={!isFullPermission ? 'text-saki-pink' : ''} />
                        <span>{getLocalText('按需确认', 'Ask when needed')}</span>
                      </button>
                      <button
                        type="button"
                        disabled={isGenerating}
                        onClick={() =>
                          setConfig((prev) => ({
                            ...prev,
                            agentPermissionMode: permissionFullMode,
                          }))
                        }
                        className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition-all disabled:opacity-50 ${
                          isFullPermission
                            ? 'bg-rose-500/15 font-bold text-rose-600 shadow-sm dark:bg-rose-500/20 dark:text-rose-400'
                            : 'font-medium text-[var(--text-secondary)]'
                        }`}
                      >
                        <Shield size={12} className={isFullPermission ? 'text-rose-500' : ''} />
                        <span>{getLocalText('全部允许', 'Allow all')}</span>
                      </button>
                    </div>
                  </div>

                  {/* Workspace Compact Row */}
                  <div className="flex items-center gap-2 border-t border-[var(--control-border)] pt-2">
                    <FolderOpen size={15} className="shrink-0 text-amber-500" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                        {getLocalText('工作区', 'Workspace')}
                      </div>
                      <div
                        className="truncate text-xs font-semibold text-[var(--text-dark)]"
                        title={selectedPath || 'data/files'}
                      >
                        {selectedPath ? workspaceLabel : getLocalText('默认工作区 (data/files)', 'Default (data/files)')}
                      </div>
                    </div>
                    {selectedPath && (
                      <button
                        type="button"
                        disabled={isGenerating || busy}
                        onClick={() => selectWorkspace('')}
                        className="shrink-0 rounded-lg border border-[var(--control-border)] bg-[var(--popup-bg)] px-2 py-1 text-[11px] font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-dark)] disabled:opacity-50"
                      >
                        {getLocalText('默认', 'Default')}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isGenerating || busy}
                      onClick={() => {
                        setView('workspace');
                        setPathInput(selectedPath);
                        browseWorkspace(selectedPath);
                      }}
                      className="inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-[#ff75ac]/12 px-2.5 py-1 text-[11px] font-bold text-[#e0327a] transition-colors hover:bg-[#ff75ac]/20 disabled:opacity-50 dark:text-[#ff9bc8]"
                    >
                      <span>{getLocalText('切换', 'Browse')}</span>
                      <ChevronRight size={12} />
                    </button>
                  </div>
                </div>
              )}

              {/* Model Selector */}
              <div className="flex min-h-0 flex-1 flex-col pt-2">
                <div className="px-3.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  {getLocalText('模型', 'Model')}
                </div>
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar border-b border-[var(--control-border)] px-2.5 py-1.5">
                  {modelProviderOrder.map((provider) => {
                    const providerModels = (models || []).filter((item) => item.provider === provider);
                    if (!providerModels.length) return null;
                    const providerLabel = getChatProviderName(provider, uiLanguage);
                    const logoUrl = modelProviderLogos[provider];
                    return (
                      <button
                        key={provider}
                        type="button"
                        onClick={() => setProviderFilter(provider)}
                        className={`flex shrink-0 items-center rounded-lg p-1 transition-colors ${
                          providerFilter === provider
                            ? 'bg-[var(--surface-inset)] text-[var(--text-dark)]'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--surface-inset)]'
                        }`}
                        title={providerLabel}
                      >
                        <span
                          className={`flex h-7 w-7 items-center justify-center rounded-md ${
                            providerFilter === provider
                              ? 'bg-[var(--popup-bg)] shadow-sm'
                              : 'bg-[var(--surface-inset)]'
                          }`}
                        >
                          <img src={logoUrl} alt={providerLabel} className="h-4 w-4 object-contain" />
                        </span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      onOpenChange(false);
                      onOpenSettings?.();
                    }}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-dashed border-[var(--control-border)] text-[var(--text-secondary)] transition-colors hover:border-[#ff75ac] hover:bg-[#ff75ac]/10 hover:text-[#ff75ac]"
                    title={getLocalText('添加或配置模型', 'Add or configure models')}
                    aria-label={getLocalText('添加或配置模型', 'Add or configure models')}
                  >
                    <Plus size={15} />
                  </button>
                </div>

                <div className="max-h-[30dvh] overflow-y-auto p-2">
                  {filteredModels.map((model) => {
                    const active =
                      config?.provider === model.provider && normalizedCurrentModel === model.name;
                    return (
                      <div
                        key={`${model.provider}-${model.name}`}
                        className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors ${
                          active ? 'bg-[#ff75ac]/15' : 'hover:bg-[#ff75ac]/10'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setConfig((prev) => ({
                              ...prev,
                              provider: model.provider,
                              model: model.name,
                            }))
                          }
                          className={`flex min-w-0 flex-1 items-center gap-2 text-left text-sm ${
                            active
                              ? 'font-bold text-[#ff75ac] dark:text-[#ff9bc8]'
                              : 'text-[var(--text-dark)]'
                          }`}
                        >
                          <span className="truncate">{model.label || model.name}</span>
                          {model.supportsVision ? (
                            <Image size={12} className="shrink-0 text-sky-500" />
                          ) : null}
                          {active ? (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff75ac]" />
                          ) : null}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setModelDetails(model);
                            setView('modelDetails');
                          }}
                          className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-dark)]"
                        >
                          {config?.thinkingLevel === 'low'
                            ? getLocalText('低', 'Low')
                            : config?.thinkingLevel === 'high'
                              ? getLocalText('高', 'High')
                              : getLocalText('中等', 'Medium')}
                          <ChevronRight size={12} />
                        </button>
                      </div>
                    );
                  })}
                  {!filteredModels.length && (
                    <div className="px-2 py-3 text-xs text-[var(--text-tertiary)]">
                      {t('no_models_detected')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {view === 'modelDetails' && modelDetails && (
            <div className="p-3.5">
              <div className="mb-3 text-[11px] text-[var(--text-tertiary)]">
                {getChatProviderName(modelDetails.provider, uiLanguage)}
              </div>
              <div className="mb-2 text-sm font-bold text-[var(--text-dark)]">
                {getLocalText('思考层级', 'Thinking level')}
              </div>
              <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-[var(--control-border)]">
                {[
                  ['low', getLocalText('低', 'Low')],
                  ['medium', getLocalText('中等', 'Medium')],
                  ['high', getLocalText('高', 'High')],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setConfig((prev) => ({ ...prev, thinkingLevel: value }))}
                    className={`px-3 py-2 text-xs font-semibold transition-colors ${
                      config?.thinkingLevel === value
                        ? 'bg-[var(--surface-inset)] text-[var(--text-dark)]'
                        : 'bg-[var(--popup-bg)] text-[var(--text-secondary)] hover:bg-[var(--surface-inset)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {modelDetails.contextWindow ? (
                <div className="mt-4 flex items-center justify-between text-sm">
                  <span className="font-semibold text-[var(--text-dark)]">
                    {getLocalText('最大上下文', 'Max context', '最大コンテキスト')}
                  </span>
                  <span className="text-[var(--text-secondary)]">{modelDetails.contextWindow}</span>
                </div>
              ) : null}
            </div>
          )}

          {view === 'workspace' && (
            <div className="p-3">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  browseWorkspace(pathInput);
                }}
                className="flex gap-2"
              >
                <input
                  aria-label={getLocalText('文件夹路径', 'Folder path')}
                  value={pathInput}
                  onChange={(event) => setPathInput(event.target.value)}
                  placeholder={getLocalText('输入文件夹完整路径', 'Enter an absolute folder path')}
                  className="min-w-0 flex-1 rounded-lg border border-[var(--control-border)] bg-transparent px-2.5 py-2 text-xs outline-none focus:border-saki-pink"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-lg bg-[var(--surface-inset)] px-3 text-xs font-semibold disabled:opacity-50"
                >
                  {getLocalText('前往', 'Go')}
                </button>
              </form>
              <div className="mt-2 flex flex-wrap gap-1">
                {(listing?.roots || []).map((root) => (
                  <button
                    key={root}
                    type="button"
                    disabled={busy}
                    onClick={() => browseWorkspace(root)}
                    className="rounded-md bg-[var(--surface-inset)] px-2 py-1 text-xs hover:bg-saki-pink/10"
                  >
                    {root}
                  </button>
                ))}
              </div>
              <div className="mt-2 h-44 overflow-y-auto rounded-lg border border-[var(--control-border)]">
                {busy ? (
                  <div
                    role="status"
                    className="flex h-full items-center justify-center gap-2 text-[var(--text-tertiary)]"
                  >
                    <Loader2 size={16} className="animate-spin" />
                    {getLocalText('加载中…', 'Loading…')}
                  </div>
                ) : (
                  listing && (
                    <>
                      {listing.parentPath && (
                        <button
                          type="button"
                          onClick={() => browseWorkspace(listing.parentPath)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--surface-inset)]"
                        >
                          <CornerLeftUp size={15} />
                          {getLocalText('上一级', 'Parent folder')}
                        </button>
                      )}
                      {listing.directories.map((folder) => (
                        <button
                          key={folder.path}
                          type="button"
                          onClick={() => browseWorkspace(folder.path)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-saki-pink/10"
                        >
                          <Folder size={15} className="shrink-0 text-amber-500" />
                          <span className="truncate">{folder.name}</span>
                          <ChevronRight size={13} className="ml-auto shrink-0 text-[var(--text-tertiary)]" />
                        </button>
                      ))}
                      {!listing.directories.length && (
                        <p className="p-3 text-xs text-[var(--text-tertiary)]">
                          {getLocalText('没有子文件夹，可直接选择当前文件夹', 'No subfolders. You can select this folder.')}
                        </p>
                      )}
                    </>
                  )
                )}
              </div>
              {error && (
                <p role="alert" className="mt-2 text-xs text-red-600">
                  {error}
                </p>
              )}
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => selectWorkspace('')}
                  className="rounded-lg px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-inset)]"
                >
                  {getLocalText('默认工作区', 'Default')}
                </button>
                <button
                  type="button"
                  disabled={busy || !listing}
                  onClick={() => selectWorkspace(listing.currentPath)}
                  className="rounded-lg bg-saki-pink px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {getLocalText('选择此文件夹', 'Select this folder')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
