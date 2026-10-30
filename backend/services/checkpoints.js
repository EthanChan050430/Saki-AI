const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

const inside = (root, target) => {
    const relative = path.relative(root, target);
    return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};
const failure = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const rootKey = root => process.platform === 'win32' ? path.resolve(root).toLowerCase() : path.resolve(root);

class CheckpointService {
    constructor({ storeDir, excludePaths = [], maxFiles = 100000, maxBytes = 2 * 1024 ** 3 }) {
        this.storeDir = path.resolve(storeDir);
        this.excludePaths = [this.storeDir, ...excludePaths.map(value => path.resolve(value))];
        this.maxFiles = maxFiles;
        this.maxBytes = maxBytes;
        this.hashCache = new Map();
        this.workspaceLocks = new Map();
        this.workspaceContext = new AsyncLocalStorage();
        this.sessionLocks = new Map();
    }

    turnId(chatId, messageId) {
        return `cp_${crypto.createHash('sha256').update(JSON.stringify([String(chatId), String(messageId)])).digest('hex')}`;
    }

    recordPath(id) {
        if (!/^cp_[a-f0-9]{64}$/.test(id)) throw failure('无效的检查点编号。', 400);
        return path.join(this.storeDir, 'records', `${id}.json`);
    }

    objectPath(hash) {
        if (!/^[a-f0-9]{64}$/.test(hash)) throw failure('检查点文件哈希无效。');
        return path.join(this.storeDir, 'objects', hash.slice(0, 2), hash);
    }

    excluded(absolute, relative) {
        return relative.split('/').some(segment => (process.platform === 'win32' ? segment.toLowerCase() : segment) === '.git') || this.excludePaths.some(root => inside(root, absolute));
    }

    async withSession(chatId, callback) {
        const key = String(chatId);
        const previous = this.sessionLocks.get(key) || Promise.resolve();
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        const queued = previous.catch(() => {}).then(() => gate);
        this.sessionLocks.set(key, queued);
        await previous.catch(() => {});
        try { return await callback(); }
        finally { release(); if (this.sessionLocks.get(key) === queued) this.sessionLocks.delete(key); }
    }

    async withWorkspace(root, callback) {
        const key = path.resolve(root);
        if ((this.workspaceContext.getStore() || []).some(owned => this.workspaceLocks.get(owned.root) === owned.token && inside(owned.root, key))) return callback();
        return this.withWorkspaces([key], callback);
    }

    async withWorkspaces(roots, callback) {
        const keys = [...new Map(roots.map(root => [rootKey(root), path.resolve(root)])).values()];
        const outer = keys.filter(key => !keys.some(parent => parent !== key && inside(parent, key)));
        if ([...this.workspaceLocks.keys()].some(active => outer.some(key => inside(active, key) || inside(key, active)))) {
            throw failure('此工作区仍有任务运行或正在还原，请先停止任务后重试。');
        }
        const token = Symbol('workspace-lease');
        outer.forEach(key => this.workspaceLocks.set(key, token));
        try { return await this.workspaceContext.run(outer.map(root => ({ root, token })), callback); }
        finally { outer.forEach(key => { if (this.workspaceLocks.get(key) === token) this.workspaceLocks.delete(key); }); }
    }

    async atomicJson(file, value) {
        await fs.ensureDir(path.dirname(file), { mode: 0o700 });
        const temporary = `${file}.${crypto.randomUUID()}.tmp`;
        try {
            await fs.writeJson(temporary, value, { mode: 0o600 });
            await fs.rename(temporary, file);
        } finally { await fs.unlink(temporary).catch(() => {}); }
    }

