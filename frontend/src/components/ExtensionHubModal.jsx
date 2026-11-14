import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Boxes,
  Check,
  CheckCircle2,
  Cpu,
  Database,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  FolderOpen,
  GitPullRequest,
  Globe,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Save,
  Search,
  Server,
  Settings,
  Sparkles,
  Trash2,
  Upload,
  Wrench,
  X,
} from 'lucide-react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { BACKEND_URL } from '../utils/backendUrl';
import { getFeatureLocale } from '../utils/featureLocale';
import { modalBackdropMotion, modalPanelMotion } from '../utils/modalMotion';
import { localizeWith } from '../utils/localize';

const CATEGORIES = [
  { id: 'all', label: '全部插件', en: 'All plugins', ja: 'すべてのプラグイン' },
  { id: 'developer', label: '开发编程', en: 'Developer', ja: '開発・プログラミング' },
  { id: 'utility', label: '系统运维', en: 'SysOps', ja: 'システム運用' },
  { id: 'database', label: '数据分析', en: 'Data', ja: 'データ分析' },
  { id: 'web', label: '网页自动化', en: 'Web', ja: 'Web 自動化' },
  { id: 'office', label: '办公协同', en: 'Office', ja: 'オフィス連携' },
];

const EMPTY_SKILL_FORM = {
  sourceType: 'openhub',
  source: '',
  name: '',
  content: '',
};

const EMPTY_MCP_SERVER_FORM = {
  originalName: '',
  name: '',
  transport: 'stdio',
  command: '',
  argsText: '',
  url: '',
  envText: '',
};

function getCategoryIcon(cat, iconName) {
  if (iconName === 'Cpu') return Cpu;
  if (iconName === 'GitPullRequest') return GitPullRequest;
  if (iconName === 'Globe') return Globe;
  if (iconName === 'Database') return Database;
  if (iconName === 'FileText') return FileText;
  if (cat === 'developer') return GitPullRequest;
  if (cat === 'database') return Database;
  if (cat === 'web') return Globe;
  if (cat === 'office') return FileText;
  return Boxes;
}

function parseArgsInput(rawText = '') {
  const trimmed = rawText.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // Fall through to shell-like token splitting
    }
  }
  const tokens = [];
  const regex = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = regex.exec(trimmed)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }
  return tokens;
}

function formatArgsInput(args) {
  if (!Array.isArray(args) || args.length === 0) return '';
  return args.map((arg) => (/\s/.test(String(arg)) ? `"${arg}"` : String(arg))).join(' ');
}

function parseEnvInput(rawText = '') {
  const env = {};
  for (const line of rawText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (key) env[key] = value;
  }
  return env;
}

function formatEnvInput(env) {
  if (!env || typeof env !== 'object') return '';
  return Object.entries(env)
    .map(([key, value]) => `${key}=${value ?? ''}`)
    .join('\n');
}

function normalizeMcpConfigObject(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { mcpServers: {} };
  }
  const servers = raw.mcpServers && typeof raw.mcpServers === 'object' && !Array.isArray(raw.mcpServers)
    ? raw.mcpServers
    : {};
  return { ...raw, mcpServers: servers };
}

