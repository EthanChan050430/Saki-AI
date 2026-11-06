'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    AGENT_STOP_SEQUENCES,
    supportsStopSequences,
    getAnthropicModelProfile,
    truncateAtFabricatedObservation,
    isProgressNote,
    partitionRespond,
    createRepeatCallTracker,
    resolveOllamaNumCtx,
    READ_ONLY_TOOLS,
} = require('../services/agentLoopUtils.js');

describe('AGENT_STOP_SEQUENCES', () => {
    it('contains both Observation: variants', () => {
        assert.ok(AGENT_STOP_SEQUENCES.includes('\nObservation:'));
        assert.ok(AGENT_STOP_SEQUENCES.includes('\nObservation：'));
    });
});

describe('supportsStopSequences', () => {
    it('returns false for o-series models', () => {
        assert.equal(supportsStopSequences('o1'), false);
        assert.equal(supportsStopSequences('o3-mini'), false);
        assert.equal(supportsStopSequences('openai/o1'), false);
    });
    it('returns false for gpt-5', () => {
        assert.equal(supportsStopSequences('gpt-5'), false);
        assert.equal(supportsStopSequences('openai/gpt-5-turbo'), false);
    });
    it('returns true for claude and other models', () => {
        assert.equal(supportsStopSequences('claude-3-opus'), true);
        assert.equal(supportsStopSequences('gpt-4o'), true);
        assert.equal(supportsStopSequences('gemini-1.5-pro'), true);
    });
});

describe('getAnthropicModelProfile', () => {
    it('gives 16000 + thinking for claude-3.7', () => {
        const p = getAnthropicModelProfile('claude-3-7-sonnet');
        assert.equal(p.maxTokens, 16000);
        assert.equal(p.thinkingBudget, 8000);
    });
    it('gives 8192 no thinking for claude-3.5', () => {
        const p = getAnthropicModelProfile('claude-3-5-sonnet');
        assert.equal(p.maxTokens, 8192);
        assert.equal(p.thinkingBudget, 0);
    });
    it('gives 4096 no thinking for claude-3-opus (bare)', () => {
        const p = getAnthropicModelProfile('claude-3-opus');
        assert.equal(p.maxTokens, 4096);
        assert.equal(p.thinkingBudget, 0);
    });
    it('gives 4096 no thinking for claude-2', () => {
        const p = getAnthropicModelProfile('claude-2.1');
        assert.equal(p.maxTokens, 4096);
        assert.equal(p.thinkingBudget, 0);
    });
    it('gives 32000 + thinking for claude-opus-4', () => {
        const p = getAnthropicModelProfile('claude-opus-4-5');
        assert.equal(p.maxTokens, 32000);
        assert.equal(p.thinkingBudget, 8000);
    });
    it('gives 32000 + thinking for claude-sonnet-4', () => {
        const p = getAnthropicModelProfile('claude-sonnet-4');
        assert.equal(p.maxTokens, 32000);
        assert.equal(p.thinkingBudget, 8000);
    });
    it('defaults to 4096 for unknown model', () => {
        const p = getAnthropicModelProfile('unknown-model');
        assert.equal(p.maxTokens, 4096);
        assert.equal(p.thinkingBudget, 0);
    });
});

describe('truncateAtFabricatedObservation', () => {
    it('returns text unchanged when no Observation: present', () => {
        const text = 'Tool: readFile(...)\nsome result';
        assert.equal(truncateAtFabricatedObservation(text), text);
    });
    it('truncates at fabricated Observation:', () => {
        const text = 'Tool: readFile("foo")\nObservation: fabricated content\nTool: respond(...)';
        const result = truncateAtFabricatedObservation(text);
        assert.ok(result.includes('readFile'));
        assert.ok(!result.includes('fabricated'));
    });
    it('truncates at full-width Observation：', () => {
        const text = 'Tool: readFile("foo")\nObservation：fake\nmore';
        const result = truncateAtFabricatedObservation(text);
        assert.ok(!result.includes('fake'));
    });
    it('preserves Observation: inside <think> block', () => {
        const text = '<think>\nObservation: internal reasoning\n</think>\nActual answer here';
        const result = truncateAtFabricatedObservation(text);
        assert.ok(result.includes('Actual answer here'));
    });
    it('truncates Observation: appearing after </think>', () => {
        const text = '<think>internal</think>\nObservation: fabricated\nAnswer';
        const result = truncateAtFabricatedObservation(text);
        assert.ok(!result.includes('fabricated'));
        assert.ok(!result.includes('Answer'));
    });
});

