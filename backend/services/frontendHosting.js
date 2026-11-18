const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { size, getTtsModelSources, getAutomaticTtsModelSources, getTtsModelDownloadUrl, fetchTtsModelResponse } = require('./ttsModelSources');

async function relayTtsModel(req, res) {
    const source = req.params.source;
    const url = ['pan123', 'onedrive', 'github'].includes(source) && getTtsModelDownloadUrl(source);
    if (!url) return res.status(404).json({ error: 'Model download source unavailable.' });

    const connection = new AbortController();
    res.once('close', () => connection.abort());
    const signal = AbortSignal.any([connection.signal, AbortSignal.timeout(15 * 60 * 1000)]);
    try {
        const upstream = await fetchTtsModelResponse(source, url, signal);
        const length = upstream.headers.get('content-length');
        if (!upstream.ok || !upstream.body || upstream.headers.get('content-type')?.includes('text/html') ||
            (length && Number(length) !== size)) {
            await upstream.body?.cancel();
            return res.status(502).json({ error: 'Model download source did not return the expected file.' });
        }

        res.set({ 'Content-Type': 'application/octet-stream', 'Content-Length': String(size), 'Cache-Control': 'no-store' });
        let remaining = size;
        const limit = new Transform({
            transform(chunk, _encoding, callback) {
                remaining -= chunk.length;
                if (remaining < 0) return callback(new Error('Model download exceeded the expected size.'));
                callback(null, chunk);
            },
            flush(callback) {
                callback(remaining ? new Error('Model download was incomplete.') : undefined);
            },
        });
        await pipeline(upstream.body, limit, res, { signal });
    } catch {
        if (res.destroyed) return;
        if (res.headersSent) res.destroy();
        else res.status(502).json({ error: 'Model download source unavailable.' });
    }
}

function mountFrontend(app, runtime) {
    app.get('/api/health', (_req, res) => {
        const memory = process.memoryUsage();
        res.json({ status: 'ok', pid: process.pid, profile: runtime.profile, uptime: process.uptime(), memory: { rss: memory.rss, heapUsed: memory.heapUsed }, frontend: fs.existsSync(path.join(runtime.frontendDist, 'index.html')) });
    });
    app.get('/api/tts/model-sources', (req, res) => {
        const country = req.get('CF-IPCountry')?.toUpperCase();
        res.set('Cache-Control', 'no-store').json({
            ...getTtsModelSources(),
            automatic: getAutomaticTtsModelSources(),
            country: /^[A-Z]{2}$/.test(country) && country !== 'XX' ? country : '',
        });
    });
    app.head('/api/tts/model-download/:source', (_req, res) => res.sendStatus(405));
    app.get('/api/tts/model-download/:source', relayTtsModel);
    if (!runtime.serveFrontend) return;
    // Mount after API routes: missing APIs/assets must never return the SPA shell.
    app.use(['/api', '/uploads', '/files'], (_req, res) => res.status(404).json({ error: 'Not found' }));
    const indexPath = path.join(runtime.frontendDist, 'index.html');
    let animations = true;
    try { animations = JSON.parse(fs.readFileSync(path.join(runtime.frontendDist, 'saki-build.json'), 'utf8')).animations !== false; } catch {}
    const serveIndex = (_req, res, next) => {
        fs.readFile(indexPath, 'utf8', (error, html) => {
            if (error) return next();
            res.setHeader('Cache-Control', 'no-cache, must-revalidate');
            res.setHeader('CDN-Cache-Control', 'no-store');
            res.type('html').send(html.replace('</head>', `<script>window.__SAKI_RUNTIME__=${JSON.stringify({ profile: runtime.profile, animations })};</script></head>`));
        });
    };
    app.get(['/', '/index.html'], serveIndex);
    app.get(['/saki-avatar/Saki_Preview.html', '/saki-avatar/Saki_TransitionMotion.js'], (req, res, next) => {
        res.vary('Accept-Encoding');
        if (req.acceptsEncodings('gzip', 'identity') !== 'gzip' || req.headers.range) return next();
        const compressed = path.join(runtime.frontendDist, req.path + '.gz');
        if (!fs.existsSync(compressed)) return next();
        return res.sendFile(compressed, {
            acceptRanges: false,
            headers: {
                'Content-Type': req.path.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8',
                'Content-Encoding': 'gzip',
                'Cache-Control': 'no-cache',
            },
        });
    });
    app.use(express.static(runtime.frontendDist, {
        index: false, maxAge: '1h',
        setHeaders(res, filePath) {
            if (path.resolve(filePath) === path.resolve(indexPath)) {
                res.setHeader('Cache-Control', 'no-cache, must-revalidate');
                res.setHeader('CDN-Cache-Control', 'no-store');
                return;
            }
            if (path.basename(filePath) === 'Saki_Preview.html') res.setHeader('Cache-Control', 'no-cache');
            if (/[-.][a-zA-Z0-9_-]{8,}\.(js|css)$/.test(path.basename(filePath))) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
    }));
    app.use((req, res, next) => {
        if (req.path.startsWith('/assets/') || path.extname(req.path)) {
            return res.status(404).type('text').send('Not found');
        }
        next();
    });
    app.get('*', (req, res, next) => {
        if (!req.accepts('html')) return next();
        serveIndex(req, res, next);
    });
}

module.exports = { mountFrontend };
