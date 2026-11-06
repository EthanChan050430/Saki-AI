'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildBackgroundDigest } = require('../services/agentContext');

test('digest retains OpenAI tool names, IDs, arguments and result objects', () => {
    const text = buildBackgroundDigest({ olderMessages: [
        { role: 'assistant', content: '', tool_calls: [{ id: 'call-1', function: { name: 'readFile', arguments: '{"path":"notes.md"}' } }] },
        { role: 'tool', tool_call_id: 'call-1', content: { actual: 'file contents' } },
    ] });
    for (const value of ['readFile', 'call-1', 'notes.md', 'file contents']) assert.ok(text.includes(value));
    assert.ok(!text.includes('[object Object]'));
});

test('digest retains Anthropic tool_use and nested tool_result contents', () => {
    const text = buildBackgroundDigest({ olderMessages: [
        { role: 'assistant', content: [{ type: 'tool_use', id: 'use-1', name: 'search', input: { query: 'needle' } }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'use-1', content: [{ type: 'text', text: 'actual evidence' }] }] },
    ] });
    for (const value of ['search', 'needle', 'use-1', 'actual evidence']) assert.ok(text.includes(value));
    assert.ok(!text.includes('[object Object]'));
});