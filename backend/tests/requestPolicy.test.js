'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    REDACTED,
    parseAllowedOrigins,
    isLoopbackAddress,
    isTrustedLocalOrigin,
    isLocalRequest,
    safeTokenEqual,
    createLocalAdminGuard,
    redactConfigForRemote,
    redactMcpConfigForRemote,
    mergeRedactedSecrets,
    redactSecretFlags,
} = require('../services/requestPolicy.js');

function fakeRequest({ remoteAddress = '127.0.0.1', origin, headers = {} } = {}) {
    const store = { ...headers };
    if (origin !== undefined) store.origin = origin;
    return {
        socket: { remoteAddress },
        headers: store,
        get(name) {
            const key = String(name).toLowerCase();
            for (const [header, value] of Object.entries(store)) {
                if (header.toLowerCase() === key) return value;
            }
            return undefined;
        },
    };
}

function fakeResponse() {
    return {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
    };
}

describe('isLoopbackAddress', () => {
    it('accepts IPv4 and IPv6 loopback, including the IPv4-mapped form', () => {
        assert.equal(isLoopbackAddress('127.0.0.1'), true);
        assert.equal(isLoopbackAddress('::1'), true);
        assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true);
        assert.equal(isLoopbackAddress('localhost'), true);
    });
    it('rejects LAN and public addresses', () => {
        assert.equal(isLoopbackAddress('192.168.1.20'), false);
        assert.equal(isLoopbackAddress('::ffff:10.0.0.5'), false);
        assert.equal(isLoopbackAddress(''), false);
        assert.equal(isLoopbackAddress(undefined), false);
    });
});

describe('isTrustedLocalOrigin', () => {
    it('treats an absent Origin as local tooling', () => {
        assert.equal(isTrustedLocalOrigin(''), true);
        assert.equal(isTrustedLocalOrigin(undefined), true);
    });
    it('accepts loopback origins with a port and the IPv6 form', () => {
        assert.equal(isTrustedLocalOrigin('http://localhost:5480'), true);
        assert.equal(isTrustedLocalOrigin('http://127.0.0.1:5480'), true);
        assert.equal(isTrustedLocalOrigin('https://[::1]:5480'), true);
    });
    it('rejects a page served from another site', () => {
        assert.equal(isTrustedLocalOrigin('https://evil.example'), false);
        assert.equal(isTrustedLocalOrigin('http://127.0.0.1.evil.example'), false);
    });
    it('ignores a trailing slash so a proxied origin still matches', () => {
        assert.equal(isTrustedLocalOrigin('http://127.0.0.1:5480/'), true);
    });
});

describe('parseAllowedOrigins', () => {
    it('splits, trims and drops empty entries', () => {
        assert.deepEqual(parseAllowedOrigins(' https://a.example , https://b.example/ ,,'), ['https://a.example', 'https://b.example']);
        assert.deepEqual(parseAllowedOrigins(''), []);
        assert.deepEqual(parseAllowedOrigins(undefined), []);
    });
});

describe('safeTokenEqual', () => {
    it('compares equal secrets', () => {
        assert.equal(safeTokenEqual('abc123', 'abc123'), true);
    });
    it('rejects different, empty and missing secrets without throwing', () => {
        assert.equal(safeTokenEqual('abc124', 'abc123'), false);
        assert.equal(safeTokenEqual('abc', 'abc123'), false);
        assert.equal(safeTokenEqual('', ''), false);
        assert.equal(safeTokenEqual(undefined, 'abc123'), false);
        assert.equal(safeTokenEqual('abc123', ''), false);
    });
});

describe('createLocalAdminGuard', () => {
    const guard = createLocalAdminGuard({ token: 'secret-token' });

    it('allows a loopback client without a token', () => {
        const req = fakeRequest({ remoteAddress: '127.0.0.1', origin: 'http://127.0.0.1:5480' });
        const res = fakeResponse();
        let called = false;
        guard(req, res, () => { called = true; });
        assert.equal(called, true);
        assert.equal(res.statusCode, 200);
    });

    it('rejects a LAN client that presents no token', () => {
        const req = fakeRequest({ remoteAddress: '192.168.1.30' });
        const res = fakeResponse();
        let called = false;
        guard(req, res, () => { called = true; });
        assert.equal(called, false);
        assert.equal(res.statusCode, 403);
        assert.equal(res.body.code, 'LOCAL_ADMIN_ONLY');
    });

    it('rejects a loopback request whose Origin belongs to another site', () => {
        const req = fakeRequest({ remoteAddress: '127.0.0.1', origin: 'https://evil.example' });
        const res = fakeResponse();
        let called = false;
        guard(req, res, () => { called = true; });
        assert.equal(called, false);
        assert.equal(res.statusCode, 403);
    });

    it('allows a remote client that presents the agent token', () => {
        const req = fakeRequest({ remoteAddress: '192.168.1.30', headers: { 'x-agent-auth-token': 'secret-token' } });
        const res = fakeResponse();
        let called = false;
        guard(req, res, () => { called = true; });
        assert.equal(called, true);
    });

    it('does not treat an absent token configuration as a wildcard', () => {
        const openGuard = createLocalAdminGuard({ token: '' });
        const req = fakeRequest({ remoteAddress: '192.168.1.30', headers: { 'x-agent-auth-token': '' } });
        const res = fakeResponse();
        let called = false;
        openGuard(req, res, () => { called = true; });
        assert.equal(called, false);
    });
});

