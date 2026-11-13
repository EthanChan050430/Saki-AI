const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { mountFrontend } = require('../services/frontendHosting');

test('frontend HTML is revalidated and missing assets do not fall back to HTML', async (t) => {
    const frontendDist = fs.mkdtempSync(path.join(os.tmpdir(), 'saki-frontend-'));
    fs.mkdirSync(path.join(frontendDist, 'assets'));
    fs.writeFileSync(path.join(frontendDist, 'index.html'), '<!doctype html><html><head></head><body></body></html>');
    fs.writeFileSync(path.join(frontendDist, 'saki-build.json'), JSON.stringify({ animations: true }));
    fs.writeFileSync(path.join(frontendDist, 'assets', 'index-abcdefgh.js'), 'current bundle');
    const app = express();
    mountFrontend(app, { profile: 'standard', frontendDist, serveFrontend: true });
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
    });
    t.after(() => {
        server.close();
        fs.rmSync(frontendDist, { recursive: true, force: true });
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const page = await fetch(baseUrl);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('cache-control'), /no-cache/);
    assert.match(page.headers.get('cdn-cache-control'), /no-store/);

    const missingAsset = await fetch(`${baseUrl}/assets/old-abcdefgh.js`);
    assert.equal(missingAsset.status, 404);
    assert.doesNotMatch(missingAsset.headers.get('content-type') || '', /text\/html/);
});
