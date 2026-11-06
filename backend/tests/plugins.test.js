'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('fs-extra');

const {
    PluginService,
    validateManifest,
    interpolateVariables,
    isValidPluginId
} = require('../services/plugins.js');
const { SkillService } = require('../services/skills.js');

describe('Plugin Specification & Manifest Validator', () => {
    it('validates a compliant manifest', () => {
        const manifest = {
            id: 'test-plugin',
            name: 'Test Plugin',
            version: '1.0.0',
            description: 'A test plugin description',
            category: 'utility',
            configSchema: {
                API_KEY: {
                    type: 'string',
                    required: true
                }
            },
            mcp: {
                serverName: 'test-server',
                command: 'node',
                args: ['index.js']
            }
        };
        assert.equal(validateManifest(manifest), true);
    });

    it('rejects manifest without required fields', () => {
        assert.throws(() => validateManifest({}), /Invalid plugin 'id'/);
        assert.throws(() => validateManifest({ id: 'valid-id' }), /Invalid plugin 'name'/);
        assert.throws(() => validateManifest({ id: 'valid-id', name: 'My Name' }), /Invalid plugin 'version'/);
    });

    it('rejects invalid plugin id formats', () => {
        assert.equal(isValidPluginId(''), false);
        assert.equal(isValidPluginId('invalid/slash'), false);
        assert.equal(isValidPluginId('..\\traversal'), false);
        assert.equal(isValidPluginId('space in id'), false);
        assert.equal(isValidPluginId('valid-id_123'), true);
    });

    it('validates mcp definitions properly', () => {
        assert.throws(() => validateManifest({
            id: 'mcp-test-1',
            name: 'MCP Test 1',
            version: '1.0.0',
            mcp: { invalid: true }
        }), /Invalid MCP server declaration/);

        assert.throws(() => validateManifest({
            id: 'mcp-test-2',
            name: 'MCP Test 2',
            version: '1.0.0',
            mcp: {
                testServer: {
                    args: ['index.js'] // missing command or url
                }
            }
        }), /must specify at least 'command'/);
    });
});

describe('Variable Interpolation Engine', () => {
    it('interpolates config, pluginDir, dataDir, and backendDir', () => {
        const template = {
            cmd: 'node',
            args: ['${pluginDir}/server.js'],
            env: {
                TOKEN: '${config.API_KEY}',
                STORAGE: '${dataDir}/cache',
                BACKEND: '${backendDir}',
                DEFAULT_VAL: 'no_change'
            }
        };

        const result = interpolateVariables(template, {
            pluginDir: 'D:/plugins/my-plugin',
            dataDir: 'D:/data',
            backendDir: 'D:/app/backend',
            config: {
                API_KEY: 'secret_123'
            }
        });

        assert.equal(result.args[0], 'D:/plugins/my-plugin/server.js');
        assert.equal(result.env.TOKEN, 'secret_123');
        assert.equal(result.env.STORAGE, 'D:/data/cache');
        assert.equal(result.env.BACKEND, 'D:/app/backend');
        assert.equal(result.env.DEFAULT_VAL, 'no_change');
    });
});

describe('PluginService Lifecycle & Integration', () => {
    const testDataDir = path.resolve(__dirname, '../.tmp/test_plugins_data');
    let skillService;
    let pluginService;

    before(async () => {
        await fs.remove(testDataDir).catch(() => {});
        await fs.ensureDir(testDataDir);

        skillService = new SkillService({ dataDir: testDataDir });
        await skillService.init();

        pluginService = new PluginService({
            dataDir: testDataDir,
            skillService
        });
        await pluginService.init();
    });

    after(async () => {
        await fs.remove(testDataDir).catch(() => {});
    });

    it('installs a plugin from folder and registers its bundled skills', async () => {
        const samplePluginDir = path.join(testDataDir, 'sample_source');
        await fs.ensureDir(path.join(samplePluginDir, 'skills/greeter'));

        await fs.writeJson(path.join(samplePluginDir, 'plugin.json'), {
            id: 'sample-greeter',
            name: 'Sample Greeter Plugin',
            version: '1.0.0',
            description: 'Greets the user nicely',
            category: 'utility',
            configSchema: {
                GREETING_PREFIX: {
                    type: 'string',
                    required: true,
                    label: 'Prefix'
                }
            },
            mcp: {
                serverName: 'greeter_mcp',
                command: 'node',
                args: ['${pluginDir}/index.js'],
                env: {
                    PREFIX: '${config.GREETING_PREFIX}'
                }
            }
        });

        await fs.writeFile(
            path.join(samplePluginDir, 'skills/greeter/SKILL.md'),
            `---\nname: greeter-skill\ndescription: A greeting skill\n---\n# Greeter Skill\nSay hello!`,
            'utf8'
        );

        const installed = await pluginService.installFromFolder(samplePluginDir);
        assert.equal(installed.id, 'sample-greeter');
        assert.equal(installed.enabled, true);
        assert.equal(installed.skillsCount, 1);
        assert.equal(installed.status, 'missing_config'); // required GREETING_PREFIX is empty
        assert.equal(installed.missingConfig.length, 1);
        assert.equal(installed.missingConfig[0].key, 'GREETING_PREFIX');

        // Verify skill was registered into skillService
        const skills = await skillService.listSkills();
        const registered = skills.find(s => s.source === 'plugin:sample-greeter');
        assert.ok(registered, 'Skill should be registered in SkillService');
        assert.equal(registered.enabled, true);
    });

    it('saves plugin config and resolves missing_config state', async () => {
        await pluginService.savePluginConfig('sample-greeter', {
            GREETING_PREFIX: 'Hello, '
        });

        const plugin = await pluginService.getPlugin('sample-greeter');
        assert.equal(plugin.status, 'active');
        assert.equal(plugin.missingConfig.length, 0);
        assert.equal(plugin.config.GREETING_PREFIX, 'Hello, ');

        // Verify active MCP servers output
        const activeMcp = await pluginService.getActiveMcpServers();
        assert.ok(activeMcp.greeter_mcp, 'Active MCP server should be generated');
        assert.equal(activeMcp.greeter_mcp.env.PREFIX, 'Hello, ');
    });

    it('disables plugin and verifies skills are disabled and MCP unmounted', async () => {
        await pluginService.setPluginEnabled('sample-greeter', false);

        const plugin = await pluginService.getPlugin('sample-greeter');
        assert.equal(plugin.enabled, false);
        assert.equal(plugin.status, 'disabled');

        // Skills should be disabled
        const skills = await skillService.listSkills({ enabledOnly: true });
        const found = skills.find(s => s.source === 'plugin:sample-greeter');
        assert.equal(found, undefined, 'Disabled plugin skills should not be active');

        // MCP should not be in active servers
        const activeMcp = await pluginService.getActiveMcpServers();
        assert.equal(activeMcp.greeter_mcp, undefined);
    });

    it('uninstalls plugin and verifies clean disk and skill cleanup', async () => {
        await pluginService.uninstall('sample-greeter');

        const list = await pluginService.listInstalled();
        assert.equal(list.length, 0);

        const allSkills = await skillService.listSkills();
        const found = allSkills.find(s => s.source === 'plugin:sample-greeter');
        assert.equal(found, undefined, 'Uninstalled plugin skills should be removed');
    });
});
