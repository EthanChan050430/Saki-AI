const test = require('node:test');
const assert = require('node:assert/strict');

const {
    analyzeEmotionalSignals,
    computeCredibilitySignals,
    getVerdictLabel,
    mergeRankedSearchResults,
    pickExcerpt,
    scoreSourceAuthority,
} = require('../services/credibility');

test('authority scoring prefers official domains over social platforms', () => {
    assert.ok(scoreSourceAuthority('https://www.whitehouse.gov/briefing-room/') > 90);
    assert.ok(scoreSourceAuthority('https://x.com/some-post') < 35);
});

test('emotional analysis catches sensational phrasing', () => {
    const result = analyzeEmotionalSignals('震惊！惊爆黑幕！！这绝对是真的，速看！');
    assert.ok(result.emotionality >= 60);
    assert.equal(result.label, 'medium' === result.label ? 'medium' : 'high');
    assert.ok(result.emotionHits.length >= 2);
});

test('search result merge keeps unique urls and aggregates engines', () => {
    const merged = mergeRankedSearchResults([
        { title: 'A', url: 'https://example.com/story', content: 'foo', engine: 'bing', query: 'claim' },
        { title: 'B', url: 'https://example.com/story#section', content: 'foo bar baz', engine: 'duckduckgo', query: 'claim fact check' },
        { title: 'C', url: 'https://second.example.org/post', content: 'bar', engine: 'bing', query: 'claim' },
    ]);

    assert.equal(merged.length, 2);
    assert.deepEqual(merged[0].engines.sort(), ['bing', 'duckduckgo']);
    assert.equal(merged[0].content, 'foo bar baz');
});

test('excerpt picker centers around keywords when possible', () => {
    const excerpt = pickExcerpt(
        'This long article explains how the event happened before detailing the AI poisoning mechanism in search results and its impact.',
        ['poisoning']
    );

    assert.match(excerpt.toLowerCase(), /poisoning/);
});

test('credibility scoring falls when contradictory evidence dominates', () => {
    const result = computeCredibilitySignals({
        weightedSupport: 0.6,
        weightedContradict: 2.8,
        weightedMixed: 0.4,
        sourceCount: 4,
        uniqueDomains: 4,
        uniqueEngines: 3,
        averageAuthority: 76,
        emotionality: 70,
        multiEngineHits: 2,
        authoritativeSourceCount: 2,
    });

    assert.ok(result.score < 45);
    assert.ok(['lean_false', 'likely_false'].includes(result.verdict));
    assert.equal(getVerdictLabel(result.verdict, 'zh').length > 0, true);
});