    async scan(root) {
        const entries = [];
        let bytes = 0;
        const walk = async (directory, prefix = '') => {
            const children = await fs.readdir(directory, { withFileTypes: true });
            children.sort((a, b) => a.name.localeCompare(b.name));
            for (const child of children) {
                const relative = prefix ? `${prefix}/${child.name}` : child.name;
                const absolute = path.join(directory, child.name);
                if (this.excluded(absolute, relative)) continue;
                const stat = await fs.lstat(absolute);
                const common = { path: relative, mode: stat.mode, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs, size: stat.size };
                if (stat.isSymbolicLink()) {
                    const target = await fs.readlink(absolute);
                    const isDirectory = (await fs.stat(absolute).catch(() => null))?.isDirectory() || false;
                    entries.push({ ...common, type: 'link', target, linkType: isDirectory ? 'junction' : 'file' });
                } else if (stat.isDirectory()) {
                    entries.push({ ...common, type: 'directory' });
                    await walk(absolute, relative);
                } else if (stat.isFile()) {
                    bytes += stat.size;
                    entries.push({ ...common, type: 'file' });
                } else throw failure(`检查点不支持此文件类型：${relative}`);
                if (entries.length > this.maxFiles || bytes > this.maxBytes) {
                    throw failure('工作区超出检查点容量限制，请选择更小的工作区或调整 CHECKPOINT_MAX_FILES / CHECKPOINT_MAX_BYTES。', 413);
                }
            }
        };
        try { await walk(root); }
        catch (error) { if (error.code !== 'ENOENT' || await fs.pathExists(root)) throw error; }
        return entries;
    }

    fingerprint(entry) {
        return JSON.stringify([entry.type, entry.mode, entry.mtimeMs, entry.ctimeMs, entry.size, entry.target]);
    }

    async storeFile(root, entry) {
        const source = path.join(root, entry.path);
        const cached = this.hashCache.get(source);
        const stamp = this.fingerprint(entry);
        if (cached?.stamp === stamp && await fs.pathExists(this.objectPath(cached.hash))) return cached.hash;
        const hash = crypto.createHash('sha256');
        const tempDirectory = path.join(this.storeDir, 'temporary');
        await fs.ensureDir(tempDirectory, { mode: 0o700 });
        const temporary = path.join(tempDirectory, crypto.randomUUID());
        const handle = await fs.promises.open(temporary, 'wx', 0o600);
        try {
            for await (const chunk of fs.createReadStream(source)) {
                hash.update(chunk);
                let offset = 0;
                while (offset < chunk.length) offset += (await handle.write(chunk, offset, chunk.length - offset)).bytesWritten;
            }
        } catch (error) {
            await handle.close();
            await fs.unlink(temporary).catch(() => {});
            throw error;
        }
        await handle.close();
        const digest = hash.digest('hex');
        const object = this.objectPath(digest);
        try {
            await fs.ensureDir(path.dirname(object), { mode: 0o700 });
            if (await fs.pathExists(object)) await fs.unlink(temporary);
            else await fs.rename(temporary, object);
        } catch (error) { await fs.unlink(temporary).catch(() => {}); throw error; }
        if (this.hashCache.size > this.maxFiles) this.hashCache.clear();
        this.hashCache.set(source, { stamp, hash: digest });
        return digest;
    }

    async capture(root) {
        await this.assertParents(root);
        const rootStat = await fs.lstat(root).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
        if (rootStat && (!rootStat.isDirectory() || rootStat.isSymbolicLink())) throw failure('工作区根目录已被替换，无法安全创建检查点。');
        await fs.ensureDir(path.join(this.storeDir, 'records'), { mode: 0o700 });
        await fs.ensureDir(path.join(this.storeDir, 'objects'), { mode: 0o700 });
        await fs.ensureDir(path.join(this.storeDir, 'temporary'), { mode: 0o700 });
        const entries = await this.scan(root);
        for (const entry of entries) if (entry.type === 'file') entry.hash = await this.storeFile(root, entry);
        const verified = await this.scan(root);
        if (entries.length !== verified.length || entries.some((entry, index) => entry.path !== verified[index].path || this.fingerprint(entry) !== this.fingerprint(verified[index]))) {
            throw failure('创建检查点时工作区文件发生变化，请等待其他写入完成后重试。');
        }
        return entries;
    }

    descriptor(record) {
        return { id: record.id, messageId: record.messageId, createdAt: record.createdAt, workspacePath: record.root };
    }

