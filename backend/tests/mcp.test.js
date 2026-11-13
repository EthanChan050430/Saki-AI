'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture(listTools) {
    const requests = [];
    let closed = 0;
    class Client {
        async connect() {}
        async listTools(params) { requests.push(params); return listTools(params); }
    }
    class Transport { async close() { closed++; } }
    const context = { module: { exports: {} }, process, console: { log() {}, error() {} },
        setTimeout: () => 0,
        require: id => id.includes('client/index') ? { Client }
            : id.includes('client/stdio') ? { StdioClientTransport: Transport } : require(id),
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../services/mcp.js'), 'utf8'), context);
    return { manager: context.module.exports, requests, closed: () => closed };
}

test('MCP loads all pages before publishing tools and reuses unchanged clients', async () => {
    const f = fixture(params => params?.cursor === 'next'
        ? { tools: [{ name: 'second' }] } : { tools: [{ name: 'first' }], nextCursor: 'next' });
    await f.manager.initializeServers({ demo: { command: 'mock' } });
    assert.equal(f.requests.length, 2);
    assert.equal(f.requests[1].cursor, 'next');
    assert.equal(f.manager.getToolSchema('demo', 'second').name, 'second');
    assert.equal(f.manager.getStatus().demo.toolCount, 2);
    await f.manager.initializeServers({ demo: { command: 'mock' } });
    assert.equal(f.requests.length, 2);
    await f.manager.closeAll();
    assert.equal(f.closed(), 1);
});

test('MCP pagination failure publishes no partial tools; removed failure status is cleared', async () => {
    for (const repeat of [true, false]) {
        const f = fixture(params => {
            if (params && !repeat) throw new Error('page failed');
            return { tools: [{ name: 'first' }], nextCursor: 'loop' };
        });
        await f.manager.initializeServers({ demo: { command: 'mock' } });
        assert.equal(f.manager.getAllTools().length, 0);
        assert.equal(f.manager.getStatus().demo.connected, false);
        assert.match(f.manager.getStatus().demo.error, repeat ? /repeated cursor/ : /page failed/);
        assert.equal(f.closed(), 1);
        if (repeat) await f.manager.initializeServers({});
        else await f.manager.closeAll();
        assert.equal(Object.keys(f.manager.getStatus()).length, 0);
    }
});
