const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createVideoCallReply, createCameraBridge, routeDialogue, filterExpressions } = require('../services/videoCall');
const { componentSpec } = require('../services/videoCallComponents');

class Response extends EventEmitter {
    constructor() { super(); this.output = ''; this.destroyed = false; this.writableEnded = false; }
    setHeader() {}
    flushHeaders() { this.headersSent = true; }
    write(value) { this.output += value; return true; }
    end(value = '') { this.output += value; this.writableEnded = true; }
    status(code) { this.statusCode = code; return this; }
    json(value) { this.body = value; this.writableEnded = true; }
    sendStatus(code) { this.statusCode = code; }
    events() { return this.output.split('\n').filter(line => line.startsWith('data: {')).map(line => JSON.parse(line.slice(6))); }
}

async function reply({ outputs = [], body = {}, runAgent, quickSearch, cameraBridge, onCall } = {}) {
    const calls = [];
    const handler = createVideoCallReply({
        normalizeProvider: value => value, providerEnabled: () => true,
        callLLM: async (...args) => {
            calls.push(args);
            await onCall?.(args, calls.length);
            const output = outputs.shift();
            for (const chunk of Array.isArray(output) ? output : [output || '']) args[5]?.(chunk);
            return Array.isArray(output) ? output.join('') : output;
        },
        runAgent: runAgent || (() => { throw new Error('Unexpected escalation'); }),
        quickSearch: quickSearch || (() => { throw new Error('Unexpected search'); }),
        cameraBridge: cameraBridge || { request: () => { throw new Error('Unexpected camera capture'); } },
    });
    const response = new Response();
    await handler({ body: { message: '请帮我', config: { provider: 'custom', model: 'selected-model', ollamaUrl: 'local-url' }, ...body } }, response);
    return { calls, response, events: response.events() };
}

test('selected provider/model survive split routing and search-to-component light agent work', async () => {
    const { calls, events } = await reply({
        outputs: [['  ', '[[SEA', 'RCH]]', '天气'], ['[[SHOW]]', JSON.stringify({ type: 'table', title: '天气', columns: ['城市'], rows: [['上海']] })]],
        body: { files: [{ name: 'note.txt', content: '用户共享的限制' }] },
        quickSearch: async query => { assert.equal(query, '天气'); return '今天晴天'; },
    });
    assert.equal(calls.length, 2);
    for (const [provider, model, url, _messages, config] of calls) {
        assert.deepEqual([provider, model, url], ['custom', 'selected-model', 'local-url']);
        assert.ok(config.systemPrompt.length < 550, 'Lightweight routing prompt must stay below 550 characters');
    }
    assert.match(calls[1][3][0].content, /用户共享的限制/);
    assert.match(calls[1][3].at(-1).content, /今天晴天/);
    assert.equal(events.find(event => event.component)?.component.type, 'table');
    assert.ok(!events.some(event => event.text?.includes('[[')));
});

test('camera captures only on demand and escalates with evidence', async () => {
    let captures = 0;
    let agentOptions;
    const frame = 'data:image/jpeg;base64,YQ==';
    const { calls, events } = await reply({
        body: { cameraEnabled: true },
        outputs: ['[[CAMERA]]', '一只猫', '[[AGENT]]'],
        cameraBridge: { request: async () => { captures++; return frame; } },
        runAgent: async (stream, options) => { agentOptions = options; stream.write('data: {"text":"已完成"}\n\n'); },
    });
    assert.equal(captures, 1);
    assert.equal(calls[1][3][0].content[1].image_url.url, frame);
    assert.match(agentOptions.context, /一只猫/);
    assert.equal(agentOptions.model, 'selected-model');
    assert.equal(typeof agentOptions.callTools.viewCallCamera, 'function');
    assert.equal(events.at(-1).text, '已完成');
    await reply({ body: { cameraEnabled: true }, outputs: ['你好'], cameraBridge: { request: () => { throw new Error('Idle capture'); } } });
});

