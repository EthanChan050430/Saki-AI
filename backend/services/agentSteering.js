'use strict';

const { randomUUID } = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs/promises');

const LIMITS = Object.freeze({ textBytes: 32 * 1024, files: 8, fileBytes: 5 * 1024 * 1024, totalFileBytes: 10 * 1024 * 1024, contentBytes: 128 * 1024, messages: 100 });
function fail(statusCode, code) {
    throw Object.assign(new Error(code), { statusCode });
}
function validId(id) {
    return (typeof id === 'string' && id.trim().length > 0 && id.length <= 200)
        || (typeof id === 'number' && Number.isSafeInteger(id));
}

// Only references to already uploaded regular files are accepted. No arbitrary
// workspace reads, remote URLs, parsing services, or caller-supplied base64.
async function validateSteering(body, uploadsDir) {
    if (!body || !validId(body.assistantMsgId)) fail(400, 'invalid_assistantMsgId');
    const text = body.text === undefined ? '' : body.text;
    if (typeof text !== 'string') fail(400, 'invalid_text');
    if (Buffer.byteLength(text) > LIMITS.textBytes) fail(413, 'text_too_large');
    const files = body.files === undefined ? [] : body.files;
    if (!Array.isArray(files) || files.length > LIMITS.files) fail(400, 'invalid_files');
    if (!text.trim() && !files.length) fail(400, 'empty_steering');
    const normalized = [];
    const images = [];
    let total = 0;
    const root = files.length ? await fs.realpath(uploadsDir) : '';
    for (const file of files) {
        if (!file || typeof file.path !== 'string' || file.path.length > 4096) fail(400, 'invalid_file_path');
        let realPath, stat;
        try {
            realPath = await fs.realpath(file.path);
            const relative = path.relative(root, realPath);
            if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) fail(400, 'file_outside_uploads');
            stat = await fs.stat(realPath);
        } catch (error) {
            if (error.statusCode) throw error;
            fail(400, 'file_not_found');
        }
        if (!stat.isFile()) fail(400, 'invalid_file');
        total += stat.size;
        if (stat.size > LIMITS.fileBytes || total > LIMITS.totalFileBytes) fail(413, 'files_too_large');
        const name = file.name || file.filename || path.basename(realPath);
        if (typeof name !== 'string' || name.length > 255 || /[\r\n\0]/.test(name)) fail(400, 'invalid_file_name');
        const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }[path.extname(realPath).toLowerCase()];
        const content = file.content === undefined ? '' : file.content;
        if (typeof content !== 'string') fail(400, 'invalid_file_content');
        if (Buffer.byteLength(content) > LIMITS.contentBytes) fail(413, 'file_content_too_large');
        normalized.push({ name, path: realPath, size: stat.size, isImage: Boolean(mime), content: mime ? '' : content });
        if (mime) {
            const bytes = await fs.readFile(realPath);
            if (bytes.length > LIMITS.fileBytes) fail(413, 'files_too_large');
            images.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${bytes.toString('base64')}` } });
        }
    }
    return { assistantMsgId: body.assistantMsgId, text: text.trim(), files: normalized, images };
}

function createSteeringController({ chatId, assistantMsgId, emit = () => {} }) {
    const records = [];
    const pending = [];
    let closed = false;
    let persist = null;
    const event = (status, steering) => ({ type: 'steering', status, chatId, assistantMsgId, steering });
    return {
        records,
        get pending() { return pending.length > 0; },
        bind(assistant, save) { assistant.steeringMessages = records; persist = save; },
        assertAccepting(id) {
            if (String(id) !== String(assistantMsgId)) fail(409, 'run_binding_mismatch');
            if (closed) fail(409, 'run_not_accepting');
            if (!persist) fail(409, 'run_not_ready');
            if (records.length >= LIMITS.messages) fail(429, 'steering_limit');
        },
        async accept(input) {
            this.assertAccepting(input.assistantMsgId);
            const record = { id: randomUUID(), text: input.text, files: input.files, status: 'accepted', acceptedAt: new Date().toISOString() };
            records.push(record);
            // The durability promise also orders accepted before applied, even if
            // a model request finishes while the session write is in progress.
            const entry = { record, images: input.images || [] };
            entry.ready = Promise.resolve().then(persist).then(() => emit(event('accepted', { ...record, status: 'accepted' }))).catch(error => {
                closed = true;
                throw error;
            });
            pending.push(entry);
            await entry.ready;
            return event('accepted', { ...record, status: 'accepted' });
        },
        async apply(messages, provider) {
            const batch = pending.splice(0);
            for (const entry of batch) {
                await entry.ready;
                const { record, images } = entry;
                const text = `User steering update (latest instructions for the current task):\n${record.text}\n${record.files.map(file => `Attachment: ${file.name}\nPath: ${file.path}\n${file.content}`).join('\n\n')}`;
                const blocks = [{ type: 'text', text }, ...images];
                const last = messages[messages.length - 1];
                if (provider === 'anthropic' && last?.role === 'user') {
                    last.content = [...(Array.isArray(last.content) ? last.content : [{ type: 'text', text: String(last.content || '') }]), ...blocks];
                } else {
                    messages.push({ role: 'user', content: images.length ? blocks : text });
                }
                record.status = 'applied';
                record.appliedAt = new Date().toISOString();
                await persist();
                emit(event('applied', { ...record }));
            }
            return batch.length;
        },
        // Synchronous gate: no acceptance can race final persistence/end.
        tryFinish() { if (pending.length) return false; closed = true; return true; },
        close() { closed = true; },
    };
}

function createSteeringHandler({ runs, uploadsDir }) {
    return async (req, res) => {
        try {
            const run = runs.get(req.params.chatId);
            if (!run || run.destroyed || run.writableEnded) fail(409, 'run_not_running');
            if (run.mode !== 'agent' || !run.steering) fail(409, 'steering_unsupported');
            run.steering.assertAccepting(req.body?.assistantMsgId);
            const input = await validateSteering(req.body, uploadsDir);
            // Validation performs IO. Recheck identity before touching a run.
            if (runs.get(req.params.chatId) !== run || run.destroyed || run.writableEnded) fail(409, 'run_changed');
            const accepted = await run.steering.accept(input);
            res.status(202).json(accepted);
        } catch (error) {
            res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'steering_persistence_failed' });
        }
    };
}

function emitRunOutcome(res, outcome, details = {}) {
    if (res._runOutcome || res.writableEnded || res.destroyed) return;
    res._runOutcome = outcome;
    res.steering?.close();
    res.write(`data: ${JSON.stringify({ type: 'runOutcome', ...details, outcome, chatId: res.chatId, assistantMsgId: res.assistantMsgId })}\n\n`);
}

function formatSteeringHistory(message = {}) {
    return (Array.isArray(message.steeringMessages) ? message.steeringMessages : [])
        .filter(record => record.status === 'applied')
        .map(record => `Historical user steering (applied):\n${record.text || ''}\n${(record.files || []).map(file =>
            `Attachment: ${file.name}\nPath: ${file.path}\n${file.content || ''}`).join('\n\n')}`)
        .join('\n\n');
}

function preserveSteeringMessages(incoming, existing = []) {
    const saved = new Map((existing || []).filter(message => message.role === 'assistant' && Array.isArray(message.steeringMessages))
        .map(message => [String(message.id), message.steeringMessages]));
    return incoming.map(message => saved.has(String(message.id)) && message.role === 'assistant'
        ? { ...message, steeringMessages: saved.get(String(message.id)) } : message);
}

module.exports = { LIMITS, validateSteering, createSteeringController, createSteeringHandler, emitRunOutcome, preserveSteeringMessages, formatSteeringHistory };