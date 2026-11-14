'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const search = require('../services/search');
const good = (host = 'docs.test', title = 'Python asyncio cancellation') => ({ title, content: title, url: `https://${host}/doc` });
const reply = (id, rows, sse = true) => {
    const text = rows.length ? rows.map(row => `Title: ${row.title}\nURL: ${row.url}\nPublished: N/A\nAuthor: N/A\nHighlights:\n${row.content}`).join('\n\n---\n\n') : 'No search results found. Please try a different query.';
    const data = { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
    return { data: sse ? `event: message\r\ndata: ${JSON.stringify(data)}\r\n\r\n` : data };
};

test('default search remains hosted regardless of legacy provider values', async t => {
    const mock = t.mock.method(axios, 'post', async (url, request, options) => {
        assert.equal(url, 'https://mcp.exa.ai/mcp');
        assert.equal(request.method, 'tools/call');
        assert.equal(request.params.name, 'web_search_exa');
        assert.equal(request.params.arguments.query, 'Python asyncio cancellation');
        assert.ok(request.params.arguments.numResults >= 8);
        assert.equal(options.headers.Accept, 'application/json, text/event-stream');
        assert.ok(!JSON.stringify(request).includes('secret'));
        return reply(request.id, [good()]);
    });
    for (const searchEngine of ['off', 'google', 'duckduckgo', undefined]) {
        const config = { searchEngine, searxngUrl: 'http://private:8080', googleApiKey: 'secret' };
        assert.deepEqual(search.getAvailableSearchEngines(config), ['exa', 'searxng']);
        const results = await search.searchWeb('Python asyncio cancellation', { config, engine: searchEngine });
        assert.equal(results[0].engine, 'exa');
    }
    assert.equal(mock.mock.callCount(), 4);
});

test('SearxNG selection uses configured endpoint and maps JSON results', async t => {
    const mock = t.mock.method(axios, 'get', async (url, options) => {
        assert.equal(url, 'http://localhost:8080/search');
        assert.equal(options.params.q, 'Python asyncio cancellation');
        assert.equal(options.params.format, 'json');
        return { data: { results: [
            { title: 'Python asyncio cancellation', url: 'https://docs.test/asyncio', content: 'Cancellation guide' },
            { title: 'Invalid URL', url: 'javascript:alert(1)', content: 'ignore' },
        ] } };
    });
    const results = await search.searchWeb('Python asyncio cancellation', {
        limit: 1,
        config: { searchEngine: 'searxng', searxngUrl: 'http://localhost:8080/' },
    });
    assert.equal(mock.mock.callCount(), 1);
    assert.equal(results.length, 1);
    assert.equal(results[0].engine, 'searxng');
    assert.equal(results[0].content, 'Cancellation guide');
});

test('SearxNG selection requires a valid configured URL', async t => {
    t.mock.method(axios, 'get', async () => assert.fail('invalid endpoint must not be requested'));
    t.mock.method(axios, 'post', async () => assert.fail('must not fall back to Exa'));
    for (const searxngUrl of ['', undefined, 'file:///etc/passwd', 'https://user:secret@instance.test', 'https://instance.test/?key=secret', 'https://instance.test/#secret']) {
        await assert.rejects(search.searchWeb('Python', {
            config: { searchEngine: 'searxng', searxngUrl },
        }), error => /SearxNG URL must be/u.test(error.message) && error.retryable === false && !error.message.includes('secret'));
    }
});

test('SearxNG ranks all candidates before limiting and supports subpath endpoints', async t => {
    t.mock.method(axios, 'post', async () => assert.fail('must not use Exa'));
    t.mock.method(axios, 'get', async url => {
        assert.equal(url, 'http://localhost:8080/searxng/search');
        return { data: { results: [good('unrelated.test', 'Football'), good()] } };
    });
    const results = await search.searchWithEngine('Python asyncio cancellation', 'searxng', {
        searxngUrl: 'http://localhost:8080/searxng/search/',
    }, 1);
    assert.equal(results.length, 1);
    assert.equal(results[0].rank, 2);
    assert.equal(results[0].url, 'https://docs.test/doc');
});

test('Agent follow-ups and deep research keep the selected SearxNG provider', async t => {
    t.mock.method(axios, 'post', async () => assert.fail('must not use Exa'));
    const calls = [];
    t.mock.method(axios, 'get', async (_, options) => {
        calls.push(options.params.q);
        return { data: { results: [good()] } };
    });
    const config = { searchEngine: 'searxng', searxngUrl: 'http://localhost:8080' };
    const report = await search.searchForAgent('compare Python asyncio cancellation', {
        config, readPages: false, maxQueries: 3,
    });
    assert.ok(calls.length > 1);
    assert.ok(report.results.length);
    assert.ok(report.results.every(result => result.engine === 'searxng'));
    assert.ok(report.searches.every(item => item.status === 'completed'));
    const results = await search.searchAcrossEngines('Python asyncio cancellation', { config });
    assert.equal(results[0].engine, 'searxng');
    assert.ok(results[0].rankings.every(item => item.engine === 'searxng'));
});

test('SearxNG failures stop follow-ups and never leak responses or fall back', async t => {
    t.mock.method(console, 'warn', () => {});
    t.mock.method(axios, 'post', async () => assert.fail('must not fall back to Exa'));
    const mock = t.mock.method(axios, 'get');
    for (const [failure, expected] of [
        [{ response: { status: 403, data: 'secret' } }, /HTTP 403.*search.formats/u],
        [{ response: { status: 429, data: 'secret' } }, /rate limited/u],
        [{ response: { status: 502, data: 'secret' } }, /HTTP 502/u],
        [{ code: 'ETIMEDOUT' }, /timed out/u],
        [{ code: 'ECONNREFUSED', message: 'http://private/?key=secret' }, /could not connect/u],
    ]) {
        mock.mock.mockImplementation(async () => { throw failure; });
        const before = mock.mock.callCount();
        await assert.rejects(search.searchForAgent('compare Python asyncio cancellation', {
            config: { searchEngine: 'searxng', searxngUrl: 'http://localhost:8080' },
        }), error => expected.test(error.message) && !error.message.includes('secret'));
        assert.equal(mock.mock.callCount() - before, 1);
    }
});

test('SearxNG distinguishes empty results from malformed responses and upstream failures', async t => {
    t.mock.method(console, 'warn', () => {});
    const mock = t.mock.method(axios, 'get');
    const config = { searchEngine: 'searxng', searxngUrl: 'http://localhost:8080' };
    for (const data of ['<html>captcha secret</html>', null, {}, { results: 'secret' }, { results: [], unresponsive_engines: [['engine', 'secret']] }]) {
        mock.mock.mockImplementation(async () => ({ data }));
        const before = mock.mock.callCount();
        await assert.rejects(search.searchForAgent('compare Python asyncio cancellation', { config }), error =>
            /SearxNG/u.test(error.message) && !error.message.includes('secret'));
        assert.equal(mock.mock.callCount() - before, 1);
    }
    mock.mock.mockImplementation(async () => ({ data: { results: [] } }));
    assert.deepEqual(await search.searchWeb('Python', { config }), []);
    mock.mock.mockImplementation(async () => ({ data: { results: [good()], unresponsive_engines: [['engine', 'timeout']] } }));
    assert.equal((await search.searchWeb('Python asyncio cancellation', { config })).length, 1);
});

test('SearxNG retrieves later relevant pages and stops when the requested matches are available', async t => {
    const calls = [];
    t.mock.method(axios, 'get', async (_, options) => {
        calls.push(options.params);
        return { data: { results: options.params.pageno === 1
            ? [good('irrelevant.test', 'Football')] : [good('first.test'), good('second.test')] } };
    });
    const results = await search.searchWeb('Python asyncio cancellation', {
        limit: 2, config: { searchEngine: 'searxng', searxngUrl: 'http://localhost:8080' },
    });
    assert.deepEqual(calls.map(call => call.pageno), [1, 2]);
    assert.ok(calls.every(call => call.q === 'Python asyncio cancellation' && call.format === 'json'));
    assert.deepEqual(results.map(result => result.rank), [2, 3]);
});

test('SearxNG cleans HTML and entities while preserving dates and upstream provenance', async t => {
    t.mock.method(axios, 'get', async () => ({ data: { results: [null, {
        title: '<b>Python</b> asyncio cancellation', url: 'https://docs.test/doc?utm_source=search',
        content: '<p>Python</p><p>asyncio &amp; cancellation &#x4E2D;&#x6587;</p><script>secret</script>',
        engines: ['google', 'bing', 'google', { bad: true }], score: 2.5, publishedDate: '2026-11-13',
    }] } }));
    const [result] = await search.searchWeb('Python asyncio cancellation', {
        limit: 1, config: { searchEngine: 'searxng', searxngUrl: 'http://localhost:8080' },
    });
    assert.equal(result.title, 'Python asyncio cancellation');
    assert.equal(result.content, 'Python asyncio & cancellation \u4e2d\u6587');
    assert.equal(result.url, 'https://docs.test/doc');
    assert.equal(result.rank, 2);
    assert.equal(result.publishedDate, '2026-11-13');
    assert.equal(result.providerScore, 2.5);
    assert.deepEqual(result.sourceEngines, ['google', 'bing']);
});

test('SearxNG stops on duplicate or empty pages and caps unique pagination at three requests', async t => {
    const mock = t.mock.method(axios, 'get');
    const config = { searchEngine: 'searxng', searxngUrl: 'http://localhost:8080' };
    for (const ending of ['duplicate', 'empty', 'budget']) {
        mock.mock.mockImplementation(async (_, options) => {
            const page = options.params.pageno;
            return { data: { results: ending === 'empty' && page > 1 ? [] : [{
                ...good(ending === 'budget' ? `page${page}.test` : 'same.test'),
                url: `https://${ending === 'budget' ? `page${page}` : 'same'}.test/doc?utm_source=${page}`,
            }] } };
        });
        const before = mock.mock.callCount();
        const report = await search.searchForAgent('Python asyncio cancellation', { config, readPages: false, maxQueries: 1 });
        assert.equal(mock.mock.callCount() - before, ending === 'budget' ? 3 : 2);
        assert.equal(report.results.length, ending === 'budget' ? 3 : 1);
        assert.equal(report.searches[0].requestCount, ending === 'budget' ? 3 : 2);
        assert.equal(report.warnings.some(warning => /page budget/u.test(warning)), ending === 'budget');
    }
});

test('SearxNG paginates against the original constraints and domain budget', async t => {
    const query = 'Python asyncio cancellation site:docs.test -advertisement';
    const mock = t.mock.method(axios, 'get', async (_, options) => {
        assert.equal(options.params.q, query);
        return { data: { results: options.params.pageno === 1
            ? [good('outside.test'), { ...good(), content: 'Python asyncio cancellation advertisement' }]
            : [{ ...good(), url: 'https://docs.test/one' }, { ...good(), url: 'https://docs.test/two' }] } };
    });
    const results = await search.searchWeb(query, { limit: 1,
        config: { searchEngine: 'searxng', searxngUrl: 'http://localhost:8080' },
    });
    assert.equal(mock.mock.callCount(), 2);
    assert.equal(results[0].url, 'https://docs.test/one');
});

test('SearxNG retains partial results and reports failures without exposing upstream details', async t => {
    t.mock.method(axios, 'post', async () => assert.fail('must not fall back'));
    const mock = t.mock.method(axios, 'get');
    for (const partial of [true, false]) {
        mock.mock.mockImplementation(async (_, options) => {
            if (options.params.pageno > 1) throw { response: { status: 429, data: 'secret' } };
            return { data: { results: [good()], unresponsive_engines: partial ? [['private secret', 'secret']] : [] } };
        });
        const before = mock.mock.callCount();
        const report = await search.searchForAgent('compare Python asyncio cancellation', { readPages: false,
            config: { searchEngine: 'searxng', searxngUrl: 'http://localhost:8080' },
        });
        assert.equal(mock.mock.callCount() - before, partial ? 1 : 2);
        assert.equal(report.searches.length, 1);
        assert.equal(report.results.length, 1);
        assert.match(report.warnings.join(' '), partial ? /upstream engine failures/u : /rate limited/u);
        assert.ok(!JSON.stringify(report).includes('secret'));
    }
});

test('SearxNG pages share the remaining report time budget', async t => {
    let now = 1000;
    t.mock.method(Date, 'now', () => now);
    const timeouts = [];
    t.mock.method(axios, 'get', async (_, options) => {
        timeouts.push(options.timeout);
        now += 400;
        return { data: { results: options.params.pageno === 1 ? [good('unrelated.test', 'Football')] : [good()] } };
    });
    const report = await search.searchForAgent('Python asyncio cancellation', {
        limit: 1, perQueryLimit: 1, timeoutMs: 1000, readPages: false,
        config: { searchEngine: 'searxng', searxngUrl: 'http://localhost:8080' },
    });
    assert.deepEqual(timeouts, [1000, 600]);
    assert.equal(report.results.length, 1);
});

test('SearxNG rejects unusable links and tolerates malformed optional fields', async t => {
    const mock = t.mock.method(axios, 'get');
    const config = { searchEngine: 'searxng', searxngUrl: 'http://localhost:8080' };
    mock.mock.mockImplementation(async () => ({ data: { results: [
        { title: 'Python', url: 'https://user:secret@docs.test/doc' }, { url: 'javascript:alert(1)' },
    ] } }));
    await assert.rejects(search.searchWeb('Python', { config }), /without usable HTTP/u);
    mock.mock.mockImplementation(async () => ({ data: { results: [{
        ...good(), content: { bad: true }, snippet: 'Python asyncio cancellation', published_date: { bad: true },
    }] } }));
    const [result] = await search.searchWeb('Python asyncio cancellation', { config, limit: 1 });
    assert.equal(result.content, 'Python asyncio cancellation');
    assert.equal(result.publishedDate, null);
});

test('SearxNG sends encoded queries and sequential pages through a real HTTP endpoint', async t => {
    const http = require('node:http');
    const requests = [];
    const server = http.createServer((request, response) => {
        const url = new URL(request.url, 'http://localhost');
        requests.push(url);
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ results: url.searchParams.get('pageno') === '1'
            ? [good('unrelated.test', 'Football')] : [good()] }));
    });
    t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const query = 'Python asyncio cancellation site:docs.test';
    const results = await search.searchWeb(query, { limit: 1, config: {
        searchEngine: 'searxng', searxngUrl: `http://127.0.0.1:${server.address().port}/instance/`,
    } });
    assert.equal(results.length, 1);
    assert.deepEqual(requests.map(url => url.searchParams.get('pageno')), ['1', '2']);
    assert.ok(requests.every(url => url.pathname === '/instance/search' && url.searchParams.get('q') === query
        && url.searchParams.get('format') === 'json'));
});

