'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    sanitizeMemoryText,
    normalizePendingActionItem,
    expirePendingActions,
    inferDecisionText,
    normalizeChatKey,
} = require('../services/memory.js');

describe('sanitizeMemoryText', () => {
    it('strips [expression:...] tags', () => {
        assert.equal(sanitizeMemoryText('hello [expression:happy.png] world'), 'hello world');
    });
    it('strips multiple tags', () => {
        const result = sanitizeMemoryText('[expression:smile] hi [expression:wave.gif]');
        assert.ok(!result.includes('[expression:'));
        assert.ok(result.includes('hi'));
    });
    it('collapses excess whitespace', () => {
        assert.equal(sanitizeMemoryText('foo   bar'), 'foo bar');
    });
    it('trims leading and trailing space', () => {
        assert.equal(sanitizeMemoryText('  hello  '), 'hello');
    });
    it('returns empty string for empty input', () => {
        assert.equal(sanitizeMemoryText(''), '');
        assert.equal(sanitizeMemoryText(null), '');
    });
});

describe('normalizePendingActionItem', () => {
    it('returns null for plain string (legacy format)', () => {
        assert.equal(normalizePendingActionItem('old plain string'), null);
    });
    it('returns null for null/undefined', () => {
        assert.equal(normalizePendingActionItem(null), null);
        assert.equal(normalizePendingActionItem(undefined), null);
    });
    it('returns null when text is empty after sanitization', () => {
        assert.equal(normalizePendingActionItem({ text: '[expression:x]', createdAt: new Date().toISOString() }), null);
    });
    it('returns null when createdAt is invalid', () => {
        assert.equal(normalizePendingActionItem({ text: 'do thing', createdAt: 'not-a-date' }), null);
    });
    it('normalizes a valid item', () => {
        const iso = new Date().toISOString();
        const result = normalizePendingActionItem({ text: 'fix the bug', createdAt: iso });
        assert.equal(result.text, 'fix the bug');
        assert.equal(typeof result.createdAt, 'string');
    });
    it('sanitizes text in the item', () => {
        const iso = new Date().toISOString();
        const result = normalizePendingActionItem({ text: 'fix [expression:x] bug', createdAt: iso });
        assert.equal(result.text, 'fix bug');
    });
});

describe('expirePendingActions', () => {
    const recent = new Date().toISOString();
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();

    it('removes expired items', () => {
        const items = [
            { text: 'old task', createdAt: old },
            { text: 'new task', createdAt: recent },
        ];
        const result = expirePendingActions(items);
        assert.equal(result.length, 1);
        assert.equal(result[0].text, 'new task');
    });
    it('drops legacy plain strings', () => {
        const result = expirePendingActions(['plain string', { text: 'valid', createdAt: recent }]);
        assert.equal(result.length, 1);
        assert.equal(result[0].text, 'valid');
    });
    it('deduplicates by text', () => {
        const items = [
            { text: 'same task', createdAt: recent },
            { text: 'same task', createdAt: recent },
        ];
        const result = expirePendingActions(items);
        assert.equal(result.length, 1);
    });
    it('caps at PENDING_ACTION_MAX (10)', () => {
        const items = Array.from({ length: 15 }, (_, i) => ({
            text: `task ${i}`,
            createdAt: recent,
        }));
        const result = expirePendingActions(items);
        assert.ok(result.length <= 10);
    });
    it('handles empty array', () => {
        assert.deepEqual(expirePendingActions([]), []);
    });
    it('handles non-array gracefully', () => {
        assert.deepEqual(expirePendingActions(null), []);
    });
});

describe('inferDecisionText', () => {
    it('returns empty for questions', () => {
        assert.equal(inferDecisionText('以后都用这个吗？'), '');
        assert.equal(inferDecisionText('Should we always use this?'), '');
    });
    it('returns empty for non-commitment statements', () => {
        assert.equal(inferDecisionText('今天天气不错'), '');
        assert.equal(inferDecisionText('I like this approach'), '');
    });
    it('captures Chinese commitment phrases', () => {
        assert.ok(inferDecisionText('以后都用TypeScript写').length > 0);
        assert.ok(inferDecisionText('从现在起统一用tabs缩进').length > 0);
    });
    it('captures English commitment phrases', () => {
        assert.ok(inferDecisionText("From now on always use ESM imports").length > 0);
        assert.ok(inferDecisionText("I've decided to use PostgreSQL").length > 0);
    });
    it('returns empty for empty input', () => {
        assert.equal(inferDecisionText(''), '');
        assert.equal(inferDecisionText(null), '');
    });
});

describe('normalizeChatKey', () => {
    it('returns __default__ for empty string', () => {
        assert.equal(normalizeChatKey(''), '__default__');
    });
    it('returns __default__ for null/undefined', () => {
        assert.equal(normalizeChatKey(null), '__default__');
        assert.equal(normalizeChatKey(undefined), '__default__');
    });
    it('returns the chatId unchanged when non-empty', () => {
        assert.equal(normalizeChatKey('chat-123'), 'chat-123');
        assert.equal(normalizeChatKey('abc'), 'abc');
    });
    it('trims whitespace', () => {
        assert.equal(normalizeChatKey('  '), '__default__');
        assert.equal(normalizeChatKey('  chat-1  '), 'chat-1');
    });
});
