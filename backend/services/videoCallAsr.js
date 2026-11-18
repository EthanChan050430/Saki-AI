const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { join } = require('node:path');
const { existsSync } = require('node:fs');

const SCRIPT = join(__dirname, 'videoCallAsr.py');
const windows = process.platform === 'win32';
const venvPython = join(__dirname, '../../.venv-video-call', windows ? 'Scripts/python.exe' : 'bin/python');

// The worker needs a Python interpreter; the repository venv is preferred so the
// transcribe dependencies do not have to be installed globally.
function resolvePython() {
    if (process.env.SAKI_ASR_PYTHON) return process.env.SAKI_ASR_PYTHON;
    if (existsSync(venvPython)) return venvPython;
    return windows ? 'python' : 'python3';
}

function serverAsrEnabled() {
    const setting = process.env.SAKI_ASR_ENABLED;
    if (setting === '0' || setting === '1') return setting === '1';
    return Boolean(process.env.SAKI_ASR_PYTHON) || existsSync(venvPython);
}

function createVideoCallAsr({ enabled = serverAsrEnabled() } = {}) {
    let worker, ready, info, stopWorker;
    let retryAt = 0;
    let sequence = 0;
    const jobs = new Map();
    const unavailable = () => new Error('本地语音识别未就绪');
    const canStart = () => enabled && Date.now() >= retryAt;

    function start() {
        if (ready) return ready;
        if (!canStart()) return Promise.reject(unavailable());
        ready = new Promise((resolve, reject) => {
            const child = spawn(resolvePython(), ['-u', process.env.SAKI_ASR_SCRIPT || SCRIPT], {
                windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
            });
            worker = child;
            const rows = createInterface({ input: child.stdout });
            let stderr = '';
            child.stderr.setEncoding('utf8').on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
            // First use may download and warm a model, so this budget is generous.
            const timer = setTimeout(() => stop('startup timed out'), 180000);
            const stop = reason => {
                if (worker !== child) return;
                clearTimeout(timer);
                if (reason) {
                    if (!info) retryAt = Date.now() + 30_000;
                    console.warn(`[VideoCall] ASR worker stopped: ${reason}${stderr.trim() ? '\n' + stderr.trim() : ''}`);
                }
                info = undefined;
                reject(unavailable());
                ready = worker = stopWorker = null;
                for (const job of jobs.values()) job.reject(unavailable());
                jobs.clear();
                rows.close();
                if (child.exitCode === null && child.signalCode === null) child.kill();
            };
            stopWorker = stop;
            child.once('error', error => stop(error.message));
            // Wait for stderr before logging a process exit.
            child.once('close', (code, signal) => stop(signal || `exit ${code}`));
            child.stdin.on('error', () => {});
            rows.on('line', line => {
                let value;
                try { value = JSON.parse(line); } catch { return; }
                if (value.ready) {
                    clearTimeout(timer);
                    info = { device: value.device, model: value.model, loadMs: value.loadMs };
                    console.log(`[VideoCall] 本机语音识别已就绪：${info.model} on ${info.device} (${info.loadMs}ms)`);
                    resolve(info);
                    return;
                }
                const job = jobs.get(value.id);
                if (!job) return;
                if (value.error) job.reject(unavailable());
                else job.resolve(value.text || '');
            });
        });
        return ready;
    }

    return {
        warm: start,
        status: () => info,
        readiness() {
            if (info) return { state: 'ready', ...info };
            if (!canStart()) return { state: 'unavailable' };
            void start().catch(() => {});
            return { state: 'starting' };
        },
        // The worker holds a loaded model and its stdin open, so shutdown has to
        // be explicit or the process (and any test runner) never exits.
        stop() {
            stopWorker?.();
            retryAt = 0;
        },
        async transcribe(buffer, language, signal) {
            await start();
            if (signal.aborted) return '';
            if (jobs.size >= 8) throw unavailable();
            const id = ++sequence;
            return new Promise((resolve, reject) => {
                const finish = (callback, value) => {
                    clearTimeout(timer);
                    signal.removeEventListener('abort', abort);
                    jobs.delete(id);
                    callback(value);
                };
                const abort = () => finish(resolve, '');
                const fail = error => finish(reject, error);
                const timer = setTimeout(() => fail(unavailable()), 20000);
                jobs.set(id, { resolve: text => finish(resolve, text), reject: fail });
                signal.addEventListener('abort', abort, { once: true });
                worker.stdin.write(JSON.stringify({ id, audio: buffer.toString('base64'), language }) + '\n', error => {
                    if (error) fail(unavailable());
                });
            });
        },
    };
}

module.exports = { createVideoCallAsr, resolvePython };
