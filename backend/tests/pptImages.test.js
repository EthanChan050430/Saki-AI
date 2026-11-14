const { test } = require('node:test');
const assert = require('node:assert/strict');
const cheerio = require('cheerio');
const {
    imageSlot,
    insertImage,
    createPptImageHandler,
    prepareSlideImageSlotHtml,
    removeSlideImageSlotHtml,
    searchPptImageAsDataUri,
} = require('../services/pptImages');
const { revisePresentation } = require('../services/pptRevision');
const source = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX2kAAAAASUVORK5CYII=';
const fixture = () => ({ status: 'completed', steps: [
    { id: 0, content: '<div class="slide" style="position:relative;width:960px;height:540px"><p>Keep these facts</p><img data-ppt-image-slot="hero" style="position:absolute;left:520px;top:120px;width:380px;height:300px;object-fit:contain"></div>' },
    { id: 1, content: '<div class="slide">Other slide</div>' },
] });

test('image insertion preserves geometry, text and other slides; serialized history restores', () => {
    const original = fixture();
    const revised = insertImage(original, 0, 'hero', source, 'Factory illustration');
    const $ = cheerio.load(revised.steps[0].content);
    assert.equal($('p').text(), 'Keep these facts');
    assert.equal($('img').attr('src'), source);
    assert.equal($('img').attr('style'), imageSlot(original, 0, 'hero').slot.attr('style'));
    assert.equal(revised.steps[1], original.steps[1]);
    assert.equal(revised.finalHtml, '');
    assert.equal(revisePresentation(JSON.parse(JSON.stringify(revised)), 0, null, true).steps[0].content, original.steps[0].content);
});

test('missing, duplicate and out-of-bounds slots fail before generation', () => {
    assert.throws(() => imageSlot(fixture(), 0, 'missing'));
    const bad = fixture();
    bad.steps[0].content = bad.steps[0].content.replace('left:520px', 'left:900px');
    assert.throws(() => imageSlot(bad, 0, 'hero'), /fit inside/);
    assert.throws(() => insertImage(fixture(), 0, 'hero', 'https://temporary/image.png', 'Test'), /persistent/);
});

test('confirmed requests generate once, persist before insertion and never submit deck or references', async () => {
    let calls = 0;
    const handler = createPptImageHandler({ generate: async options => {
        calls++;
        assert.deepEqual(options.referenceImages, []);
        assert.equal(options.allowSizeRetry, false);
        assert.doesNotMatch(options.prompt, /Keep these facts/);
        return { observation: source, generatedFile: { filePath: 'saved.png' } };
    }, extractSource: value => value });
    const body = { data: fixture(), slideId: 0, slotId: 'hero', prompt: 'Factory', requestId: 'test-request-000001', confirmed: true };
    async function invoke(value) {
        const res = { code: 200, status(code) { this.code = code; return this; }, json(value) { this.value = value; } };
        await handler({ body: value }, res);
        return res;
    }
    assert.equal((await invoke({ ...body, confirmed: false })).code, 400);
    const [a, b] = await Promise.all([invoke(body), invoke(body)]);
    assert.equal(calls, 1);
    assert.equal(a.code, 200);
    assert.deepEqual(a.value, b.value);
    assert.equal((await invoke({ ...body, prompt: 'Different' })).code, 409);
});

test('uncertain failures are retained and not resubmitted', async () => {
    let calls = 0;
    const handler = createPptImageHandler({ generate: async () => { calls++; throw new Error('Timeout'); }, extractSource: value => value });
    const req = { body: { data: fixture(), slideId: 0, slotId: 'hero', prompt: 'Factory', requestId: 'test-request-000002', confirmed: true } };
    for (let i = 0; i < 2; i++) {
        const res = { status(code) { assert.equal(code, 500); return this; }, json(value) { assert.match(value.error, /Timeout/); } };
        await handler(req, res);
    }
    assert.equal(calls, 1);
});

