import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const model = Buffer.from('model');
const hash = createHash('sha256').update(model).digest('hex');
const workerSource = readFileSync(new URL('../public/tts-wasm/saki-tts.worker.js', import.meta.url), 'utf8')
  .replace(/const MODEL_SIZE = \d+;/, 'const MODEL_SIZE = ' + model.length + ';')
  .replace(/const MODEL_SHA256 = '[a-f0-9]+';/, "const MODEL_SHA256 = '" + hash + "';");
const sourcesUrl = 'https://app.test/base/api/tts/model-sources';
const geoUrl = 'https://api.country.is/';
const googleUrl = 'https://google.test/model';
const panUrl = 'https://pan.test/model';
const automatic = {
  pan123: [panUrl],
  onedrive: ['./model-download/onedrive'],
  github: ['./model-download/github'],
  google: [googleUrl],
};
const relay = source => 'https://app.test/base/api/tts/model-download/' + source;

async function runAuto({ sources, geo = '', cached = false, downloads = {} }) {
  const requests = [];
  const progress = [];
  let written;
  const self = {
    location: new URL('https://app.test/tts-wasm/saki-tts.worker.js'),
    crypto: webcrypto,
    addEventListener() {},
    postMessage(message) { progress.push(message); },
    caches: { open: async () => ({
      match: async () => cached ? new Response(model) : undefined,
      put: async (_key, response) => { written = Buffer.from(await response.arrayBuffer()); },
    }) },
  };
  const context = vm.createContext({
    self, URL, Response, Uint8Array, AbortController, AbortSignal, setTimeout, clearTimeout,
    fetch: async (input, options) => {
      assert.equal(options.method, undefined);
      assert.equal(options.headers, undefined);
      const url = String(input);
      requests.push(url);
      if (url === sourcesUrl) return Response.json(sources);
      if (url === geoUrl) return Response.json({ country: geo });
      return downloads[url]?.() || new Response('unavailable', { status: 502 });
    },
  });
  vm.runInContext(workerSource, context);
  const bytes = await vm.runInContext('loadModelPackage(undefined, "auto", ' + JSON.stringify(sourcesUrl) + ')', context);
  return { requests, progress, model: bytes && Buffer.from(bytes), written };
}

test('China uses 123 first and falls back to OneDrive after a corrupt response', async () => {
  const result = await runAuto({
    sources: { country: 'CN', automatic },
    downloads: {
      [panUrl]: () => new Response('wrong', { headers: { 'Content-Type': 'application/octet-stream' } }),
      [relay('onedrive')]: () => new Response(model),
    },
  });
  assert.deepEqual(result.requests, [sourcesUrl, panUrl, relay('onedrive')]);
  assert.deepEqual(result.model, model);
  assert.deepEqual(result.written, model);
  assert.equal(result.progress.filter(message => message.type === 'download-source').at(-1).source, 'onedrive');
});

test('the browser public IP determines overseas order and skips share-only sources', async () => {
  const { requests, model: downloaded } = await runAuto({
    sources: { automatic: { github: automatic.github, google: automatic.google } },
    geo: 'US',
    downloads: { [googleUrl]: () => new Response(model) },
  });
  assert.deepEqual(requests, [sourcesUrl, geoUrl, relay('github'), googleUrl]);
  assert.deepEqual(downloaded, model);
});

test('a cache hit avoids both IP lookup and mirror requests', async () => {
  const result = await runAuto({ cached: true });
  assert.deepEqual(result.requests, []);
  assert.deepEqual(result.model, model);
  assert.equal(result.written, undefined);
});

test('the local deployment remains available when every automatic mirror fails', async () => {
  const result = await runAuto({ sources: { country: 'CN', automatic } });
  assert.deepEqual(result.requests, [sourcesUrl, panUrl, relay('onedrive'), relay('github'), googleUrl]);
  assert.equal(result.model, null);
  assert.equal(result.progress.at(-1).source, 'server');
});
