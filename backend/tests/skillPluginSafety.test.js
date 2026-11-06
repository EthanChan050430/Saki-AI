'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('fs-extra');
const AdmZip = require('adm-zip');
const { SkillService, buildClawHubInvocation } = require('../services/skills');
const { PluginService, validateZipEntries, ZIP_LIMITS } = require('../services/plugins');
const { publicPlugin, registerPluginRoutes } = require('../services/pluginRoutes');
const { MarketplaceService } = require('../services/marketplace');

async function fixture(t) {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'saki-plugin-safety-'));
    t.after(() => fs.remove(dataDir));
    const skills = new SkillService({ dataDir });
    const plugins = new PluginService({ dataDir, skillService: skills });
    await skills.init();
    await plugins.init();
    return { dataDir, skills, plugins };
}

test('default migration retains both defaults, canonical files and unrelated paths', async t => {
    const { dataDir, skills } = await fixture(t);
    const canonical = path.join(skills.skillsDir, 'elite-longterm-memory', 'SKILL.md');
    const find = path.join(skills.skillsDir, 'find-skill-find-skill', 'SKILL.md');
    const legacy = path.join(skills.skillsDir, 'legacy-memory', 'SKILL.md');
    const outside = path.join(dataDir, 'outside', 'SKILL.md');
    await fs.outputFile(canonical, '# Elite Longterm Memory\nCanonical content');
    await fs.outputFile(find, '# Find Skill\nDiscovery content');
    await fs.outputFile(legacy, '# Legacy');
    await fs.outputFile(outside, '# Must survive');
    await fs.writeJson(skills.storePath, { skills: [
        { id: 'legacy', name: 'Elite Longterm Memory', path: legacy, content: '# Old' },
        { id: 'elite-longterm-memory', path: canonical, content: '# Canonical', enabled: false },
        { id: 'no-path', name: 'Elite Longterm Memory', path: '' },
        { id: 'outside', name: 'Elite Longterm Memory', path: outside },
        { id: 'find-old', name: 'Find Skill', content: '# Old discovery' },
    ] });
    await skills.ensureDefaultSkills();
    const first = await fs.readJson(skills.storePath);
    assert.deepEqual(first.skills.map(s => s.id).sort(), ['elite-longterm-memory', 'find-skill-find-skill']);
    assert.equal(first.skills.find(s => s.id === 'elite-longterm-memory').enabled, false);
    for (const file of [canonical, find, outside]) assert.equal(await fs.pathExists(file), true);
    assert.equal(await fs.pathExists(path.dirname(legacy)), false);
    await skills.ensureDefaultSkills();
    assert.deepEqual(await fs.readJson(skills.storePath), first);
});

test('ClawHub Windows invocation passes hostile text only as node argv, with no cmd quoting', () => {
    const hostile = ['search', '" & echo injected & "', '%PATH%', '!COMSPEC!', '$(touch pwn)', '中文'];
    const invocation = buildClawHubInvocation(hostile, { platform: 'win32', npxCli: 'C:\\Program Files\\nodejs\\npx-cli.js' });
    assert.equal(invocation.command, process.execPath);
    assert.deepEqual(invocation.args.slice(3), hostile);
    assert.throws(() => buildClawHubInvocation(hostile, { platform: 'win32' }), /shell-free/);
    assert.throws(() => buildClawHubInvocation(['bad\0arg']), /Invalid/);
    assert.equal(buildClawHubInvocation(['search', 'weather'], { platform: 'linux' }).command, 'npx');
});

test('plugin skill identity is pluginId plus skillDir, not display name', async t => {
    const { skills } = await fixture(t);
    const manual = await skills.upsertSkill({ name: 'Same Name', content: '# Manual' });
    const input = { name: 'Same Name', content: '# Plugin', sourceType: 'plugin' };
    const a = await skills.upsertSkill({ ...input, sourceMeta: { pluginId: 'aa', skillDir: 'one' } });
    const b = await skills.upsertSkill({ ...input, sourceMeta: { pluginId: 'bb', skillDir: 'one' } });
    const c = await skills.upsertSkill({ ...input, sourceMeta: { pluginId: 'aa', skillDir: 'two' } });
    assert.equal(new Set([manual.id, a.id, b.id, c.id]).size, 4);
    const renamed = await skills.upsertSkill({ ...input, name: 'Renamed', sourceMeta: { pluginId: 'aa', skillDir: 'one' } });
    assert.equal(renamed.id, a.id);
    assert.equal((await skills.listSkills()).length, 4);
    await skills.removeSkillsByPlugin('aa', ['one']);
    assert.ok(await skills.getSkill(b.id));
    assert.equal((await skills.listSkills()).some(skill => skill.id === c.id), false);
});

