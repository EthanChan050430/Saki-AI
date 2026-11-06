'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('fs-extra');
const express = require('express');

const { PluginService } = require('../services/plugins.js');
const { SkillService } = require('../services/skills.js');
const { MarketplaceService } = require('../services/marketplace.js');
const { registerPluginRoutes } = require('../services/pluginRoutes.js');
const multer = require('multer');
const AdmZip = require('adm-zip');
const { GithubPluginRepository } = require('../services/githubPluginRepository');
const { repositoryFixture } = require('./fixtures/githubRepository');

describe('Plugin & Marketplace REST API Integration Test', () => {
    const testDataDir = path.resolve(__dirname, '../.tmp/test_api_plugins_data');
    let app;
    let server;
    let baseUrl;
    let pluginService;
    let skillService;
    let marketplaceService;

    const mockMcpManager = {
        servers: {},
        async initializeServers(config) {
            this.servers = config || {};
        },
        getStatus() {
            const status = {};
            for (const key of Object.keys(this.servers)) {
                status[key] = { connected: true, toolCount: 2 };
            }
            return status;
        }
    };

    before(async () => {
        await fs.remove(testDataDir).catch(() => {});
        await fs.ensureDir(testDataDir);

        skillService = new SkillService({ dataDir: testDataDir });
        await skillService.init();

        pluginService = new PluginService({
            dataDir: testDataDir,
            skillService,
            mcpManager: mockMcpManager
        });
        await pluginService.init();
        marketplaceService = new MarketplaceService({ pluginService, repository: null });

        // 预置一个测试插件
        const samplePluginDir = path.join(testDataDir, 'plugins', 'api-test-plugin');
        await fs.ensureDir(path.join(samplePluginDir, 'skills', 'test-skill'));
        await fs.writeJson(path.join(samplePluginDir, 'plugin.json'), {
            id: 'api-test-plugin',
            name: 'API Test Plugin',
            version: '1.0.0',
            description: 'Plugin for testing REST APIs',
            category: 'developer',
            configSchema: {
                TEST_TOKEN: {
                    type: 'string',
                    required: true,
                    label: 'Test Token'
                },
                ENDPOINT: {
                    type: 'string',
                    default: 'https://default.example.test'
                },
                RETRIES: {
                    type: 'number',
                    default: 3
                },
                VERBOSE: {
                    type: 'boolean',
                    default: true
                }
            },
            mcp: {
                serverName: 'api_test_mcp',
                command: 'node',
                args: ['index.js'],
                env: {
                    TOKEN: '${config.TEST_TOKEN}'
                }
            }
        });
        await fs.writeFile(
            path.join(samplePluginDir, 'skills', 'test-skill', 'SKILL.md'),
            `---\nname: api-test-skill\ndescription: API test skill\n---\n# Test Skill`,
            'utf8'
        );

        await pluginService.syncInstalledPlugins();

        app = express();
        app.use(express.json());

        registerPluginRoutes(app, {
            pluginService,
            marketplaceService,
            mcpManager: mockMcpManager,
            syncCombinedMcpServers: async () => {
                await mockMcpManager.initializeServers(await pluginService.getActiveMcpServers());
            },
            emitRealtimeEvent: () => {},
            upload: multer({ dest: path.join(testDataDir, 'uploads') }),
        });

        await new Promise(resolve => {
            server = app.listen(0, '127.0.0.1', () => {
                const port = server.address().port;
                baseUrl = `http://127.0.0.1:${port}`;
                resolve();
            });
        });
    });

    after(async () => {
        if (server) {
            await new Promise(r => server.close(r));
        }
        await fs.remove(testDataDir).catch(() => {});
    });

    it('GET /api/plugins returns installed plugins list', async () => {
        const res = await fetch(`${baseUrl}/api/plugins`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.ok(Array.isArray(data));
        assert.equal(data.length, 1);
        assert.equal(data[0].id, 'api-test-plugin');
        assert.equal(data[0].status, 'missing_config');
    });

    it('GET /api/plugins/marketplace returns curated marketplace catalog', async () => {
        const res = await fetch(`${baseUrl}/api/plugins/marketplace`);
        assert.equal(res.status, 200);
        const catalog = await res.json();
        assert.ok(Array.isArray(catalog));
        assert.ok(catalog.length >= 4);

        const gh = catalog.find(c => c.id === 'github-workflow');
        assert.ok(gh, 'github-workflow should exist in marketplace');
        assert.equal(gh.isInstalled, false);
        assert.equal(gh.category, 'developer');
        assert.ok(gh.mcpToolsSummary.includes('create_pull_request_review'));
    });

    it('keeps marketplace details and installed-plugin details reachable', async () => {
        const marketplaceRes = await fetch(`${baseUrl}/api/plugins/marketplace/github-workflow`);
        assert.equal(marketplaceRes.status, 200);
        assert.equal((await marketplaceRes.json()).id, 'github-workflow');

        const pluginRes = await fetch(`${baseUrl}/api/plugins/api-test-plugin`);
        assert.equal(pluginRes.status, 200);
        assert.equal((await pluginRes.json()).id, 'api-test-plugin');
    });

    it('POST /api/plugins/marketplace/install installs github-workflow with config', async () => {
        const res = await fetch(`${baseUrl}/api/plugins/marketplace/install`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pluginId: 'github-workflow',
                config: {
                    GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_mock_token_123'
                }
            })
        });
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.success, true);
        assert.equal(data.plugin.id, 'github-workflow');
        assert.equal(data.plugin.status, 'active');
        assert.equal(data.plugin.skillsCount, 2);

        // Verify skills in skillService
        const skills = await skillService.listSkills();
        const prSkill = skills.find(s => s.name.includes('pr-review'));
        assert.ok(prSkill, 'PR Review skill should be registered');

        // Check marketplace catalog reflects installed state
        const catalogRes = await fetch(`${baseUrl}/api/plugins/marketplace`);
        const catalog = await catalogRes.json();
        const ghInMarket = catalog.find(c => c.id === 'github-workflow');
        assert.equal(ghInMarket.isInstalled, true);
        assert.equal(ghInMarket.installedStatus, 'active');
    });

    it('POST /api/plugins/:id/config saves config and activates MCP', async () => {
        const res = await fetch(`${baseUrl}/api/plugins/api-test-plugin/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                config: { TEST_TOKEN: 'token_abc_123' }
            })
        });
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.success, true);
        assert.equal(data.plugin.status, 'active');
        assert.equal(data.plugin.missingConfig.length, 0);

        // Verify MCP was activated in mockMcpManager
        assert.ok(mockMcpManager.servers.api_test_mcp, 'MCP server should be activated');
        assert.equal(mockMcpManager.servers.api_test_mcp.env.TOKEN, 'token_abc_123');
    });

    it('round-trips full configuration forms without clearing saved tokens or resetting values', async () => {
        const configUrl = `${baseUrl}/api/plugins/api-test-plugin/config`;
        const saved = {
            TEST_TOKEN: 'token_abc_123', ENDPOINT: 'https://custom.example.test',
            RETRIES: 0, VERBOSE: false,
        };
        const initial = await fetch(configUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config: saved }),
        });
        assert.equal(initial.status, 200);
        assert.deepEqual((await initial.json()).plugin.config, saved);

        const listRes = await fetch(`${baseUrl}/api/plugins`);
        const listed = (await listRes.json()).find(plugin => plugin.id === 'api-test-plugin');
        const detailRes = await fetch(`${baseUrl}/api/plugins/api-test-plugin`);
        const detail = await detailRes.json();
        for (const plugin of [listed, detail]) {
            // Match PluginMarketplaceModal's existing full-form initialization.
            const form = Object.fromEntries(Object.entries(plugin.configSchema).map(([key, field]) =>
                [key, plugin.config?.[key] !== undefined ? plugin.config[key] : (field.default ?? '')]));
            assert.deepEqual(form, saved);
            form.ENDPOINT = 'https://edited.example.test';
            const res = await fetch(configUrl, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config: form }),
            });
            assert.equal(res.status, 200);
            assert.deepEqual((await res.json()).plugin.config, { ...saved, ENDPOINT: form.ENDPOINT });
        }
        assert.deepEqual((await pluginService.getPlugin('api-test-plugin')).config, {
            ...saved, ENDPOINT: 'https://edited.example.test',
        });
    });

    it('PATCH /api/plugins/:id/toggle enables/disables plugin', async () => {
        const resDisable = await fetch(`${baseUrl}/api/plugins/api-test-plugin/toggle`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: false })
        });
        assert.equal(resDisable.status, 200);
        const disableData = await resDisable.json();
        assert.equal(disableData.plugin.enabled, false);
        assert.equal(disableData.plugin.status, 'disabled');
        assert.equal(mockMcpManager.servers.api_test_mcp, undefined);
        assert.equal((await skillService.listSkills({ enabledOnly: true }))
            .some(skill => skill.sourceMeta?.pluginId === 'api-test-plugin'), false);

        // Re-enable
        const resEnable = await fetch(`${baseUrl}/api/plugins/api-test-plugin/toggle`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: true })
        });
        assert.equal(resEnable.status, 200);
        const enableData = await resEnable.json();
        assert.equal(enableData.plugin.enabled, true);
        assert.equal(enableData.plugin.status, 'active');
        assert.ok(mockMcpManager.servers.api_test_mcp);
        assert.equal((await skillService.listSkills({ enabledOnly: true }))
            .some(skill => skill.sourceMeta?.pluginId === 'api-test-plugin'), true);
    });

    it('DELETE /api/plugins/:id uninstalls the plugin', async () => {
        const res = await fetch(`${baseUrl}/api/plugins/api-test-plugin`, {
            method: 'DELETE'
        });
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.success, true);
        assert.equal(data.id, 'api-test-plugin');
    });

    it('cleans uploaded packages after successful and failed imports', async () => {
        const zip = new AdmZip();
        zip.addFile('plugin.json', Buffer.from(JSON.stringify({
            id: 'uploaded-plugin', name: 'Uploaded Plugin', version: '1.0.0',
        })));
        const uploadDir = path.join(testDataDir, 'uploads');
        for (const [bytes, expectedStatus] of [[zip.toBuffer(), 200], [Buffer.from('invalid zip'), 500]]) {
            const form = new FormData();
            form.append('package', new Blob([bytes], { type: 'application/zip' }), 'plugin.zip');
            const res = await fetch(`${baseUrl}/api/plugins/install`, { method: 'POST', body: form });
            assert.equal(res.status, expectedStatus);
            const result = await res.json();
            if (expectedStatus === 200) assert.equal(result.plugin.id, 'uploaded-plugin');
            else assert.ok(result.error);
            assert.deepEqual(await fs.readdir(uploadDir), []);
        }
    });

    it('serves repository metadata and downloads a functional bundle through the marketplace API', async () => {
        const fixture = repositoryFixture();
        marketplaceService.repository = new GithubPluginRepository({ request: fixture.request });
        try {
            const catalogRes = await fetch(`${baseUrl}/api/plugins/marketplace?includeSource=true&refresh=true&query=saki-dev-workflow`);
            assert.equal(catalogRes.status, 200);
            const data = await catalogRes.json();
            assert.equal(data.source.revision, fixture.revision);
            assert.equal(data.source.error, null);
            assert.deepEqual(data.plugins.map(plugin => plugin.id), ['saki-dev-workflow']);
            const installRes = await fetch(`${baseUrl}/api/plugins/marketplace/install`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pluginId: 'saki-dev-workflow' }),
            });
            assert.equal(installRes.status, 200);
            const installed = await installRes.json();
            assert.equal(installed.plugin.source, 'github');
            assert.equal(installed.plugin.skillsCount, 4);
            assert.equal((await skillService.listSkills({ enabledOnly: true }))
                .filter(skill => skill.sourceMeta?.pluginId === 'saki-dev-workflow').length, 4);
        } finally {
            marketplaceService.repository = null;
        }
    });
});
