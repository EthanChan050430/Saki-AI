'use strict';

const path = require('node:path');
const fs = require('fs-extra');
const { randomUUID } = require('node:crypto');
const { mentionsDeletedMemory } = require('./memoryLifecycle');

const initialState = () => ({ version: 1, jobs: [], completedIds: [] });

async function atomicJson(filePath, data) {
    const tmp = `${filePath}.${randomUUID()}.tmp`;
    try {
        await fs.writeJson(tmp, data, { spaces: 2 });
        await fs.rename(tmp, filePath);
    } finally {
        await fs.remove(tmp);
    }
}

class MemoryCaptureQueue {
    constructor({ dataDir, handler, pollIntervalMs = 15000, retryBaseMs = 5000, maxAttempts = 8 }) {
        if (typeof handler !== 'function') throw new Error('Memory capture handler is required');
        this.filePath = path.join(dataDir, 'memory_capture_jobs.json');
        this.handler = handler;
        this.pollIntervalMs = pollIntervalMs;
        this.retryBaseMs = retryBaseMs;
        this.maxAttempts = maxAttempts;
        this.serial = Promise.resolve();
        this.initializing = null;
        this.processing = false;
        this.timer = null;
    }

    _exclusive(operation) {
        const result = this.serial.then(operation);
        this.serial = result.catch(() => {});
        return result;
    }

    async init() {
        if (!this.initializing) this.initializing = this._exclusive(async () => {
            await fs.ensureDir(path.dirname(this.filePath));
            if (!(await fs.pathExists(this.filePath))) await atomicJson(this.filePath, initialState());
            const state = await fs.readJson(this.filePath);
            if (!Array.isArray(state.jobs) || !Array.isArray(state.completedIds)) {
                throw new Error('Invalid capture queue; refusing to discard pending memory jobs');
            }
            let changed = false;
            for (const job of state.jobs) {
                if (job.status === 'running') {
                    job.status = 'pending';
                    job.nextAttemptAt = Date.now();
                    changed = true;
                }
            }
            if (changed) await atomicJson(this.filePath, state);
        }).catch(error => {
            this.initializing = null;
            throw error;
        });
        return this.initializing;
    }

    async _edit(mutator) {
        await this.init();
        return this._exclusive(async () => {
            const state = await fs.readJson(this.filePath);
            if (!Array.isArray(state.jobs) || !Array.isArray(state.completedIds)) {
                throw new Error('Invalid capture queue; refusing to overwrite it');
            }
            const result = await mutator(state);
            await atomicJson(this.filePath, state);
            return result;
        });
    }

    async enqueue(job) {
        if (!job || !job.id || !job.chatId || typeof job.userMessage !== 'string') {
            throw new Error('Memory capture job requires id, chatId, and userMessage');
        }
        const id = String(job.id);
        const accepted = await this._edit(state => {
            if (state.completedIds.includes(id) || state.jobs.some(item => item.id === id)) return false;
            state.jobs.push({
                id,
                chatId: String(job.chatId),
                userMessage: job.userMessage,
                assistantMessage: String(job.assistantMessage || ''),
                notes: String(job.notes || ''),
                provider: String(job.provider || ''),
                model: String(job.model || ''),
                ollamaUrl: String(job.ollamaUrl || ''),
                status: 'pending',
                attempts: 0,
                createdAt: new Date().toISOString(),
                nextAttemptAt: Date.now(),
                lastError: '',
            });
            return true;
        });
        this.pump().catch(error => console.warn('[MemoryCaptureQueue] Worker failed:', error.message));
        return accepted;
    }

    async start() {
        await this.init();
        if (this.timer) return;
        this.timer = setInterval(() => {
            this.pump().catch(error => console.warn('[MemoryCaptureQueue] Worker failed:', error.message));
        }, this.pollIntervalMs);
        this.timer.unref?.();
        this.pump().catch(error => console.warn('[MemoryCaptureQueue] Worker failed:', error.message));
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    async pump() {
        if (this.processing) return false;
        this.processing = true;
        try {
            const job = await this._edit(state => {
                const item = state.jobs.find(entry => entry.status === 'pending' && entry.nextAttemptAt <= Date.now());
                if (!item) return null;
                item.status = 'running';
                item.attempts++;
                return { ...item };
            });
            if (!job) return false;
            try {
                await this.handler(job);
                await this._edit(state => {
                    state.jobs = state.jobs.filter(item => item.id !== job.id);
                    state.completedIds = [job.id, ...state.completedIds.filter(id => id !== job.id)].slice(0, 200);
                });
            } catch (error) {
                await this._edit(state => {
                    const item = state.jobs.find(entry => entry.id === job.id);
                    if (!item) return;
                    item.lastError = String(error?.message || error).slice(0, 500);
                    item.status = item.attempts >= this.maxAttempts ? 'failed' : 'pending';
                    item.nextAttemptAt = Date.now() + Math.min(30 * 60 * 1000, this.retryBaseMs * (2 ** (item.attempts - 1)));
                });
                console.warn('[MemoryCaptureQueue] Capture failed; job retained:', job.id, error.message);
            }
            // Drain jobs without waiting for the polling interval.
            setImmediate(() => this.pump().catch(error => console.warn('[MemoryCaptureQueue]', error.message)));
            return true;
        } finally {
            this.processing = false;
        }
    }

    async status() {
        await this.init();
        const state = await fs.readJson(this.filePath);
        return {
            pending: state.jobs.filter(job => job.status === 'pending').length,
            failed: state.jobs.filter(job => job.status === 'failed').length,
            running: state.jobs.filter(job => job.status === 'running').length,
        };
    }

    async dropForDeletedMemory(memory) {
        return this._edit(state => {
            const before = state.jobs.length;
            state.jobs = state.jobs.filter(job => !mentionsDeletedMemory(
                [job.userMessage, job.assistantMessage, job.notes].join('\n'), memory
            ));
            return before - state.jobs.length;
        });
    }

    async retryFailed() {
        return this._edit(state => {
            let count = 0;
            for (const job of state.jobs) {
                if (job.status !== 'failed') continue;
                job.status = 'pending';
                job.attempts = 0;
                job.nextAttemptAt = Date.now();
                count++;
            }
            return count;
        });
    }
}

module.exports = { MemoryCaptureQueue };