test('SSE results preserve provider rank, remove tracking and filter unrelated hits', async t => {
    t.mock.method(axios, 'post', async (_, request) => reply(request.id, [
        ...Array.from({ length: 7 }, (_, index) => good(`bad${index}.test`, 'Football')),
        { ...good(), url: 'https://docs.test/doc?utm_source=web', content: 'Python asyncio cancellation\n\nExample content' },
    ]));
    const results = await search.searchWeb('Python asyncio cancellation', { limit: 1 });
    assert.equal(results.length, 1);
    assert.equal(results[0].rank, 8);
    assert.equal(results[0].url, 'https://docs.test/doc');
    assert.match(results[0].content, /Example content/u);
    assert.ok(results[0].relevanceScore > 0.7);
});

test('JSON and structured MCP results are supported', async t => {
    t.mock.method(axios, 'post', async (_, request) => reply(request.id, [good()], false));
    assert.equal((await search.searchWithEngine('Python asyncio cancellation', 'google'))[0].engine, 'exa');
    axios.post.mock.mockImplementation(async (_, request) => ({ data: {
        jsonrpc: '2.0', id: request.id,
        result: { structuredContent: { results: [{ ...good(), highlights: ['Python asyncio cancellation guide'] }] } },
    } }));
    assert.match((await search.searchWeb('Python asyncio cancellation'))[0].content, /guide/u);
});

