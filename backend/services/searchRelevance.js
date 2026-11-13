'use strict';

const STOP_WORDS = new Set(('a an the and or of to in on at for from by with is are was were be been being ' +
    'it its this that these those as how what when where why which who can could would should do does did ' +
    'i me my we our you your please find search about 的 了 和 与 或 在 是 有 如何 怎么 什么 请 帮我 搜索 查找').split(/\s+/u));
const TRACKING_PARAMS = /^(?:utm_.+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|yclid|_ga|_gl|igshid)$/i;
const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('zh', { granularity: 'word' }) : null;

function cleanText(text) {
    return String(text ?? '').normalize('NFKC').toLowerCase()
        .replace(/<[^>]*>/gu, ' ').replace(/&(?:nbsp|amp|quot|lt|gt);/gu, ' ');
}

/** Stable unique tokens; use Han bigrams when Intl segmentation is unavailable. */
function extractSearchTerms(text) {
    const normalized = cleanText(text);
    const words = segmenter
        ? Array.from(segmenter.segment(normalized), (part) => part.isWordLike ? part.segment : '')
        : (normalized.match(/[\p{L}\p{N}]+/gu) || []);
    const terms = [];
    for (const word of words) {
        if (!word || STOP_WORDS.has(word)) continue;
        if (!segmenter && /^\p{Script=Han}+$/u.test(word) && word.length > 1) {
            for (let index = 0; index < word.length - 1; index += 1) {
                const pair = word.slice(index, index + 2);
                if (!STOP_WORDS.has(pair)) terms.push(pair);
            }

        } else terms.push(word);
    }

    return [...new Set(terms)];
}

const QUERY_DIMENSIONS = [
    { pattern: /(?:比较|对比|compare|versus|\bvs\.?\b)/iu, label: '优缺点 性能 成本' },
    { pattern: /(?:原因|为什么|为何|cause|why|reason)/iu, label: '原因 机制' },
    { pattern: /(?:影响|后果|impact|effect|consequence)/iu, label: '影响 后果' },
    { pattern: /(?:风险|安全|隐患|risk|safety)/iu, label: '风险 安全' },
    { pattern: /(?:趋势|未来|预测|展望|trend|future|forecast)/iu, label: '趋势 最新进展' },
    { pattern: /(?:证据|研究|数据|研究结果|evidence|study|data)/iu, label: '研究 数据 证据' },
];

function expandSearchQueries(query, options = {}) {
    const original = String(query || '').replace(/\s+/gu, ' ').trim();
    if (!original) return [];
    const maxQueries = Math.min(8, Math.max(1, Math.floor(Number(options.maxQueries) || 4)));
    const phrases = original.split(/[?？;；。\n]+/u).map(part => part.trim()).filter(part => part.length >= 4);
    const queries = [original];
    for (const dimension of QUERY_DIMENSIONS) {
        if (queries.length >= maxQueries) break;
        if (dimension.pattern.test(original)) {
            const focused = `${original} ${dimension.label}`;
            if (!queries.includes(focused)) queries.push(focused);
        }
    }
    for (const phrase of phrases) {
        if (phrase !== original && queries.length < maxQueries) queries.push(phrase);
    }
    return [...new Set(queries)].slice(0, maxQueries);
}

/** Preserve semantic parameters and non-default ports; reject credentials/non-web URLs. */
function normalizeSearchUrl(value) {
    try {
        const url = new URL(String(value ?? '').trim());
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
        url.hash = '';
        for (const key of [...url.searchParams.keys()]) {
            if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
        }
        url.searchParams.sort();
        return url.href;
    } catch {
        return '';
    }
}

function matchesTerm(text, term) {
    if (/\p{Script=Han}/u.test(term)) return text.includes(term);
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'u').test(text);
}