test('prepareSlideImageSlotHtml adds/normalizes right-side slot and removeSlideImageSlotHtml cleans empty slots', () => {
    const plainSlide = '<div class="slide" style="width:960px;height:540px"><div class="p-16"><h1 class="text-5xl">Title</h1><div class="grid grid-cols-4 gap-4"><p>Body text</p></div></div></div>';
    const prepared = prepareSlideImageSlotHtml(plainSlide, { slotId: 'hero', alt: 'Demo graphic' });
    assert.equal(prepared.hasSlot, true);
    const dom = cheerio.load(prepared.html, null, false);
    const rootStyle = dom('.slide').attr('style') || '';
    assert.match(rootStyle, /position\s*:\s*relative/i);
    assert.equal(dom('img[data-ppt-image-slot="hero"]').length, 1);
    assert.match(dom('.p-16').attr('style') || '', /padding-right\s*:\s*(?:420|460)px/i);
    assert.equal(dom('.p-16 h1').hasClass('text-3xl'), true);
    assert.equal(dom('.p-16 .grid').hasClass('grid-cols-2'), true);

    const cleaned = removeSlideImageSlotHtml(prepared.html, 'hero');
    const cleanDom = cheerio.load(cleaned, null, false);
    assert.equal(cleanDom('img[data-ppt-image-slot="hero"]').length, 0);

    const insetSlide = `<div class="slide relative bg-white" style="width:960px;height:540px;position:relative;"><div class="absolute inset-0 p-16 overflow-hidden flex flex-col"><h2>禁忌、窥视与欲望的安全释放</h2><p>正文内容说明</p></div></div>`;
    const insetPrepared = prepareSlideImageSlotHtml(insetSlide, { slotId: 'hero', alt: 'Safe overlay test' });
    const insetDom = cheerio.load(insetPrepared.html, null, false);
    assert.match(insetDom('.inset-0').attr('style') || '', /padding-right\s*:\s*460px/i);
    assert.match(insetDom('img[data-ppt-image-slot="hero"]').attr('style') || '', /top:\s*145px/i);
});

test('searchPptImageAsDataUri parses Bing async candidates and downloads persistent image data URI', async () => {
    const bingHtml = `<a m='{"murl":"https://img.example.com/photo.png","turl":"https://ts.example.com/thumb.jpg"}'></a>`;
    const fakeHttpClient = {
        async get(url) {
            if (url.includes('cn.bing.com/images/async')) {
                return { status: 200, data: bingHtml };
            }
            return { status: 404, data: {} };
        },
    };
    const res = await searchPptImageAsDataUri({
        query: 'cinema camera',
        httpClient: fakeHttpClient,
        downloadImage: async (targetUrl) => {
            assert.equal(targetUrl, 'https://img.example.com/photo.png');
            return source;
        },
    });
    assert.equal(res.mode, 'search');
    assert.equal(res.source, source);
    assert.equal(res.sourceUrl, 'https://img.example.com/photo.png');
});

test('createPptImageHandler supports search mode with autoPrepareSlot and preserves undo to original slide', async () => {
    const noSlotDeck = {
        status: 'completed',
        steps: [
            { id: 0, title: 'Slide One', content: '<div class="slide" style="width:960px;height:540px"><div class="p-16"><p>Original content</p></div></div>', thinking: 'Design note' },
        ],
    };
    const handler = createPptImageHandler({
        generate: async () => { throw new Error('Should not invoke paid drawing in search mode'); },
        extractSource: value => value,
        searchImage: async ({ query }) => {
            assert.equal(query, 'cyberpunk city');
            return { source, sourceUrl: 'https://img.example.com/city.png', mode: 'search' };
        },
    });
    const res = { code: 200, status(code) { this.code = code; return this; }, json(value) { this.value = value; } };
    await handler({
        body: {
            data: noSlotDeck,
            slideId: 0,
            slotId: 'hero',
            prompt: 'cyberpunk city',
            requestId: 'search-request-000001',
            confirmed: true,
            mode: 'search',
            autoPrepareSlot: true,
        },
    }, res);

    assert.equal(res.code, 200);
    assert.equal(res.value.mode, 'search');
    const updatedStep = res.value.pptData.steps[0];
    assert.equal(updatedStep.imageStatus, 'completed');
    assert.equal(updatedStep.imageMode, 'search');
    const $ = cheerio.load(updatedStep.content, null, false);
    assert.equal($('img[data-ppt-image-slot="hero"]').attr('src'), source);
    assert.equal($('p').text(), 'Original content');

    const restored = revisePresentation(res.value.pptData, 0, null, true);
    assert.equal(restored.steps[0].content, noSlotDeck.steps[0].content);
});