test('across-source compatibility preserves provenance and deduplicates results', async t => {
    const mock = t.mock.method(axios, 'post', async (_, request) => reply(request.id, [good(), good()]));
    const results = await search.searchAcrossEngines('Python asyncio cancellation', {
        engines: ['searxng', 'duckduckgo'], limitPerEngine: 1,
    });
    assert.equal(mock.mock.callCount(), 1);
    assert.equal(results.length, 1);
    assert.equal(results[0].query, 'Python asyncio cancellation');
    assert.equal(results[0].engineCount, 1);
    assert.ok(results[0].rankings.every(item => item.engine === 'exa'));
    const { mergeRankedSearchResults } = require('../services/credibility');
    const merged = mergeRankedSearchResults(results, 'Python asyncio cancellation');
    assert.equal(merged[0].engineCount, 1);
    assert.equal(merged[0].rank, 1);
});

test('transport failures throw sanitized errors rather than empty search results', async t => {
    const failure = new Error('secret-key http://private:8080/?token=secret');
    t.mock.method(axios, 'post', async () => { throw failure; });
    await assert.rejects(search.searchWeb('Python'), { message: 'Web search failed: could not connect to the retrieval service.' });
    await assert.rejects(search.searchAcrossEngines('Python'), /Web search failed/u);
    failure.response = { status: 429 };
    await assert.rejects(search.searchWeb('Python'), /rate limited/u);
    failure.response = { status: 503 };
    await assert.rejects(search.searchWeb('Python'), /HTTP 503/u);
    delete failure.response;
    failure.code = 'ECONNABORTED';
    await assert.rejects(search.searchWeb('Python'), /timed out/u);
});

