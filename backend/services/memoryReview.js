'use strict';

const path = require('node:path');
const fs = require('fs-extra');
const { randomUUID } = require('node:crypto');
const { parseJsonObject } = require('./offlineReflection');

function short(value, max = 1200) {
    return String(value == null ? '' : value).trim().slice(0, max);
}
function number(value, fallback, min = 0, max = 1) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}
function redactCandidate(text) {
    return /(?:api[_-]?key|access[_-]?token|password|private[_-]?key|client[_-]?secret)\s*[:=]\s*\S{6,}|\bsk-[a-z0-9_-]{16,}\b/i.test(String(text || ''));
}
async function atomicJson(file, data) {
    const tmp = `${file}.${randomUUID()}.tmp`;
    try {
        await fs.writeJson(tmp, data, { spaces: 2 });
        await fs.rename(tmp, file);
    } finally {
        await fs.remove(tmp);
    }
}
function normalizeEditable(original, edited, kind) {
    const source = edited && typeof edited === 'object' ? edited : {};
    const item = {
        ...original,
        selected: source.selected === undefined ? !!original.selected : source.selected === true,
    };
    if (kind === 'memory') {
        item.name = short(source.name ?? original.name, 120);
        item.content = short(source.content ?? original.content, 2400);
        item.summary = short(source.summary ?? original.summary, 280);
        item.category = short(source.category ?? original.category, 40) || 'general';
        item.importance = number(source.importance ?? original.importance, 0.7);
        item.confidence = number(source.confidence ?? original.confidence, 0.7);
        item.factKey = short(source.factKey ?? original.factKey, 120);
        item.factValue = short(source.factValue ?? original.factValue, 240);
        // Evidence, chat ID and original candidate ID are immutable: reviewers
        // may correct the claim but cannot fabricate its original source.
        if (item.selected && (!item.name || !item.content)) {
            throw new Error('Selected memories require a name and content');
        }
    } else if (kind === 'entity') {
        for (const key of ['name', 'type', 'summary', 'status', 'evidence']) {
            item[key] = short(source[key] ?? original[key], key === 'summary' ? 280 : 200);
        }
        item.confidence = number(source.confidence ?? original.confidence, 0.7);
        if (item.selected && !item.name) throw new Error('Selected entities need a name');
    } else if (kind === 'relation') {
        for (const key of ['subject', 'subjectType', 'predicate', 'object', 'objectType', 'qualifiers', 'evidence']) {
            item[key] = short(source[key] ?? original[key], 250);
        }
        item.confidence = number(source.confidence ?? original.confidence, 0.7);
        if (item.selected && (!item.subject || !item.predicate || !item.object)) {
            throw new Error('Selected relations need subject, predicate and object');
        }
    }
    if (item.selected && redactCandidate(JSON.stringify(item))) {
        throw new Error('Selected candidate contains a credential-like secret');
    }
    return item;
}
function applyEdits(originalItems, edits, kind) {
    if (!Array.isArray(edits)) return originalItems;
    if (edits.length !== originalItems.length) throw new Error('Draft item count changed');
    const editsById = new Map(edits.map(item => [item.id, item]));
    if (editsById.size !== originalItems.length) throw new Error('Draft item IDs changed');
    return originalItems.map(item => {
        if (!editsById.has(item.id)) throw new Error('Unknown draft item');
        return normalizeEditable(item, editsById.get(item.id), kind);
    });
}

class MemoryReviewService {
    constructor({ reflectionService, memoryService, dataDir }) {
        this.reflection = reflectionService;
        this.memory = memoryService;
        this.draftPath = path.join(dataDir, 'memory_review_draft.json');
        this.tail = Promise.resolve();
        this.generating = false;
    }

    exclusive(fn) {
        const active = this.tail.then(fn);
        this.tail = active.catch(() => {});
        return active;
    }

    async getDraft() {
        try {
            const draft = await fs.readJson(this.draftPath);
            if (!draft || !draft.id || !Array.isArray(draft.memoryCandidates)) throw new Error('Invalid review draft');
            return draft;
        } catch (error) {
            if (error.code === 'ENOENT') return null;
            throw error;
        }
    }

    async getOverview(config = {}) {
        const [draft, sleepStore, state] = await Promise.all([
            this.getDraft(),
            this.memory.loadSleepStore(),
            this.reflection.loadState(),
        ]);
        return {
            draft: draft?.status === 'pending' || draft?.status === 'committing' ? draft : null,
            pending: (sleepStore.queue || []).filter(item => this.memory.isInScope(item)),
            model: this.reflection.resolveModelSelection(config),
            lastCommittedAt: state.lastRunAt || null,
            generating: this.generating,
        };
    }

