import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, FileText, Trash2, Download, Eye, Edit2, Save, File as FileIcon, Search, ArrowLeft, CheckCircle2, Folder, CornerUpLeft } from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = `${window.location.protocol}//${window.location.hostname}:3000`;

export default function FileManagerModal({ isOpen, onClose, onSelect }) {
  const { t } = useTranslation();
  const [files, setFiles] = useState([]);
  const [trashItems, setTrashItems] = useState([]);
  const [view, setView] = useState('files'); // 'files' or 'trash'
  const [loading, setLoading] = useState(false);
  const [editingFile, setEditingFile] = useState(null); // { name, content }
  const [previewingFile, setPreviewingFile] = useState(null); // { name, content, isImage }
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPath, setCurrentPath] = useState('');

  const fetchFiles = async (path = currentPath) => {
    setLoading(true);
    try {
      const res = await axios.get(`${BACKEND_URL}/api/files`, {
        params: { folder: path }
      });
      setFiles(res.data);
    } catch (err) {
      console.error('Failed to fetch files:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTrash = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${BACKEND_URL}/api/trash`);
      setTrashItems(res.data);
    } catch (err) {
      console.error('Failed to fetch trash:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (view === 'files') fetchFiles(currentPath);
      else fetchTrash();
    }
  }, [isOpen, view, currentPath]);

  const handleNavigate = (folderName) => {
    const newPath = currentPath ? `${currentPath}/${folderName}` : folderName;
    setCurrentPath(newPath);
  };

  const handleGoUp = () => {
    if (!currentPath) return;
    const parts = currentPath.split('/');
    parts.pop();
    setCurrentPath(parts.join('/'));
  };

  const handleDelete = async (file) => {
    const fullPath = file.path || file.name; // Fallback
    if (!confirm(t('delete_move_trash_confirm', { name: file.name }))) return;
    try {
      await axios.delete(`${BACKEND_URL}/api/files`, { params: { name: fullPath } });
      fetchFiles();
    } catch (err) {
      alert(t('delete_fail'));
    }
  };

  const handleDownload = (file) => {
     const fullPath = file.path || file.name;
    window.open(`${BACKEND_URL}/api/files/download?name=${encodeURIComponent(fullPath)}`);
  };

  const handlePreview = async (file) => {
    const fullPath = file.path || file.name;
    try {
      const res = await axios.get(`${BACKEND_URL}/api/files/preview`, { params: { name: fullPath }});
      setPreviewingFile({ name: file.name, path: fullPath, ...res.data });
    } catch (err) {
      alert(t('preview_fail'));
    }
  };

  const handleEdit = async (file) => {
    const fullPath = file.path || file.name;
    try {
      const res = await axios.get(`${BACKEND_URL}/api/files/preview`, { params: { name: fullPath }});
      setEditingFile({ name: file.name, path: fullPath, content: res.data.content });
    } catch (err) {
      alert(t('read_fail'));
    }
  };

  const handleSave = async () => {
    try {
      await axios.post(`${BACKEND_URL}/api/files/save`, {
        name: editingFile.path, // Use full path here
        content: editingFile.content
      });
      setEditingFile(null);
      fetchFiles();
    } catch (err) {
      alert(t('save_fail'));
    }
  };

  const handlePermanentDelete = async (trashId) => {
    if (!confirm(t('permanent_delete_confirm'))) return;
    try {
      await axios.delete(`${BACKEND_URL}/api/trash/${trashId}`);
      fetchTrash();
    } catch (err) {
      alert(t('delete_fail'));
    }
  };

  const handleRestore = async (trashId) => {
    try {
      await axios.post(`${BACKEND_URL}/api/trash/restore`, { trashId });
      fetchTrash();
    } catch (err) {
      if (err.response?.status === 404) {
        alert(t('trash_file_cleared'));
      } else {
        alert(t('restore_fail'));
      }
    }
  };


  if (!isOpen) return null;

  const filteredFiles = files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="bg-white w-full max-w-4xl h-[80vh] rounded-2xl shadow-2xl relative flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center text-white shadow-lg shadow-blue-200">
              <FileIcon size={20} />
            </div>
            <div>
              <h3 className="font-bold text-gray-800 text-lg">{t('file_manager_title')}</h3>
              <p className="text-xs text-gray-400">{t('file_manager_desc')}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {editingFile ? (
            <div className="flex-1 flex flex-col p-4 animate-in fade-in duration-300">
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => setEditingFile(null)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-500">
                  <ArrowLeft size={16} /> {t('return_list')}
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{editingFile.name}</span>
                  <button onClick={handleSave} className="flex items-center gap-2 bg-blue-500 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-blue-600 transition-colors shadow-sm">
                    <Save size={16} /> {t('save')}
                  </button>
                </div>
              </div>
              <textarea
                className="flex-1 w-full bg-gray-900 text-green-400 p-4 rounded-xl font-mono text-sm outline-none resize-none border-none shadow-inner"
                value={editingFile.content}
                onChange={(e) => setEditingFile({ ...editingFile, content: e.target.value })}
                spellCheck={false}
              />
            </div>
          ) : previewingFile ? (
            <div className="flex-1 flex flex-col p-4 animate-in fade-in duration-300 overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => setPreviewingFile(null)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-500">
                  <ArrowLeft size={16} /> {t('return_list')}
                </button>
                <span className="text-sm font-medium">{previewingFile.name}</span>
              </div>
              <div className="flex-1 bg-gray-50 rounded-xl overflow-auto border shadow-inner">
                {previewingFile.isImage ? (
                  <div className="h-full flex items-center justify-center p-4">
                    <img src={previewingFile.content} alt={previewingFile.name} className="max-w-full max-h-full object-contain rounded-lg" />
                  </div>
                ) : (
                  <pre className="p-4 font-mono text-sm text-gray-700 whitespace-pre-wrap">
                    {previewingFile.content}
                  </pre>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="p-4 bg-white sticky top-0 z-10 flex items-center gap-4 border-b">
                <div className="flex bg-gray-100 p-1 rounded-xl">
                  <button
                    onClick={() => setView('files')}
                    className={`px-4 py-1.5 rounded-lg text-sm transition-all ${view === 'files' ? 'bg-white shadow-sm text-blue-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    {t('files')}
                  </button>
                  <button
                    onClick={() => setView('trash')}
                    className={`px-4 py-1.5 rounded-lg text-sm transition-all ${view === 'trash' ? 'bg-white shadow-sm text-red-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    {t('trash')}
                  </button>
                </div>

                {view === 'files' && (
                  <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100 max-w-[300px] overflow-hidden">
                    <button 
                      onClick={() => setCurrentPath('')}
                      className={`text-xs font-medium ${!currentPath ? 'text-blue-500' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                      Files
                    </button>
                    {currentPath && currentPath.split('/').map((part, idx, arr) => (
                      <React.Fragment key={idx}>
                        <span className="text-gray-300">/</span>
                        <button
                          onClick={() => setCurrentPath(arr.slice(0, idx + 1).join('/'))}
                          className={`text-xs font-medium truncate max-w-[100px] ${idx === arr.length - 1 ? 'text-blue-500' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                          {part}
                        </button>
                      </React.Fragment>
                    ))}
                  </div>
                )}

                <div className="relative flex-1">

                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input 
                    type="text" 
                    placeholder={view === 'files' ? t('search_file_placeholder') : t('search_trash_placeholder')}
                    className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all border border-transparent"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {loading ? (
                  <div className="flex items-center justify-center h-40">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                  </div>
                ) : (view === 'files' ? filteredFiles : trashItems.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()))).length === 0 ? (
                  <div className="text-center py-20 text-gray-400">
                    {view === 'files' ? <FileIcon size={48} className="mx-auto mb-4 opacity-20" /> : <Trash2 size={48} className="mx-auto mb-4 opacity-20" />}
                    <p>{view === 'files' ? t('no_files_directory') : t('trash_empty')}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {view === 'files' ? (
                      <>
                        {currentPath && (
                          <div 
                              className="group p-4 bg-gray-50 border border-gray-100 rounded-2xl hover:bg-gray-100 hover:border-gray-200 transition-all flex items-center gap-3 cursor-pointer select-none"
                              onClick={handleGoUp}
                          >
                              <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center text-gray-500">
                                  <CornerUpLeft size={20} />
                              </div>
                              <div className="flex-1 min-w-0">
                                   <p className="text-sm font-medium text-gray-700">..</p>
                                   <p className="text-[10px] text-gray-400">返回上一级</p>
                              </div>
                          </div>
                        )}
                        {filteredFiles.map(file => (
                          <div key={file.name} className="group p-4 bg-white border border-gray-100 rounded-2xl hover:border-blue-200 hover:shadow-md transition-all flex items-center gap-3">
                            <div 
                                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${file.isDirectory ? 'bg-yellow-50 text-yellow-500 group-hover:bg-yellow-100 cursor-pointer' : 'bg-gray-50 text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-500'}`}
                                onClick={() => file.isDirectory && handleNavigate(file.name)}
                            >
                                {file.isDirectory ? <Folder size={20} /> : <FileText size={20} />}
                            </div>
                            
                            <div className={`flex-1 min-w-0 ${file.isDirectory ? 'cursor-pointer' : ''}`} onClick={() => file.isDirectory && handleNavigate(file.name)}>
                              <p className="text-sm font-medium text-gray-700 truncate">{file.name}</p>
                              <p className="text-[10px] text-gray-400">{file.size} • {file.time}</p>
                            </div>
                            
                            <div className="flex items-center gap-1 opacity-100 group-hover:opacity-100 transition-opacity">
                              {onSelect && !file.isDirectory && (
                                <button 
                                  onClick={() => {
                                    onSelect({ name: file.name, size: file.size, path: file.path, source: 'workspace' });
                                    onClose();
                                  }} 
                                  className="p-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-1 text-[10px] font-bold px-2"
                                >
                                  <CheckCircle2 size={14} />
                                  {t('select')}
                                </button>
                              )}
                              <div className={`flex items-center gap-1 ${onSelect ? 'opacity-0 group-hover:opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                {!file.isDirectory && (
                                    <>
                                        <button onClick={() => handlePreview(file)} className="p-1.5 hover:bg-gray-100 text-gray-500 rounded-lg transition-colors" title={t('preview')}>
                                          <Eye size={16} />
                                        </button>
                                        <button onClick={() => handleEdit(file)} className="p-1.5 hover:bg-gray-100 text-gray-500 rounded-lg transition-colors" title={t('edit')}>
                                          <Edit2 size={16} />
                                        </button>
                                        <button onClick={() => handleDownload(file)} className="p-1.5 hover:bg-gray-100 text-gray-500 rounded-lg transition-colors" title={t('download')}>
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
                      ))}
                      </>
                    ) : (
                      trashItems.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase())).map(item => (
                        <div key={item.trashId} className="group p-4 bg-white border border-gray-100 rounded-2xl hover:border-red-200 hover:shadow-md transition-all flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center text-red-400">
                            <Trash2 size={20} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-700 truncate">{item.name}</p>
                            <p className="text-[10px] text-gray-400">{item.size} • {new Date(item.deletedAt).toLocaleString()}</p>
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
      </div>
    </div>
  );
}
