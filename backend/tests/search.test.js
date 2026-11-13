'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const search = require('../services/search');
const good = (host = 'docs.test', title = 'Python asyncio cancellation') => ({ title, content: title, url: `https://${host}/doc` });

test('all off paths refuse network even with explicit engine overrides', async (t) => {
    t.mock.method(axios, 'get', async () => { assert.fail('network disabled'); });
    const config = { searchEngine: ' OFF ', googleApiKey: 'secret', googleCxId: 'cx', bingApiKey: 'secret' };
    assert.deepEqual(search.getAvailableSearchEngines(config), []);
    assert.deepEqual(await search.searchWeb('Python', { config, engine: 'google' }), []);
    assert.deepEqual(await search.searchAcrossEngines('Python', { config, engines: ['google', 'bing'] }), []);
    assert.deepEqual(await search.searchWithEngine('Python', 'bing', config), []);
    assert.deepEqual(await search.searchWithEngine('Python', 'off', {}), []);
});

test('default is searxng; scan past early irrelevant hits and preserve original rank', async (t) => {
    assert.deepEqual(search.getAvailableSearchEngines({}), ['searxng']);
    const mock = t.mock.method(axios, 'get', async (url) => {
        assert.ok(url.startsWith('http://127.0.0.1:8080/search?'));
        return { data: { results: [...Array.from({ length: 7 }, (_, index) => good(`bad${index}.test`, 'Football')), good()] } };
    });
    const results = await search.searchWeb('Python asyncio cancellation', { config: {}, limit: 1 });
    assert.equal(results.length, 1);
    assert.equal(results[0].rank, 8);
    assert.ok(results[0].relevanceScore > 0.8);
    assert.equal(mock.mock.callCount(), 1);
});

test('DDG never fabricates RelatedTopics and only returns labeled real abstracts', async (t) => {
    let data = { RelatedTopics: [{ Text: 'Python asyncio cancellation', FirstURL: 'https://fake.test' }] };
    t.mock.method(axios, 'get', async () => ({ data }));
    assert.deepEqual(await search.searchWithEngine('Python', 'duckduckgo'), []);
    data = { Heading: 'Python', AbstractText: 'Python programming language', AbstractURL: 'https://wiki.test/Python' };
    const results = await search.searchWithEngine('Python', 'duckduckgo');
    assert.equal(results[0].title, 'Python');
    assert.equal(results[0].type, 'instant_answer');
    data = { ...data, AbstractHeading: 'Python language', Heading: 'Different heading' };
    assert.equal((await search.searchWithEngine('Python', 'duckduckgo'))[0].title, 'Python language');
    data = { ...data, Heading: '', AbstractHeading: '' };
    assert.deepEqual(await search.searchWithEngine('Python', 'duckduckgo'), []);
    data = { ...data, AbstractHeading: 'Python', AbstractURL: 'javascript:bad' };
    assert.deepEqual(await search.searchWithEngine('Python', 'duckduckgo'), []);
});

test('searchWeb falls back only to configured full web engines and stops when filled', async (t) => {
    const calls = [];
    t.mock.method(axios, 'get', async (url, options) => {
        calls.push(url);
        if (url.includes('googleapis')) {
            assert.ok(url.includes('num=10'));
            return { data: { items: [{ title: 'Python asyncio cancellation', link: 'https://google.test/doc' }] } };
        }
        if (url.includes('bing')) {
            assert.ok(options.headers['Ocp-Apim-Subscription-Key']);
            return { data: { webPages: { value: [{ name: 'Python asyncio cancellation', url: 'https://bing.test/doc' }] } } };
        }
        assert.ok(!url.includes('duckduckgo'));
        return { data: { results: [good('bad.test', 'Football')] } };
    });
    const config = { googleApiKey: 'key', googleCxId: 'cx', bingApiKey: 'key' };
    const one = await search.searchWeb('Python asyncio cancellation', { config, limit: 1 });
    assert.equal(one[0].engine, 'google');
    assert.equal(calls.length, 2);
    calls.length = 0;
    assert.equal((await search.searchWeb('Python asyncio cancellation', { config, limit: 5 })).length, 2);
    assert.equal(calls.length, 3);
});