    async generate({ config = {}, dateKey, callModel }) {
        if (this.generating) throw new Error('Reflection is already generating');
        this.generating = true;
        try {
            return await this.exclusive(async () => {
                const prior = await this.getDraft();
                if (prior && ['pending', 'committing'].includes(prior.status)) {
                    throw new Error('Review or discard the existing draft before generating another');
                }
                const selection = this.reflection.resolveModelSelection(config);
                if (!selection) throw new Error('Configure a chat model and provider first');
                if (typeof callModel !== 'function') throw new Error('No language model is available');
                const day = dateKey || this.reflection.localDateKey(new Date());
                if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Invalid review date');
                const dayDate = new Date(`${day}T12:00:00`);
                if (!Number.isFinite(dayDate.getTime()) || this.reflection.localDateKey(dayDate) !== day) {
                    throw new Error('Invalid review date');
                }
                const input = await this.reflection.collectDailyInputs(dayDate);
                if (!input.sessionSummaries.length && !input.fileDigests.length) {
                    throw new Error('No conversations or changed files were found on the selected date');
                }
                const raw = await callModel({
                    provider: selection.provider,
                    model: selection.model,
                    prompt: this.reflection.buildPrompt(input),
                    config: {
                        ...config,
                        provider: selection.provider,
                        model: selection.model,
                        systemPrompt: 'Suggest factual memories for manual review. Return a JSON object only.',
                    },
                });
                const parsed = parseJsonObject(raw);
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                    throw new Error('Model did not return a valid JSON review; nothing was saved');
                }
                const supported = (candidate) => {
                    const evidenceText = short(candidate.evidenceText, 600);
                    const session = input.sessionSummaries.find(item =>
                        evidenceText && (item.userMessages || []).some(text => text.includes(evidenceText))
                    );
                    return session ? { evidenceText, chatId: session.chatId, observedAt: session.updatedAt } : null;
                };
                const memoryCandidates = (Array.isArray(parsed.memoryCandidates) ? parsed.memoryCandidates : [])
                    .slice(0, 40).flatMap((candidate, i) => {
                        if (!candidate || !candidate.name || !candidate.content) return [];
                        const source = supported(candidate);
                        if (!source || redactCandidate(candidate.content)) return [];
                        return [normalizeEditable({
                            id: `memory-${i}-${randomUUID().slice(0, 8)}`,
                            name: short(candidate.name, 120),
                            summary: short(candidate.summary || candidate.content, 280),
                            content: short(candidate.content, 2400),
                            category: short(candidate.category, 40) || 'general',
                            importance: number(candidate.importance, 0.7),
                            confidence: number(candidate.confidence, 0.7),
                            factKey: short(candidate.factKey, 120),
                            factValue: short(candidate.factValue, 240),
                            ...source,
                            selected: true,
                        }, {}, 'memory')];
                    });
                const entities = (Array.isArray(parsed.entities) ? parsed.entities : [])
                    .slice(0, 40).filter(entity => entity?.name)
                    .map((entity, i) => normalizeEditable({
                        id: `entity-${i}-${randomUUID().slice(0, 8)}`,
                        name: short(entity.name, 120), type: short(entity.type, 40) || 'general',
                        summary: short(entity.summary, 280), status: short(entity.status, 180),
                        evidence: short(entity.evidence, 240), confidence: number(entity.confidence, 0.7),
                        selected: false,
                    }, {}, 'entity'));
                const relations = (Array.isArray(parsed.relations) ? parsed.relations : [])
                    .slice(0, 60).filter(rel => rel?.subject && rel?.predicate && rel?.object)
                    .map((rel, i) => normalizeEditable({
                        id: `relation-${i}-${randomUUID().slice(0, 8)}`,
                        subject: short(rel.subject, 120), subjectType: short(rel.subjectType, 40),
                        predicate: short(rel.predicate, 80), object: short(rel.object, 280),
                        objectType: short(rel.objectType, 40), qualifiers: short(rel.qualifiers, 200),
                        evidence: short(rel.evidence, 240), confidence: number(rel.confidence, 0.7),
                        selected: false,
                    }, {}, 'relation'));
                const draft = {
                    version: 1,
                    id: randomUUID(), dateKey: day, createdAt: new Date().toISOString(),
                    status: 'pending', selection,
                    summary: short(parsed.summary, 600),
                    memoryCandidates, entities, relations,
                };
                await atomicJson(this.draftPath, draft);
                return draft;
            });
        } finally {
            this.generating = false;
        }
    }

    async saveDraft(changes = {}) {
        return this.exclusive(async () => {
            const draft = await this.getDraft();
            if (!draft || draft.id !== changes.draftId || draft.status !== 'pending') {
                throw new Error('Review draft is missing, changed or already committed');
            }
            draft.summary = short(changes.summary ?? draft.summary, 600);
            draft.memoryCandidates = applyEdits(draft.memoryCandidates, changes.memoryCandidates, 'memory');
            draft.entities = applyEdits(draft.entities, changes.entities, 'entity');
            draft.relations = applyEdits(draft.relations, changes.relations, 'relation');
            await atomicJson(this.draftPath, draft);
            return draft;
        });
    }

    async discard(draftId) {
        return this.exclusive(async () => {
            const draft = await this.getDraft();
            if (!draft || draft.id !== draftId || draft.status !== 'pending') {
                throw new Error('No pending draft with that ID');
            }
            await fs.remove(this.draftPath);
            return { success: true };
        });
    }

    async commit(draftId) {
        return this.exclusive(async () => {
            const draft = await this.getDraft();
            if (!draft || draft.id !== draftId || !['pending', 'committing'].includes(draft.status)) {
                throw new Error('No reviewable draft with that ID');
            }
            const selectedMemories = draft.memoryCandidates.filter(item => item.selected);
            const selectedEntities = draft.entities.filter(item => item.selected);
            const selectedRelations = draft.relations.filter(item => item.selected);
            if (!selectedMemories.length && !selectedEntities.length && !selectedRelations.length) {
                throw new Error('Select at least one candidate or discard the draft');
            }
            // Preflight deletion barriers before entering the crash-recoverable
            // committing state, so rejected items remain editable.
            const store = await this.memory.loadStore();
            for (const candidate of selectedMemories) {
                if (this.memory.isTombstoned(store, { name: candidate.name, content: candidate.content })) {
                    throw new Error(`Memory "${candidate.name}" was previously deleted; uncheck it or discard the draft`);
                }
            }
            draft.status = 'committing';
            await atomicJson(this.draftPath, draft);
            const saved = [];
            for (const candidate of selectedMemories) {
                saved.push(await this.memory.upsertMemory({
                    name: candidate.name, summary: candidate.summary, content: candidate.content,
                    category: candidate.category, importance: candidate.importance,
                    confidence: candidate.confidence, factKey: candidate.factKey,
                    factValue: candidate.factValue,
                    source: 'manual-reflection-review', merge: false, auto: false,
                    provenance: {
                        chatId: candidate.chatId, sourceRole: 'user',
                        evidenceText: candidate.evidenceText,
                        sourceDateKey: draft.dateKey, observedAt: candidate.observedAt,
                        reviewId: draft.id,
                    },
                }));
            }
            const entities = draft.entities.filter(item => item.selected).map(({ id, selected, ...value }) => value);
            const relations = draft.relations.filter(item => item.selected).map(({ id, selected, ...value }) => value);
            if (saved.length || entities.length || relations.length) {
                await this.memory.recordOfflineReflectionRun({
                    summary: draft.summary, provider: draft.selection.provider,
                    model: draft.selection.model, entities, relations,
                });
                await this.reflection.appendReflectionLog({
                    dateKey: draft.dateKey, selection: draft.selection,
                    summary: draft.summary, memories: saved, entities, relations,
                });
            }
            draft.status = 'committed';
            draft.committedAt = new Date().toISOString();
            const reflectionState = await this.reflection.loadState();
            reflectionState.lastRunAt = draft.committedAt;
            reflectionState.lastRunDate = draft.dateKey;
            reflectionState.lastError = null;
            reflectionState.runs = [{
                id: draft.id, at: draft.committedAt,
                dateKey: draft.dateKey,
                provider: draft.selection.provider,
                model: draft.selection.model,
                summary: draft.summary,
                memoryCount: saved.length,
                entityCount: entities.length,
                relationCount: relations.length,
                source: 'manual-review',
            }, ...(reflectionState.runs || [])].slice(0, 80);
            await this.reflection.saveState(reflectionState);
            await atomicJson(this.draftPath, draft);
            return { status: 'committed', savedCount: saved.length,
                entityCount: entities.length, relationCount: relations.length };
        });
    }
}

module.exports = { MemoryReviewService };
