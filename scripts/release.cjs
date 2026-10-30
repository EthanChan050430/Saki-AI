#!/usr/bin/env node
// Build on a workstation, transfer this directory to a small server. No private data is copied.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { installDependencies, runNpm } = require('./launch.cjs');
const root = path.resolve(__dirname, '..');
const full = process.argv.includes('--full');
process.env.NODE_ENV ||= 'production';
process.env.SAKI_PROFILE = full ? 'standard' : 'light';
const target = path.join(root, 'release', 'saki-ai-' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(target, { recursive: true });
// Isolated build also verifies frontend/package.json is self-contained. Never clean a live Vite install.
// Resolve Windows 8.3 temp paths before Vite computes paths relative to its root.
const buildDir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'saki-release-build-')));
try {
    for (const file of ['src', 'index.html', 'package.json', 'package-lock.json', 'vite.config.js', 'tailwind.config.js', 'postcss.config.js']) {
        const source = path.join(root, 'frontend', file);
        if (fs.existsSync(source)) fs.cpSync(source, path.join(buildDir, file), { recursive: true });
    }
    installDependencies(buildDir, { full: true, dev: true });
    runNpm(['run', 'build'], buildDir, {
        ...process.env, SAKI_BUILD_PROFILE: full ? 'standard' : 'light',
        SAKI_BUILD_OUT_DIR: path.join(target, 'frontend/dist'), SAKI_PUBLIC_DIR: path.join(root, 'frontend/public'),
    });
} finally {
    fs.rmSync(buildDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
for (const file of ['backend/server.js', 'backend/services', 'backend/package.json', 'backend/package-lock.json',
    'scripts/launch.cjs', 'scripts/health.cjs', 'package.json', 'package-lock.json', 'start.bat', 'start-hidden.vbs',
    'deploy.sh', 'configure.bat', 'configure.ps1', 'README.md', 'LICENSE', '.env.example', 'data/global_config.example.json', 'docs/deployment.md']) {
    const source = path.join(root, file);
    if (!fs.existsSync(source)) continue;
    const destination = path.join(target, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(source, destination, { recursive: true });
}
// Optional bot source; omit its installed dependencies, credentials and private state.
for (const file of ['package.json', 'package-lock.json', 'tsconfig.json', 'src']) {
    const source = path.join(root, 'backend/qqbot', file);
    if (fs.existsSync(source)) fs.cpSync(source, path.join(target, 'backend/qqbot', file), { recursive: true });
}
console.log(`[Saki] Release: ${target}\nCopy it to the server, then run node scripts/launch.cjs (or start.bat).`);
