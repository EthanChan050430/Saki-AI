'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const relevance = require('../services/searchRelevance');
const { extractSearchTerms, normalizeSearchUrl, scoreSearchRelevance, rankSearchResults, expandSearchQueries,
    parseSearchQuery, matchesSearchConstraints, assessSearchMatch, buildSearchFollowups, buildRelaxedSearchQueries } = relevance;
const result = (title, url = 'https://example.org/doc', extra = {}) => ({ title, url, ...extra });

test('stable exports are available from both modules', () => {
    const search = require('../services/search');
    for (const name of Object.keys(relevance)) assert.equal(search[name], relevance[name]);
});

test('English stopwords, word boundaries and Chinese unspaced segmentation', () => {
    assert.deepEqual(extractSearchTerms('Please find the API and API for Python'), ['api', 'python']);
    assert.ok(extractSearchTerms('量子计算纠错技术').length >= 2);
    assert.ok(scoreSearchRelevance(result('量子计算的纠错技术详解'), '量子计算纠错技术') > 0.5);
    assert.equal(scoreSearchRelevance(result('carpet concatenate'), 'cat'), 0);
    assert.equal(scoreSearchRelevance(result('Paris weather'), 'the and of'), 0);
});

test('complex questions expand into bounded focused query variants', () => {
    const queries = expandSearchQueries('比较固态电池与钠离子电池的低温循环寿命？分析成本和风险');
    assert.equal(queries[0], '比较固态电池与钠离子电池的低温循环寿命？分析成本和风险');
    assert.ok(queries.some(query => query.includes('优缺点 性能 成本')));
    assert.ok(queries.some(query => query.includes('风险 安全')));
    assert.ok(queries.length <= 4);
    assert.deepEqual(expandSearchQueries('单一术语'), ['单一术语']);
});

test('Han bigram fallback works without Intl.Segmenter', () => {
    const context = { module: { exports: {} }, Intl: {}, URL };
    vm.runInNewContext(fs.readFileSync(require.resolve('../services/searchRelevance'), 'utf8'), context);
    const api = context.module.exports;
    assert.ok(api.extractSearchTerms('量子计算').includes('量子'));
    assert.ok(api.scoreSearchRelevance(result('量子计算纠错'), '量子计算') > 0.5);
});

test('URL normalization preserves ports/semantic parameters, removes tracking/hash and rejects unsafe URLs', () => {
    assert.equal(normalizeSearchUrl('HTTPS://EXAMPLE.COM:8443/doc?z=2&utm_source=x&a=1&fbclid=x#anchor'),
        'https://example.com:8443/doc?a=1&z=2');
    assert.equal(normalizeSearchUrl('https://example.com/?version=3&q=cat&ref=manual'),
        'https://example.com/?q=cat&ref=manual&version=3');
    for (const value of ['javascript:alert(1)', 'file:///tmp/a', '/relative', 'not a url', 'https://user:secret@example.com']) {
        assert.equal(normalizeSearchUrl(value), '');
    }
});

test('subject coverage and page text outweigh URL stuffing, rank, engine count and authority', () => {
    const query = 'python asyncio cancellation';
    const strong = result('Python asyncio cancellation guide', 'https://small.example/doc', { rank: 20 });
    const weak = result('Python recipes', 'https://official.gov/doc', { rank: 1, engines: ['a', 'b', 'c'] });
    const spam = result('Buy shoes', 'https://python.example/asyncio/cancellation', { rank: 1 });
    const ranked = rankSearchResults([spam, weak, strong], query);
    assert.equal(ranked[0].title, strong.title);
    assert.ok(!ranked.some((item) => item.title === spam.title));
    assert.ok(scoreSearchRelevance(strong, query) > scoreSearchRelevance(weak, query));
    const snippet = result('Reference', 'https://reference.test/', { content: query });
    assert.ok(scoreSearchRelevance(snippet, query) > 0.7);
});

test('dates, quoted phrases and versions are soft; mixed language sources survive', () => {
    const ranked = rankSearchResults([
        result('Python asyncio cancellation reference 2023', 'https://docs.test/old'),
        result('Python asyncio 取消任务指南', 'https://zh.test/doc'),
        result('2026 sports results', 'https://sports.test/'),
    ], 'Python "asyncio cancellation" 2026');
    assert.equal(ranked.length, 2);
    assert.ok(rankSearchResults([result('React 18 hydration documentation')], 'React 19 hydration').length);
    assert.equal(scoreSearchRelevance(result('Python manual 2018'), 'Python'), scoreSearchRelevance(result('Python manual 2030'), 'Python'));
});

