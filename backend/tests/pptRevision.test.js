const { test } = require('node:test');
const assert = require('node:assert/strict');
const { revisePresentation, revisionPrompt } = require('../services/pptRevision');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture() {
    return { status: 'completed', pptTitle: 'Report', theme: 'Navy and teal', finalHtml: 'old document', steps: [
        { id: 0, content: '<div class="slide">Original</div>', thinking: 'Original design' },
        { id: 1, content: '<div class="slide">Unchanged</div>' },
        { title: 'Complete', content: '' },
    ] };
}

test('revision changes only selected slide and clears stale export HTML', () => {
    const original = fixture();
    const result = revisePresentation(original, 0, { content: '<div class="slide">Revised</div>' });
    assert.equal(result.steps[1], original.steps[1]);
    assert.equal(result.steps[2], original.steps[2]);
    assert.equal(result.theme, original.theme);
    assert.equal(result.finalHtml, '');
    assert.equal(result.revision, 1);
    assert.match(original.steps[0].content, /Original/);
    const restored = revisePresentation(JSON.parse(JSON.stringify(result)), 0, null, true);
    assert.equal(restored.steps[0].content, original.steps[0].content);
    assert.equal(restored.steps[0].thinking, 'Original design');
    assert.equal(restored.steps[0].revisions.length, 0);
});

test('revision history is bounded and survives serialization', () => {
    let data = fixture();
    for (let i = 0; i < 12; i++) data = revisePresentation(data, 0, { content: `<div class="slide">${i}</div>` });
    assert.equal(data.steps[0].revisions.length, 10);
    data = JSON.parse(JSON.stringify(data));
    assert.match(revisePresentation(data, 0, null, true).steps[0].content, />10</);
});

test('invalid output and invalid revision targets fail without changing the deck', () => {
    const data = fixture();
    for (const content of ['', '<p>Not a slide</p>', '<div class="slide"></div><div class="slide"></div>', '<div class="slide"><script>alert(1)</script></div>', '<div class="slide" onclick="bad()">text</div>']) {
        assert.throws(() => revisePresentation(data, 0, { content }));
    }
    assert.throws(() => revisePresentation(data, 99, {}), /not found/);
    assert.throws(() => revisePresentation(data, 0, null, true), /previous/);
    assert.throws(() => revisePresentation({ ...data, status: 'running' }, 0, {}), /completed/);
    assert.equal(data.steps[0].revisions, undefined);
});

test('edit prompt retains shared theme and targets existing slide only', () => {
    const prompt = revisionPrompt(fixture(), 0, 'Use a comparison layout');
    assert.match(prompt, /Navy and teal/);
    assert.match(prompt, /Original/);
    assert.match(prompt, /comparison layout/);
    assert.doesNotMatch(prompt, /Unchanged/);
});

test('revision endpoint uses configured model, supports restore without generation, and reports failures', async () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const route = source.slice(source.indexOf("app.post('/api/ppt/revise'"), source.indexOf("app.post('/api/ppt/download-images'"));
    let handler;
    let calls = 0;
    let fail = false;
    vm.runInNewContext(route, {
        app: { post: (_url, callback) => { handler = callback; } },
        normalizeChatProviderId: value => value,
        isChatProviderEnabled: () => true,
        revisionPrompt, revisePresentation,
        callLLM: async (provider, model) => {
            calls++;
            assert.equal(provider, 'ollama');
            assert.equal(model, 'test-model');
            if (fail) throw new Error('Model unavailable');
            return '<div class="slide">Updated</div>';
        },
        parsePptSlideResponse: html => ({ html, thinking: 'Updated layout' }),
        console: { error() {} },
    });

    test('UI revision waits for persistence and rolls back on save failure', async () => {
        const source = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', 'App.jsx'), 'utf8');
        const handlerSource = source.slice(source.indexOf('  const handleRevisePpt ='), source.indexOf('  const handleUpdateMessageText ='));
        for (const failSave of [false, true]) {
            const original = { id: 'message', pptData: fixture(), generatedFiles: ['old.pptx'] };
            const messages = { current: [original] };
            let saved;
            const context = {
                currentChatIdRef: { current: 'chat' }, runningRef: { current: null }, latestMessagesRef: messages,
                getLocalText: (_zh, en) => en, BACKEND_URL: 'http://localhost', config: {}, currentPendingRequest: null,
                axios: { post: async () => ({ data: { pptData: revisePresentation(original.pptData, 0, { content: '<div class="slide">New</div>' }) } }) },
                setMessages: () => {},
                persistChatState: async (id, nextMessages) => {
                    assert.equal(id, 'chat');
                    if (failSave) throw new Error('Disk full');
                    saved = JSON.parse(JSON.stringify(nextMessages));
                },
            };
            vm.createContext(context);
            vm.runInContext(`${handlerSource}\nthis.revise = handleRevisePpt;`, context);
            if (failSave) {
                await assert.rejects(context.revise('message', 0, 'Simplify'), /Disk full/);
                assert.equal(messages.current[0], original);
            } else {
                await context.revise('message', 0, 'Simplify');
                assert.match(saved[0].pptData.steps[0].content, /New/);
                assert.equal(saved[0].generatedFiles.length, 0);
                assert.equal(revisePresentation(saved[0].pptData, 0, null, true).steps[0].content, original.pptData.steps[0].content);
            }
        }
    });
    const invoke = async body => {
        const response = { code: 200, status(code) { this.code = code; return this; }, json(value) { this.value = value; } };
        await handler({ body }, response);
        return response;
    };
    const request = { data: fixture(), slideId: 0, instruction: 'Simplify', config: { provider: 'ollama', model: 'test-model' } };
    const edited = await invoke(request);
    assert.equal(edited.code, 200);
    assert.match(edited.value.pptData.steps[0].content, /Updated/);
    const restored = await invoke({ data: edited.value.pptData, slideId: 0, restore: true });
    assert.equal(restored.code, 200);
    assert.match(restored.value.pptData.steps[0].content, /Original/);
    assert.equal(calls, 1);
    assert.equal((await invoke({ ...request, instruction: '' })).code, 400);
    fail = true;
    const failed = await invoke(request);
    assert.equal(failed.code, 500);
    assert.equal(failed.value.error, 'Model unavailable');
});