test('across engines globally ranks and deduplicates expanded candidates', async (t) => {
    const mock = t.mock.method(axios, 'get', async (url) => url.includes('bing')
        ? { data: { webPages: { value: [
            { name: 'Python asyncio cancellation', url: 'https://shared.test/doc?utm_source=bing', snippet: 'Guide' },
            { name: 'Python asyncio cancellation', url: 'https://other.test/doc' },
        ] } } }
        : { data: { results: [good('weak.test', 'Python'), good('shared.test')] } });
    const results = await search.searchAcrossEngines('Python asyncio cancellation', {
        config: { bingApiKey: 'key' }, engines: ['searxng', 'bing', 'google', 'bing'], limitPerEngine: 1,
    });
    assert.equal(mock.mock.callCount(), 2);
    assert.equal(results.length, 2);
    assert.ok(results.every((item) => item.title === 'Python asyncio cancellation'));
    assert.equal(new Set(results.map((item) => item.url)).size, 2);
    assert.ok(results.every((item) => item.query === 'Python asyncio cancellation'));
    const shared = results.find(item => item.url === 'https://shared.test/doc');
    assert.equal(shared.engineCount, 2);
    assert.deepEqual(shared.rankings.map(item => [item.engine, item.rank]).sort(), [['bing', 1], ['searxng', 2]]);
    const { mergeRankedSearchResults } = require('../services/credibility');
    const merged = mergeRankedSearchResults(results, 'Python asyncio cancellation').find(item => item.url === shared.url);
    assert.equal(merged.engineCount, 2);
    assert.equal(merged.rank, 1);
    assert.deepEqual(merged.rankings.map(item => [item.engine, item.rank]).sort(), [['bing', 1], ['searxng', 2]]);
    assert.equal(mergeRankedSearchResults([...results, ...results])[0].rankings.length, results[0].rankings.length);
});

test('errors never log secrets/endpoints, failed search is not replaced by encyclopedia', async (t) => {
    t.mock.method(axios, 'get', async () => { throw new Error('secret-key http://private:8080/?token=secret'); });
    const log = t.mock.method(console, 'error', () => {});
    assert.deepEqual(await search.searchWeb('Python', { config: { searchEngine: 'google', googleApiKey: 'secret-key', googleCxId: 'secret-cx' } }), []);
    assert.equal(log.mock.callCount(), 1);
    assert.deepEqual(log.mock.calls[0].arguments, ['google search failed.']);
});

test('zero budgets, empty queries and missing credentials never fetch', async (t) => {
    t.mock.method(axios, 'get', async () => { assert.fail('unexpected fetch'); });
    assert.deepEqual(await search.searchWithEngine('Python', 'google', {}), []);
    assert.deepEqual(await search.searchWeb('', { config: {} }), []);
    assert.deepEqual(await search.searchWeb('Python', { config: {}, limit: 0 }), []);
    assert.deepEqual(await search.searchAcrossEngines('Python', { config: {}, maxEngines: 0 }), []);
    assert.deepEqual(await search.searchAcrossEngines('Python', { config: {}, limitPerEngine: 0 }), []);
    assert.deepEqual(await search.searchAcrossEngines('Python', { config: {}, limit: 0 }), []);
});

test('no credentials means no implicit DDG or unconfigured web fallbacks', async (t) => {
    const mock = t.mock.method(axios, 'get', async (url) => {
        assert.ok(url.startsWith('http://127.0.0.1:8080/search?'));
        return { data: { results: [] } };
    });
    assert.deepEqual(await search.searchWeb('Python', { config: {} }), []);
    assert.equal(mock.mock.callCount(), 1);
});

test('complex searches retrieve focused variants and merge distinct evidence', async (t) => {
    const calls = [];
    t.mock.method(axios, 'get', async (url) => {
        const parsed = new URL(url);
        const query = parsed.searchParams.get('q');
        calls.push(query);
        return { data: { results: [{
            title: query,
            content: '固态电池与钠离子电池低温循环寿命比较 成本 风险',
            url: `https://${calls.length}.example.test/research`,
        }] } };
    });
    const results = await search.searchComplexQuery('比较固态电池与钠离子电池低温循环寿命，分析成本和风险', {
        config: {}, limit: 8,
    });
    assert.ok(calls.length > 1);
    assert.ok(calls.some(query => query.includes('风险 安全')));
    assert.ok(results.length > 1);
    assert.ok(results.every(result => result.query));
});