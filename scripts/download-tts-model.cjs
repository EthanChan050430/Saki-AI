#!/usr/bin/env node
const fs = require('node:fs/promises');
const { createReadStream, createWriteStream, existsSync } = require('node:fs');
const { createHash } = require('node:crypto');
const path = require('node:path');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { fileName, size, sha256, getTtsModelDownloadUrl, fetchTtsModelResponse } = require('../backend/services/ttsModelSources');
const { loadEnv } = require('./launch.cjs');

const root = path.resolve(__dirname, '..');
const sources = ['github', 'google', 'onedrive', 'pan123'];

async function isInstalled(target) {
    const stat = await fs.stat(target).catch(error => {
        if (error.code !== 'ENOENT') throw error;
    });
    if (!stat?.isFile() || stat.size !== size) return false;
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(target)) hash.update(chunk);
    return hash.digest('hex') === sha256;
}

async function main(args) {
    if (args.includes('--help')) {
        console.log('Usage: node scripts/download-tts-model.cjs [github|google|onedrive|pan123] [--dist]');
        return;
    }
    const [source = 'github', ...extra] = args.filter(arg => arg !== '--dist');
    if (!sources.includes(source) || extra.length) {
        throw new Error('Choose a model source: github, google, onedrive, or pan123. Optional flag: --dist.');
    }

    loadEnv();
    const url = getTtsModelDownloadUrl(source);
    if (!url) {
        const variable = source === 'pan123' ? 'SAKI_TTS_123PAN_DIRECT_URL' : 'SAKI_TTS_ONEDRIVE_URL';
        throw new Error('Set ' + variable + ' to a public model download URL.');
    }
    const dist = path.resolve(process.env.SAKI_FRONTEND_DIST || path.join(root, 'frontend/dist'));
    const isSourceTree = existsSync(path.join(root, 'frontend/package.json'));
    const directory = args.includes('--dist') || !isSourceTree ? dist : path.join(root, 'frontend/public');
    const destination = path.join(directory, 'tts-wasm');
    const target = path.join(destination, fileName);
    if (await isInstalled(target)) {
        console.log('[TTS] Verified existing model: ' + target);
        return;
    }

    await fs.mkdir(destination, { recursive: true });
    const scratch = await fs.mkdtemp(path.join(destination, '.model-download-'));
    const partial = path.join(scratch, fileName);
    try {
        console.log('[TTS] Downloading from ' + source + ' (132 MiB)');
        const signal = AbortSignal.timeout(15 * 60 * 1000);
        const response = await fetchTtsModelResponse(source, url, signal);
        if (!response.ok || !response.body || response.headers.get('content-type')?.includes('text/html')) {
            await response.body?.cancel();
            throw new Error('Download did not return the model (HTTP ' + response.status + '). Use a direct download URL or download the file in a browser.');
        }
        const hash = createHash('sha256');
        let bytes = 0;
        const verify = new Transform({
            transform(chunk, _encoding, callback) {
                bytes += chunk.length;
                if (bytes > size) return callback(new Error('Model exceeds expected size.'));
                hash.update(chunk);
                callback(null, chunk);
            },
        });
        await pipeline(response.body, verify, createWriteStream(partial));
        if (bytes !== size || hash.digest('hex') !== sha256) throw new Error('Model checksum or size mismatch.');
        await fs.rename(partial, target);
        console.log('[TTS] Model verified and installed: ' + target);
    } finally {
        await fs.rm(scratch, { recursive: true, force: true });
    }
}

main(process.argv.slice(2)).catch(error => {
    const reason = error.cause?.code;
    console.error('[TTS] ' + error.message + (reason ? ' (' + reason + ')' : ''));
    process.exitCode = 1;
});
