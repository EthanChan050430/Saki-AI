const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

const configPath = path.join(__dirname, '../../data/global_config.json');

async function getConfig() {
    try {
        if (await fs.pathExists(configPath)) {
            return await fs.readJson(configPath);
        }
    } catch (e) {
        console.error('Read config error:', e);
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

function mapSearchResult(result = {}, engine = '') {
    return {
        title: result.title || result.name || '',
        content: result.content || result.snippet || result.description || '',
        url: result.url || result.link || result.firstUrl || '',
        engine,
    };
}

function getAvailableSearchEngines(config = {}) {
    const preferredEngine = String(config.searchEngine || '').trim().toLowerCase();
    const engines = [];

    if (preferredEngine && preferredEngine !== 'off') {
        engines.push(preferredEngine);
    }

    if (config.googleApiKey && config.googleCxId) {
        engines.push('google');
    }

    if (config.bingApiKey) {
        engines.push('bing');
    }

    // DuckDuckGo instant answers can run without credentials, so it is a useful fallback.
    engines.push('duckduckgo');

    return uniqueEngines(engines);
}

async function searchWithEngine(query, engine, config = {}, limit = 5) {
    const normalizedQuery = String(query || '').trim();
    const normalizedEngine = String(engine || '').trim().toLowerCase();

    if (!normalizedQuery || !normalizedEngine || normalizedEngine === 'off') {
        return [];
    }

    try {
        if (normalizedEngine === 'searxng') {
            const baseUrl = config.searxngUrl || 'http://127.0.0.1:8080';
            const url = `${baseUrl}/search?q=${encodeURIComponent(normalizedQuery)}&format=json`;
            const response = await axios.get(url);
            return (response.data.results || [])
                .slice(0, limit)
                .map((result) => mapSearchResult({
                    title: result.title,
                    content: result.content || result.snippet,
                    url: result.url,
                }, normalizedEngine));
        } else if (normalizedEngine === 'google') {
            if (config.googleApiKey && config.googleCxId) {
                const url = `https://www.googleapis.com/customsearch/v1?key=${config.googleApiKey}&cx=${config.googleCxId}&q=${encodeURIComponent(normalizedQuery)}`;
                const response = await axios.get(url);
                return (response.data.items || [])
                    .slice(0, limit)
                    .map((result) => mapSearchResult({
                        title: result.title,
                        content: result.snippet,
                        url: result.link,
                    }, normalizedEngine));
            }
        } else if (normalizedEngine === 'bing') {
            if (config.bingApiKey) {
                const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(normalizedQuery)}`;
                const response = await axios.get(url, {
                    headers: { 'Ocp-Apim-Subscription-Key': config.bingApiKey }
                });
                return (response.data.webPages?.value || [])
                    .slice(0, limit)
                    .map((result) => mapSearchResult({
                        title: result.name,
                        content: result.snippet,
                        url: result.url,
                    }, normalizedEngine));
            }
        } else if (normalizedEngine === 'duckduckgo') {
            // DuckDuckGo instant answers are not a full search API, but they provide
            // a no-key fallback that is still useful for verification pipelines.
            const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(normalizedQuery)}&format=json&no_html=1&skip_disambig=1`;
            const response = await axios.get(url);
            if (response.data.AbstractText) {
                return [mapSearchResult({
                    title: response.data.Heading,
                    content: response.data.AbstractText,
                    url: response.data.AbstractURL,
                }, normalizedEngine)];
            }
            return (response.data.RelatedTopics || [])
                .slice(0, limit)
                .filter((topic) => topic.Text)
                .map((topic) => mapSearchResult({
                    title: normalizedQuery,
                    content: topic.Text,
                    url: topic.FirstURL,
                }, normalizedEngine));
        }
    } catch (error) {
        console.error(`${normalizedEngine} search error:`, error.message);
    }

    return [];
}

async function searchAcrossEngines(query, options = {}) {
    const config = options.config || await getConfig();
    const requestedEngines = Array.isArray(options.engines) && options.engines.length > 0
        ? options.engines
        : getAvailableSearchEngines(config);
    const engines = uniqueEngines(requestedEngines);
    const maxEngines = Math.max(1, Number(options.maxEngines) || engines.length);
    const selectedEngines = engines.slice(0, maxEngines);
    const limitPerEngine = Math.max(1, Number(options.limitPerEngine) || 3);

    const settled = await Promise.allSettled(
        selectedEngines.map((engine) => searchWithEngine(query, engine, config, limitPerEngine))
    );

    return selectedEngines.flatMap((engine, index) => {
        const result = settled[index];
        if (result.status !== 'fulfilled') return [];
        return result.value.map((item) => ({
            ...item,
            engine,
            query,
        }));
    });
}

async function searchWeb(query, options = {}) {
    const config = options.config || await getConfig();
    const engine = String(options.engine || config.searchEngine || 'searxng').trim().toLowerCase();

    if (engine === 'off') {
        return [];
    }

    return searchWithEngine(query, engine, config, options.limit || 5);
}

module.exports = {
    getConfig,
    getAvailableSearchEngines,
    searchAcrossEngines,
    searchWeb,
    searchWithEngine,
};
