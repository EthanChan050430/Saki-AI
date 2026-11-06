'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const dns = require('node:dns').promises;
const fs = require('node:fs');
const axios = require('axios');
const { crawlUrl, fetchPublicUrl, closeCrawler } = require('../services/crawler');
const publicAddress = { address: '93.184.216.34', family: 4 };
const html = '<main><p>Public fixture</p></main>';
const response = (status = 200, headers = {}, body = html) => ({ status, headers, data: Buffer.from(body) });
const lookup = (fn, host, options) => new Promise((resolve, reject) =>
    fn(host, options, (error, address, family) => error ? reject(error) : resolve({ address, family })));

test('HTTP lookup uses only the checked address, supports all/family and disables proxies/redirects', async t => {
    const resolve = t.mock.method(dns, 'lookup', async () => [publicAddress]);
    t.mock.method(axios, 'get', async (url, options) => {
        assert.equal(url, 'https://public.test/');
        assert.equal(options.proxy, false);
        assert.equal(options.maxRedirects, 0);
        // Simulate DNS changing after validation. No second resolver call may occur.
        resolve.mock.mockImplementation(async () => [{ address: '127.0.0.1', family: 4 }]);
        assert.deepEqual(await lookup(options.httpsAgent.options.lookup, 'public.test', { family: 4 }), publicAddress);
        assert.deepEqual((await lookup(options.lookup, 'public.test', { all: true })).address, [publicAddress]);
        await assert.rejects(lookup(options.lookup, 'other.test', {}), /Unexpected/);
        return response();
    });
    assert.match(await crawlUrl('https://public.test', { mode: 'static' }), /Public fixture/);
    // crawlUrl validates once up front and fetch validates again; neither is used
    // as authorization for an unpinned subsequent DNS resolution.
    assert.equal(resolve.mock.callCount(), 2);
});

test('public redirects are followed manually and each hop gets fresh pinned agents', async t => {
    const hosts = [];
    t.mock.method(dns, 'lookup', async host => { hosts.push(host); return [publicAddress]; });
    const agents = [];
    t.mock.method(axios, 'get', async (url, options) => {
        agents.push(options.httpsAgent);
        assert.deepEqual(await lookup(options.lookup, new URL(url).hostname, {}), publicAddress);
        return url.endsWith('/start') ? response(302, { location: 'https://next.test/final' }) : response();
    });
    assert.equal((await fetchPublicUrl('https://public.test/start')).url, 'https://next.test/final');
    assert.deepEqual(hosts, ['public.test', 'next.test']);
    assert.notEqual(agents[0], agents[1]);
});

test('private, mapped, mixed DNS and credential targets never reach HTTP', async t => {
    t.mock.method(axios, 'get', async () => assert.fail('No real or private network request allowed'));
    t.mock.method(dns, 'lookup', async () => [publicAddress, { address: '10.0.0.1', family: 4 }]);
    for (const url of ['http://127.0.0.1', 'http://[::1]', 'http://[::ffff:7f00:1]',
        'http://[::]', 'http://100.64.0.1', 'http://169.254.169.254', 'http://224.0.0.1',
        'http://mixed.test', 'https://user:pass@public.test', 'file:///secret']) {
        await assert.rejects(fetchPublicUrl(url));
    }
});

test('redirects to private DNS are blocked before a second HTTP request; loops are bounded', async t => {
    t.mock.method(dns, 'lookup', async host => host === 'private.test'
        ? [{ address: '192.168.1.1', family: 4 }] : [publicAddress]);
    const get = t.mock.method(axios, 'get', async () => response(302, { location: 'http://private.test/' }));
    await assert.rejects(fetchPublicUrl('https://public.test'), /Private/);
    assert.equal(get.mock.callCount(), 1);
    get.mock.mockImplementation(async () => response(302, { location: '/again' }));
    await assert.rejects(fetchPublicUrl('https://public.test'), /redirects/);
    assert.equal(get.mock.callCount(), 7);
});

test('browser requests are fulfilled with pinned HTTP, blocked requests never continue, fallback stays protected', async t => {
    t.mock.method(fs, 'existsSync', () => true);
    t.mock.method(dns, 'lookup', async host => host === 'private.test'
        ? [{ address: '127.0.0.1', family: 4 }] : [publicAddress]);
    const get = t.mock.method(axios, 'get', async (_url, options) => {
        assert.equal(options.proxy, false);
        assert.ok(options.lookup);
        return response();
    });
    let handler;
    let bypass = false;
    const page = {
        setBypassServiceWorker: async value => { bypass = value; },
        setRequestInterception: async () => {},
        on: (_event, callback) => { handler = callback; },
        goto: async () => {}, content: async () => html, close: async () => {},
    };
    const instance = { on: () => {}, close: async () => {}, createBrowserContext: async () => ({
        newPage: async () => page, close: async () => {},
    }) };
    t.mock.method(require('puppeteer-core'), 'launch', async options => {
        assert.ok(options.args.includes('--proxy-server=http://127.0.0.1:0'));
        return instance;
    });
    t.after(closeCrawler);
    assert.match(await crawlUrl('https://public.test', { mode: 'browser' }), /Public fixture/);
    assert.equal(bypass, true);
    function request(url, type = 'document') {
        return { url: () => url, resourceType: () => type, method: () => 'GET', redirectChain: () => [],
            continue: () => assert.fail('Browser must never connect directly'),
            abort: async () => 'blocked', respond: async payload => payload };
    }
    const result = await handler(request('https://public.test'));
    assert.match(result.headers['content-security-policy'], /worker-src 'none'/);
    assert.equal(Buffer.from(result.body).toString(), html);
    assert.equal(await handler(request('http://private.test')), 'blocked');
    assert.equal(await handler(request('ws://public.test', 'websocket')), 'blocked');
    assert.equal(get.mock.callCount(), 1);
    page.goto = async () => { throw new Error('fixture navigation failure'); };
    t.mock.method(console, 'warn', () => {});
    assert.match(await crawlUrl('https://public.test', { mode: 'browser' }), /Public fixture/);
    assert.equal(get.mock.callCount(), 2);
});