describe('isLocalRequest', () => {
    it('requires both a loopback peer and a trusted origin', () => {
        assert.equal(isLocalRequest(fakeRequest()), true);
        assert.equal(isLocalRequest(fakeRequest({ remoteAddress: '10.1.1.1' })), false);
        assert.equal(isLocalRequest(fakeRequest({ origin: 'https://evil.example' })), false);
    });
});

describe('redactConfigForRemote', () => {
    const config = {
        provider: 'deepseek',
        model: 'deepseek-chat',
        apiKey: 'sk-live-1',
        deepseekApiKey: 'sk-live-2',
        customDrawingKey: 'draw-key',
        copilotToken: 'gh-token',
        workspacePath: 'D:/work',
        thirdPartyChats: {
            qqbot: { clientSecret: 'qq-secret', appId: '123' },
            telegram: { botToken: 'tg-token', enabled: true },
        },
        mcpConfig: {
            mcpServers: {
                fs: { command: 'npx', args: ['-y', 'server-filesystem', '--api-key=abc'], env: { API_KEY: 'env-secret' } },
            },
        },
    };

    it('masks every credential', () => {
        const safe = redactConfigForRemote(config);
        assert.equal(safe.apiKey, REDACTED);
        assert.equal(safe.deepseekApiKey, REDACTED);
        assert.equal(safe.customDrawingKey, REDACTED);
        assert.equal(safe.copilotToken, REDACTED);
        assert.equal(safe.thirdPartyChats.qqbot.clientSecret, REDACTED);
        assert.equal(safe.thirdPartyChats.telegram.botToken, REDACTED);
        assert.equal(safe.mcpConfig.mcpServers.fs.env.API_KEY, REDACTED);
        assert.deepEqual(safe.mcpConfig.mcpServers.fs.args, ['-y', 'server-filesystem', `--api-key=${REDACTED}`]);
    });

    it('keeps non-secret settings readable so the UI still renders', () => {
        const safe = redactConfigForRemote(config);
        assert.equal(safe.provider, 'deepseek');
        assert.equal(safe.model, 'deepseek-chat');
        assert.equal(safe.workspacePath, 'D:/work');
        assert.equal(safe.thirdPartyChats.qqbot.appId, '123');
        assert.equal(safe.thirdPartyChats.telegram.enabled, true);
        assert.equal(safe.mcpConfig.mcpServers.fs.command, 'npx');
    });

    it('does not mutate the stored configuration', () => {
        redactConfigForRemote(config);
        assert.equal(config.apiKey, 'sk-live-1');
        assert.equal(config.mcpConfig.mcpServers.fs.env.API_KEY, 'env-secret');
    });
});

describe('mergeRedactedSecrets', () => {
    const stored = {
        apiKey: 'sk-old',
        customApiKey: 'custom-old',
        mcpConfig: { mcpServers: { fs: { env: { API_KEY: 'env-old' } } } },
    };

    it('restores a secret that came back as the redaction sentinel', () => {
        const merged = mergeRedactedSecrets({ apiKey: REDACTED, model: 'x' }, stored);
        assert.equal(merged.apiKey, 'sk-old');
        assert.equal(merged.model, 'x');
    });

    it('lets an explicit new value win', () => {
        const merged = mergeRedactedSecrets({ apiKey: 'sk-new' }, stored);
        assert.equal(merged.apiKey, 'sk-new');
    });

    it('restores nested MCP environment values', () => {
        const merged = mergeRedactedSecrets(
            { mcpConfig: { mcpServers: { fs: { env: { API_KEY: REDACTED } } } } },
            stored,
        );
        assert.equal(merged.mcpConfig.mcpServers.fs.env.API_KEY, 'env-old');
    });

    it('tolerates a missing stored configuration', () => {
        assert.deepEqual(mergeRedactedSecrets({ apiKey: REDACTED }, null), { apiKey: REDACTED });
    });
});

describe('redactSecretFlags', () => {
    it('replaces only the value, keeping the command shape readable', () => {
        assert.equal(redactSecretFlags('--api-key=abc'), `--api-key=${REDACTED}`);
        assert.equal(redactSecretFlags('--token abc'), `--token ${REDACTED}`);
        assert.equal(redactSecretFlags('-y'), '-y');
        assert.equal(redactSecretFlags('server-filesystem'), 'server-filesystem');
    });
});

describe('redactMcpConfigForRemote', () => {
    it('masks env values and does not mutate the input', () => {
        const input = { mcpServers: { s: { command: 'node', env: { A: '1', B: '2' } } } };
        const safe = redactMcpConfigForRemote(input);
        assert.deepEqual(safe.mcpServers.s.env, { A: REDACTED, B: REDACTED });
        assert.deepEqual(input.mcpServers.s.env, { A: '1', B: '2' });
        assert.equal(safe.mcpServers.s.command, 'node');
    });
});
