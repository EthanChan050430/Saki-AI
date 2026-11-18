'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fsp = require('node:fs/promises');

const {
    SESSION_FORMAT_VERSION,
    SESSION_FORMAT_NAME,
    isSessionRecord,
    migrateSessionRecord,
    migrateV0ToV1,
    writeJsonAtomic,
    writeSessionFile,
    readSessionFile,
    listOrphanedTemps,
} = require('../services/sessionFormat.js');

let tempRoot = '';

before(async () => {
    tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'saki-session-'));
});

after(async () => {
    await fsp.rm(tempRoot, { recursive: true, force: true });
});

function file(name) {
    return path.join(tempRoot, name);
}

describe('isSessionRecord', () => {
    it('recognises a session by its messages array or format marker', () => {
        assert.equal(isSessionRecord({ messages: [] }), true);
        assert.equal(isSessionRecord({ format: SESSION_FORMAT_NAME }), true);
        assert.equal(isSessionRecord({ provider: 'x' }), false);
        assert.equal(isSessionRecord([]), false);
        assert.equal(isSessionRecord(null), false);
    });
});

describe('migrateV0ToV1', () => {
    it('stamps the format and drops messages no provider can render', () => {
        const migrated = migrateV0ToV1({
            messages: [
                { role: 'user', content: 'hi' },
                { role: 'assistant', parts: [{ type: 'text', content: 'hello' }] },
                { content: 'no role' },
                { role: 'user' },
                { role: 'user', content: 'kept' },
            ],
            title: 'demo',
        });
        assert.equal(migrated.version, 1);
        assert.equal(migrated.format, SESSION_FORMAT_NAME);
        assert.equal(migrated.messages.length, 3);
        assert.equal(migrated.droppedMessageCount, 2);
        assert.equal(migrated.title, 'demo');
        assert.ok(migrated.migratedAt);
    });

    it('preserves unknown fields instead of rewriting the document', () => {
        const migrated = migrateV0ToV1({ messages: [], checkpointRestoredAt: 42, extra: { a: 1 } });
        assert.equal(migrated.checkpointRestoredAt, 42);
        assert.deepEqual(migrated.extra, { a: 1 });
    });
});

describe('migrateSessionRecord', () => {
    it('is idempotent', () => {
        const once = migrateSessionRecord({ messages: [{ role: 'user', content: 'x' }] });
        const twice = migrateSessionRecord(once);
        assert.equal(twice.version, 1);
        assert.deepEqual(twice.messages, once.messages);
    });

    it('leaves a document from a newer format untouched', () => {
        const future = { version: SESSION_FORMAT_VERSION + 5, messages: [], futureField: true };
        assert.deepEqual(migrateSessionRecord(future), future);
    });

    it('returns non-objects unchanged', () => {
        assert.equal(migrateSessionRecord(null), null);
        assert.equal(migrateSessionRecord('x'), 'x');
    });
});

describe('writeJsonAtomic', () => {
    it('replaces the whole document and leaves no temporary sibling', async () => {
        const target = file('atomic.json');
        await writeJsonAtomic(target, { first: true });
        await writeJsonAtomic(target, { second: true });
        const parsed = JSON.parse(await fsp.readFile(target, 'utf8'));
        assert.deepEqual(parsed, { second: true });
        assert.deepEqual(await listOrphanedTemps(target), []);
    });

    it('propagates a serialization failure without touching the destination', async () => {
        const target = file('circular.json');
        await fsp.writeFile(target, '{"keep":true}', 'utf8');
        const circular = {};
        circular.self = circular;
        await assert.rejects(() => writeJsonAtomic(target, circular), /Cannot serialize/);
        assert.deepEqual(JSON.parse(await fsp.readFile(target, 'utf8')), { keep: true });
    });
});

describe('writeSessionFile', () => {
    it('stamps version and format', async () => {
        const target = file('stamped.json');
        await writeSessionFile(target, { messages: [], title: 't' });
        const parsed = JSON.parse(await fsp.readFile(target, 'utf8'));
        assert.equal(parsed.version, SESSION_FORMAT_VERSION);
        assert.equal(parsed.format, SESSION_FORMAT_NAME);
        assert.equal(parsed.title, 't');
    });

    it('rejects a non-object record', async () => {
        await assert.rejects(() => writeSessionFile(file('bad.json'), null), /plain object/);
    });
});

describe('readSessionFile', () => {
    it('repairs reversed call turns on read and saves the corrected order', async () => {
        const target = file('call-history.json');
        const greeting = { role: 'assistant', id: 'greeting', content: 'Hello' };
        const user = { role: 'user', id: 'call-time-first-0-u', content: 'A question', videoCall: true };
        const reply = { role: 'assistant', id: 'call-time-first-1-a', parts: [{ type: 'text', content: 'An answer' }], videoCall: true };
        const otherUser = { ...user, id: 'call-time-second-0-u' };
        const otherReply = { ...reply, id: 'call-time-second-1-a' };
        const orphan = { ...reply, id: 'call-time-first-4-a' };
        const session = {
            version: SESSION_FORMAT_VERSION,
            messages: [greeting, reply, user, orphan, otherReply, otherUser],
        };
        const expected = [greeting, user, reply, orphan, otherUser, otherReply];
        await fsp.writeFile(target, JSON.stringify(session), 'utf8');
        assert.deepEqual((await readSessionFile(target)).record.messages, expected);
        await writeSessionFile(target, session);
        assert.deepEqual(JSON.parse(await fsp.readFile(target, 'utf8')).messages, expected);
        assert.deepEqual((await readSessionFile(target)).record.messages, expected);
    });

    it('upgrades an unversioned file on read', async () => {
        const target = file('legacy.json');
        await fsp.writeFile(target, JSON.stringify({ messages: [{ role: 'user', content: 'old' }, { bogus: true }] }), 'utf8');
        const result = await readSessionFile(target);
        assert.equal(result.recoveredFrom, null);
        assert.equal(result.record.version, 1);
        assert.equal(result.record.messages.length, 1);
        assert.equal(result.record.droppedMessageCount, 1);
    });

    it('recovers the newest complete temporary file when the primary is unreadable', async () => {
        const target = file('crashed.json');
        const older = `${target}.tmp-1-aaa`;
        const newer = `${target}.tmp-2-bbb`;
        await fsp.writeFile(older, JSON.stringify({ messages: [{ role: 'user', content: 'older' }] }), 'utf8');
        await new Promise(resolve => { setTimeout(resolve, 20); });
        await fsp.writeFile(newer, JSON.stringify({ messages: [{ role: 'user', content: 'newer' }] }), 'utf8');
        await fsp.writeFile(target, '{"messages":[{"role":"user","content":"trunc', 'utf8');

        const result = await readSessionFile(target);
        assert.equal(result.recoveredFrom, newer);
        assert.equal(result.record.messages[0].content, 'newer');
    });

    it('returns null when neither the primary nor a temporary file parses', async () => {
        const target = file('gone.json');
        await fsp.writeFile(target, 'not json', 'utf8');
        assert.equal(await readSessionFile(target), null);
        assert.equal(await readSessionFile(file('missing.json')), null);
    });

    it('does not treat a config-shaped document as a session', async () => {
        const target = file('config.json');
        await fsp.writeFile(target, JSON.stringify({ provider: 'ollama' }), 'utf8');
        assert.equal(await readSessionFile(target), null);
    });
});
