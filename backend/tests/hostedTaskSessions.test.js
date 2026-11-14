'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createKeyedSerialQueue, isCurrentRun } = require('../services/agentLoopUtils');
const { preserveSteeringMessages, createSteeringController, emitRunOutcome } = require('../services/agentSteering');

const serverSource = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8').replace(/\r\n/g, '\n');
const section = (start, end, { fromLast = false } = {}) => {
    const startIdx = fromLast ? serverSource.lastIndexOf(start) : serverSource.indexOf(start);
    assert.notEqual(startIdx, -1, `Missing start marker: ${start}`);
    const endIdx = serverSource.indexOf(end, startIdx);
    assert.notEqual(endIdx, -1, `Missing end marker: ${end}`);
    return serverSource.slice(startIdx, endIdx);
};

function createHostedTaskTestContext({ tempDir, runAgentLoopImpl, tasks = [] } = {}) {
    const sessionsDir = path.join(tempDir, 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    let historyList = [];
    const realtimeEvents = [];
    const schedulerCalls = [];

    const taskScheduler = {
        async listTasks() {
            return tasks;
        },
        async setTaskStatus(id, status, activeSessionId) {
            schedulerCalls.push({ fn: 'setTaskStatus', id, status, activeSessionId });
        },
        async updateTaskStatus(id, result, sessionId) {
            schedulerCalls.push({ fn: 'updateTaskStatus', id, result, sessionId });
        },
    };

    const fsMock = {
        pathExists: (filePath) => fsp.access(filePath).then(() => true).catch(() => false),
        exists: (filePath) => fsp.access(filePath).then(() => true).catch(() => false),
        writeJson: async (filePath, data) => {
            await fsp.mkdir(path.dirname(filePath), { recursive: true });
            await fsp.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
        },
        remove: (filePath) => fsp.rm(filePath, { force: true }),
    };

    const context = vm.createContext({
        path,
        fs: fsMock,
        console,
        SESSIONS_DIR: sessionsDir,
        BACKGROUND_RUNS: new Map(),
        withSessionWrite: createKeyedSerialQueue(),
        isCurrentRun,
        createSteeringController,
        emitRunOutcome,
        preserveSteeringMessages,
        hasPendingRequest: (pending) => Boolean(pending && typeof pending === 'object' && pending.assistantMsgId),
        createPendingRequest: (message, uploadedFiles = [], options = {}, assistantMsgId = null) => ({
            type: 'chat',
            message,
            uploadedFiles,
            options,
            assistantMsgId,
        }),
        mergePreservedStoryGlassConversationMessages: (incoming) => incoming,
        shouldPruneEmptyHistorySession: (session = {}) => {
            const source = String(session.source || 'web').trim().toLowerCase();
            if (source && source !== 'web') return false;
            return !(Array.isArray(session.messages) && session.messages.some(m => m.role === 'user' && m.content));
        },
        safeReadJsonFile: async (filePath, fallback = {}) => {
            try {
                return JSON.parse(await fsp.readFile(filePath, 'utf8'));
            } catch {
                return JSON.parse(JSON.stringify(fallback));
            }
        },
        getHistory: async () => JSON.parse(JSON.stringify(historyList)),
        saveHistory: async (next) => {
            historyList = JSON.parse(JSON.stringify(next));
        },
        removeHistoryEntry: async (chatId) => {
            historyList = historyList.filter(item => String(item.id) !== String(chatId));
            return historyList;
        },
        emitRealtimeEvent: (event) => {
            realtimeEvents.push(event);
        },
        readGlobalConfig: async () => ({ provider: 'openai', model: 'gpt-4o', ollamaUrl: '' }),
        getActiveModelInfo: (cfg) => ({ activeProvider: cfg.provider, activeModel: cfg.model }),
        runtime: { backgroundTasks: true },
        taskScheduler,
        runAgentLoop: runAgentLoopImpl || (async () => {}),
        Date,
        setTimeout,
        clearTimeout,
    });

    const code = [
        section('function createSessionSummary(', 'function isStoryGlassConversationArchiveMessage(', { fromLast: true }),
        section('function persistSessionRecord(options)', 'function withRunSessionWrite('),
        section('async function persistSessionRecordLocked(', 'async function loadQQBotSessionMap('),
        section('function createMockSseResponse(', 'function createBackgroundRun('),
        section('function createBackgroundRun(', 'function attachBackgroundSubscriber('),
        section('function createSessionPulseEmitter(', 'async function executeQQSessionRequest('),
        section('function extractHostedTaskResultText(', 'const resolvedHttps ='),
    ].join('\n');

    vm.runInContext(code, context);

    return {
        context,
        sessionsDir,
        getHistoryList: () => historyList,
        setHistoryList: (items) => { historyList = items; },
        realtimeEvents,
        schedulerCalls,
    };
}

test('hosted task execution creates a chat sidebar session, streams updates, and preserves title across follow-ups', async () => {
    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'saki-hosted-test-'));
    try {
        let capturedChatId = null;
        let historyDuringRun = null;

        const env = createHostedTaskTestContext({
            tempDir,
            runAgentLoopImpl: async (res, opts) => {
                capturedChatId = opts.chatId;
                historyDuringRun = env.getHistoryList();
                const sessionFilePath = path.join(env.sessionsDir, `${opts.chatId}.json`);
                const sessionData = JSON.parse(await fsp.readFile(sessionFilePath, 'utf8'));
                sessionData.messages = [
                    ...opts.history,
                    {
                        role: 'assistant',
                        id: opts.assistantMsgId,
                        parts: [{ type: 'text', content: 'Today news summary ready.' }],
                        generatedFiles: [],
                    },
                ];
                await fsp.writeFile(sessionFilePath, JSON.stringify(sessionData, null, 2), 'utf8');
                res.write(`data: ${JSON.stringify({ text: 'Today news summary ready.' })}\n\n`);
                res.write('data: [DONE]\n\n');
                res.end();
            },
        });

        await env.context.runHostedTaskExecution({
            id: 't1',
            desc: '每日新闻总结',
            task: 'Please summarize today world news in detail and save the digest',
            scheduleType: 'daily',
            options: { useSearch: true, useMcp: false, useMemory: true },
        });

        assert.ok(capturedChatId.startsWith('task_t1_'));
        assert.equal(historyDuringRun.length, 1);
        assert.equal(historyDuringRun[0].id, capturedChatId);
        assert.equal(historyDuringRun[0].source, 'hosted');
        assert.equal(historyDuringRun[0].title, '每日新闻总结');
        assert.equal(historyDuringRun[0].isPending, true);

        const finalHistory = env.getHistoryList();
        assert.equal(finalHistory.length, 1);
        assert.equal(finalHistory[0].isPending, false);
        assert.equal(finalHistory[0].source, 'hosted');
        assert.equal(finalHistory[0].title, '每日新闻总结');
        assert.equal(env.schedulerCalls.at(-1).fn, 'updateTaskStatus');
        assert.equal(env.schedulerCalls.at(-1).result, 'Today news summary ready.');
        assert.equal(env.schedulerCalls.at(-1).sessionId, capturedChatId);
        assert.equal(env.context.BACKGROUND_RUNS.size, 0);

        // Follow-up save from web chat without title/source keeps hosted title and source
        const sessionData = JSON.parse(await fsp.readFile(path.join(env.sessionsDir, `${capturedChatId}.json`), 'utf8'));
        await env.context.persistSessionRecord({
            chatId: capturedChatId,
            messages: [
                ...sessionData.messages,
                { role: 'user', id: 'u2', content: 'Tell me more about item 1' },
            ],
            pendingRequest: null,
        });
        const afterFollowUp = env.getHistoryList();
        assert.equal(afterFollowUp[0].title, '每日新闻总结');
        assert.equal(afterFollowUp[0].source, 'hosted');
    } finally {
        await fsp.rm(tempDir, { recursive: true, force: true });
    }
});

