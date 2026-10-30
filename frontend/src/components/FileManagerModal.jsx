import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, FileText, Trash2, Download, Eye, Edit2, Save, File as FileIcon, Search, ArrowLeft, CheckCircle2, Folder, ChevronRight, CornerLeftUp } from 'lucide-react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { BACKEND_URL } from '../utils/backendUrl';
import { modalBackdropMotion, modalPanelMotion } from '../utils/modalMotion';

export default function FileManagerModal({ isOpen, onClose, onSelect, windowed = false, workspacePath = '' }) {
  const { t } = useTranslation();
  const workspaceApi = useMemo(() => axios.create({ headers: { 'X-Workspace-Path': encodeURIComponent(workspacePath) } }), [workspacePath]);
  const [files, setFiles] = useState([]);
  const [currentPath, setCurrentPath] = useState('');
  const [trashItems, setTrashItems] = useState([]);
  const [view, setView] = useState('files'); // 'files' or 'trash'
  const [loading, setLoading] = useState(false);
  const [editingFile, setEditingFile] = useState(null); // { name, content }
  const [previewingFile, setPreviewingFile] = useState(null); // { name, content, isImage }
  const [searchQuery, setSearchQuery] = useState('');

  const fetchFiles = async (dirPath = currentPath) => {
    setLoading(true);
    try {
      const res = await workspaceApi.get(`${BACKEND_URL}/api/files`, {
        params: { path: dirPath }
      });
      setFiles(res.data.files);
      setCurrentPath(res.data.currentPath);
    } catch (err) {
      console.error('Failed to fetch files:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTrash = async () => {
    setLoading(true);
    try {
      const res = await workspaceApi.get(`${BACKEND_URL}/api/trash`);
      setTrashItems(res.data);
    } catch (err) {
      console.error('Failed to fetch trash:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (view === 'files') fetchFiles('');
      else fetchTrash();
    }
  }, [isOpen, view, workspacePath]);

  useEffect(() => {
    setCurrentPath('');
    setEditingFile(null);
    setPreviewingFile(null);
  }, [workspacePath]);

  const handleDelete = async (file) => {
    if (!confirm(t('delete_move_trash_confirm', { name: file.name }))) return;
    try {
      await workspaceApi.delete(`${BACKEND_URL}/api/files/${encodeURIComponent(file.path)}`);
      fetchFiles();
    } catch (err) {
      alert(t('delete_fail'));
    }
  };

  const handlePermanentDelete = async (trashId) => {
    if (!confirm(t('permanent_delete_confirm'))) return;
    try {
      await workspaceApi.delete(`${BACKEND_URL}/api/trash/${trashId}`);
      fetchTrash();
    } catch (err) {
      alert(t('delete_fail'));
    }
  };

  const handleRestore = async (trashId) => {
    try {
      await workspaceApi.post(`${BACKEND_URL}/api/trash/restore`, { trashId });
      fetchTrash();
    } catch (err) {
      if (err.response?.status === 404) {
        alert(t('trash_file_cleared'));
      } else {
        alert(t('restore_fail'));
      }
    }
  };

  const handleDownload = (file) => {
    window.open(`${BACKEND_URL}/api/files/download?path=${encodeURIComponent(file.path)}&workspacePath=${encodeURIComponent(workspacePath)}`);
  };

  const handlePreview = async (file) => {
    try {
      const res = await workspaceApi.get(`${BACKEND_URL}/api/files/preview/${encodeURIComponent(file.path)}`);
      setPreviewingFile({ name: file.name, ...res.data });
    } catch (err) {
      alert(t('preview_fail'));
    }
  };

  const handleEdit = async (file) => {
    try {
      const res = await workspaceApi.get(`${BACKEND_URL}/api/files/preview/${encodeURIComponent(file.path)}`);
      setEditingFile({ name: file.name, path: file.path, content: res.data.content });
    } catch (err) {
      alert(t('read_fail'));
    }
  };

  const handleSave = async () => {
    try {
      await workspaceApi.post(`${BACKEND_URL}/api/files/save`, {
        name: editingFile.name,
        path: editingFile.path,
        content: editingFile.content
      });
      setEditingFile(null);
      fetchFiles();
    } catch (err) {
      alert(t('save_fail'));
    }
  };

  const handleGoUp = () => {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    fetchFiles(parts.join('/'));
  };

  const handleOpenFolder = (folderPath) => {
    fetchFiles(folderPath);
  };

  if (!isOpen) return null;

  const filteredFiles = files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <motion.div
      className={windowed ? 'h-full w-full' : 'fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4'}
      {...(!windowed ? modalBackdropMotion : {})}
      onClick={!windowed ? onClose : undefined}
    >
      <motion.div data-saki-dialog="true"
        className={windowed ? 'bg-[var(--surface-bg)]  w-full h-full rounded-[28px] shadow-none relative flex flex-col overflow-hidden text-[var(--text-dark)] ' : 'bg-[var(--surface-bg)]  w-full max-w-4xl h-[80vh] rounded-2xl shadow-2xl relative flex flex-col overflow-hidden text-[var(--text-dark)] '}
        {...(!windowed ? modalPanelMotion : {})}
        onClick={!windowed ? (event) => event.stopPropagation() : undefined}
      >
        {/* Header */}
        <div className="px-4 py-2.5 border-b flex items-center justify-between bg-[var(--surface-bg-light)] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-saki-pink flex items-center justify-center text-white shadow-sm shrink-0">
              <FileIcon size={16} />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-[var(--text-dark)] text-sm sm:text-base leading-tight truncate">{t('file_manager_title')}</h3>
              <p className="text-[11px] text-[var(--text-tertiary)] leading-tight truncate">{t('file_manager_desc')}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-[var(--surface-inset)] rounded-lg transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {editingFile ? (
            <div className="flex-1 flex flex-col p-4 animate-in fade-in duration-300">
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => setEditingFile(null)} className="flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--accent-text)]">
                  <ArrowLeft size={16} /> {t('return_list')}
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{editingFile.name}</span>
                  <button onClick={handleSave} className="flex items-center gap-2 bg-saki-pink text-white px-4 py-1.5 rounded-lg text-sm hover:bg-saki-pink transition-colors shadow-sm">
                    <Save size={16} /> {t('save')}
                  </button>
                </div>
              </div>
              <textarea
                className="flex-1 w-full bg-[var(--code-bg)] text-green-400 p-4 rounded-xl font-mono text-sm outline-none resize-none border-none shadow-inner"
                value={editingFile.content}
                onChange={(e) => setEditingFile({ ...editingFile, content: e.target.value })}
                spellCheck={false}
              />
            </div>
          ) : previewingFile ? (
            <div className="flex-1 flex flex-col p-4 animate-in fade-in duration-300 overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => setPreviewingFile(null)} className="flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--accent-text)]">
                  <ArrowLeft size={16} /> {t('return_list')}
                </button>
                <span className="text-sm font-medium">{previewingFile.name}</span>
              </div>
              <div className="flex-1 bg-[var(--surface-bg-light)] rounded-xl overflow-auto border shadow-inner">
                {previewingFile.isImage ? (
                  <div className="h-full flex items-center justify-center p-4">
                    <img src={previewingFile.content} alt={previewingFile.name} className="max-w-full max-h-full object-contain rounded-lg" />
                  </div>
                ) : (
                  <pre className="p-4 font-mono text-sm text-[var(--text-dark)] whitespace-pre-wrap">
                    {previewingFile.content}
                  </pre>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="px-4 py-2.5 bg-[var(--surface-bg)] sticky top-0 z-10 flex items-center gap-3 border-b shrink-0">
                <div className="flex bg-[var(--surface-bg-light)] p-0.5 rounded-xl">
                  <button
                    onClick={() => setView('files')}
                    className={`px-3 py-1 rounded-lg text-xs sm:text-sm transition-all ${view === 'files' ? 'bg-[var(--surface-bg)] shadow-sm text-[#ff75ac] font-medium' : 'text-[var(--text-secondary)] hover:text-[var(--text-dark)]'}`}
                  >
                    {t('files')}
                  </button>
                  <button
                    onClick={() => setView('trash')}
                    className={`px-3 py-1 rounded-lg text-xs sm:text-sm transition-all ${view === 'trash' ? 'bg-[var(--surface-bg)] shadow-sm text-red-600 font-medium' : 'text-[var(--text-secondary)] hover:text-[var(--text-dark)]'}`}
                  >
                    {t('trash')}
                  </button>
                </div>

                {view === 'files' && currentPath && (
                  <button 
                    onClick={handleGoUp}
                    className="flex items-center gap-1 px-2.5 py-1 bg-[var(--surface-bg-light)] hover:bg-[var(--surface-inset)] text-[var(--text-secondary)] rounded-lg text-xs sm:text-sm transition-colors"
                  >
                    <CornerLeftUp size={15} />
                    {t('go_up')}
                  </button>
                )}

                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={16} />
                  <input 
                    type="text" 
                    placeholder={view === 'files' ? (currentPath ? `/${currentPath}` : t('search_file_placeholder')) : t('search_trash_placeholder')}
                    className="w-full pl-9 pr-4 py-1.5 bg-[var(--surface-bg-light)] rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#ff75ac]/20 transition-all border border-transparent"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {loading ? (
                  <div className="flex items-center justify-center h-40">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-saki-pink"></div>
                  </div>
                ) : (view === 'files' ? filteredFiles : trashItems.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()))).length === 0 ? (
                  <div className="text-center py-20 text-[var(--text-tertiary)]">
                    {view === 'files' ? <FileIcon size={48} className="mx-auto mb-4 opacity-20" /> : <Trash2 size={48} className="mx-auto mb-4 opacity-20" />}
                    <p>{view === 'files' ? t('no_files_directory') : t('trash_empty')}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {view === 'files' ? (
                      filteredFiles.map(file => (
                        <div key={file.path} className="group p-4 bg-[var(--surface-bg)] border border-[var(--surface-border-subtle)] rounded-2xl hover:border-saki-pink/25 hover:shadow-md transition-all flex items-center gap-3">
                          <div 
                            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${file.isDirectory ? 'bg-amber-50 text-amber-500 group-hover:bg-amber-100' : 'bg-[var(--surface-bg-light)] text-[var(--text-tertiary)] group-hover:bg-[#ff75ac]/10 dark:hover:bg-[#ff75ac]/15 group-hover:text-[var(--accent-text)]'}`}
                            onClick={() => file.isDirectory && handleOpenFolder(file.path)}
                          >
                            {file.isDirectory ? <Folder size={20} /> : <FileText size={20} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p 
                              className={`text-sm font-medium text-[var(--text-dark)] truncate ${file.isDirectory ? 'cursor-pointer hover:text-amber-600' : ''}`}
                              onClick={() => file.isDirectory && handleOpenFolder(file.path)}
                            >
                              {file.name}
                            </p>
                            <p className="text-[10px] text-[var(--text-tertiary)]">{file.isDirectory ? t('folder') : file.size} • {file.time}</p>
                          </div>
                          <div className="flex items-center gap-1 opacity-100 group-hover:opacity-100 transition-opacity">
                            {onSelect && !file.isDirectory && (
                              <button 
                                onClick={() => {
                                  onSelect({ name: file.name, size: file.size, path: file.absolutePath || file.path, source: 'workspace' });
                                  onClose();
                                }} 
                                className="p-1.5 bg-saki-pink text-white rounded-lg hover:bg-saki-pink transition-colors flex items-center gap-1 text-[10px] font-bold px-2"
                              >
                                <CheckCircle2 size={14} />
                                {t('select')}
                              </button>
                            )}
                            <div className={`flex items-center gap-1 ${onSelect ? 'opacity-0 group-hover:opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                              {file.isDirectory ? (
                                <button onClick={() => handleOpenFolder(file.path)} className="p-1.5 hover:bg-amber-100 text-amber-500 rounded-lg transition-colors" title={t('open')}>
                                  <ChevronRight size={16} />
                                </button>
                              ) : (
                                <>
                                  <button onClick={() => handlePreview(file)} className="p-1.5 hover:bg-[var(--surface-bg-light)] text-[var(--text-secondary)] rounded-lg transition-colors" title={t('preview')}>
                                    <Eye size={16} />
                                  </button>
                                  <button onClick={() => handleEdit(file)} className="p-1.5 hover:bg-[var(--surface-bg-light)] text-[var(--text-secondary)] rounded-lg transition-colors" title={t('edit')}>
                                    <Edit2 size={16} />
                                  </button>
                                  <button onClick={() => handleDownload(file)} className="p-1.5 hover:bg-[var(--surface-bg-light)] text-[var(--text-secondary)] rounded-lg transition-colors" title={t('download')}>
                                    <Download size={16} />
                                  </button>
                                </>
                              )}
                              <button onClick={() => handleDelete(file)} className="p-1.5 hover:bg-red-50 text-red-400 rounded-lg transition-colors" title={t('delete')}>
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      trashItems.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase())).map(item => (
                        <div key={item.trashId} className="group p-4 bg-[var(--surface-bg)] border border-[var(--surface-border-subtle)] rounded-2xl hover:border-red-200 hover:shadow-md transition-all flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center text-red-400">
                            <Trash2 size={20} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[var(--text-dark)] truncate">{item.name}</p>
                            <p className="text-[10px] text-[var(--text-tertiary)]">{item.size} • {new Date(item.deletedAt).toLocaleString()}</p>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => handleRestore(item.trashId)} 
                              className="p-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-1 text-[10px] font-bold px-2"
                            >
                              <CheckCircle2 size={14} />
                              {t('restore')}
                            </button>
                            <button 
                              onClick={() => handlePermanentDelete(item.trashId)} 
                              className="p-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-1 text-[10px] font-bold px-2"
                            >
                              <Trash2 size={14} />
                              {t('permanent_delete')}
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
