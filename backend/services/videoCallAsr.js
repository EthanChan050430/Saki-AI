const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { join } = require('node:path');
const { existsSync } = require('node:fs');

const SCRIPT = join(__dirname, 'videoCallAsr.py');

// The worker needs a Python interpreter; the repository venv is preferred so the
// transcribe dependencies do not have to be installed globally.
function resolvePython() {
    if (process.env.SAKI_ASR_PYTHON) return process.env.SAKI_ASR_PYTHON;
    const windows = process.platform === 'win32';
    const environment = join(__dirname, '../../.venv-video-call', windows ? 'Scripts/python.exe' : 'bin/python');
    if (existsSync(environment)) return environment;
    return windows ? 'python' : 'python3';
}

function createVideoCallAsr() {
    let worker, ready, info;
    let sequence = 0;
    const jobs = new Map();
    const unavailable = () => new Error('本地语音识别未就绪');

    function start() {
        if (ready) return ready;
        ready = new Promise((resolve, reject) => {
            const child = spawn(resolvePython(), ['-u', process.env.SAKI_ASR_SCRIPT || SCRIPT], {
                windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'],
            });
            worker = child;
            const rows = createInterface({ input: child.stdout });
            // First use may download and warm a model, so this budget is generous.
            const timer = setTimeout(() => child.kill(), 180000);
            const stop = () => {
                if (worker !== child) return;
                clearTimeout(timer);
                info = undefined;
                reject(unavailable());
                ready = worker = null;
                for (const job of jobs.values()) job.reject(unavailable());
                jobs.clear();
                rows.close();
            };
            child.once('error', stop);
            child.once('exit', stop);
            child.stdin.on('error', stop);
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
        // The worker holds a loaded model and its stdin open, so shutdown has to
        // be explicit or the process (and any test runner) never exits.
        stop() {
            const child = worker;
            ready = worker = null;
            info = undefined;
            for (const job of jobs.values()) job.reject(unavailable());
            jobs.clear();
            if (!child) return;
            child.stdin.end();
            child.kill();
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
