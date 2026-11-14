const axios = require('axios');
const cheerio = require('cheerio');
const { validateSlide, revisePresentation } = require('./pptRevision');
const { downloadImageUrlAsDataUri } = require('./imageUtils');

const PERSISTENT_IMAGE_DATA_URI_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const DEFAULT_SLOT_BOUNDS = { left: 530, top: 145, width: 370, height: 320 };
const DEFAULT_SEARCH_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
};

function isPersistentSlideImageDataUri(source = '') {
    return PERSISTENT_IMAGE_DATA_URI_RE.test(String(source || '').trim());
}

function normalizePersistentDataUri(source = '') {
    const raw = String(source || '').trim();
    const match = raw.match(/^data:(image\/(?:png|jpeg|webp));base64,([\s\S]+)$/i);
    if (!match) return '';
    const mime = match[1].toLowerCase();
    const payload = match[2].replace(/\s+/g, '');
    const normalized = `data:${mime};base64,${payload}`;
    return isPersistentSlideImageDataUri(normalized) ? normalized : '';
}

function parseInlineStyle(styleStr = '') {
    const entries = [];
    const map = {};
    for (const rule of String(styleStr || '').split(';')) {
        const trimmed = rule.trim();
        if (!trimmed) continue;
        const colon = trimmed.indexOf(':');
        if (colon <= 0) continue;
        const prop = trimmed.slice(0, colon).trim().toLowerCase();
        const val = trimmed.slice(colon + 1).trim();
        if (!prop || !val) continue;
        if (!(prop in map)) entries.push(prop);
        map[prop] = val;
    }
    return { order: entries, map };
}

function serializeInlineStyle(styleObj) {
    return styleObj.order
        .filter((prop) => styleObj.map[prop] != null && styleObj.map[prop] !== '')
        .map((prop) => `${prop}:${styleObj.map[prop]}`)
        .join(';');
}

function setInlineStyleProps(el, $, updates = {}) {
    const parsed = parseInlineStyle($(el).attr('style') || '');
    for (const [prop, val] of Object.entries(updates)) {
        const key = prop.toLowerCase();
        if (!(key in parsed.map)) parsed.order.push(key);
        parsed.map[key] = val;
    }
    $(el).attr('style', serializeInlineStyle(parsed));
}

function hasValidSlotBounds(styleStr = '') {
    const { map: style } = parseInlineStyle(styleStr);
    if (style.position !== 'absolute') return false;
    const nums = ['left', 'top', 'width', 'height'].map((name) => {
        if (!/^\d+(?:\.\d+)?px$/.test(style[name] || '')) return NaN;
        return Number.parseFloat(style[name]);
    });
    const [x, y, width, height] = nums;
    if (nums.some((n) => !Number.isFinite(n))) return false;
    return width > 0 && height > 0 && x + width <= 960 && y + height <= 540;
}

function buildDefaultSlotStyle(bounds = DEFAULT_SLOT_BOUNDS) {
    const left = Number.isFinite(bounds.left) ? bounds.left : DEFAULT_SLOT_BOUNDS.left;
    const top = Number.isFinite(bounds.top) ? bounds.top : DEFAULT_SLOT_BOUNDS.top;
    const width = Number.isFinite(bounds.width) ? bounds.width : DEFAULT_SLOT_BOUNDS.width;
    const height = Number.isFinite(bounds.height) ? bounds.height : DEFAULT_SLOT_BOUNDS.height;
    return `position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;object-fit:cover;border-radius:18px;box-shadow:0 16px 36px rgba(15,23,42,0.14);z-index:20`;
}