test('upgrade replaces old files and removes stale bundled skills, preserving config and disable state', async t => {
    const { dataDir, skills, plugins } = await fixture(t);
    const source = path.join(dataDir, 'source');
    const manifest = { id: 'upgrade-test', name: 'Upgrade', version: '1' };
    await fs.outputJson(path.join(source, 'plugin.json'), manifest);
    await fs.outputFile(path.join(source, 'obsolete.js'), 'old');
    await fs.outputFile(path.join(source, 'skills', 'old', 'SKILL.md'), '# Old');
    await plugins.installFromFolder(source, { config: { TOKEN: 'keep' } });
    await plugins.setPluginEnabled(manifest.id, false);
    await fs.remove(source);
    await fs.outputJson(path.join(source, 'plugin.json'), { ...manifest, version: '2' });
    await fs.outputFile(path.join(source, 'skills', 'new', 'SKILL.md'), '# New');
    await plugins.installFromFolder(source);
    assert.equal(await fs.pathExists(path.join(plugins.pluginsDir, manifest.id, 'obsolete.js')), false);
    assert.equal(await fs.pathExists(path.join(plugins.pluginsDir, manifest.id, 'skills', 'old')), false);
    assert.equal((await skills.listSkills()).some(s => s.sourceMeta?.skillDir === 'old'), false);
    const installed = await plugins.getPlugin(manifest.id);
    assert.equal(installed.config.TOKEN, 'keep');
    assert.equal(installed.enabled, false);
    await plugins.setPluginEnabled(manifest.id, true);
    assert.deepEqual((await skills.listSkills()).map(s => s.sourceMeta.skillDir), ['new']);
    await assert.rejects(plugins.installFromFolder(path.join(plugins.pluginsDir, manifest.id)), /own installed/);
});

test('failed upgrades restore the old directory, store and bundled skills', async t => {
    for (const failure of ['store', 'skills']) {
        const { dataDir, skills, plugins } = await fixture(t);
        const source = path.join(dataDir, 'source');
        const manifest = { id: 'rollback-test', name: 'Rollback', version: '1' };
        await fs.outputJson(path.join(source, 'plugin.json'), manifest);
        await fs.outputFile(path.join(source, 'old.txt'), 'working');
        await fs.outputFile(path.join(source, 'skills', 'old', 'SKILL.md'), '# Old');
        await plugins.installFromFolder(source, {
            config: { TOKEN: 'keep' }, sourceMeta: { revision: 'old' },
        });
        const originalStore = await plugins.loadStore();
        await fs.remove(source);
        await fs.outputJson(path.join(source, 'plugin.json'), { ...manifest, version: '2' });
        await fs.outputFile(path.join(source, 'skills', 'new', 'SKILL.md'), '# New');

        const method = failure === 'store' ? 'saveStore' : 'syncPluginSkills';
        const original = plugins[method];
        let injected = false;
        plugins[method] = async function (...args) {
            if (!injected) {
                injected = true;
                assert.ok((await fs.readdir(this.pluginsDir)).some(name => name.endsWith('_backup')));
                // Fail after the side effect to exercise partial commits too.
                await original.apply(this, args);
                throw new Error(`injected ${failure} failure`);
            }
            return original.apply(this, args);
        };
        try {
            await assert.rejects(plugins.installFromFolder(source, {
                config: { TOKEN: 'replacement' }, sourceMeta: { revision: 'new' },
            }), new RegExp(`injected ${failure} failure`));
        } finally {
            plugins[method] = original;
        }
        const target = path.join(plugins.pluginsDir, manifest.id);
        assert.equal((await fs.readJson(path.join(target, 'plugin.json'))).version, '1');
        assert.equal(await fs.readFile(path.join(target, 'old.txt'), 'utf8'), 'working');
        assert.deepEqual(await plugins.loadStore(), originalStore);
        assert.deepEqual((await skills.listSkills()).map(skill => skill.sourceMeta.skillDir), ['old']);
        assert.deepEqual(await fs.readdir(plugins.pluginsDir), [manifest.id]);
    }
});

