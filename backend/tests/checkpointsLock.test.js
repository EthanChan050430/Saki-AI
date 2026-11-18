'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs-extra');

const { CheckpointService } = require('../services/checkpoints');
const { prepareTurnCheckpoint, createCheckpointRestoreHandler, isFilesystemRoot } = require('../services/checkpointSessions');

function createMockRes() {
    return {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
    };
}

describe('CheckpointService workspace locks and restore', () => {
    it('does not impose the former capacity options and refuses to restore across a missing later checkpoint', async () => {
        const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'saki-cp-capacity-'));
        try {
            const workDir = path.join(tmpRoot, 'workspace');
            const sessionsDir = path.join(tmpRoot, 'sessions');
            await fs.ensureDir(workDir);
            await fs.ensureDir(sessionsDir);
            await fs.writeFile(path.join(workDir, 'a.txt'), 'before');
            const limited = new CheckpointService({ storeDir: path.join(tmpRoot, 'limited'), maxFiles: 1, maxBytes: 1 });
            assert.equal((await limited.capture(workDir))[0].size, 6);
            const largeCheckpoint = await limited.ensure({ chatId: 'large', messageId: 'one', root: workDir, beforeMessages: [], userMessage: { role: 'user', id: 'one' } });
            await fs.writeFile(path.join(workDir, 'a.txt'), 'changed');
            await limited.restore({ id: largeCheckpoint.id, chatId: 'large', commit: async () => {} });
            assert.equal(await fs.readFile(path.join(workDir, 'a.txt'), 'utf8'), 'before');
            const service = new CheckpointService({ storeDir: path.join(tmpRoot, 'store') });
            const chatId = 'capacity_chat';
            const userMessage = { role: 'user', id: 'one', content: 'first' };
            const cp = await service.ensure({ chatId, messageId: 'one', root: workDir, beforeMessages: [], userMessage });
            await fs.writeJson(path.join(sessionsDir, `${chatId}.json`), { messages: [userMessage, { role: 'user', id: 'two', content: 'later' }] });
            await fs.writeFile(path.join(workDir, 'a.txt'), 'after');
            const handler = createCheckpointRestoreHandler({ service, sessionsDir, getHistory: async () => [], saveHistory: async () => {}, createSessionSummary: () => ({}), emitRealtimeEvent: () => {} });
            const res = createMockRes();
            await handler({ body: { chatId, checkpointId: cp.id } }, res);
            assert.equal(res.statusCode, 409);
            assert.equal(await fs.readFile(path.join(workDir, 'a.txt'), 'utf8'), 'after');
        } finally { await fs.remove(tmpRoot); }
    });
    it('prunes inactive/stopped leases so restore never gets stuck on stale runs', async () => {
        const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'saki-cp-lock-'));
        const storeDir = path.join(tmpRoot, 'store');
        const workDir = path.join(tmpRoot, 'workspace');
        const sessionsDir = path.join(tmpRoot, 'sessions');
        await fs.ensureDir(workDir);
        await fs.ensureDir(sessionsDir);
        await fs.writeFile(path.join(workDir, 'a.txt'), 'before', 'utf8');

        const service = new CheckpointService({ storeDir });
        const chatId = 'chat_idle_1';
        const userMessage = { role: 'user', id: 'u1', content: 'edit file' };
        const cp = await service.ensure({
            chatId,
            messageId: 'u1',
            root: workDir,
            beforeMessages: [],
            userMessage,
        });
        await fs.writeJson(path.join(sessionsDir, `${chatId}.json`), {
            messages: [{ ...userMessage, checkpoint: cp }, { role: 'assistant', parts: [{ type: 'text', content: 'done' }], id: 2 }],
            source: 'web',
        });

        await fs.writeFile(path.join(workDir, 'a.txt'), 'after', 'utf8');

        // Simulate an agent run whose stream stopped/closed while cleanup has not exited yet.
        let active = true;
        const staleLease = await service.acquireWorkspace(workDir, {
            kind: 'agent',
            chatId: 'chat_stopped_2',
            label: 'stopped task',
            isActive: () => active,
        });
        active = false;

        let history = [{ id: chatId, title: 'Chat 1' }];
        const handler = createCheckpointRestoreHandler({
            service,
            sessionsDir,
            getHistory: async () => history,
            saveHistory: async next => { history = next; },
            createSessionSummary: ({ chatId: id, messages, title }) => ({ id, title: title || 'Chat 1', count: messages.length }),
            emitRealtimeEvent: () => {},
            isChatRunning: id => id === 'chat_other_searching',
        });

        const res = createMockRes();
        await handler({ body: { chatId, checkpointId: cp.id } }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.equal(await fs.readFile(path.join(workDir, 'a.txt'), 'utf8'), 'before');
        staleLease.release();

        await fs.remove(tmpRoot);
    });

    it('keeps active agent lease intact across concurrent prepareTurnCheckpoint and blocks conflicting restore with task label', async () => {
        const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'saki-cp-bucket-'));
        const storeDir = path.join(tmpRoot, 'store');
        const workDir = path.join(tmpRoot, 'workspace');
        await fs.ensureDir(workDir);

        const service = new CheckpointService({ storeDir });
        const agentLease = await service.acquireWorkspace(workDir, {
            kind: 'agent',
            chatId: 'chat_agent_active',
            label: '编辑测试文件',
            isActive: () => true,
        });

        // Concurrent 'prepare' for an unrelated chat must succeed without clobbering the agent lease.
        const cp = await service.withWorkspace(workDir, async () => {
            return service.ensure({
                chatId: 'chat_b',
                messageId: 'u_b',
                root: workDir,
                beforeMessages: [],
                userMessage: { role: 'user', id: 'u_b', content: 'hello' },
            });
        }, { kind: 'prepare', chatId: 'chat_b' });

        // Restore must still see the intact agent lease and report the active task label.
        await assert.rejects(
            () => service.restore({ id: cp.id, chatId: 'chat_b', commit: async () => {} }),
            err => err.statusCode === 409 && err.message.includes('编辑测试文件')
        );

        agentLease.release();
        await service.restore({ id: cp.id, chatId: 'chat_b', commit: async () => {} });

        await fs.remove(tmpRoot);
    });

    it('waits briefly for a transient prepare lock and blocks restoring the same actively running chat', async () => {
        const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'saki-cp-same-'));
        const storeDir = path.join(tmpRoot, 'store');
        const workDir = path.join(tmpRoot, 'workspace');
        const sessionsDir = path.join(tmpRoot, 'sessions');
        await fs.ensureDir(workDir);
        await fs.ensureDir(sessionsDir);

        const service = new CheckpointService({ storeDir });
        const chatId = 'chat_running_self';
        const cp = await service.ensure({
            chatId,
            messageId: 'u1',
            root: workDir,
            beforeMessages: [],
            userMessage: { role: 'user', id: 'u1', content: 'hi' },
        });
        await fs.writeJson(path.join(sessionsDir, `${chatId}.json`), {
            messages: [{ role: 'user', id: 'u1', content: 'hi', checkpoint: cp }],
            source: 'web',
        });

        const prepareLease = await service.acquireWorkspace(workDir, { kind: 'prepare', chatId: 'other' });
        setTimeout(() => prepareLease.release(), 40);
        await service.restore({ id: cp.id, chatId, commit: async () => {} });

        const handler = createCheckpointRestoreHandler({
            service,
            sessionsDir,
            getHistory: async () => [],
            saveHistory: async () => {},
            createSessionSummary: () => ({}),
            emitRealtimeEvent: () => {},
            isChatRunning: id => String(id) === chatId,
        });
        const res = createMockRes();
        await handler({ body: { chatId, checkpointId: cp.id } }, res);
        assert.equal(res.statusCode, 409);
        assert.match(res.body.error, /当前对话仍有任务运行/);

        await fs.remove(tmpRoot);
    });

    it('prunes stopped prepare/agent locks via isChatRunning and aborts prepareTurnCheckpoint promptly when stopped', async () => {
        const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'saki-cp-stop-prepare-'));
        try {
            const storeDir = path.join(tmpRoot, 'store');
            const workDir = path.join(tmpRoot, 'workspace');
            await fs.ensureDir(workDir);
            await fs.writeFile(path.join(workDir, 'a.txt'), 'initial', 'utf8');

            const runningChats = new Set(['1794978152817']);
            const service = new CheckpointService({
                storeDir,
                isChatRunning: id => runningChats.has(String(id)),
            });

            const baseline = await service.ensure({
                chatId: '1794978152817',
                messageId: 'u0',
                root: workDir,
                beforeMessages: [],
                userMessage: { role: 'user', id: 'u0', content: 'first' },
            });

            // Simulate a prepare lease left behind after the task stopped.
            const stalePrepare = await service.acquireWorkspace(workDir, {
                kind: 'prepare',
                chatId: '1794978152817',
                label: 'stopped prepare',
            });
            runningChats.delete('1794978152817');

            // Both restore and a subsequent prepare must immediately prune the stopped lease and succeed.
            await service.restore({ id: baseline.id, chatId: '1794978152817', commit: async () => {} });
            stalePrepare.release();

            let active = false;
            await assert.rejects(
                () => service.withWorkspace(workDir, async () => prepareTurnCheckpoint(service, {
                    chatId: '1794978152817',
                    root: workDir,
                    history: [{ role: 'user', id: 'u1', content: 'second' }],
                    shouldContinue: () => active,
                }), { kind: 'prepare', chatId: '1794978152817', isActive: () => active }),
                err => err.statusCode === 499
            );
            assert.equal(service.workspaceLocks.size, 0);
        } finally {
            await fs.remove(tmpRoot);
        }
    });

    it('skips drive roots, excludes Windows system dirs, tolerates EPERM/EACCES, and falls back gracefully on timeout', async () => {
        const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'saki-cp-resilient-'));
        const origReaddir = fs.readdir;
        try {
            const storeDir = path.join(tmpRoot, 'store');
            const workDir = path.join(tmpRoot, 'workspace');
            await fs.ensureDir(path.join(workDir, '$RECYCLE.BIN'));
            await fs.ensureDir(path.join(workDir, 'System Volume Information'));
            await fs.ensureDir(path.join(workDir, 'locked-dir'));
            await fs.writeFile(path.join(workDir, '$RECYCLE.BIN', 'trashed.txt'), 'skip');
            await fs.writeFile(path.join(workDir, 'System Volume Information', 'sys.dat'), 'skip');
            await fs.writeFile(path.join(workDir, 'normal.txt'), 'keep');

            const service = new CheckpointService({ storeDir });

            // 1. Filesystem root detection skips drive/filesystem roots without scanning
            const rootDir = path.parse(workDir).root;
            assert.equal(isFilesystemRoot(rootDir), true);
            assert.equal(isFilesystemRoot(workDir), false);
            const rootHistory = [{ role: 'user', id: 'u-root', content: 'scan drive' }];
            const rootCp = await prepareTurnCheckpoint(service, {
                chatId: 'chat_drive_root',
                root: rootDir,
                history: rootHistory,
            });
            assert.equal(rootCp, null);
            assert.equal(rootHistory[0].checkpoint, undefined);

            // 2. scan skips Windows system folders and EPERM/EACCES subdirectories cleanly
            fs.readdir = async (dir, ...rest) => {
                if (path.basename(String(dir)) === 'locked-dir') {
                    throw Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
                }
                return origReaddir.call(fs, dir, ...rest);
            };
            const scanned = await service.scan(workDir);
            const relPaths = scanned.map(e => e.path);
            assert.ok(relPaths.includes('normal.txt'));
            assert.ok(!relPaths.some(p => p.includes('$RECYCLE.BIN') || p.includes('System Volume Information')));
            fs.readdir = origReaddir;

            // 3. prepareTurnCheckpoint returns null cleanly on timeout instead of aborting or 499-stopping the turn
            const slowService = {
                ensure: () => new Promise(resolve => setTimeout(() => resolve({ id: 'cp_late' }), 200)),
            };
            const timeoutHistory = [{ role: 'user', id: 'u-timeout', content: 'hi' }];
            const timedOutCp = await prepareTurnCheckpoint(slowService, {
                chatId: 'chat_cp_timeout',
                root: workDir,
                history: timeoutHistory,
                shouldContinue: () => true,
                timeoutMs: 25,
            });
            assert.equal(timedOutCp, null);
        } finally {
            fs.readdir = origReaddir;
            await fs.remove(tmpRoot);
        }
    });
});
