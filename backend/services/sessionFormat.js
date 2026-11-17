'use strict';

/**
 * Durable session storage.
 *
 * Sessions used to be written with `fs.writeJson(path, data)`, which truncates
 * the existing file before writing the new bytes. A crash, a full disk, or a
 * killed process in that window left an unparseable session behind, and there
 * was no version field to migrate afterwards.
 *
 * This module keeps three guarantees:
 *
 * 1. Atomic replacement - the new document is written to a sibling temp file,
 *    fsynced, then renamed over the target, so readers always see either the
 *    complete old document or the complete new one.
 * 2. Crash recovery - an orphaned temp file from an interrupted write is the
 *    newest complete document on disk; it is used when the primary file cannot
 *    be parsed.
 * 3. Format versioning - every write stamps `version`, and every read runs an
 *    ordered migration chain. Adding a future format means appending one entry
 *    to MIGRATIONS instead of guessing whether a file can be read.
 */

const crypto = require('node:crypto');
const path = require('node:path');
const fsp = require('node:fs/promises');

/** Current on-disk session format. Bump together with a MIGRATIONS entry. */
const SESSION_FORMAT_VERSION = 1;

const SESSION_FORMAT_NAME = 'saki-chat-session';

const TEMP_INFIX = '.tmp-';

const RENAME_RETRY_DELAYS_MS = [10, 30, 90];

const RENAME_RETRY_CODES = new Set(['EPERM', 'EACCES', 'EBUSY', 'ENOTEMPTY']);

/** Files already reported as migrated, so a long-running server logs once each. */
const reportedMigrations = new Set();

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** True when a parsed document looks like a chat session rather than config or a checkpoint. */
function isSessionRecord(value) {
    return isPlainObject(value)
        && (Array.isArray(value.messages) || value.format === SESSION_FORMAT_NAME);
}

function readSessionVersion(record) {
    if (!isPlainObject(record)) return 0;
    const version = Number(record.version);
    return Number.isInteger(version) && version > 0 ? version : 0;
}

function normalizeMessage(message) {
    if (!isPlainObject(message)) return null;
    if (typeof message.role !== 'string' || !message.role) return null;
    // `parts` is the structured form used by the UI; `content` is the wire form.
    // Either may legitimately be absent, but both being absent makes the message
    // unrenderable, so it is dropped rather than shipped to a provider.
    if (message.content === undefined && message.parts === undefined) return null;
    return message;
}

/**
 * v0 (unversioned) -> v1.
 *
 * v0 files were written without any version field. The observable difference is
 * that a v0 session may contain messages without a usable role or body, which
 * downstream providers reject. v1 guarantees `version`, `format`, and a clean
 * `messages` array, and preserves every other field untouched.
 */
function migrateV0ToV1(record) {
    const next = { ...record };
    next.format = SESSION_FORMAT_NAME;
    next.version = 1;
    const rawMessages = Array.isArray(record.messages) ? record.messages : [];
    const messages = rawMessages.map(normalizeMessage).filter(Boolean);
    next.messages = messages;
    next.droppedMessageCount = Math.max(
        Number(record.droppedMessageCount) || 0,
        rawMessages.length - messages.length,
    );
    if (!next.migratedAt) next.migratedAt = new Date().toISOString();
    return next;
}

/** Ordered upgrade chain. Each entry maps version N to N+1. */
const MIGRATIONS = Object.freeze([migrateV0ToV1]);

/**
 * Upgrades a session document to SESSION_FORMAT_VERSION.
 *
 * Idempotent, and never throws for a document that is already usable: an
 * unknown future version is returned untouched so a newer build's data is not
 * silently downgraded by an older one.
 */
function migrateSessionRecord(record) {
    if (!isPlainObject(record)) return record;
    let version = readSessionVersion(record);
    if (version > SESSION_FORMAT_VERSION) return record;
    let next = record;
    while (version < SESSION_FORMAT_VERSION) {
        const migration = MIGRATIONS[version];
        if (typeof migration !== 'function') break;
        next = migration(next);
        const upgraded = readSessionVersion(next);
        if (upgraded <= version) break; // a migration that did not advance is a bug, not a loop
        version = upgraded;
    }
    return next;
}

function reportMigrationOnce(filePath, fromVersion, toVersion) {
    if (reportedMigrations.has(filePath)) return;
    reportedMigrations.add(filePath);
    console.warn(`[Session] Migrated ${path.basename(filePath)} from format v${fromVersion} to v${toVersion}`);
}

async function sleep(ms) {
    await new Promise(resolve => { setTimeout(resolve, ms); });
}

function isRetryableRenameError(error) {
    return RENAME_RETRY_CODES.has(String(error?.code || ''));
}

