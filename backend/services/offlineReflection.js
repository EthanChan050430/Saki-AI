const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');

const { previewText, slugify } = require('./memory');

const DEFAULT_IDLE_MS = 10 * 60 * 1000;
const MAX_SESSION_COUNT = 8;
const MAX_FILE_COUNT = 10;
const MAX_FILE_BYTES = 180 * 1024;
const TEXT_FILE_EXTENSIONS = new Set([
    '.txt', '.md', '.markdown', '.json', '.jsonc', '.yaml', '.yml',
    '.js', '.jsx', '.ts', '.tsx', '.css', '.scss', '.less',
    '.html', '.htm', '.xml', '.py', '.java', '.go', '.rs',
    '.rb', '.php', '.c', '.cc', '.cpp', '.h', '.hpp', '.cs',
    '.sh', '.ps1', '.bat', '.sql', '.toml', '.ini', '.cfg',
    '.env', '.gitignore',
]);
const EXCLUDED_DIRS = new Set([
    '.git', 'node_modules', 'dist', 'build', '.tmp', '.deploy',
    'data', 'memory', 'ssl', '.next', 'coverage',
]);

function nowIso() {
    return new Date().toISOString();
}

function toLocalDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getLocalDayRange(date = new Date()) {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
    const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0);
    return {
        startMs: start.getTime(),
        endMs: end.getTime(),
    };
}

function trimToMax(text = '', max = 2000) {
    const normalized = String(text || '').trim();
    if (!normalized) return '';
    return normalized.length > max ? `${normalized.slice(0, max - 3)}...` : normalized;
}

