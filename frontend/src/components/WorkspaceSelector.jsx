import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, ChevronRight, CornerLeftUp, Folder, FolderOpen, Loader2, X } from 'lucide-react';
import { readWorkspaceResponse } from '../utils/workspaceApi';

export default function WorkspaceSelector({ backendUrl, config, setConfig, disabled, getLocalText }) {
  const [open, setOpen] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [listing, setListing] = useState(null);
  const [pathInput, setPathInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const rootRef = useRef(null);
  const popupRef = useRef(null);
  const [position, setPosition] = useState({});
  const requestRef = useRef(0);
  const selectedPath = config.workspacePath || '';
  const label = selectedPath ? selectedPath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || selectedPath : getLocalText('默认工作区', 'Default workspace');

  useEffect(() => {
    const close = event => {
      if (event.type === 'keydown' ? event.key === 'Escape' : (!rootRef.current?.contains(event.target) && !popupRef.current?.contains(event.target))) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = rootRef.current.getBoundingClientRect();
      const width = Math.min(window.innerWidth - 24, 384);
      setPosition({ width, left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)), bottom: window.innerHeight - rect.top + 8, maxHeight: Math.max(180, rect.top - 20) });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [open]);

  const browse = async path => {
    const request = ++requestRef.current;
    setBusy(true);
    setError('');
    setListing(null);
    try {
      const response = await fetch(`${backendUrl}/api/workspace/directories?path=${encodeURIComponent(path || '')}`);
      const data = await readWorkspaceResponse(response, getLocalText);
      if (typeof data.currentPath !== 'string' || !Array.isArray(data.directories) || !Array.isArray(data.roots)) {
        throw new Error(getLocalText('工作区目录响应不完整，请重启后端后重试。', 'The folder response is incomplete. Restart the backend and try again.'));
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

  const select = async path => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${backendUrl}/api/workspace/select`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }),
      });
      const data = await readWorkspaceResponse(response, getLocalText);
      if (typeof data.path !== 'string' || typeof data.resolvedPath !== 'string') {
        throw new Error(getLocalText('工作区选择响应不完整，请重启后端后重试。', 'The selection response is incomplete. Restart the backend and try again.'));
      }
      setConfig(previous => ({ ...previous, workspacePath: data.path }));
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button type="button" disabled={disabled} onClick={() => { setOpen(!open); setBrowsing(false); setError(''); }}
        aria-label={getLocalText('选择工作区', 'Select workspace')} aria-expanded={open} aria-haspopup="dialog"
        title={selectedPath || getLocalText('默认工作区 · data/files', 'Default workspace · data/files')}
        className={`saki-chip-btn max-w-[12rem] ${open ? 'is-active' : ''}`}>
        <FolderOpen size={13} className="shrink-0 text-amber-500" />
        <span className="truncate">{label}</span>
        <ChevronDown size={11} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && createPortal(
        <div ref={popupRef} role="dialog" aria-label={getLocalText('选择工作区', 'Select workspace')} style={position}
          className="saki-workspace-popup fixed z-[115] overflow-y-auto rounded-2xl border border-[var(--surface-border-subtle)] bg-[var(--surface-bg)] text-sm text-[var(--text-dark)] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[var(--surface-border-subtle)] px-3.5 py-2">
            <span className="text-xs font-bold tracking-wide">{getLocalText('选择工作区', 'Select workspace')}</span>
            <button type="button" onClick={() => setOpen(false)} aria-label={getLocalText('关闭', 'Close')} className="rounded-md p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-bg-light)]"><X size={14} /></button>
          </div>
          {!browsing ? (
            <div className="space-y-1 p-2">
              <button type="button" disabled={busy} onClick={() => select('')} className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-saki-pink/10 disabled:opacity-50">
                <Folder size={19} className="text-[var(--accent-text)]" />
                <div className="min-w-0 flex-1"><div className="font-semibold">{getLocalText('默认工作区', 'Default workspace')}</div><div className="mt-0.5 text-xs text-[var(--text-tertiary)]">data/files</div></div>
                {!selectedPath && <Check size={16} className="text-[var(--accent-text)]" />}
              </button>
              <button type="button" disabled={busy} onClick={() => { setBrowsing(true); setPathInput(selectedPath); browse(selectedPath); }} className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-saki-pink/10">
                <FolderOpen size={19} className="text-amber-500" />
                <div className="min-w-0 flex-1"><div className="font-semibold">{getLocalText('本地文件夹', 'Local folder')}</div><div className="mt-0.5 truncate text-xs text-[var(--text-tertiary)]" title={selectedPath}>{selectedPath || getLocalText('选择电脑上的文件夹', 'Choose a folder on this computer')}</div></div>
                <ChevronRight size={16} />
              </button>
            </div>
          ) : (
            <div className="p-3">
              <p className="mb-2 text-xs text-[var(--text-tertiary)]">{getLocalText('选择运行 Saki 的电脑上的文件夹', 'Choose a folder on the computer running Saki')}</p>
              <form onSubmit={event => { event.preventDefault(); browse(pathInput); }} className="flex gap-2">
                <input autoFocus aria-label={getLocalText('文件夹路径', 'Folder path')} value={pathInput} onChange={event => setPathInput(event.target.value)} placeholder={getLocalText('输入文件夹完整路径', 'Enter an absolute folder path')} className="min-w-0 flex-1 rounded-lg border border-[var(--surface-border-subtle)] px-2 py-2 text-xs outline-none focus:border-saki-pink" />
                <button type="submit" disabled={busy} className="rounded-lg bg-[var(--surface-bg-light)] px-3 text-xs font-semibold disabled:opacity-50">{getLocalText('前往', 'Go')}</button>
              </form>
              <div className="mt-2 flex flex-wrap gap-1">
                {(listing?.roots || []).map(root => <button key={root} type="button" disabled={busy} onClick={() => browse(root)} className="rounded-md bg-[var(--surface-bg-light)] px-2 py-1 text-xs hover:bg-saki-pink/10">{root}</button>)}
              </div>
              <div className="mt-2 h-52 overflow-y-auto rounded-lg border border-[var(--surface-border-subtle)]">
                {busy ? <div role="status" className="flex h-full items-center justify-center gap-2 text-[var(--text-tertiary)]"><Loader2 size={16} className="animate-spin" />{getLocalText('加载中…', 'Loading…')}</div> : listing && <>
                  {listing.parentPath && <button type="button" onClick={() => browse(listing.parentPath)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--surface-bg-light)]"><CornerLeftUp size={15} />{getLocalText('上一级', 'Parent folder')}</button>}
                  {listing.directories.map(folder => <button key={folder.path} type="button" onClick={() => browse(folder.path)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-saki-pink/10"><Folder size={15} className="shrink-0 text-amber-500" /><span className="truncate">{folder.name}</span><ChevronRight size={13} className="ml-auto shrink-0 text-[var(--text-tertiary)]" /></button>)}
                  {!listing.directories.length && <p className="p-3 text-xs text-[var(--text-tertiary)]">{getLocalText('没有子文件夹，可直接选择当前文件夹', 'No subfolders. You can select this folder.')}</p>}
                </>}
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" disabled={busy} onClick={() => setBrowsing(false)} className="rounded-lg px-3 py-2 text-xs hover:bg-[var(--surface-bg-light)]">{getLocalText('返回', 'Back')}</button>
                <button type="button" disabled={busy || !listing} onClick={() => select(listing.currentPath)} className="rounded-lg bg-saki-pink px-3 py-2 text-xs font-semibold text-white hover:bg-saki-pink disabled:opacity-50">{getLocalText('选择此文件夹', 'Select this folder')}</button>
              </div>
            </div>
          )}
          {error && <p role="alert" className="px-4 pb-3 text-xs text-red-600">{error}</p>}
        </div>, document.body
      )}
    </div>
  );
}
