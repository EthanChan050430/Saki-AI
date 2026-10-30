const cheerio = require('cheerio');
const fs = require('node:fs');
const dns = require('node:dns').promises;
const net = require('node:net');
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
            args: ['--disable-dev-shm-usage', ...(process.env.SAKI_BROWSER_NO_SANDBOX === '1' ? ['--no-sandbox'] : [])],
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
async function crawlUrlStatic(url) {
    const response = await require('axios').get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000,
        maxContentLength: 5 * 1024 * 1024, maxBodyLength: 5 * 1024 * 1024,
        maxRedirects: 0,
        responseType: 'text',
    });
    return extractText(response.data);
}
function isPrivateAddress(address) {
    const normalized = String(address || '').replace(/^::ffff:/i, '').toLowerCase();
    if (normalized === 'localhost' || normalized === '::1' || normalized === '0.0.0.0') return true;
    if (net.isIPv4(normalized)) {
        const [a, b] = normalized.split('.').map(Number);
        return a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
            || (a === 192 && b === 168) || a === 0;
    }
    if (net.isIPv6(normalized)) {
        return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd')
            || normalized.startsWith('fe8') || normalized.startsWith('fe9')
            || normalized.startsWith('fea') || normalized.startsWith('feb');
    }
    return true;
}
async function assertPublicUrl(url) {
    const target = new URL(String(url));
    if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Unsupported URL protocol.');
    const addresses = await dns.lookup(target.hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(entry => isPrivateAddress(entry.address))) {
        throw new Error('Private or local network URLs are not allowed.');
    }
}
async function crawlUrl(url, { mode = runtime.crawlerMode } = {}) {
    let target;
    try { target = new URL(String(url).trim()); } catch { return 'Invalid or missing URL.'; }
    if (!['http:', 'https:'].includes(target.protocol)) return 'Invalid or missing URL.';
    try { await assertPublicUrl(target.href); } catch { return 'The requested URL is not allowed.'; }
    const executablePath = mode === 'browser' ? getLocalBrowserPath() : null;
    if (!executablePath) return crawlUrlStatic(target.href);
    let page;
    clearTimeout(idleTimer);
    activePages += 1;
    try {
        const instance = await getSharedBrowser(executablePath);
        page = await instance.newPage();
        await page.setRequestInterception(true);
        page.on('request', async request => {
            if (['image', 'media', 'font'].includes(request.resourceType())) return request.abort();
            try {
                await assertPublicUrl(request.url());
                return request.continue();
            } catch {
                return request.abort();
            }
        });
        await page.goto(target.href, { waitUntil: 'networkidle2', timeout: 30000 });
        return extractText(await page.content());
    } catch (error) {
        console.warn('[Crawler] Browser failed, using HTTP: ' + error.message);
        return crawlUrlStatic(target.href);
    } finally {
        if (page) await page.close().catch(() => {});
        activePages -= 1;
        if (!activePages) {
            idleTimer = setTimeout(() => { if (!activePages) closeCrawler(); }, runtime.browserIdleMs);
            idleTimer.unref();
        }
    }
}
module.exports = { crawlUrl, closeCrawler, extractText };