test('complex agent receives validated component/camera tools and forwards generated artifacts', async () => {
    const { events } = await reply({ outputs: ['[[AGENT]]'], runAgent: async (stream, options) => {
        assert.equal(options.callTools.viewCallCamera, undefined);
        assert.match(await options.callTools.showCallComponent(['not json']), /Invalid/);
        assert.equal(await options.callTools.showCallComponent([JSON.stringify({ type: 'document', title: '摘要', body: '内容' })]), 'Component shown.');
        assert.equal(await options.callTools.closeCallComponent(), 'Component closed.');
        stream.write('data: {"generatedFile":{"filePath":"report.docx"}}\n\n');
        stream.write('data: {"approvalRequest":{"id":"approval"}}\n\n');
    } });
    assert.equal(events.find(event => event.component)?.component.type, 'document');
    assert.ok(events.some(event => event.closeComponent));
    assert.equal(events.find(event => event.generatedFile)?.generatedFile.filePath, 'report.docx');
    assert.match(events.at(-1).text, /需要你的确认/);
});

test('bounded repeated tools upgrade with accumulated search evidence', async () => {
    let searches = 0;
    let options;
    await reply({ outputs: Array(4).fill('[[SEARCH]]继续'), quickSearch: async () => `证据${++searches}`,
        runAgent: async (stream, value) => { options = value; stream.write('data: {"text":"完成"}\n\n'); } });
    assert.equal(searches, 3);
    assert.match(options.context, /证据1/);
    assert.match(options.context, /证据3/);
});

test('search errors are supplied as observations so the model can respond honestly', async () => {
    const { calls, events } = await reply({ outputs: ['[[SEARCH]]天气', '现在无法核实天气。'] });
    assert.match(calls[1][3].at(-1).content, /搜索暂时失败/);
    assert.equal(events.at(-1).text, '现在无法核实天气。');
});

test('provider search markup never reaches the call transcript, even when streamed character by character', async () => {
    const tagged = '让我查一下。<tool_call>search(query:<arg_value>英伟达 黄仁勋 CEO</arg_value>)'
        + '<toolcall>search(query:<arg_value>NVIDIA Jensen Huang CEO</arg_value>)';
    let searches = 0;
    const { events } = await reply({
        outputs: [[...tagged], '我找到了可靠来源。'],
        quickSearch: async query => {
            searches++;
            assert.equal(query, '英伟达 黄仁勋 CEO');
            return '官网证据';
        },
    });
    assert.equal(searches, 1);
    assert.equal(events.filter(event => event.text).map(event => event.text).join(''), '让我查一下。我找到了可靠来源。');
    assert.ok(events.some(event => event.action?.type === 'search'));
});

test('an unavailable search ends with a spoken limitation even if the provider emits another tool request', async () => {
    let searches = 0;
    const { calls, events } = await reply({
        body: { language: 'en-US' },
        outputs: ['[[SEARCH]]recent news', 'Let me check again.<tool_call>search(query:<arg_value>other news</arg_value>)'],
        quickSearch: async () => { searches++; throw new Error('rate limited'); },
    });
    assert.equal(searches, 1);
    assert.equal(calls.length, 2);
    assert.ok(events.some(event => event.action?.status === 'error'));
    assert.equal(events.filter(event => event.text).map(event => event.text).join(''),
        "Web search is unavailable right now, so I couldn't verify that.");
});

test('camera bridge rejects invalid frames, accepts once, and cleans up aborted requests', async () => {
    const bridge = createCameraBridge();
    const response = new Response();
    const controller = new AbortController();
    const pending = bridge.request(response, controller.signal);
    const token = response.events()[0].cameraRequest;
    const receipt = new Response();
    bridge.receive({ body: { token, image: 'https://not-a-camera' } }, receipt);
    assert.equal(receipt.statusCode, 400);
    bridge.receive({ body: { token, image: 'data:image/jpeg;base64,YQ==' } }, receipt);
    assert.equal(await pending, 'data:image/jpeg;base64,YQ==');
    bridge.receive({ body: { token, image: null } }, receipt);
    assert.equal(receipt.statusCode, 404);
    const cancelled = bridge.request(response, controller.signal);
    const cancelledToken = response.events().at(-1).cameraRequest;
    controller.abort();
    assert.equal(await cancelled, null);
    bridge.receive({ body: { token: cancelledToken } }, receipt);
    assert.equal(receipt.statusCode, 404);
});

