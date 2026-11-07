'use strict';

const path = require('path');
const fs = require('fs-extra');
const AdmZip = require('adm-zip');
const { inflateRawSync } = require('zlib');
const { AsyncLocalStorage } = require('async_hooks');
const storeOperations = new Map();
const storeContext = new AsyncLocalStorage();
const ZIP_LIMITS = Object.freeze({ entries: 2000, fileSize: 32 * 1024 * 1024, totalSize: 128 * 1024 * 1024 });

function validateZipEntries(entries, limits = ZIP_LIMITS) {
    if (entries.length > limits.entries) throw new Error('Zip entry count exceeds limit.');
    let total = 0;
    const names = new Map();
    for (const entry of entries) {
        const name = entry.entryName;
        const parts = name.replace(/\/$/, '').split('/');
        if (!name || name.includes('\\') || name.startsWith('/') || parts.some(part =>
            !part || part === '.' || part === '..' || /[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part) ||
            /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
            throw new Error('Unsafe zip entry path.');
        }
        const mode = (entry.attr >>> 16) & 0xf000;
        if (mode && mode !== 0x8000 && mode !== 0x4000) throw new Error('Unsupported zip entry type.');
        const size = entry.header.size;
        if (entry.header.encrypted) throw new Error('Encrypted zip entries are not supported.');
        if (!Number.isSafeInteger(size) || size < 0 || size > limits.fileSize) throw new Error('Zip file size exceeds limit.');
        total += size;
        if (total > limits.totalSize) throw new Error('Zip total size exceeds limit.');
        const key = parts.join('/').toLowerCase();
        if (names.has(key)) throw new Error('Duplicate zip entry path.');
        names.set(key, entry.isDirectory);
    }
    for (const key of names.keys()) {
        const parts = key.split('/');
        while (parts.length > 1) {
            parts.pop();
            if (names.get(parts.join('/')) === false) throw new Error('Conflicting zip entry paths.');
        }
    }
}

/**
 * 校验插件 ID 的合法性（字母、数字、下划线、短横线，长度 2-64）
 */
function isValidPluginId(id) {
    return typeof id === 'string' && /^[a-z0-9][a-z0-9_-]{1,63}$/i.test(id) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(id);
}

/**
 * 校验插件 Manifest 清单格式规范
 */
function validateManifest(manifest) {
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
        throw new Error('Plugin manifest (plugin.json) must be a valid JSON object.');
    }
    if (!manifest.id || !isValidPluginId(manifest.id)) {
        throw new Error(`Invalid plugin 'id': "${manifest.id}". Must be 2-64 alphanumeric characters, underscores, or hyphens.`);
    }
    if (!manifest.name || typeof manifest.name !== 'string' || !manifest.name.trim()) {
        throw new Error(`Invalid plugin 'name': must be a non-empty string.`);
    }
    if (!manifest.version || typeof manifest.version !== 'string') {
        throw new Error(`Invalid plugin 'version': must be a valid version string.`);
    }

    if (manifest.configSchema) {
        if (typeof manifest.configSchema !== 'object' || Array.isArray(manifest.configSchema)) {
            throw new Error(`Invalid 'configSchema': must be an object defining configuration fields.`);
        }
        for (const [key, field] of Object.entries(manifest.configSchema)) {
            if (!field || typeof field !== 'object') {
                throw new Error(`Invalid config field descriptor for "${key}".`);
            }
        }
    }

    if (manifest.mcp) {
        const checkServer = (s, idx = '') => {
            if (!s || typeof s !== 'object') {
                throw new Error(`Invalid MCP server declaration ${idx}.`);
            }
            if (!s.command && !s.url) {
                throw new Error(`MCP server declaration ${idx} must specify at least 'command' (stdio) or 'url' (sse/http).`);
            }
        };
        if (Array.isArray(manifest.mcp)) {
            manifest.mcp.forEach(checkServer);
        } else if (typeof manifest.mcp === 'object') {
            if (manifest.mcp.command || manifest.mcp.url) {
                checkServer(manifest.mcp);
            } else {
                for (const [srvName, srvDef] of Object.entries(manifest.mcp)) {
                    checkServer(srvDef, `("${srvName}")`);
                }
            }
        }
    }

    return true;
}

