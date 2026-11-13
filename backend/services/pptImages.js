const cheerio = require('cheerio');
const { validateSlide, revisePresentation } = require('./pptRevision');

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
    if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(source)) throw new Error('Expected a persistent PNG, JPEG or WebP image.');
    const { $, slot, slide } = imageSlot(data, slideId, slotId);
    slot.attr('src', source).attr('alt', prompt);
    // Only the image source and description change; the slot geometry is retained.
    return revisePresentation(data, slideId, { content: $.html(), thinking: slide.thinking });
}

function createPptImageHandler({ generate, extractSource }) {
    const jobs = new Map();
    return async (req, res) => {
        try {
            const { data, slideId, slotId, prompt, requestId, confirmed, config = {} } = req.body || {};
            if (confirmed !== true || typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(requestId)
                || typeof prompt !== 'string' || !prompt.trim() || prompt.length > 2000
                || typeof slotId !== 'string' || slotId.length > 100) {
                return res.status(400).json({ error: 'Confirm image generation and provide a prompt, slot and request ID.' });
            }
            imageSlot(data, slideId, slotId);
            const signature = JSON.stringify({ data, slideId, slotId, prompt });
            let job = jobs.get(requestId);
            if (job && job.signature !== signature) return res.status(409).json({ error: 'Request ID already belongs to another image operation.' });
            if (!job) {
                // Retain failed requests too: an uncertain provider response must not trigger another charge.
                if (jobs.size >= 100) return res.status(429).json({ error: 'Image request limit reached for this server process.' });
                job = { signature };
                job.promise = (async () => {
                    const result = await generate({
                        prompt: `${prompt.trim()}\nIllustration only, no text or statistics. Keep the subject centered with crop-safe margins.`,
                        config, referenceImages: [], chatId: 'ppt', assistantMsgId: requestId,
                        requestedWidth: 1024, requestedHeight: 1024, logLabel: 'PPT image', allowSizeRetry: false,
                    });
                    if (result.error || !result.generatedFile) throw new Error(result.error || 'Generated image could not be saved. Do not automatically retry.');
                    return { source: extractSource(result.observation), asset: result.generatedFile };
                })();
                jobs.set(requestId, job);
            }
            const result = await job.promise;
            const pptData = insertImage(data, slideId, slotId, result.source, prompt.trim());
            res.json({ pptData, asset: result.asset });
        } catch (error) {
            console.error('[PPT image]', error.message);
            res.status(500).json({ error: error.message });
        }
    };
}

module.exports = { imageSlot, insertImage, createPptImageHandler };