test('a call opened from a chat continues that chat history', async () => {
    const history = Array.from({ length: 12 }, (_, index) => ({
        role: index % 2 ? 'assistant' : 'user', content: `上下文${index}`,
    }));
    const { calls } = await reply({ body: { history }, outputs: ['好的呀'] });
    const prompt = calls[0][3];
    assert.equal(prompt.at(0).content, '上下文0', 'the oldest kept turn must still reach the model');
    assert.equal(prompt.at(-1).content, '请帮我');
    assert.equal(prompt.filter(turn => turn.role === 'user').length, 7);
});

test('a display JSON without the SHOW marker renders a panel instead of raw text', async () => {
    const spec = { type: 'layout', side: 'left', left: { title: '一段文字', body: '夜里下了点雨。\n第二段。' }, speech: '挪到左边了。' };
    for (const draft of [JSON.stringify(spec), `先放在这里。\n\n${JSON.stringify(spec)}`]) {
        const { calls, events } = await reply({ outputs: [draft] });
        assert.equal(calls.length, 1, 'no repair round is needed for a complete object');
        const component = events.find(event => event.component)?.component;
        assert.equal(component.type, 'layout');
        assert.equal(component.left.type, 'content');
        assert.match(component.left.blocks[0].body, /夜里下了点雨/);
        const text = events.filter(event => typeof event.text === 'string').map(event => event.text).join('');
        assert.ok(!text.includes('"type":"layout"'), text);
        assert.ok(!text.includes('夜里下了点雨'), 'the panel body must not be read aloud as a caption');
        assert.match(text, /挪到左边了/);
        if (draft.startsWith('先放在')) assert.match(text, /先放在这里/);
    }
});

test('plain prose containing braces stays dialogue', async () => {
    const { events } = await reply({ outputs: ['代码里的 {value} 只是一个占位符。'] });
    assert.equal(events.some(event => event.component), false);
    assert.equal(events.filter(event => typeof event.text === 'string').map(event => event.text).join(''), '代码里的 {value} 只是一个占位符。');
});

test('an unfinished display JSON is released as text rather than hanging the reply', async () => {
    const { events } = await reply({ outputs: ['{"type":"layout","left":{"body":"半截'] });
    assert.equal(events.some(event => event.component), false);
    assert.match(events.filter(event => typeof event.text === 'string').map(event => event.text).join(''), /半截/);
});

test('mirrored tool activity never echoes the component JSON as its argument', async () => {
    const { events } = await reply({ outputs: [JSON.stringify({ type: 'layout', left: { title: '一段文字', body: '正文' }, speech: '放左边了' })] });
    const action = events.find(event => event.action)?.action;
    assert.equal(action.type, 'showCallComponent');
    assert.deepEqual(action.args, ['一段文字']);
    const spoken = events.filter(event => typeof event.text === 'string').map(event => event.text).join('');
    assert.ok(!spoken.includes('{'), 'raw JSON must not be spoken or shown as caption text');
    assert.match(events.find(event => event.observation).observation, /一段文字/);
});

test('call history drops expression tags and keeps only real speakers', async () => {
    const { calls } = await reply({ outputs: ['好的'], body: { history: [
        { role: 'user', content: '看看这个' },
        { role: 'assistant', content: '[expression:happy.png]没问题' },
        { role: 'system', content: '不该出现的系统提示' },
        { role: 'user', content: '谢谢' },
    ] } });
    const prompt = calls[0][3];
    assert.deepEqual(prompt.slice(0, 3).map(turn => turn.content), ['看看这个', '没问题', '谢谢']);
    assert.ok(!prompt.some(turn => String(turn.content).includes('不该出现')));
});

test('response disconnect cancels upstream without starting tools', async () => {

    let upstreamSignal;
    const response = new Response();
    const handler = createVideoCallReply({ normalizeProvider: value => value, providerEnabled: () => true,
        callLLM: async (_provider, _model, _url, _messages, config) => {
            upstreamSignal = config.abortSignal;
            response.destroyed = true;
            response.emit('close');
            return '[[CAMERA]]';
        }, cameraBridge: { request: () => { throw new Error('Capture after disconnect'); } } });
    await handler({ body: { message: '看看', cameraEnabled: true } }, response);
    assert.equal(upstreamSignal.aborted, true);
});