test('MCP errors, CAPTCHA HTML, malformed data and unmatched IDs are not no-results', async t => {
    const mock = t.mock.method(axios, 'post');
    for (const response of [
        () => '<html>captcha</html>',
        () => 'event: message\ndata: invalid\n\n',
        () => ({ jsonrpc: '2.0', id: 'other', result: { content: [] } }),
        id => ({ jsonrpc: '2.0', id, error: { message: 'secret' } }),
        id => ({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: 'secret' }] } }),
        id => ({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'Unknown format' }] } }),
    ]) {
        mock.mock.mockImplementation(async (_, request) => ({ data: response(request.id) }));
        await assert.rejects(search.searchWeb('Python'), error => /Web search failed/u.test(error.message) && !error.message.includes('secret'));
    }
});

test('provider rejections preserve sanitized diagnostics and stop follow-up queries', async t => {
    let calls = 0;
    t.mock.method(console, 'warn', () => {});
    t.mock.method(axios, 'post', async (_, request) => {
        calls++;
        return { data: {
            jsonrpc: '2.0', id: request.id,
            result: { isError: true, content: [{ type: 'text', text: 'Unsupported query https://private.example/path?token=secret Bearer abc123' }] },
        } };
    });
    const query = 'compare search providers';
    await assert.rejects(search.searchForAgent(query), error => {
        assert.match(error.message, /Unsupported query/u);
        assert.ok(!error.message.includes('private.example'));
        assert.ok(!error.message.includes('secret'));
        assert.ok(!error.message.includes('abc123'));
        return true;
    });
    assert.equal(calls, 1);
});