test('failed first install removes its directory, store record and partial skills', async t => {
    const { dataDir, skills, plugins } = await fixture(t);
    const source = path.join(dataDir, 'source');
    await fs.outputJson(path.join(source, 'plugin.json'), { id: 'new-failure', name: 'New', version: '1' });
    await fs.outputFile(path.join(source, 'skills', 'new', 'SKILL.md'), '# New');
    const original = plugins.syncPluginSkills;
    plugins.syncPluginSkills = async function (...args) {
        await original.apply(this, args);
        throw new Error('injected skill failure');
    };
    await assert.rejects(plugins.installFromFolder(source), /injected skill failure/);
    assert.deepEqual((await plugins.loadStore()).plugins, []);
    assert.deepEqual(await fs.readdir(plugins.pluginsDir), []);
    assert.deepEqual(await skills.listSkills(), []);
});

test('complete readers hold the shared lock until directory reads finish', async t => {
    for (const method of ['listInstalled', 'getActiveMcpServers']) {
        const { dataDir, plugins } = await fixture(t);
        const source = path.join(dataDir, 'source');
        const manifest = { id: 'read-lock', name: 'Read Lock', version: '1', mcp: { command: 'node' } };
        await fs.outputJson(path.join(source, 'plugin.json'), manifest);
        await plugins.installFromFolder(source);
        const second = new PluginService({ dataDir });
        let release;
        let entered;
        const gate = new Promise(resolve => { release = resolve; });
        const reading = new Promise(resolve => { entered = resolve; });
        const original = plugins.readPluginDirectory;
        plugins.readPluginDirectory = async function (...args) {
            entered();
            await gate;
            return original.apply(this, args);
        };
        const reader = plugins[method]();
        await reading;
        let writerEntered = false;
        const originalLoad = second.loadStore;
        second.loadStore = function (...args) {
            writerEntered = true;
            return originalLoad.apply(this, args);
        };
        const writer = second.savePluginConfig(manifest.id, { TOKEN: 'new' });
        try {
            await new Promise(resolve => setImmediate(resolve));
            assert.equal(writerEntered, false, method);
        } finally {
            release();
            await Promise.all([reader, writer]);
            plugins.readPluginDirectory = original;
        }
        assert.equal((await plugins.getPlugin(manifest.id)).config.TOKEN, 'new');
    }
});

test('readers wait through the directory replacement gap across service instances', async t => {
    const { dataDir, plugins } = await fixture(t);
    const source = path.join(dataDir, 'source');
    const manifest = { id: 'replace-lock', name: 'Replace Lock', version: '1', mcp: { command: 'node' } };
    await fs.outputJson(path.join(source, 'plugin.json'), manifest);
    await plugins.installFromFolder(source);
    await fs.writeJson(path.join(source, 'plugin.json'), { ...manifest, version: '2' });
    let release;
    let entered;
    const gate = new Promise(resolve => { release = resolve; });
    const replacing = new Promise(resolve => { entered = resolve; });
    const originalMove = fs.move;
    const target = path.join(plugins.pluginsDir, manifest.id);
    const moveMock = t.mock.method(fs, 'move', async (from, to, ...args) => {
        if (to === target && !from.endsWith('_backup')) {
            entered();
            await gate;
        }
        return originalMove(from, to, ...args);
    });
    const install = plugins.installFromFolder(source);
    await replacing;
    assert.equal(await fs.pathExists(target), false);
    const reader = new PluginService({ dataDir });
    let completed = 0;
    const list = reader.listInstalled().then(value => { completed++; return value; });
    const mcp = reader.getActiveMcpServers().then(value => { completed++; return value; });
    try {
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(completed, 0);
    } finally {
        release();
        await Promise.all([install, list, mcp]);
        moveMock.mock.restore();
    }
    assert.equal((await list)[0].version, '2');
    assert.equal((await list)[0].status, 'active');
    assert.ok((await mcp)[manifest.id]);
});

