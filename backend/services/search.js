const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { rankSearchResults, scoreSearchRelevance, normalizeSearchUrl, extractSearchTerms, expandSearchQueries } = require('./searchRelevance');

const SEARCH_TIMEOUT_MS = 8000;
const SUPPORTED_ENGINES = new Set(['searxng', 'google', 'bing', 'duckduckgo']);
const engineName = (value) => String(value || '').trim().toLowerCase();
const isOff = (config) => engineName(config.searchEngine) === 'off';
const resultLimit = (value, fallback = 5) => Number.isFinite(Number(value)) && value != null
    ? Math.min(100, Math.max(0, Math.floor(Number(value)))) : fallback;
const configPath = path.join(require('./runtime').runtime.dataDir, 'global_config.json');

async function getConfig() {
    try {
        if (await fs.pathExists(configPath)) {
            return await fs.readJson(configPath);
        }
    } catch {
        console.error('Search configuration could not be read.');
    }
    return {};
}

function uniqueEngines(items = []) {
    return Array.from(new Set(
        (Array.isArray(items) ? items : [])
            .map((item) => String(item || '').trim().toLowerCase())
            .filter(Boolean)
    ));
}

function mapSearchResult(result = {}, engine = '', rank = 1) {
    return {
        title: result.title || result.name || '',
        content: result.content || result.snippet || result.description || '',
        url: result.url || result.link || result.firstUrl || '',
        engine,
        rank,
    };
}

function getAvailableSearchEngines(config = {}) {
    if (isOff(config)) return [];
    const engines = [engineName(config.searchEngine) || 'searxng'];
    if (config.searxngUrl) engines.push('searxng');

    if (config.googleApiKey && config.googleCxId) {
        engines.push('google');
    }

    if (config.bingApiKey) {
        engines.push('bing');
    }

    // Instant answers are opt-in, never an automatic substitute for full web search.
    return uniqueEngines(engines).filter((engine) => canUseEngine(engine, config));
}

function canUseEngine(engine, config) {
    if (isOff(config) || !SUPPORTED_ENGINES.has(engine)) return false;
    if (engine === 'google') return Boolean(config.googleApiKey && config.googleCxId);
    if (engine === 'bing') return Boolean(config.bingApiKey);
    return true;
}

