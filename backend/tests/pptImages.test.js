const { test } = require('node:test');
const assert = require('node:assert/strict');
const cheerio = require('cheerio');
const { imageSlot, insertImage, createPptImageHandler } = require('../services/pptImages');
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
