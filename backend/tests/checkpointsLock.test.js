'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs-extra');

const { CheckpointService } = require('../services/checkpoints');
const { createCheckpointRestoreHandler } = require('../services/checkpointSessions');

function createMockRes() {
    return {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
    };
}

describe('CheckpointService workspace locks and restore', () => {
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
});
