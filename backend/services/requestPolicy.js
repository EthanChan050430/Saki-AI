'use strict';

// Request-scoped security helpers: restricts persistent config/extension changes
// to loopback or token-authenticated clients and redacts credentials for remote views.

const crypto = require('node:crypto');

/** Sentinel returned instead of a secret. Round-tripping it preserves the real value. */
const REDACTED = '[redacted]';

/**
 * Config paths that hold credentials. Kept as explicit paths rather than a
 * suffix regex so a future non-secret field such as `tokenLimit` is never masked.
 */
const SECRET_PATHS = Object.freeze([
    ['apiKey'],
    ['openaiApiKey'],
    ['deepseekApiKey'],
    ['zhipuApiKey'],
    ['geminiApiKey'],
    ['minimaxApiKey'],
    ['anthropicApiKey'],
    ['moonshotApiKey'],
    ['tongyiApiKey'],
    ['doubaoApiKey'],
    ['customApiKey'],
    ['customDrawingKey'],
    ['copilotToken'],
    ['thirdPartyChats', 'telegram', 'botToken'],
    ['thirdPartyChats', 'feishu', 'appSecret'],
    ['thirdPartyChats', 'feishu', 'verificationToken'],
    ['thirdPartyChats', 'qqbot', 'clientSecret'],
]);

const LOCAL_ADMIN_ONLY_MESSAGE =
    '此项设置会持久化到本机并影响后续所有会话，仅允许在运行 Saki 的机器上修改；'
    + '如需远程操作，请设置 AGENT_AUTH_TOKEN 并在请求头携带 x-agent-auth-token。';

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getAtPath(source, keys) {
    let cursor = source;
    for (const key of keys) {
        if (!isPlainObject(cursor)) return undefined;
        cursor = cursor[key];
    }
    return cursor;
}

function setAtPath(target, keys, value) {
    let cursor = target;
    for (let index = 0; index < keys.length - 1; index += 1) {
        const key = keys[index];
        if (!isPlainObject(cursor[key])) return;
        cursor = cursor[key];
    }
    cursor[keys[keys.length - 1]] = value;
}

function cloneJson(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
}

function isLoopbackAddress(remoteAddress) {
    const address = String(remoteAddress || '').trim().toLowerCase().replace(/^::ffff:/, '');
    return address === '127.0.0.1' || address === '::1' || address === 'localhost';
}

/**
 * Extra origins a deployment declares trustworthy, for a reverse proxy that
 * terminates TLS on a public hostname. Empty by default, so the shipped
 * behaviour trusts the loopback UI only.
 */
function parseAllowedOrigins(value) {
    return String(value || '')
        .split(',')
        .map(entry => entry.trim().replace(/\/+$/, ''))
        .filter(Boolean);
}

const EXTRA_TRUSTED_ORIGINS = new Set(parseAllowedOrigins(process.env.SAKI_ALLOWED_ORIGINS));

/**
 * An absent Origin is trusted because non-browser local tooling omits it; a
 * present Origin must be a loopback UI or a deployment-declared origin. This
 * blocks a page on another site from driving the local API through the user's
 * browser.
 */
function isTrustedLocalOrigin(origin) {
    const value = String(origin || '').trim().replace(/\/+$/, '');
    if (!value) return true;
    if (EXTRA_TRUSTED_ORIGINS.has(value)) return true;
    return /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(value);
}

function readHeader(req, name) {
    if (typeof req?.get === 'function') return req.get(name);
    const headers = req?.headers || {};
    const wanted = name.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === wanted) return Array.isArray(value) ? value[0] : value;
    }
    return undefined;
}

function clientAddress(req) {
    return req?.socket?.remoteAddress || req?.ip || '';
}

function extractRequestToken(req) {
    return String(readHeader(req, 'x-agent-auth-token') || readHeader(req, 'authorization') || '')
        .replace(/^Bearer\s+/i, '')
        .trim();
}

/**
 * Constant-time comparison that tolerates unequal lengths without throwing.
 * A length mismatch leaks only the length, which is fixed for generated tokens.
 */
function safeTokenEqual(candidate, expected) {
    if (!expected) return false;
    const left = Buffer.from(String(candidate ?? ''), 'utf8');
    const right = Buffer.from(String(expected), 'utf8');
    if (left.length !== right.length || left.length === 0) return false;
    return crypto.timingSafeEqual(left, right);
}

function isLocalRequest(req) {
    return isLoopbackAddress(clientAddress(req)) && isTrustedLocalOrigin(readHeader(req, 'origin'));
}

/**
 * Express middleware factory.
 *
 * `token` is optional so the guard can be unit tested and so a deployment
 * without an auth token still gets the loopback rule instead of failing open.
 */
