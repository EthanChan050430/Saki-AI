'use strict';

const fs = require('fs-extra');

function publicPlugin(plugin, status = {}) {
    if (!plugin) return plugin;
    // The local configuration editor needs saved values for full-form saves.
    // Only omit resolved MCP definitions, which may interpolate credentials.
    const { mcp, ...safe } = plugin;
    const servers = (plugin.mcpServerNames || []).map(name => ({
        name,
        connected: status[name]?.connected === true,
        toolCount: Number.isFinite(status[name]?.toolCount) ? status[name].toolCount : 0,
        // Transport error strings can contain interpolated credentials.
        ...(status[name]?.error ? { error: 'MCP server unavailable' } : {}),
    }));
    return {
        ...safe,
        mcpStatus: servers.length ? {
            connected: servers.every(server => server.connected),
            toolCount: servers.reduce((sum, server) => sum + server.toolCount, 0),
            servers,
        } : null,
    };
}

function registerPluginRoutes(app, {
    pluginService, marketplaceService, mcpManager,
    syncCombinedMcpServers, emitRealtimeEvent, upload,
}) {
    app.get('/api/plugins', async (req, res) => {
        try {
            const plugins = await pluginService.listInstalled();
            const mcpStatus = mcpManager.getStatus();
            const enriched = plugins.map(p => publicPlugin(p, mcpStatus));
            res.json(enriched);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.patch('/api/plugins/:id/toggle', async (req, res) => {
        try {
            const { enabled } = req.body;
            if (typeof enabled !== 'boolean') {
                return res.status(400).json({ error: 'enabled must be a boolean' });
            }
            const updated = await pluginService.setPluginEnabled(req.params.id, enabled);
            await syncCombinedMcpServers().catch(e => console.error('[Plugin] Error syncing MCP on toggle:', e.message));
            emitRealtimeEvent({ type: 'plugins-updated', pluginId: req.params.id, enabled });
            res.json({ success: true, plugin: publicPlugin(updated, mcpManager.getStatus()) });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/plugins/:id/config', async (req, res) => {
        try {
            const { config } = req.body;
            if (!config || typeof config !== 'object') {
                return res.status(400).json({ error: 'config must be an object' });
            }
            const updated = await pluginService.savePluginConfig(req.params.id, config);
            await syncCombinedMcpServers().catch(e => console.error('[Plugin] Error syncing MCP on config update:', e.message));
            emitRealtimeEvent({ type: 'plugins-updated', pluginId: req.params.id });
            res.json({ success: true, plugin: publicPlugin(updated, mcpManager.getStatus()) });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/plugins/install', upload.single('package'), async (req, res) => {
        try {
            let plugin = null;
            if (req.file) {
                plugin = await pluginService.installFromZip(req.file.path, { source: 'upload' });
                await fs.remove(req.file.path).catch(() => {});
            } else if (req.body.sourcePath) {
                plugin = await pluginService.installFromFolder(req.body.sourcePath, { source: 'local' });
            } else {
                return res.status(400).json({ error: 'Please provide either a file upload or a sourcePath.' });
            }
            await syncCombinedMcpServers().catch(e => console.error('[Plugin] Error syncing MCP on install:', e.message));
            emitRealtimeEvent({ type: 'plugins-updated', pluginId: plugin.id });
            res.json({ success: true, plugin: publicPlugin(plugin, mcpManager.getStatus()) });
        } catch (err) {
            if (req.file) {
                await fs.remove(req.file.path).catch(() => {});
            }
            res.status(500).json({ error: err.message });
        }
    });

    app.get('/api/plugins/marketplace', async (req, res) => {
        try {
            const { query = '', category = 'all' } = req.query;
            const catalog = await marketplaceService.getCatalog({ query, category, refresh: req.query.refresh === 'true' });
            res.json(req.query.includeSource === 'true'
                ? { plugins: catalog, source: marketplaceService.getSourceStatus() }
                : catalog);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.get('/api/plugins/marketplace/:id', async (req, res) => {
        try {
            const item = await marketplaceService.getMarketplacePlugin(req.params.id);
            if (!item) return res.status(404).json({ error: `Marketplace plugin '${req.params.id}' not found` });
            res.json(item);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/plugins/marketplace/install', async (req, res) => {
        try {
            const { pluginId, config } = req.body;
            if (!pluginId) return res.status(400).json({ error: 'pluginId is required' });
            const plugin = await marketplaceService.installFromMarketplace(pluginId, config || {});
            await syncCombinedMcpServers().catch(e => console.error('[Marketplace] Error syncing MCP on install:', e.message));
            emitRealtimeEvent({ type: 'plugins-updated', pluginId });
            res.json({ success: true, plugin: publicPlugin(plugin, mcpManager.getStatus()) });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.get('/api/plugins/:id', async (req, res) => {
        try {
            const plugin = await pluginService.getPlugin(req.params.id);
            if (!plugin) return res.status(404).json({ error: `Plugin '${req.params.id}' not found` });
            const mcpStatus = mcpManager.getStatus();
            res.json(publicPlugin(plugin, mcpStatus));
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.delete('/api/plugins/:id', async (req, res) => {
        try {
            await pluginService.uninstall(req.params.id);
            await syncCombinedMcpServers().catch(e => console.error('[Plugin] Error syncing MCP on uninstall:', e.message));
            emitRealtimeEvent({ type: 'plugins-updated', pluginId: req.params.id, uninstalled: true });
            res.json({ success: true, id: req.params.id });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
}

module.exports = { registerPluginRoutes, publicPlugin };