test('builtin marketplace delegates replacement and preserves existing state and metadata', async t => {
    const { dataDir, plugins, skills } = await fixture(t);
    const marketplace = new MarketplaceService({ pluginService: plugins, repository: null });
    const originalInstall = plugins.installFromFolder;
    const calls = [];
    plugins.installFromFolder = async function (folder, options) {
        calls.push({ folder, options });
        assert.equal(await fs.pathExists(path.join(folder, 'plugin.json')), true);
        return originalInstall.call(this, folder, options);
    };
    const installed = await marketplace.installFromMarketplace('github-workflow', { GITHUB_PERSONAL_ACCESS_TOKEN: 'keep' });
    const store = await plugins.loadStore();
    store.plugins[0].sourceMeta = { revision: 'existing' };
    await plugins.saveStore(store);
    await plugins.setPluginEnabled(installed.id, false);
    await fs.outputFile(path.join(plugins.pluginsDir, installed.id, 'obsolete.txt'), 'old');
    const second = new PluginService({ dataDir });
    const [updated] = await Promise.all([
        marketplace.installFromMarketplace(installed.id, { EXTRA: 'added' }),
        second.savePluginConfig(installed.id, { CONCURRENT: 'preserved' }),
    ]);
    const final = await plugins.getPlugin(installed.id);
    assert.equal(updated.source, 'marketplace');
    assert.equal(final.enabled, false);
    assert.equal(final.installedAt, installed.installedAt);
    assert.deepEqual(final.sourceMeta, { revision: 'existing' });
    assert.deepEqual(final.config, { GITHUB_PERSONAL_ACCESS_TOKEN: 'keep', EXTRA: 'added', CONCURRENT: 'preserved' });
    assert.equal(await fs.pathExists(path.join(plugins.pluginsDir, installed.id, 'obsolete.txt')), false);
    assert.equal(final.skillsCount, 2);
    assert.equal((await skills.listSkills({ enabledOnly: true })).length, 0);
    assert.equal(calls.length, 2);
    for (const call of calls) {
        assert.equal(call.options.source, 'marketplace');
        assert.equal(await fs.pathExists(call.folder), false);
    }
    assert.deepEqual(await fs.readdir(plugins.pluginsDir), [installed.id]);
});

function entry(name, size = 1, attr = 0) {
    return { entryName: name, header: { size }, attr, isDirectory: name.endsWith('/') };
}

test('ZIP preflight rejects traversal, Windows aliases, links, conflicts and all size limits', () => {
    for (const name of ['../escape', '/absolute', 'C:/escape', 'x\\escape', 'x/../escape', 'x//y', 'x/file:stream', 'NUL.txt', 'x./y', 'x /y', 'x\0y']) {
        assert.throws(() => validateZipEntries([entry(name)]), /Unsafe/);
    }
    assert.throws(() => validateZipEntries([entry('link', 1, 0xa000 << 16)]), /type/);
    assert.throws(() => validateZipEntries([entry('a'), entry('A')]), /Duplicate/);
    assert.throws(() => validateZipEntries([entry('a'), entry('a/b')]), /Conflicting/);
    assert.throws(() => validateZipEntries([entry('big', ZIP_LIMITS.fileSize + 1)]), /file size/);
    assert.throws(() => validateZipEntries(Array.from({ length: ZIP_LIMITS.entries + 1 }, (_, i) => entry(`f${i}`))), /count/);
    assert.throws(() => validateZipEntries(Array.from({ length: 5 }, (_, i) => entry(`f${i}`, ZIP_LIMITS.fileSize))), /total size/);
    assert.doesNotThrow(() => validateZipEntries([entry('skills/', 0), entry('skills/test/SKILL.md')]));
});

test('valid local ZIP installs and cleans temporary directories', async t => {
    const { plugins } = await fixture(t);
    const zip = new AdmZip();
    zip.addFile('bundle/plugin.json', Buffer.from(JSON.stringify({ id: 'zip-test', name: 'ZIP', version: '1' })));
    zip.addFile('bundle/skills/test/SKILL.md', Buffer.from('# ZIP skill'));
    const installed = await plugins.installFromZip(zip.toBuffer());
    assert.equal(installed.id, 'zip-test');
    assert.equal(installed.skillsCount, 1);
    assert.deepEqual(await fs.readdir(plugins.pluginsDir), ['zip-test']);
});