test('stream filters handle split legacy tags and split directives without leakage', () => {
    let text = '', directive, payload = '';
    const clean = filterExpressions(value => { text += value; });
    for (const value of ['你', '[expre', 'ssion:wave.png]', '好']) clean(value);
    clean('', true);
    assert.equal(text, '你好');
    const route = routeDialogue(value => { text += value; }, value => { directive = value; }, value => { payload += value; });
    for (const value of [' ', '[[SH', 'OW]]', '{"type":"choice"}']) route(value);
    route('', true);
    assert.equal(directive, 'SHOW');
    assert.equal(payload, '{"type":"choice"}');
    assert.equal(text, '你好');
});

test('real model search reply routes SHOW after spoken preface without leaking JSON across every split', async () => {
    const spec = { type: 'table', title: '官网', columns: ['网站'], rows: [['https://example.com']] };
    const preface = '找到啦，官网就在这儿：\n\n';
    const answer = `${preface}[[SHOW]] ${JSON.stringify(spec)}`;
    for (let split = 0; split <= answer.length; split++) {
        const { events } = await reply({ outputs: ['[[SEARCH]]官网', [answer.slice(0, split), answer.slice(split)]], quickSearch: async () => '官网证据' });
        assert.equal(events.find(event => event.component)?.component.title, '官网', `split ${split}`);
        const spoken = events.map(event => event.text || '').join('');
        assert.equal(spoken, `${preface}我放到旁边给你看。`, `split ${split}`);
        assert.ok(!spoken.includes('[[') && !spoken.includes('"type"'));
    }
});

test('continuous directive scanning preserves ordinary brackets and chooses the earliest tool', () => {
    let spoken = '', directive, payload = '';
    const route = routeDialogue(value => { spoken += value; }, value => { directive = value; }, value => { payload += value; });
    for (const value of ['普通 [', '内容] 和 [', '[不是指令]]。', '\n[[SEA', 'RCH]] query [[SHOW]]']) route(value);
    route('', true);
    assert.equal(spoken, '普通 [内容] 和 [[不是指令]]。\n');
    assert.equal(directive, 'SEARCH');
    assert.equal(payload, ' query [[SHOW]]');
});

test('plain text aliases and unknown semantic types normalize with useful default titles', () => {
    for (const type of [undefined, 'text', 'content', 'note', 'code']) {
        for (const key of ['body', 'content', 'text']) {
            assert.deepEqual(componentSpec({ ...(type && { type }), [key]: '你好 <b>world</b>' }), {
                type: 'content', title: '分享内容', body: '', blocks: [{ type: 'text', body: '你好 <b>world</b>' }], side: 'right', keepOther: false,
            });
        }
    }
    assert.deepEqual(componentSpec({ type: 'markdown', text: '**重点**' }).blocks, [{ type: 'markdown', body: '**重点**' }]);
    assert.equal(componentSpec({ type: 'table', columns: ['城市'], rows: [['上海']] }).title, '表格');
    assert.equal(componentSpec({ type: 'unknown', content: {} }), null);
    assert.equal(componentSpec(null), null);
    assert.equal(componentSpec([]), null);
});

test('mixed blocks retain text, markdown, legacy components and bounded nested groups', () => {
    const mixed = componentSpec({ title: '今日安排', body: '开场', blocks: [
        '普通文字', { type: 'markdown', content: '- **要点**' },
        { type: 'choice', options: ['继续', '休息'] },
        { type: 'table', columns: ['时间'], rows: [['下午']] },
        { type: 'question', fields: ['你的想法'] },
        { type: 'slides', slides: [{ bullets: ['说明'] }] },
        { type: 'document', body: '旧文档' },
        { type: 'image', url: 'https://example.com/a.png' },
        { type: 'content', blocks: [{ type: 'summary', text: '嵌套总结' }] },
        null, { type: 'html', body: '<script>alert(1)</script>' },
    ] });
    assert.equal(mixed.type, 'content');
    assert.equal(mixed.title, '今日安排');
    assert.deepEqual(mixed.blocks.map(block => block.type), ['text', 'text', 'markdown', 'choice', 'table', 'question', 'slides', 'document', 'image', 'content']);
    assert.equal(mixed.blocks.at(-1).blocks[0].body, '嵌套总结');
    assert.equal(mixed.blocks[7].body, '旧文档');
});

