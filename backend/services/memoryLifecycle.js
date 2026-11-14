'use strict';

const fs = require('fs-extra');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function getNeedles(memory = {}) {
    const source = [
        memory.name, memory.summary, memory.content,
        memory.provenance?.evidenceText,
        ...(memory.history || []).flatMap(item => [item.summary, item.content, item.provenance?.evidenceText]),
    ];
    const lines = source.flatMap(value => String(value || '').split(/[\r\n]+/));
    return [...new Set(lines.map(s => s.trim().toLowerCase()).filter(s => s.length >= 4))]
        .sort((a, b) => b.length - a.length).slice(0, 24);
}

function mentionsDeletedMemory(value, memory, needles = getNeedles(memory)) {
    if (!value) return false;
    if (typeof value === 'object' && (value.sourceMemoryId === memory.id || value.memoryId === memory.id)) return true;
    const text = (typeof value === 'string' ? value : JSON.stringify(value)).toLowerCase();
    return needles.some(needle => text.includes(needle));
}

async function atomicText(filePath, text) {
    const temporary = `${filePath}.${randomUUID()}.tmp`;
    try {
        await fs.writeFile(temporary, text, 'utf8');
        await fs.rename(temporary, filePath);
    } finally {
        await fs.remove(temporary);
    }
}

async function cleanArchiveMarkdown(root, memory, needles = getNeedles(memory)) {
    let edited = 0;
    const walk = async directory => {
        const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
        for (const entry of entries) {
            const filePath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                await walk(filePath);
            } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
                const original = await fs.readFile(filePath, 'utf8');
                const kept = original.split(/\r?\n/).filter(line => !mentionsDeletedMemory(line, memory, needles));
                const updated = kept.join('\n');
                if (updated !== original.replace(/\r\n/g, '\n')) {
                    const onlyMetadata = kept.every(line =>
                        !line.trim() || /^\s*(?:#|Category:|Summary:|Importance:|Source:|Tags:)/i.test(line)
                    );
                    if (path.basename(path.dirname(filePath)) === 'topics' && onlyMetadata) {
                        // A now-empty topic file name may itself disclose the deleted topic.
                        await fs.remove(filePath);
                    } else {
                        await atomicText(filePath, updated);
                    }
                    edited++;
                }
            }
        }
    };
    await walk(root);
    return edited;
}

function cleanSessionState(root, memory, needles) {
    const state = { ...root };
    const cleanOne = value => {
        const copy = { ...value };
        if (mentionsDeletedMemory(copy.currentTask, memory, needles)) copy.currentTask = '[None]';
        for (const field of ['keyContext', 'topicFocus', 'recentDecisions']) {
            if (Array.isArray(copy[field])) {
                copy[field] = copy[field].filter(item => !mentionsDeletedMemory(item, memory, needles));
            }
        }
        if (Array.isArray(copy.pendingActions)) {
            copy.pendingActions = copy.pendingActions.filter(item => !mentionsDeletedMemory(item, memory, needles));
        }
        return copy;
    };
    const cleanedRoot = cleanOne(state);
    if (root?.chats && typeof root.chats === 'object') {
        cleanedRoot.chats = Object.fromEntries(Object.entries(root.chats).map(([key, value]) => [key, cleanOne(value)]));
    }
    return cleanedRoot;
}

function cleanWorkingMemory(data, memory, needles) {
    const turns = (data.turns || []).filter(turn => !mentionsDeletedMemory(turn, memory, needles));
    return {
        ...data,
        turns,
        summary: turns.slice(-6)
            .map(turn => `User: ${String(turn.user || '').slice(0, 80)}\nAssistant: ${String(turn.assistant || '').slice(0, 100)}`)
            .join('\n\n'),
    };
}

module.exports = {
    getNeedles,
    mentionsDeletedMemory,
    cleanArchiveMarkdown,
    cleanSessionState,
    cleanWorkingMemory,
    atomicText,
};
