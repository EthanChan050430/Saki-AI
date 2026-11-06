'use strict';

const { it } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('fs-extra');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { PluginService } = require('../services/plugins');
const { MarketplaceService } = require('../services/marketplace');

it('starts system-toolkit from an external data directory on fresh install and reinstall', { timeout: 20000 }, async () => {
    const tempRoot = path.resolve(os.tmpdir());
    const dataDir = await fs.mkdtemp(path.join(tempRoot, 'saki-marketplace-test-'));
    try {
        const pluginService = new PluginService({ dataDir });
        await pluginService.init();
        const marketplace = new MarketplaceService({ pluginService, repository: null });

        for (let attempt = 0; attempt < 2; attempt += 1) {
            const plugin = await marketplace.installFromMarketplace('system-toolkit', {
                ALERT_CPU_THRESHOLD: '90', METRICS_SAMPLE_COUNT: '2',
            });
            assert.equal(plugin.status, 'active');
            assert.equal(plugin.skillsCount, 1);
            const config = (await pluginService.getActiveMcpServers()).system_toolkit;
            assert.equal(await fs.pathExists(config.args[0]), true);
            const transport = new StdioClientTransport({
                command: process.execPath,
                args: config.args,
                env: { ...process.env, ...config.env },
                cwd: dataDir,
            });
            const client = new Client({ name: 'marketplace-regression', version: '1.0.0' });
            try {
                await client.connect(transport, { timeout: 5000 });
                const { tools } = await client.listTools();
                assert.ok(tools.some(tool => tool.name === 'get_system_metrics'));
                const result = await client.callTool({ name: 'get_threshold_config', arguments: {} });
                assert.deepEqual(JSON.parse(result.content[0].text), {
                    ALERT_CPU_THRESHOLD: '90', METRICS_SAMPLE_COUNT: '2',
                });
            } finally {
                await client.close();
                await transport.close();
            }
            await pluginService.uninstall('system-toolkit');
            assert.equal(await fs.pathExists(path.dirname(config.args[0])), false);
        }
    } finally {
        // Delete only the isolated test directory allocated above.
        assert.equal(path.dirname(path.resolve(dataDir)), tempRoot);
        assert.ok(path.basename(dataDir).startsWith('saki-marketplace-test-'));
        await fs.remove(dataDir);
    }
});