test('content limits depth, width, total characters and rejects executable component types', () => {
    for (const type of ['html', 'javascript', 'JS', 'script', 'iframe', 'svg']) {
        assert.equal(componentSpec({ type, body: 'alert(1)' }), null);
    }
    const deep = { blocks: [] };
    deep.blocks.push(deep);
    assert.equal(componentSpec(deep), null, 'Cyclic and over-deep empty groups are dropped');
    const nested = componentSpec({ blocks: [{ blocks: [{ blocks: [{ blocks: [{ text: 'too deep' }], text: 'depth three' }] }] }] });
    assert.deepEqual(nested.blocks[0].blocks[0].blocks[0].blocks, [{ type: 'text', body: 'depth three' }]);
    assert.equal(componentSpec({ blocks: Array(100).fill('短文') }).blocks.length, 24);
    const bounded = componentSpec({ title: '题'.repeat(500), blocks: Array(24).fill({ body: '文'.repeat(10000) }) });
    const count = value => typeof value === 'string' ? value.length : Array.isArray(value)
        ? value.reduce((sum, item) => sum + count(item), 0) : value && typeof value === 'object'
            ? Object.entries(value).filter(([key]) => key !== 'type').reduce((sum, [, item]) => sum + count(item), 0) : 0;
    assert.equal(bounded.title.length, 120);
    assert.equal(bounded.blocks[0].body.length, 3500);
    assert.ok(count(bounded) <= 16000);
    let nodes = 0;
    const wide = componentSpec({ blocks: Array(24).fill({ blocks: Array(24).fill({ type: 'question', fields: ['?'] }) }) });
    const visit = value => { nodes++; for (const child of value.blocks || []) visit(child); };
    visit(wide);
    assert.ok(nodes <= 48);
    assert.equal(componentSpec({ type: 'image', url: 'data:image/svg+xml,<svg/>' }), null);
    assert.equal(componentSpec({ type: 'text', body: { html: '<script/>' } }), null);
});

test('SHOW supports omitted type and distinct speech; ordinary replies can omit the panel', async () => {
    const { calls, events } = await reply({ body: { cameraEnabled: true, componentTitle: '已有面板' },
        outputs: [`[[SHOW]]${JSON.stringify({ text: '右侧详细内容', speech: '我挑了几个要点。' })}`] });
    assert.equal(events.find(event => event.component).component.blocks[0].body, '右侧详细内容');
    assert.equal(events.filter(event => event.text).map(event => event.text).join(''), '我挑了几个要点。');
    assert.ok(calls[0][4].systemPrompt.length < 550);
    assert.match(calls[0][4].systemPrompt, /自主决定.*左右布局/);
    assert.match(calls[0][4].systemPrompt, /不必每次/);
    const ordinary = await reply({ outputs: ['只用语音回答就好。'] });
    assert.equal(ordinary.events.some(event => event.component), false);
});

test('complex agent can show mixed content through the same normalized boundary', async () => {
    const { events } = await reply({ outputs: ['[[AGENT]]'], runAgent: async (stream, options) => {
        assert.equal(await options.callTools.showCallComponent([JSON.stringify({ blocks: [
            { type: 'markdown', body: '**摘要**' }, { type: 'choice', options: ['继续'] },
        ] })]), 'Component shown.');
        assert.match(await options.callTools.showCallComponent([JSON.stringify({ type: 'html', body: '<b>bad</b>' })]), /invalid/);
        stream.write('data: {"text":"已放到右侧。"}\n\n');
    } });
    assert.deepEqual(events.find(event => event.component).component.blocks.map(block => block.type), ['markdown', 'choice']);
    assert.equal(events.filter(event => event.component).length, 1);
});

test('placement defaults right and normalizes explicit single-side updates', () => {
    for (const [side, expected] of [[undefined, 'right'], ['left', 'left'], ['right', 'right'], ['both', 'right']]) {
        const spec = componentSpec({ text: '内容', side, keepOther: true });
        assert.equal(spec.side, expected);
        assert.equal(spec.keepOther, true);
    }
    assert.equal(componentSpec({ text: '替换', keepOther: 'true' }).keepOther, false);
});