test('dedup, domain quota, thresholds, stable ordering and immutability', () => {
    const input = [
        result('Python guide', 'https://example.org/a?utm_medium=ad#x', { rank: 4 }),
        result('Python guide', 'https://example.org/a', { rank: 2 }),
        result('Python guide', 'https://www.example.org/b', { rank: 3 }),
        result('Python guide', 'https://example.org/c', { rank: 5 }),
        result('Python guide', 'https://other.test/doc', { rank: 6 }),
        result('Football', 'https://sports.test/'),
        null,
    ];
    const copy = structuredClone(input);
    const ranked = rankSearchResults(input, 'Python', { limit: 10 });
    assert.equal(ranked.length, 3);
    assert.equal(ranked[0].rank, 2);
    assert.ok(ranked.every((item) => item.relevanceScore >= 0.24 && item.relevanceScore <= 1));
    assert.deepEqual(input, copy);
    assert.equal(rankSearchResults(input, 'Python', { maxPerDomain: 1, limit: 10 }).length, 2);
    assert.deepEqual(rankSearchResults(input, 'Python', { limit: 0 }), []);
    assert.deepEqual(rankSearchResults(input, 'Python', { minScore: 1 }), []);
    assert.deepEqual(rankSearchResults([], 'Python'), []);
});

test('search operators constrain hostnames safely and are excluded from lexical scoring', () => {
    const intent = parseSearchQuery('site:onlyfans.com CEO Jensen Huang announcement -rumor');
    assert.deepEqual(intent.sites, ['onlyfans.com']);
    assert.ok(intent.terms.includes('ceo'));
    assert.ok(!intent.terms.includes('onlyfans.com'));
    assert.ok(matchesSearchConstraints(result('Jensen Huang announcement', 'https://blog.onlyfans.com/post'), intent));
    assert.ok(!matchesSearchConstraints(result('Jensen Huang announcement', 'https://evilonlyfans.com/post'), intent));
    assert.ok(!matchesSearchConstraints(result('Jensen Huang rumor announcement', 'https://onlyfans.com/post'), intent));
    assert.throws(() => parseSearchQuery('site:bad host'), /Invalid site/u);
});

test('screenshots classify unrelated year review and announcement archive as background or weak, never direct', () => {
    const query = 'site:onlyfans.com CEO Jensen Huang OnlyFans announcement';
    const results = rankSearchResults([
        result('OnlyFans 2025 Year in Review | Creator Milestones', 'https://blog.onlyfans.com/onlyfans-2025/',
            { content: 'CEO Keily Blair and annual review of OnlyFans.' }),
        result('Announcement Archives - Page 2 of 5', 'https://blog.onlyfans.com/category/announcements/page/2/',
            { content: 'CEO Keily Blair. January 1 2026.' }),
        result('Jensen Huang named CEO of OnlyFans', 'https://blog.onlyfans.com/announcement',
            { content: 'Jensen Huang named CEO of OnlyFans.' }),
    ], query, { minScore: 0.05, limit: 10 });
    assert.ok(results.some(item => item.matchType === 'direct' && /Jensen Huang/u.test(item.content)));
    assert.ok(results.filter(item => !/Jensen Huang/u.test(item.content)).every(item => item.matchType !== 'direct'));
    assert.ok(assessSearchMatch(result('Announcement Archives - Page 2 of 5', 'https://blog.onlyfans.com/category/announcements/page/2/',
        { content: 'CEO Keily Blair. January 1 2026.' }), query).isIndex);
});

test('English expansions remain English and preserve explicit site constraints', () => {
    const queries = expandSearchQueries('Compare Python asyncio cancellation risks site:docs.python.org');
    assert.ok(queries.some(value => /comparison/u.test(value)));
    assert.ok(queries.every(value => value.includes('site:docs.python.org')));
    const followups = buildSearchFollowups('site:example.com "Ada Lovelace" appointment announcement');
    assert.ok(followups.length > 0);
    assert.ok(followups.every(value => value.includes('site:example.com')));
});

test('CJK-ASCII word boundary matching and strict exclusion constraints', () => {
    assert.ok(scoreSearchRelevance(result('使用Python异步编程指南'), 'python') > 0.8);
    assert.ok(scoreSearchRelevance(result('使用Python异步编程指南', 'https://py.test', { content: 'asyncio实战' }), 'Python asyncio') > 0.7);
    assert.equal(scoreSearchRelevance(result('carpet concatenate'), 'cat'), 0);
    const excludeIntent = parseSearchQuery('announcement -cat');
    assert.ok(matchesSearchConstraints(result('Official category announcement'), excludeIntent));
    assert.ok(!matchesSearchConstraints(result('Official cat announcement'), excludeIntent));
});