test('syncHostedTaskSessionsToHistory backfills existing hosted sessions and skips deleted ones', async () => {
    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'saki-hosted-sync-'));
    try {
        const existingSessionId = 'task_old_1000';
        const deletedSessionId = 'task_old_2000';

        const env = createHostedTaskTestContext({
            tempDir,
            tasks: [
                {
                    id: 'old',
                    desc: '旧托管任务',
                    task: 'Check logs',
                    scheduleType: 'daily',
                    results: [
                        { sessionId: existingSessionId, timestamp: 1700000000000, success: true },
                        { sessionId: deletedSessionId, timestamp: 1700000100000, success: true },
                    ],
                },
            ],
        });

        await fsp.writeFile(
            path.join(env.sessionsDir, `${existingSessionId}.json`),
            JSON.stringify({
                messages: [
                    { role: 'user', id: 'u1', content: 'Check logs' },
                    { role: 'assistant', id: 'a1', parts: [{ type: 'text', content: 'All clear' }] },
                ],
            }),
            'utf8'
        );

        await env.context.syncHostedTaskSessionsToHistory();
        const history = env.getHistoryList();
        assert.equal(history.length, 1);
        assert.equal(history[0].id, existingSessionId);
        assert.equal(history[0].source, 'hosted');
        assert.equal(history[0].title, '旧托管任务');

        // Running sync again does not duplicate
        await env.context.syncHostedTaskSessionsToHistory();
        assert.equal(env.getHistoryList().length, 1);
    } finally {
        await fsp.rm(tempDir, { recursive: true, force: true });
    }
});

test('hosted task execution clears pending status and resets scheduler when stopped mid-run', async () => {
    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'saki-hosted-stop-'));
    try {
        let env;
        env = createHostedTaskTestContext({
            tempDir,
            runAgentLoopImpl: async (res, opts) => {
                const run = env.context.BACKGROUND_RUNS.get(opts.chatId);
                assert.ok(run, 'active run must be registered in BACKGROUND_RUNS');
                run.stop();
            },
        });

        await env.context.runHostedTaskExecution({
            id: 'stop1',
            desc: '可中断任务',
            task: 'Long task',
            scheduleType: 'once',
        });

        const history = env.getHistoryList();
        assert.equal(history.length, 1);
        assert.equal(history[0].isPending, false);
        assert.equal(env.schedulerCalls.at(-1).fn, 'updateTaskStatus');
        assert.equal(env.context.BACKGROUND_RUNS.size, 0);
    } finally {
        await fsp.rm(tempDir, { recursive: true, force: true });
    }
});