test('explicit empty results stay empty without fabricating evidence', async t => {
    t.mock.method(axios, 'post', async (_, request) => reply(request.id, []));
    assert.deepEqual(await search.searchWeb('Python'), []);
    assert.deepEqual(await search.searchComplexQuery('Python'), []);
});

test('zero budgets and empty queries never request retrieval', async t => {
    t.mock.method(axios, 'post', async () => assert.fail('unexpected fetch'));
    assert.deepEqual(await search.searchWeb(''), []);
    assert.deepEqual(await search.searchWeb('Python', { limit: 0 }), []);
    assert.deepEqual(await search.searchWithEngine('Python', 'google', {}, 0), []);
    for (const options of [{ maxEngines: 0 }, { limitPerEngine: 0 }, { limit: 0 }]) {
        assert.deepEqual(await search.searchAcrossEngines('Python', options), []);
        assert.deepEqual(await search.searchComplexQuery('Python', options), []);
    }
    assert.deepEqual(await search.searchComplexQuery('Python', { perQueryLimit: 0 }), []);
    assert.deepEqual(await search.searchComplexQuery('Python', { maxQueries: 0 }), []);
});

test('complex queries expand dimensions, retain successful evidence on partial failure and stop at budget', async t => {
    const calls = [];
    const warnings = t.mock.method(console, 'warn', () => {});
    t.mock.method(axios, 'post', async (_, request) => {
        const query = request.params.arguments.query;
        calls.push(query);
        if (calls.length === 2) throw new Error('private credentials');
        return reply(request.id, [good(`${calls.length}.test`, query)]);
    });
    const query = '比较固态电池与钠离子电池低温循环寿命，分析成本和风险';
    const results = await search.searchComplexQuery(query, { limit: 8 });
    assert.ok(calls.some(value => value.includes('风险 安全')));
    assert.ok(results.length > 1);
    assert.ok(results.every(result => result.query));
    assert.equal(warnings.mock.callCount(), 1);
    calls.length = 0;
    assert.equal((await search.searchComplexQuery(query, { limit: 1 })).length, 1);
    assert.equal(calls.length, 1);
});

test('complex queries propagate all failed retrievals', async t => {
    t.mock.method(console, 'warn', () => {});
    t.mock.method(axios, 'post', async () => { throw new Error('secret'); });
    await assert.rejects(search.searchComplexQuery('比较固态电池和钠离子电池风险'), /could not connect/u);
});

test('complex queries apply the requested relevance threshold at every stage', async t => {
    t.mock.method(axios, 'post', async (_, request) => reply(request.id, [good('docs.test', 'Python')], false));
    const results = await search.searchComplexQuery('Python asyncio cancellation', { minScore: 0.16 });
    assert.equal(results.length, 1);
    assert.ok(results[0].relevanceScore < 0.24);
});

