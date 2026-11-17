'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const manager = require('../services/mcp.js');
const { MCPManager, normalizeMcpTimeout, DEFAULT_MCP_TOOL_TIMEOUT_MS } = manager;

function withServer(callToolImpl) {
    const instance = new MCPManager();
    const entry = { client: { callTool: callToolImpl }, transport: null, tools: [], refCount: 0, retired: false };
    instance.clients.set('demo', entry);
    return { instance, entry };
}

describe('MCPManager.callTool', () => {
    it('returns the client result unchanged', async () => {
        const { instance, entry } = withServer(async ({ name }) => ({ content: [{ type: 'text', text: name }] }));
        const result = await instance.callTool('demo', 'echo', {});
        assert.equal(result.content[0].text, 'echo');
        assert.equal(entry.refCount, 0);
    });

    it('rejects with MCP_TOOL_TIMEOUT instead of hanging', async () => {
        const { instance, entry } = withServer(() => new Promise(() => {}));
        await assert.rejects(
            () => instance.callTool('demo', 'slow', {}, { timeoutMs: 25 }),
            (error) => {
                assert.equal(error.code, 'MCP_TOOL_TIMEOUT');
                assert.match(error.message, /did not respond within 25 ms/);
                return true;
            },
        );
        assert.equal(entry.refCount, 0);
    });

    it('rejects with MCP_TOOL_ABORTED when the run is cancelled', async () => {
        const controller = new AbortController();
        const { instance } = withServer(() => new Promise(() => {}));
        const pending = instance.callTool('demo', 'wait', {}, { signal: controller.signal, timeoutMs: 0 });
        controller.abort();
        await assert.rejects(pending, (error) => error.code === 'MCP_TOOL_ABORTED');
    });

    it('rejects immediately when the signal is already aborted', async () => {
        const controller = new AbortController();
        controller.abort();
        const { instance } = withServer(() => new Promise(() => {}));
        await assert.rejects(
            () => instance.callTool('demo', 'never', {}, { signal: controller.signal }),
            (error) => error.code === 'MCP_TOOL_ABORTED',
        );
    });

    it('does not surface an unhandled rejection from the losing promise', async () => {
        const { instance } = withServer(() => new Promise((_, reject) => {
            setTimeout(() => reject(new Error('late failure')), 30);
        }));
        await assert.rejects(
            () => instance.callTool('demo', 'late', {}, { timeoutMs: 5 }),
            (error) => error.code === 'MCP_TOOL_TIMEOUT',
        );
        // Give the abandoned call time to reject; an unhandled rejection would fail this test file.
        await new Promise(resolve => { setTimeout(resolve, 60); });
    });

    it('ignores the timeout entirely when it is zero', async () => {
        const { instance } = withServer(async () => ({ content: [] }));
        await assert.doesNotReject(() => instance.callTool('demo', 'instant', {}, { timeoutMs: 0 }));
    });

    it('rejects an unknown server', async () => {
        const { instance } = withServer(async () => ({ content: [] }));
        await assert.rejects(() => instance.callTool('nope', 'x', {}), /not found or not initialized/);
    });
});

describe('normalizeMcpTimeout', () => {
    it('falls back to the default when unset or invalid', () => {
        assert.equal(normalizeMcpTimeout(undefined), DEFAULT_MCP_TOOL_TIMEOUT_MS);
        assert.equal(normalizeMcpTimeout(-1), DEFAULT_MCP_TOOL_TIMEOUT_MS);
        assert.equal(normalizeMcpTimeout('abc'), DEFAULT_MCP_TOOL_TIMEOUT_MS);
    });

    it('keeps explicit values, including zero, and caps absurd ones', () => {
        assert.equal(normalizeMcpTimeout(0), 0);
        assert.equal(normalizeMcpTimeout(1500), 1500);
        assert.equal(normalizeMcpTimeout(Number.MAX_SAFE_INTEGER), 24 * 60 * 60 * 1000);
    });
});
