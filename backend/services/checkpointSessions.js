const fs = require('fs-extra');
const path = require('path');

function validateChatId(chatId) {
    if (!/^[a-zA-Z0-9_-]{1,160}$/.test(String(chatId || ''))) throw Object.assign(new Error('无效的对话编号。'), { statusCode: 400 });
}

function isFilesystemRoot(root) {
    if (!root || typeof root !== 'string') return false;
    const resolved = path.resolve(root);
    return resolved === path.parse(resolved).root;
}

async function prepareTurnCheckpoint(service, { chatId, root, history = [], shouldContinue = null, timeoutMs = 0 }) {
    if (!chatId) return null;
    validateChatId(chatId);
    if (isFilesystemRoot(root)) return null;
    const index = history.findLastIndex(message => message.role === 'user');
    const userMessage = history[index];
    if (!userMessage?.id) return null;
    let timedOut = false;
    let timer = null;
    const isUserStop = () => typeof shouldContinue === 'function' && !shouldContinue();
    const effectiveContinue = () => !timedOut && !isUserStop();
    try {
        const ensurePromise = service.ensure({
            chatId, root, messageId: userMessage.id,
            beforeMessages: history.slice(0, index), userMessage: { ...userMessage, checkpoint: undefined },
            shouldContinue: effectiveContinue,
        });
        let checkpoint;
        if (Number(timeoutMs) > 0) {
            const timeoutPromise = new Promise((_, reject) => {
                timer = setTimeout(() => {
                    timedOut = true;
                    reject(Object.assign(new Error('创建检查点超时，已跳过本轮工作区快照。'), { code: 'CHECKPOINT_TIMEOUT' }));
                }, Number(timeoutMs));
            });
            ensurePromise.catch(() => {});
            checkpoint = await Promise.race([ensurePromise, timeoutPromise]);
        } else {
            checkpoint = await ensurePromise;
        }
        history[index] = { ...userMessage, checkpoint };
        return checkpoint;
    } catch (error) {
        if (isUserStop() || (error?.statusCode === 499 && !timedOut)) {
            throw error;
        }
        console.warn('[Checkpoint] Skipped turn checkpoint:', error?.message || error);
        return null;
    } finally {
        if (timer) clearTimeout(timer);
    }
}

function createCheckpointRestoreHandler({ service, sessionsDir, getHistory, saveHistory, createSessionSummary, emitRealtimeEvent, isChatRunning = null }) {
    return async (req, res) => {
        const { chatId, checkpointId } = req.body || {};
        try {
            validateChatId(chatId);
            if (typeof isChatRunning === 'function' && isChatRunning(chatId)) {
                throw Object.assign(new Error('当前对话仍有任务运行，请先停止该对话后再还原检查点。'), { statusCode: 409 });
            }
            const result = await service.withSession(chatId, async () => {
                const sessionFile = path.join(sessionsDir, `${chatId}.json`);
                const original = await fs.readJson(sessionFile);
                const record = await fs.readJson(service.recordPath(checkpointId));
                if (String(record.chatId) !== String(chatId)) throw Object.assign(new Error('检查点不属于当前对话。'), { statusCode: 403 });
                const turnIndex = (original.messages || []).findIndex(message => message.role === 'user' && String(message.id) === record.messageId);
                if (turnIndex < 0) {
                    throw Object.assign(new Error('此检查点已不在当前对话中，请刷新后重试。'), { statusCode: 409 });
                }
                const records = [record];
                for (const message of original.messages.slice(turnIndex + 1)) {
                    if (message.role !== 'user' || !message.id) continue;
                    const subsequent = await fs.readJson(service.recordPath(service.turnId(chatId, message.id))).catch(error => {
                        if (error.code !== 'ENOENT') throw error;
                        return null;
                    });
                    if (!subsequent) throw Object.assign(new Error('后续消息缺少工作区检查点，无法安全还原到此处。'), { statusCode: 409 });
                    records.push(subsequent);
                }
                const previousSummary = (await getHistory()).find(item => String(item.id) === String(chatId));
                return service.restoreRecords({ records, chatId, commit: async checkpoint => {
                    const restoredWorkspace = typeof checkpoint.userMessage?.requestOptions?.workspacePath === 'string'
                        ? checkpoint.userMessage.requestOptions.workspacePath
                        : undefined;
                    const restoredSession = {
                        ...original, messages: checkpoint.beforeMessages, pendingRequest: null,
                        contextCompression: undefined, checkpointRestoredAt: Date.now(),
                        ...(typeof restoredWorkspace === 'string' ? { workspacePath: restoredWorkspace } : {}),
                    };
                    try {
                        await service.atomicJson(sessionFile, restoredSession);
                        const currentHistory = await getHistory();
                        const summary = createSessionSummary({
                            chatId, messages: checkpoint.beforeMessages, title: previousSummary?.title,
                            source: original.source || 'web', external: original.external, pendingRequest: null,
                        });
                        await saveHistory([summary, ...currentHistory.filter(item => String(item.id) !== String(chatId))]);
                    } catch (error) {
                        await service.atomicJson(sessionFile, original);
                        const currentHistory = await getHistory();
                        await saveHistory([...(previousSummary ? [previousSummary] : []), ...currentHistory.filter(item => String(item.id) !== String(chatId))]);
                        throw error;
                    }
                } });
            });
            emitRealtimeEvent({ type: 'history-updated', reason: 'checkpoint-restored' });
            emitRealtimeEvent({ type: 'session-updated', chatId, reason: 'checkpoint-restored' });
            res.json({ success: true, ...result });
        } catch (error) {
            res.status(error.statusCode || (error.code === 'ENOENT' ? 404 : 500)).json({ error: error.message });
        }
    };
}

module.exports = { prepareTurnCheckpoint, createCheckpointRestoreHandler, validateChatId, isFilesystemRoot };