/** 0..1: subject coverage dominates; explicit dates/quotes/rank are soft signals. */
function scoreSearchRelevance(result, query) {
    if (!result || typeof result !== 'object') return 0;
    const allTerms = extractSearchTerms(query);
    const subjectTerms = allTerms.filter((term) => !/^(?:19|20)\d{2}$/u.test(term));
    const terms = subjectTerms.length ? subjectTerms : allTerms;
    if (!terms.length) return 0;
    const title = cleanText(result.title || result.name);
    const content = cleanText(result.content || result.snippet || result.description);
    const url = cleanText(normalizeSearchUrl(result.url || result.link));
    let coverage = 0;
    let urlCoverage = 0;
    for (const term of terms) {
        coverage += matchesTerm(title, term) ? 1 : matchesTerm(content, term) ? 0.85 : 0;
        urlCoverage += matchesTerm(url, term) ? 1 : 0;
    }
    coverage /= terms.length;
    if (!coverage) return 0.08 * urlCoverage / terms.length;
    const text = `${title} ${content}`;
    const years = allTerms.filter((term) => /^(?:19|20)\d{2}$/u.test(term));
    const yearBonus = years.length && years.some((year) => matchesTerm(text, year)) ? 0.025 : 0;
    const quotes = [...cleanText(query).matchAll(/["“]([^"”]+)["”]/gu)].map((match) => match[1]);
    const quoteBonus = quotes.length && quotes.some((quote) => text.includes(quote)) ? 0.025 : 0;
    const rank = Number(result.rank);
    const rankBonus = Number.isFinite(rank) && rank >= 1 ? 0.025 / Math.sqrt(rank) : 0;
    return Math.min(1, 0.9 * coverage ** 1.35 + 0.025 * urlCoverage / terms.length + yearBonus + quoteBonus + rankBonus);
}

function boundedNumber(value, fallback, min, max) {
    return Number.isFinite(Number(value)) && value !== null
        ? Math.min(max, Math.max(min, Number(value))) : fallback;
}

/** Inputs and original one-based engine ranks are never mutated. */
function rankSearchResults(results, query, options = {}) {
    const limit = Math.floor(boundedNumber(options.limit, 5, 0, 100));
    const maxPerDomain = Math.floor(boundedNumber(options.maxPerDomain, 2, 1, 100));
    const minScore = boundedNumber(options.minScore, 0.24, 0, 1);
    const candidates = (Array.isArray(results) ? results : []).flatMap((result, index) => {
        if (!result || typeof result !== 'object') return [];
        const url = normalizeSearchUrl(result.url || result.link);
        if (!url) return [];
        const relevanceScore = scoreSearchRelevance(result, query);
        return relevanceScore > 0 && relevanceScore >= minScore
            ? [{ result: { ...result, url, relevanceScore }, index }] : [];
    });
    candidates.sort((left, right) => right.result.relevanceScore - left.result.relevanceScore || left.index - right.index);
    // Merge provenance before applying output/domain budgets. Never invent ranks
    // from the position in a globally ranked list.
    const merged = new Map();
    for (const { result } of candidates) {
        if (!merged.has(result.url)) merged.set(result.url, { ...result, rankings: [] });
    }
    for (const result of (Array.isArray(results) ? results : [])) {
        if (!result || typeof result !== 'object') continue;
        const existing = merged.get(normalizeSearchUrl(result.url || result.link));
        if (!existing) continue;
        const observations = Array.isArray(result.rankings) ? result.rankings : [{
            engine: result.engine || '', query: result.query || '',
            rank: result.rank, score: result.score ?? null, relevanceScore: scoreSearchRelevance(result, query),
        }];
        existing.rankings.push(...observations.map(item => ({ ...item })));
    }
    const domains = new Map();
    const ranked = [];
    for (const result of merged.values()) {
        if (ranked.length >= limit) break;
        const domain = new URL(result.url).hostname.replace(/^www\./u, '');
        if ((domains.get(domain) || 0) >= maxPerDomain) continue;
        result.engines = [...new Set(result.rankings.map(item => item.engine).filter(Boolean))];
        result.engineCount = result.engines.length;
        domains.set(domain, (domains.get(domain) || 0) + 1);
        ranked.push(result);
    }
    return ranked;
}

module.exports = { rankSearchResults, scoreSearchRelevance, normalizeSearchUrl, extractSearchTerms, expandSearchQueries };