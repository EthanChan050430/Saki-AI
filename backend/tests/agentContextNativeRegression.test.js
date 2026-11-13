'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildBackgroundDigest } = require('../services/agentContext');
const { formatSteeringHistory } = require('../services/agentSteering');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('next-turn serialization and compression retain applied steering and attachments only', () => {
    const message = { role: 'assistant', parts: [{ type: 'text', content: 'Done' }], steeringMessages: [
        { status: 'applied', text: 'Use local files only', files: [{ name: 'note', path: 'notes.txt', content: 'Preserve formatting' }] },
        { status: 'accepted', text: 'NOT_APPLIED', files: [] },
    ] };
    const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    const start = source.indexOf('function serializeMessageForContext(');
    const end = source.indexOf('function formatMessagesForContext(', start);
    const serialize = vm.runInNewContext(`(${source.slice(start, end)})`, { formatSteeringHistory });
    for (const text of [serialize(message), buildBackgroundDigest({ olderMessages: [message] })]) {
        for (const expected of ['Use local files only', 'notes.txt', 'Preserve formatting']) assert.ok(text.includes(expected));
        assert.ok(!text.includes('NOT_APPLIED'));
    }
});

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