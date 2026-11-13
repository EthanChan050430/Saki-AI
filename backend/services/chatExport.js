const cheerio = require('cheerio');

function exportHtml(input) {
    const $ = cheerio.load(String(input));
    const allowed = new Set('h1 h2 h3 h4 h5 h6 p div span strong em del blockquote pre code ul ol li table thead tbody tr th td hr br a img'.split(' '));
    $('body *').each((_, element) => {
        if (!allowed.has(element.tagName)) { $(element).remove(); return; }
        const attrs = { ...element.attribs };
        for (const key of Object.keys(attrs)) $(element).removeAttr(key);
        if (element.tagName === 'a' && /^https?:\/\//i.test(attrs.href || '')) $(element).attr('href', attrs.href);
        if (element.tagName === 'img') {
            if (!/^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(attrs.src || '')) throw new Error('Images must be embedded PNG, JPEG, WebP or GIF data');
            $(element).attr('src', attrs.src).attr('alt', attrs.alt || 'Image');
        }
    });
    return `<!doctype html><html><head><meta charset="utf-8"><title>Conversation</title><style>
    @page {size:A4;margin:18mm} *{box-sizing:border-box} body{margin:0;background:white;color:#202936;font:14px/1.7 Arial,"Microsoft YaHei",sans-serif}
    main{max-width:900px;margin:auto;padding:32px} h1{font-size:28px;border-bottom:2px solid #334155;padding-bottom:12px} h2{font-size:18px;color:#334155;margin-top:28px} h1,h2,h3{break-after:avoid}
    p,li{overflow-wrap:anywhere} a{color:#245b91} pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f5f7;padding:14px;border-radius:6px} code{font-family:Consolas,monospace;font-size:12px}
    blockquote{border-left:3px solid #cbd5e1;margin-left:0;padding-left:16px;color:#526071} table{width:100%;border-collapse:collapse;table-layout:fixed} th,td{border:1px solid #dce1e7;padding:8px;overflow-wrap:anywhere} th{background:#f3f5f7} tr,img{break-inside:avoid} img{display:block;max-width:100%;max-height:230mm;object-fit:contain;margin:16px auto} hr{border:0;border-top:1px solid #e2e8f0;margin:24px 0} @media print{main{padding:0;max-width:none}}
    </style></head><body><main>${$('body').html()}</main></body></html>`;
}

async function renderChatExport({ html, format, browserPath }) {
    if (!['pdf', 'png'].includes(format)) throw new Error('Unsupported export format');
    if (!browserPath) throw new Error('Install Chrome or Edge to export PDF/images');
    const document = exportHtml(html);
    const browser = await require('puppeteer-core').launch({ executablePath: browserPath, headless: true });
    try {
        const page = await browser.newPage();
        await page.setJavaScriptEnabled(false);
        await page.setRequestInterception(true);
        page.on('request', request => request.url().startsWith('data:') ? request.continue() : request.abort());
        await page.setViewport({ width: 1000, height: 800, deviceScaleFactor: 1.5 });
        await page.setContent(document, { waitUntil: 'load', timeout: 30000 });
        await page.evaluate(async () => {
            await document.fonts.ready;
            await Promise.all([...document.images].map(image => image.decode()));
        });
        if (format === 'pdf') return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        if (height > 20000) throw new Error('Conversation is too long for one image; export PDF or Markdown instead');
        return await page.screenshot({ type: 'png', fullPage: true });
    } finally { await browser.close(); }
}

module.exports = { exportHtml, renderChatExport };
