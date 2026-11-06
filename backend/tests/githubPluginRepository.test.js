'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('fs-extra');
const AdmZip = require('adm-zip');
const { GithubPluginRepository } = require('../services/githubPluginRepository');
const { repositoryFixture } = require('./fixtures/githubRepository');
const { MarketplaceService } = require('../services/marketplace');
const { PluginService } = require('../services/plugins');
const { SkillService } = require('../services/skills');


async function withServices(action) {
    const tempRoot = path.resolve(os.tmpdir());
    const dataDir = await fs.mkdtemp(path.join(tempRoot, 'saki-github-test-'));
    try {
        const skillService = new SkillService({ dataDir });
        await skillService.init();
        const pluginService = new PluginService({ dataDir, skillService });
        await pluginService.init();
        const fixture = repositoryFixture();
        const repository = new GithubPluginRepository({ request: fixture.request });
        const marketplace = new MarketplaceService({ pluginService, repository });
        await action({ dataDir, skillService, pluginService, fixture, repository, marketplace });
    } finally {
        assert.equal(path.dirname(path.resolve(dataDir)), tempRoot);
        assert.ok(path.basename(dataDir).startsWith('saki-github-test-'));
        await fs.remove(dataDir);
    }
}

describe('GitHub functional plugin marketplace', () => {
    it('merges functional bundles with built-ins and shares a cached pinned snapshot', async () => {
        await withServices(async ({ marketplace, repository, fixture }) => {
            const [catalog, remote] = await Promise.all([marketplace.getCatalog(), repository.getCatalog()]);
            assert.equal(remote.length, 2);
            assert.ok(catalog.some(plugin => plugin.id === 'system-toolkit'));
            assert.equal(catalog.some(plugin => plugin.id === 'saki-theme-geo'), false);
            const github = catalog.find(plugin => plugin.id === 'saki-github');
            assert.equal(github.source, 'github');
            assert.equal(github.category, 'developer');
            assert.equal(github.configSchema.GITHUB_PERSONAL_ACCESS_TOKEN.secret, true);
            assert.deepEqual(github.mcpServersSummary, ['github']);
            assert.equal(github.sourceUrl.includes(fixture.revision), true);
            assert.equal('mcp' in github, false);
            const count = fixture.calls.length;
            await marketplace.getCatalog();
            assert.equal(fixture.calls.length, count);
            assert.equal(fixture.calls.filter(url => url.endsWith('/commits/HEAD')).length, 1);
            const filtered = await marketplace.getCatalog({ query: 'saki-dev-workflow', category: 'developer' });
            assert.deepEqual(filtered.map(plugin => plugin.id), ['saki-dev-workflow']);
        });
    });

    it('downloads only the selected plugin and registers all four upstream skills', async () => {
        await withServices(async ({ marketplace, pluginService, skillService, fixture, dataDir }) => {
            const installed = await marketplace.installFromMarketplace('saki-dev-workflow');
            assert.equal(installed.status, 'active');
            assert.equal(installed.skillsCount, 4);
            assert.equal(installed.source, 'github');
            assert.equal(installed.sourceMeta.revision, fixture.revision);
            const pluginPath = path.join(dataDir, 'plugins/saki-dev-workflow');
            assert.equal(await fs.pathExists(path.join(pluginPath, 'saki-plugin.json')), true);
            assert.equal(await fs.readFile(path.join(pluginPath, 'README.md'), 'utf8'), '# Development workflows');
            assert.equal(await fs.pathExists(path.join(dataDir, 'plugins/saki-github')), false);
            const enabled = (await skillService.listSkills({ enabledOnly: true })).filter(skill => skill.sourceMeta?.pluginId === installed.id);
            assert.equal(enabled.length, 4);
            assert.equal((await marketplace.getMarketplacePlugin(installed.id)).isInstalled, true);
            await pluginService.setPluginEnabled(installed.id, false);
            await pluginService.setPluginEnabled(installed.id, true);
            assert.equal((await skillService.listSkills({ enabledOnly: true })).filter(skill => skill.sourceMeta?.pluginId === installed.id).length, 4);
            await pluginService.uninstall(installed.id);
            assert.equal(await fs.pathExists(pluginPath), false);
        });
    });

    it('adapts upstream MCP config, keeps tokens local, and preserves existing config on reinstall', async () => {
        await withServices(async ({ marketplace, pluginService }) => {
            const missing = await marketplace.installFromMarketplace('saki-github');
            assert.equal(missing.status, 'missing_config');
            assert.deepEqual(await pluginService.getActiveMcpServers(), {});
            await marketplace.installFromMarketplace('saki-github', { GITHUB_PERSONAL_ACCESS_TOKEN: 'test-only-token' });
            await marketplace.installFromMarketplace('saki-github');
            const servers = await pluginService.getActiveMcpServers();
            assert.equal(servers['saki-github__github'].command, 'npx');
            assert.equal(servers['saki-github__github'].env.GITHUB_PERSONAL_ACCESS_TOKEN, 'test-only-token');
            const catalog = JSON.stringify(await marketplace.getCatalog());
            assert.equal(catalog.includes('test-only-token'), false);
        });
    });

    it('rejects corrupted downloads before changing an installed plugin', async () => {
        await withServices(async ({ marketplace, pluginService, fixture, dataDir }) => {
            await marketplace.installFromMarketplace('saki-dev-workflow');
            const before = await pluginService.loadStore();
            const skillPath = path.join(dataDir, 'plugins/saki-dev-workflow/skills/code-review/SKILL.md');
            const content = await fs.readFile(skillPath, 'utf8');
            fixture.corrupt = true;
            await assert.rejects(marketplace.installFromMarketplace('saki-dev-workflow'), /integrity verification/);
            assert.deepEqual(await pluginService.loadStore(), before);
            assert.equal(await fs.readFile(skillPath, 'utf8'), content);
        });
    });

    it('keeps built-ins and cached remote entries available when GitHub is offline', async () => {
        await withServices(async ({ marketplace, fixture }) => {
            await marketplace.getCatalog();
            fixture.fail = true;
            const stale = await marketplace.getCatalog({ refresh: true });
            assert.ok(stale.some(plugin => plugin.id === 'saki-dev-workflow'));
            assert.equal(marketplace.getSourceStatus().stale, true);
            fixture.fail = false;
            await marketplace.getCatalog({ refresh: true });
            assert.equal(marketplace.getSourceStatus().error, null);
        });
        await withServices(async ({ marketplace, fixture }) => {
            fixture.fail = true;
            const catalog = await marketplace.getCatalog();
            assert.ok(catalog.some(plugin => plugin.id === 'system-toolkit'));
            assert.match(marketplace.getSourceStatus().error, /network unavailable/);
            await assert.rejects(marketplace.installFromMarketplace('saki-dev-workflow'), /无法同步/);
        });
    });

    it('rejects symlinks and paths outside a plugin package', async () => {
        for (const unsafe of [
            { path: 'plugins/saki-dev-workflow/../../escape.txt', mode: '100644' },
            { path: 'plugins/saki-dev-workflow/link', mode: '120000' },
        ]) {
            await withServices(async ({ marketplace, fixture, pluginService }) => {
                fixture.tree.tree.push({ type: 'blob', size: 4, sha: 'b'.repeat(40), ...unsafe });
                await assert.rejects(marketplace.installFromMarketplace('saki-dev-workflow'), /Invalid repository file path|Unsupported repository file/);
                assert.deepEqual(await pluginService.listInstalled(), []);
            });
        }
    });

    it('downloads public archives without a token when the GitHub API quota is exhausted', async () => {
        await withServices(async ({ fixture, pluginService, skillService }) => {
            const zip = new AdmZip();
            for (const [name, bytes] of fixture.files) zip.addFile(`saki-plugins-${fixture.revision}/${name}`, bytes);
            zip.addFile(`saki-plugins-${fixture.revision}/plugins/saki-theme-geo/theme.css`, Buffer.from('unrelated theme'));
            const archive = zip.toBuffer();
            let archiveRequests = 0;
            const repository = new GithubPluginRepository({ request: async url => {
                if (url.startsWith('https://api.github.com/')) {
                    throw Object.assign(new Error('API rate limit exceeded'), { response: { status: 403 } });
                }
                if (url.endsWith('/commits/HEAD.atom')) return `<feed><entry><id>tag:github.com,2008:Grit::Commit/${fixture.revision}</id></entry></feed>`;
                if (url === `https://codeload.github.com/EthanChan050430/saki-plugins/zip/${fixture.revision}`) {
                    archiveRequests += 1;
                    return archive;
                }
                throw new Error(`Unexpected request: ${url}`);
            } });
            const marketplace = new MarketplaceService({ pluginService, repository });
            const catalog = await marketplace.getCatalog();
            assert.ok(catalog.some(plugin => plugin.id === 'saki-dev-workflow'));
            assert.equal(catalog.some(plugin => plugin.id === 'saki-theme-geo'), false);
            assert.equal(marketplace.getSourceStatus().transport, 'archive');
            assert.equal(marketplace.getSourceStatus().error, null);
            await marketplace.installFromMarketplace('saki-dev-workflow');
            assert.equal((await skillService.listSkills()).filter(skill => skill.sourceMeta?.pluginId === 'saki-dev-workflow').length, 4);
            await marketplace.getCatalog({ refresh: true });
            assert.equal(archiveRequests, 1, 'Do not download the same archive on every refresh');
        });
    });
});
