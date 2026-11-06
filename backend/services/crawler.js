const cheerio = require('cheerio');
const fs = require('node:fs');
const dns = require('node:dns').promises;
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');
const { runtime } = require('./runtime');
function getLocalBrowserPath() {
    return [process.env.BROWSER_PATH, process.env.CHROME_PATH, process.env.PUPPETEER_EXECUTABLE_PATH,
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ].find(candidate => candidate && fs.existsSync(candidate));
}
let browser = null;
let launching = null;
let activePages = 0;
let idleTimer = null;
async function closeCrawler() {
    clearTimeout(idleTimer);
    const current = browser || await launching?.catch(() => null);
    browser = null;
    launching = null;
    if (current) await current.close().catch(() => {});
}
async function getSharedBrowser(executablePath) {
    if (browser) return browser;
    if (!launching) {
        launching = require('puppeteer-core').launch({
            executablePath, headless: true,
            args: ['--disable-dev-shm-usage', '--proxy-server=http://127.0.0.1:0',
                '--proxy-bypass-list=<-loopback>', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
                ...(process.env.SAKI_BROWSER_NO_SANDBOX === '1' ? ['--no-sandbox'] : [])],
        }).then(instance => {
            browser = instance;
            instance.on('disconnected', () => {
                if (browser === instance) { browser = null; launching = null; }
            });
            return instance;
        }).catch(error => { launching = null; throw error; });
    }
    return launching;
}
function extractText(html) {
    const $ = cheerio.load(html);
    $('script, style, noscript, iframe, nav, footer, header, .ads, .sidebar, #sidebar').remove();
    const main = $('article, main, .post-content, .article-content, #content, #main').first();
    const body = main.length ? main : $('body');
    const parts = [];
    body.find('h1, h2, h3, h4, h5, h6, p, li, pre, td').each((_i, element) => {
        const text = $(element).text().trim();
        if (text) parts.push((element.tagName.startsWith('h') ? '# ' : element.tagName === 'li' ? '- ' : '') + text);
    });
    return (parts.join('\n\n') || body.text().replace(/\s+/g, ' ').trim()).slice(0, 20000) || 'Could not extract meaningful text from this page.';
}
async function fetchPublicUrl(url, timeout = 15000) {
    const deadline = Date.now() + timeout;
    let current = url;
    for (let hop = 0; hop <= 5; hop += 1) {
        const { target, address } = await assertPublicUrl(current);
        const lookup = (hostname, options, callback) => {
            if (typeof options === 'function') { callback = options; options = {}; }
            if (hostname.replace(/^\[|\]$/g, '') !== target.hostname.replace(/^\[|\]$/g, '')) {
                return callback(new Error('Unexpected lookup hostname.'));
            }
            return options?.all ? callback(null, [{ ...address }]) : callback(null, address.address, address.family);
        };
        const httpAgent = new http.Agent({ lookup, keepAlive: false });
        const httpsAgent = new https.Agent({ lookup, keepAlive: false });
        try {
            const remaining = deadline - Date.now();
            if (remaining <= 0) throw new Error('Crawler request timed out.');
            const response = await require('axios').get(target.href, {
                headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: remaining,
                httpAgent, httpsAgent, lookup, proxy: false,
                maxContentLength: 5 * 1024 * 1024, maxBodyLength: 5 * 1024 * 1024,
                maxRedirects: 0, responseType: 'arraybuffer',
                validateStatus: status => (status >= 200 && status < 300) || [301, 302, 303, 307, 308].includes(status),
            });
            if ([301, 302, 303, 307, 308].includes(response.status)) {
                if (!response.headers.location || hop === 5) throw new Error('Invalid or excessive redirects.');
                current = new URL(response.headers.location, target).href;
                continue;
            }
            return { ...response, url: target.href };
        } finally {
            httpAgent.destroy();
            httpsAgent.destroy();
        }
    }
    throw new Error('Excessive redirects.');
}
async function crawlUrlStatic(url, timeout = 15000) {
    const response = await fetchPublicUrl(url, timeout);
    return extractText(Buffer.from(response.data).toString('utf8'));
}
function isPrivateAddress(address) {
    const normalized = String(address || '').replace(/^::ffff:/i, '').toLowerCase();
    if (normalized === 'localhost' || normalized === '::1' || normalized === '0.0.0.0') return true;
    if (net.isIPv4(normalized)) {
        const [a, b] = normalized.split('.').map(Number);
        return a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
            || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
            || (a === 198 && (b === 18 || b === 19)) || a >= 224 || a === 0;
    }
    if (net.isIPv6(normalized)) {
        // Only global unicast; reject mapped/transition forms and special-use ranges.
        return !/^[23][0-9a-f]{3}:/i.test(normalized) || normalized.startsWith('2001:')
            || normalized.startsWith('2002:') || normalized.startsWith('3fff:');
    }
    return true;
}
async function assertPublicUrl(url) {
    const target = new URL(String(url));
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw new Error('Unsupported URL protocol or credentials.');
    const hostname = target.hostname.replace(/^\[|\]$/g, '');
    const family = net.isIP(hostname);
    const addresses = family ? [{ address: hostname, family }] : await dns.lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(entry => isPrivateAddress(entry.address))) {
        throw new Error('Private or local network URLs are not allowed.');
    }
    return { target, address: addresses[0] };
}
async function crawlUrl(url, { mode = runtime.crawlerMode, timeout = 15000 } = {}) {
    let target;
    try { target = new URL(String(url).trim()); } catch { return 'Invalid or missing URL.'; }
    if (!['http:', 'https:'].includes(target.protocol)) return 'Invalid or missing URL.';
    try { await assertPublicUrl(target.href); } catch { return 'The requested URL is not allowed.'; }
    const executablePath = mode === 'browser' ? getLocalBrowserPath() : null;
    if (!executablePath) return crawlUrlStatic(target.href, timeout);
    let page;
    let context;
    clearTimeout(idleTimer);
    activePages += 1;
    try {
        const instance = await getSharedBrowser(executablePath);
        context = await instance.createBrowserContext();
        page = await context.newPage();
        await page.setBypassServiceWorker(true);
        await page.setRequestInterception(true);
        page.on('request', async request => {
            try {
                if (!['document', 'stylesheet', 'script', 'xhr', 'fetch'].includes(request.resourceType())
                    || request.method() !== 'GET' || request.redirectChain().length > 5) return await request.abort();
                const response = await fetchPublicUrl(request.url(), timeout);
                if (response.url !== new URL(request.url()).href) {
                    return await request.respond({ status: 302, headers: { location: response.url } });
                }
                // Never let Chromium connect on its own (including WebSocket,
                // workers, frames, WebRTC and service-worker bypass paths).
                return await request.respond({
                    status: response.status,
                    headers: {
                        'content-type': response.headers['content-type'] || 'text/html; charset=utf-8',
                        'content-security-policy': "default-src 'none'; script-src 'unsafe-inline' http: https:; style-src 'unsafe-inline' http: https:; connect-src 'none'; frame-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'",
                    },
                    body: Buffer.from(response.data),
                });
            } catch {
                return await request.abort().catch(() => {});
            }
        });
        await page.goto(target.href, { waitUntil: 'networkidle2', timeout: Math.max(timeout * 2, 10000) });
        return extractText(await page.content());
    } catch (error) {
        console.warn('[Crawler] Browser failed, using HTTP: ' + error.message);
        return crawlUrlStatic(target.href, timeout);
    } finally {
        if (page) await page.close().catch(() => {});
        if (context) await context.close().catch(() => {});
        activePages -= 1;
        if (!activePages) {
            idleTimer = setTimeout(() => { if (!activePages) closeCrawler(); }, runtime.browserIdleMs);
            idleTimer.unref();
        }
    }
}
module.exports = { crawlUrl, closeCrawler, extractText, fetchPublicUrl };