/**
 * 变量插值引擎：递归解析配置与环境占位符
 * 支持:
 *   ${config.VAR} -> 用户配置项
 *   ${pluginDir}  -> 插件物理根目录绝对路径
 *   ${dataDir}    -> 系统数据目录绝对路径
 *   ${backendDir} -> 后端安装目录绝对路径
 *   ${env.VAR}    -> 系统环境变量
 */
function interpolateVariables(value, context) {
    if (typeof value === 'string') {
        return value.replace(/\$\{([^}]+)\}/g, (match, expr) => {
            const trimmed = expr.trim();
            if (trimmed === 'pluginDir') return context.pluginDir || '';
            if (trimmed === 'dataDir') return context.dataDir || '';
            if (trimmed === 'backendDir') return context.backendDir || '';
            if (trimmed.startsWith('config.')) {
                const key = trimmed.slice(7);
                return context.config?.[key] !== undefined ? String(context.config[key]) : '';
            }
            if (trimmed.startsWith('env.')) {
                const key = trimmed.slice(4);
                return process.env[key] !== undefined ? String(process.env[key]) : '';
            }
            return match;
        });
    }
    if (Array.isArray(value)) {
        return value.map(item => interpolateVariables(item, context));
    }
    if (value && typeof value === 'object') {
        const result = {};
        for (const [k, v] of Object.entries(value)) {
            result[k] = interpolateVariables(v, context);
        }
        return result;
    }
    return value;
}

/**
 * 从 markdown 内容中提取 YAML frontmatter
 */
