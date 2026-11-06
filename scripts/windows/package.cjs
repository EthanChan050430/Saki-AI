// Build a Windows portable release; never copy live configuration or node_modules.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { installDependencies } = require('../launch.cjs');
const root = path.resolve(__dirname, '../..');
async function main() {
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Build on Windows x64.');
const output = path.join(root, 'releases3.0', 'Saki-AI-3.0-win-x64');
function run(command, args, env = process.env) {
    const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
    if (result.error || result.status !== 0) throw result.error || new Error(command + ' failed: ' + result.status);
}
const env = { ...process.env };
for (const key of Object.keys(env)) if (key.startsWith('VITE_')) delete env[key];
if (!process.argv.includes('--resume')) run(process.execPath, [path.join(root, 'scripts/release.cjs'), '--out', output], env);
if (!fs.existsSync(path.join(output, 'frontend/dist/index.html'))) throw new Error('Built frontend missing.');
installDependencies(path.join(output, 'backend'));
fs.mkdirSync(path.join(output, 'runtime'), { recursive: true });
fs.copyFileSync(process.execPath, path.join(output, 'runtime/node.exe'));
const compiler = path.join(process.env.WINDIR, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
run(compiler, ['/nologo', '/target:exe', '/optimize+', '/reference:System.Net.Http.dll', '/out:' + path.join(output, 'Saki-AI.exe'), path.join(__dirname, 'Launcher.cs')]);
fs.writeFileSync(path.join(output, 'start.bat'), '@echo off\r\ncd /d "%~dp0"\r\n"%~dp0Saki-AI.exe" %*\r\n', 'utf8');
// Old developer/hidden launchers must not bypass the packaged runtime.
fs.rmSync(path.join(output, 'start-hidden.vbs'), { force: true });
fs.writeFileSync(path.join(output, 'package.json'), JSON.stringify({ name: 'saki-ai-portable', version: '3.0.0', private: true, scripts: { start: 'Saki-AI.exe' } }, null, 2));
const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
fs.writeFileSync(path.join(output, 'BUILD.json'), JSON.stringify({ version: '3.0', revision, builtAt: new Date().toISOString(), platform: process.platform, arch: process.arch, node: process.version }, null, 2));
fs.writeFileSync(path.join(output, 'READ-ME.txt'), 'Saki AI 3.0 - Windows x64 portable\r\n\r\nExtract the entire directory, then double-click Saki-AI.exe. Keep this console open.\r\nThe browser opens at http://127.0.0.1:5480. Ctrl+C stops the server.\r\nNo Node.js/npm installation is required. Keep runtime/backend/frontend together.\r\nData is stored in %LOCALAPPDATA%\\Saki-AI\\data, not inside this release.\r\nOptions: --no-browser, --port NUMBER. SAKI_DATA_DIR overrides the data directory.\r\nConfigure model/API access on first use; no private configuration or models are bundled.\r\nOptional embeddings, Python, browsers, Ollama, QQ and media services require separate setup.\r\n');
// The official Node distribution's license covers Node and its bundled third parties.
const license = path.join(path.dirname(process.execPath), 'LICENSE');
if (fs.existsSync(license)) fs.copyFileSync(license, path.join(output, 'runtime/LICENSE'));
else {
    const response = await fetch('https://raw.githubusercontent.com/nodejs/node/' + process.version + '/LICENSE', { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('Unable to obtain official Node.js license: ' + response.status);
    const text = await response.text();
    if (!text.includes('Node.js') || !text.includes('Copyright')) throw new Error('Unexpected Node.js license response');
    fs.writeFileSync(path.join(output, 'runtime/LICENSE'), text);
}
console.log('[Saki] Portable executable ready: ' + output);
}
main().catch(error => { console.error(error); process.exitCode = 1; });