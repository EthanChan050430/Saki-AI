'use strict';

const path = require('path');
const os = require('os');
const crypto = require('crypto');
const fs = require('fs-extra');
const axios = require('axios');
const AdmZip = require('adm-zip');
const { isValidPluginId, validateManifest } = require('./plugins');

const PLUGIN_REPOSITORY = 'EthanChan050430/saki-plugins';
const REPOSITORY_URL = `https://github.com/${PLUGIN_REPOSITORY}`;
const MAX_PACKAGE_BYTES = 20 * 1024 * 1024;
const CATEGORY_MAP = { '开发': 'developer', '效率': 'utility', '网络': 'web', '数据': 'database', '办公': 'office' };

function safeRelativePath(value) {
    if (typeof value !== 'string' || !value || /[\\:\0]/.test(value)
        || value.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part))) {
        throw new Error(`Invalid repository file path: ${value}`);
    }
    return value;
}

function gitBlobSha(bytes) {
    return crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

async function mapConcurrent(items, action) {
    const results = new Array(items.length);
    let next = 0;
    // Settle every worker before returning, so cleanup cannot race a pending write.
    const workers = await Promise.allSettled(Array.from({ length: Math.min(4, items.length) }, async () => {
        while (next < items.length) {
            const index = next++;
            results[index] = await action(items[index], index);
        }
    }));
    const failed = workers.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
    return results;
}

function normalizeBundle(manifest, externalMcp, registryEntry) {
    if (manifest.type !== 'bundle' || manifest.name !== registryEntry.name || !isValidPluginId(manifest.name)) {
        throw new Error(`Invalid functional plugin manifest: ${registryEntry.name}`);
    }
    const servers = externalMcp?.mcpServers || externalMcp || {};
    const configSchema = { ...(manifest.configSchema || {}) };
    // The upstream GitHub bundle reads this environment variable from its host.
    // Expose it in this app's configuration form instead of requiring a shell edit.
    if (manifest.name === 'saki-github') {
        configSchema.GITHUB_PERSONAL_ACCESS_TOKEN = {
            type: 'string', label: 'GitHub 访问令牌 (PAT)', secret: true, required: true,
            description: '用于访问 GitHub 仓库的个人访问令牌', placeholder: 'ghp_...',
        };
        for (const server of Object.values(servers)) {
            server.env = { ...(server.env || {}), GITHUB_PERSONAL_ACCESS_TOKEN: '${config.GITHUB_PERSONAL_ACCESS_TOKEN}' };
        }
    }
    const category = manifest.interface?.category || registryEntry.category || 'utility';
    const normalized = {
        id: manifest.name,
        name: manifest.displayName || manifest.name,
        version: manifest.version,
        description: manifest.description || registryEntry.description || '',
        author: manifest.author || registryEntry.author || '',
        category: CATEGORY_MAP[category] || category,
        tags: Array.isArray(manifest.tags) ? manifest.tags : ['github', 'bundle'],
        configSchema,
        // Isolate repository servers from user-defined and built-in server names.
        ...(Object.keys(servers).length ? {
            mcp: Object.fromEntries(Object.entries(servers).map(([name, server]) => [`${manifest.name}__${name}`, server])),
        } : {}),
    };
    validateManifest(normalized);
    return normalized;
}

class GithubPluginRepository {
    constructor({ request = async (url, options) => (await axios.get(url, {
        timeout: 15000, maxContentLength: MAX_PACKAGE_BYTES,
        headers: { 'User-Agent': 'Saki-AI-Plugin-Marketplace' }, ...options,
    })).data, cacheTtlMs = 5 * 60 * 1000 } = {}) {
        this.request = request;
        this.cacheTtlMs = cacheTtlMs;
        this.snapshot = null;
        this.pending = null;
        this.error = null;
        this.failedAt = 0;
        this.installing = new Set();
    }

    getStatus() {
        return {
            repository: PLUGIN_REPOSITORY, url: REPOSITORY_URL,
            loadedAt: this.snapshot?.loadedAt || null,
            revision: this.snapshot?.revision || null,
            transport: this.snapshot?.transport || null,
            error: this.error, stale: Boolean(this.error && this.snapshot),
        };
    }

    rawUrl(revision, filePath) {
        return `https://raw.githubusercontent.com/${PLUGIN_REPOSITORY}/${revision}/${safeRelativePath(filePath).split('/').map(encodeURIComponent).join('/')}`;
    }

    async readFile(revision, file) {
        const bytes = Buffer.from(await this.request(this.rawUrl(revision, file.path), { responseType: 'arraybuffer' }));
        if (bytes.length > MAX_PACKAGE_BYTES || gitBlobSha(bytes) !== file.sha) {
            throw new Error(`Downloaded file failed integrity verification: ${file.path}`);
        }
        return bytes;
    }

    async fetchSnapshot() {
        try {
            return await this.fetchApiSnapshot();
        } catch (error) {
            if (![403, 429].includes(error.response?.status)) throw error;
            return this.fetchArchiveSnapshot();
        }
    }

    async fetchApiSnapshot() {
        const commit = await this.request(`https://api.github.com/repos/${PLUGIN_REPOSITORY}/commits/HEAD`);
        if (!/^[a-f0-9]{40}$/i.test(commit?.sha || '')) throw new Error('Invalid GitHub commit response');
        const revision = commit.sha;
        const [registryBytes, tree] = await Promise.all([
            this.request(this.rawUrl(revision, 'registry.json'), { responseType: 'arraybuffer' }),
            this.request(`https://api.github.com/repos/${PLUGIN_REPOSITORY}/git/trees/${revision}?recursive=1`),
        ]);
        if (!Array.isArray(tree?.tree) || tree.truncated) throw new Error('Incomplete GitHub repository file list');
        return this.buildSnapshot(revision, registryBytes, tree.tree);
    }

    async fetchArchiveSnapshot() {
        // Public Atom and codeload endpoints do not consume the anonymous REST quota.
        const feed = await this.request(`${REPOSITORY_URL}/commits/HEAD.atom`, { responseType: 'text', maxContentLength: 2 * 1024 * 1024 });
        const revision = String(feed).match(/<id>tag:github.com,2008:Grit::Commit\/([a-f0-9]{40})<\/id>/)?.[1];
        if (!revision) throw new Error('Invalid GitHub commit feed');
        if (this.snapshot?.revision === revision) {
            return { ...this.snapshot, transport: 'archive', loadedAt: new Date().toISOString() };
        }
        const archive = Buffer.from(await this.request(`https://codeload.github.com/${PLUGIN_REPOSITORY}/zip/${revision}`, {
            responseType: 'arraybuffer', timeout: 60000, maxContentLength: 64 * 1024 * 1024,
        }));
        if (archive.length > 64 * 1024 * 1024) throw new Error('Repository archive is too large');
        const entries = new AdmZip(archive).getEntries();
        if (entries.length > 10000 || entries.reduce((sum, entry) => sum + entry.header.size, 0) > 128 * 1024 * 1024) {
            throw new Error('Repository archive expands beyond the supported size');
        }
        const root = entries[0]?.entryName.split('/')[0] + '/';
        const registryEntry = entries.find(entry => entry.entryName === `${root}registry.json`);
        if (!registryEntry) throw new Error('Repository archive does not contain registry.json');
        const registryBytes = registryEntry.getData();
        const registry = JSON.parse(registryBytes.toString('utf8'));
        if (!Array.isArray(registry)) throw new Error('Invalid plugin registry');
        const ids = new Set(registry.filter(entry => entry?.type === 'bundle').map(entry => entry.name));
        const selected = entries.filter(entry => !entry.isDirectory && entry.entryName.startsWith(root)
            && entry.entryName.slice(root.length).startsWith('plugins/')
            && ids.has(entry.entryName.slice(root.length).split('/')[1]));
        if (selected.reduce((sum, entry) => sum + entry.header.size, 0) > MAX_PACKAGE_BYTES) throw new Error('Functional plugins exceed the supported size');
        const buffers = new Map();
        const files = selected.map(entry => {
            const filePath = safeRelativePath(entry.entryName.slice(root.length));
            const unixType = (entry.attr >>> 16) & 0o170000;
            if (unixType && unixType !== 0o100000) throw new Error(`Unsupported repository file: ${filePath}`);
            const bytes = entry.getData();
            buffers.set(filePath, bytes);
            return { path: filePath, type: 'blob', mode: '100644', size: bytes.length, sha: gitBlobSha(bytes) };
        });
        // Keep only functional-plugin bytes; the archive and all other assets can be released.
        return this.buildSnapshot(revision, registryBytes, files, file => buffers.get(file.path), 'archive');
    }

    async buildSnapshot(revision, registryBytes, treeFiles, readFile = file => this.readFile(revision, file), transport = 'api') {
        const registry = JSON.parse(Buffer.from(registryBytes).toString('utf8'));
        if (!Array.isArray(registry)) throw new Error('Invalid plugin registry');
        const entries = registry.filter(entry => entry?.type === 'bundle'
            && (!entry.repo || entry.repo.toLowerCase() === PLUGIN_REPOSITORY.toLowerCase()));
        const items = await mapConcurrent(entries, async entry => {
            if (!isValidPluginId(entry.name) || entry.name !== entry.name.trim()) throw new Error('Invalid registry plugin ID');
            const root = `plugins/${entry.name}/`;
            const files = treeFiles.filter(file => file.path.startsWith(root) && file.type !== 'tree');
            if (!files.length || files.length > 200 || files.reduce((sum, file) => sum + file.size, 0) > MAX_PACKAGE_BYTES) {
                throw new Error(`Invalid plugin package size: ${entry.name}`);
            }
            for (const file of files) {
                safeRelativePath(file.path.slice(root.length));
                if (file.type !== 'blob' || !['100644', '100755'].includes(file.mode)
                    || !Number.isSafeInteger(file.size) || file.size < 0) throw new Error(`Unsupported repository file: ${file.path}`);
            }
            const manifestFile = files.find(file => file.path === `${root}saki-plugin.json`);
            if (!manifestFile) throw new Error(`Missing saki-plugin.json: ${entry.name}`);
            const prefetched = new Map();
            if (transport === 'archive') {
                for (const file of files) prefetched.set(file.path, await readFile(file));
            }
            const readJson = async file => {
                const bytes = prefetched.get(file.path) || await readFile(file);
                prefetched.set(file.path, bytes);
                return JSON.parse(bytes.toString('utf8'));
            };
            const upstream = await readJson(manifestFile);
            if (upstream.skills && upstream.skills !== 'skills') throw new Error(`Unsupported skills directory: ${entry.name}`);
            const mcpFile = files.find(file => file.path === `${root}.mcp.json` || file.path === `${root}mcp.json`);
            const mcp = mcpFile ? await readJson(mcpFile) : null;
            const manifest = normalizeBundle(upstream, mcp, entry);
            const skills = files.filter(file => /^skills\/[^/]+\/SKILL\.md$/.test(file.path.slice(root.length)))
                .map(file => file.path.slice(root.length).split('/')[1]);
            const servers = mcp?.mcpServers || mcp || {};
            const requirements = [...new Set(Object.values(servers).map(server =>
                ['node', 'npx', 'npx.cmd'].includes(server.command) ? 'Node.js / npx'
                    : server.command === 'uvx' ? 'Python / uvx' : server.command).filter(Boolean))];
            return { root, files, prefetched, manifest, catalog: {
                ...manifest, mcp: undefined, source: 'github', repository: PLUGIN_REPOSITORY,
                sourceUrl: `${REPOSITORY_URL}/tree/${revision}/${root.slice(0, -1)}`,
                mcpServersSummary: Object.keys(servers), skillsSummary: skills, requirements,
            } };
        });
        return { revision, items, transport, loadedAt: new Date().toISOString() };
    }

    async load({ refresh = false } = {}) {
        if (this.pending) return this.pending;
        if (!refresh && ((this.snapshot && Date.now() - Date.parse(this.snapshot.loadedAt) < this.cacheTtlMs)
            || (this.error && Date.now() - this.failedAt < 60000))) return this.snapshot;
        this.pending = this.fetchSnapshot().then(snapshot => {
            this.snapshot = snapshot;
            this.error = null;
            return snapshot;
        }).catch(error => {
            this.failedAt = Date.now();
            this.error = `无法同步 GitHub 插件仓库：${error.message}`;
            return this.snapshot;
        }).finally(() => { this.pending = null; });
        return this.pending;
    }

    async getCatalog(options) {
        const snapshot = await this.load(options);
        return snapshot?.items.map(item => item.catalog) || [];
    }

    async install(pluginId, pluginService, config = {}) {
        const snapshot = await this.load();
        const item = snapshot?.items.find(item => item.manifest.id === pluginId);
        if (!item) throw new Error(this.error || `Repository plugin '${pluginId}' not found`);
        if (this.installing.has(pluginId)) throw new Error('该插件正在下载，请稍后重试');
        this.installing.add(pluginId);
        const tempRoot = path.resolve(os.tmpdir());
        let staging;
        try {
            staging = await fs.mkdtemp(path.join(tempRoot, 'saki-plugin-download-'));
            await mapConcurrent(item.files, async file => {
                const relative = safeRelativePath(file.path.slice(item.root.length));
                const bytes = item.prefetched.get(file.path) || await this.readFile(snapshot.revision, file);
                await fs.outputFile(path.join(staging, relative), bytes);
            });
            await fs.writeJson(path.join(staging, 'plugin.json'), item.manifest, { spaces: 2 });
            return await pluginService.installFromFolder(staging, {
                source: 'github', config,
                sourceMeta: { repository: PLUGIN_REPOSITORY, revision: snapshot.revision, path: item.root.slice(0, -1) },
            });
        } finally {
            this.installing.delete(pluginId);
            if (staging && path.dirname(path.resolve(staging)) === tempRoot
                && path.basename(staging).startsWith('saki-plugin-download-')) await fs.remove(staging);
        }
    }
}

module.exports = { GithubPluginRepository, PLUGIN_REPOSITORY, gitBlobSha };