describe('isProgressNote', () => {
    it('identifies Chinese progress notes', () => {
        assert.ok(isProgressNote('我来帮你处理这个问题'));
        assert.ok(isProgressNote('稍等，正在处理'));
        assert.ok(isProgressNote('让我看一下'));
        assert.ok(isProgressNote('正在查询...'));
    });
    it('identifies English progress notes', () => {
        assert.ok(isProgressNote("Let me check that for you"));
        assert.ok(isProgressNote("I'll look into it"));
        assert.ok(isProgressNote("One moment..."));
    });
    it('does not flag substantive answers', () => {
        assert.ok(!isProgressNote('The answer is 42.'));
        assert.ok(!isProgressNote('已完成文件修改，共改了3处。'));
        assert.ok(!isProgressNote(''));
    });
});

describe('partitionRespond', () => {
    const makeMatch = name => ({ name });

    it('no conflict when only respond', () => {
        const result = partitionRespond([makeMatch('respond')]);
        assert.equal(result.hasConflict, false);
        assert.equal(result.filtered.length, 1);
    });
    it('no conflict when respond + todo only', () => {
        const result = partitionRespond([makeMatch('respond'), makeMatch('updateTodo')]);
        assert.equal(result.hasConflict, false);
    });
    it('conflict when respond appears with real tool', () => {
        const result = partitionRespond([makeMatch('respond'), makeMatch('readFile')]);
        assert.equal(result.hasConflict, true);
        assert.equal(result.filtered.some(m => m.name === 'respond'), false);
        assert.equal(result.filtered.some(m => m.name === 'readFile'), true);
    });
    it('empty list has no conflict', () => {
        const result = partitionRespond([]);
        assert.equal(result.hasConflict, false);
        assert.equal(result.filtered.length, 0);
    });
});

describe('createRepeatCallTracker', () => {
    it('no warn on first call', () => {
        const tracker = createRepeatCallTracker();
        const r = tracker.record('readFile', { path: 'foo' });
        assert.equal(r.shouldWarn, false);
        assert.equal(r.isFatal, false);
    });
    it('warns on 3rd consecutive identical call', () => {
        const tracker = createRepeatCallTracker();
        tracker.record('readFile', { path: 'foo' });
        tracker.record('readFile', { path: 'foo' });
        const r = tracker.record('readFile', { path: 'foo' });
        assert.equal(r.shouldWarn, true);
        assert.equal(r.isFatal, false);
    });
    it('fatal on 4th consecutive identical call', () => {
        const tracker = createRepeatCallTracker();
        tracker.record('readFile', { path: 'foo' });
        tracker.record('readFile', { path: 'foo' });
        tracker.record('readFile', { path: 'foo' });
        const r = tracker.record('readFile', { path: 'foo' });
        assert.equal(r.isFatal, true);
    });
    it('resets streak on different call', () => {
        const tracker = createRepeatCallTracker();
        tracker.record('readFile', { path: 'foo' });
        tracker.record('readFile', { path: 'foo' });
        tracker.record('listDir', { path: '.' });
        const r = tracker.record('readFile', { path: 'foo' });
        assert.equal(r.shouldWarn, false);
        assert.equal(r.isFatal, false);
    });
    it('reset() clears streak', () => {
        const tracker = createRepeatCallTracker();
        tracker.record('readFile', { path: 'foo' });
        tracker.record('readFile', { path: 'foo' });
        tracker.record('readFile', { path: 'foo' });
        tracker.reset();
        const r = tracker.record('readFile', { path: 'foo' });
        assert.equal(r.shouldWarn, false);
    });
});

describe('resolveOllamaNumCtx', () => {
    it('returns a power of two', () => {
        const result = resolveOllamaNumCtx(32768);
        assert.equal(result, Math.pow(2, Math.round(Math.log2(result))));
    });
    it('clamps at minimum 8192', () => {
        assert.equal(resolveOllamaNumCtx(100), 8192);
    });
    it('clamps at maximum 131072', () => {
        assert.equal(resolveOllamaNumCtx(200000), 131072);
    });
    it('gives reasonable value for typical budget', () => {
        const result = resolveOllamaNumCtx(32768);
        assert.ok(result >= 32768 && result <= 65536);
    });
});

describe('READ_ONLY_TOOLS', () => {
    it('is a Set', () => {
        assert.ok(READ_ONLY_TOOLS instanceof Set);
    });
    it('contains readfile', () => {
        assert.ok(READ_ONLY_TOOLS.has('readfile'));
    });
    it('contains listdir', () => {
        assert.ok(READ_ONLY_TOOLS.has('listdir'));
    });
    it('does not contain writefile', () => {
        assert.ok(!READ_ONLY_TOOLS.has('writefile'));
    });
});
