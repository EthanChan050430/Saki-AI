const axios = require('axios');
const http = require('http');
const https = require('https');
const { setTimeout: delay } = require('timers/promises');
const sharedHttpAgent = new http.Agent({ keepAlive: true, maxFreeSockets: 4, scheduling: 'lifo' });
const sharedHttpsAgent = new https.Agent({ keepAlive: true, maxFreeSockets: 4, scheduling: 'lifo' });

function summarizeModelError(error) {
    return {
        code: String(error?.code || 'UNKNOWN'),
        status: Number(error?.response?.status || 0) || undefined,
        message: String(error?.message || '模型调用失败')
            .replace(/Bearer\s+[^\s'"\\]+/gi, 'Bearer [REDACTED]')
            .replace(/\b(?:nvapi-|sk-)[A-Za-z0-9_-]+/g, '[REDACTED]')
            .slice(0, 800),
    };
}

function isTransientModelError(error) {
    if (error?.code === 'ERR_CANCELED' || error?.name === 'AbortError') return false;
    return ['ECONNRESET', 'EPIPE', 'EAI_AGAIN'].includes(error?.code)
        || [502, 503, 504].includes(Number(error?.response?.status));
}

// Retry only while waiting for response headers. Once a stream is returned,
// its consumer owns errors; replaying a partially delivered answer would duplicate it.
async function postModelStream(url, payload, options = {}, retryOptions = {}) {
    const { maxAttempts = 2, baseDelayMs = 250, logger = console } = retryOptions;
    const startedAt = Date.now();
    const deadline = options.timeout > 0 ? Date.now() + options.timeout : Infinity;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        options.signal?.throwIfAborted();
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw Object.assign(new Error('Model request deadline exceeded'), { code: 'ETIMEDOUT' });
        // Keep healthy sockets warm. Only a retry bypasses the pool in case an
        // upstream closed the reused socket before Node noticed.
        const httpAgent = attempt === 1 ? sharedHttpAgent : new http.Agent({ keepAlive: false });
        const httpsAgent = attempt === 1 ? sharedHttpsAgent : new https.Agent({ keepAlive: false });
        const cleanup = () => { if (attempt > 1) { httpAgent.destroy(); httpsAgent.destroy(); } };
        try {
            const response = await axios.post(url, payload, {
                ...options, httpAgent, httpsAgent, responseType: 'stream',
                ...(Number.isFinite(remaining) ? { timeout: remaining } : {}),
            });
            response.data.once('close', cleanup);
            logger.info?.('[Timing] Model response headers', { model: payload?.model, attempt, elapsedMs: Date.now() - startedAt });
            return response;
        } catch (error) {
            error.response?.data?.destroy?.();
            cleanup();
            if (options.signal?.aborted || attempt === maxAttempts || !isTransientModelError(error)) throw error;
            logger.warn('[LLM] Connection failed before response; retrying.', { attempt, ...summarizeModelError(error) });
            await delay(Math.min(baseDelayMs * attempt, Math.max(0, deadline - Date.now())), undefined, { signal: options.signal });
        }
    }
}

function modelFailureMessage(error, provider = '模型') {
    const { code, message } = summarizeModelError(error);
    if (['ECONNRESET', 'EPIPE'].includes(code)) {
        return `${provider}连接被上游中断 [${code}]，请稍后重试；如果持续发生，请检查网络或代理连接。`;
    }
    return `${provider}调用失败 [${code}]: ${message}`;
}

module.exports = { postModelStream, summarizeModelError, modelFailureMessage };
