'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const relevance = require('../services/searchRelevance');
const { extractSearchTerms, normalizeSearchUrl, scoreSearchRelevance, rankSearchResults } = relevance;
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