function parseYamlFrontmatter(content = '') {
    const text = String(content || '');
    if (!text.startsWith('---')) return {};
    const end = text.indexOf('\n---', 3);
    if (end === -1) return {};
    const block = text.slice(3, end).trim();
    const result = {};
    for (const line of block.split(/\r?\n/)) {
        const idx = line.indexOf(':');
        if (idx > 0) {
            const key = line.slice(0, idx).trim();
            const val = line.slice(idx + 1).trim().replace(/^['"]+|['"]+$/g, '');
            result[key] = val;
        }
    }
    return result;
}

class PluginService {
    constructor({ dataDir, mcpManager = null, skillService = null }) {
        this.dataDir = path.resolve(dataDir);
        this.pluginsDir = path.join(this.dataDir, 'plugins');
        this.storePath = path.join(this.dataDir, 'plugins_store.json');
        this.mcpManager = mcpManager;
        this.skillService = skillService;
        this.initialized = false;
    }

    async init() {
        await fs.ensureDir(this.pluginsDir);
        if (!(await fs.pathExists(this.storePath))) {
            await fs.writeJson(this.storePath, { version: 1, plugins: [] }, { spaces: 2 });
        }
        await this.syncInstalledPlugins();
        this.initialized = true;
    }

    async loadStore() {
        if (!this.initialized) {
            await fs.ensureDir(this.pluginsDir);
        }
        try {
            const store = await fs.readJson(this.storePath);
            return {
                version: 1,
                plugins: Array.isArray(store.plugins) ? store.plugins : []
            };
        } catch {
            return { version: 1, plugins: [] };
        }
    }

    async saveStore(store) {
        await fs.writeJson(this.storePath, store, { spaces: 2 });
    }

    /**
     * 读取指定插件目录的 plugin.json 与 mcp.json
     */
    async readPluginDirectory(pluginDir) {
        const manifestPath = path.join(pluginDir, 'plugin.json');
        if (!(await fs.pathExists(manifestPath))) {
            return null;
        }
        const manifest = await fs.readJson(manifestPath);
        validateManifest(manifest);

        const mcpJsonPath = path.join(pluginDir, 'mcp.json');
        if (await fs.pathExists(mcpJsonPath)) {
            try {
                const externalMcp = await fs.readJson(mcpJsonPath);
                manifest.mcp = manifest.mcp || externalMcp.mcpServers || externalMcp;
            } catch (err) {
                console.warn(`[PluginService] Failed to parse mcp.json in ${pluginDir}:`, err.message);
            }
        }

        const skillsDir = path.join(pluginDir, 'skills');
        const discoveredSkills = [];
        if (await fs.pathExists(skillsDir)) {
            const entries = await fs.readdir(skillsDir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const skillFile = path.join(skillsDir, entry.name, 'SKILL.md');
                    if (await fs.pathExists(skillFile)) {
                        const content = await fs.readFile(skillFile, 'utf8');
                        const frontmatter = parseYamlFrontmatter(content);
                        discoveredSkills.push({
                            dirName: entry.name,
                            path: skillFile,
                            name: frontmatter.name || entry.name,
                            description: frontmatter.description || '',
                            content
                        });
                    }
                }
            }
        }

        return {
            manifest,
            pluginDir,
            discoveredSkills
        };
    }

    /**
     * 检查插件所需配置是否完整
     */
    checkMissingConfig(manifest, userConfig = {}) {
        const schema = manifest.configSchema || {};
        const missing = [];
        for (const [key, field] of Object.entries(schema)) {
            if (field.required) {
                const val = userConfig[key];
                if (val === undefined || val === null || String(val).trim() === '') {
                    missing.push({
                        key,
                        label: field.label || key,
                        description: field.description || '',
                        type: field.type || 'string'
                    });
                }
            }
        }
        return missing;
    }

    /**
     * 将插件的 MCP 配置格式化为标准 MCP Server 字典
     */
    formatMcpServers(pluginRecord, manifest, pluginDir) {
        if (!manifest.mcp) return {};
        const userConfig = pluginRecord.config || {};
        const context = {
            pluginDir,
            dataDir: this.dataDir,
            backendDir: path.resolve(__dirname, '..'),
            config: userConfig
        };

        const servers = {};
        const rawMcp = manifest.mcp;

        if (Array.isArray(rawMcp)) {
            rawMcp.forEach((srv, idx) => {
                const srvName = srv.serverName || `${manifest.id}_${idx + 1}`;
                servers[srvName] = interpolateVariables(srv, context);
            });
        } else if (typeof rawMcp === 'object') {
            if (rawMcp.command || rawMcp.url) {
                const srvName = rawMcp.serverName || manifest.id;
                servers[srvName] = interpolateVariables(rawMcp, context);
            } else {
                for (const [srvName, srvDef] of Object.entries(rawMcp)) {
                    servers[srvName] = interpolateVariables(srvDef, context);
                }
            }
        }

        return servers;
    }

    /**
     * 同步并注册插件附带的技能至 SkillService
     */
    async syncPluginSkills(pluginRecord, manifest, discoveredSkills) {
        if (!this.skillService) return;
        const isEnabled = pluginRecord.enabled !== false;
        await this.skillService.removeSkillsByPlugin(manifest.id, discoveredSkills.map(skill => skill.dirName));

        if (!isEnabled) {
            await this.skillService.setSkillsEnabledByPlugin(manifest.id, false);
            return;
        }

        for (const skill of discoveredSkills) {
            await this.skillService.upsertSkill({
                name: `${manifest.name} - ${skill.name}`,
                content: skill.content,
                description: skill.description || `${manifest.name} 专属技能`,
                sourceType: 'plugin',
                source: `plugin:${manifest.id}`,
                tags: Array.from(new Set([...(manifest.tags || []), 'plugin', manifest.id])),
                sourceMeta: {
                    pluginId: manifest.id,
                    pluginName: manifest.name,
                    skillDir: skill.dirName
                }
            });
        }
    }

    /**
     * 扫描磁盘并与 plugins_store.json 同步
     */
    async syncInstalledPlugins() {
        const store = await this.loadStore();
        const storeMap = new Map(store.plugins.map(p => [p.id, p]));
        const entries = await fs.readdir(this.pluginsDir, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isDirectory() && !entry.name.startsWith('_')) {
                const pluginDir = path.join(this.pluginsDir, entry.name);
                try {
                    const pluginData = await this.readPluginDirectory(pluginDir);
                    if (!pluginData) continue;
                    const { manifest, discoveredSkills } = pluginData;

                    let record = storeMap.get(manifest.id);
                    if (!record) {
                        record = {
                            id: manifest.id,
                            version: manifest.version,
                            enabled: true,
                            installedAt: new Date().toISOString(),
                            source: 'local',
                            config: {}
                        };
                        store.plugins.push(record);
                        storeMap.set(manifest.id, record);
                    } else {
                        record.version = manifest.version;
                    }

                    await this.syncPluginSkills(record, manifest, discoveredSkills);
                } catch (err) {
                    console.error(`[PluginService] Failed to load plugin in ${entry.name}:`, err.message);
                }
            }
        }

        await this.saveStore(store);
    }

    /**
     * 获取所有有效且已启用的插件 MCP 服务器集合（用于接入 MCPManager）
     */
    async getActiveMcpServers() {
        const store = await this.loadStore();
        const activeServers = {};

        for (const record of store.plugins) {
            if (record.enabled === false) continue;
            const pluginDir = path.join(this.pluginsDir, record.id);
            if (!(await fs.pathExists(pluginDir))) continue;

            try {
                const pluginData = await this.readPluginDirectory(pluginDir);
                if (!pluginData) continue;
                const { manifest } = pluginData;

                const missing = this.checkMissingConfig(manifest, record.config);
                if (missing.length > 0) {
                    continue;
                }

                const servers = this.formatMcpServers(record, manifest, pluginDir);
                Object.assign(activeServers, servers);
            } catch (err) {
                console.error(`[PluginService] Error generating MCP config for plugin ${record.id}:`, err.message);
            }
        }

        return activeServers;
    }

    /**
     * 列出所有已安装插件的完整状态
     */
    async listInstalled() {
        const store = await this.loadStore();
        const results = [];

        for (const record of store.plugins) {
            const pluginDir = path.join(this.pluginsDir, record.id);
            if (!(await fs.pathExists(pluginDir))) {
                results.push({
                    id: record.id,
                    version: record.version,
                    enabled: record.enabled !== false,
                    status: 'error',
                    error: 'Plugin directory missing on disk.',
                    installedAt: record.installedAt
                });
                continue;
            }

            try {
                const pluginData = await this.readPluginDirectory(pluginDir);
                if (!pluginData) continue;
                const { manifest, discoveredSkills } = pluginData;
                const missingConfig = this.checkMissingConfig(manifest, record.config);

                let status = record.enabled === false ? 'disabled' : 'active';
                if (record.enabled !== false && missingConfig.length > 0) {
                    status = 'missing_config';
                }

                results.push({
                    id: manifest.id,
                    name: manifest.name,
                    version: manifest.version,
                    description: manifest.description || '',
                    author: manifest.author || '',
                    category: manifest.category || 'utility',
                    tags: manifest.tags || [],
                    icon: manifest.icon || null,
                    enabled: record.enabled !== false,
                    status,
                    missingConfig,
                    configSchema: manifest.configSchema || {},
                    config: record.config || {},
                    skillsCount: discoveredSkills.length,
                    skills: discoveredSkills.map(s => ({ name: s.name, description: s.description })),
                    hasMcp: Boolean(manifest.mcp),
                    mcpServerNames: Object.keys(this.formatMcpServers(record, manifest, pluginDir)),
                    installedAt: record.installedAt,
                    source: record.source || 'local',
                    sourceMeta: record.sourceMeta || null,
                });
            } catch (err) {
                results.push({
                    id: record.id,
                    version: record.version,
                    enabled: record.enabled !== false,
                    status: 'error',
                    error: err.message,
                    installedAt: record.installedAt
                });
            }
        }

        return results;
    }

    /**
     * 获取单个插件详情
     */
    async getPlugin(pluginId) {
        const list = await this.listInstalled();
        return list.find(p => p.id === pluginId) || null;
    }

    /**
     * 切换插件的启用/禁用状态
     */
    async setPluginEnabled(pluginId, enabled) {
        const store = await this.loadStore();
        const record = store.plugins.find(p => p.id === pluginId);
        if (!record) {
            throw new Error(`Plugin "${pluginId}" is not installed.`);
        }

        record.enabled = Boolean(enabled);
        await this.saveStore(store);

        const pluginDir = path.join(this.pluginsDir, pluginId);
        if (await fs.pathExists(pluginDir)) {
            const pluginData = await this.readPluginDirectory(pluginDir);
            if (pluginData) {
                await this.syncPluginSkills(record, pluginData.manifest, pluginData.discoveredSkills);
                if (record.enabled && this.skillService) {
                    await this.skillService.setSkillsEnabledByPlugin(pluginId, true);
                }
            }
        }

        return this.getPlugin(pluginId);
    }

    /**
     * 保存插件的用户配置项（如 API Token / 端口等）
     */
    async savePluginConfig(pluginId, newConfig = {}) {
        const store = await this.loadStore();
        const record = store.plugins.find(p => p.id === pluginId);
        if (!record) {
            throw new Error(`Plugin "${pluginId}" is not installed.`);
        }

        record.config = {
            ...(record.config || {}),
            ...newConfig
        };
        await this.saveStore(store);

        return this.getPlugin(pluginId);
    }

    /**
     * 从本地文件夹安装插件
     */
    async installFromFolder(sourceFolder, { source = 'local', config = null, sourceMeta = null } = {}) {
        const manifestPath = path.join(sourceFolder, 'plugin.json');
        if (!(await fs.pathExists(manifestPath))) {
            throw new Error(`Target folder does not contain a valid 'plugin.json'.`);
        }
        const manifest = await fs.readJson(manifestPath);
        validateManifest(manifest);

        const targetDir = path.join(this.pluginsDir, manifest.id);
        const relativeTarget = path.relative(path.resolve(sourceFolder), path.resolve(targetDir));
        if (!relativeTarget || (!relativeTarget.startsWith(`..${path.sep}`) && relativeTarget !== '..' && !path.isAbsolute(relativeTarget))) {
            throw new Error('Cannot install a plugin from its own installed directory.');
        }
        await fs.ensureDir(this.pluginsDir);
        const originalStore = await this.loadStore();
        const staging = await fs.mkdtemp(path.join(this.pluginsDir, '_install_'));
        const backup = `${staging}_backup`;
        let backedUp = false;
        let replaced = false;
        let committed = false;
        let storeWriteAttempted = false;
        let skillsAttempted = false;
        const store = JSON.parse(JSON.stringify(originalStore));
        const oldRecord = originalStore.plugins.find(p => p.id === manifest.id);
        let oldPluginData;
        try {
            await fs.copy(sourceFolder, staging, {
                overwrite: true,
                filter: async file => {
                    if ((await fs.lstat(file)).isSymbolicLink()) throw new Error('Plugin symbolic links are not supported.');
                    return true;
                }
            });
            await this.readPluginDirectory(staging);
            if (await fs.pathExists(targetDir)) {
                oldPluginData = await this.readPluginDirectory(targetDir);
                await fs.move(targetDir, backup);
                backedUp = true;
            }
            await fs.move(staging, targetDir);
            replaced = true;

            let record = store.plugins.find(p => p.id === manifest.id);
            if (!record) {
                record = {
                    id: manifest.id,
                    version: manifest.version,
                    enabled: true,
                    installedAt: new Date().toISOString(),
                    source,
                    config: {}
                };
                store.plugins.push(record);
            } else {
                record.version = manifest.version;
                record.source = source;
            }
            if (config) record.config = { ...(record.config || {}), ...config };
            if (sourceMeta) record.sourceMeta = sourceMeta;
            storeWriteAttempted = true;
            await this.saveStore(store);

            const pluginData = await this.readPluginDirectory(targetDir);
            if (pluginData) {
                skillsAttempted = true;
                await this.syncPluginSkills(record, pluginData.manifest, pluginData.discoveredSkills);
            }

            const installed = await this.getPlugin(manifest.id);
            committed = true;
            return installed;
        } catch (error) {
            // Keep the backup if restoration itself fails; never discard the
            // last working directory merely because store/skills failed.
            if (replaced) await fs.remove(targetDir);
            if (backedUp) await fs.move(backup, targetDir);
            if (storeWriteAttempted) {
                await this.saveStore(originalStore).catch(rollbackError =>
                    console.error('[PluginService] Store rollback failed:', rollbackError.message));
            }
            if (skillsAttempted && this.skillService) {
                try {
                    if (oldRecord && oldPluginData) {
                        await this.syncPluginSkills(oldRecord, oldPluginData.manifest, oldPluginData.discoveredSkills);
                    } else {
                        await this.skillService.removeSkillsByPlugin(manifest.id);
                    }
                } catch (rollbackError) {
                    console.error('[PluginService] Skills rollback failed:', rollbackError.message);
                }
            }
            throw error;
        } finally {
            await fs.remove(staging);
            if (committed && backedUp) await fs.remove(backup);
        }
    }

    /**
     * 从 Zip 压缩包（路径或 Buffer）解压安装插件
     */
    async installFromZip(zipPathOrBuffer, { source = 'archive' } = {}) {
        const zip = new AdmZip(zipPathOrBuffer);
        const entries = zip.getEntries();
        validateZipEntries(entries);
        await fs.ensureDir(this.pluginsDir);
        const tempExtractDir = await fs.mkdtemp(path.join(this.pluginsDir, '_extract_tmp_'));

        try {
            let total = 0;
            for (const entry of entries) {
                const destination = path.join(tempExtractDir, entry.entryName);
                if (entry.isDirectory) {
                    await fs.ensureDir(destination);
                } else {
                    // Bound the inflater itself: a forged central-directory size must
                    // not permit an unbounded allocation before our post-check.
                    if (entry.header.method === 8) {
                        const bounded = inflateRawSync(entry.getCompressedData(), {
                            maxOutputLength: Math.max(1, Math.min(entry.header.size, ZIP_LIMITS.fileSize)),
                        });
                        if (bounded.length !== entry.header.size) throw new Error('Zip extracted size does not match header.');
                    } else if (entry.header.method !== 0) {
                        throw new Error('Unsupported zip compression method.');
                    } else if (entry.getCompressedData().length !== entry.header.size) {
                        throw new Error('Zip extracted size does not match header.');
                    }
                    const data = entry.getData();
                    total += data.length;
                    if (data.length !== entry.header.size || data.length > ZIP_LIMITS.fileSize || total > ZIP_LIMITS.totalSize) {
                        throw new Error('Zip extracted size exceeds limit or does not match header.');
                    }
                    await fs.outputFile(destination, data);
                }
            }

            let rootDir = tempExtractDir;
            if (!(await fs.pathExists(path.join(rootDir, 'plugin.json')))) {
                const subs = await fs.readdir(tempExtractDir, { withFileTypes: true });
                const dirEntry = subs.find(s => s.isDirectory());
                if (dirEntry && (await fs.pathExists(path.join(tempExtractDir, dirEntry.name, 'plugin.json')))) {
                    rootDir = path.join(tempExtractDir, dirEntry.name);
                } else {
                    throw new Error('Zip package does not contain a valid plugin.json at root or top directory.');
                }
            }

            const plugin = await this.installFromFolder(rootDir, { source });
            return plugin;
        } finally {
            await fs.remove(tempExtractDir).catch(() => {});
        }
    }

    /**
     * 卸载插件并彻底清理
     */
    async uninstall(pluginId) {
        const store = await this.loadStore();
        const index = store.plugins.findIndex(p => p.id === pluginId);
        if (index === -1) {
            throw new Error(`Plugin "${pluginId}" is not installed.`);
        }

        if (this.skillService) {
            await this.skillService.removeSkillsByPlugin(pluginId);
        }

        const pluginDir = path.join(this.pluginsDir, pluginId);
        await fs.remove(pluginDir).catch(() => {});

        store.plugins.splice(index, 1);
        await this.saveStore(store);

        return true;
    }
}

for (const method of ['init', 'loadStore', 'saveStore', 'syncInstalledPlugins', 'listInstalled', 'getActiveMcpServers', 'setPluginEnabled', 'savePluginConfig', 'installFromFolder', 'uninstall']) {
    const original = PluginService.prototype[method];
    PluginService.prototype[method] = function (...args) {
        const key = path.resolve(this.storePath);
        if (storeContext.getStore() === key) return original.apply(this, args);
        const result = (storeOperations.get(key) || Promise.resolve()).then(() =>
            storeContext.run(key, () => original.apply(this, args)));
        const tail = result.catch(() => {});
        storeOperations.set(key, tail);
        tail.then(() => { if (storeOperations.get(key) === tail) storeOperations.delete(key); });
        return result;
    };
}

module.exports = {
    PluginService,
    validateZipEntries,
    ZIP_LIMITS,
    validateManifest,
    interpolateVariables,
    parseYamlFrontmatter,
    isValidPluginId
};
