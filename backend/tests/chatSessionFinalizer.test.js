'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    resolveOutcomeStatus,
    hasFinishedAssistantOutput,
    applyFinalOutcomeToMessages,
    resolveFinalPendingRequest,
    isStalePendingSession,
} = require('../services/chatSessionFinalizer');

test('resolveOutcomeStatus maps terminal outcomes consistently', () => {
    assert.equal(resolveOutcomeStatus('completed'), 'done');
    assert.equal(resolveOutcomeStatus('completed', 'error'), 'error');
    assert.equal(resolveOutcomeStatus('error'), 'error');
    assert.equal(resolveOutcomeStatus('stopped'), 'interrupted');
    assert.equal(resolveOutcomeStatus('awaitingApproval'), 'streaming');
});

test('applyFinalOutcomeToMessages stamps status, runOutcome, duration and deduplicates error text', () => {
    const messages = [
        { role: 'user', id: 'u1', content: 'hi' },
        { role: 'assistant', id: 1794585987390, parts: [{ type: 'text', content: '说出来嘛，我慢慢帮你找！~💕' }] },
    ];
    const finalized = applyFinalOutcomeToMessages(messages, {
        assistantMsgId: 1794585987390,
        outcome: 'completed',
        startedAt: 1000,
        now: 3500,
    });
    assert.equal(finalized[1].status, 'done');
    assert.equal(finalized[1].runOutcome, 'completed');
    assert.equal(finalized[1].generationDurationMs, 2500);
    assert.equal(messages[1].status, undefined);

    const errored = applyFinalOutcomeToMessages(
        [{ role: 'assistant', id: 'a2', parts: [] }],
        { assistantMsgId: 'a2', outcome: 'error', errorText: '模型调用失败', startedAt: 100, now: 200 }
    );
    assert.equal(errored[0].status, 'error');
    assert.equal(errored[0].runOutcome, 'error');
    assert.equal(errored[0].parts.at(-1).content, '模型调用失败');
});

test('resolveFinalPendingRequest clears pendingRequest except when awaiting approval', () => {
    const pending = { type: 'chat', message: 'test', assistantMsgId: 123 };
    assert.equal(resolveFinalPendingRequest({ existingPendingRequest: pending, outcome: 'completed' }), null);
    assert.equal(resolveFinalPendingRequest({ existingPendingRequest: pending, outcome: 'error' }), null);
    assert.equal(resolveFinalPendingRequest({ existingPendingRequest: pending, outcome: 'stopped' }), null);

    const approval = { toolName: 'terminal', args: ['rm -rf foo'] };
    const kept = resolveFinalPendingRequest({
        existingPendingRequest: pending,
        outcome: 'awaitingApproval',
        approvalRequest: approval,
    });
    assert.deepEqual(kept, { ...pending, approvalRequest: approval });
});

test('isStalePendingSession detects finished plain-text reply with orphaned pendingRequest when not running', () => {
    const staleRepro = {
        messages: [
            { role: 'user', id: 'u1', content: '帮我找下' },
            {
                role: 'assistant',
                id: 1794585987390,
                parts: [
                    { type: 'action', data: { type: 'search', args: ['test'] }, observation: 'done' },
                    { type: 'text', content: '说出来嘛，我慢慢帮你找！~💕' },
                ],
            },
        ],
        pendingRequest: { type: 'chat', message: '帮我找下', assistantMsgId: 1794585987390 },
    };
    assert.equal(hasFinishedAssistantOutput(staleRepro.messages[1]), true);
    assert.equal(isStalePendingSession(staleRepro, false), true);
    assert.equal(isStalePendingSession(staleRepro, true), false);

    assert.equal(isStalePendingSession({
        ...staleRepro,
        pendingRequest: { ...staleRepro.pendingRequest, approvalRequest: { toolName: 'terminal' } },
    }, false), false);

    assert.equal(isStalePendingSession({
        messages: [
            { role: 'assistant', id: 2, parts: [{ type: 'action', data: { type: 'search' } }] },
        ],
        pendingRequest: { type: 'chat', assistantMsgId: 2 },
    }, false), false);
});
