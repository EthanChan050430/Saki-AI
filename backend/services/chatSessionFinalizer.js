'use strict';

const TERMINAL_STATUSES = new Set(['done', 'error', 'interrupted']);

/**
 * Maps a run outcome to the persisted message status.
 * @param {string} outcome
 * @param {string} [existingStatus]
 * @returns {string}
 */
function resolveOutcomeStatus(outcome = 'completed', existingStatus = '') {
    if (outcome === 'awaitingApproval') return 'streaming';
    if (outcome === 'error') return 'error';
    if (outcome === 'stopped') return 'interrupted';
    return existingStatus === 'error' ? 'error' : 'done';
}

/**
 * Checks whether a target assistant message already reflects a finished response.
 * @param {object|null} message
 * @returns {boolean}
 */
function hasFinishedAssistantOutput(message) {
    if (!message || typeof message !== 'object') return false;
    if (TERMINAL_STATUSES.has(message.status) || Boolean(message.runOutcome)) return true;
    const parts = Array.isArray(message.parts) ? message.parts : [];
    const lastPart = parts.at(-1);
    return Boolean(lastPart && lastPart.type === 'text' && String(lastPart.content || '').trim());
}

/**
 * Stamps terminal outcome metadata on the matching assistant message in a session.
 * @param {Array} messages
 * @param {object} [options]
 * @returns {Array}
 */
function applyFinalOutcomeToMessages(messages = [], options = {}) {
    const list = Array.isArray(messages) ? messages : [];
    const {
        assistantMsgId = null,
        outcome = 'completed',
        startedAt = 0,
        now = Date.now(),
        errorText = '',
    } = options;

    if (assistantMsgId === null || assistantMsgId === undefined) return [...list];

    return list.map((msg) => {
        if (!msg || msg.role !== 'assistant' || String(msg.id) !== String(assistantMsgId)) {
            return msg;
        }
        const status = resolveOutcomeStatus(outcome, msg.status);
        const parts = Array.isArray(msg.parts) ? [...msg.parts] : [];
        if (outcome === 'error' && errorText) {
            const alreadyRecorded = parts.some(
                (part) => part?.type === 'text' && String(part.content || '').includes(errorText)
            );
            if (!alreadyRecorded) {
                parts.push({ type: 'text', content: errorText });
            }
        }
        const generationDurationMs = typeof msg.generationDurationMs === 'number' && Number.isFinite(msg.generationDurationMs)
            ? msg.generationDurationMs
            : (outcome !== 'awaitingApproval' && startedAt > 0 ? Math.max(0, now - startedAt) : undefined);

        return {
            ...msg,
            parts,
            status,
            runOutcome: outcome,
            ...(generationDurationMs !== undefined ? { generationDurationMs } : {}),
        };
    });
}

/**
 * Computes the persisted `pendingRequest` value once a run finishes or pauses.
 * @param {object} [options]
 * @returns {object|null}
 */
function resolveFinalPendingRequest({
    existingPendingRequest = null,
    outcome = 'completed',
    approvalRequest = null,
    fallbackPendingRequest = null,
} = {}) {
    if (outcome !== 'awaitingApproval' && !approvalRequest) {
        return null;
    }
    const base = existingPendingRequest || fallbackPendingRequest;
    if (!base && !approvalRequest) return null;
    return {
        ...(base || {}),
        ...(approvalRequest ? { approvalRequest } : {}),
    };
}

/**
 * Identifies sessions whose `pendingRequest` remained set even though no run is active
 * and the target assistant reply has already finalized.
 * @param {object|null} sessionData
 * @param {boolean} [isRunning=false]
 * @returns {boolean}
 */
function isStalePendingSession(sessionData, isRunning = false) {
    const pending = sessionData?.pendingRequest;
    if (!pending || !pending.assistantMsgId || pending.approvalRequest || isRunning) {
        return false;
    }
    const messages = Array.isArray(sessionData?.messages) ? sessionData.messages : [];
    const target = messages.find((msg) => msg && String(msg.id) === String(pending.assistantMsgId));
    return hasFinishedAssistantOutput(target);
}

module.exports = {
    TERMINAL_STATUSES,
    resolveOutcomeStatus,
    hasFinishedAssistantOutput,
    applyFinalOutcomeToMessages,
    resolveFinalPendingRequest,
    isStalePendingSession,
};
