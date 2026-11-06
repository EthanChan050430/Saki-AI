'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { createResponseTextStream } = require('../services/responseTextStream');

let applyTextStreamEvent;
before(async () => {
    ({ applyTextStreamEvent } = await import('../../frontend/src/utils/streamText.js'));
});

function conversation(initialParts = []) {
    let parts = initialParts;
    const events = [];
    const stream = createResponseTextStream(event => {
        // Exercise the JSON wire format and the same reducer as both chat paths.
        const payload = JSON.parse(JSON.stringify(event));
        events.push(payload);
        parts = applyTextStreamEvent(parts, payload);
    });
    return { stream, events, get parts() { return parts; }, get text() { return parts.filter(part => part.type === 'text').map(part => part.content).join(''); } };
}

describe('response text finalization', () => {
    it('renders a streamed multiline reply once when finalized with the complete answer', () => {
        const reply = '你好，今天想聊些什么？😊\n\n我在这里。';
        const state = conversation([{ type: 'reasoning', content: 'Choose a helpful reply.' }]);
        for (let index = 1; index <= reply.length; index += 1) state.stream.update(reply.slice(0, index));
        const eventsBeforeFinal = state.events.length;
        state.stream.update(reply);
        assert.equal(state.text, reply);
        assert.equal(state.events.length, eventsBeforeFinal);
        assert.equal(state.parts.filter(part => part.type === 'text').length, 1);
        assert.equal(state.parts[0].type, 'reasoning');
    });

    it('adds only the unstreamed suffix at the end', () => {
        const state = conversation();
        state.stream.update('HTML 标记 ');
        state.stream.update('HTML 标记 <');
        assert.equal(state.text, 'HTML 标记 <');
        assert.deepEqual(state.events.at(-1), { text: '<' });
    });

    it('sends a native respond result when the provider streamed no text', () => {
        const state = conversation();
        state.stream.update('最终回复');
        assert.equal(state.text, '最终回复');
        assert.deepEqual(state.events, [{ text: '最终回复' }]);
    });

    it('reconciles a quoted final answer instead of appending a second copy', () => {
        const reply = '我在这里。\n\n有什么想聊的都可以告诉我。💕';
        const state = conversation();
        state.stream.update(reply);
        state.stream.update(`"${reply}"`);
        assert.equal(state.text, `"${reply}"`);
        assert.equal(state.parts.length, 1);
    });

    it('replaces a native-call preface with the actual answer', () => {
        const state = conversation();
        state.stream.update('我来看看。');
        state.stream.update('结果已确认，一切正常。');
        assert.equal(state.text, '结果已确认，一切正常。');
    });

    it('keeps earlier tool turns and resumed content when correcting the current turn', () => {
        const action = { type: 'action', data: { type: 'readFile', args: ['notes.txt'] }, observation: 'read' };
        const initial = Object.freeze([
            Object.freeze({ type: 'text', content: '先读取文件。' }), action,
            Object.freeze({ type: 'text', content: '此前已输出的部分。' }),
            Object.freeze({ type: 'reasoning', content: 'Keep reasoning separate.' }),
        ]);
        const state = conversation(initial);
        state.stream.update(' 新的回复 ');
        state.stream.update('新的回复');
        assert.equal(state.text, '先读取文件。此前已输出的部分。新的回复');
        assert.equal(state.parts[1], action);
        assert.equal(state.parts[3].type, 'reasoning');
        assert.equal(initial.length, 4);
        assert.equal(initial[2].content, '此前已输出的部分。');
    });

    it('preserves intentional repeated text in ordinary deltas', () => {
        const state = conversation();
        state.stream.update('哈哈！\n');
        state.stream.update('哈哈！\n哈哈！');
        state.stream.update('哈哈！\n哈哈！');
        assert.equal(state.text, '哈哈！\n哈哈！');
    });

    it('can clear a provisional preview while preserving reasoning', () => {
        const reasoning = { type: 'reasoning', content: 'Internal analysis' };
        const state = conversation([reasoning]);
        state.stream.update('provisional output');
        state.stream.update('');
        assert.deepEqual(state.parts, [reasoning]);
    });

    it('clears deferred steering preview before a fresh model turn appends its answer', () => {
        let parts = [{ type: 'reasoning', content: 'thinking' }];
        const send = event => { parts = applyTextStreamEvent(parts, JSON.parse(JSON.stringify(event))); };
        const oldTurn = createResponseTextStream(send);
        oldTurn.update('superseded answer');
        oldTurn.update('');
        const nextTurn = createResponseTextStream(send);
        nextTurn.update('answer respecting');
        nextTurn.update('answer respecting steering');
        assert.equal(parts.filter(part => part.type === 'text').map(part => part.content).join(''), 'answer respecting steering');
        assert.equal(parts[0].type, 'reasoning');
    });

    it('never removes text from an earlier tool turn when a replacement is too long', () => {
        const original = [{ type: 'text', content: 'Earlier answer' }, { type: 'action', data: { type: 'search' } }, { type: 'text', content: 'preview' }];
        const parts = applyTextStreamEvent(original, { textReplacement: { length: 1000, text: 'Final answer' } });
        assert.deepEqual(parts, [original[0], original[1], { type: 'text', content: 'Final answer' }]);
        assert.equal(original[2].content, 'preview');
    });
});