test('whole-operation serialization preserves concurrent writes across service instances', async t => {
    const { dataDir, skills, plugins } = await fixture(t);
    const secondSkills = new SkillService({ dataDir });
    await Promise.all(Array.from({ length: 16 }, (_, i) => (i % 2 ? secondSkills : skills).upsertSkill({ name: `Skill ${i}`, content: `# ${i}` })));
    assert.equal((await skills.listSkills()).length, 16);
    const source = path.join(dataDir, 'source');
    await fs.outputJson(path.join(source, 'plugin.json'), { id: 'concurrent-test', name: 'Concurrent', version: '1' });
    await plugins.installFromFolder(source);
    const secondPlugins = new PluginService({ dataDir });
    await Promise.all(Array.from({ length: 16 }, (_, i) => (i % 2 ? secondPlugins : plugins).savePluginConfig('concurrent-test', { [`key${i}`]: i })));
    assert.equal(Object.keys((await plugins.getPlugin('concurrent-test')).config).length, 16);
    await assert.rejects(plugins.savePluginConfig('missing', {}));
    await plugins.savePluginConfig('concurrent-test', { afterFailure: true });
    assert.equal((await plugins.getPlugin('concurrent-test')).config.afterFailure, true);
});

test('MCP names follow single, array and dictionary declarations and external mcp.json', async t => {
    const { dataDir, plugins } = await fixture(t);
    const manifest = { id: 'names-test', name: 'Names', version: '1' };
    for (const [mcp, expected] of [
        [{ command: 'node', serverName: 'custom' }, ['custom']],
        [[{ command: 'node' }, { command: 'node', serverName: 'second' }], ['names-test_1', 'second']],
        [{ alpha: { command: 'node' }, beta: { url: 'https://example.test' } }, ['alpha', 'beta']],
    ]) {
        assert.deepEqual(Object.keys(plugins.formatMcpServers({}, { ...manifest, mcp }, dataDir)), expected);
    }
    const source = path.join(dataDir, 'external');
    await fs.outputJson(path.join(source, 'plugin.json'), manifest);
    await fs.outputJson(path.join(source, 'mcp.json'), { mcpServers: { external: { command: 'node' } } });
    assert.deepEqual((await plugins.installFromFolder(source)).mcpServerNames, ['external']);
});

test('API preserves local editor config but omits resolved MCP definitions and raw transport errors', async () => {
    const plugin = { id: 'test-plugin', config: { TOKEN: 'top-secret' }, mcp: { env: { TOKEN: 'resolved-secret' } }, mcpServerNames: ['alpha', 'beta'] };
    const status = { alpha: { connected: true, toolCount: 2, config: plugin.config }, beta: { connected: false, error: 'top-secret' }, 'test-plugin': { connected: true, toolCount: 100 } };
    const result = publicPlugin(plugin, status);
    assert.equal(result.mcpStatus.connected, false);
    assert.equal(result.mcpStatus.toolCount, 2);
    assert.deepEqual(result.config, plugin.config);
    assert.equal(Object.hasOwn(result, 'mcp'), false);
    assert.equal(JSON.stringify(result.mcpStatus).includes('top-secret'), false);
    const routes = new Map();
    const app = Object.fromEntries(['get', 'post', 'patch', 'delete'].map(method => [method, (url, ...handlers) => routes.set(`${method} ${url}`, handlers.at(-1))]));
    registerPluginRoutes(app, {
        pluginService: { listInstalled: async () => [plugin], getPlugin: async () => plugin, savePluginConfig: async () => plugin, setPluginEnabled: async () => plugin, installFromFolder: async () => plugin },
        marketplaceService: { installFromMarketplace: async () => plugin },
        mcpManager: { getStatus: () => status },
        syncCombinedMcpServers: async () => {}, emitRealtimeEvent: () => {}, upload: { single: () => () => {} },
    });
    for (const route of ['get /api/plugins', 'get /api/plugins/:id', 'post /api/plugins/:id/config', 'patch /api/plugins/:id/toggle', 'post /api/plugins/install', 'post /api/plugins/marketplace/install']) {
        let body;
        await routes.get(route)({ params: { id: plugin.id }, body: { enabled: true, config: {}, sourcePath: 'source', pluginId: plugin.id } }, {
            json(value) { body = value; }, status(code) { assert.fail(`Unexpected HTTP ${code}`); },
        });
        assert.ok(body);
        const returned = Array.isArray(body) ? body[0] : body.plugin || body;
        assert.deepEqual(returned.config, plugin.config, route);
        assert.equal(JSON.stringify(body).includes('resolved-secret'), false, route);
        assert.equal(JSON.stringify(returned.mcpStatus).includes('top-secret'), false, route);
        assert.deepEqual(returned.mcpStatus.servers.map(server => server.name), ['alpha', 'beta']);
    }
});