test('fuzzy matching supports Chinese numerals, sub-tokens, English stems/typos and separators', () => {
    const weatherQuery = '珠海 天气预报 未来三天 气温 降雨';
    const rainDoc = result('大雨到暴雨！珠海今晚开启强降雨模式', 'https://news.test/1', { content: '珠海市气象台发布未来3天预报' });
    const forecastDoc = result('珠海天气网：今日天气与未来三天预报', 'https://news.test/2', { content: '珠海未来3天温度22至29℃' });
    const offTopicDoc = result('F4U (VF-17“海盗”中队)', 'https://wiki.test/f4u', { content: '沃特F4U海盗式战斗机' });
    assert.ok(scoreSearchRelevance(rainDoc, weatherQuery) >= 0.45);
    assert.ok(scoreSearchRelevance(forecastDoc, weatherQuery) >= 0.45);
    assert.equal(scoreSearchRelevance(offTopicDoc, weatherQuery), 0);
    assert.notEqual(assessSearchMatch(rainDoc, weatherQuery).matchType, 'weak');

    assert.ok(scoreSearchRelevance(result('Async task was cancelled cleanly'), 'cancellation') >= 0.55);
    assert.ok(scoreSearchRelevance(result('How to configure SearXNG instance'), 'searchxng') >= 0.45);
    assert.ok(scoreSearchRelevance(result('Building HTTP APIs with nodejs'), 'node.js') > 0.7);
    assert.ok(scoreSearchRelevance(result('Vue 3 reactivity internals'), 'vue3') > 0.7);
    assert.equal(scoreSearchRelevance(result('Cat and carpet care'), 'catastrophe'), 0);
});

test('single-char Han down-weighting and strong anchor gate reject year-only hits', () => {
    const baike = result('2026年_百度百科', 'https://baike.test/2026', { content: '2026年是公历平年' });
    const nobel = result('2026年诺贝尔物理学奖揭晓', 'https://news.test/nobel', { content: '2026年诺贝尔奖颁奖典礼将于12月举行' });
    assert.equal(scoreSearchRelevance(baike, '2026年诺贝尔奖'), 0);
    assert.ok(scoreSearchRelevance(nobel, '2026年诺贝尔奖') > 0.75);
});

test('buildRelaxedSearchQueries extracts core queries while keeping constraints and years', () => {
    assert.deepEqual(buildRelaxedSearchQueries('Python asyncio cancellation'), []);
    const weatherRelaxed = buildRelaxedSearchQueries('site:weather.com.cn 珠海 天气预报 未来三天 气温 降雨');
    assert.ok(weatherRelaxed.length >= 1);
    assert.ok(weatherRelaxed.every(q => q.includes('site:weather.com.cn') && q.includes('珠海')));
    const nobelRelaxed = buildRelaxedSearchQueries('2026年诺贝尔物理学奖揭晓时间及预测');
    assert.ok(nobelRelaxed.some(q => q.includes('2026') && q.includes('诺贝尔')));
    const followups = buildSearchFollowups('珠海 天气预报 未来三天 气温 降雨');
    assert.ok(followups.length >= 1);
});

test('multi-tag AI search preserves 2-3 char Han tags and covers all tags across sub-queries', () => {
    const query = '女生 核算表 海外 文档 帅哥';
    assert.deepEqual(extractSearchTerms(query), ['女生', '核算表', '海外', '文档', '帅哥']);
    assert.deepEqual(extractSearchTerms('文档，海外、核算表'), ['文档', '海外', '核算表']);

    const falseMatch = assessSearchMatch(
        { title: '会计招聘', url: 'https://example.com/job', content: '海外工程财务核算岗位报名表及文件档案说明' },
        query,
    );
    assert.notEqual(falseMatch.matchType, 'direct');
    assert.deepEqual(falseMatch.matchedTerms, ['海外']);

    const shardsOnly = assessSearchMatch(
        { title: '会计招聘', url: 'https://example.com/job2', content: '海外工程财务岗位报名表' },
        query,
    );
    assert.equal(shardsOnly.matchType, 'weak');

    const ranked = rankSearchResults([
        { title: '女生帅哥话题1', url: 'https://a1.test/1', content: '女生喜欢帅哥 海外分享' },
        { title: '女生帅哥话题2', url: 'https://a2.test/2', content: '女生与帅哥日常' },
        { title: '女生帅哥话题3', url: 'https://a3.test/3', content: '女生看帅哥合集' },
        { title: '女生日常核算表模板', url: 'https://b1.test/4', content: '适合女生的生活核算表模板' },
        { title: '海外在线文档指南', url: 'https://c1.test/5', content: '海外团队共享文档教程' },
    ], query, { limit: 4, minScore: 0.16 });
    assert.ok(ranked.some((item) => item.url === 'https://b1.test/4'));
    assert.ok(ranked.some((item) => item.url === 'https://c1.test/5'));

    const expanded = expandSearchQueries(query, { maxQueries: 4 });
    assert.deepEqual(expanded, ['女生 核算表 海外 文档 帅哥', '女生 核算表', '海外 文档', '女生 帅哥']);
    assert.deepEqual(expandSearchQueries('how to install python on windows 11', { maxQueries: 4 }), [
        'how to install python on windows 11',
    ]);
});