function createLocalAdminGuard({ token = '', message = LOCAL_ADMIN_ONLY_MESSAGE } = {}) {
    return function requireLocalAdmin(req, res, next) {
        if (token && safeTokenEqual(extractRequestToken(req), token)) return next();
        if (isLocalRequest(req)) return next();
        res.status(403).json({ error: message, code: 'LOCAL_ADMIN_ONLY' });
        return undefined;
    };
}

function redactMcpServers(servers) {
    if (!isPlainObject(servers)) return servers;
    const output = {};
    for (const [name, server] of Object.entries(servers)) {
        if (!isPlainObject(server)) {
            output[name] = server;
            continue;
        }
        const next = { ...server };
        // Environment values carry credentials such as API keys for hosted servers.
        if (isPlainObject(next.env)) {
            next.env = Object.fromEntries(Object.keys(next.env).map(key => [key, REDACTED]));
        }
        if (Array.isArray(next.args)) {
            next.args = next.args.map(redactSecretFlags);
        }
        output[name] = next;
    }
    return output;
}

/**
 * Replaces `--api-key=...`, `--token ...`, `--password=...` style argument values.
 * Only the value is replaced, so the command shape stays inspectable.
 */
function redactSecretFlags(argument) {
    if (typeof argument !== 'string') return argument;
    return argument.replace(
        /(^|\s)(--?(?:api[-_]?key|token|secret|password|passwd|auth)(?:=|\s+))(\S+)/gi,
        (_match, prefix, flag) => `${prefix}${flag}${REDACTED}`,
    );
}

/**
 * Returns a copy of the global config safe to hand to a non-local client.
 * Everything except credentials stays readable so the UI can still render.
 */
function redactConfigForRemote(config) {
    if (!isPlainObject(config)) return config;
    const clone = cloneJson(config);
    for (const secretPath of SECRET_PATHS) {
        if (typeof getAtPath(clone, secretPath) === 'string') setAtPath(clone, secretPath, REDACTED);
    }
    if (isPlainObject(clone.mcpConfig) && isPlainObject(clone.mcpConfig.mcpServers)) {
        clone.mcpConfig.mcpServers = redactMcpServers(clone.mcpConfig.mcpServers);
    }
    if (Array.isArray(clone.mcpServices)) {
        clone.mcpServices = clone.mcpServices.map(entry => (isPlainObject(entry) && isPlainObject(entry.env)
            ? { ...entry, env: Object.fromEntries(Object.keys(entry.env).map(key => [key, REDACTED])) }
            : entry));
    }
    return clone;
}

function redactMcpConfigForRemote(config) {
    if (!isPlainObject(config)) return config;
    const clone = cloneJson(config);
    if (isPlainObject(clone.mcpServers)) clone.mcpServers = redactMcpServers(clone.mcpServers);
    return clone;
}

/**
 * Merges a redacted payload back onto the stored config.
 *
 * Without this, a client that saved the redacted form would erase every key.
 * A client that sends a real value still wins.
 */
function mergeRedactedSecrets(incoming, existing) {
    if (!isPlainObject(incoming)) return incoming;
    if (!isPlainObject(existing)) return incoming;
    const merged = cloneJson(incoming);
    for (const secretPath of SECRET_PATHS) {
        if (getAtPath(merged, secretPath) !== REDACTED) continue;
        const stored = getAtPath(existing, secretPath);
        setAtPath(merged, secretPath, typeof stored === 'string' ? stored : '');
    }
    if (isPlainObject(merged.mcpConfig) && isPlainObject(merged.mcpConfig.mcpServers)) {
        const storedServers = isPlainObject(existing.mcpConfig?.mcpServers) ? existing.mcpConfig.mcpServers : {};
        for (const [name, server] of Object.entries(merged.mcpConfig.mcpServers)) {
            if (!isPlainObject(server) || !isPlainObject(server.env)) continue;
            const storedEnv = storedServers[name]?.env;
            if (!isPlainObject(storedEnv)) continue;
            for (const key of Object.keys(server.env)) {
                if (server.env[key] === REDACTED && typeof storedEnv[key] === 'string') {
                    server.env[key] = storedEnv[key];
                }
            }
        }
    }
    return merged;
}

module.exports = {
    REDACTED,
    SECRET_PATHS,
    LOCAL_ADMIN_ONLY_MESSAGE,
    parseAllowedOrigins,
    isLoopbackAddress,
    isTrustedLocalOrigin,
    isLocalRequest,
    extractRequestToken,
    safeTokenEqual,
    createLocalAdminGuard,
    redactConfigForRemote,
    redactMcpConfigForRemote,
    redactMcpServers,
    redactSecretFlags,
    mergeRedactedSecrets,
};