/**
 * Writes JSON so that the destination file is never observed half-written.
 *
 * The temp file is created exclusively (`wx`, 0600) in the same directory so the
 * rename stays on one volume, then fsynced before the rename makes it visible.
 */
async function writeJsonAtomic(filePath, value, { indent = 2, mode = 0o600 } = {}) {
    const directory = path.dirname(filePath);
    await fsp.mkdir(directory, { recursive: true });
    const tempPath = `${filePath}${TEMP_INFIX}${process.pid}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
    let payload;
    try {
        payload = `${JSON.stringify(value, null, indent)}\n`;
    } catch (error) {
        throw Object.assign(new Error(`Cannot serialize ${path.basename(filePath)}: ${error.message}`), {
            code: 'SESSION_SERIALIZE_FAILED',
            cause: error,
        });
    }

    let handle;
    try {
        handle = await fsp.open(tempPath, 'wx', mode);
        await handle.writeFile(payload, 'utf8');
        await handle.sync();
    } catch (error) {
        if (handle) await handle.close().catch(() => {});
        await fsp.rm(tempPath, { force: true }).catch(() => {});
        throw error;
    }
    await handle.close();

    let lastError = null;
    for (let attempt = 0; attempt <= RENAME_RETRY_DELAYS_MS.length; attempt += 1) {
        try {
            await fsp.rename(tempPath, filePath);
            return tempPath;
        } catch (error) {
            lastError = error;
            if (!isRetryableRenameError(error) || attempt === RENAME_RETRY_DELAYS_MS.length) break;
            // Antivirus and indexers hold transient handles on Windows.
            await sleep(RENAME_RETRY_DELAYS_MS[attempt]);
        }
    }
    await fsp.rm(tempPath, { force: true }).catch(() => {});
    throw lastError;
}

/**
 * Writes one session document: stamps the format version, then replaces the file
 * atomically. Unknown fields from the caller are preserved.
 */
async function writeSessionFile(filePath, record) {
    if (!isPlainObject(record)) {
        throw Object.assign(new Error('Session record must be a plain object.'), { code: 'SESSION_INVALID_RECORD' });
    }
    const payload = {
        ...record,
        format: SESSION_FORMAT_NAME,
        version: SESSION_FORMAT_VERSION,
    };
    return writeJsonAtomic(filePath, payload);
}

function parseSessionJson(raw) {
    if (typeof raw !== 'string' || !raw.trim()) return null;
    try {
        const parsed = JSON.parse(raw);
        return isSessionRecord(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

/**
 * Lists orphaned temp documents for `filePath`, newest first.
 *
 * Bounded on purpose: a directory of thousands of sessions must not turn one
 * recovery attempt into a full scan of the data directory.
 */
async function listOrphanedTemps(filePath, limit = 8) {
    const directory = path.dirname(filePath);
    const base = path.basename(filePath);
    const names = await fsp.readdir(directory).catch(() => []);
    const candidates = [];
    for (const name of names) {
        if (!name.startsWith(`${base}${TEMP_INFIX}`)) continue;
        const full = path.join(directory, name);
        const stats = await fsp.stat(full).catch(() => null);
        if (!stats || !stats.isFile()) continue;
        candidates.push({ full, mtimeMs: stats.mtimeMs });
    }
    candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
    return candidates.slice(0, limit).map(candidate => candidate.full);
}

/**
 * Reads a session document with crash recovery and migration applied.
 *
 * Order of attempts: the primary file, then orphaned temp files newest-first.
 * Returns `{ record, recoveredFrom }`, or `null` when nothing parseable exists.
 */
async function readSessionFile(filePath) {
    const primaryRaw = await fsp.readFile(filePath, 'utf8').catch(() => null);
    const primary = parseSessionJson(primaryRaw);
    if (primary) {
        const fromVersion = readSessionVersion(primary);
        const migrated = migrateSessionRecord(primary);
        if (fromVersion < SESSION_FORMAT_VERSION) {
            reportMigrationOnce(filePath, fromVersion, SESSION_FORMAT_VERSION);
        }
        return { record: migrated, recoveredFrom: null };
    }

    for (const tempPath of await listOrphanedTemps(filePath)) {
        const raw = await fsp.readFile(tempPath, 'utf8').catch(() => null);
        const parsed = parseSessionJson(raw);
        if (!parsed) continue;
        console.warn(`[Session] Recovered ${path.basename(filePath)} from ${path.basename(tempPath)}`);
        return { record: migrateSessionRecord(parsed), recoveredFrom: tempPath };
    }
    return null;
}

module.exports = {
    SESSION_FORMAT_VERSION,
    SESSION_FORMAT_NAME,
    TEMP_INFIX,
    isSessionRecord,
    readSessionVersion,
    migrateSessionRecord,
    migrateV0ToV1,
    writeJsonAtomic,
    writeSessionFile,
    readSessionFile,
    listOrphanedTemps,
};
