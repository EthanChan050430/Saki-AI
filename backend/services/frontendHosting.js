const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

function mountFrontend(app, runtime) {
    app.get('/api/health', (_req, res) => {
        const memory = process.memoryUsage();
        res.json({ status: 'ok', pid: process.pid, profile: runtime.profile, uptime: process.uptime(), memory: { rss: memory.rss, heapUsed: memory.heapUsed }, frontend: fs.existsSync(path.join(runtime.frontendDist, 'index.html')) });
    });
    if (!runtime.serveFrontend) return;
    // Mount after API routes: missing APIs/assets must never return the SPA shell.
    app.use(['/api', '/uploads', '/files'], (_req, res) => res.status(404).json({ error: 'Not found' }));
    const indexPath = path.join(runtime.frontendDist, 'index.html');
    let animations = true;
    try { animations = JSON.parse(fs.readFileSync(path.join(runtime.frontendDist, 'saki-build.json'), 'utf8')).animations !== false; } catch {}
    const serveIndex = (_req, res, next) => {
        fs.readFile(indexPath, 'utf8', (error, html) => {
            if (error) return next();
            res.setHeader('Cache-Control', 'no-cache');
            res.type('html').send(html.replace('</head>', `<script>window.__SAKI_RUNTIME__=${JSON.stringify({ profile: runtime.profile, animations })};</script></head>`));
        });
    };
    app.get(['/', '/index.html'], serveIndex);
    app.use(express.static(runtime.frontendDist, {
        index: false, maxAge: '1h',
        setHeaders(res, filePath) {
            if (/[-.][a-zA-Z0-9_-]{8,}\.(js|css)$/.test(path.basename(filePath))) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
    }));
    app.get('*', (req, res, next) => {
        if (path.extname(req.path) || req.path.startsWith('/assets/') || !req.accepts('html')) return next();
        serveIndex(req, res, next);
    });
}

module.exports = { mountFrontend };
