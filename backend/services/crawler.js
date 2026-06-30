const puppeteer = require('puppeteer-core');
const cheerio = require('cheerio');
const fs = require('fs-extra');
const path = require('path');

// Helper to find local Chrome or Edge on Windows
function getLocalBrowserPath() {
    const paths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
    for (const p of paths) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

let sharedBrowser = null;
let launchingPromise = null;

async function getSharedBrowser(browserPath) {
    if (sharedBrowser) return sharedBrowser;
    if (launchingPromise) return launchingPromise;

    launchingPromise = (async () => {
        try {
            console.log(`[Crawler] Launching shared browser: ${browserPath}`);
            const browser = await puppeteer.launch({
                executablePath: browserPath,
                headless: "new",
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
            });
            sharedBrowser = browser;
            
            browser.on('disconnected', () => {
                console.log('[Crawler] Shared browser disconnected.');
                sharedBrowser = null;
                launchingPromise = null;
            });
            
            return browser;
        } catch (e) {
            launchingPromise = null;
            throw e;
        }
    })();
    
    return launchingPromise;
}

/**
 * Universal crawler using Puppeteer-core for JS rendering.
 */
async function crawlUrl(url) {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
        console.warn(`[Crawler] Invalid URL: ${url}`);
        return "Invalid or missing URL.";
    }
    
    // 清洗 URL，防止因多余空格导致的解析失败
    const targetUrl = url.trim();
    const browserPath = getLocalBrowserPath();
    
    // If no local browser found, fallback to simple axios (old logic)
    if (!browserPath) {
        console.warn("[Crawler] No local Chrome/Edge found. Falling back to static crawler.");
        return await crawlUrlStatic(targetUrl);
    }

    let page = null;
    try {
        console.log(`[Crawler] Fetching (JS Render): ${targetUrl}`);
        const browser = await getSharedBrowser(browserPath);
        page = await browser.newPage();
        
        // Set user agent to avoid bot detection
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Wait for network to be idle (max 45s, fall back to domcontentloaded if needed)
        try {
            await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 45000 });
        } catch (e) {
            console.warn(`[Crawler] networkidle2 timeout, trying domcontentloaded: ${targetUrl}`);
            await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(e2 => {
                console.error(`[Crawler] Second attempt failed: ${e2.message}`);
                throw e2; // Bubble up to trigger static fallback
            });
        }

        // Scroll down to trigger lazy loading
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                let distance = 100;
                let timer = setInterval(() => {
                    let scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    if (totalHeight >= scrollHeight || totalHeight > 5000) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
            });
        });

        const html = await page.content();
        const $ = cheerio.load(html);

        // Remove unnecessary elements
        $('script, style, noscript, iframe, nav, footer, header, .ads, .sidebar, #sidebar').remove();

        let content = '';
        const mainSelectors = ['article', 'main', '.content', '.post-content', '.article-content', '#content', '#main'];
        let $body = null;
        for (const selector of mainSelectors) {
            const found = $(selector);
            if (found.length > 0) { $body = found; break; }
        }
        if (!$body) $body = $('body');

        $body.find('h1, h2, h3, h4, h5, h6, p, li').each((i, el) => {
            const text = $(el).text().trim();
            if (text) {
                const tagName = el.tagName.toUpperCase();
                if (tagName.startsWith('H')) content += `\n\n# ${text}\n`;
                else if (tagName === 'LI') content += `\n- ${text}`;
                else content += `\n${text}\n`;
            }
        });

        return content.trim().substring(0, 20000) || "Could not extract meaningful text from this page.";
    } catch (error) {
        console.error(`[Crawler] Puppeteer error: ${error.message}`);
        // Attempt static fallback on browser failure
        return await crawlUrlStatic(targetUrl);
    } finally {
        if (page) {
            try {
                await page.close();
            } catch (e) {
                console.error(`[Crawler] Failed to close page: ${e.message}`);
            }
        }
    }
}

/**
 * Static fallback using axios (for non-JS pages or when browser fails)
 */
async function crawlUrlStatic(url) {
    const axios = require('axios');
    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000
        });
        const $ = cheerio.load(response.data);
        $('script, style').remove();
        return $('body').text().replace(/\s+/g, ' ').trim().substring(0, 15000);
    } catch (e) {
        throw new Error(`Crawler failed: ${e.message}`);
    }
}

module.exports = { crawlUrl };

