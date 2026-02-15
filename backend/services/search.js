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

async function searchWeb(query) {
    const config = await getConfig();
    const engine = config.searchEngine || 'searxng';
    
    // If search is disabled globally or engine is 'off'
    if (engine === 'off') {
        return [];
    }

    try {
        if (engine === 'searxng') {
            const baseUrl = config.searxngUrl || 'http://127.0.0.1:8080';
            const url = `${baseUrl}/search?q=${encodeURIComponent(query)}&format=json`;
            const response = await axios.get(url);
            return (response.data.results || []).slice(0, 5).map(r => ({
                title: r.title,
                content: r.content || r.snippet,
                url: r.url
            }));
        } else if (engine === 'google') {
            if (config.googleApiKey && config.googleCxId) {
                const url = `https://www.googleapis.com/customsearch/v1?key=${config.googleApiKey}&cx=${config.googleCxId}&q=${encodeURIComponent(query)}`;
                const response = await axios.get(url);
                return (response.data.items || []).slice(0, 5).map(r => ({
                    title: r.title,
                    content: r.snippet,
                    url: r.link
                }));
            }
        } else if (engine === 'bing') {
            if (config.bingApiKey) {
                const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}`;
                const response = await axios.get(url, {
                    headers: { 'Ocp-Apim-Subscription-Key': config.bingApiKey }
                });
                return (response.data.webPages?.value || []).slice(0, 5).map(r => ({
                    title: r.name,
                    content: r.snippet,
                    url: r.url
                }));
            }
        } else if (engine === 'duckduckgo') {
            // Using DuckDuckGo's "Instant Answer" API which is free/unauthenticated
            // Note: This is not a full web search, but works for basic queries
            const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
            const response = await axios.get(url);
            if (response.data.AbstractText) {
                return [{
                    title: response.data.Heading,
                    content: response.data.AbstractText,
                    url: response.data.AbstractURL
                }];
            }
            // Fallback to related topics
            return (response.data.RelatedTopics || []).slice(0, 5).filter(t => t.Text).map(t => ({
                title: query,
                content: t.Text,
                url: t.FirstURL
            }));
        }
    } catch (error) {
        console.error(`${engine} search error:`, error.message);
    }

    return [];
}

module.exports = { searchWeb };
