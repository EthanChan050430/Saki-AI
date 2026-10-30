#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync, spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
function loadEnv() {
    for (const file of [path.join(root, '.env'), path.join(root, 'backend/.env')]) {
        if (fs.existsSync(file)) process.loadEnvFile(file);
    }
}
function runNpm(args, cwd, env = process.env) {
    // Only fixed npm arguments are accepted here; no user text enters a shell command.
    const command = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm';
    const argv = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm ' + args.join(' ')] : args;
    const result = spawnSync(command, argv, { cwd, env, stdio: 'inherit', windowsHide: true });
    if (result.error || result.status !== 0) throw new Error(result.error?.message || `npm ${args.join(' ')} failed (${result.status})`);
}
function installDependencies(directory, { full = false, dev = false, force = false } = {}) {
    const lockPath = path.join(directory, 'package-lock.json');
    const fingerprint = crypto.createHash('sha256').update(fs.readFileSync(lockPath)).update(`${full}:${dev}`).digest('hex');
    const marker = path.join(directory, 'node_modules/.saki-install');
    if (!force && fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') === fingerprint) return;
    const args = ['ci', '--no-audit', '--no-fund'];
    if (dev) args.push('--include=dev');
    else args.push('--omit=dev');
    if (!full) args.push('--omit=optional');
    // An existing development install may have an esbuild binary in use on Windows.
    // npm install reconciles it without the destructive clean performed by npm ci.
    if (!force && fs.existsSync(path.join(directory, 'node_modules')) && !fs.existsSync(marker)) args[0] = 'install';
    runNpm(args, directory);
    fs.writeFileSync(marker, fingerprint);
}
function prepare({ rebuild = false, install = true, force = false, full = false, installBackend = true } = {}) {
    const dist = path.resolve(process.env.SAKI_FRONTEND_DIST || path.join(root, 'frontend/dist'));
    if (rebuild || !fs.existsSync(path.join(dist, 'index.html'))) {
        const frontend = path.join(root, 'frontend');
        if (!fs.existsSync(path.join(frontend, 'src'))) throw new Error('Prebuilt frontend is missing. Recreate the release on the build machine.');
        console.log('[Saki] Building frontend once. For small machines, use npm run release:prepare on another machine.');
        // Vite/Rollup need their platform-specific optional packages at build time.
        if (install) installDependencies(frontend, { full: true, dev: true, force });
        runNpm(['run', 'build'], frontend,
            { ...process.env, SAKI_BUILD_OUT_DIR: dist, SAKI_BUILD_PROFILE: full ? 'standard' : 'light' });
    }
    if (install && installBackend) installDependencies(path.join(root, 'backend'), { full, force });
    return dist;
}
function main(args = process.argv.slice(2)) {
    const [major, minor] = process.versions.node.split('.').map(Number);
    if (major < 22 || (major === 22 && minor < 12)) throw new Error('Node.js 22.12+ is required.');
    const supported = new Set(['--prepare', '--build', '--install', '--no-install', '--full', '--help']);
    for (const arg of args) if (!supported.has(arg)) throw new Error(`Unknown argument: ${arg}`);
    if (args.includes('--help')) {
        console.log('node scripts/launch.cjs [--prepare] [--build] [--install] [--no-install] [--full]\nDefault: build missing UI, install production dependencies, start one lightweight server.\n--prepare only installs/builds; --full includes optional local embeddings and animations.');
        return;
    }
    loadEnv();
    if (args.includes('--full')) process.env.SAKI_PROFILE = 'standard';
    const full = args.includes('--full') || process.env.SAKI_PROFILE === 'standard';
    process.env.NODE_ENV ||= 'production';
    process.env.SAKI_PROFILE ||= full ? 'standard' : 'light';
    const dist = prepare({ rebuild: args.includes('--build'), install: !args.includes('--no-install'), force: args.includes('--install'), full });
    if (args.includes('--prepare')) { console.log('[Saki] Ready. Start with npm start.'); return; }
    const heap = Number(process.env.SAKI_HEAP_MB || (full ? 768 : 384));
    if (!Number.isInteger(heap) || heap < 128) throw new Error('SAKI_HEAP_MB must be an integer >= 128.');
    console.log(`[Saki] ${process.env.SAKI_PROFILE} profile; one server, no Vite or automatic local model startup.`);
    const child = spawn(process.execPath, [`--max-old-space-size=${heap}`, path.join(root, 'backend/server.js')], {
        cwd: root, stdio: 'inherit', windowsHide: true, env: { ...process.env, SAKI_FRONTEND_DIST: dist },
    });
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { if (!child.killed) child.kill(signal); });
    child.on('error', error => { console.error(error.message); process.exitCode = 1; });
    child.on('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGINT' ? 0 : 1); });
}
if (require.main === module) { try { main(); } catch (error) { console.error('[Saki] ' + error.message); process.exitCode = 1; } }
module.exports = { prepare, installDependencies, runNpm, main };
