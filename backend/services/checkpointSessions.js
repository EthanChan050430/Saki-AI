const fs = require('fs-extra');
const path = require('path');

function validateChatId(chatId) {
    if (!/^[a-zA-Z0-9_-]{1,160}$/.test(String(chatId || ''))) throw Object.assign(new Error('无效的对话编号。'), { statusCode: 400 });
}

async function prepareTurnCheckpoint(service, { chatId, root, history = [] }) {
    if (!chatId) return null;
    validateChatId(chatId);
    const index = history.findLastIndex(message => message.role === 'user');
    const userMessage = history[index];
    if (!userMessage?.id) return null;
    const checkpoint = await service.ensure({
        chatId, root, messageId: userMessage.id,
        beforeMessages: history.slice(0, index), userMessage: { ...userMessage, checkpoint: undefined },
    });
    history[index] = { ...userMessage, checkpoint };
    return checkpoint;
}

function createCheckpointRestoreHandler({ service, sessionsDir, getHistory, saveHistory, createSessionSummary, emitRealtimeEvent }) {
    return async (req, res) => {
        const { chatId, checkpointId } = req.body || {};
        try {
            validateChatId(chatId);
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
                    if (subsequent) records.push(subsequent);
                }
                const previousSummary = (await getHistory()).find(item => String(item.id) === String(chatId));
                return service.restoreRecords({ records, chatId, commit: async checkpoint => {
                    const restoredSession = {
                        ...original, messages: checkpoint.beforeMessages, pendingRequest: null,
                        contextCompression: undefined, checkpointRestoredAt: Date.now(),
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

module.exports = { prepareTurnCheckpoint, createCheckpointRestoreHandler, validateChatId };