test('SearxNG degraded primary with off-topic results recovers via /config healthy engines and relaxed queries', async t => {
    search.clearSearxngCatalogCache();
    const calls = [];
    t.mock.method(axios, 'get', async (url, options) => {
        if (url === 'http://searx-recover.test/config') {
            calls.push({ path: '/config', params: null });
            return {
                data: {
                    engines: [
                        { name: 'baidu', enabled: true, categories: ['general'] },
                        { name: 'google', enabled: true, categories: ['general'] },
                        { name: 'google news', enabled: true, categories: ['news'] },
                        { name: 'bing', enabled: true, categories: ['general'] },
                        { name: 'bing news', enabled: true, categories: ['news'] },
                        { name: '360search', enabled: false, categories: ['general'] },
                    ],
                },
            };
        }
        assert.equal(url, 'http://searx-recover.test/search');
        calls.push({ path: '/search', params: { ...options.params } });
        if (options.params.categories === 'general') {
            return {
                data: {
                    results: [
                        { title: 'F4U 海盗中队', url: 'https://offtopic.test/f4u', content: '战斗机历史条目' },
                        { title: '珠海', url: 'https://offtopic.test/zhuhai-intro', content: '城市百科介绍' },
                        { title: 'Instagram', url: 'https://offtopic.test/ig', content: 'Social platform' },
                    ],
                    unresponsive_engines: [['baidu', 'secret_upstream_error'], ['google', 'CAPTCHA']],
                },
            };
        }
        assert.equal(options.params.categories, undefined);
        assert.equal(options.params.engines, 'bing news');
        if (options.params.q === '珠海 天气预报 未来三天 气温 降雨') {
            return { data: { results: [], unresponsive_engines: [] } };
        }
        return {
            data: {
                results: [
                    {
                        title: '冷空气马上到货！珠海气温将降至“1”字头！',
                        url: 'https://news.weather.test/zhuhai-temp',
                        content: '预计未来3天珠海阴雨持续，市民需注意添衣防雨。',
                        engines: ['bing news'],
                    },
                ],
                unresponsive_engines: [],
            },
        };
    });

    const config = { searchEngine: 'searxng', searxngUrl: 'http://searx-recover.test' };
    const report = await search.searchForAgent('珠海 天气预报 未来三天 气温 降雨', { config, readPages: false });
    assert.ok(['matches_found', 'background_only'].includes(report.status));
    assert.ok(report.results.length >= 1);
    assert.notEqual(report.results[0].matchType, 'weak');
    assert.match(report.results[0].title, /冷空气马上到货/u);
    assert.ok(report.warnings.some(w => /retained available results/u.test(w)));
    assert.ok(report.warnings.every(w => !w.includes('secret_upstream_error')));
    assert.ok(calls.some(c => c.path === '/config'));
    assert.ok(calls.some(c => c.params?.engines === 'bing news' && !c.params.categories && c.params.q !== '珠海 天气预报 未来三天 气温 降雨'));

    search.clearSearxngCatalogCache();
    const webResults = await search.searchWeb('珠海 天气预报 未来三天 气温 降雨', { config });
    assert.ok(webResults.length >= 1);
    assert.match(webResults[0].title, /冷空气马上到货/u);
});

test('SearxNG falls back cleanly without /config and warns accurately when degraded search finds no matches', async t => {
    search.clearSearxngCatalogCache();
    t.mock.method(axios, 'get', async (url, options) => {
        if (url.endsWith('/config')) throw new Error('404 Not Found');
        if (options.params.categories === 'general') {
            return {
                data: {
                    results: [{ title: 'Unrelated Roblox Page', url: 'https://spam.test/roblox', content: 'Gaming' }],
                    unresponsive_engines: [['baidu', 'secret']],
                },
            };
        }
        assert.equal(options.params.engines, undefined);
        return { data: { results: [], unresponsive_engines: [] } };
    });

    const report = await search.searchForAgent('珠海 天气预报 未来三天 气温 降雨', {
        config: { searchEngine: 'searxng', searxngUrl: 'http://searx-noconfig.test' },
        readPages: false,
    });
    assert.equal(report.status, 'no_results');
    assert.equal(report.results.length, 0);
    assert.ok(report.warnings.some(w => /returned no matching results/u.test(w)));
    assert.ok(report.warnings.every(w => !/retained available results/u.test(w)));
    assert.ok(report.warnings.every(w => !/budget exhausted/u.test(w)));
    assert.ok(!report.guidance.includes('verifyClaim') && !report.guidance.includes('disprove'));
    assert.ok(report.warnings.every(w => !w.includes('secret')));
});

