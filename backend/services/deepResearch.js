'use strict';
const { extractSearchTerms, scoreSearchRelevance } = require('./searchRelevance');
const { pickExcerpt } = require('./credibility');

function mergeSearchConfig(persisted = {}, current = {}) {
    return { ...persisted, ...Object.fromEntries(Object.entries(current || {}).filter(([, value]) => value !== undefined)) };
}

function compactSearchTopic(goal = '') {
    const text = String(goal || '').replace(/\s+/g, ' ').trim();
    if (text.length <= 180) return text;
    const quoted = [...text.matchAll(/[“"《]([^”"》]{2,100})[”"》]/gu)].map(match => match[1]);
    const cleaned = text.replace(/(?:请|please)[^。.!！?？]*(?:输出|格式|字数|markdown|报告)[^。.!！?？]*/giu, ' ')
        .replace(/(?:研究概述|深度解析|research overview|请帮我|请分析|请研究|输出格式|任务要求)/giu, ' ');
    const terms = extractSearchTerms(cleaned).filter(term => !/^(?:please|write|report|分析|研究|报告|输出|要求|格式)$/iu.test(term));
    // Sample the whole task, not just its prefix: the subject may be at the end.
    const selected = terms.length <= 24 ? terms : Array.from({ length: 24 }, (_, i) => terms[Math.round(i * (terms.length - 1) / 23)]);
    return [...new Set([...quoted, ...selected])].join(' ').slice(0, 220).trim();
}

async function mapLimit(items, concurrency, asyncFn) {
    const results = [];
    let idx = 0;
    async function worker() {
        while (idx < items.length) {
            const i = idx++;
            results[i] = await asyncFn(items[i], i);
        }
    }
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
    await Promise.all(workers);
    return results;
}

// Shared semaphore: limits concurrent async work across independent callers.
function createLimiter(concurrency) {
    let active = 0;
    const queue = [];
    const next = () => {
        if (active >= concurrency || !queue.length) return;
        active++;
        const { fn, resolve, reject } = queue.shift();
        Promise.resolve().then(fn).then(resolve, reject).finally(() => { active--; next(); });
    };
    return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
}

function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
        promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
    });
}

function buildQueries(stepTitle, overallGoal, proposedQueries = []) {
    const topic = compactSearchTopic(overallGoal || stepTitle);
    const clean = value => String(value || '').replace(/research overview|深度解析|研究概述/giu, '').trim();
    const candidates = [...(Array.isArray(proposedQueries) ? proposedQueries : []), stepTitle].map(clean).filter(Boolean);
    const queries = candidates.map(value => {
        const query = compactSearchTopic(value);
        return !topic || query.toLowerCase().includes(topic.toLowerCase()) ? query : `${topic} ${query}`;
    });
    return [...new Set([topic, ...queries].filter(Boolean))].slice(0, 5);
}

const CRAWL_ERROR_PREFIXES = [
    'Invalid or missing URL',
    'The requested URL is not allowed',
    'Could not extract meaningful text',
    'Unsupported URL protocol',
    'Private or local network',
];

function isCrawlError(text) {
    if (typeof text !== 'string') return true;
    const t = text.trim();
    return !t || CRAWL_ERROR_PREFIXES.some(p => t.startsWith(p))
        || /^(?:Error:|HTTP\s+[45]\d\d\b|Access denied\b|Forbidden\b|404\b|502\b|503\b|Service unavailable\b|Page not found\b|Internal server error\b)/iu.test(t)
        || /^(?:login|sign in|log in|登录|登入)\s*(?:$|[\n:：])/iu.test(t)
        || /(?:verify (?:that )?you are human|checking your browser|enable javascript and cookies|sign in to continue|log in to continue|captcha|验证您是人类|安全验证|请输入验证码|登录后继续|访问被拒绝)/iu.test(t.slice(0, 1600));
}

/** Crawl output is untrusted data; length alone never qualifies it as evidence. */
function selectEvidenceText(source = {}, crawledText = '', query = '', maxLength = 3000) {
    const keywords = extractSearchTerms(query);
    const snippet = String(source.content || source.snippet || source.description || '').trim();
    const excerpt = isCrawlError(crawledText) ? '' : pickExcerpt(crawledText, keywords, Math.max(1, maxLength - 6));
    const relevance = text => scoreSearchRelevance({ content: text }, query);
    const fallback = isCrawlError(snippet) ? '' : pickExcerpt(snippet, keywords, Math.max(1, maxLength - 6));
    if (excerpt && (!keywords.length || (relevance(excerpt) >= 0.24 && relevance(excerpt) >= relevance(fallback)))) return excerpt;
    return fallback && (!keywords.length || relevance(fallback) >= 0.24) ? fallback : '';
}

function buildStepContext(sources, maxChars = 12000) {
    let out = '';
    for (const s of sources) {
        const header = `[${s.index}] ${JSON.stringify(s.title || s.url)}\n`;
        const body = JSON.stringify((s.text || s.content || s.snippet || '').slice(0, 3000));
        const block = header + body + '\n\n';
        if (out.length + block.length > maxChars) break;
        out += block;
    }
    return out.trim();
}

function prepareStepEvidence(evidence, registry, maxChars = 12000) {
    const sources = [];
    for (const source of evidence) {
        if (!source.text) continue;
        const index = registry.get(source.url)?.index || registry.size() + 1;
        const candidate = { ...source, index };
        const block = buildStepContext([candidate], Infinity);
        const used = buildStepContext(sources, Infinity).length;
        if (used + (used ? 2 : 0) + block.length > maxChars) continue;
        registry.register(source.url, source.title, source.text);
        sources.push(candidate);
    }
    return { sources, context: buildStepContext(sources, maxChars) };
}

class GlobalSourceRegistry {
    constructor() {
        this._map = new Map(); // url → entry
        this._counter = 0;
    }

    register(url, title, text) {
        if (!url || this._map.has(url)) return this._map.get(url) || null;
        const entry = { index: ++this._counter, url, title: title || url, text: text || '' };
        this._map.set(url, entry);
        return entry;
    }

    get(url) {
        return this._map.get(url) || null;
    }

    getList() {
        return [...this._map.values()];
    }

    size() {
        return this._counter;
    }
}

module.exports = { mapLimit, createLimiter, withTimeout, buildQueries, isCrawlError, buildStepContext, GlobalSourceRegistry,
    compactSearchTopic, mergeSearchConfig, selectEvidenceText, prepareStepEvidence };
