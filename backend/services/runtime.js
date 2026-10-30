const path = require('node:path');

const projectRoot = path.resolve(__dirname, '../..');

function createRuntimeConfig(env = process.env) {
    const profile = env.SAKI_PROFILE || (env.NODE_ENV === 'production' ? 'light' : 'standard');
    if (!['light', 'standard'].includes(profile)) throw new Error('SAKI_PROFILE must be light or standard');
    const embeddingMode = env.SAKI_EMBEDDINGS || (profile === 'light' ? 'keyword' : 'lazy');
    if (!['keyword', 'lazy', 'warm'].includes(embeddingMode)) throw new Error('SAKI_EMBEDDINGS must be keyword, lazy or warm');
    const crawlerMode = env.SAKI_CRAWLER || (profile === 'light' ? 'static' : 'browser');
    if (!['static', 'browser'].includes(crawlerMode)) throw new Error('SAKI_CRAWLER must be static or browser');
    const port = Number(env.PORT || env.SAKI_PORT || 5480);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid PORT');
    const dataDir = path.resolve(env.SAKI_DATA_DIR || path.join(projectRoot, 'data'));
    return Object.freeze({
        profile, embeddingMode, crawlerMode, port, dataDir,
        host: env.AGENT_HOST || '127.0.0.1',
        workspaceRoot: path.resolve(env.SAKI_WORKSPACE_DIR || projectRoot),
        memoryWorkspaceDir: path.resolve(env.SAKI_MEMORY_WORKSPACE_DIR || (env.SAKI_DATA_DIR ? path.join(dataDir, 'workspace-memory') : projectRoot)),
        frontendDist: path.resolve(env.SAKI_FRONTEND_DIST || path.join(projectRoot, 'frontend/dist')),
        serveFrontend: env.SAKI_SERVE_FRONTEND !== '0',
        backgroundTasks: env.SAKI_BACKGROUND_TASKS !== '0',
        browserIdleMs: Math.max(1000, Number(env.SAKI_BROWSER_IDLE_MS) || 60000),
    });
}

module.exports = { createRuntimeConfig, runtime: createRuntimeConfig(), projectRoot };