test('SearxNG soft fuzzy floor accepts genuine partial text matches while rejecting URL-only stuffing', async t => {
    search.clearSearxngCatalogCache();
    t.mock.method(axios, 'get', async () => ({
        data: {
            results: [
                {
                    title: 'Buy cheap shoes today',
                    url: 'https://spam.test/zhuhai/tianqi/jiangyu',
                    content: 'Discounts on sneakers and boots.',
                },
                {
                    title: '大雨到暴雨！珠海今晚开启“倒水”模式',
                    url: 'https://local.test/zhuhai-rain',
                    content: '今晚起珠海有明显降水并伴有降温。',
                },
            ],
            unresponsive_engines: [],
        },
    }));

    const results = await search.searchWeb('珠海 天气预报 未来三天 气温 降雨', {
        config: { searchEngine: 'searxng', searxngUrl: 'http://searx-fuzzy.test' },
        skipSearxngFallback: true,
    });
    assert.equal(results.length, 1);
    assert.match(results[0].title, /珠海/u);
    assert.ok(results.every(r => !r.url.includes('spam.test')));
});

test('SearxNG Chinese web queries fall back to sogou wechat and filter utility translators', async t => {
    search.clearSearxngCatalogCache();
    const calls = [];
    t.mock.method(axios, 'get', async (url, options) => {
        if (url === 'http://searx-wechat.test/config') {
            return {
                data: {
                    engines: [
                        { name: 'baidu', enabled: true, categories: ['general'] },
                        { name: 'bing', enabled: true, categories: ['general'] },
                        { name: 'lingva', enabled: true, categories: ['general', 'translate'] },
                        { name: 'currency', enabled: true, categories: ['general'] },
                        { name: 'bing news', enabled: true, categories: ['news'] },
                        { name: 'sogou wechat', enabled: false, categories: ['news'] },
                    ],
                },
            };
        }
        calls.push({ ...options.params });
        if (options.params.categories === 'general') {
            return {
                data: {
                    results: [{ title: 'Star Citizen', url: 'https://spam.test/sc', content: 'Game site' }],
                    unresponsive_engines: [['baidu', 'error']],
                },
            };
        }
        if (options.params.engines === 'sogou wechat') {
            return {
                data: {
                    results: [
                        {
                            title: '北京到上海高铁最新时刻表与车次查询指南',
                            url: 'https://mp.weixin.test/hsr',
                            content: '京沪高铁每日开行多趟复兴号列车，约4个半小时直达上海虹桥。',
                            engines: ['sogou wechat'],
                        },
                    ],
                    unresponsive_engines: [],
                },
            };
        }
        return { data: { results: [], unresponsive_engines: [] } };
    });

    const report = await search.searchForAgent('北京到上海高铁 时刻表 车次 查询', {
        config: { searchEngine: 'searxng', searxngUrl: 'http://searx-wechat.test' },
        readPages: false,
    });
    assert.equal(report.status, 'matches_found');
    assert.match(report.results[0].title, /北京到上海高铁/u);
    assert.ok(calls.some(p => p.engines === 'sogou wechat'));
    assert.ok(calls.every(p => !String(p.engines || '').includes('lingva') && !String(p.engines || '').includes('currency')));
});

test('searchForAgent expands multi-tag AI queries across all tag pairs within budget', async t => {
    const queriesSeen = [];
    const resultsByQuery = {
        '女生 核算表 海外 文档 帅哥': [
            { title: '海外团队协作与合规概览', url: 'https://a.example.com/overview', content: '海外企业文档规范', engine: 'duckduckgo web' },
        ],
        '女生 核算表': [
            { title: '女生日常支出核算表 Excel 模板', url: 'https://b.example.com/sheet', content: '适合女生的生活开支核算表模板', engine: 'sogou wechat' },
        ],
        '海外 文档': [
            { title: 'Google 文档：海外团队在线文档', url: 'https://c.example.com/docs', content: '支持跨国团队在线编辑文档', engine: 'yahoo' },
        ],
        '女生 帅哥': [
            { title: '女生与帅哥穿搭图鉴合集', url: 'https://d.example.com/lookbook', content: '女生审美与帅哥造型海外街拍', engine: 'privacywall' },
        ],
    };
    t.mock.method(axios, 'get', async (url, options) => {
        if (String(url).endsWith('/config')) {
            return {
                data: {
                    engines: [
                        { name: 'duckduckgo web', enabled: true, categories: ['general'] },
                        { name: 'sogou wechat', enabled: true, categories: ['general', 'news'] },
                        { name: 'yahoo', enabled: true, categories: ['general'] },
                        { name: 'privacywall', enabled: true, categories: ['general'] },
                    ],
                },
            };
        }
        const q = String(options?.params?.q || '');
        if (!queriesSeen.includes(q)) queriesSeen.push(q);
        return { data: { results: resultsByQuery[q] || [], unresponsive_engines: [] } };
    });

    search.clearSearxngCatalogCache();
    const report = await search.searchForAgent('女生 核算表 海外 文档 帅哥', {
        config: { searchEngine: 'searxng', searxngUrl: 'http://searx-multitag.test' },
        limit: 8,
        maxQueries: 4,
        readPages: false,
    });

    assert.deepEqual(queriesSeen, ['女生 核算表 海外 文档 帅哥', '女生 核算表', '海外 文档', '女生 帅哥']);
    assert.ok(report.results.some(item => item.url === 'https://d.example.com/lookbook'));
    assert.ok(report.results.some(item => item.url === 'https://b.example.com/sheet'));
    assert.ok(report.results.some(item => item.url === 'https://c.example.com/docs'));
    assert.equal(report.warnings.some(w => /request budget exhausted/u.test(w)), false);
});

