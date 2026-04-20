import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Wrench,
  Plus,
  Search,
  Trash2,
  BookOpen,
  Download,
  Save,
  RefreshCw,
  Globe,
  Sparkles,
  Power,
  PowerOff,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { BACKEND_URL } from '../utils/backendUrl';
import { getFeatureLocale } from '../utils/featureLocale';
import { modalBackdropMotion, modalPanelMotion } from '../utils/modalMotion';

const emptyForm = {
  sourceType: 'openhub',
  source: '',
  name: '',
  content: '',
};

export default function SkillManagerModal({ isOpen, onClose, windowed = false }) {
  const { i18n } = useTranslation();
  const ui = getFeatureLocale(i18n.resolvedLanguage || i18n.language).skills;
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSkill, setSelectedSkill] = useState(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [hubQuery, setHubQuery] = useState('');
  const [hubResults, setHubResults] = useState([]);
  const [hubLoading, setHubLoading] = useState(false);
  const [installingSlug, setInstallingSlug] = useState('');
  const [isMobileListOpen, setIsMobileListOpen] = useState(true);

  const fetchSkills = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${BACKEND_URL}/api/skills`);
      setSkills(res.data || []);
    } catch (err) {
      console.error('Failed to fetch skills:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    fetchSkills();
    setIsMobileListOpen(true);
  }, [isOpen]);

  const openInstalledSkill = async (skill) => {
    try {
      const res = await axios.get(`${BACKEND_URL}/api/skills/${encodeURIComponent(skill.id)}`);
      setSelectedSkill(res.data);
      if (window.innerWidth < 768) {
        setIsMobileListOpen(false);
      }
    } catch (err) {
      console.error('Failed to load skill:', err);
      alert(ui.readFailed);
    }
  };

  const inspectOpenHubSkill = async (slug) => {
    try {
      setHubLoading(true);
      const res = await axios.get(`${BACKEND_URL}/api/skills/openhub/inspect/${encodeURIComponent(slug)}`);
      setSelectedSkill(res.data);
      if (window.innerWidth < 768) {
        setIsMobileListOpen(false);
      }
    } catch (err) {
      console.error('Failed to inspect OpenHub skill:', err);
      alert(err.response?.data?.error || ui.inspectFailed);
    } finally {
      setHubLoading(false);
    }
  };

  const searchOpenHub = async (query = hubQuery) => {
    const trimmed = query.trim();
    if (!trimmed) {
      setHubResults([]);
      return;
    }

    try {
      setHubLoading(true);
      const res = await axios.get(`${BACKEND_URL}/api/skills/openhub/search`, {
        params: { q: trimmed },
      });
      setHubResults(res.data || []);
    } catch (err) {
      console.error('Failed to search OpenHub skills:', err);
      alert(err.response?.data?.error || ui.searchFailed);
    } finally {
      setHubLoading(false);
    }
  };

  const installSkill = async (override = null) => {
    const nextSourceType = override?.sourceType || form.sourceType;
    const nextSource = override?.source || form.source;
    const nextName = override?.name || form.name;
    const nextContent = override?.content || form.content;

    try {
      setLoading(true);
      let installedSkill = null;
      if (nextSourceType === 'manual') {
        const res = await axios.post(`${BACKEND_URL}/api/skills/install`, {
          sourceType: 'manual',
          name: nextName,
          content: nextContent,
        });
        installedSkill = res.data?.skill || null;
      } else {
        const res = await axios.post(`${BACKEND_URL}/api/skills/install`, {
          sourceType: nextSourceType,
          source: nextSource,
        });
        installedSkill = res.data?.skill || null;
      }

      setForm(prev => ({ ...emptyForm, sourceType: prev.sourceType }));
      setIsInstalling(false);
      await fetchSkills();
      if (installedSkill?.id) {
        await openInstalledSkill(installedSkill);
      }
    } catch (err) {
      console.error('Failed to install skill:', err);
      alert(err.response?.data?.error || ui.installFailed);
    } finally {
      setLoading(false);
      setInstallingSlug('');
    }
  };

  const installOpenHubSlug = async (slug) => {
    try {
      setInstallingSlug(slug);
      await installSkill({ sourceType: 'openhub', source: slug });
    } finally {
      setInstallingSlug('');
    }
  };

  const handleDelete = async (skill) => {
    if (!window.confirm(ui.deleteConfirm(skill.name))) return;
    try {
      await axios.delete(`${BACKEND_URL}/api/skills/${encodeURIComponent(skill.id)}`);
      if (selectedSkill?.id === skill.id) setSelectedSkill(null);
      await fetchSkills();
    } catch (err) {
      console.error('Failed to delete skill:', err);
      alert(ui.deleteFailed);
    }
  };

  const handleToggleSkillSafe = async (skill) => {
    try {
      const res = await axios.patch(`${BACKEND_URL}/api/skills/${encodeURIComponent(skill.id)}`, {
        enabled: !skill.enabled,
      });
      const updatedSkill = res.data?.skill;
      if (!updatedSkill) return;
      setSkills(prev => prev.map(item => item.id === skill.id ? updatedSkill : item));
      if (selectedSkill?.id === skill.id) {
        setSelectedSkill(updatedSkill);
      }
    } catch (err) {
      console.error('Failed to toggle skill:', err);
      alert(err.response?.data?.error || ui.toggleFailed);
    }
  };

  if (!isOpen) return null;

  const filteredSkills = skills.filter(skill =>
    !searchQuery ||
    skill.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    skill.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    skill.sourceMeta?.slug?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedSkillMeta = selectedSkill?.sourceMeta || {};
  const selectedIsRemote = Boolean(selectedSkill?.isRemote);

  return (
    <motion.div
      className={windowed ? 'h-full w-full' : 'fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-md p-4'}
      {...(!windowed ? modalBackdropMotion : {})}
      onClick={!windowed ? onClose : undefined}
    >
      <motion.div
        className={windowed ? 'bg-white rounded-[28px] w-full h-full shadow-none overflow-hidden flex flex-col' : 'bg-white rounded-3xl w-full max-w-6xl shadow-2xl overflow-hidden flex flex-col h-[84vh]'}
        {...(!windowed ? modalPanelMotion : {})}
        onClick={!windowed ? (event) => event.stopPropagation() : undefined}
      >
        <div className="p-4 md:p-6 border-b flex items-center justify-between gap-3 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
              <Wrench size={22} />
            </div>
            <div>
              <h3 className="font-bold text-gray-800 text-lg">{ui.title}</h3>
              <p className="text-xs text-gray-500">{ui.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMobileListOpen(prev => !prev)}
              className="md:hidden p-2 hover:bg-gray-200 rounded-full transition-colors"
              title={isMobileListOpen ? ui.collapseList : ui.expandList}
            >
              {isMobileListOpen ? <PanelLeftClose size={18} className="text-gray-500" /> : <PanelLeftOpen size={18} className="text-gray-500" />}
            </button>
            <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
              <X size={20} className="text-gray-500" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          <div className={`${isMobileListOpen ? 'flex' : 'hidden'} md:flex w-full md:w-[400px] border-b md:border-b-0 md:border-r border-gray-100 flex-col min-h-0 bg-gray-50/40`}>
            <div className="p-4 border-b border-gray-100 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={ui.searchInstalledPlaceholder}
                  className="w-full pl-9 pr-4 py-2 rounded-xl bg-white border border-gray-100 text-sm outline-none focus:border-emerald-400"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setIsInstalling(v => !v);
                    setSelectedSkill(null);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-colors"
                >
                  <Plus size={16} />
                  {ui.installSkill}
                </button>
                <button
                  onClick={fetchSkills}
                  className="px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-600 hover:border-emerald-300 transition-colors"
                  title={ui.refresh}
                >
                  <RefreshCw size={16} />
                </button>
              </div>
            </div>

            {isInstalling && (
              <div className="p-4 border-b border-gray-100 bg-white space-y-3">
                <div className="flex gap-2 flex-wrap">
                  {['openhub', 'git', 'local', 'manual'].map(type => (
                    <button
                      key={type}
                      onClick={() => setForm(prev => ({ ...prev, sourceType: type }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                        form.sourceType === type ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>

                {form.sourceType === 'openhub' && (
                  <div className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                      <Globe size={16} />
                      {ui.openhubInstallTitle}
                    </div>
                    <p className="text-xs text-gray-500 leading-5">
                      {ui.openhubInstallDesc}
                    </p>
                    <div className="flex gap-2">
                      <input
                        value={hubQuery}
                        onChange={(e) => setHubQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') searchOpenHub();
                        }}
                        placeholder={ui.openhubQueryPlaceholder}
                        className="flex-1 px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm outline-none focus:border-emerald-400"
                      />
                      <button
                        onClick={() => searchOpenHub()}
                        disabled={hubLoading}
                        className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-bold hover:bg-black disabled:opacity-60"
                      >
                        {ui.search}
                      </button>
                    </div>
                    <input
                      value={form.source}
                      onChange={(e) => setForm(prev => ({ ...prev, source: e.target.value }))}
                      placeholder={ui.openhubSlugPlaceholder}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm outline-none focus:border-emerald-400"
                    />
                    <button
                      onClick={() => installSkill()}
                      disabled={loading || !form.source.trim()}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-60"
                    >
                      <Download size={16} />
                      {ui.installViaOpenHub}
                    </button>

                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {hubLoading ? (
                        <div className="text-xs text-gray-400 py-4 text-center">{ui.searchingOpenHub}</div>
                      ) : hubResults.length === 0 ? (
                        <div className="text-xs text-gray-400 py-4 text-center">{ui.noOpenhubResults}</div>
                      ) : (
                        hubResults.map(skill => (
                          <div key={skill.slug} className="rounded-2xl border border-white bg-white p-3 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                              <button
                                onClick={() => inspectOpenHubSkill(skill.slug)}
                                className="min-w-0 text-left"
                              >
                                <div className="text-sm font-bold text-gray-800 truncate">{skill.name}</div>
                                <div className="text-[11px] text-gray-400 mt-1">{skill.slug}</div>
                              </button>
                              <button
                                onClick={() => installOpenHubSlug(skill.slug)}
                                disabled={loading}
                                className="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-60"
                              >
                                {installingSlug === skill.slug ? ui.installing : ui.installSkill}
                              </button>
                            </div>
                            <div className="mt-2 text-[11px] text-gray-500">
                              {typeof skill.searchScore === 'number'
                                ? ui.openhubMatch(skill.searchScore.toFixed(3))
                                : 'OpenHub'}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {form.sourceType === 'manual' && (
                  <>
                    <input
                      value={form.name}
                      onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder={ui.skillNamePlaceholder}
                      className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-100 text-sm outline-none focus:border-emerald-400"
                    />
                    <textarea
                      value={form.content}
                      onChange={(e) => setForm(prev => ({ ...prev, content: e.target.value }))}
                      placeholder={ui.skillContentPlaceholder}
                      className="w-full h-32 px-3 py-2 rounded-2xl bg-gray-50 border border-gray-100 text-sm outline-none resize-none focus:border-emerald-400"
                    />
                  </>
                )}

                {(form.sourceType === 'git' || form.sourceType === 'local') && (
                  <>
                    <input
                      value={form.source}
                      onChange={(e) => setForm(prev => ({ ...prev, source: e.target.value }))}
                      placeholder={form.sourceType === 'git' ? ui.gitPlaceholder : ui.localPlaceholder}
                      className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-100 text-sm outline-none focus:border-emerald-400"
                    />
                    <button
                      onClick={() => installSkill()}
                      disabled={loading || !form.source.trim()}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-bold hover:bg-black transition-colors disabled:opacity-60"
                    >
                      <Download size={16} />
                      {ui.installSkill}
                    </button>
                  </>
                )}

                {form.sourceType === 'manual' && (
                  <button
                    onClick={() => installSkill()}
                    disabled={loading || !form.name.trim() || !form.content.trim()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-bold hover:bg-black transition-colors disabled:opacity-60"
                  >
                    <Save size={16} />
                    {ui.saveSkill}
                  </button>
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loading ? (
                <div className="text-sm text-gray-400 text-center py-10">{ui.loading}</div>
              ) : filteredSkills.length === 0 ? (
                <div className="text-sm text-gray-400 text-center py-10">{ui.noInstalledSkills}</div>
              ) : (
                filteredSkills.map(skill => (
                  <div
                    key={skill.id}
                    className={`bg-white border rounded-2xl p-4 space-y-3 shadow-sm ${skill.enabled ? 'border-gray-100' : 'border-gray-200 opacity-70'}`}
                  >
                    <button className="w-full text-left" onClick={() => openInstalledSkill(skill)}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-bold text-sm text-gray-800 truncate">{skill.name}</div>
                          <div className="text-[11px] text-gray-400 mt-1">
                            {skill.sourceType}
                            {skill.sourceMeta?.slug ? ` · ${skill.sourceMeta.slug}` : ''}
                          </div>
                        </div>
                        <BookOpen size={16} className="text-emerald-500 shrink-0" />
                      </div>
                      <p className="mt-2 text-xs text-gray-500 line-clamp-3">{skill.description || skill.preview}</p>
                    </button>
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex gap-1 flex-wrap">
                        {skill.isDefault ? (
                          <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
                            {ui.default}
                          </span>
                        ) : null}
                        {!skill.enabled ? (
                          <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold">
                            {ui.disabled}
                          </span>
                        ) : null}
                        {(skill.tags || []).slice(0, 3).map(tag => (
                          <span key={tag} className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                            {tag}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleToggleSkillSafe(skill)}
                          className={`p-1.5 rounded-lg transition-colors ${skill.enabled ? 'text-emerald-600 hover:bg-emerald-50' : 'text-amber-600 hover:bg-amber-50'}`}
                          title={skill.enabled ? ui.disableSkill : ui.enableSkill}
                        >
                          {skill.enabled ? <Power size={15} /> : <PowerOff size={15} />}
                        </button>
                        <button
                          onClick={() => handleDelete(skill)}
                          disabled={skill.canDelete === false}
                          className={`p-1.5 rounded-lg ${skill.canDelete === false ? 'text-gray-300 cursor-not-allowed' : 'text-red-400 hover:bg-red-50'}`}
                          title={skill.canDelete === false ? ui.protectedDelete : ui.deleteLabel}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className={`${isMobileListOpen ? 'hidden' : 'flex'} md:flex flex-1 min-h-0 flex-col bg-white`}>
            {selectedSkill ? (
              <>
                <div className="p-5 border-b border-gray-100">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <button
                        onClick={() => setIsMobileListOpen(true)}
                        className="md:hidden inline-flex items-center gap-1 mb-3 px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 text-xs font-bold"
                      >
                        <PanelLeftOpen size={14} />
                        Skills
                      </button>
                      <h4 className="text-lg font-bold text-gray-900 truncate">{selectedSkill.name}</h4>
                      <p className="text-xs text-gray-500 mt-1">
                        {selectedSkill.sourceType}
                        {selectedSkill.source ? ` · ${selectedSkill.source}` : ''}
                        {selectedSkillMeta.version ? ` · v${selectedSkillMeta.version}` : ''}
                        {selectedSkillMeta.owner ? ` · ${selectedSkillMeta.owner}` : ''}
                      </p>
                    </div>

                    {selectedIsRemote ? (
                      <button
                        onClick={() => installOpenHubSlug(selectedSkill.slug)}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-60"
                      >
                        <Download size={15} />
                        {ui.installThisSkill}
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleSkillSafe(selectedSkill)}
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${selectedSkill.enabled ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}
                        >
                          {selectedSkill.enabled ? <Power size={15} /> : <PowerOff size={15} />}
                          {selectedSkill.enabled ? ui.enabledNow : ui.disabledNow}
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              await axios.post(`${BACKEND_URL}/api/skills`, {
                                name: selectedSkill.name,
                                content: selectedSkill.content,
                                description: selectedSkill.description,
                                tags: selectedSkill.tags,
                              });
                              await fetchSkills();
                            } catch (err) {
                              console.error('Failed to save skill:', err);
                              alert(ui.overwriteFailed);
                            }
                          }}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700"
                        >
                          <Save size={15} />
                          {ui.overwriteSave}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 mt-3">
                    {selectedSkill.isDefault ? (
                      <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold">
                        {ui.defaultSkill}
                      </span>
                    ) : null}
                    {!selectedSkill.enabled ? (
                      <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-[11px] font-bold">
                        {ui.disabled}
                      </span>
                    ) : null}
                    {selectedSkillMeta.downloads ? (
                      <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-[11px] font-bold">
                        {ui.downloads} {selectedSkillMeta.downloads}
                      </span>
                    ) : null}
                    {selectedSkillMeta.stars ? (
                      <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-[11px] font-bold">
                        Stars {selectedSkillMeta.stars}
                      </span>
                    ) : null}
                    {(selectedSkill.tags || []).slice(0, 6).map(tag => (
                      <span key={tag} className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {selectedSkill.description ? (
                    <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                        <Sparkles size={15} className="text-emerald-500" />
                        {ui.overview}
                      </div>
                      <p className="mt-2 text-sm text-gray-600 leading-6">{selectedSkill.description}</p>
                    </div>
                  ) : null}

                  <pre className="whitespace-pre-wrap text-sm leading-6 text-gray-700 font-mono bg-gray-50 rounded-2xl p-5 border border-gray-100">
                    {selectedSkill.content || ui.noSkillContent}
                  </pre>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-center text-gray-400 p-10">
                <div>
                  <Wrench size={42} className="mx-auto mb-4 opacity-20" />
                  <div className="font-semibold text-gray-500">{ui.selectSkillTitle}</div>
                  <p className="text-sm mt-2">
                    {ui.selectSkillDesc}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