async function fetchSearchCandidates(query, engine, config = {}, limit = 5) {
    const normalizedQuery = String(query || '').trim();
    const normalizedEngine = String(engine || '').trim().toLowerCase();

    if (!normalizedQuery || !limit || !canUseEngine(normalizedEngine, config)) {
        return [];
    }
    const candidateLimit = Math.min(50, Math.max(15, limit * 3));

    try {
        if (normalizedEngine === 'searxng') {
            const baseUrl = String(config.searxngUrl || 'http://127.0.0.1:8080').replace(/\/+$/u, '');
            const url = `${baseUrl}/search?q=${encodeURIComponent(normalizedQuery)}&format=json`;
            const response = await axios.get(url, { timeout: SEARCH_TIMEOUT_MS });
            return (response.data.results || [])
                .slice(0, candidateLimit)
                .map((result, index) => mapSearchResult({
                    title: result.title,
                    content: result.content || result.snippet,
                    url: result.url,
                }, normalizedEngine, index + 1));
        } else if (normalizedEngine === 'google') {
            if (config.googleApiKey && config.googleCxId) {
                const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(config.googleApiKey)}&cx=${encodeURIComponent(config.googleCxId)}&q=${encodeURIComponent(normalizedQuery)}&num=${Math.min(10, candidateLimit)}`;
                const response = await axios.get(url, { timeout: SEARCH_TIMEOUT_MS });
                return (response.data.items || [])
                    .slice(0, candidateLimit)
                    .map((result, index) => mapSearchResult({
                        title: result.title,
                        content: result.snippet,
                        url: result.link,
                    }, normalizedEngine, index + 1));
            }
        } else if (normalizedEngine === 'bing') {
            if (config.bingApiKey) {
                const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(normalizedQuery)}&count=${candidateLimit}`;
                const response = await axios.get(url, {
                    headers: { 'Ocp-Apim-Subscription-Key': config.bingApiKey },
                    timeout: SEARCH_TIMEOUT_MS,
                });
                return (response.data.webPages?.value || [])
                    .slice(0, candidateLimit)
                    .map((result, index) => mapSearchResult({
                        title: result.name,
                        content: result.snippet,
                        url: result.url,
                    }, normalizedEngine, index + 1));
            }
        } else if (normalizedEngine === 'duckduckgo') {
            // Only the real abstract is usable; RelatedTopics are not search results.
            const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(normalizedQuery)}&format=json&no_html=1&skip_disambig=1`;
            const response = await axios.get(url, { timeout: SEARCH_TIMEOUT_MS });
            const heading = String(response.data.AbstractHeading || response.data.Heading || '').trim();
            if (heading && response.data.AbstractText && normalizeSearchUrl(response.data.AbstractURL)) {
                return [{ ...mapSearchResult({
                    title: heading,
                    content: response.data.AbstractText,
                    url: response.data.AbstractURL,
                }, normalizedEngine), type: 'instant_answer' }];
            }
            return [];
        }
    } catch {
        // Axios errors can contain API keys, headers and private endpoint URLs.
        console.error(`${normalizedEngine} search failed.`);
    }

    return [];
}

async function searchWithEngine(query, engine, config = {}, limit = 5) {
    const count = resultLimit(limit);
    const candidates = await fetchSearchCandidates(query, engine, config, count);
    return rankSearchResults(candidates, query, { limit: count });
}

async function searchAcrossEngines(query, options = {}) {
    const config = options.config || await getConfig();
    if (isOff(config) || !String(query || '').trim()) return [];
    const requestedEngines = Array.isArray(options.engines) && options.engines.length > 0
        ? options.engines
        : getAvailableSearchEngines(config);
    const engines = uniqueEngines(requestedEngines).filter((engine) => canUseEngine(engine, config));
    const maxEngines = resultLimit(options.maxEngines, engines.length);
    const selectedEngines = engines.slice(0, maxEngines);
    const limitPerEngine = resultLimit(options.limitPerEngine, 3);
    const limit = resultLimit(options.limit, limitPerEngine * selectedEngines.length);
    if (!limit || !limitPerEngine || !selectedEngines.length) return [];

    const settled = await Promise.allSettled(
        selectedEngines.map((engine) => fetchSearchCandidates(query, engine, config, limitPerEngine))
    );

    const candidates = selectedEngines.flatMap((engine, index) => {
        const result = settled[index];
        if (result.status !== 'fulfilled') return [];
        return result.value.map((item) => ({
            ...item,
            engine,
            query,
        }));
    });
    return rankSearchResults(candidates, query, {
        ...options, limit,
    });
}

async function searchComplexQuery(query, options = {}) {
    const config = options.config || await getConfig();
    if (isOff(config) || !String(query || '').trim()) return [];
    const queries = expandSearchQueries(query, { maxQueries: options.maxQueries || 4 });
    const limitPerEngine = resultLimit(options.limitPerEngine, 3);
    const perQueryLimit = resultLimit(options.perQueryLimit, 4);
    if (!queries.length || !limitPerEngine || !perQueryLimit) return [];
    const batches = await Promise.all(queries.map(async (searchQuery) => {
        const results = await searchAcrossEngines(searchQuery, {
            ...options,
            config,
            limitPerEngine,
            limit: perQueryLimit,
        });
        return results.map(result => ({ ...result, query: searchQuery }));
    }));
    return rankSearchResults(batches.flat(), query, {
        ...options,
        limit: resultLimit(options.limit, 10),
        minScore: options.minScore ?? 0.16,
    });
}

async function searchWeb(query, options = {}) {
    const config = options.config || await getConfig();
    const engine = String(options.engine || config.searchEngine || 'searxng').trim().toLowerCase();

    const limit = resultLimit(options.limit);
    if (isOff(config) || engine === 'off' || !String(query || '').trim() || !limit) {
        return [];
    }

    const candidates = await fetchSearchCandidates(query, engine, config, limit);
    let ranked = rankSearchResults(candidates, query, { ...options, limit });
    // At most two configured full-web fallbacks. Do not pad with instant answers.
    const fallbacks = getAvailableSearchEngines(config)
        .filter((name) => name !== engine && name !== 'duckduckgo').slice(0, 2);
    for (const fallback of fallbacks) {
        if (ranked.length >= limit) break;
        candidates.push(...await fetchSearchCandidates(query, fallback, config, limit));
        ranked = rankSearchResults(candidates, query, { ...options, limit });
    }
    return ranked;
}

module.exports = {
    getConfig,
    getAvailableSearchEngines,
    searchAcrossEngines,
    searchComplexQuery,
    searchWeb,
    searchWithEngine,
    rankSearchResults,
    scoreSearchRelevance,
    normalizeSearchUrl,
    extractSearchTerms,
    expandSearchQueries,
};