function stripMarkdown(text = '') {
    return String(text || '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

function isPathInside(basePath, targetPath) {
    const relative = path.relative(path.resolve(basePath), path.resolve(targetPath));
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function normalizeRelativePath(basePath, targetPath) {
    return path.relative(basePath, targetPath).split(path.sep).join('/');
}

function isSensitiveFile(filePath = '') {
    const base = path.basename(filePath).toLowerCase();
    return /((^|[._-])env($|[._-])|(^|[._-])(?:secret|secrets|credentials|password|token|id_rsa)([._-]|$)|\.(?:pem|p12|pfx|key)$)/i.test(base);
}

function redactSensitiveText(text = '') {
    return String(text || '')
        .replace(/([\\"']?(?:api[_-]?key|access[_-]?token|password|secret|client[_-]?secret|authorization)[\\"']?\s*[:=]\s*)(\\"[^\\"]*\\"|'[^']*'|[^\s,}]+)/gi, '$1[REDACTED]')
        .replace(/\b(?:sk-[a-z0-9_-]{16,}|Bearer\s+[a-z0-9._-]{12,})\b/gi, '[REDACTED]');
}

function isTextLikeFile(filePath = '') {
    const ext = path.extname(filePath).toLowerCase();
    return TEXT_FILE_EXTENSIONS.has(ext);
}

function buildHash(payload) {
    return crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex');
}

function extractMessageText(message = {}) {
    const content = typeof message?.content === 'string' ? message.content : '';
    const partText = Array.isArray(message?.parts)
        ? message.parts
            .filter(part => part?.type === 'text' && typeof part.content === 'string')
            .map(part => part.content)
            .join('\n')
        : '';

    return trimToMax(redactSensitiveText(stripMarkdown([content, partText].filter(Boolean).join('\n'))), 1200);
}

function firstUserTitle(messages = []) {
    const firstUser = (messages || []).find(message => message?.role === 'user');
    return previewText(extractMessageText(firstUser), 60) || 'Untitled Session';
}

function collectReferencedFilePaths(messages = []) {
    const filePaths = [];

    for (const message of Array.isArray(messages) ? messages : []) {
        for (const attached of Array.isArray(message?.attachedFiles) ? message.attachedFiles : []) {
            if (attached?.path) filePaths.push(attached.path);
        }

        for (const generated of Array.isArray(message?.generatedFiles) ? message.generatedFiles : []) {
            if (generated?.filePath) filePaths.push(generated.filePath);
        }

        for (const part of Array.isArray(message?.parts) ? message.parts : []) {
            if (part?.fileMetadata?.filePath) {
                filePaths.push(part.fileMetadata.filePath);
            }
            if (part?.data?.args && Array.isArray(part.data.args)) {
                for (const arg of part.data.args) {
                    if (typeof arg === 'string' && /[\\/]/.test(arg)) {
                        filePaths.push(arg);
                    }
                }
            }
        }
    }

    return Array.from(new Set(filePaths.filter(Boolean)));
}

async function safeReadJson(filePath, fallback) {
    return fs.readJson(filePath).catch(() => fallback);
}

function findBalancedJsonEnd(text = '') {
    let depth = 0;
    let inString = false;
    let escaped = false;
    let started = false;

    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        if (!started) {
            if (char === '{') {
                started = true;
                depth = 1;
            }
            continue;
        }

        if (escaped) {
            escaped = false;
            continue;
        }
        if (char === '\\') {
            escaped = true;
            continue;
        }
        if (char === '"') {
            inString = !inString;
            continue;
        }
        if (inString) continue;
        if (char === '{') depth += 1;
        if (char === '}') depth -= 1;
        if (depth === 0) return index + 1;
    }

    return -1;
}

function parseJsonObject(text = '') {
    const raw = String(text || '').trim();
    if (!raw) return null;

    const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fencedMatch?.[1] || raw;
    const startIndex = candidate.indexOf('{');
    if (startIndex < 0) return null;
    const slice = candidate.slice(startIndex);
    const balancedEnd = findBalancedJsonEnd(slice);
    const jsonText = balancedEnd > 0 ? slice.slice(0, balancedEnd) : slice;

    try {
        return JSON.parse(jsonText.trim());
    } catch {
        return null;
    }
}

async function readFileDigest(filePath, workspaceRoot) {
    const stats = await fs.stat(filePath).catch(() => null);
    if (!stats?.isFile() || stats.size > MAX_FILE_BYTES || isSensitiveFile(filePath) || !isTextLikeFile(filePath)) {
        return null;
    }

    const content = await fs.readFile(filePath, 'utf8').catch(() => '');
    const excerpt = trimToMax(redactSensitiveText(content), 1800);
    if (!excerpt.trim()) return null;

    return {
        filePath,
        relativePath: normalizeRelativePath(workspaceRoot, filePath),
        updatedAt: stats.mtime.toISOString(),
        excerpt,
    };
}

async function scanWorkspaceFiles(rootDir, dayRange, result = []) {
    const entries = await fs.readdir(rootDir, { withFileTypes: true }).catch(() => []);

    for (const entry of entries) {
        if (result.length >= MAX_FILE_COUNT) break;
        if (entry.name.startsWith('.') && entry.name !== '.env' && !entry.name.endsWith('rc')) {
            if (!['.github', '.vscode'].includes(entry.name)) continue;
        }
        if (entry.isDirectory()) {
            if (EXCLUDED_DIRS.has(entry.name)) continue;
            await scanWorkspaceFiles(path.join(rootDir, entry.name), dayRange, result);
            continue;
        }

        const filePath = path.join(rootDir, entry.name);
        if (isSensitiveFile(filePath) || !isTextLikeFile(filePath)) continue;

        const stats = await fs.stat(filePath).catch(() => null);
        if (!stats?.isFile()) continue;
        if (stats.mtimeMs < dayRange.startMs || stats.mtimeMs >= dayRange.endMs) continue;

        result.push({
            filePath,
            updatedAtMs: stats.mtimeMs,
        });
    }

    return result;
}

class OfflineReflectionService {
    constructor({ dataDir, workspaceRoot, sessionsDir, memoryService, emitEvent = () => {} }) {
        this.dataDir = dataDir;
        this.workspaceRoot = workspaceRoot;
        this.sessionsDir = sessionsDir;
        this.memoryService = memoryService;
        this.emitEvent = emitEvent;
        this.statePath = path.join(this.dataDir, 'offline_reflection_state.json');
        this.reflectionDir = path.join(memoryService?.workspaceDir || path.resolve(this.dataDir, '..'), 'memory', 'offline-reflections');
        this.running = false;
    }

    async init() {
        await fs.ensureDir(this.reflectionDir);
        if (!(await fs.pathExists(this.statePath))) {
            await fs.writeJson(this.statePath, {
                version: 1,
                lastRunAt: null,
                lastRunDate: null,
                lastInputSignature: '',
                lastError: null,
                runs: [],
            }, { spaces: 2 });
        }
    }

    async loadState() {
        await this.init();
        return safeReadJson(this.statePath, {
            version: 1,
            lastRunAt: null,
            lastRunDate: null,
            lastInputSignature: '',
            lastError: null,
            runs: [],
        });
    }

    async saveState(state) {
        const normalized = {
            version: 1,
            lastRunAt: state?.lastRunAt || null,
            lastRunDate: state?.lastRunDate || null,
            lastInputSignature: state?.lastInputSignature || '',
            lastError: state?.lastError || null,
            runs: Array.isArray(state?.runs) ? state.runs.slice(0, 80) : [],
        };
        await fs.writeJson(this.statePath, normalized, { spaces: 2 });
        return normalized;
    }

    localDateKey(date = new Date()) {
        return toLocalDateKey(date);
    }

    resolveModelSelection(config = {}) {
        // Manual reflection uses the currently configured chat model, including
        // remote API providers. Legacy offlineReflectionProvider/Model values are
        // deliberately ignored so stale local-only settings cannot override it.
        const provider = String(config.provider || '').trim().toLowerCase();
        const model = String(config.model || '').trim();
        return provider && model ? { provider, model } : null;
    }

    async collectTodaySessions(dayRange) {
        const files = await fs.readdir(this.sessionsDir).catch(() => []);
        const sessions = [];

        for (const file of files) {
            if (!file.endsWith('.json') || file.startsWith('task_')) continue;
            const filePath = path.join(this.sessionsDir, file);
            const stats = await fs.stat(filePath).catch(() => null);
            if (!stats?.isFile()) continue;
            if (stats.mtimeMs < dayRange.startMs || stats.mtimeMs >= dayRange.endMs) continue;

            const sessionData = await safeReadJson(filePath, {});
            const source = String(sessionData?.source || 'web').trim().toLowerCase();
            if (source === 'hosted-task') continue;

            const messages = Array.isArray(sessionData?.messages) ? sessionData.messages : [];
            const transcript = messages
                .filter(message => message?.role === 'user' || message?.role === 'assistant')
                .slice(-16)
                .map(message => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${extractMessageText(message)}`)
                .filter(line => line && !/^(User|Assistant):\s*$/.test(line))
                .join('\n');

            if (!transcript.trim()) continue;

            sessions.push({
                chatId: file.replace(/\.json$/i, ''),
                source,
                title: firstUserTitle(messages),
                updatedAt: stats.mtime.toISOString(),
                transcript: trimToMax(transcript, 2600),
                userMessages: messages.slice(-16).filter(message => message?.role === 'user')
                    .map(extractMessageText).filter(Boolean),
                filePaths: collectReferencedFilePaths(messages),
            });
        }

        return sessions
            .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt))
            .slice(0, MAX_SESSION_COUNT);
    }

    async collectTodayFiles(dayRange, sessionFilePaths = []) {
        const seen = new Set();
        const digests = [];

        const tryAddFile = async (filePath) => {
            if (!filePath) return;
            const resolved = path.resolve(filePath);
            if (seen.has(resolved) || !isPathInside(this.workspaceRoot, resolved)) return;

            const stats = await fs.stat(resolved).catch(() => null);
            if (!stats?.isFile()) return;
            if (stats.mtimeMs < dayRange.startMs || stats.mtimeMs >= dayRange.endMs) return;

            const digest = await readFileDigest(resolved, this.workspaceRoot);
            if (!digest) return;

            seen.add(resolved);
            digests.push(digest);
        };

        for (const filePath of sessionFilePaths) {
            if (digests.length >= MAX_FILE_COUNT) break;
            await tryAddFile(filePath);
        }

        if (digests.length >= MAX_FILE_COUNT) {
            return digests;
        }

        const scanned = (await scanWorkspaceFiles(this.workspaceRoot, dayRange))
            .sort((left, right) => right.updatedAtMs - left.updatedAtMs)
            .slice(0, MAX_FILE_COUNT * 3);

        for (const item of scanned) {
            if (digests.length >= MAX_FILE_COUNT) break;
            await tryAddFile(item.filePath);
        }

        return digests.slice(0, MAX_FILE_COUNT);
    }

    async collectDailyInputs(now = new Date()) {
        const dayRange = getLocalDayRange(now);
        const sessionSummaries = await this.collectTodaySessions(dayRange);
        const sessionFilePaths = sessionSummaries.flatMap(item => item.filePaths || []);
        const fileDigests = await this.collectTodayFiles(dayRange, sessionFilePaths);

        return {
            dateKey: toLocalDateKey(now),
            sessionSummaries,
            fileDigests,
        };
    }

    buildPrompt(input = {}) {
        const sessionsText = (input.sessionSummaries || []).length
            ? input.sessionSummaries.map((session, index) => [
                `### Session ${index + 1}`,
                `Title: ${session.title}`,
                `Updated: ${session.updatedAt}`,
                `Transcript:`,
                session.transcript,
            ].join('\n')).join('\n\n')
            : 'No session transcript for today.';

        const filesText = (input.fileDigests || []).length
            ? input.fileDigests.map((file, index) => [
                `### File ${index + 1}`,
                `Path: ${file.relativePath}`,
                `Updated: ${file.updatedAt}`,
                `Excerpt:`,
                file.excerpt,
            ].join('\n')).join('\n\n')
            : 'No changed workspace files for today.';

        return `
You are an offline reflection engine for a local AI agent.
This is an explicitly requested MANUAL memory review. Analyze the selected day's conversations and changed files and suggest durable facts for human review. Do not assert that proposed items have been saved.

Return exactly one JSON object and nothing else.

JSON schema:
{
  "summary": "1-3 sentence daily reflection summary",
  "memoryCandidates": [
    {
      "name": "short memory title",
      "summary": "one sentence",
      "content": "durable fact or synthesized context",
      "evidenceText": "exact quote from a user message (not assistant text)",
      "category": "identity|preference|project|interaction|relationship|general",
      "importance": 0.0,
      "confidence": 0.0,
      "factKey": "optional stable key for a changing fact",
      "factValue": "optional current value"
    }
  ],
  "entities": [
    {
      "name": "entity name",
      "type": "project|person|organization|file|topic|goal|preference|general",
      "summary": "why it matters",
      "status": "latest known status or progress",
      "aliases": ["optional aliases"],
      "confidence": 0.0
    }
  ],
  "relations": [
    {
      "subject": "entity name",
      "subjectType": "project|person|organization|file|topic|goal|preference|general",
      "predicate": "current_status|depends_on|owner|next_step|related_file|preference|working_on|deadline|current_focus|related_to",
      "object": "fact or linked entity",
      "objectType": "state|entity|file|person|date|goal|preference|general",
      "qualifiers": "optional time or scope",
      "evidence": "brief evidence from today's material",
      "confidence": 0.0
    }
  ]
}

Rules:
- Focus on durable knowledge worth remembering after the user comes back.
- Prefer project progress, current focus, file-to-project links, user preferences, identity, recurring constraints, and working style.
- Use "current_status" when capturing the latest known project or task progress.
- Do not invent facts. If evidence is weak, lower confidence.
- Every memory candidate must quote a user message exactly in evidenceText. Assistant text and changed files are context, not evidence of user facts.
- If nothing durable exists, return empty arrays but still provide a short summary.

Date: ${input.dateKey}

## Today's Conversations
${sessionsText}

## Today's Changed Files
${filesText}
        `.trim();
    }

    buildFallbackResult(input = {}) {
        const sessionLines = (input.sessionSummaries || []).map(item => `${item.title}: ${previewText(item.transcript, 180)}`);
        const fileLines = (input.fileDigests || []).map(item => `${item.relativePath}: ${previewText(item.excerpt, 140)}`);
        const summary = previewText([...sessionLines, ...fileLines].join(' | '), 280) || `Daily reflection for ${input.dateKey}`;

        return {
            summary,
            memoryCandidates: summary ? [{
                name: `Offline Reflection: ${input.dateKey}`,
                summary,
                content: trimToMax([
                    sessionLines.length ? `Sessions:\n- ${sessionLines.join('\n- ')}` : '',
                    fileLines.length ? `Files:\n- ${fileLines.join('\n- ')}` : '',
                ].filter(Boolean).join('\n\n'), 2400),
                category: 'general',
                importance: 0.58,
                confidence: 0.45,
            }] : [],
            entities: [],
            relations: [],
        };
    }

    async appendReflectionLog({ dateKey, selection, summary, memories = [], entities = [], relations = [] }) {
        await this.init();
        const filePath = path.join(this.reflectionDir, `${dateKey}.md`);
        const existing = await fs.readFile(filePath, 'utf8').catch(() => `# Offline Reflections - ${dateKey}\n`);
        const content = [
            '',
            `## ${nowIso()}`,
            selection ? `Model: [${selection.provider}] ${selection.model}` : '',
            summary ? `Summary: ${summary}` : '',
            memories.length ? `Memories:\n${memories.map(memory => `- [${memory.category}] ${memory.name}: ${memory.summary}`).join('\n')}` : '',
            entities.length ? `Entities:\n${entities.map(entity => `- [${entity.type}] ${entity.name}: ${entity.status || entity.summary || 'known entity'}`).join('\n')}` : '',
            relations.length ? `Relations:\n${relations.map(relation => `- ${relation.subject} -> ${relation.predicate} -> ${relation.object}`).join('\n')}` : '',
        ].filter(Boolean).join('\n');

        await fs.writeFile(filePath, `${existing.trimEnd()}\n${content}\n`, 'utf8');
    }

    async maybeRun() {
        // Disabled: only MemoryReviewService may trigger model review after a
        // deliberate action in the Memory Manager panel.
        return { status: 'manual-only' };
    }


}

module.exports = {
    OfflineReflectionService,
    parseJsonObject,
};