function prepareSlideImageSlotHtml(
    slideHtml,
    { slotId = 'hero', bounds = DEFAULT_SLOT_BOUNDS, alt = 'Slide illustration', ensureSlot = true } = {}
) {
    validateSlide(slideHtml);
    const $ = cheerio.load(slideHtml, null, false);
    const root = $.root().children().first();

    setInlineStyleProps(root, $, {
        position: 'relative',
        width: '960px',
        height: '540px',
    });

    const existingSlots = $('img[data-ppt-image-slot]');
    let targetSlot = existingSlots.filter((_, el) => $(el).attr('data-ppt-image-slot') === slotId).first();
    if (!targetSlot.length && existingSlots.length) {
        targetSlot = existingSlots.first();
    }

    if (!targetSlot.length && !ensureSlot) {
        return {
            html: $.html(),
            slotId,
            modeAttr: '',
            queryAttr: '',
            altAttr: '',
            hasSlot: false,
        };
    }

    let modeAttr = '';
    let queryAttr = '';
    let altAttr = String(alt || 'Slide illustration').trim();
    let resolvedSlotId = slotId;
    const createdNewSlot = !targetSlot.length;

    if (targetSlot.length) {
        resolvedSlotId = String(targetSlot.attr('data-ppt-image-slot') || slotId).trim() || slotId;
        modeAttr = String(targetSlot.attr('data-ppt-image-mode') || '').trim().toLowerCase();
        queryAttr = String(targetSlot.attr('data-ppt-image-query') || '').trim();
        altAttr = String(targetSlot.attr('alt') || altAttr).trim() || 'Slide illustration';

        const isDirectChild = targetSlot.parent()[0] === root[0];
        const validStyle = hasValidSlotBounds(targetSlot.attr('style') || '');
        if (!isDirectChild || !validStyle) {
            targetSlot.attr('style', buildDefaultSlotStyle(bounds));
            if (!isDirectChild) {
                targetSlot.remove();
                root.append(targetSlot);
            }
        }
        targetSlot.attr('data-ppt-image-slot', resolvedSlotId);
        targetSlot.attr('alt', altAttr);
    } else {
        targetSlot = $('<img>')
            .attr('data-ppt-image-slot', resolvedSlotId)
            .attr('alt', altAttr)
            .attr('style', buildDefaultSlotStyle(bounds));
        root.append(targetSlot);
    }

    // Reserve horizontal clearance for right-side image slots when content containers lack right clearance.
    if ((Number(bounds?.left) || DEFAULT_SLOT_BOUNDS.left) >= 460) {
        const contentContainers = root.children('div, section').filter((_, el) => {
            const cls = String($(el).attr('class') || '');
            const styleStr = String($(el).attr('style') || '');
            if (/\b(pointer-events-none|-z-\d+)\b/.test(cls)) return false;
            const hasContent = $(el).text().trim().length > 0;
            if (!hasContent) return false;
            if (/position\s*:\s*absolute/i.test(styleStr) && !/\bp-\d+\b/.test(cls) && !/\binset-0\b/.test(cls)) return false;
            if (/\babsolute\b/.test(cls) && !/\binset-0\b/.test(cls) && !/\bp-\d+\b/.test(cls)) return false;
            return true;
        });

        const hasExistingConstraint = contentContainers.toArray().some((el) => {
            const cls = String($(el).attr('class') || '');
            const styleStr = String($(el).attr('style') || '');
            return /\b(pr-\[\d+|max-w-\[[345]\d\dpx\])/.test(cls)
                || /(padding-right|max-width)\s*:/i.test(styleStr);
        });

        if (!hasExistingConstraint && contentContainers.length > 0) {
            const primary = contentContainers.first();
            setInlineStyleProps(primary, $, {
                'padding-right': '460px',
                'box-sizing': 'border-box',
            });

            if (createdNewSlot) {
                primary.find('h1, h2').each((_, el) => {
                    const cls = String($(el).attr('class') || '');
                    if (/\btext-(?:5xl|6xl)\b/.test(cls)) {
                        $(el).attr('class', cls.replace(/\btext-(?:5xl|6xl)\b/g, 'text-3xl'));
                    }
                });
                primary.find('[class*="grid-cols-"]').each((_, el) => {
                    const cls = String($(el).attr('class') || '');
                    if (/\bgrid-cols-(?:3|4)\b/.test(cls)) {
                        $(el).attr('class', cls.replace(/\bgrid-cols-(?:3|4)\b/g, 'grid-cols-2'));
                    }
                });
            }
        }
    }

    return {
        html: $.html(),
        slotId: resolvedSlotId,
        modeAttr,
        queryAttr,
        altAttr,
        hasSlot: true,
    };
}

function removeSlideImageSlotHtml(slideHtml, slotId = 'hero') {
    if (!slideHtml || typeof slideHtml !== 'string') return slideHtml;
    const $ = cheerio.load(slideHtml, null, false);
    const targets = slotId
        ? $('img[data-ppt-image-slot]').filter((_, el) => $(el).attr('data-ppt-image-slot') === slotId)
        : $('img[data-ppt-image-slot]');

    targets.each((_, el) => {
        const src = String($(el).attr('src') || '').trim();
        if (!isPersistentSlideImageDataUri(src)) {
            $(el).remove();
        }
    });
    return $.html();
}

function injectSlideSlotSrcHtml(slideHtml, slotId = 'hero', source = '', alt = 'Slide illustration') {
    if (!isPersistentSlideImageDataUri(source)) {
        throw new Error('Expected a persistent PNG, JPEG or WebP image.');
    }
    const $ = cheerio.load(slideHtml, null, false);
    const slot = $('img[data-ppt-image-slot]').filter((_, el) => $(el).attr('data-ppt-image-slot') === slotId).first();
    if (!slot.length) {
        throw new Error('Image slot not found.');
    }
    slot.attr('src', source).attr('alt', String(alt || 'Slide illustration').trim());
    return $.html();
}

function imageSlot(data, slideId, slotId) {
    const slide = data?.steps?.find(step => String(step.id) === String(slideId));
    if (data?.status !== 'completed' || !slide?.content) throw new Error('Select a completed slide.');
    validateSlide(slide.content);
    const $ = cheerio.load(slide.content, null, false);
    const slots = $('img[data-ppt-image-slot]').filter((_, el) => $(el).attr('data-ppt-image-slot') === slotId);
    if (slots.length !== 1) throw new Error('Image slot not found or duplicated. Prepare a unique image slot first.');
    const root = $.root().children().first();
    if (slots.parent()[0] !== root[0] || !/position\s*:\s*relative\s*(?:;|$)/i.test(root.attr('style') || '')) {
        throw new Error('Image slot must be a direct child of a relatively positioned slide.');
    }
    const style = Object.fromEntries(String(slots.attr('style') || '').split(';').filter(Boolean).map(rule => {
        const colon = rule.indexOf(':');
        return [rule.slice(0, colon).trim(), rule.slice(colon + 1).trim()];
    }));
    const dimensions = ['left', 'top', 'width', 'height'].map(name => {
        if (!/^\d+(?:\.\d+)?px$/.test(style[name] || '')) throw new Error('Image slot requires explicit pixel bounds.');
        return Number.parseFloat(style[name]);
    });
    const [x, y, width, height] = dimensions;
    if (style.position !== 'absolute' || width <= 0 || height <= 0 || x + width > 960 || y + height > 540) {
        throw new Error('Image slot must fit inside the 960 by 540 slide.');
    }
    return { $, slot: slots.first(), slide };
}

function insertImage(data, slideId, slotId, source, prompt) {
    if (!isPersistentSlideImageDataUri(source)) throw new Error('Expected a persistent PNG, JPEG or WebP image.');
    const { $, slot, slide } = imageSlot(data, slideId, slotId);
    slot.attr('src', source).attr('alt', prompt);
    // Only the image source and description change; the slot geometry is retained.
    return revisePresentation(data, slideId, { content: $.html(), thinking: slide.thinking });
}

function isUsableImageCandidateUrl(url = '') {
    const trimmed = String(url || '').trim();
    if (!/^https?:\/\//i.test(trimmed)) return false;
    if (/\.(?:gif|svg)(?:[?#].*)?$/i.test(trimmed)) return false;
    return true;
}

function pushCandidateUrls(list, seen, urls = []) {
    for (const url of urls) {
        const clean = String(url || '').trim();
        if (!isUsableImageCandidateUrl(clean)) continue;
        if (seen.has(clean)) continue;
        seen.add(clean);
        list.push(clean);
    }
}

async function fetchImageSearchCandidates(query, config = {}, { httpClient = axios, timeout = 6000 } = {}) {
    const normalizedQuery = String(query || '').trim();
    if (!normalizedQuery) return [];

    const candidates = [];
    const seen = new Set();

    // 1. Google Custom Search Image API (if configured)
    if (config?.googleApiKey && config?.googleCxId) {
        try {
            const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(config.googleApiKey)}&cx=${encodeURIComponent(config.googleCxId)}&q=${encodeURIComponent(normalizedQuery)}&searchType=image&num=6`;
            const resp = await httpClient.get(url, { timeout });
            const urls = (resp?.data?.items || []).flatMap((item) => [item?.link, item?.image?.thumbnailLink]);
            pushCandidateUrls(candidates, seen, urls);
        } catch {
            // Fall through to secondary image providers.
        }
    }

    // 2. Bing Image Search API v7 (if configured)
    if (config?.bingApiKey) {
        try {
            const url = `https://api.bing.microsoft.com/v7.0/images/search?q=${encodeURIComponent(normalizedQuery)}&count=8`;
            const resp = await httpClient.get(url, {
                headers: { 'Ocp-Apim-Subscription-Key': config.bingApiKey },
                timeout,
            });
            const urls = (resp?.data?.value || []).flatMap((item) => [item?.contentUrl, item?.thumbnailUrl]);
            pushCandidateUrls(candidates, seen, urls);
        } catch {
            // Fall through to public image search endpoints.
        }
    }

    // 3. Bing Images Async endpoint (no key required)
    try {
        const url = `https://cn.bing.com/images/async?q=${encodeURIComponent(normalizedQuery)}&first=0&count=12&mmasync=1`;
        const resp = await httpClient.get(url, { timeout, headers: DEFAULT_SEARCH_HEADERS });
        const html = String(resp?.data || '');
        const dom = cheerio.load(html);
        const primaryUrls = [];
        const thumbUrls = [];
        dom('[m]').each((_, el) => {
            try {
                const meta = JSON.parse(dom(el).attr('m') || '{}');
                if (meta.murl) primaryUrls.push(meta.murl);
                if (meta.turl) thumbUrls.push(meta.turl);
            } catch {
                // Ignore malformed item metadata.
            }
        });
        pushCandidateUrls(candidates, seen, primaryUrls);
        pushCandidateUrls(candidates, seen, thumbUrls);
    } catch {
        // Fall through to Wikimedia / Wikipedia fallbacks.
    }

    // 4. Wikimedia Commons bitmap search fallback
    if (candidates.length < 3) {
        try {
            const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(`filetype:bitmap ${normalizedQuery}`)}&gsrnamespace=6&gsrlimit=6&prop=imageinfo&iiprop=url|mime&iiurlwidth=960&format=json`;
            const resp = await httpClient.get(url, {
                timeout,
                headers: { 'User-Agent': 'SakiAI/1.0' },
            });
            const pages = Object.values(resp?.data?.query?.pages || {});
            const urls = pages.flatMap((page) => {
                const info = Array.isArray(page?.imageinfo) ? page.imageinfo[0] : null;
                return [info?.thumburl, info?.url];
            });
            pushCandidateUrls(candidates, seen, urls);
        } catch {
            // Fall through to Wikipedia PageImages fallback.
        }
    }

    // 5. Wikipedia PageImages fallback (zh / en)
    if (candidates.length < 2) {
        const wikiLang = /[\u4e00-\u9fff]/.test(normalizedQuery) ? 'zh' : 'en';
        try {
            const url = `https://${wikiLang}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(normalizedQuery)}&gsrlimit=5&prop=pageimages&piprop=original|thumbnail&pithumbsize=960&format=json`;
            const resp = await httpClient.get(url, {
                timeout,
                headers: { 'User-Agent': 'SakiAI/1.0' },
            });
            const pages = Object.values(resp?.data?.query?.pages || {});
            const urls = pages.flatMap((page) => [page?.thumbnail?.source, page?.original?.source]);
            pushCandidateUrls(candidates, seen, urls);
        } catch {
            // No more fallbacks.
        }
    }

    return candidates;
}

async function searchPptImageAsDataUri({
    query = '',
    fallbackQuery = '',
    config = {},
    httpClient = axios,
    downloadImage = downloadImageUrlAsDataUri,
    maxDownloadAttempts = 6,
} = {}) {
    const queries = [String(query || '').trim(), String(fallbackQuery || '').trim()].filter(Boolean);
    const triedUrls = new Set();
    let downloadsTried = 0;
    let lastError = null;

    for (const q of queries) {
        const candidates = await fetchImageSearchCandidates(q, config, { httpClient });
        for (const candidateUrl of candidates) {
            if (triedUrls.has(candidateUrl)) continue;
            triedUrls.add(candidateUrl);
            if (downloadsTried >= maxDownloadAttempts) break;
            downloadsTried += 1;

            try {
                const rawDataUri = await downloadImage(candidateUrl, {
                    timeout: 6000,
                    attempts: 1,
                    httpClient,
                });
                const normalized = normalizePersistentDataUri(rawDataUri);
                if (normalized) {
                    return {
                        source: normalized,
                        sourceUrl: candidateUrl,
                        mode: 'search',
                    };
                }
            } catch (error) {
                lastError = error;
            }
        }
        if (downloadsTried >= maxDownloadAttempts) break;
    }

    throw lastError || new Error('No usable image could be found from web image search.');
}

function canUseDrawingForPpt(config = {}) {
    const provider = String(config?.drawingProvider || '').trim().toLowerCase();
    if (provider === 'stable-diffusion') return true;
    if (provider === 'custom') {
        return Boolean(String(config?.customDrawingUrl || '').trim() && String(config?.customDrawingKey || '').trim());
    }
    return false;
}

function createPptImageHandler({ generate, extractSource, searchImage = searchPptImageAsDataUri }) {
    const jobs = new Map();
    return async (req, res) => {
        try {
            const {
                data,
                slideId,
                slotId = 'hero',
                prompt,
                requestId,
                confirmed,
                config = {},
                mode = 'draw',
                autoPrepareSlot = false,
            } = req.body || {};

            if (confirmed !== true || typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(requestId)
                || typeof prompt !== 'string' || !prompt.trim() || prompt.length > 2000
                || typeof slotId !== 'string' || slotId.length > 100) {
                return res.status(400).json({ error: 'Confirm image generation and provide a prompt, slot and request ID.' });
            }

            const originalSlide = data?.steps?.find(step => String(step.id) === String(slideId));
            let workingData = data;
            let didAutoPrepare = false;

            try {
                imageSlot(workingData, slideId, slotId);
            } catch (slotErr) {
                if (!autoPrepareSlot || data?.status !== 'completed' || !originalSlide?.content) {
                    throw slotErr;
                }
                const prepared = prepareSlideImageSlotHtml(originalSlide.content, {
                    slotId,
                    alt: prompt.trim(),
                    ensureSlot: true,
                });
                workingData = {
                    ...data,
                    steps: data.steps.map((step) => (
                        String(step.id) === String(slideId)
                            ? { ...step, content: prepared.html }
                            : step
                    )),
                };
                didAutoPrepare = true;
                imageSlot(workingData, slideId, slotId);
            }

            const normalizedMode = String(mode || 'draw').trim().toLowerCase();
            const signature = JSON.stringify({ data, slideId, slotId, prompt, mode: normalizedMode, autoPrepareSlot: Boolean(autoPrepareSlot) });
            let job = jobs.get(requestId);
            if (job && job.signature !== signature) return res.status(409).json({ error: 'Request ID already belongs to another image operation.' });

            if (!job) {
                // Retain failed requests too: an uncertain provider response must not trigger another charge.
                if (jobs.size >= 100) return res.status(429).json({ error: 'Image request limit reached for this server process.' });
                job = { signature };
                job.promise = (async () => {
                    const runDraw = async () => {
                        const result = await generate({
                            prompt: `${prompt.trim()}\nIllustration only, no text or statistics. Keep the subject centered with crop-safe margins.`,
                            config, referenceImages: [], chatId: 'ppt', assistantMsgId: requestId,
                            requestedWidth: 1024, requestedHeight: 1024, logLabel: 'PPT image', allowSizeRetry: false,
                        });
                        if (result.error || !result.generatedFile) throw new Error(result.error || 'Generated image could not be saved. Do not automatically retry.');
                        return { source: extractSource(result.observation), asset: result.generatedFile, mode: 'draw' };
                    };

                    if (normalizedMode === 'search') {
                        const searched = await searchImage({ query: prompt.trim(), config });
                        return { source: searched.source, asset: null, mode: 'search' };
                    }

                    if (normalizedMode === 'auto') {
                        if (canUseDrawingForPpt(config)) {
                            try {
                                return await runDraw();
                            } catch (drawErr) {
                                try {
                                    const searched = await searchImage({ query: prompt.trim(), config });
                                    return { source: searched.source, asset: null, mode: 'search' };
                                } catch {
                                    throw drawErr;
                                }
                            }
                        }
                        const searched = await searchImage({ query: prompt.trim(), config });
                        return { source: searched.source, asset: null, mode: 'search' };
                    }

                    return runDraw();
                })();
                jobs.set(requestId, job);
            }

            const result = await job.promise;
            let pptData = insertImage(workingData, slideId, slotId, result.source, prompt.trim());

            // Ensure undo ("恢复上一版") restores the original slide prior to autoPrepareSlot.
            if (didAutoPrepare && originalSlide) {
                pptData = {
                    ...pptData,
                    steps: pptData.steps.map((step) => {
                        if (String(step.id) !== String(slideId)) return step;
                        const revs = Array.isArray(step.revisions) ? [...step.revisions] : [];
                        if (revs.length > 0) {
                            revs[revs.length - 1] = {
                                content: originalSlide.content,
                                thinking: originalSlide.thinking || '',
                            };
                        }
                        return {
                            ...step,
                            imageStatus: 'completed',
                            imageMode: result.mode || normalizedMode,
                            imageQuery: prompt.trim(),
                            revisions: revs,
                        };
                    }),
                };
            } else {
                pptData = {
                    ...pptData,
                    steps: pptData.steps.map((step) => (
                        String(step.id) === String(slideId)
                            ? {
                                ...step,
                                imageStatus: 'completed',
                                imageMode: result.mode || normalizedMode,
                                imageQuery: prompt.trim(),
                            }
                            : step
                    )),
                };
            }

            res.json({ pptData, asset: result.asset, mode: result.mode || normalizedMode });
        } catch (error) {
            console.error('[PPT image]', error.message);
            res.status(500).json({ error: error.message });
        }
    };
}

module.exports = {
    imageSlot,
    insertImage,
    createPptImageHandler,
    isPersistentSlideImageDataUri,
    prepareSlideImageSlotHtml,
    removeSlideImageSlotHtml,
    injectSlideSlotSrcHtml,
    fetchImageSearchCandidates,
    searchPptImageAsDataUri,
};