test('layout normalizes each side with shared limits and drops invalid sides', () => {
    const spec = componentSpec({ type: 'layout', left: { type: 'markdown', text: '**左**' },
        right: { blocks: ['右', { type: 'table', columns: ['列'], rows: [['值']] }] } });
    assert.equal(spec.type, 'layout');
    assert.equal(spec.keepOther, false);
    assert.equal(spec.left.blocks[0].type, 'markdown');
    assert.equal(spec.right.blocks[1].type, 'table');
    assert.equal(spec.left.side, undefined);
    assert.equal(componentSpec({ type: 'layout', left: { type: 'html', body: '<script/>' } }), null);
    const oneSide = componentSpec({ type: 'layout', left: { type: 'html', body: 'bad' }, right: { body: 'ok' }, keepOther: true });
    assert.equal(oneSide.left, undefined);
    assert.equal(oneSide.right.blocks[0].body, 'ok');
    assert.equal(oneSide.keepOther, true);
    const large = { blocks: Array(24).fill({ body: '文'.repeat(3500) }) };
    const bounded = componentSpec({ type: 'layout', left: large, right: large });
    const characters = value => typeof value === 'string' ? value.length : value && typeof value === 'object'
        ? Object.entries(value).filter(([key]) => key !== 'type').reduce((sum, [, child]) => sum + characters(child), 0) : 0;
    assert.ok(characters(bounded) <= 16000, 'Both sides must share a single character budget');
    let nodes = 0;
    const visit = value => { if (!value) return; nodes++; for (const child of value.blocks || []) visit(child); if (value.left) visit(value.left); if (value.right) visit(value.right); };
    const wide = { blocks: Array(24).fill({ blocks: Array(24).fill('块') }) };
    visit(componentSpec({ type: 'layout', left: wide, right: wide }));
    assert.ok(nodes <= 48, 'Both sides must share a single node budget');
});

test('SHOW streams a single layout event with outer id and per-side normalized content', async () => {
    const { events } = await reply({ outputs: [`[[SHOW]]${JSON.stringify({ type: 'layout', left: { body: '左' }, right: { text: '右' }, speech: '两边都有。' })}`] });
    const components = events.filter(event => event.component);
    assert.equal(components.length, 1);
    assert.equal(components[0].component.type, 'layout');
    assert.ok(components[0].component.id);
    assert.equal(components[0].component.left.id, undefined);
    assert.equal(events.at(-1).text, '两边都有。');
});

test('CLOSE consumes split side targets and rejects unknown targets without closing', async () => {
    for (const [target, expected] of [['', true], ['all', true], ['left', 'left'], ['right', 'right']]) {
        const { calls, events } = await reply({ outputs: [['[[CLO', 'SE]]', target.slice(0, 1), target.slice(1)]] });
        assert.equal(events.find(event => event.closeComponent)?.closeComponent, expected);
        assert.equal(calls[0][4].abortSignal.aborted, false, 'CLOSE must finish collecting its target');
    }
    const { events } = await reply({ outputs: ['[[CLOSE]]wrong'] });
    assert.equal(events.some(event => event.closeComponent), false);
});

test('complex agent can place layouts and close individual sides through tools', async () => {
    const { events } = await reply({ outputs: ['[[AGENT]]'], runAgent: async (stream, options) => {
        const tools = options.callTools;
        assert.equal(await tools.showCallComponent([JSON.stringify({ type: 'layout', left: { body: '左' }, right: { text: '右' } })]), 'Component shown.');
        assert.equal(await tools.showCallComponent([JSON.stringify({ side: 'left', keepOther: true, text: '更新' })]), 'Component shown.');
        assert.equal(await tools.closeCallComponent(['right']), 'Component closed.');
        assert.match(await tools.closeCallComponent(['wrong']), /Invalid target/);
        assert.equal(await tools.closeCallComponent(['all']), 'Component closed.');
        stream.write('data: {"text":"完成。"}\n\n');
    } });
    assert.equal(events.filter(event => event.component)[0].component.type, 'layout');
    assert.equal(events.filter(event => event.component)[1].component.keepOther, true);
    assert.deepEqual(events.filter(event => event.closeComponent).map(event => event.closeComponent), ['right', true]);
});

test('SHOW accepts a complete JSON object followed by real-model dialogue without retrying', async () => {
    const spec = { body: '提醒：{休息}，引号"与反斜线\\', speech: '休息一下。' };
    for (const draft of [JSON.stringify(spec) + '\n\n记得休息，别一直坐着。', '```json\n' + JSON.stringify(spec) + '\n```\n额外口述']) {
        const { calls, events } = await reply({ outputs: [`[[SHOW]]${draft}`] });
        assert.equal(calls.length, 1);
        assert.equal(events.find(event => event.component).component.blocks[0].body, spec.body);
        assert.equal(events.filter(event => event.text).map(event => event.text).join(''), spec.speech);
    }
});