export default function ExtensionHubModal({
  isOpen,
  onClose,
  config,
  setConfig,
  initialTab = 'marketplace',
  windowed = false,
}) {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || i18n.language;
  const tx = useCallback((zhText, enText, jaText) => localizeWith(lang, zhText, enText, jaText), [lang]);
  const ui = getFeatureLocale(lang).skills;
  const searchInputId = useId();
  const zipInputRef = useRef(null);

  const [activeTab, setActiveTab] = useState(initialTab || 'marketplace');
  const [notice, setNotice] = useState('');
  const [loadError, setLoadError] = useState('');

  // Plugins state
  const [catalog, setCatalog] = useState([]);
  const [installedPlugins, setInstalledPlugins] = useState([]);
  const [pluginsLoading, setPluginsLoading] = useState(false);
  const [sourceStatus, setSourceStatus] = useState(null);
  const [installingPluginId, setInstallingPluginId] = useState(null);
  const [pluginSearch, setPluginSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [localPluginPath, setLocalPluginPath] = useState('');
  const [isImportingPlugin, setIsImportingPlugin] = useState(false);
  const [importMessage, setImportMessage] = useState(null);
  const [configModalPlugin, setConfigModalPlugin] = useState(null);
  const [configForm, setConfigForm] = useState({});
  const [showSecrets, setShowSecrets] = useState({});
  const [isSavingPluginConfig, setIsSavingPluginConfig] = useState(false);

  // Skills state
  const [skills, setSkills] = useState([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillSearch, setSkillSearch] = useState('');
  const [selectedSkill, setSelectedSkill] = useState(null);
  const [skillContentDraft, setSkillContentDraft] = useState('');
  const [isEditingSkill, setIsEditingSkill] = useState(false);
  const [isInstallingSkill, setIsInstallingSkill] = useState(false);
  const [skillForm, setSkillForm] = useState(EMPTY_SKILL_FORM);
  const [hubQuery, setHubQuery] = useState('');
  const [hubResults, setHubResults] = useState([]);
  const [hubLoading, setHubLoading] = useState(false);
  const [installingSlug, setInstallingSlug] = useState('');
  const [isMobileSkillListOpen, setIsMobileSkillListOpen] = useState(true);

  // MCP state
  const [mcpStatus, setMcpStatus] = useState({});
  const [mcpMode, setMcpMode] = useState('visual'); // 'visual' | 'json'
  const [mcpConfigText, setMcpConfigText] = useState(() =>
    JSON.stringify(normalizeMcpConfigObject(config?.mcpConfig), null, 2)
  );
  const [mcpJsonError, setMcpJsonError] = useState('');
  const [isSyncingMcp, setIsSyncingMcp] = useState(false);
  const [isEditingMcpServer, setIsEditingMcpServer] = useState(false);
  const [mcpServerForm, setMcpServerForm] = useState(EMPTY_MCP_SERVER_FORM);

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen) return;
    setNotice('');
    setMcpJsonError('');
    setIsMobileSkillListOpen(true);
    const normalized = normalizeMcpConfigObject(config?.mcpConfig);
    setMcpConfigText(JSON.stringify(normalized, null, 2));
  }, [isOpen]);

  const fetchPluginData = useCallback(async (refresh = false) => {
    setPluginsLoading(true);
    try {
      const [marketRes, installedRes] = await Promise.allSettled([
        axios.get(`${BACKEND_URL}/api/plugins/marketplace`, { params: { includeSource: true, refresh } }),
        axios.get(`${BACKEND_URL}/api/plugins`),
      ]);
      if (marketRes.status === 'fulfilled') {
        const data = marketRes.value.data;
        setCatalog(Array.isArray(data) ? data : (data.plugins || []));
        setSourceStatus(data.source || null);
      }
      if (installedRes.status === 'fulfilled') {
        setInstalledPlugins(installedRes.value.data || []);
      }
      const failed = [marketRes, installedRes].filter((r) => r.status === 'rejected');
      if (failed.length) {
        setLoadError(failed.map((r) => r.reason?.response?.data?.error || r.reason?.message).join(tx('；', '; ')));
      }
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setPluginsLoading(false);
    }
  }, [tx]);

  const fetchSkills = useCallback(async () => {
    setSkillsLoading(true);
    try {
      const res = await axios.get(`${BACKEND_URL}/api/skills`);
      setSkills(res.data || []);
    } catch (err) {
      console.error('Failed to fetch skills:', err);
    } finally {
      setSkillsLoading(false);
    }
  }, []);

  const fetchMcpData = useCallback(async () => {
    try {
      const [statusRes, configRes] = await Promise.allSettled([
        axios.get(`${BACKEND_URL}/api/mcp/status`),
        axios.get(`${BACKEND_URL}/api/mcp/config`),
      ]);
      if (statusRes.status === 'fulfilled') {
        setMcpStatus(statusRes.value.data || {});
      }
      if (configRes.status === 'fulfilled') {
        const fileServers = configRes.value.data?.mcpServers;
        const currentServers = config?.mcpConfig?.mcpServers;
        if (
          fileServers &&
          typeof fileServers === 'object' &&
          Object.keys(fileServers).length > 0 &&
          (!currentServers || Object.keys(currentServers).length === 0)
        ) {
          const next = normalizeMcpConfigObject(configRes.value.data);
          setConfig?.((prev) => ({ ...prev, mcpConfig: next }));
          setMcpConfigText(JSON.stringify(next, null, 2));
        }
      }
    } catch (err) {
      console.error('Failed to fetch MCP status:', err);
    }
  }, [config?.mcpConfig?.mcpServers, setConfig]);

  const fetchAll = useCallback(async (refreshMarketplace = false) => {
    setLoadError('');
    await Promise.all([
      fetchPluginData(refreshMarketplace),
      fetchSkills(),
      fetchMcpData(),
    ]);
  }, [fetchPluginData, fetchSkills, fetchMcpData]);

  useEffect(() => {
    if (!isOpen) return;
    fetchAll(false);
  }, [isOpen]);

  // Plugin handlers
  const openPluginConfigModal = (plugin, isInstalling = false) => {
    const initialConfig = {};
    const schema = plugin.configSchema || {};
    const savedConfig = plugin.config || installedPlugins.find((item) => item.id === plugin.id)?.config || {};
    for (const [key, field] of Object.entries(schema)) {
      initialConfig[key] = savedConfig[key] !== undefined ? savedConfig[key] : (field.default ?? '');
    }
    setConfigForm(initialConfig);
    setShowSecrets({});
    setConfigModalPlugin({ ...plugin, isInstallingFromMarket: isInstalling });
  };

  const handleMarketplaceInstall = async (plugin) => {
    if (installingPluginId || pluginsLoading) return;
    const schema = plugin.configSchema || {};
    const hasRequiredConfig = Object.values(schema).some((field) => field.required);
    if (hasRequiredConfig) {
      openPluginConfigModal(plugin, true);
      return;
    }

    try {
      setInstallingPluginId(plugin.id);
      setNotice('');
      setLoadError('');
      await axios.post(`${BACKEND_URL}/api/plugins/marketplace/install`, {
        pluginId: plugin.id,
        config: {},
      });
      await fetchAll(false);
      setNotice(tx(`插件「${plugin.name}」安装完成，关联的 Skills 与 MCP 已同步`, `Plugin "${plugin.name}" installed with Skills and MCP synced`, `プラグイン「${plugin.name}」をインストールし、スキルと MCP を同期しました`));
    } catch (err) {
      setLoadError(tx(`安装失败：${err.response?.data?.error || err.message}`, `Installation failed: ${err.response?.data?.error || err.message}`, `インストールに失敗しました: ${err.response?.data?.error || err.message}`));
    } finally {
      setInstallingPluginId(null);
    }
  };

  const handleSavePluginConfig = async () => {
    if (!configModalPlugin) return;
    try {
      setIsSavingPluginConfig(true);
      setLoadError('');
      if (configModalPlugin.isInstallingFromMarket) {
        setInstallingPluginId(configModalPlugin.id);
        setNotice('');
        await axios.post(`${BACKEND_URL}/api/plugins/marketplace/install`, {
          pluginId: configModalPlugin.id,
          config: configForm,
        });
        setNotice(tx(`插件「${configModalPlugin.name}」安装完成`, `Plugin "${configModalPlugin.name}" installed successfully`, `プラグイン「${configModalPlugin.name}」をインストールしました`));
      } else {
        await axios.post(`${BACKEND_URL}/api/plugins/${configModalPlugin.id}/config`, {
          config: configForm,
        });
        setNotice(tx(`插件「${configModalPlugin.name}」配置已更新并同步 MCP`, `Plugin "${configModalPlugin.name}" updated and MCP synced`, `プラグイン「${configModalPlugin.name}」の設定を保存して MCP を同期しました`));
      }
      setConfigModalPlugin(null);
      await fetchAll(false);
    } catch (err) {
      setLoadError(tx(`保存配置失败：${err.response?.data?.error || err.message}`, `Failed to save config: ${err.response?.data?.error || err.message}`, `設定の保存に失敗しました: ${err.response?.data?.error || err.message}`));
    } finally {
      setIsSavingPluginConfig(false);
      setInstallingPluginId(null);
    }
  };

  const handleTogglePlugin = async (pluginId, currentEnabled) => {
    try {
      setLoadError('');
      await axios.patch(`${BACKEND_URL}/api/plugins/${pluginId}/toggle`, {
        enabled: !currentEnabled,
      });
      await fetchAll(false);
    } catch (err) {
      setLoadError(tx(`切换状态失败：${err.response?.data?.error || err.message}`, `Failed to toggle plugin: ${err.response?.data?.error || err.message}`, `状態の切り替えに失敗しました: ${err.response?.data?.error || err.message}`));
    }
  };

  const handleUninstallPlugin = async (pluginId, pluginName) => {
    if (!window.confirm(tx(`确定要卸载插件 "${pluginName}" 吗？关联的 MCP 服务与专属技能将被注销。`, `Uninstall plugin "${pluginName}"? Its associated MCP services and dedicated skills will be removed.`, `プラグイン "${pluginName}" をアンインストールしますか？関連する MCP サービスと専用スキルも解除されます。`))) {
      return;
    }
    try {
      setLoadError('');
      await axios.delete(`${BACKEND_URL}/api/plugins/${pluginId}`);
      await fetchAll(false);
      setNotice(tx(`已卸载插件「${pluginName}」`, `Uninstalled plugin "${pluginName}"`, `プラグイン「${pluginName}」をアンインストールしました`));
    } catch (err) {
      setLoadError(tx(`卸载失败：${err.response?.data?.error || err.message}`, `Uninstall failed: ${err.response?.data?.error || err.message}`, `アンインストールに失敗しました: ${err.response?.data?.error || err.message}`));
    }
  };

  const handleImportLocalPlugin = async () => {
    if (!localPluginPath.trim()) return;
    try {
      setIsImportingPlugin(true);
      setImportMessage(null);
      const res = await axios.post(`${BACKEND_URL}/api/plugins/install`, {
        sourcePath: localPluginPath.trim(),
      });
      setImportMessage({
        type: 'success',
        text: tx(`插件 "${res.data.plugin.name}" 导入成功！`, `Plugin "${res.data.plugin.name}" imported successfully!`, `プラグイン "${res.data.plugin.name}" をインポートしました！`),
      });
      setLocalPluginPath('');
      await fetchAll(false);
      setActiveTab('installed');
    } catch (err) {
      setImportMessage({
        type: 'error',
        text: tx(`导入失败：${err.response?.data?.error || err.message}`, `Import failed: ${err.response?.data?.error || err.message}`, `インポートに失敗しました: ${err.response?.data?.error || err.message}`),
      });
    } finally {
      setIsImportingPlugin(false);
    }
  };

  const handleUploadZipPlugin = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      setIsImportingPlugin(true);
      setImportMessage(null);
      const formData = new FormData();
      formData.append('package', file);
      const res = await axios.post(`${BACKEND_URL}/api/plugins/install`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportMessage({
        type: 'success',
        text: tx(`插件 "${res.data.plugin.name}" 导入成功！`, `Plugin "${res.data.plugin.name}" imported successfully!`, `プラグイン "${res.data.plugin.name}" をインポートしました！`),
      });
      await fetchAll(false);
      setActiveTab('installed');
    } catch (err) {
      setImportMessage({
        type: 'error',
        text: tx(`压缩包导入失败：${err.response?.data?.error || err.message}`, `Zip import failed: ${err.response?.data?.error || err.message}`, `ZIP インポートに失敗しました: ${err.response?.data?.error || err.message}`),
      });
    } finally {
      setIsImportingPlugin(false);
    }
  };

  // Skill handlers
  const openInstalledSkill = async (skill) => {
    try {
      const res = await axios.get(`${BACKEND_URL}/api/skills/${encodeURIComponent(skill.id)}`);
      setSelectedSkill(res.data);
      setSkillContentDraft(res.data?.content || '');
      setIsEditingSkill(false);
      if (window.innerWidth < 768) {
        setIsMobileSkillListOpen(false);
      }
    } catch (err) {
      console.error('Failed to load skill:', err);
      setLoadError(ui.readFailed);
    }
  };

  const inspectOpenHubSkill = async (slug) => {
    try {
      setHubLoading(true);
      const res = await axios.get(`${BACKEND_URL}/api/skills/openhub/inspect/${encodeURIComponent(slug)}`);
      setSelectedSkill(res.data);
      setSkillContentDraft(res.data?.content || '');
      setIsEditingSkill(false);
      if (window.innerWidth < 768) {
        setIsMobileSkillListOpen(false);
      }
    } catch (err) {
      console.error('Failed to inspect OpenHub skill:', err);
      setLoadError(err.response?.data?.error || ui.inspectFailed);
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
      setLoadError(err.response?.data?.error || ui.searchFailed);
    } finally {
      setHubLoading(false);
    }
  };

  const installSkill = async (override = null) => {
    const nextSourceType = override?.sourceType || skillForm.sourceType;
    const nextSource = override?.source || skillForm.source;
    const nextName = override?.name || skillForm.name;
    const nextContent = override?.content || skillForm.content;

    try {
      setSkillsLoading(true);
      setLoadError('');
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

      setSkillForm((prev) => ({ ...EMPTY_SKILL_FORM, sourceType: prev.sourceType }));
      setIsInstallingSkill(false);
      await fetchSkills();
      if (installedSkill?.id) {
        await openInstalledSkill(installedSkill);
      }
      setNotice(tx('Skill 安装成功', 'Skill installed successfully', 'スキルをインストールしました'));
    } catch (err) {
      console.error('Failed to install skill:', err);
      setLoadError(err.response?.data?.error || ui.installFailed);
    } finally {
      setSkillsLoading(false);
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

  const handleDeleteSkill = async (skill) => {
    if (!window.confirm(ui.deleteConfirm(skill.name))) return;
    try {
      await axios.delete(`${BACKEND_URL}/api/skills/${encodeURIComponent(skill.id)}`);
      if (selectedSkill?.id === skill.id) {
        setSelectedSkill(null);
        setIsEditingSkill(false);
      }
      await fetchSkills();
    } catch (err) {
      console.error('Failed to delete skill:', err);
      setLoadError(ui.deleteFailed);
    }
  };

  const handleToggleSkillSafe = async (skill) => {
    try {
      const res = await axios.patch(`${BACKEND_URL}/api/skills/${encodeURIComponent(skill.id)}`, {
        enabled: !skill.enabled,
      });
      const updatedSkill = res.data?.skill;
      if (!updatedSkill) return;
      setSkills((prev) => prev.map((item) => (item.id === skill.id ? updatedSkill : item)));
      if (selectedSkill?.id === skill.id) {
        setSelectedSkill(updatedSkill);
      }
    } catch (err) {
      console.error('Failed to toggle skill:', err);
      setLoadError(err.response?.data?.error || ui.toggleFailed);
    }
  };

  const handleSaveSkillContent = async () => {
    if (!selectedSkill || selectedSkill.isRemote) return;
    try {
      await axios.post(`${BACKEND_URL}/api/skills`, {
        name: selectedSkill.name,
        content: skillContentDraft,
        description: selectedSkill.description,
        tags: selectedSkill.tags,
      });
      setSelectedSkill((prev) => (prev ? { ...prev, content: skillContentDraft } : prev));
      setIsEditingSkill(false);
      await fetchSkills();
      setNotice(tx(`Skill「${selectedSkill.name}」已保存`, `Skill "${selectedSkill.name}" saved`, `スキル「${selectedSkill.name}」を保存しました`));
    } catch (err) {
      console.error('Failed to save skill:', err);
      setLoadError(ui.overwriteFailed);
    }
  };

  // MCP handlers
  const applyMcpConfig = async (nextConfigObj, successMessage = '') => {
    const normalized = normalizeMcpConfigObject(nextConfigObj);
    setConfig?.((prev) => ({ ...prev, mcpConfig: normalized }));
    setMcpConfigText(JSON.stringify(normalized, null, 2));
    setMcpJsonError('');
    try {
      setIsSyncingMcp(true);
      await axios.post(`${BACKEND_URL}/api/mcp/config`, normalized);
      await Promise.all([fetchMcpData(), fetchPluginData(false)]);
      if (successMessage) setNotice(successMessage);
    } catch (err) {
      setLoadError(tx(`同步 MCP 服务失败：${err.response?.data?.error || err.message}`, `Failed to sync MCP servers: ${err.response?.data?.error || err.message}`, `MCP サービスの同期に失敗しました: ${err.response?.data?.error || err.message}`));
    } finally {
      setIsSyncingMcp(false);
    }
  };

  const handleMcpJsonChange = (value) => {
    setMcpConfigText(value);
    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setMcpJsonError(tx('根节点必须是 JSON 对象，例如 { "mcpServers": {} }', 'Root must be a JSON object such as { "mcpServers": {} }', 'ルートは { "mcpServers": {} } のような JSON オブジェクトである必要があります'));
        return;
      }
      setMcpJsonError('');
      const normalized = normalizeMcpConfigObject(parsed);
      setConfig?.((prev) => ({ ...prev, mcpConfig: normalized }));
    } catch (err) {
      setMcpJsonError(err.message);
    }
  };

  const handleSaveMcpJson = async () => {
    try {
      const parsed = JSON.parse(mcpConfigText);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setMcpJsonError(tx('根节点必须是 JSON 对象', 'Root must be a JSON object', 'ルートは JSON オブジェクトである必要があります'));
        return;
      }
      await applyMcpConfig(
        parsed,
        tx('MCP 配置已保存并同步连接', 'MCP config saved and synced', 'MCP 設定を保存して接続を同期しました')
      );
    } catch (err) {
      setMcpJsonError(err.message);
    }
  };

  const startCreateMcpServer = () => {
    setMcpServerForm(EMPTY_MCP_SERVER_FORM);
    setIsEditingMcpServer(true);
  };

  const startEditMcpServer = (serverName, serverDef) => {
    const isUrl = Boolean(serverDef?.url) && !serverDef?.command;
    setMcpServerForm({
      originalName: serverName,
      name: serverName,
      transport: isUrl ? 'url' : 'stdio',
      command: serverDef?.command || '',
      argsText: formatArgsInput(serverDef?.args),
      url: serverDef?.url || '',
      envText: formatEnvInput(serverDef?.env),
    });
    setIsEditingMcpServer(true);
  };

  const handleSaveMcpServerForm = async () => {
    const trimmedName = mcpServerForm.name.trim();
    if (!trimmedName) return;

    const current = normalizeMcpConfigObject(config?.mcpConfig);
    const nextServers = { ...current.mcpServers };
    const prevDef = mcpServerForm.originalName ? (nextServers[mcpServerForm.originalName] || {}) : {};
    if (mcpServerForm.originalName && mcpServerForm.originalName !== trimmedName) {
      delete nextServers[mcpServerForm.originalName];
    }

    const parsedEnv = parseEnvInput(mcpServerForm.envText);
    let nextDef;
    if (mcpServerForm.transport === 'url') {
      const { command, args, ...rest } = prevDef;
      nextDef = {
        ...rest,
        url: mcpServerForm.url.trim(),
        ...(Object.keys(parsedEnv).length > 0 ? { env: parsedEnv } : {}),
      };
      if (Object.keys(parsedEnv).length === 0) delete nextDef.env;
    } else {
      const { url, ...rest } = prevDef;
      const args = parseArgsInput(mcpServerForm.argsText);
      nextDef = {
        ...rest,
        command: mcpServerForm.command.trim(),
        args,
        ...(Object.keys(parsedEnv).length > 0 ? { env: parsedEnv } : {}),
      };
      if (Object.keys(parsedEnv).length === 0) delete nextDef.env;
    }

    nextServers[trimmedName] = nextDef;
    setIsEditingMcpServer(false);
    setMcpServerForm(EMPTY_MCP_SERVER_FORM);
    await applyMcpConfig(
      { ...current, mcpServers: nextServers },
      tx(`MCP 服务「${trimmedName}」已保存并同步`, `MCP server "${trimmedName}" saved and synced`, `MCP サービス「${trimmedName}」を保存して同期しました`)
    );
  };

  const handleDeleteMcpServer = async (serverName) => {
    if (!window.confirm(tx(`确定移除自定义 MCP 服务 "${serverName}" 吗？`, `Remove custom MCP server "${serverName}"?`, `カスタム MCP サービス "${serverName}" を削除しますか？`))) {
      return;
    }
    const current = normalizeMcpConfigObject(config?.mcpConfig);
    const nextServers = { ...current.mcpServers };
    delete nextServers[serverName];
    await applyMcpConfig(
      { ...current, mcpServers: nextServers },
      tx(`已移除 MCP 服务「${serverName}」`, `Removed MCP server "${serverName}"`, `MCP サービス「${serverName}」を削除しました`)
    );
  };

  // Filtered collections & MCP summaries
  const filteredCatalog = useMemo(() => catalog.filter((item) => {
    if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;
    if (!pluginSearch.trim()) return true;
    const q = pluginSearch.toLowerCase();
    return `${item.name} ${item.description} ${(item.tags || []).join(' ')}`.toLowerCase().includes(q);
  }), [catalog, selectedCategory, pluginSearch]);

  const filteredInstalledPlugins = useMemo(() => installedPlugins.filter((item) => {
    if (!pluginSearch.trim()) return true;
    const q = pluginSearch.toLowerCase();
    return `${item.name} ${item.description} ${item.id}`.toLowerCase().includes(q);
  }), [installedPlugins, pluginSearch]);

  const filteredSkills = useMemo(() => skills.filter((skill) =>
    !skillSearch ||
    skill.name?.toLowerCase().includes(skillSearch.toLowerCase()) ||
    skill.description?.toLowerCase().includes(skillSearch.toLowerCase()) ||
    skill.sourceMeta?.slug?.toLowerCase().includes(skillSearch.toLowerCase()) ||
    skill.sourceMeta?.pluginName?.toLowerCase().includes(skillSearch.toLowerCase())
  ), [skills, skillSearch]);

  const customMcpServers = useMemo(() => {
    const servers = normalizeMcpConfigObject(config?.mcpConfig).mcpServers;
    return Object.entries(servers);
  }, [config?.mcpConfig]);

  const pluginMcpEntries = useMemo(() => {
    const entries = [];
    for (const plugin of installedPlugins) {
      if (!plugin.enabled) continue;
      const serverList = plugin.mcpStatus?.servers || (plugin.mcpServerNames || []).map((name) => ({
        name,
        connected: mcpStatus[name]?.connected === true,
        toolCount: mcpStatus[name]?.toolCount || 0,
        error: mcpStatus[name]?.error,
      }));
      for (const server of serverList) {
        entries.push({
          ...server,
          pluginId: plugin.id,
          pluginName: plugin.name,
        });
      }
    }
    return entries;
  }, [installedPlugins, mcpStatus]);

  const totalMcpCount = customMcpServers.length + pluginMcpEntries.length;
  const connectedMcpCount = useMemo(() => {
    const names = new Set([
      ...customMcpServers.map(([name]) => name),
      ...pluginMcpEntries.map((item) => item.name),
    ]);
    let connected = 0;
    for (const name of names) {
      if (mcpStatus[name]?.connected) connected += 1;
    }
    return connected;
  }, [customMcpServers, pluginMcpEntries, mcpStatus]);

  if (!isOpen) return null;

  const selectedSkillMeta = selectedSkill?.sourceMeta || {};
  const selectedIsRemote = Boolean(selectedSkill?.isRemote);
  const isLoading = pluginsLoading || skillsLoading || isSyncingMcp;

  const renderImportPanel = () => (
    <div className="mb-5 bg-[var(--surface-bg-light)] rounded-2xl border border-[var(--accent-border)] p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[var(--accent-text)] font-bold text-sm">
            <FolderOpen size={17} />
            <span>{tx('从本地目录或 Zip 包导入插件', 'Import plugin from local directory or Zip', 'ローカルフォルダーまたは Zip からプラグインをインポート')}</span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
            {tx('输入包含', 'Enter the absolute path of a folder containing')} <code className="bg-[var(--surface-inset)] px-1.5 py-0.5 rounded text-[var(--accent-text)]">plugin.json</code> {tx('的绝对路径，或直接上传插件压缩包，系统将自动装载 MCP 与专属技能。', ', or upload a zip package. MCP servers and bundled skills will be loaded automatically.', ' を含むフォルダーの絶対パスを入力するか、Zip パッケージをアップロードしてください。')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowImportPanel(false)}
          className="p-1.5 rounded-xl hover:bg-[var(--surface-inset)] text-[var(--text-secondary)]"
          aria-label={tx('收起导入面板', 'Close import panel')}
        >
          <X size={15} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={localPluginPath}
          onChange={(e) => setLocalPluginPath(e.target.value)}
          placeholder={tx('例如: D:\\my-dev-plugins\\custom-data-tool', 'e.g. D:\\my-dev-plugins\\custom-data-tool', '例: D:\\my-dev-plugins\\custom-data-tool')}
          className="flex-1 min-w-[220px] px-3.5 py-2 text-xs bg-[var(--input-bg)] border border-[var(--surface-border-subtle)] rounded-xl focus:outline-none"
        />
        <button
          type="button"
          onClick={handleImportLocalPlugin}
          disabled={isImportingPlugin || !localPluginPath.trim()}
          className="px-4 py-2 text-xs bg-saki-pink hover:bg-saki-pink-hover disabled:opacity-50 text-white font-semibold rounded-xl transition-colors shrink-0"
        >
          {isImportingPlugin ? tx('导入中...', 'Importing...', 'インポート中...') : tx('导入路径', 'Import path', 'パスから導入')}
        </button>
        <input
          ref={zipInputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={handleUploadZipPlugin}
        />
        <button
          type="button"
          onClick={() => zipInputRef.current?.click()}
          disabled={isImportingPlugin}
          className="px-3.5 py-2 text-xs bg-[var(--surface-bg)] hover:bg-[var(--surface-bg-hover)] border border-[var(--surface-border-subtle)] text-[var(--text-dark)] font-medium rounded-xl transition-colors inline-flex items-center gap-1.5 shrink-0"
        >
          <Upload size={13} />
          {tx('上传 Zip', 'Upload Zip', 'Zip をアップロード')}
        </button>
      </div>

      {importMessage && (
        <div className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${importMessage.type === 'success' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'}`}>
          {importMessage.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          <span>{importMessage.text}</span>
        </div>
      )}

      <pre className="p-3 bg-[var(--surface-inset)] rounded-xl text-[11px] font-mono text-[var(--text-secondary)] overflow-x-auto border border-[var(--surface-border-subtle)]">
{tx(`my-plugin/
├── plugin.json         # 必须：声明 id、name、configSchema 与 mcp 配置
├── mcp.json            # 可选：独立声明 MCP 服务
└── skills/             # 可选：附带的专属工作流技能
    └── pr-review/
        └── SKILL.md    # 技能提示词与规范`,
`my-plugin/
├── plugin.json         # required: declares id, name, configSchema and mcp config
├── mcp.json            # optional: declares MCP servers separately
└── skills/             # optional: bundled dedicated workflow skills
    └── pr-review/
        └── SKILL.md    # skill prompt and guidelines`,
`my-plugin/
├── plugin.json         # 必須：id、name、configSchema、mcp 設定を宣言
├── mcp.json            # 任意：MCP サービスを個別に宣言
└── skills/             # 任意：付属の専用ワークフロースキル
    └── pr-review/
        └── SKILL.md    # スキルのプロンプトと仕様`)}
      </pre>
    </div>
  );

  return (
    <motion.div
      className={windowed ? 'h-full w-full' : 'fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-md p-0 sm:p-4'}
      {...(!windowed ? modalBackdropMotion : {})}
      onClick={!windowed ? onClose : undefined}
    >
      <motion.div
        data-saki-dialog="true"
        className={windowed
          ? 'bg-[var(--surface-bg)] rounded-[28px] w-full h-full shadow-none overflow-hidden flex flex-col text-[var(--text-dark)]'
          : 'bg-[var(--surface-bg)] sm:rounded-3xl w-full max-w-6xl shadow-2xl overflow-hidden flex flex-col h-full sm:h-[86vh] text-[var(--text-dark)]'}
        {...(!windowed ? modalPanelMotion : {})}
        onClick={!windowed ? (e) => e.stopPropagation() : undefined}
      >
        {/* Header */}
        <div className="px-5 py-3 border-b border-[var(--surface-border-subtle)] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[var(--primary-light)] text-[var(--accent-text)] border border-[var(--accent-border)] flex items-center justify-center shrink-0">
              <Boxes size={19} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-sm sm:text-base leading-tight truncate">
                  {tx('扩展中心', 'Extension Hub', '拡張ハブ')}
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--primary-light)] text-[var(--accent-text)] border border-[var(--accent-border)] font-semibold tracking-wide">
                  Plugins · Skills · MCP
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 truncate">
                {tx('插件市场、Skill 技能与 MCP 服务统一管理，一键武装 Agent 能力', 'Manage marketplace plugins, Skills, and MCP servers in one unified hub', 'プラグインマーケット・スキル・MCP サーバーを一元管理')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-[var(--surface-inset)] p-1 rounded-xl border border-[var(--surface-border-subtle)] text-xs font-medium overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveTab('marketplace')}
                className={`px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${activeTab === 'marketplace' ? 'bg-[var(--surface-bg-strong)] text-[var(--accent-text)] shadow-sm font-semibold' : 'text-[var(--text-secondary)] hover:text-[var(--text-dark)]'}`}
              >
                {tx('插件市场', 'Marketplace', 'マーケット')}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('installed')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'installed' ? 'bg-[var(--surface-bg-strong)] text-[var(--accent-text)] shadow-sm font-semibold' : 'text-[var(--text-secondary)] hover:text-[var(--text-dark)]'}`}
              >
                {tx('已安装', 'Installed', '導入済み')}
                {installedPlugins.length > 0 && (
                  <span className="px-1.5 py-0.2 bg-[var(--primary-light)] text-[var(--accent-text)] text-[10px] rounded-full font-bold">
                    {installedPlugins.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('skills')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'skills' ? 'bg-[var(--surface-bg-strong)] text-[var(--accent-text)] shadow-sm font-semibold' : 'text-[var(--text-secondary)] hover:text-[var(--text-dark)]'}`}
              >
                {tx('Skills 技能', 'Skills', 'スキル')}
                {skills.length > 0 && (
                  <span className="px-1.5 py-0.2 bg-[var(--primary-light)] text-[var(--accent-text)] text-[10px] rounded-full font-bold">
                    {skills.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('mcp')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'mcp' ? 'bg-[var(--surface-bg-strong)] text-[var(--accent-text)] shadow-sm font-semibold' : 'text-[var(--text-secondary)] hover:text-[var(--text-dark)]'}`}
              >
                {tx('MCP 服务', 'MCP', 'MCP')}
                {totalMcpCount > 0 && (
                  <span className="px-1.5 py-0.2 bg-[var(--primary-light)] text-[var(--accent-text)] text-[10px] rounded-full font-bold">
                    {connectedMcpCount}/{totalMcpCount}
                  </span>
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={() => fetchAll(true)}
              disabled={isLoading || Boolean(installingPluginId)}
              title={tx('刷新全部数据', 'Refresh all data', 'すべて更新')}
              className="p-2 hover:bg-[var(--surface-inset)] rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-dark)] transition-colors"
            >
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-[var(--surface-inset)] rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-dark)] transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Plugin Sub-Toolbar (for Marketplace & Installed) */}
        {(activeTab === 'marketplace' || activeTab === 'installed') && (
          <div className="px-5 py-2.5 border-b border-[var(--surface-border-subtle)] bg-[var(--surface-bg-light)] flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 max-w-full">
              {activeTab === 'marketplace' && CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`text-xs px-3 py-1.5 rounded-full transition-all whitespace-nowrap ${selectedCategory === cat.id ? 'bg-saki-pink text-white font-medium shadow-sm' : 'bg-[var(--surface-inset)] text-[var(--text-secondary)] hover:bg-[var(--surface-bg-hover)] hover:text-[var(--text-dark)]'}`}
                >
                  {tx(cat.label, cat.en, cat.ja)}
                </button>
              ))}
              {activeTab === 'installed' && (
                <span className="text-xs text-[var(--text-secondary)]">
                  {tx(`共 ${installedPlugins.length} 个已安装插件`, `${installedPlugins.length} installed plugins`, `${installedPlugins.length} 個のプラグインを導入済み`)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:min-w-[220px]">
                <label htmlFor={searchInputId} className="sr-only">{tx('搜索插件', 'Search plugins', 'プラグインを検索')}</label>
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                <input
                  id={searchInputId}
                  type="text"
                  value={pluginSearch}
                  onChange={(e) => setPluginSearch(e.target.value)}
                  placeholder={activeTab === 'marketplace' ? tx('搜索市场插件、能力或标签...', 'Search marketplace plugins, capabilities or tags...', 'プラグイン・機能・タグを検索...') : tx('搜索已安装插件...', 'Search installed plugins...', '導入済みプラグインを検索...')}
                  className="w-full pl-8 pr-4 py-1.5 text-xs border rounded-xl focus:outline-none transition-colors"
                />
              </div>

              <button
                type="button"
                onClick={() => setShowImportPanel((v) => !v)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors inline-flex items-center gap-1.5 shrink-0 ${showImportPanel ? 'bg-[var(--primary-light)] text-[var(--accent-text)] border-[var(--accent-border)]' : 'bg-[var(--surface-bg)] text-[var(--text-dark)] border-[var(--surface-border-subtle)] hover:bg-[var(--surface-bg-hover)]'}`}
              >
                <FolderOpen size={14} />
                {tx('本地导入', 'Import local', 'ローカル導入')}
              </button>
            </div>
          </div>
        )}

        {/* Global Alert / Notice Strip */}
        {(loadError || notice) && activeTab !== 'skills' && (
          <div className="px-5 pt-3 shrink-0 space-y-2">
            {loadError && (
              <div role="alert" className="rounded-xl bg-red-500/10 border border-red-500/20 px-3.5 py-2.5 text-xs text-red-600 dark:text-red-400 flex items-center justify-between gap-2">
                <span>{loadError}</span>
                <button type="button" onClick={() => setLoadError('')} className="opacity-70 hover:opacity-100"><X size={14} /></button>
              </div>
            )}
            {notice && (
              <div role="status" className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-2.5 text-xs text-emerald-600 dark:text-emerald-400 flex items-center justify-between gap-2">
                <span>{notice}</span>
                <button type="button" onClick={() => setNotice('')} className="opacity-70 hover:opacity-100"><X size={14} /></button>
              </div>
            )}
          </div>
        )}

        {/* Main Body */}
        {activeTab === 'marketplace' && (
          <div className="flex-1 min-h-0 overflow-y-auto p-5">
            {showImportPanel && renderImportPanel()}

            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-secondary)]">
              <span>{pluginsLoading ? tx('正在加载插件目录…', 'Loading plugin catalog…', 'プラグインカタログを読み込み中…') : tx(`共 ${catalog.length} 个插件，安装后自动装载对应的 MCP 与 Skill`, `${catalog.length} plugins available — installing equips bundled MCP & Skills`, `全 ${catalog.length} 個のプラグイン。導入すると対応する MCP とスキルが自動で有効になります`)}</span>
              <a href="https://github.com/EthanChan050430/saki-plugins" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[var(--accent-text)] hover:underline">
                {tx('saki-plugins 仓库', 'saki-plugins repository', 'saki-plugins リポジトリ')} <ExternalLink size={12} />
              </a>
            </div>

            {sourceStatus?.error && (
              <p role="alert" className="mb-4 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-600 dark:text-amber-400">
                {sourceStatus.error}{tx('。', '. ')}{sourceStatus.stale ? tx('当前显示上次成功同步的目录。', 'Showing the last successfully synced catalog. ', '前回の同期に成功したカタログを表示しています。') : tx('内置插件仍可安装。', 'Built-in plugins can still be installed. ', '内蔵プラグインは引き続きインストールできます。')}{tx('可点击刷新重试。', 'Click refresh to retry.', 'クリックして再試行できます。')}
              </p>
            )}

            {filteredCatalog.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-[var(--text-tertiary)]">
                <Boxes size={48} className="stroke-[1.2] opacity-40 mb-3" />
                <p className="text-sm">{tx('未找到符合条件的市场插件', 'No matching marketplace plugins found', '条件に合うマーケットプラグインが見つかりません')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredCatalog.map((plugin) => {
                  const IconComp = getCategoryIcon(plugin.category, plugin.icon);
                  return (
                    <div
                      key={plugin.id}
                      className="bg-[var(--surface-bg-light)] rounded-2xl border border-[var(--surface-border-subtle)] hover:border-[var(--accent-border)] p-5 flex flex-col justify-between hover:shadow-md transition-all"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="w-11 h-11 rounded-xl bg-[var(--primary-light)] text-[var(--accent-text)] border border-[var(--accent-border)] flex items-center justify-center shrink-0">
                            <IconComp size={22} />
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {plugin.isInstalled ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                                <Check size={12} />
                                {tx('已安装', 'Installed', '導入済み')}
                              </span>
                            ) : (
                              <span className="text-[10px] text-[var(--text-tertiary)] bg-[var(--surface-inset)] border border-[var(--surface-border-subtle)] px-2 py-0.5 rounded-md">
                                v{plugin.version}
                              </span>
                            )}
                          </div>
                        </div>

                        <h4 className="font-bold text-sm text-[var(--text-dark)] leading-snug">{plugin.name}</h4>
                        <span className="mt-1 inline-block text-[10px] text-[var(--accent-text)] font-medium">
                          {plugin.source === 'github' ? 'GitHub · saki-plugins' : tx('内置插件', 'Built-in', '内蔵プラグイン')}
                        </span>
                        <p className="text-xs text-[var(--text-secondary)] mt-1.5 line-clamp-2 leading-relaxed">
                          {plugin.description}
                        </p>

                        <div className="mt-4 space-y-1.5 bg-[var(--surface-inset)] rounded-xl p-2.5 border border-[var(--surface-border-subtle)] text-[11px]">
                          <div className="flex items-center gap-1.5 text-[var(--accent-text)] font-medium truncate">
                            <Cpu size={13} className="shrink-0" />
                            <span className="truncate">
                              {(plugin.mcpServersSummary ? tx('MCP 服务', 'MCP services', 'MCP サービス') : tx('MCP 工具', 'MCP tools', 'MCP ツール'))}: {(plugin.mcpServersSummary || plugin.mcpToolsSummary)?.join(', ') || tx('无', 'None', 'なし')}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium truncate">
                            <Wrench size={13} className="shrink-0" />
                            <span className="truncate">{tx('专属技能:', 'Skills:')} {plugin.skillsSummary?.join(', ') || tx('无', 'None', 'なし')}</span>
                          </div>
                        </div>

                        {plugin.requirements?.length > 0 && (
                          <p className="mt-2 text-[11px] text-[var(--text-tertiary)]">
                            {tx('运行依赖：', 'Requirements: ')}{plugin.requirements.join(tx('、', ', '))}
                          </p>
                        )}
                        {plugin.sourceUrl && (
                          <a href={plugin.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11px] text-[var(--accent-text)] hover:underline">
                            {tx('查看源码', 'View source', 'ソースを表示')} <ExternalLink size={11} />
                          </a>
                        )}
                      </div>

                      <div className="mt-5 pt-3 border-t border-[var(--surface-border-subtle)] flex items-center justify-between gap-2">
                        <span className="text-[11px] text-[var(--text-tertiary)] truncate">{tx('作者:', 'By:')} {plugin.author}</span>

                        {plugin.isInstalled ? (
                          <button
                            type="button"
                            onClick={() => (plugin.configSchema && Object.keys(plugin.configSchema).length > 0 ? openPluginConfigModal(plugin) : setActiveTab('installed'))}
                            className="text-xs px-3 py-1.5 rounded-xl border border-[var(--surface-border-subtle)] bg-[var(--surface-bg)] hover:bg-[var(--surface-bg-hover)] text-[var(--text-dark)] font-medium transition-colors flex items-center gap-1"
                          >
                            <Settings size={13} />
                            {plugin.configSchema && Object.keys(plugin.configSchema).length > 0 ? tx('配置', 'Configure', '設定') : tx('管理', 'Manage', '管理')}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleMarketplaceInstall(plugin)}
                            disabled={pluginsLoading || Boolean(installingPluginId)}
                            className="text-xs px-3 py-1.5 rounded-xl bg-saki-pink hover:bg-saki-pink-hover disabled:opacity-50 disabled:cursor-wait text-white font-semibold transition-colors flex items-center gap-1 shadow-sm"
                          >
                            {installingPluginId === plugin.id ? <RefreshCw size={13} className="animate-spin" /> : <Download size={13} />}
                            {installingPluginId === plugin.id
                              ? tx('下载安装中…', 'Installing…', '導入中…')
                              : plugin.source === 'github'
                                ? tx('下载安装', 'Install', 'ダウンロード')
                                : tx('一键安装', 'One-click install', 'ワンクリック導入')}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'installed' && (
          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3">
            {showImportPanel && renderImportPanel()}

            {filteredInstalledPlugins.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-[var(--text-tertiary)]">
                <Boxes size={48} className="stroke-[1.2] opacity-40 mb-3" />
                <p className="text-sm">{tx('暂无已安装插件', 'No plugins installed yet', 'インストール済みのプラグインはありません')}</p>
                <button
                  type="button"
                  onClick={() => setActiveTab('marketplace')}
                  className="mt-3 text-xs text-[var(--accent-text)] font-semibold hover:underline flex items-center gap-1"
                >
                  {tx('前往插件市场浏览安装', 'Browse the marketplace to install', 'マーケットプレイスで探してインストール')} <ArrowRight size={13} />
                </button>
              </div>
            ) : (
              filteredInstalledPlugins.map((plugin) => {
                const isEnabled = plugin.enabled;
                const isMissingConfig = plugin.status === 'missing_config';
                const IconComp = getCategoryIcon(plugin.category, plugin.icon);
                const mcpServerCount = plugin.mcpStatus?.servers?.length || 0;
                const mcpToolCount = plugin.mcpStatus?.toolCount || 0;

                return (
                  <div
                    key={plugin.id}
                    className="bg-[var(--surface-bg-light)] rounded-2xl border border-[var(--surface-border-subtle)] p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-4 min-w-0">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${isEnabled ? 'bg-[var(--primary-light)] text-[var(--accent-text)] border-[var(--accent-border)]' : 'bg-[var(--surface-inset)] text-[var(--text-tertiary)] border-[var(--surface-border-subtle)]'}`}>
                        <IconComp size={24} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-bold text-sm text-[var(--text-dark)] truncate">{plugin.name}</h4>
                          <span className="text-[10px] text-[var(--text-tertiary)] bg-[var(--surface-inset)] border border-[var(--surface-border-subtle)] px-2 py-0.5 rounded">
                            v{plugin.version}
                          </span>
                          {isMissingConfig ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                              <AlertCircle size={11} /> {tx('待配置', 'Needs setup', '設定待ち')}
                            </span>
                          ) : isEnabled ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                              <CheckCircle2 size={11} /> {tx('运行中', 'Running', '実行中')}
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-[var(--text-tertiary)] bg-[var(--surface-inset)] border border-[var(--surface-border-subtle)] px-2 py-0.5 rounded-full">
                              {tx('已停用', 'Disabled', '無効')}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-1">{plugin.description}</p>

                        <div className="flex flex-wrap items-center gap-2.5 mt-2.5 text-[11px] text-[var(--text-tertiary)]">
                          <span>ID: <code className="text-[var(--accent-text)] font-mono">{plugin.id}</code></span>
                          <span>•</span>
                          <button
                            type="button"
                            onClick={() => setActiveTab('mcp')}
                            className="hover:text-[var(--accent-text)] transition-colors"
                          >
                            {tx('MCP 服务:', 'MCP:')} {plugin.hasMcp
                              ? (mcpServerCount > 0
                                  ? tx(`${mcpServerCount} 个 · ${mcpToolCount} 工具`, `${mcpServerCount} server(s) · ${mcpToolCount} tools`, `${mcpServerCount} 件 · ${mcpToolCount} ツール`)
                                  : tx('已注入', 'Injected', '注入済み'))
                              : tx('无', 'None', 'なし')}
                          </button>
                          <span>•</span>
                          <button
                            type="button"
                            onClick={() => setActiveTab('skills')}
                            className="hover:text-[var(--accent-text)] transition-colors"
                          >
                            {tx('专属技能:', 'Skills:')} {plugin.skillsCount} {tx('个', '', '個')}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                      {plugin.configSchema && Object.keys(plugin.configSchema).length > 0 && (
                        <button
                          type="button"
                          onClick={() => openPluginConfigModal(plugin)}
                          className="px-3 py-2 bg-[var(--surface-bg)] hover:bg-[var(--surface-bg-hover)] rounded-xl text-[var(--text-dark)] border border-[var(--surface-border-subtle)] transition-colors flex items-center gap-1.5 text-xs font-medium"
                          title={tx('配置插件参数', 'Configure plugin parameters', 'プラグインのパラメータを設定')}
                        >
                          <Settings size={14} />
                          <span>{tx('配置', 'Configure', '設定')}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleTogglePlugin(plugin.id, plugin.enabled)}
                        className={`px-3 py-2 rounded-xl border transition-colors flex items-center gap-1.5 text-xs font-medium ${isEnabled ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/25 bg-emerald-500/10 hover:bg-emerald-500/15' : 'text-[var(--text-secondary)] border-[var(--surface-border-subtle)] bg-[var(--surface-bg)] hover:bg-[var(--surface-bg-hover)]'}`}
                        title={isEnabled ? tx('停用插件', 'Disable plugin', 'プラグインを無効化') : tx('启用插件', 'Enable plugin', 'プラグインを有効化')}
                      >
                        {isEnabled ? <Power size={14} /> : <PowerOff size={14} />}
                        <span>{isEnabled ? tx('已启用', 'Enabled', '有効') : tx('已停用', 'Disabled', '無効')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleUninstallPlugin(plugin.id, plugin.name)}
                        className="p-2 hover:bg-red-500/10 text-[var(--text-tertiary)] hover:text-red-500 rounded-xl border border-[var(--surface-border-subtle)] bg-[var(--surface-bg)] transition-colors"
                        title={tx('卸载插件', 'Uninstall plugin', 'プラグインをアンインストール')}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'skills' && (
          <div className="flex-1 min-h-0 flex flex-col md:flex-row">
            <div className={`${isMobileSkillListOpen ? 'flex' : 'hidden'} md:flex w-full md:w-[390px] border-b md:border-b-0 md:border-r border-[var(--surface-border-subtle)] flex-col min-h-0 bg-[var(--surface-bg-light)]`}>
              <div className="p-3.5 border-b border-[var(--surface-border-subtle)] space-y-2.5">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={14} />
                  <input
                    value={skillSearch}
                    onChange={(e) => setSkillSearch(e.target.value)}
                    placeholder={ui.searchInstalledPlaceholder}
                    className="w-full pl-9 pr-3 py-1.5 rounded-xl border text-xs sm:text-sm outline-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsInstallingSkill((v) => !v);
                      setSelectedSkill(null);
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-saki-pink hover:bg-saki-pink-hover text-white text-xs sm:text-sm font-semibold transition-colors shadow-sm"
                  >
                    <Plus size={15} />
                    {ui.installSkill}
                  </button>
                  <button
                    type="button"
                    onClick={fetchSkills}
                    className="px-3 py-2 rounded-xl bg-[var(--surface-bg)] border border-[var(--surface-border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-dark)] hover:border-[var(--accent-border)] transition-colors"
                    title={ui.refresh}
                  >
                    <RefreshCw size={15} />
                  </button>
                </div>
              </div>

              {isInstallingSkill && (
                <div className="p-4 border-b border-[var(--surface-border-subtle)] bg-[var(--surface-bg)] space-y-3 overflow-y-auto max-h-[55vh]">
                  <div className="flex gap-1.5 flex-wrap">
                    {['openhub', 'git', 'local', 'manual'].map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setSkillForm((prev) => ({ ...prev, sourceType: type }))}
                        className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                          skillForm.sourceType === type
                            ? 'bg-saki-pink text-white'
                            : 'bg-[var(--surface-inset)] text-[var(--text-secondary)] hover:text-[var(--text-dark)]'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>

                  {skillForm.sourceType === 'openhub' && (
                    <div className="space-y-2.5 rounded-2xl border border-[var(--accent-border)] bg-[var(--primary-light)] p-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-[var(--accent-text)]">
                        <Globe size={15} />
                        {ui.openhubInstallTitle}
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
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
                          className="flex-1 px-3 py-1.5 rounded-xl border text-xs outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => searchOpenHub()}
                          disabled={hubLoading}
                          className="px-3 py-1.5 rounded-xl bg-[var(--code-bg)] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-60"
                        >
                          {ui.search}
                        </button>
                      </div>
                      <input
                        value={skillForm.source}
                        onChange={(e) => setSkillForm((prev) => ({ ...prev, source: e.target.value }))}
                        placeholder={ui.openhubSlugPlaceholder}
                        className="w-full px-3 py-1.5 rounded-xl border text-xs outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => installSkill()}
                        disabled={skillsLoading || !skillForm.source.trim()}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-saki-pink hover:bg-saki-pink-hover text-white text-xs font-semibold transition-colors disabled:opacity-60"
                      >
                        <Download size={14} />
                        {ui.installViaOpenHub}
                      </button>

                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {hubLoading ? (
                          <div className="text-xs text-[var(--text-tertiary)] py-3 text-center">{ui.searchingOpenHub}</div>
                        ) : hubResults.length === 0 ? (
                          <div className="text-xs text-[var(--text-tertiary)] py-3 text-center">{ui.noOpenhubResults}</div>
                        ) : (
                          hubResults.map((skill) => (
                            <div key={skill.slug} className="rounded-xl border border-[var(--surface-border-subtle)] bg-[var(--surface-bg-strong)] p-2.5">
                              <div className="flex items-start justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() => inspectOpenHubSkill(skill.slug)}
                                  className="min-w-0 text-left"
                                >
                                  <div className="text-xs font-bold text-[var(--text-dark)] truncate">{skill.name}</div>
                                  <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5 truncate">{skill.slug}</div>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => installOpenHubSlug(skill.slug)}
                                  disabled={skillsLoading}
                                  className="shrink-0 px-2.5 py-1 rounded-lg bg-saki-pink hover:bg-saki-pink-hover text-white text-[11px] font-semibold disabled:opacity-60"
                                >
                                  {installingSlug === skill.slug ? ui.installing : ui.installSkill}
                                </button>
                              </div>
                              <div className="mt-1.5 text-[10px] text-[var(--text-secondary)]">
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

                  {skillForm.sourceType === 'manual' && (
                    <>
                      <input
                        value={skillForm.name}
                        onChange={(e) => setSkillForm((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder={ui.skillNamePlaceholder}
                        className="w-full px-3 py-2 rounded-xl border text-xs outline-none"
                      />
                      <textarea
                        value={skillForm.content}
                        onChange={(e) => setSkillForm((prev) => ({ ...prev, content: e.target.value }))}
                        placeholder={ui.skillContentPlaceholder}
                        className="w-full h-28 px-3 py-2 rounded-xl border text-xs outline-none resize-none font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => installSkill()}
                        disabled={skillsLoading || !skillForm.name.trim() || !skillForm.content.trim()}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-saki-pink hover:bg-saki-pink-hover text-white text-xs font-semibold transition-colors disabled:opacity-60"
                      >
                        <Save size={14} />
                        {ui.saveSkill}
                      </button>
                    </>
                  )}

                  {(skillForm.sourceType === 'git' || skillForm.sourceType === 'local') && (
                    <>
                      <input
                        value={skillForm.source}
                        onChange={(e) => setSkillForm((prev) => ({ ...prev, source: e.target.value }))}
                        placeholder={skillForm.sourceType === 'git' ? ui.gitPlaceholder : ui.localPlaceholder}
                        className="w-full px-3 py-2 rounded-xl border text-xs outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => installSkill()}
                        disabled={skillsLoading || !skillForm.source.trim()}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-saki-pink hover:bg-saki-pink-hover text-white text-xs font-semibold transition-colors disabled:opacity-60"
                      >
                        <Download size={14} />
                        {ui.installSkill}
                      </button>
                    </>
                  )}
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
                {skillsLoading ? (
                  <div className="text-xs text-[var(--text-tertiary)] text-center py-10">{ui.loading}</div>
                ) : filteredSkills.length === 0 ? (
                  <div className="text-xs text-[var(--text-tertiary)] text-center py-10">{ui.noInstalledSkills}</div>
                ) : (
                  filteredSkills.map((skill) => {
                    const isSelected = selectedSkill?.id === skill.id;
                    return (
                      <div
                        key={skill.id}
                        className={`bg-[var(--surface-bg)] border rounded-2xl p-3.5 space-y-2.5 transition-all ${isSelected ? 'border-[var(--accent-border)] shadow-sm ring-1 ring-[var(--accent-border)]' : 'border-[var(--surface-border-subtle)] hover:border-[var(--accent-border)]'} ${skill.enabled ? '' : 'opacity-70'}`}
                      >
                        <button type="button" className="w-full text-left" onClick={() => openInstalledSkill(skill)}>
                          <div className="flex items-start justify-between gap-2.5">
                            <div className="min-w-0">
                              <div className="font-bold text-xs sm:text-sm text-[var(--text-dark)] truncate">{skill.name}</div>
                              <div className="text-[11px] text-[var(--text-tertiary)] mt-0.5 truncate">
                                {skill.sourceType}
                                {skill.sourceMeta?.pluginName ? ` · ${skill.sourceMeta.pluginName}` : skill.sourceMeta?.slug ? ` · ${skill.sourceMeta.slug}` : ''}
                              </div>
                            </div>
                            <BookOpen size={15} className="text-[var(--accent-text)] shrink-0 mt-0.5" />
                          </div>
                          <p className="mt-1.5 text-xs text-[var(--text-secondary)] line-clamp-2">{skill.description || skill.preview}</p>
                        </button>
                        <div className="flex items-center justify-between pt-0.5 gap-2">
                          <div className="flex gap-1 flex-wrap">
                            {skill.isDefault && (
                              <span className="px-2 py-0.5 rounded-full bg-[var(--surface-inset)] text-[var(--text-dark)] text-[10px] font-semibold">
                                {ui.default}
                              </span>
                            )}
                            {skill.sourceType === 'plugin' && (
                              <span className="px-2 py-0.5 rounded-full bg-[var(--primary-light)] text-[var(--accent-text)] text-[10px] font-semibold">
                                {tx('插件内置', 'Plugin')}
                              </span>
                            )}
                            {!skill.enabled && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-semibold">
                                {ui.disabled}
                              </span>
                            )}
                            {(skill.tags || []).filter((tag) => tag !== 'plugin').slice(0, 2).map((tag) => (
                              <span key={tag} className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold">
                                {tag}
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleToggleSkillSafe(skill)}
                              className={`p-1.5 rounded-lg transition-colors ${skill.enabled ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10' : 'text-amber-600 dark:text-amber-400 hover:bg-amber-500/10'}`}
                              title={skill.enabled ? ui.disableSkill : ui.enableSkill}
                            >
                              {skill.enabled ? <Power size={14} /> : <PowerOff size={14} />}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSkill(skill)}
                              disabled={skill.canDelete === false}
                              className={`p-1.5 rounded-lg ${skill.canDelete === false ? 'text-[var(--text-tertiary)] cursor-not-allowed opacity-40' : 'text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-500/10'}`}
                              title={skill.canDelete === false ? ui.protectedDelete : ui.deleteLabel}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className={`${isMobileSkillListOpen ? 'hidden' : 'flex'} md:flex flex-1 min-h-0 flex-col bg-[var(--surface-bg)]`}>
              {(loadError || notice) && (
                <div className="px-4 pt-3 space-y-2 shrink-0">
                  {loadError && <div role="alert" className="rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-600 dark:text-red-400">{loadError}</div>}
                  {notice && <div role="status" className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">{notice}</div>}
                </div>
              )}

              {selectedSkill ? (
                <>
                  <div className="px-5 py-3.5 border-b border-[var(--surface-border-subtle)] shrink-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => setIsMobileSkillListOpen(true)}
                          className="md:hidden inline-flex items-center gap-1 mb-2 px-2.5 py-1 rounded-full bg-[var(--surface-inset)] text-[var(--text-secondary)] text-xs font-semibold"
                        >
                          <PanelLeftOpen size={13} />
                          {tx('技能列表', 'Skills', 'スキル一覧')}
                        </button>
                        <h4 className="text-base font-bold text-[var(--text-dark)] leading-tight truncate">{selectedSkill.name}</h4>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-tight truncate">
                          {selectedSkill.sourceType}
                          {selectedSkill.source ? ` · ${selectedSkill.source}` : ''}
                          {selectedSkillMeta.version ? ` · v${selectedSkillMeta.version}` : ''}
                          {selectedSkillMeta.owner ? ` · ${selectedSkillMeta.owner}` : ''}
                        </p>
                      </div>

                      {selectedIsRemote ? (
                        <button
                          type="button"
                          onClick={() => installOpenHubSlug(selectedSkill.slug)}
                          disabled={skillsLoading}
                          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-saki-pink hover:bg-saki-pink-hover text-white text-xs font-semibold disabled:opacity-60 shrink-0"
                        >
                          <Download size={14} />
                          {ui.installThisSkill}
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                          <button
                            type="button"
                            onClick={() => handleToggleSkillSafe(selectedSkill)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${selectedSkill.enabled ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'}`}
                          >
                            {selectedSkill.enabled ? <Power size={13} /> : <PowerOff size={13} />}
                            {selectedSkill.enabled ? ui.enabledNow : ui.disabledNow}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (isEditingSkill) {
                                setSkillContentDraft(selectedSkill.content || '');
                                setIsEditingSkill(false);
                              } else {
                                setSkillContentDraft(selectedSkill.content || '');
                                setIsEditingSkill(true);
                              }
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-[var(--surface-border-subtle)] bg-[var(--surface-bg-light)] hover:bg-[var(--surface-bg-hover)] text-[var(--text-dark)]"
                          >
                            <Edit3 size={13} />
                            {isEditingSkill ? tx('取消编辑', 'Cancel edit', '編集をキャンセル') : tx('编辑内容', 'Edit', '編集')}
                          </button>
                          {isEditingSkill && (
                            <button
                              type="button"
                              onClick={handleSaveSkillContent}
                              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-saki-pink hover:bg-saki-pink-hover text-white text-xs font-semibold shadow-sm"
                            >
                              <Save size={13} />
                              {ui.overwriteSave}
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {selectedSkill.isDefault && (
                        <span className="px-2 py-0.5 rounded-full bg-[var(--surface-inset)] text-[var(--text-dark)] text-[10px] font-semibold">
                          {ui.defaultSkill}
                        </span>
                      )}
                      {!selectedSkill.enabled && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-semibold">
                          {ui.disabled}
                        </span>
                      )}
                      {selectedSkillMeta.downloads && (
                        <span className="px-2 py-0.5 rounded-full bg-[var(--surface-inset)] text-[var(--text-secondary)] text-[10px] font-semibold">
                          {ui.downloads} {selectedSkillMeta.downloads}
                        </span>
                      )}
                      {selectedSkillMeta.stars && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-semibold">
                          {tx('收藏', 'Stars', 'スター')} {selectedSkillMeta.stars}
                        </span>
                      )}
                      {(selectedSkill.tags || []).slice(0, 6).map((tag) => (
                        <span key={tag} className="px-2 py-0.5 rounded-full bg-[var(--primary-light)] text-[var(--accent-text)] text-[10px] font-semibold">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {selectedSkill.description && (
                      <div className="rounded-2xl border border-[var(--surface-border-subtle)] bg-[var(--surface-bg-light)] px-4 py-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-[var(--accent-text)]">
                          <Sparkles size={14} />
                          {ui.overview}
                        </div>
                        <p className="mt-1.5 text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">{selectedSkill.description}</p>
                      </div>
                    )}

                    {isEditingSkill ? (
                      <textarea
                        value={skillContentDraft}
                        onChange={(e) => setSkillContentDraft(e.target.value)}
                        className="w-full min-h-[360px] h-[calc(100%-6rem)] rounded-2xl p-4 border text-xs sm:text-sm leading-relaxed font-mono outline-none resize-y"
                      />
                    ) : (
                      <pre className="whitespace-pre-wrap text-xs sm:text-sm leading-6 text-[var(--text-dark)] font-mono bg-[var(--surface-bg-light)] rounded-2xl p-5 border border-[var(--surface-border-subtle)]">
                        {selectedSkill.content || ui.noSkillContent}
                      </pre>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-center text-[var(--text-tertiary)] p-10">
                  <div>
                    <Wrench size={40} className="mx-auto mb-3 opacity-25" />
                    <div className="font-semibold text-sm text-[var(--text-secondary)]">{ui.selectSkillTitle}</div>
                    <p className="text-xs mt-1.5 max-w-sm">{ui.selectSkillDesc}</p>
                    <button
                      type="button"
                      onClick={() => setIsMobileSkillListOpen(true)}
                      className="md:hidden mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--surface-inset)] text-xs font-semibold text-[var(--text-dark)]"
                    >
                      <PanelLeftClose size={14} />
                      {tx('查看技能列表', 'Browse skills', 'スキル一覧へ')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'mcp' && (
          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-6">
            {/* Top MCP Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--surface-bg-light)] border border-[var(--surface-border-subtle)] rounded-2xl p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Server size={16} className="text-[var(--accent-text)]" />
                  <h4 className="font-bold text-sm text-[var(--text-dark)]">
                    {tx('MCP 服务配置与实时状态', 'MCP Server Configuration & Live Status', 'MCP サーバー設定とステータス')}
                  </h4>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  {tx('兼容 Claude Desktop 标准 JSON 格式；插件注入的 MCP 会与自定义 MCP 自动合并运行。', 'Compatible with Claude Desktop JSON format; plugin-bundled MCP servers merge automatically with custom servers.', 'Claude Desktop 形式に対応。プラグイン内蔵 MCP とカスタム MCP が自動統合されます。')}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center bg-[var(--surface-inset)] p-1 rounded-xl border border-[var(--surface-border-subtle)] text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setMcpMode('visual')}
                    className={`px-3 py-1 rounded-lg transition-all ${mcpMode === 'visual' ? 'bg-[var(--surface-bg-strong)] text-[var(--accent-text)] shadow-sm font-semibold' : 'text-[var(--text-secondary)]'}`}
                  >
                    {tx('可视化管理', 'Visual', 'ビジュアル')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMcpConfigText(JSON.stringify(normalizeMcpConfigObject(config?.mcpConfig), null, 2));
                      setMcpJsonError('');
                      setMcpMode('json');
                    }}
                    className={`px-3 py-1 rounded-lg transition-all ${mcpMode === 'json' ? 'bg-[var(--surface-bg-strong)] text-[var(--accent-text)] shadow-sm font-semibold' : 'text-[var(--text-secondary)]'}`}
                  >
                    {tx('JSON 编辑', 'JSON', 'JSON 編集')}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => applyMcpConfig(normalizeMcpConfigObject(config?.mcpConfig), tx('已同步并连接所有 MCP 服务', 'All MCP servers synced', 'すべての MCP サービスを同期しました'))}
                  disabled={isSyncingMcp}
                  className="px-3.5 py-1.5 rounded-xl bg-saki-pink hover:bg-saki-pink-hover disabled:opacity-60 text-white text-xs font-semibold transition-colors inline-flex items-center gap-1.5 shadow-sm"
                >
                  <RefreshCw size={13} className={isSyncingMcp ? 'animate-spin' : ''} />
                  {isSyncingMcp ? tx('同步中...', 'Syncing...', '同期中...') : tx('同步并连接', 'Sync & Connect', '同期・接続')}
                </button>
              </div>
            </div>

            {/* Plugin-injected MCP servers */}
            {pluginMcpEntries.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] flex items-center gap-1.5">
                    <Boxes size={14} className="text-[var(--accent-text)]" />
                    {tx('来自已启用插件的 MCP 服务', 'MCP Servers from Enabled Plugins', '有効プラグインの MCP サーバー')}
                  </h5>
                  <button
                    type="button"
                    onClick={() => setActiveTab('installed')}
                    className="text-xs text-[var(--accent-text)] hover:underline font-medium"
                  >
                    {tx('前往插件管理', 'Manage plugins', 'プラグイン管理へ')} →
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {pluginMcpEntries.map((entry) => (
                    <div
                      key={`${entry.pluginId}-${entry.name}`}
                      className="bg-[var(--surface-bg-light)] border border-[var(--surface-border-subtle)] rounded-2xl p-4 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-[var(--text-dark)] font-mono truncate">{entry.name}</span>
                          <span className="px-2 py-0.5 rounded-full bg-[var(--primary-light)] text-[var(--accent-text)] text-[10px] font-semibold">
                            {entry.pluginName}
                          </span>
                        </div>
                        {entry.error && (
                          <p className="text-[11px] text-red-500 mt-1 truncate">{entry.error}</p>
                        )}
                      </div>

                      <div className="shrink-0">
                        {entry.connected ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                            <CheckCircle2 size={12} />
                            {tx(`已连接 · ${entry.toolCount} 工具`, `Connected · ${entry.toolCount} tools`, `接続済み · ${entry.toolCount} ツール`)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full">
                            <AlertCircle size={12} />
                            {tx('未连接', 'Disconnected', '未接続')}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Custom MCP Configuration */}
            {mcpMode === 'visual' ? (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] flex items-center gap-1.5">
                    <Cpu size={14} />
                    {tx('自定义 MCP 服务', 'Custom MCP Servers', 'カスタム MCP サーバー')}
                  </h5>
                  <button
                    type="button"
                    onClick={startCreateMcpServer}
                    className="px-3 py-1.5 rounded-xl bg-saki-pink hover:bg-saki-pink-hover text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm"
                  >
                    <Plus size={14} />
                    {tx('添加 MCP 服务', 'Add MCP server', 'MCP サーバーを追加')}
                  </button>
                </div>

                {isEditingMcpServer && (
                  <div className="bg-[var(--surface-bg-light)] border border-[var(--accent-border)] rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h6 className="font-bold text-sm text-[var(--text-dark)]">
                        {mcpServerForm.originalName
                          ? tx(`编辑服务：${mcpServerForm.originalName}`, `Edit server: ${mcpServerForm.originalName}`, `編集: ${mcpServerForm.originalName}`)
                          : tx('新增自定义 MCP 服务', 'Add custom MCP server', 'カスタム MCP サーバーを追加')}
                      </h6>
                      <button type="button" onClick={() => setIsEditingMcpServer(false)} className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-dark)]">
                        <X size={16} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-[var(--text-dark)]">{tx('服务名称 (Key)', 'Server Name', 'サーバー名')}</label>
                        <input
                          type="text"
                          value={mcpServerForm.name}
                          onChange={(e) => setMcpServerForm((prev) => ({ ...prev, name: e.target.value }))}
                          placeholder="e.g. filesystem"
                          className="w-full px-3 py-2 text-xs border rounded-xl font-mono outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-[var(--text-dark)]">{tx('传输方式', 'Transport', 'トランスポート')}</label>
                        <select
                          value={mcpServerForm.transport}
                          onChange={(e) => setMcpServerForm((prev) => ({ ...prev, transport: e.target.value }))}
                          className="w-full px-3 py-2 text-xs border rounded-xl outline-none"
                        >
                          <option value="stdio">Stdio (command + args)</option>
                          <option value="url">URL (SSE / HTTP)</option>
                        </select>
                      </div>
                    </div>

                    {mcpServerForm.transport === 'stdio' ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-[var(--text-dark)]">{tx('启动命令 (command)', 'Command', 'コマンド')}</label>
                          <input
                            type="text"
                            value={mcpServerForm.command}
                            onChange={(e) => setMcpServerForm((prev) => ({ ...prev, command: e.target.value }))}
                            placeholder="npx / uvx / node / python"
                            className="w-full px-3 py-2 text-xs border rounded-xl font-mono outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-[var(--text-dark)]">{tx('参数列表 (args，空格分隔)', 'Arguments (space-separated)', '引数（スペース区切り）')}</label>
                          <input
                            type="text"
                            value={mcpServerForm.argsText}
                            onChange={(e) => setMcpServerForm((prev) => ({ ...prev, argsText: e.target.value }))}
                            placeholder="-y @modelcontextprotocol/server-filesystem D:\\workspace"
                            className="w-full px-3 py-2 text-xs border rounded-xl font-mono outline-none"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-[var(--text-dark)]">{tx('服务 URL', 'Server URL', 'サーバー URL')}</label>
                        <input
                          type="text"
                          value={mcpServerForm.url}
                          onChange={(e) => setMcpServerForm((prev) => ({ ...prev, url: e.target.value }))}
                          placeholder="http://127.0.0.1:8000/sse"
                          className="w-full px-3 py-2 text-xs border rounded-xl font-mono outline-none"
                        />
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-[var(--text-dark)]">{tx('环境变量 (可选，每行 KEY=VALUE)', 'Environment Variables (optional, KEY=VALUE per line)', '環境変数（任意、1行に1つ KEY=VALUE）')}</label>
                      <textarea
                        value={mcpServerForm.envText}
                        onChange={(e) => setMcpServerForm((prev) => ({ ...prev, envText: e.target.value }))}
                        placeholder="API_KEY=your_token_here"
                        rows={3}
                        className="w-full px-3 py-2 text-xs border rounded-xl font-mono outline-none resize-y"
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsEditingMcpServer(false)}
                        className="px-3.5 py-1.5 rounded-xl text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] font-medium"
                      >
                        {tx('取消', 'Cancel', 'キャンセル')}
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveMcpServerForm}
                        disabled={!mcpServerForm.name.trim() || (mcpServerForm.transport === 'stdio' ? !mcpServerForm.command.trim() : !mcpServerForm.url.trim())}
                        className="px-4 py-1.5 rounded-xl bg-saki-pink hover:bg-saki-pink-hover disabled:opacity-50 text-white text-xs font-semibold shadow-sm"
                      >
                        {tx('保存并连接', 'Save & Connect', '保存して接続')}
                      </button>
                    </div>
                  </div>
                )}

                {customMcpServers.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[var(--surface-border-subtle)] bg-[var(--surface-bg-light)] p-10 text-center text-[var(--text-tertiary)]">
                    <Server size={36} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm text-[var(--text-secondary)]">{tx('暂未配置自定义 MCP 服务', 'No custom MCP servers configured yet', 'カスタム MCP サーバーはまだ設定されていません')}</p>
                    <p className="text-xs mt-1">{tx('你可以点击右上角“添加 MCP 服务”，或切换到“JSON 编辑”粘贴标准配置。', 'Click "Add MCP server" above, or switch to "JSON" to paste a standard configuration.', '上の「MCP サーバーを追加」から追加するか、「JSON 編集」に切り替えて貼り付けてください。')}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {customMcpServers.map(([name, serverDef]) => {
                      const status = mcpStatus[name];
                      const commandSummary = serverDef?.url
                        ? serverDef.url
                        : `${serverDef?.command || ''} ${(serverDef?.args || []).join(' ')}`.trim();
                      const envCount = Object.keys(serverDef?.env || {}).length;

                      return (
                        <div
                          key={name}
                          className="bg-[var(--surface-bg-light)] border border-[var(--surface-border-subtle)] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-[var(--text-dark)] font-mono">{name}</span>
                              {status?.connected ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                                  <CheckCircle2 size={11} />
                                  {tx(`已连接 · ${status.toolCount ?? 0} 工具`, `Connected · ${status.toolCount ?? 0} tools`, `接続済み · ${status.toolCount ?? 0} ツール`)}
                                </span>
                              ) : status?.error ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">
                                  <AlertCircle size={11} />
                                  {tx('连接失败', 'Error', 'エラー')}
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold text-[var(--text-tertiary)] bg-[var(--surface-inset)] border border-[var(--surface-border-subtle)] px-2 py-0.5 rounded-full">
                                  {tx('未同步', 'Not synced', '未同期')}
                                </span>
                              )}
                              {envCount > 0 && (
                                <span className="text-[10px] text-[var(--text-tertiary)] bg-[var(--surface-inset)] px-2 py-0.5 rounded-full">
                                  ENV ×{envCount}
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-mono text-[var(--text-secondary)] mt-1 truncate" title={commandSummary}>
                              {commandSummary || tx('未指定命令或地址', 'No command or URL specified', 'コマンド未指定')}
                            </p>
                            {status?.error && (
                              <p className="text-[11px] text-red-500 mt-1">{status.error}</p>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                            <button
                              type="button"
                              onClick={() => startEditMcpServer(name, serverDef)}
                              className="px-3 py-1.5 rounded-xl border border-[var(--surface-border-subtle)] bg-[var(--surface-bg)] hover:bg-[var(--surface-bg-hover)] text-xs font-medium text-[var(--text-dark)] inline-flex items-center gap-1"
                            >
                              <Edit3 size={13} />
                              {tx('编辑', 'Edit', '編集')}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteMcpServer(name)}
                              className="p-2 rounded-xl border border-[var(--surface-border-subtle)] bg-[var(--surface-bg)] hover:bg-red-500/10 text-[var(--text-tertiary)] hover:text-red-500 transition-colors"
                              title={tx('删除服务', 'Delete server', '削除')}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            ) : (
              <section className="bg-[var(--surface-bg-light)] border border-[var(--surface-border-subtle)] rounded-2xl p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-[var(--text-secondary)]">
                    {tx('直接编辑完整 MCP JSON 配置（修改后点击“保存并应用”即可生效并连接）', 'Edit the full MCP JSON configuration (click "Save & Apply" to sync and connect)', '完全な MCP JSON 設定を直接編集（「保存して適用」で即座に接続）')}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          const parsed = JSON.parse(mcpConfigText);
                          setMcpConfigText(JSON.stringify(parsed, null, 2));
                          setMcpJsonError('');
                        } catch (err) {
                          setMcpJsonError(err.message);
                        }
                      }}
                      className="px-3 py-1.5 rounded-xl border border-[var(--surface-border-subtle)] bg-[var(--surface-bg)] hover:bg-[var(--surface-bg-hover)] text-xs font-medium text-[var(--text-dark)]"
                    >
                      {tx('格式化', 'Format', '整形')}
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveMcpJson}
                      disabled={Boolean(mcpJsonError) || isSyncingMcp}
                      className="px-4 py-1.5 rounded-xl bg-saki-pink hover:bg-saki-pink-hover disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm"
                    >
                      <Save size={13} />
                      {tx('保存并应用', 'Save & Apply', '保存して適用')}
                    </button>
                  </div>
                </div>

                <textarea
                  value={mcpConfigText}
                  onChange={(e) => handleMcpJsonChange(e.target.value)}
                  spellCheck={false}
                  className="w-full border rounded-xl px-4 py-3 text-xs font-mono outline-none min-h-[280px] resize-y"
                />

                {mcpJsonError ? (
                  <p role="alert" className="text-xs text-red-500 flex items-center gap-1.5">
                    <AlertCircle size={13} />
                    {tx('JSON 格式错误：', 'JSON syntax error: ')}{mcpJsonError}
                  </p>
                ) : (
                  <p className="text-[11px] text-[var(--text-tertiary)]">
                    {tx('提示：可在对话输入框中输入 @mcp:服务名 指定某条消息使用的 MCP 工具。', 'Tip: type @mcp:server in the chat composer to target a specific MCP server.', 'ヒント: チャット欄で @mcp:サーバー名 を入力すると特定の MCP を指定できます。')}
                  </p>
                )}
              </section>
            )}
          </div>
        )}

        {/* Plugin Config Sub-Modal */}
        <AnimatePresence>
          {configModalPlugin && (
            <motion.div
              className="fixed inset-0 z-[160] flex items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                data-saki-dialog="true"
                className="bg-[var(--surface-bg)] rounded-none sm:rounded-2xl w-full max-w-lg h-full sm:h-auto max-h-[100dvh] sm:max-h-[90vh] shadow-2xl border border-[var(--surface-border-subtle)] overflow-hidden flex flex-col"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-4 sm:px-5 py-3.5 pt-[max(0.875rem,env(safe-area-inset-top))] sm:pt-3.5 border-b border-[var(--surface-border-subtle)] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Settings size={16} className="text-[var(--accent-text)]" />
                    <h4 className="font-bold text-sm text-[var(--text-dark)]">
                      {tx('配置参数 -', 'Configuration -')} {configModalPlugin.name}
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfigModalPlugin(null)}
                    className="p-1 hover:bg-[var(--surface-inset)] rounded-lg text-[var(--text-secondary)]"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="flex-1 p-4 sm:p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4 sm:max-h-[60vh] overflow-y-auto">
                  <p className="text-xs text-[var(--text-secondary)]">
                    {tx('请设置该插件所需的环境变量或参数，配置将安全保存在本地。', 'Set the environment variables or parameters required by this plugin. Configuration is stored locally.', 'このプラグインに必要な環境変数やパラメータを設定してください。設定はローカルに保存されます。')}
                  </p>

                  {Object.entries(configModalPlugin.configSchema || {}).map(([key, field]) => {
                    const isSecret = Boolean(field.secret);
                    const showSecret = Boolean(showSecrets[key]);

                    return (
                      <div key={key} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label htmlFor={`${searchInputId}-${key}`} className="text-xs font-semibold text-[var(--text-dark)]">
                            {field.label || key}
                            {field.required && <span className="text-red-500 ml-1">*</span>}
                          </label>
                          <span className="text-[10px] text-[var(--text-tertiary)] font-mono">{key}</span>
                        </div>
                        {field.description && (
                          <p className="text-[11px] text-[var(--text-secondary)]">{field.description}</p>
                        )}
                        <div className="relative">
                          <input
                            id={`${searchInputId}-${key}`}
                            type={isSecret && !showSecret ? 'password' : 'text'}
                            required={Boolean(field.required)}
                            autoComplete={isSecret ? 'new-password' : undefined}
                            value={configForm[key] ?? ''}
                            onChange={(e) => setConfigForm({ ...configForm, [key]: e.target.value })}
                            placeholder={field.placeholder || ''}
                            className="w-full px-3 py-2 text-xs border rounded-xl focus:outline-none font-mono pr-9"
                          />
                          {isSecret && (
                            <button
                              type="button"
                              onClick={() => setShowSecrets({ ...showSecrets, [key]: !showSecret })}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-dark)]"
                            >
                              {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="px-5 py-3 border-t border-[var(--surface-border-subtle)] flex items-center justify-end gap-2 bg-[var(--surface-bg-light)]">
                  <button
                    type="button"
                    onClick={() => setConfigModalPlugin(null)}
                    className="px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] rounded-xl transition-colors font-medium"
                  >
                    {tx('取消', 'Cancel', 'キャンセル')}
                  </button>
                  <button
                    type="button"
                    onClick={handleSavePluginConfig}
                    disabled={isSavingPluginConfig || Object.entries(configModalPlugin.configSchema || {}).some(([key, field]) => field.required && !String(configForm[key] ?? '').trim())}
                    className="px-4 py-1.5 text-xs bg-saki-pink hover:bg-saki-pink-hover disabled:opacity-50 text-white rounded-xl transition-colors font-semibold shadow-sm"
                  >
                    {isSavingPluginConfig
                      ? tx('保存中...', 'Saving...', '保存中...')
                      : configModalPlugin.isInstallingFromMarket
                        ? tx('确认并安装', 'Confirm and install', '確認してインストール')
                        : tx('保存配置', 'Save configuration', '設定を保存')}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