    async ensure({ chatId, messageId, root, beforeMessages, userMessage }) {
        const id = this.turnId(chatId, messageId);
        const existing = await fs.readJson(this.recordPath(id)).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
        if (existing) {
            if (existing.root !== root || String(existing.chatId) !== String(chatId)) throw failure('检查点工作区与当前请求不一致。');
            return this.descriptor(existing);
        }
        const record = {
            version: 1, id, chatId: String(chatId), messageId: String(messageId), root,
            createdAt: new Date().toISOString(), beforeMessages, userMessage,
            entries: await this.capture(root),
        };
        await this.atomicJson(this.recordPath(id), record);
        return this.descriptor(record);
    }

    async hydrate(chatId, messages) {
        return Promise.all((messages || []).map(async message => {
            if (message.role !== 'user' || !message.id) return message;
            const record = await fs.readJson(this.recordPath(this.turnId(chatId, message.id))).catch(() => null);
            return record ? { ...message, checkpoint: this.descriptor(record) } : message;
        }));
    }

    safePath(root, relative) {
        if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.split('/').some(piece => !piece || piece === '.' || piece === '..') || path.isAbsolute(relative)) {
            throw failure('检查点包含无效路径，已停止还原。');
        }
        const target = path.resolve(root, relative);
        if (!inside(root, target) || this.excluded(target, relative)) throw failure('检查点包含工作区外或受保护的路径。');
        return target;
    }

    async assertParents(target) {
        let directory = path.dirname(target);
        while (true) {
            const stat = await fs.lstat(directory).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
            if (stat?.isSymbolicLink()) throw failure(`还原路径的父目录是符号链接：${directory}`);
            const parent = path.dirname(directory);
            if (parent === directory) break;
            directory = parent;
        }
    }

    async validate(root, entries) {
        if (!path.isAbsolute(root) || !Array.isArray(entries) || entries.length > this.maxFiles) throw failure('检查点工作区或目录清单无效。');
        const names = new Set();
        const types = new Map(entries.map(entry => [entry.path, entry.type]));
        const verified = new Set();
        for (const entry of entries) {
            this.safePath(root, entry.path);
            if (names.has(entry.path)) throw failure('检查点包含重复路径。');
            names.add(entry.path);
            if (!['file', 'directory', 'link'].includes(entry.type)) throw failure('检查点文件类型无效。');
            if (entry.type === 'file' && !verified.has(entry.hash)) {
                const hash = crypto.createHash('sha256');
                for await (const chunk of fs.createReadStream(this.objectPath(entry.hash))) hash.update(chunk);
                if (hash.digest('hex') !== entry.hash) throw failure('检查点备份损坏，已停止还原。');
                verified.add(entry.hash);
            }
        }
        for (const entry of entries) {
            let parent = path.posix.dirname(entry.path);
            while (parent !== '.') {
                if (types.get(parent) !== 'directory') throw failure('检查点目录结构无效。');
                parent = path.posix.dirname(parent);
            }
        }
    }

    async apply(root, entries) {
        await this.assertParents(root);
        const rootStat = await fs.lstat(root).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
        if (rootStat && (!rootStat.isDirectory() || rootStat.isSymbolicLink())) throw failure('工作区根目录已被替换，无法安全还原。');
        await fs.ensureDir(root);
        const current = await this.scan(root);
        const currentEntries = new Map(current.map(entry => [entry.path, entry]));
        const desired = new Map(entries.map(entry => [entry.path, entry]));
        let restored = 0, removed = 0;
        for (const entry of [...current].sort((a, b) => b.path.split('/').length - a.path.split('/').length)) {
            const wanted = desired.get(entry.path);
            if (wanted?.type === entry.type && (entry.type !== 'link' || wanted.target === entry.target)) continue;
            const target = this.safePath(root, entry.path);
            await this.assertParents(target);
            if (entry.type === 'directory') {
                await fs.rmdir(target).catch(error => { if (!['ENOTEMPTY', 'EEXIST'].includes(error.code) || wanted) throw error; });
            } else {
                if (entry.type === 'file') await fs.chmod(target, 0o600);
                await fs.unlink(target);
            }
            if (!wanted && entry.type !== 'directory') removed++;
        }
        for (const entry of [...entries].sort((a, b) => a.path.split('/').length - b.path.split('/').length)) {
            const target = this.safePath(root, entry.path);
            await this.assertParents(target);
            if (entry.type === 'directory') { await fs.ensureDir(target); continue; }
            if (entry.type === 'link') {
                if (currentEntries.get(entry.path)?.type !== 'link' || currentEntries.get(entry.path)?.target !== entry.target) await fs.symlink(entry.target, target, entry.linkType);
                continue;
            }
            const candidate = currentEntries.get(entry.path);
            const currentEntry = candidate?.type === 'file' ? candidate : null;
            if (currentEntry && await this.storeFile(root, currentEntry) === entry.hash) {
                await fs.chmod(target, entry.mode & 0o777);
                await fs.utimes(target, new Date(entry.mtimeMs), new Date(entry.mtimeMs));
                continue;
            }
            const temporary = path.join(path.dirname(target), `.saki-restore-${crypto.randomUUID()}`);
            try {
                await fs.copyFile(this.objectPath(entry.hash), temporary);
                if (await fs.pathExists(target)) await fs.chmod(target, 0o600);
                await fs.rename(temporary, target);
                await fs.chmod(target, entry.mode & 0o777);
                await fs.utimes(target, new Date(entry.mtimeMs), new Date(entry.mtimeMs));
                restored++;
            } finally { await fs.unlink(temporary).catch(() => {}); }
        }
        for (const entry of [...entries].reverse()) if (entry.type === 'directory') {
            const directory = this.safePath(root, entry.path);
            await fs.chmod(directory, entry.mode & 0o777);
            await fs.utimes(directory, new Date(entry.mtimeMs), new Date(entry.mtimeMs));
        }
        this.hashCache.clear();
        return { restored, removed };
    }

    async restore({ id, chatId, commit }) {
        const record = await fs.readJson(this.recordPath(id));
        return this.restoreRecords({ records: [record], chatId, commit });
    }

    async restoreRecords({ records, chatId, commit }) {
        if (!records.length || records.some(record => String(record.chatId) !== String(chatId))) throw failure('检查点不属于当前对话。', 403);
        const baseline = records[0];
        const seenRoots = new Set();
        const earliest = records.filter(record => {
            if (seenRoots.has(rootKey(record.root))) return false;
            seenRoots.add(rootKey(record.root));
            return true;
        });
        const roots = [...new Set(earliest.map(record => record.root))];
        const outer = roots.filter(root => !roots.some(parent => parent !== root && inside(parent, root)));
        return this.withWorkspaces(outer, async () => {
            for (const record of earliest) await this.validate(record.root, record.entries);
            // Keep durable recovery snapshots until files and conversation all commit.
            const recoveries = [];
            for (const root of outer) {
                const recovery = { ...baseline, root, id: this.turnId(chatId, `recovery-${crypto.randomUUID()}`), entries: await this.capture(root), createdAt: new Date().toISOString() };
                await this.atomicJson(this.recordPath(recovery.id), recovery);
                recoveries.push(recovery);
            }
            try {
                const result = { restored: 0, removed: 0 };
                for (const record of [...earliest].reverse()) {
                    const applied = await this.apply(record.root, record.entries);
                    result.restored += applied.restored; result.removed += applied.removed;
                }
                await commit(baseline);
                return { ...result, messages: baseline.beforeMessages, userMessage: baseline.userMessage, checkpoint: this.descriptor(baseline) };
            } catch (error) {
                try { for (const recovery of recoveries) await this.apply(recovery.root, recovery.entries); }
                catch (recoveryError) { throw failure(`还原失败且自动恢复未完成。恢复备份：${recoveries.map(item => item.id).join(', ')}。${error.message}；${recoveryError.message}`, 500); }
                throw error;
            }
        });
    }
}

module.exports = { CheckpointService };