test('invalid SHOW gets one silent bounded format repair using the selected model and user context', async () => {
    const { calls, events } = await reply({ outputs: ['[[SHOW]]{body: "休息"}', [
        '[[SHOW]]```json\n', JSON.stringify({ type: 'layout', left: { body: '要点' }, right: { body: '休息' }, speech: '两边都有。' }), '\n```解释',
    ]] });
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1].slice(0, 3), ['custom', 'selected-model', 'local-url']);
    assert.match(calls[1][3].at(-1).content, /仅修复为一个合法JSON/);
    assert.equal(events.find(event => event.component).component.type, 'layout');
    assert.equal(events.filter(event => event.text).map(event => event.text).join(''), '两边都有。');
    assert.ok(calls[1][4].systemPrompt.length < 550);
    const failed = await reply({ outputs: ['[[SHOW]]not json', '[[SEARCH]]do not execute'] });
    assert.equal(failed.calls.length, 2, 'Never repair repeatedly or execute a tool from repair output');
    assert.equal(failed.events.some(event => event.component), false);
    assert.match(failed.events.at(-1).text, /没排好/);
});

test('component state and history enter bounded user data and complex-agent context rather than system instructions', async () => {
    const current = { left: { title: '阅读', body: '左' + '状态'.repeat(300) }, right: null };
    const history = [
        { id: 'panel-1-left-show', kind: 'show', side: 'left', at: 1, component: { title: '旧表', blocks: [{ type: 'table', columns: ['列'], rows: [['旧值']] }] } },
        { id: 'panel-2-left-close', kind: 'close', side: 'left', at: 2, component: { title: '旧表' } },
    ];
    let options;
    const { calls } = await reply({ body: { componentState: current, componentHistory: history }, outputs: ['[[AGENT]]'],
        runAgent: async (stream, value) => { options = value; stream.write('data: {"text":"完成"}\n\n'); } });
    const userContent = calls[0][3].at(-1).content;
    assert.match(userContent, /当前展示完整正文/);
    assert.ok(userContent.includes('旧表'), 'Bounded history index must name closed components');
    assert.ok(!calls[0][4].systemPrompt.includes('旧表'));
    assert.ok(options.context.includes('当前展示完整正文'));
    assert.match(options.context, /旧表/);
});

test('recall exposes long history and closed component bodies on demand', async () => {
    const long = '正文'.repeat(1500);
    const { events } = await reply({
        body: {
            history: [{ id: 'msg-1', role: 'user', content: long }],
            componentHistory: [{ id: 'closed-1', kind: 'show', side: 'right', component: { title: '旧方案', body: '旧方案完整内容' } }],
        },
        outputs: [['[[RECALL]]', JSON.stringify({ kind: 'component', query: '旧方案' })], '资料已回忆。'],
    });
    const recall = events.filter(event => event.action);
    assert.equal(recall[0].action.type, 'recallCallContext');
    const observation = events.find(event => event.observation)?.observation || '';
    assert.match(observation, /旧方案完整内容/);
    const byId = await reply({
        body: { history: [{ id: 'msg-1', role: 'user', content: long }] },
        outputs: [['[[RECALL]]', JSON.stringify({ kind: 'history', id: 'msg-1', offset: 0, limit: 100 })], '好。'],
    });
    assert.match(byId.events.find(event => event.observation).observation, /正文正文/);
});

test('component normalization bounds content and rejects executable image URLs', () => {
    assert.equal(componentSpec({ type: 'image', title: '图片', url: 'javascript:alert(1)' }), null);
    assert.equal(componentSpec({ type: 'choice', title: '选择', options: [] }), null);
    assert.equal(componentSpec({ type: 'slides', title: '幻灯片', slides: [null, {}, { title: '有效' }] }).slides.length, 1);
    const table = componentSpec({ type: 'table', title: '表格', columns: ['一', '二'], rows: [[{ bad: true }, false, 'extra'], null] });
    assert.deepEqual(table.rows, [['', 'false']]);
});