test('dense multi-engine SearxNG stops at page 1, tolerates minor single-engine timeout, and routes empty general queries to it/web categories', async t => {
    search.clearSearxngCatalogCache();
    let pageCalls = 0;
    const denseResults = [
        {
            title: '珠海未来三天天气预报与气温降雨趋势',
            url: 'https://weather.example.com/zhuhai',
            content: '未来三天珠海气温20到26度，局部有阵雨或降雨。',
            engines: ['duckduckgo web', 'privacywall', 'sogou wechat'],
        },
        {
            title: '珠海天气预报7天及未来三天气温降雨预报',
            url: 'https://tianqi.example.com/zhuhai',
            content: '珠海未来三天天气预报：明日小雨降雨，气温19到24度。',
            engines: ['bing', 'yahoo', 'naver'],
        },
        ...Array.from({ length: 28 }, (_, idx) => ({
            title: `珠海天气综合资讯 ${idx}`,
            url: `https://news${idx}.example.com/item`,
            content: `珠海近期天气变化报道 ${idx}`,
            engines: ['yahoo', 'naver', 'baidu kaifa'],
        })),
    ];
    t.mock.method(axios, 'get', async (url, options) => {
        if (String(url).endsWith('/config')) {
            return {
                data: {
                    engines: [
                        { name: 'github', enabled: true, categories: ['it'] },
                        { name: 'stackoverflow', enabled: true, categories: ['it'] },
                        { name: 'baidu kaifa', enabled: true, categories: ['general', 'it'] },
                        { name: 'brave', enabled: true, categories: ['web'] },
                        { name: 'openlibrary', enabled: true, categories: ['general'] },
                    ],
                },
            };
        }
        pageCalls++;
        if (options.params.q.includes('珠海')) {
            return { data: { results: denseResults, unresponsive_engines: [['wikidata', 'timeout']] } };
        }
        if (options.params.categories === 'general') {
            return { data: { results: [{ title: 'Unrelated Blog', url: 'https://misc.test/1', content: 'Cooking recipe' }], unresponsive_engines: [] } };
        }
        assert.ok(String(options.params.engines || '').includes('github'));
        return {
            data: {
                results: [
                    { title: 'Tokio spawn_blocking in Rust docs', url: 'https://docs.rs/tokio', content: 'Rust tokio spawn_blocking guide', engines: ['github', 'stackoverflow'] },
                ],
                unresponsive_engines: [],
            },
        };
    });

    const weatherReport = await search.searchForAgent('珠海 天气预报 未来三天 气温 降雨', {
        config: { searchEngine: 'searxng', searxngUrl: 'http://searx-dense.test' },
        readPages: false,
    });
    assert.equal(pageCalls, 1);
    assert.equal(weatherReport.searches[0].requestCount, 1);
    assert.equal(weatherReport.warnings.length, 0);

    const rustResults = await search.searchWeb('rust tokio spawn_blocking', {
        config: { searchEngine: 'searxng', searxngUrl: 'http://searx-dense.test' },
    });
    assert.equal(rustResults.length, 1);
    assert.equal(rustResults[0].url, 'https://docs.rs/tokio');

    const probe = await search.probeSearxngInstance('http://searx-dense.test/');
    assert.equal(probe.ok, true);
    assert.equal(probe.enabledEnginesCount, 5);
    assert.equal(probe.categories.it, 3);
    assert.equal(probe.categories.web, 1);
});
