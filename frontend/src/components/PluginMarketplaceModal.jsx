import React, { useEffect, useState, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Search,
  Download,
  Trash2,
  Settings,
  Power,
  PowerOff,
  RefreshCw,
  Check,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Layers,
  Cpu,
  Wrench,
  Boxes,
  Database,
  Globe,
  FileText,
  GitPullRequest,
  Eye,
  EyeOff,
  FolderOpen,
  Upload,
  ArrowRight
} from 'lucide-react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { BACKEND_URL } from '../utils/backendUrl';
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

export default function PluginMarketplaceModal({ isOpen, onClose, windowed = false }) {
  const { t, i18n } = useTranslation();
  const tx = (zhText, enText, jaText) => localizeWith(i18n.resolvedLanguage || i18n.language, zhText, enText, jaText);
  const searchInputId = useId();
  const [activeTab, setActiveTab] = useState('marketplace'); // 'marketplace' | 'installed' | 'import'
  const [catalog, setCatalog] = useState([]);
  const [installedPlugins, setInstalledPlugins] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sourceStatus, setSourceStatus] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [installingPluginId, setInstallingPluginId] = useState(null);
  const [notice, setNotice] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // 配置弹窗状态
  const [configModalPlugin, setConfigModalPlugin] = useState(null);
  const [configForm, setConfigForm] = useState({});
  const [showSecrets, setShowSecrets] = useState({});
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // 本地导入表单状态
  const [localPath, setLocalPath] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState(null);

  // 加载市场目录与已安装插件
  const fetchData = async (refresh = false) => {
    try {
      setLoading(true);
      setLoadError('');
      const [marketRes, installedRes] = await Promise.allSettled([
        axios.get(`${BACKEND_URL}/api/plugins/marketplace`, { params: { includeSource: true, refresh } }),
        axios.get(`${BACKEND_URL}/api/plugins`)
      ]);
      if (marketRes.status === 'fulfilled') {
        const data = marketRes.value.data;
        setCatalog(Array.isArray(data) ? data : (data.plugins || []));
        setSourceStatus(data.source || null);
      }
      if (installedRes.status === 'fulfilled') setInstalledPlugins(installedRes.value.data || []);
      const failed = [marketRes, installedRes].filter(result => result.status === 'rejected');
      if (failed.length) setLoadError(failed.map(result => result.reason.response?.data?.error || result.reason.message).join(tx('；', '; ')));
    } catch (err) {
      console.error('Failed to fetch plugin data:', err);
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    fetchData();
  }, [isOpen]);

  // 一键从市场安装
  const handleMarketplaceInstall = async (plugin) => {
    if (installingPluginId || loading) return;
    // 若该插件有必填配置且尚未配置，直接调起配置弹窗
    const schema = plugin.configSchema || {};
    const hasRequiredConfig = Object.values(schema).some(field => field.required);

    if (hasRequiredConfig) {
      openConfigModal(plugin, true);
      return;
    }

    try {
      setLoading(true);
      setInstallingPluginId(plugin.id);
      setNotice('');
      await axios.post(`${BACKEND_URL}/api/plugins/marketplace/install`, {
        pluginId: plugin.id,
        config: {}
      });
      await fetchData();
      setNotice(tx(`插件「${plugin.name}」安装完成`, `Plugin "${plugin.name}" installed successfully`, `プラグイン「${plugin.name}」のインストールが完了しました`));
    } catch (err) {
      alert(tx(`安装失败: ${err.response?.data?.error || err.message}`, `Installation failed: ${err.response?.data?.error || err.message}`, `インストールに失敗しました: ${err.response?.data?.error || err.message}`));
    } finally {
      setLoading(false);
      setInstallingPluginId(null);
    }
  };

  // 启停插件
  const handleToggle = async (pluginId, currentEnabled) => {
    try {
      await axios.patch(`${BACKEND_URL}/api/plugins/${pluginId}/toggle`, {
        enabled: !currentEnabled
      });
      await fetchData();
    } catch (err) {
      alert(tx(`切换状态失败: ${err.response?.data?.error || err.message}`, `Failed to toggle status: ${err.response?.data?.error || err.message}`, `状態の切り替えに失敗しました: ${err.response?.data?.error || err.message}`));
    }
  };

  // 卸载插件
  const handleUninstall = async (pluginId, pluginName) => {
    if (!window.confirm(tx(`确定要卸载插件 "${pluginName}" 吗？关联的 MCP 服务与专属技能将被注销。`, `Uninstall plugin "${pluginName}"? Its associated MCP services and dedicated skills will be removed.`, `プラグイン "${pluginName}" をアンインストールしますか？関連する MCP サービスと専用スキルも解除されます。`))) {
      return;
    }
    try {
      await axios.delete(`${BACKEND_URL}/api/plugins/${pluginId}`);
      await fetchData();
    } catch (err) {
      alert(tx(`卸载失败: ${err.response?.data?.error || err.message}`, `Uninstall failed: ${err.response?.data?.error || err.message}`, `アンインストールに失敗しました: ${err.response?.data?.error || err.message}`));
    }
  };

  // 调起配置弹窗
  const openConfigModal = (plugin, isInstalling = false) => {
    const initialConfig = {};
    const schema = plugin.configSchema || {};
    const savedConfig = plugin.config || installedPlugins.find(item => item.id === plugin.id)?.config || {};
    for (const [key, field] of Object.entries(schema)) {
      initialConfig[key] = savedConfig[key] !== undefined ? savedConfig[key] : (field.default ?? '');
    }
    setConfigForm(initialConfig);
    setConfigModalPlugin({ ...plugin, isInstallingFromMarket: isInstalling });
  };

  // 保存配置
  const handleSaveConfig = async () => {
    if (!configModalPlugin) return;
    try {
      setIsSavingConfig(true);
      if (configModalPlugin.isInstallingFromMarket) {
        setInstallingPluginId(configModalPlugin.id);
        setNotice('');
        await axios.post(`${BACKEND_URL}/api/plugins/marketplace/install`, {
          pluginId: configModalPlugin.id,
          config: configForm
        });
        setNotice(tx(`插件「${configModalPlugin.name}」安装完成`, `Plugin "${configModalPlugin.name}" installed successfully`, `プラグイン「${configModalPlugin.name}」のインストールが完了しました`));
      } else {
        await axios.post(`${BACKEND_URL}/api/plugins/${configModalPlugin.id}/config`, {
          config: configForm
        });
      }
      setConfigModalPlugin(null);
      await fetchData();
    } catch (err) {
      alert(tx(`保存配置失败: ${err.response?.data?.error || err.message}`, `Failed to save configuration: ${err.response?.data?.error || err.message}`, `設定の保存に失敗しました: ${err.response?.data?.error || err.message}`));
    } finally {
      setIsSavingConfig(false);
      setInstallingPluginId(null);
    }
  };

  // 本地目录导入
  const handleImportLocal = async () => {
    if (!localPath.trim()) return;
    try {
      setIsImporting(true);
      setImportMessage(null);
      const res = await axios.post(`${BACKEND_URL}/api/plugins/install`, {
        sourcePath: localPath.trim()
      });
      setImportMessage({ type: 'success', text: tx(`插件 "${res.data.plugin.name}" 导入成功！`, `Plugin "${res.data.plugin.name}" imported successfully!`, `プラグイン "${res.data.plugin.name}" のインポートに成功しました！`) });
      setLocalPath('');
      await fetchData();
      setActiveTab('installed');
    } catch (err) {
      setImportMessage({ type: 'error', text: tx(`导入失败: ${err.response?.data?.error || err.message}`, `Import failed: ${err.response?.data?.error || err.message}`, `インポートに失敗しました: ${err.response?.data?.error || err.message}`) });
    } finally {
      setIsImporting(false);
    }
  };

  // 过滤市场插件
  const filteredCatalog = catalog.filter(item => {
    if (selectedCategory !== 'all' && item.category !== selectedCategory) {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const source = `${item.name} ${item.description} ${(item.tags || []).join(' ')}`.toLowerCase();
    return source.includes(q);
  });

  // 过滤已安装插件
  const filteredInstalled = installedPlugins.filter(item => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const source = `${item.name} ${item.description} ${item.id}`.toLowerCase();
    return source.includes(q);
  });

  return (
    <motion.div
      className={windowed ? 'h-full w-full' : 'fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-md p-4'}
      {...(!windowed ? modalBackdropMotion : {})}
      onClick={!windowed ? onClose : undefined}
    >
      <motion.div
        data-saki-dialog="true"
        className={windowed ? 'bg-[var(--surface-bg)] rounded-[28px] w-full h-full shadow-none overflow-hidden flex flex-col text-[var(--text-dark)]' : 'bg-[var(--surface-bg)] rounded-3xl w-full max-w-6xl shadow-2xl overflow-hidden flex flex-col h-[86vh] text-[var(--text-dark)]'}
        {...(!windowed ? modalPanelMotion : {})}
        onClick={!windowed ? (e) => e.stopPropagation() : undefined}
      >
        {/* 顶部标题栏与导航 Tab */}
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-4 bg-[var(--surface-bg-light)] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
              <Boxes size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base sm:text-lg leading-tight">{tx('插件市场 (Plugin Marketplace)', 'Plugin Marketplace', 'プラグインマーケット (Plugin Marketplace)')}</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 font-semibold uppercase">MCP + Skill</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">{tx('将 MCP 服务与专属技能深度绑定，一键武装智能体领域能力', 'Bind MCP services with dedicated skills and equip domain capabilities in one click', 'MCP サービスと専用スキルを深く結びつけ、ワンクリックでエージェントの専門能力を装備')}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tabs */}
            <div className="flex items-center bg-[var(--surface-inset)] p-1 rounded-xl border border-[var(--border-subtle)] text-xs font-medium">
              <button
                onClick={() => setActiveTab('marketplace')}
                className={`px-3 py-1.5 rounded-lg transition-all ${activeTab === 'marketplace' ? 'bg-[var(--surface-bg)] text-indigo-600 shadow-sm font-semibold' : 'text-[var(--text-secondary)] hover:text-[var(--text-dark)]'}`}
              >
                {tx('市场广场', 'Marketplace', 'マーケットプレイス')}
              </button>
              <button
                onClick={() => setActiveTab('installed')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${activeTab === 'installed' ? 'bg-[var(--surface-bg)] text-indigo-600 shadow-sm font-semibold' : 'text-[var(--text-secondary)] hover:text-[var(--text-dark)]'}`}
              >
                {tx('已安装', 'Installed', 'インストール済み')}
                {installedPlugins.length > 0 && (
                  <span className="px-1.5 py-0.2 bg-indigo-100 text-indigo-700 text-[10px] rounded-full">
                    {installedPlugins.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('import')}
                className={`px-3 py-1.5 rounded-lg transition-all ${activeTab === 'import' ? 'bg-[var(--surface-bg)] text-indigo-600 shadow-sm font-semibold' : 'text-[var(--text-secondary)] hover:text-[var(--text-dark)]'}`}
              >
                {tx('本地导入', 'Import local', 'ローカルからインポート')}
              </button>
            </div>

            <button
              onClick={() => fetchData(true)}
              disabled={loading || Boolean(installingPluginId)}
              title={tx('刷新数据', 'Refresh data', 'データを更新')}
              className="p-2 hover:bg-[var(--surface-inset)] rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-dark)] transition-colors"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>

            <button
              onClick={onClose}
              className="p-2 hover:bg-[var(--surface-inset)] rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-dark)] transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 搜索栏与分类过滤器 (在市场或已安装页显示) */}
        {activeTab !== 'import' && (
          <div className="px-6 py-3 border-b border-[var(--border-subtle)] bg-[var(--surface-bg)] flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-1.5 overflow-x-auto py-1 max-w-full">
              {activeTab === 'marketplace' && CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`text-xs px-3 py-1.5 rounded-full transition-all whitespace-nowrap ${selectedCategory === cat.id ? 'bg-indigo-600 text-white font-medium shadow-sm' : 'bg-[var(--surface-inset)] text-[var(--text-secondary)] hover:bg-[var(--surface-inset-hover)]'}`}
                >
                  {tx(cat.label, cat.en, cat.ja)}
                </button>
              ))}
            </div>

            <div className="relative min-w-[220px] max-w-xs w-full sm:w-auto">
              <label htmlFor={searchInputId} className="sr-only">{tx('搜索插件', 'Search plugins', 'プラグインを検索')}</label>
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                id={searchInputId}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={activeTab === 'marketplace' ? tx('搜索市场插件、能力或标签...', 'Search marketplace plugins, capabilities or tags...', 'マーケットのプラグイン・機能・タグを検索...') : tx('搜索已安装插件...', 'Search installed plugins...', 'インストール済みプラグインを検索...')}
                className="w-full pl-8 pr-4 py-1.5 text-xs bg-[var(--surface-inset)] border border-[var(--border-subtle)] rounded-xl focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>
        )}

        {/* 内容主体区域 */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6 bg-[var(--surface-bg-light)]">
          {loadError && <p role="alert" className="mb-4 rounded-xl bg-red-500/10 p-3 text-xs text-red-600">{tx('加载失败：', 'Load failed: ')}{loadError}</p>}
          {notice && <p role="status" className="mb-4 rounded-xl bg-emerald-500/10 p-3 text-xs text-emerald-600">{notice}</p>}
          {/* TAB 1: 市场广场 */}
          {activeTab === 'marketplace' && (
            <div>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-secondary)]">
                <span>{loading ? tx('正在加载插件目录…', 'Loading plugin catalog…', 'プラグインカタログを読み込み中…') : tx(`共 ${catalog.length} 个插件，可按需下载功能插件`, `${catalog.length} plugins available, download the ones you need`, `全 ${catalog.length} 個のプラグイン。必要な機能プラグインをダウンロードできます`)}</span>
                <a href="https://github.com/EthanChan050430/saki-plugins" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-600 hover:underline">
                  {tx('saki-plugins 仓库', 'saki-plugins repository', 'saki-plugins リポジトリ')} <ExternalLink size={12} />
                </a>
              </div>
              {sourceStatus?.error && (
                <p role="alert" className="mb-4 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-600">
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
                  {filteredCatalog.map(plugin => {
                    const IconComp = getCategoryIcon(plugin.category, plugin.icon);
                    return (
                      <div
                        key={plugin.id}
                        className="bg-[var(--surface-bg)] rounded-2xl border border-[var(--border-subtle)] p-5 flex flex-col justify-between hover:shadow-md transition-shadow relative group"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="w-11 h-11 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center shrink-0">
                              <IconComp size={22} />
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              {plugin.isInstalled ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                  <Check size={12} />
                                  {tx('已安装', 'Installed', 'インストール済み')}
                                </span>
                              ) : (
                                <span className="text-[10px] text-[var(--text-tertiary)] bg-[var(--surface-inset)] px-2 py-0.5 rounded-md">
                                  v{plugin.version}
                                </span>
                              )}
                            </div>
                          </div>

                          <h4 className="font-bold text-sm text-[var(--text-dark)] leading-snug">{plugin.name}</h4>
                          <span className="mt-1 inline-block text-[10px] text-indigo-500">{plugin.source === 'github' ? 'GitHub · saki-plugins' : tx('内置插件', 'Built-in', '内蔵プラグイン')}</span>
                          <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2 leading-relaxed">
                            {plugin.description}
                          </p>

                          {/* MCP 与 Skill 双重徽章 */}
                          <div className="mt-4 space-y-1.5 bg-[var(--surface-inset)]/60 rounded-xl p-2.5 border border-[var(--border-subtle)] text-[11px]">
                            <div className="flex items-center gap-1.5 text-indigo-600 font-medium truncate">
                              <Cpu size={13} className="shrink-0" />
                              <span className="truncate">{(plugin.mcpServersSummary ? tx('MCP 服务', 'MCP services', 'MCP サービス') : tx('MCP 工具', 'MCP tools', 'MCP ツール'))}: {(plugin.mcpServersSummary || plugin.mcpToolsSummary)?.join(', ') || tx('无', 'None', 'なし')}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-emerald-600 font-medium truncate">
                              <Wrench size={13} className="shrink-0" />
                              <span className="truncate">{tx('专属技能:', 'Skills:')} {plugin.skillsSummary?.join(', ') || tx('无', 'None', 'なし')}</span>
                            </div>
                          </div>
                          {plugin.requirements?.length > 0 && <p className="mt-2 text-[11px] text-[var(--text-tertiary)]">{tx('运行依赖：', 'Requirements: ')}{plugin.requirements.join(tx('、', ', '))}</p>}
                          {plugin.sourceUrl && <a href={plugin.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11px] text-indigo-500 hover:underline">{tx('查看源码', 'View source', 'ソースを表示')} <ExternalLink size={11} /></a>}
                        </div>

                        {/* 底部按钮栏 */}
                        <div className="mt-5 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2">
                          <span className="text-[11px] text-[var(--text-tertiary)] truncate">{tx('作者:', 'By:')} {plugin.author}</span>

                          {plugin.isInstalled ? (
                            <button
                              onClick={() => openConfigModal(plugin)}
                              className="text-xs px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--surface-inset)] text-[var(--text-secondary)] font-medium transition-colors flex items-center gap-1"
                            >
                              <Settings size={13} />
                              {tx('配置', 'Configure', '設定')}
                            </button>
                          ) : (
                            <button
                              onClick={() => handleMarketplaceInstall(plugin)}
                              disabled={loading || Boolean(installingPluginId)}
                              className="text-xs px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-wait text-white font-medium transition-colors flex items-center gap-1 shadow-sm"
                            >
                              {installingPluginId === plugin.id ? <RefreshCw size={13} className="animate-spin" /> : <Download size={13} />}
                              {installingPluginId === plugin.id ? tx('下载安装中…', 'Installing…', 'ダウンロード・インストール中…') : plugin.source === 'github' ? tx('下载安装', 'Install', 'ダウンロードしてインストール') : tx('一键安装', 'One-click install', 'ワンクリックインストール')}
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

          {/* TAB 2: 已安装插件管理 */}
          {activeTab === 'installed' && (
            <div className="space-y-3">
              {filteredInstalled.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-[var(--text-tertiary)]">
                  <Boxes size={48} className="stroke-[1.2] opacity-40 mb-3" />
                  <p className="text-sm">{tx('暂无已安装插件', 'No plugins installed yet', 'インストール済みのプラグインはありません')}</p>
                  <button
                    onClick={() => setActiveTab('marketplace')}
                    className="mt-3 text-xs text-indigo-600 font-medium hover:underline flex items-center gap-1"
                  >
                    {tx('前往市场广场浏览安装', 'Browse the marketplace to install', 'マーケットプレイスで探してインストール')} <ArrowRight size={13} />
                  </button>
                </div>
              ) : (
                filteredInstalled.map(plugin => {
                  const isEnabled = plugin.enabled;
                  const isMissingConfig = plugin.status === 'missing_config';
                  const IconComp = getCategoryIcon(plugin.category, plugin.icon);

                  return (
                    <div
                      key={plugin.id}
                      className="bg-[var(--surface-bg)] rounded-2xl border border-[var(--border-subtle)] p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="flex items-start gap-4 min-w-0">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${isEnabled ? 'bg-indigo-500/10 text-indigo-600' : 'bg-gray-100 text-gray-400'}`}>
                          <IconComp size={24} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-bold text-sm text-[var(--text-dark)] truncate">{plugin.name}</h4>
                            <span className="text-[10px] text-[var(--text-tertiary)] bg-[var(--surface-inset)] px-2 py-0.5 rounded">
                              v{plugin.version}
                            </span>
                            {/* 状态徽章 */}
                            {isMissingConfig ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                <AlertCircle size={11} /> {tx('待配置', 'Needs setup', '設定待ち')}
                              </span>
                            ) : isEnabled ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                <CheckCircle2 size={11} /> {tx('运行中', 'Running', '実行中')}
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                {tx('已停用', 'Disabled', '無効')}
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-1">{plugin.description}</p>

                          <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-[var(--text-tertiary)]">
                            <span>ID: <code className="text-indigo-600 font-mono">{plugin.id}</code></span>
                            <span>•</span>
                            <span>{tx('MCP 工具:', 'MCP tools:')} {plugin.hasMcp ? tx('已注入', 'Injected', '注入済み') : tx('无', 'None', 'なし')}</span>
                            <span>•</span>
                            <span>{tx('专属技能:', 'Skills:')} {plugin.skillsCount} {tx('个', '', '個')}</span>
                          </div>
                        </div>
                      </div>

                      {/* 操作按钮组 */}
                      <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                        {/* 配置按钮 */}
                        {plugin.configSchema && Object.keys(plugin.configSchema).length > 0 && (
                          <button
                            onClick={() => openConfigModal(plugin)}
                            className="p-2 hover:bg-[var(--surface-inset)] rounded-xl text-[var(--text-secondary)] hover:text-indigo-600 border border-[var(--border-subtle)] transition-colors flex items-center gap-1 text-xs"
                            title={tx('配置插件参数', 'Configure plugin parameters', 'プラグインのパラメータを設定')}
                          >
                            <Settings size={15} />
                            <span>{tx('配置', 'Configure', '設定')}</span>
                          </button>
                        )}

                        {/* 启停切换 */}
                        <button
                          onClick={() => handleToggle(plugin.id, plugin.enabled)}
                          className={`p-2 rounded-xl border transition-colors flex items-center gap-1 text-xs ${isEnabled ? 'text-emerald-600 border-emerald-200 bg-emerald-50 hover:bg-emerald-100' : 'text-gray-400 border-[var(--border-subtle)] hover:bg-[var(--surface-inset)]'}`}
                          title={isEnabled ? tx('停用插件', 'Disable plugin', 'プラグインを無効化') : tx('启用插件', 'Enable plugin', 'プラグインを有効化')}
                        >
                          {isEnabled ? <Power size={15} /> : <PowerOff size={15} />}
                          <span>{isEnabled ? tx('已启用', 'Enabled', '有効') : tx('已停用', 'Disabled', '無効')}</span>
                        </button>

                        {/* 卸载按钮 */}
                        <button
                          onClick={() => handleUninstall(plugin.id, plugin.name)}
                          className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-600 rounded-xl border border-[var(--border-subtle)] transition-colors"
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

          {/* TAB 3: 本地导入 */}
          {activeTab === 'import' && (
            <div className="max-w-2xl mx-auto space-y-6 py-4">
              <div className="bg-[var(--surface-bg)] rounded-2xl border border-[var(--border-subtle)] p-6">
                <div className="flex items-center gap-2.5 mb-2 text-indigo-600 font-bold">
                  <FolderOpen size={20} />
                  <h4>{tx('从本地开发目录导入插件', 'Import a plugin from a local directory', 'ローカル開発ディレクトリからプラグインをインポート')}</h4>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mb-4 leading-relaxed">
                  {tx('输入包含', 'Enter the absolute path of a local folder containing')} <code className="bg-[var(--surface-inset)] px-1.5 py-0.5 rounded text-indigo-600">plugin.json</code> {tx('的本地文件夹绝对路径，系统将自动校验规范、装载 MCP 并注册附带技能。', '. The system will validate it, load MCP servers and register bundled skills.', ' のローカルフォルダー絶対パス。システムが仕様を検証し、MCP を読み込み、付属スキルを登録します。')}
                </p>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={localPath}
                    onChange={(e) => setLocalPath(e.target.value)}
                    placeholder={tx('例如: D:\\my-dev-plugins\\custom-data-tool', 'e.g. D:\\my-dev-plugins\\custom-data-tool', '例: D:\\my-dev-plugins\\custom-data-tool')}
                    className="flex-1 px-4 py-2 text-xs bg-[var(--surface-inset)] border border-[var(--border-subtle)] rounded-xl focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={handleImportLocal}
                    disabled={isImporting || !localPath.trim()}
                    className="px-4 py-2 text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-xl transition-colors shrink-0"
                  >
                    {isImporting ? tx('导入中...', 'Importing...', 'インポート中...') : tx('导入插件', 'Import plugin', 'プラグインをインポート')}
                  </button>
                </div>

                {importMessage && (
                  <div className={`mt-3 p-3 rounded-xl text-xs flex items-center gap-2 ${importMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                    {importMessage.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                    <span>{importMessage.text}</span>
                  </div>
                )}
              </div>

              {/* 规范快速参考 */}
              <div className="bg-[var(--surface-bg)] rounded-2xl border border-[var(--border-subtle)] p-6 text-xs text-[var(--text-secondary)] space-y-3">
                <h5 className="font-bold text-[var(--text-dark)] flex items-center gap-1.5">
                  <Boxes size={15} className="text-indigo-600" /> {tx('标准插件结构参考 (Agent Plugin Specification)', 'Standard plugin structure (Agent Plugin Specification)', '標準プラグイン構成の参考 (Agent Plugin Specification)')}
                </h5>
                <pre className="p-3 bg-[var(--surface-inset)] rounded-xl text-[11px] font-mono text-[var(--text-dark)] overflow-x-auto">
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
            </div>
          )}
        </div>

        {/* 动态配置与参数填报弹窗 */}
        <AnimatePresence>
          {configModalPlugin && (
            <motion.div
              className="fixed inset-0 z-[160] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="bg-[var(--surface-bg)] rounded-2xl w-full max-w-lg shadow-2xl border border-[var(--border-subtle)] overflow-hidden flex flex-col"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--surface-bg-light)]">
                  <div className="flex items-center gap-2">
                    <Settings size={16} className="text-indigo-600" />
                    <h4 className="font-bold text-sm text-[var(--text-dark)]">
                      {tx('配置参数 -', 'Configuration -')} {configModalPlugin.name}
                    </h4>
                  </div>
                  <button
                    onClick={() => setConfigModalPlugin(null)}
                    className="p-1 hover:bg-[var(--surface-inset)] rounded-lg text-[var(--text-secondary)]"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
                  <p className="text-xs text-[var(--text-secondary)]">
                    {tx('请设置该插件所需的环境变量或参数，配置将安全保存在本地。', 'Set the environment variables or parameters required by this plugin. The configuration is stored securely on this device.', 'このプラグインに必要な環境変数やパラメータを設定してください。設定は安全にローカルへ保存されます。')}
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
                            className="w-full px-3 py-2 text-xs bg-[var(--surface-inset)] border border-[var(--border-subtle)] rounded-xl focus:outline-none focus:border-indigo-500 font-mono pr-9"
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

                <div className="px-5 py-3 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2 bg-[var(--surface-bg-light)]">
                  <button
                    onClick={() => setConfigModalPlugin(null)}
                    className="px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] rounded-xl transition-colors font-medium"
                  >
                    {tx('取消', 'Cancel', 'キャンセル')}
                  </button>
                  <button
                    onClick={handleSaveConfig}
                    disabled={isSavingConfig || Object.entries(configModalPlugin.configSchema || {}).some(([key, field]) => field.required && !String(configForm[key] ?? '').trim())}
                    className="px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors font-medium shadow-sm"
                  >
                    {isSavingConfig ? tx('保存中...', 'Saving...', '保存中...') : (configModalPlugin.isInstallingFromMarket ? tx('确认并安装', 'Confirm and install', '確認してインストール') : tx('保存配置', 'Save configuration', '設定を保存'))}
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
