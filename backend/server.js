const express = require('express');
const cors = require('cors');
const multer = require('multer');
const http = require('http');
const path = require('path');
const fs = require('fs-extra');
const https = require('https');
const os = require('os');
const crypto = require('crypto');
const cheerio = require('cheerio');
const { parseFile } = require('./services/parser');
const { getAvailableSearchEngines, searchAcrossEngines, searchWeb } = require('./services/search');
const { crawlUrl } = require('./services/crawler');
const mcpManager = require('./services/mcp');
const taskScheduler = require('./services/taskScheduler');
const { MemoryService, previewText } = require('./services/memory');
const { OfflineReflectionService } = require('./services/offlineReflection');
const { SkillService } = require('./services/skills');
const { QQBridgeManager } = require('./services/qqBridge');
const { exec, spawn } = require('child_process');
const axios = require('axios');
const { EventEmitter } = require('events');
const puppeteer = require('puppeteer-core');
const {
    buildImageDataUri,
    downloadImageUrlAsDataUri,
    extractImageSource,
    imageExtensionForMime,
    isValidImageDataUri,
    normalizeCustomDrawingBaseUrl,
    parseImageDataUri,
    prefersHighResDrawModel,
    resolveDrawDimensions,
} = require('./services/imageUtils');
const {
    extractCustomApiModels,
    normalizeCustomApiBaseUrl,
    normalizeCustomChatCompletionsUrl,
} = require('./services/customModelUtils');
const {
    buildMusicSummary,
    compileMusicSpecToMidiBuffer,
    extractMusicPlan,
    flattenMusicSpec,
    normalizeMusicPlan,
} = require('./services/musicUtils');
const { buildCapabilityProfile } = require('./services/capabilityProfile');
const {
    analyzeEmotionalSignals,
    computeCredibilitySignals,
    detectLanguage,
    getVerdictLabel,
    mergeRankedSearchResults,
    pickExcerpt,
} = require('./services/credibility');

const app = express();
const port = 5431;

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

const DATA_DIR = path.join(__dirname, '../data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const REPORTS_DIR = path.join(DATA_DIR, 'reports');
const FILES_DIR = path.join(DATA_DIR, 'files');
const MEMORIES_DIR = path.join(DATA_DIR, 'memories');
const TRASH_DIR = path.join(DATA_DIR, 'Trash');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const MCP_CONFIG_FILE = path.join(DATA_DIR, 'mcp_config.json');
const GLOBAL_CONFIG_FILE = path.join(DATA_DIR, 'global_config.json');
const GLOBAL_CONFIG_TEMPLATE_FILE = path.join(DATA_DIR, 'global_config.example.json');
const QQBOT_SESSION_MAP_FILE = path.join(DATA_DIR, 'qqbot_session_map.json');
const QQBOT_COMMAND_STATE_FILE = path.join(DATA_DIR, 'qqbot_command_state.json');
const PROJECT_ROOT = path.resolve(__dirname, '..');
const WORKSPACE_ROOT = process.cwd();
const SSL_DIR = path.join(PROJECT_ROOT, 'ssl');
const AGENT_PERMISSION_MODE_DEFAULT = 'default';
const AGENT_PERMISSION_MODE_FULL = 'full-access';
const TERMINAL_COMMAND_DEFAULT_TIMEOUT_MS = readDurationEnvMs('TERMINAL_COMMAND_TIMEOUT_MS', 30 * 60 * 1000);
const TERMINAL_COMMAND_MAX_TIMEOUT_MS = readDurationEnvMs('TERMINAL_COMMAND_MAX_TIMEOUT_MS', 6 * 60 * 60 * 1000);
const QQBOT_DATA_DIR = path.join(os.homedir(), '.openclaw', 'qqbot');
const QQBOT_DOWNLOADS_DIR = path.join(QQBOT_DATA_DIR, 'downloads');
const QQBOT_IMAGES_DIR = path.join(QQBOT_DATA_DIR, 'images');
const QQBOT_TTS_DIR = path.join(QQBOT_DATA_DIR, 'tts');
const ACTIVE_AGENT_ACTIONS = new Map();
const FILE_WRITE_LOCKS = new Map();

// Serve uploads directory as static with caching
app.use('/uploads', express.static(UPLOADS_DIR, {
    maxAge: '1d',
    setHeaders: (res, path) => {
        res.setHeader('Cache-Control', 'public, max-age=86400');
    }
}));

// Serve other data directories if needed (e.g. for background images)
app.use('/files', express.static(FILES_DIR, { maxAge: '1h' }));

// Helper to determine if a file is a binary/office format requiring special parsing
function isBinaryOfficeFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const binaryExts = ['.pdf', '.docx', '.xlsx', '.pptx', '.doc', '.xls', '.ppt'];
    return binaryExts.includes(ext);
}

function isImageFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
    return imageExts.includes(ext);
}

function getLocalBrowserPath() {
    const envBrowserPath = process.env.BROWSER_PATH || process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
    if (envBrowserPath && fs.existsSync(envBrowserPath)) {
        return envBrowserPath;
    }

    const browserPaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/microsoft-edge',
        '/opt/google/chrome/chrome',
        '/snap/bin/chromium',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ];

    for (const browserPath of browserPaths) {
        if (fs.existsSync(browserPath)) return browserPath;
    }

    return null;
}

function tryResolveHttpsOptions() {
    if (!fs.existsSync(SSL_DIR)) {
        return null;
    }

    const files = fs.readdirSync(SSL_DIR);
    if (!files.length) {
        return null;
    }

    const resolveFirst = (patterns = []) => {
        for (const pattern of patterns) {
            const match = files.find(file => pattern.test(file));
            if (match) {
                return path.join(SSL_DIR, match);
            }
        }
        return null;
    };

    const resolveCertificatePath = () => {
        const preferred = resolveFirst([
            /(?:^|[_\-.])fullchain\.pem$/i,
            /(?:^|[_\-.])cert(?:ificate)?\.(?:pem|crt)$/i,
            /\.crt$/i,
        ]);
        if (preferred) {
            return preferred;
        }

        const fallback = files.find(file => {
            const lower = file.toLowerCase();
            return (
                /\.(pem|crt)$/.test(lower) &&
                !lower.endsWith('.key') &&
                !lower.includes('_key.') &&
                !lower.includes('.key.') &&
                !lower.startsWith('ca') &&
                !lower.startsWith('chain') &&
                !lower.includes('bundle')
            );
        });

        return fallback ? path.join(SSL_DIR, fallback) : null;
    };

    const keyPath = resolveFirst([
        /(?:^|[_\-.])priv(?:ate)?[_\-.]?key\.(?:pem|key)$/i,
        /(?:^|[_\-.])key\.(?:pem|key)$/i,
        /_key\.(?:pem|key)$/i,
        /\.key$/i,
    ]);
    const certPath = resolveCertificatePath();
    const caPath = resolveFirst([
        /^ca(?:[_\-.].*)?\.(?:pem|crt)$/i,
        /^chain(?:[_\-.].*)?\.(?:pem|crt)$/i,
        /bundle/i,
    ]);

    if (!keyPath || !certPath) {
        return null;
    }

    try {
        const options = {
            key: fs.readFileSync(keyPath),
            cert: fs.readFileSync(certPath),
        };

        if (caPath && caPath !== certPath) {
            options.ca = fs.readFileSync(caPath);
        }

        return {
            options,
            keyPath,
            certPath,
            caPath: caPath && caPath !== certPath ? caPath : null,
        };
    } catch (error) {
        console.warn(`[SSL] Failed to read certificate files from ${SSL_DIR}:`, error.message);
        return null;
    }
}

function isPathInside(basePath, targetPath) {
    const relative = path.relative(path.resolve(basePath), path.resolve(targetPath));
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function getAllowedGeneratedFileRoots() {
    const homeDir = os.homedir();
    return [
        FILES_DIR,
        UPLOADS_DIR,
        PROJECT_ROOT,
        WORKSPACE_ROOT,
        path.join(homeDir, 'Desktop'),
        path.join(homeDir, 'Documents'),
        path.join(homeDir, 'Downloads'),
    ];
}

function isAllowedGeneratedFilePath(filePath) {
    return getAllowedGeneratedFileRoots().some(root => isPathInside(root, filePath));
}

function isProtectedProjectCreationPath(filePath) {
    const resolvedPath = path.resolve(filePath || '');
    return isPathInside(PROJECT_ROOT, resolvedPath) && !isPathInside(FILES_DIR, resolvedPath);
}

function normalizeAgentPermissionMode(value) {
    return value === AGENT_PERMISSION_MODE_FULL
        ? AGENT_PERMISSION_MODE_FULL
        : AGENT_PERMISSION_MODE_DEFAULT;
}

function getAgentPermissionMode(config = {}) {
    return normalizeAgentPermissionMode(config?.agentPermissionMode);
}

function createApprovalSignature(toolName, args = []) {
    return crypto
        .createHash('sha256')
        .update(JSON.stringify({
            toolName: String(toolName || '').toLowerCase(),
            args: Array.isArray(args) ? args.map(arg => String(arg ?? '')) : [],
        }))
        .digest('hex');
}

function isApprovalGrantedForAction(approvalDecision, toolName, args = []) {
    if (!approvalDecision?.signature) return false;
    return approvalDecision.signature === createApprovalSignature(toolName, args);
}

function buildApprovalRequest({ toolName, args = [], reasonKey, reason, summary = '', sandboxRoot = FILES_DIR }) {
    return {
        id: `approval_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        signature: createApprovalSignature(toolName, args),
        toolName,
        args,
        reasonKey,
        reason,
        summary: String(summary || '').slice(0, 1000),
        sandboxRoot,
        createdAt: new Date().toISOString(),
    };
}

function createAgentActionId() {
    return `action_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function registerAgentAction(actionId, data = {}) {
    const control = {
        id: actionId,
        createdAt: new Date().toISOString(),
        skipRequested: false,
        skipReason: '',
        cancel: null,
        ...data,
    };
    ACTIVE_AGENT_ACTIONS.set(actionId, control);
    return control;
}

function unregisterAgentAction(actionId) {
    if (actionId) ACTIVE_AGENT_ACTIONS.delete(actionId);
}

function requestSkipAgentAction(actionId, reason = 'user_skip') {
    const control = ACTIVE_AGENT_ACTIONS.get(actionId);
    if (!control) return null;
    control.skipRequested = true;
    control.skipReason = reason;
    if (typeof control.cancel === 'function') {
        control.cancel(reason);
    }
    return control;
}

function killProcessTree(childProcess) {
    if (!childProcess || !childProcess.pid) return;
    try {
        if (process.platform === 'win32') {
            exec(`taskkill /PID ${childProcess.pid} /T /F`, { windowsHide: true }, () => {});
        } else {
            childProcess.kill('SIGTERM');
            setTimeout(() => {
                try {
                    childProcess.kill('SIGKILL');
                } catch {}
            }, 1500);
        }
    } catch {}
}

function readDurationEnvMs(name, fallbackMs) {
    const raw = String(process.env[name] || '').trim();
    if (!raw) return fallbackMs;
    if (/^(0|none|off|false|disabled|no-limit|unlimited)$/i.test(raw)) return 0;

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return fallbackMs;
    return Math.round(parsed);
}

function normalizeTerminalTimeoutMs(value, fallbackMs = TERMINAL_COMMAND_DEFAULT_TIMEOUT_MS) {
    const raw = String(value ?? '').trim();
    if (!raw) return fallbackMs;
    if (/^(0|none|off|false|disabled|no-limit|unlimited)$/i.test(raw)) return 0;

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return fallbackMs;

    // Tool arguments are seconds for humans; large values are treated as milliseconds.
    const requestedMs = parsed >= 1000 ? parsed : parsed * 1000;
    if (TERMINAL_COMMAND_MAX_TIMEOUT_MS <= 0) return Math.round(requestedMs);
    return Math.min(Math.round(requestedMs), TERMINAL_COMMAND_MAX_TIMEOUT_MS);
}

function formatDurationMs(ms) {
    const value = Number(ms);
    if (!Number.isFinite(value) || value <= 0) return 'no automatic timeout';

    const seconds = Math.round(value / 1000);
    if (seconds < 60) return `${seconds} seconds`;

    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} minutes`;

    const hours = Math.round(minutes / 60);
    return `${hours} hours`;
}

function isSensitivePath(filePath = '') {
    const normalized = String(filePath || '')
        .replace(/\//g, '\\')
        .toLowerCase();

    if (!normalized) return false;

    return [
        /(^|\\)\.env(?:\.|$)/,
        /global_config\.json$/,
        /mcp_config\.json$/,
        /history\.json$/,
        /qqbot_session_map\.json$/,
        /(^|\\)sessions(\\|$)/,
        /(^|\\)memories?(\\|$)/,
        /(^|\\)ssl(\\|$)/,
        /(^|\\)\.git(\\|$)/,
        /(^|\\)\.ssh(\\|$)/,
        /(^|\\)qqbot(\\|$)/,
        /token/,
        /secret/,
        /credential/,
        /private[_-]?key/,
        /\.pem$/,
        /\.key$/,
        /\.pfx$/,
        /\.crt$/,
        /id_rsa$/,
        /id_ed25519$/,
    ].some(pattern => pattern.test(normalized));
}

function isSandboxPath(filePath) {
    return isPathInside(FILES_DIR, filePath);
}

function evaluateTerminalPermission(command, permissionMode) {
    if (permissionMode === AGENT_PERMISSION_MODE_FULL) {
        return { allowed: true, cwd: FILES_DIR };
    }

    const raw = String(command || '').trim();
    const lower = raw.toLowerCase();

    if (!raw) {
        return {
            allowed: false,
            reason: 'Permission denied: empty terminal command.',
        };
    }

    const sandboxEscapePatterns = [
        /(^|[\s("'`])\.\.[\\/]/i,
        /(^|[\s("'`])[a-z]:[\\/]/i,
        /(^|[\s("'`])\\\\/i,
        /\bset-location\b.*(?:\.\.[\\/]|[a-z]:[\\/]|\\\\)/i,
        /\bcd\b\s+(?:\.\.[\\/]|[a-z]:[\\/]|\\\\)/i,
    ];

    if (sandboxEscapePatterns.some(pattern => pattern.test(raw))) {
        return {
            allowed: false,
            reason: `Permission denied: default permission only allows terminal access inside sandbox ${FILES_DIR}. Switch to full access for broader paths.`,
        };
    }

    if (isSensitivePath(raw)) {
        return {
            allowed: false,
            reason: 'Permission denied: default permission blocks access to sensitive config or secret paths.',
        };
    }

    const approvalRules = [
        {
            reasonKey: 'sandbox-terminal-sensitive',
            reason: 'This terminal command can modify files or system state inside the sandbox.',
            pattern: /\b(remove-item|del|erase|rmdir|rd|rename-item|move-item|copy-item|set-content|add-content|out-file|new-item|clear-content|set-item|attrib|icacls|takeown|git\s+(?:clean|reset|checkout|restore|commit|merge|rebase|push)|npm\s+(?:install|update|uninstall)|pnpm\s+(?:add|install|update|remove)|yarn\s+(?:add|install|remove)|pip\s+install|python\s+-m\s+pip\s+install)\b/i,
        },
        {
            reasonKey: 'sandbox-terminal-network',
            reason: 'This terminal command may send data over the network or fetch remote content.',
            pattern: /\b(invoke-webrequest|invoke-restmethod|curl(?:\.exe)?|wget|scp|ftp|tftp|bitsadmin|certutil\s+-urlcache)\b/i,
        },
        {
            reasonKey: 'sandbox-terminal-script',
            reason: 'This terminal command runs an inline script that may perform sensitive changes.',
            pattern: /\b(node|python|python3|perl|ruby|php|powershell|pwsh)\b\s+(?:-e|--eval|-c|-command|-encodedcommand)\b/i,
        },
    ];

    const matchedRule = approvalRules.find(rule => rule.pattern.test(lower));
    if (matchedRule) {
        return {
            allowed: false,
            requiresApproval: true,
            reasonKey: matchedRule.reasonKey,
            reason: matchedRule.reason,
            summary: raw,
            cwd: FILES_DIR,
        };
    }

    return {
        allowed: true,
        cwd: FILES_DIR,
    };
}

function runTerminalCommand({ command, cwd, actionControl, timeoutMs = TERMINAL_COMMAND_DEFAULT_TIMEOUT_MS }) {
    return new Promise(resolve => {
        const isWin = process.platform === 'win32';
        const cmd = isWin ? `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${command}` : command;
        const partialOutputLimit = 2 * 1024 * 1024;
        const effectiveTimeoutMs = normalizeTerminalTimeoutMs(timeoutMs);
        let finished = false;
        let child = null;
        let timeoutId = null;
        let partialStdout = '';
        let partialStderr = '';

        const appendPartial = (current, chunk) => {
            const next = current + String(chunk || '');
            return next.length > partialOutputLimit ? next.slice(-partialOutputLimit) : next;
        };

        const finish = (result) => {
            if (finished) return;
            finished = true;
            if (timeoutId) clearTimeout(timeoutId);
            if (actionControl) {
                actionControl.cancel = null;
                actionControl.childPid = null;
            }
            resolve(result);
        };

        if (effectiveTimeoutMs > 0) {
            timeoutId = setTimeout(() => {
                if (finished) return;
                if (actionControl) {
                    actionControl.skipRequested = true;
                    actionControl.skipReason = 'timeout';
                }
                killProcessTree(child);
                finish({
                    skipped: true,
                    reason: 'timeout',
                    timeoutMs: effectiveTimeoutMs,
                    out: partialStdout,
                    err: partialStderr || `Terminal command timed out after ${formatDurationMs(effectiveTimeoutMs)} and was skipped.`,
                });
            }, effectiveTimeoutMs);
        }

        try {
            child = isWin
                ? spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', cmd], {
                    cwd,
                    windowsHide: true,
                })
                : spawn(command, {
                    shell: true,
                    cwd,
                    windowsHide: true,
                });

            child.on('close', (code, signal) => {
                if (actionControl?.skipRequested) {
                    const reason = actionControl.skipReason || 'user_skip';
                    finish({
                        skipped: true,
                        reason,
                        timeoutMs: effectiveTimeoutMs,
                        out: partialStdout || '',
                        err: reason === 'timeout'
                            ? (partialStderr || `Terminal command timed out after ${formatDurationMs(effectiveTimeoutMs)} and was skipped.`)
                            : (partialStderr || 'Terminal command was skipped by the user.'),
                    });
                    return;
                }

                finish({
                    skipped: false,
                    reason: '',
                    out: partialStdout || '',
                    err: partialStderr || (signal ? `Process exited by signal ${signal}` : ''),
                    exitCode: code ?? (signal ? 1 : 0),
                });
            });

            child.on('error', (error) => {
                finish({
                    skipped: false,
                    reason: '',
                    out: partialStdout || '',
                    err: partialStderr || error.message,
                    exitCode: 1,
                });
            });

            if (child.stdout) {
                child.stdout.on('data', chunk => {
                    partialStdout = appendPartial(partialStdout, chunk);
                });
            }
            if (child.stderr) {
                child.stderr.on('data', chunk => {
                    partialStderr = appendPartial(partialStderr, chunk);
                });
            }

            if (actionControl) {
                actionControl.childPid = child.pid;
                actionControl.cancel = (reason = 'user_skip') => {
                    if (finished) return;
                    actionControl.skipRequested = true;
                    actionControl.skipReason = reason;
                    killProcessTree(child);
                    finish({
                        skipped: true,
                        reason,
                        timeoutMs: effectiveTimeoutMs,
                        out: partialStdout,
                        err: partialStderr || 'Terminal command was skipped by the user.',
                    });
                };

                if (actionControl.skipRequested) {
                    actionControl.cancel(actionControl.skipReason || 'user_skip');
                }
            }
        } catch (error) {
            finish({ skipped: false, reason: '', out: '', err: error.message, exitCode: 1 });
        }
    });
}

function formatFileSize(size = 0) {
    if (!Number.isFinite(size) || size < 0) return '';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

const READ_FILE_DEFAULT_MAX_LINES = 500;
const READ_FILE_RANGE_MAX_LINES = 1200;
const BINARY_DETECTION_SAMPLE_BYTES = 8192;
const LIST_DIR_DEFAULT_LIMIT = 200;
const LIST_DIR_MAX_LIMIT = 1000;
const LARGE_FILE_CHUNK_LINES = 600;
const CONTEXT_DEFAULT_BUDGET_TOKENS = 32000;
const CONTEXT_AUTO_COMPRESS_RATIO = 0.82;
const CONTEXT_TARGET_RATIO = 0.58;
const CONTEXT_RECENT_MESSAGE_COUNT = 8;

function parseToolLineNumber(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    if (!/^-?\d+$/.test(raw)) return NaN;
    return Number.parseInt(raw, 10);
}

function parsePositiveInteger(value, fallback, maxValue = Number.MAX_SAFE_INTEGER) {
    const raw = String(value ?? '').trim();
    if (!raw) return fallback;
    if (!/^\d+$/.test(raw)) return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Math.min(Math.max(parsed, 0), maxValue);
}

function sanitizeProjectFolderName(name = '') {
    const cleaned = String(name || '')
        .trim()
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/\s+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
    return cleaned || `project-${new Date().toISOString().replace(/[:.]/g, '-')}`;
}

function estimateTokenCount(text = '') {
    const source = String(text || '');
    if (!source) return 0;
    const cjkChars = (source.match(/[\u3400-\u9fff]/g) || []).length;
    const nonCjkChars = Math.max(0, source.length - cjkChars);
    return Math.ceil(cjkChars * 0.65 + nonCjkChars / 3.8);
}

function getAgentContextBudgetTokens(provider = '', model = '', config = {}) {
    const configured = Number(config?.agentContextBudgetTokens || config?.contextBudgetTokens || config?.contextWindowTokens);
    if (Number.isFinite(configured) && configured >= 8000) return Math.floor(configured);

    const modelId = String(model || '').toLowerCase();
    if (modelId.includes('claude-3-7') || modelId.includes('claude-sonnet-4') || modelId.includes('claude-opus-4')) return 180000;
    if (modelId.includes('gemini-1.5') || modelId.includes('gemini-2')) return 120000;
    if (modelId.includes('gpt-4.1') || modelId.includes('gpt-5') || modelId.includes('o3') || modelId.includes('o4')) return 120000;
    if (String(provider || '').toLowerCase() === 'ollama') return 32768;
    return CONTEXT_DEFAULT_BUDGET_TOKENS;
}

function compactPreview(text = '', maxChars = 700) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxChars) return normalized;
    return `${normalized.slice(0, Math.max(0, maxChars - 18)).trim()} ...[truncated]`;
}

function serializeMessageForContext(msg = {}, options = {}) {
    const observationLimit = options.observationLimit ?? 500;
    let text = msg.content || '';
    if (msg.role === 'assistant' && Array.isArray(msg.parts)) {
        text = msg.parts.map(part => {
            if (part.type === 'text') return part.content || '';
            let obs = part.observation || '';
            if (obs.length > observationLimit) {
                obs = `${obs.substring(0, observationLimit)}... [DATA TRUNCATED]`;
            }
            const toolArgs = (part.data?.args || []).map(arg => `"${String(arg ?? '').slice(0, 600).replace(/"/g, '\\"')}"`).join(', ');
            return `Tool: ${part.data?.type || 'unknown'}(${toolArgs})${obs ? `\nObservation: ${obs}` : ''}`;
        }).join('\n');
    }
    return `${msg.role === 'user' ? 'User' : 'Assistant'}: ${text}`;
}

function formatMessagesForContext(messages = [], options = {}) {
    return (Array.isArray(messages) ? messages : [])
        .map(msg => serializeMessageForContext(msg, options))
        .join('\n');
}

function buildBackgroundDigest({ olderMessages = [], previousSummary = '', currentTask = '' }) {
    const lines = [];
    if (previousSummary) {
        lines.push('Previous compressed background:');
        lines.push(compactPreview(previousSummary, 4500));
    }

    lines.push('Compressed earlier conversation and tool background:');
    const sourceMessages = Array.isArray(olderMessages) ? olderMessages : [];
    for (const msg of sourceMessages) {
        const role = msg.role === 'user' ? 'User' : 'Assistant';
        if (msg.role === 'assistant' && Array.isArray(msg.parts)) {
            const textParts = msg.parts
                .filter(part => part.type === 'text')
                .map(part => compactPreview(part.content, 420))
                .filter(Boolean);
            const actionParts = msg.parts
                .filter(part => part.type === 'action')
                .slice(-6)
                .map(part => {
                    const args = (part.data?.args || []).map(arg => compactPreview(arg, 120)).join(', ');
                    const obs = compactPreview(part.observation || '', 220);
                    return `tool=${part.data?.type || 'unknown'}(${args})${obs ? ` -> ${obs}` : ''}`;
                });
            const merged = [...textParts, ...actionParts].filter(Boolean).join(' | ');
            if (merged) lines.push(`- ${role}: ${merged}`);
        } else {
            const content = compactPreview(msg.content || '', 700);
            if (content) lines.push(`- ${role}: ${content}`);
        }
    }

    lines.push('Continuity requirements: keep the active user request, pending approvals, edited file paths, file hashes, and recent tool observations precise. Do not treat this summary as permission to ignore the current task.');
    if (currentTask) {
        lines.push(`Current user task (never compressed away): ${compactPreview(currentTask, 1200)}`);
    }

    return lines.join('\n').slice(0, 12000);
}

async function updateSessionContextCompression(chatId, compression = {}) {
    if (!chatId) return;
    const sessionFilePath = path.join(SESSIONS_DIR, `${chatId}.json`);
    const sessionData = await safeReadJsonFile(sessionFilePath, { messages: [] });
    sessionData.contextCompression = {
        ...(sessionData.contextCompression || {}),
        ...compression,
        updatedAt: new Date().toISOString(),
    };
    await fs.writeJson(sessionFilePath, sessionData, { spaces: 2 });
}

async function prepareAgentHistoryContext({ history = [], chatId = '', message = '', context = '', provider = '', model = '', config = {} }) {
    const budgetTokens = getAgentContextBudgetTokens(provider, model, config);
    const maxPromptTokens = Math.max(8000, Math.floor(budgetTokens * CONTEXT_AUTO_COMPRESS_RATIO));
    const targetPromptTokens = Math.max(6000, Math.floor(budgetTokens * CONTEXT_TARGET_RATIO));
    const rawHistory = Array.isArray(history) ? history : [];
    const fullFormattedHistory = formatMessagesForContext(rawHistory, { observationLimit: 500 });
    const fixedContextText = `${message || ''}\n${context || ''}`;
    const fullEstimateTokens = estimateTokenCount(fullFormattedHistory) + estimateTokenCount(fixedContextText) + 5500;

    const baseStatus = {
        usedTokens: fullEstimateTokens,
        budgetTokens,
        percent: Math.min(100, Math.round((fullEstimateTokens / Math.max(1, budgetTokens)) * 100)),
        compressed: false,
        state: 'normal',
        updatedAt: new Date().toISOString(),
    };

    if (fullEstimateTokens <= maxPromptTokens || rawHistory.length <= CONTEXT_RECENT_MESSAGE_COUNT) {
        return {
            formattedHistory: fullFormattedHistory,
            status: baseStatus,
            summary: '',
        };
    }

    const sessionFilePath = chatId ? path.join(SESSIONS_DIR, `${chatId}.json`) : '';
    const sessionData = sessionFilePath
        ? await safeReadJsonFile(sessionFilePath, { messages: [] })
        : {};
    const previousSummary = String(sessionData?.contextCompression?.summary || '').trim();

    let keepCount = CONTEXT_RECENT_MESSAGE_COUNT;
    let formattedHistory = fullFormattedHistory;
    let compressedSummary = '';
    let compressedTokens = fullEstimateTokens;

    while (keepCount >= 2) {
        const olderMessages = rawHistory.slice(0, Math.max(0, rawHistory.length - keepCount));
        const recentMessages = rawHistory.slice(Math.max(0, rawHistory.length - keepCount));
        compressedSummary = buildBackgroundDigest({
            olderMessages,
            previousSummary,
            currentTask: message,
        });
        formattedHistory = [
            `System Background Compression:\n${compressedSummary}`,
            'Recent conversation kept verbatim:',
            formatMessagesForContext(recentMessages, { observationLimit: 700 }),
        ].filter(Boolean).join('\n\n');
        compressedTokens = estimateTokenCount(formattedHistory) + estimateTokenCount(fixedContextText) + 5500;
        if (compressedTokens <= targetPromptTokens || keepCount <= 3) break;
        keepCount -= 2;
    }

    const status = {
        usedTokens: compressedTokens,
        originalUsedTokens: fullEstimateTokens,
        budgetTokens,
        percent: Math.min(100, Math.round((compressedTokens / Math.max(1, budgetTokens)) * 100)),
        originalPercent: Math.min(100, Math.round((fullEstimateTokens / Math.max(1, budgetTokens)) * 100)),
        compressed: true,
        state: compressedTokens > maxPromptTokens ? 'compressed-high' : 'compressed',
        keptRecentMessages: keepCount,
        compressedMessages: Math.max(0, rawHistory.length - keepCount),
        updatedAt: new Date().toISOString(),
    };

    await updateSessionContextCompression(chatId, {
        summary: compressedSummary,
        status,
    }).catch(error => console.warn('[ContextCompression] Failed to persist summary:', error.message));

    return {
        formattedHistory,
        status,
        summary: compressedSummary,
    };
}

function isLikelyBinaryBuffer(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) return false;

    const sampleLength = Math.min(buffer.length, BINARY_DETECTION_SAMPLE_BYTES);
    let suspiciousControlBytes = 0;

    for (let i = 0; i < sampleLength; i++) {
        const byte = buffer[i];
        if (byte === 0) return true;
        const isTextControlByte = byte === 7 || byte === 8 || byte === 9 || byte === 10 || byte === 12 || byte === 13 || byte === 27;
        if (byte < 32 && !isTextControlByte) {
            suspiciousControlBytes++;
        }
    }

    return suspiciousControlBytes / sampleLength > 0.08;
}

function hashBuffer(buffer) {
    return crypto.createHash('sha256').update(buffer || Buffer.alloc(0)).digest('hex');
}

function normalizeExpectedFileHash(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    return raw.replace(/^sha256\s*[:=]\s*/i, '').trim().toLowerCase();
}

function validateExpectedFileHash(expectedHashRaw, actualHash, actionLabel = 'modify') {
    const expectedHash = normalizeExpectedFileHash(expectedHashRaw);
    if (!expectedHash) {
        return {
            ok: false,
            error: `Error: expectedHash is required to ${actionLabel} an existing file safely. Re-read the file and pass the SHA256 value from readFile as the final argument.`,
        };
    }
    if (!/^[a-f0-9]{64}$/.test(expectedHash)) {
        return {
            ok: false,
            error: 'Error: Invalid expectedHash. Pass the exact 64-character SHA256 value shown by readFile.',
        };
    }
    if (expectedHash !== String(actualHash || '').toLowerCase()) {
        return {
            ok: false,
            error: `Error: File changed since it was read. Expected SHA256 ${expectedHash}, current SHA256 ${actualHash}. Re-read the file before editing.`,
        };
    }
    return { ok: true, expectedHash };
}

function detectTextEncoding(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        return { encoding: 'utf8', label: 'UTF-8', bom: Buffer.alloc(0), contentOffset: 0 };
    }
    if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
        return { encoding: 'utf8', label: 'UTF-8 with BOM', bom: buffer.subarray(0, 3), contentOffset: 3 };
    }
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
        return { encoding: 'utf16le', label: 'UTF-16LE with BOM', bom: buffer.subarray(0, 2), contentOffset: 2 };
    }
    if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
        return { encoding: 'utf16be', label: 'UTF-16BE with BOM', bom: buffer.subarray(0, 2), contentOffset: 2 };
    }

    const sampleLength = Math.min(buffer.length, BINARY_DETECTION_SAMPLE_BYTES);
    let evenNulls = 0;
    let oddNulls = 0;
    for (let i = 0; i < sampleLength; i++) {
        if (buffer[i] !== 0) continue;
        if (i % 2 === 0) evenNulls++;
        else oddNulls++;
    }
    const pairCount = Math.max(1, Math.floor(sampleLength / 2));
    if (oddNulls / pairCount > 0.25 && evenNulls / pairCount < 0.05) {
        return { encoding: 'utf16le', label: 'UTF-16LE', bom: Buffer.alloc(0), contentOffset: 0 };
    }
    if (evenNulls / pairCount > 0.25 && oddNulls / pairCount < 0.05) {
        return { encoding: 'utf16be', label: 'UTF-16BE', bom: Buffer.alloc(0), contentOffset: 0 };
    }

    return { encoding: 'utf8', label: 'UTF-8', bom: Buffer.alloc(0), contentOffset: 0 };
}

function decodeTextBuffer(buffer, filePath = 'file') {
    const format = detectTextEncoding(buffer);
    if (format.encoding === 'utf16be') {
        throw new Error(`${filePath} uses UTF-16BE text encoding, which is not currently safe to edit automatically.`);
    }
    if (format.encoding === 'utf16le') {
        return {
            content: buffer.subarray(format.contentOffset).toString('utf16le'),
            format,
            hash: hashBuffer(buffer),
        };
    }
    if (isLikelyBinaryBuffer(buffer)) {
        return null;
    }
    return {
        content: buffer.subarray(format.contentOffset).toString('utf8'),
        format,
        hash: hashBuffer(buffer),
    };
}

function encodeTextContent(content = '', format = null) {
    const text = String(content ?? '');
    const safeFormat = format || { encoding: 'utf8', bom: Buffer.alloc(0) };
    const body = Buffer.from(text, safeFormat.encoding === 'utf16le' ? 'utf16le' : 'utf8');
    return safeFormat.bom?.length ? Buffer.concat([safeFormat.bom, body]) : body;
}

function serializeTextFormat(format = null) {
    if (!format) {
        return { encoding: 'utf8', label: 'UTF-8', bom: '' };
    }
    return {
        encoding: format.encoding === 'utf16le' ? 'utf16le' : 'utf8',
        label: format.label || (format.encoding === 'utf16le' ? 'UTF-16LE' : 'UTF-8'),
        bom: Buffer.isBuffer(format.bom) && format.bom.length ? format.bom.toString('base64') : '',
    };
}

function deserializeTextFormat(format = null) {
    if (!format) return { encoding: 'utf8', label: 'UTF-8', bom: Buffer.alloc(0) };
    if (typeof format === 'string') {
        const lower = format.toLowerCase();
        if (lower.includes('utf-16le')) {
            return {
                encoding: 'utf16le',
                label: format,
                bom: lower.includes('bom') ? Buffer.from([0xff, 0xfe]) : Buffer.alloc(0),
            };
        }
        return {
            encoding: 'utf8',
            label: format,
            bom: lower.includes('bom') ? Buffer.from([0xef, 0xbb, 0xbf]) : Buffer.alloc(0),
        };
    }
    return {
        encoding: format.encoding === 'utf16le' ? 'utf16le' : 'utf8',
        label: format.label || (format.encoding === 'utf16le' ? 'UTF-16LE' : 'UTF-8'),
        bom: format.bom ? Buffer.from(String(format.bom), 'base64') : Buffer.alloc(0),
    };
}

async function readTextFileSnapshot(filePath, stats = null) {
    const fileStats = stats || await fs.stat(filePath);
    const buffer = await fs.readFile(filePath);
    const decoded = decodeTextBuffer(buffer, filePath);
    if (!decoded) {
        return {
            isBinary: true,
            stats: fileStats,
            hash: hashBuffer(buffer),
        };
    }
    return {
        ...decoded,
        isBinary: false,
        stats: fileStats,
    };
}

async function atomicWriteTextFile(filePath, content, format = null) {
    const finalPath = path.resolve(filePath);
    const parentDir = path.dirname(finalPath);
    const tempPath = path.join(parentDir, `.${path.basename(finalPath)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`);
    const buffer = encodeTextContent(content, format);

    await fs.ensureDir(parentDir);
    try {
        await fs.writeFile(tempPath, buffer);
        const tempBuffer = await fs.readFile(tempPath);
        if (!tempBuffer.equals(buffer)) {
            throw new Error(`Atomic write verification failed before replacing ${finalPath}`);
        }
        await fs.rename(tempPath, finalPath);
        const verified = await fs.readFile(finalPath);
        if (!verified.equals(buffer)) {
            throw new Error(`Write verification failed for ${finalPath}`);
        }
        return {
            hash: hashBuffer(verified),
            sizeBytes: verified.length,
        };
    } finally {
        await fs.remove(tempPath).catch(() => {});
    }
}

async function withFileLock(filePath, task) {
    const key = process.platform === 'win32'
        ? path.resolve(filePath).toLowerCase()
        : path.resolve(filePath);
    const previous = FILE_WRITE_LOCKS.get(key) || Promise.resolve();
    let releaseLock;
    const lock = new Promise(resolve => {
        releaseLock = resolve;
    });
    const next = previous.catch(() => {}).then(() => lock);
    FILE_WRITE_LOCKS.set(key, next);

    await previous.catch(() => {});
    try {
        return await task();
    } finally {
        releaseLock();
        if (FILE_WRITE_LOCKS.get(key) === next) {
            FILE_WRITE_LOCKS.delete(key);
        }
    }
}

function detectPreferredLineEnding(text = '') {
    return String(text).includes('\r\n') ? '\r\n' : '\n';
}

function splitTextForLineEdit(text = '') {
    const source = String(text);
    const eol = detectPreferredLineEnding(source);
    const hasTrailingNewline = /\r?\n$/.test(source);
    const normalized = source.replace(/\r\n/g, '\n');

    if (normalized.length === 0) {
        return { lines: [], eol, hasTrailingNewline: false };
    }

    const lines = normalized.split('\n');
    if (hasTrailingNewline) {
        lines.pop();
    }

    return { lines, eol, hasTrailingNewline };
}

function joinTextFromLineEdit(lines = [], eol = '\n', hasTrailingNewline = false) {
    const body = lines.join(eol);
    return hasTrailingNewline ? `${body}${eol}` : body;
}

function splitReplacementLines(content = '') {
    const normalized = String(content).replace(/\r\n/g, '\n');
    if (normalized === '') return [];
    const trimmedFinalNewline = normalized.endsWith('\n')
        ? normalized.slice(0, -1)
        : normalized;
    return trimmedFinalNewline.split('\n');
}

function renderNumberedLines(lines = [], startLine = 1) {
    return lines
        .map((line, index) => `${String(startLine + index).padStart(4, ' ')} | ${line}`)
        .join('\n');
}

function buildTextFileObservation({ filePath, content = '', stats = null, startArg = null, endArg = null, fileHash = '', textFormat = null }) {
    const { lines } = splitTextForLineEdit(content);
    const lineCount = lines.length;
    const requestedStart = parseToolLineNumber(startArg);
    const requestedEnd = parseToolLineNumber(endArg);

    if (Number.isNaN(requestedStart) || Number.isNaN(requestedEnd)) {
        return 'Error: Invalid line range. Use integer line numbers, for example readFile("src/app.js", 1, 120).';
    }

    const header = [
        `File: ${filePath}`,
        stats ? `Size: ${formatFileSize(stats.size)}` : null,
        fileHash ? `SHA256: ${fileHash}` : null,
        textFormat?.label ? `Encoding: ${textFormat.label}` : null,
        stats?.mtime ? `Modified: ${stats.mtime.toISOString()}` : null,
        `Lines: ${lineCount}`,
    ].filter(Boolean);

    if (lineCount === 0) {
        return `${header.join('\n')}\n\n[Empty text file]`;
    }

    let startLine = requestedStart ?? 1;
    let endLine = requestedEnd ?? (requestedStart ? lineCount : Math.min(lineCount, READ_FILE_DEFAULT_MAX_LINES));

    if (startLine < 1 || endLine < 1) {
        return 'Error: Invalid line range. Line numbers start at 1.';
    }
    if (startLine > lineCount) {
        return `Error: Start line ${startLine} is beyond the end of the file (${lineCount} lines).`;
    }
    if (endLine < startLine) {
        return 'Error: End line must be greater than or equal to start line when reading a file.';
    }

    const requestedLineCount = endLine - startLine + 1;
    let rangeCapped = false;
    if (requestedLineCount > READ_FILE_RANGE_MAX_LINES) {
        endLine = startLine + READ_FILE_RANGE_MAX_LINES - 1;
        rangeCapped = true;
    }
    if (endLine > lineCount) {
        endLine = lineCount;
    }

    const visibleLines = lines.slice(startLine - 1, endLine);
    const chunkSize = Math.max(1, READ_FILE_RANGE_MAX_LINES);
    const chunkIndex = Math.floor((startLine - 1) / chunkSize) + 1;
    const chunkCount = Math.max(1, Math.ceil(lineCount / chunkSize));
    const rangeInfo = startLine === 1 && endLine === lineCount
        ? `Showing: all ${lineCount} lines`
        : `Showing: lines ${startLine}-${endLine} of ${lineCount} (chunk ${chunkIndex}/${chunkCount})`;
    const previousRange = startLine > 1
        ? `\nPrevious range: readFile("${filePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}", ${Math.max(1, startLine - READ_FILE_RANGE_MAX_LINES)}, ${startLine - 1})`
        : '';
    const continuation = endLine < lineCount
        ? `\nNext range: readFile("${filePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}", ${endLine + 1}, ${Math.min(lineCount, endLine + READ_FILE_RANGE_MAX_LINES)})`
        : '';
    const cappedNote = rangeCapped ? '\nNote: Requested range was capped to keep the model context stable.' : '';
    const largeFileNote = lineCount > READ_FILE_RANGE_MAX_LINES
        ? `\nLarge file note: use planFileRead("${filePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}", ${LARGE_FILE_CHUNK_LINES}) to split this file into smaller reading chunks.`
        : '';

    return `${header.join('\n')}\n${rangeInfo}${cappedNote}${previousRange}${continuation}${largeFileNote}\n\n${renderNumberedLines(visibleLines, startLine)}`;
}

function buildFileChunkPlanObservation({ filePath, content = '', stats = null, fileHash = '', chunkLines = LARGE_FILE_CHUNK_LINES }) {
    const { lines } = splitTextForLineEdit(content);
    const lineCount = lines.length;
    const safeChunkLines = Math.min(Math.max(50, chunkLines), READ_FILE_RANGE_MAX_LINES);
    const chunkCount = Math.max(1, Math.ceil(Math.max(1, lineCount) / safeChunkLines));
    const header = [
        `File: ${filePath}`,
        stats ? `Size: ${formatFileSize(stats.size)}` : null,
        fileHash ? `SHA256: ${fileHash}` : null,
        `Lines: ${lineCount}`,
        `Chunk size: ${safeChunkLines} lines`,
        `Chunks: ${chunkCount}`,
    ].filter(Boolean);
    const escapedPath = filePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const chunks = [];
    for (let index = 0; index < chunkCount; index++) {
        const startLine = index * safeChunkLines + 1;
        const endLine = Math.min(lineCount, startLine + safeChunkLines - 1);
        chunks.push(`${index + 1}. lines ${startLine}-${endLine}: readFileChunk("${escapedPath}", ${index + 1}, ${safeChunkLines})`);
    }
    return `${header.join('\n')}\n\nRead chunks in order only when needed:\n${chunks.join('\n')}`;
}

function toPortableRelativePath(basePath, targetPath) {
    return path.relative(basePath, targetPath).split(path.sep).join('/');
}

async function buildDownloadableFile(filePath) {
    if (!filePath || !isAllowedGeneratedFilePath(filePath) || !(await fs.exists(filePath))) {
        return null;
    }

    const stats = await fs.stat(filePath);
    if (!stats.isFile()) return null;

    const roots = [
        { type: 'files', basePath: FILES_DIR },
        { type: 'project', basePath: PROJECT_ROOT },
        { type: 'workspace', basePath: WORKSPACE_ROOT },
        { type: 'desktop', basePath: path.join(os.homedir(), 'Desktop') },
        { type: 'documents', basePath: path.join(os.homedir(), 'Documents') },
        { type: 'downloads', basePath: path.join(os.homedir(), 'Downloads') },
    ];

    let relativePath = path.basename(filePath);
    let rootType = 'absolute';

    for (const root of roots) {
        if (isPathInside(root.basePath, filePath)) {
            relativePath = toPortableRelativePath(root.basePath, filePath);
            rootType = root.type;
            break;
        }
    }

    return {
        name: path.basename(filePath),
        filePath,
        relativePath,
        rootType,
        sizeBytes: stats.size,
        sizeLabel: formatFileSize(stats.size),
        downloadUrl: `/api/files/download?path=${encodeURIComponent(filePath)}`
    };
}

async function summarizePathTree(targetPath) {
    const stats = await fs.stat(targetPath).catch(() => null);
    if (!stats) {
        return { files: 0, directories: 0, sizeBytes: 0 };
    }

    if (!stats.isDirectory()) {
        return {
            files: 1,
            directories: 0,
            sizeBytes: stats.size,
        };
    }

    const entries = await fs.readdir(targetPath).catch(() => []);
    const summary = {
        files: 0,
        directories: 1,
        sizeBytes: 0,
    };

    for (const entry of entries) {
        const childSummary = await summarizePathTree(path.join(targetPath, entry));
        summary.files += childSummary.files;
        summary.directories += childSummary.directories;
        summary.sizeBytes += childSummary.sizeBytes;
    }

    return summary;
}

async function clearDirectoryContents(dirPath) {
    const result = {
        dirPath,
        existed: await fs.pathExists(dirPath),
        removedTopLevelEntries: 0,
        removedFiles: 0,
        removedDirectories: 0,
        freedBytes: 0,
    };

    if (!result.existed) {
        await fs.ensureDir(dirPath);
        return result;
    }

    const entries = await fs.readdir(dirPath).catch(() => []);
    for (const entry of entries) {
        const entryPath = path.join(dirPath, entry);
        const summary = await summarizePathTree(entryPath);
        result.removedTopLevelEntries += 1;
        result.removedFiles += summary.files;
        result.removedDirectories += summary.directories;
        result.freedBytes += summary.sizeBytes;
        await fs.remove(entryPath);
    }

    await fs.ensureDir(dirPath);
    return result;
}

async function clearQQBotCacheArtifacts() {
    const targets = [
        {
            key: 'qq-downloads',
            label: 'QQ attachment downloads',
            dirPath: QQBOT_DOWNLOADS_DIR,
        },
        {
            key: 'qq-images',
            label: 'QQ image cache',
            dirPath: QQBOT_IMAGES_DIR,
        },
        {
            key: 'qq-tts',
            label: 'QQ voice cache',
            dirPath: QQBOT_TTS_DIR,
        },
        {
            key: 'generated-reports',
            label: 'Generated reports',
            dirPath: REPORTS_DIR,
        },
    ];

    const details = [];
    const summary = {
        removedTopLevelEntries: 0,
        removedFiles: 0,
        removedDirectories: 0,
        freedBytes: 0,
    };

    for (const target of targets) {
        const detail = await clearDirectoryContents(target.dirPath);
        details.push({
            ...target,
            ...detail,
            freedSizeLabel: formatFileSize(detail.freedBytes),
        });
        summary.removedTopLevelEntries += detail.removedTopLevelEntries;
        summary.removedFiles += detail.removedFiles;
        summary.removedDirectories += detail.removedDirectories;
        summary.freedBytes += detail.freedBytes;
    }

    return {
        details,
        summary: {
            ...summary,
            freedSizeLabel: formatFileSize(summary.freedBytes),
        },
    };
}

fs.ensureDirSync(UPLOADS_DIR);
fs.ensureDirSync(SESSIONS_DIR);
fs.ensureDirSync(REPORTS_DIR);
fs.ensureDirSync(FILES_DIR);
fs.ensureDirSync(MEMORIES_DIR);
fs.ensureDirSync(TRASH_DIR);

const memoryService = new MemoryService({
    dataDir: DATA_DIR,
    memoriesDir: MEMORIES_DIR,
});
memoryService.init().catch(err => console.error('Memory service init failed:', err));
const offlineReflectionService = new OfflineReflectionService({
    dataDir: DATA_DIR,
    workspaceRoot: WORKSPACE_ROOT,
    sessionsDir: SESSIONS_DIR,
    memoryService,
    emitEvent: emitRealtimeEvent,
});
offlineReflectionService.init().catch(err => console.error('Offline reflection init failed:', err));
const skillService = new SkillService({ dataDir: DATA_DIR });
skillService.init().catch(err => console.error('Skill service init failed:', err));

let globalConfigCache = {};
const realtimeBus = new EventEmitter();
realtimeBus.setMaxListeners(100);
let qqbotSessionMap = {};
let qqbotCommandStateMap = {};
let activeRealtimeClientCount = 0;
let lastInteractiveActivityAt = Date.now();

const upload = multer({ dest: UPLOADS_DIR });
const GITHUB_COPILOT_CLIENT_ID = process.env.GITHUB_COPILOT_CLIENT_ID || 'Iv23ctfURkiMfJ4xr5mv';
const GITHUB_COPILOT_MODELS_URL = 'https://api.githubcopilot.com/models';
const GITHUB_COPILOT_CHAT_URL = 'https://api.githubcopilot.com/chat/completions';
const GITHUB_COPILOT_TOKEN_URL = 'https://api.github.com/copilot_internal/v2/token';
const GITHUB_COPILOT_APPS_FILE = process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'github-copilot', 'apps.json')
    : path.join(os.homedir(), '.config', 'github-copilot', 'apps.json');

const COPILOT_MODEL_ALIASES = {
    'openai/gpt-4o': 'gpt-4o',
    'openai/gpt-4o-mini': 'gpt-4o-mini',
    'openai/gpt-4.1': 'gpt-4.1',
    'openai/gpt-4.1-mini': 'gpt-4.1-mini',
    'openai/gpt-5-mini': 'gpt-5-mini',
    'openai/gpt-5.1': 'gpt-5.1',
    'openai/gpt-5.4': 'gpt-5.4',
    'openai/o1': 'o1',
    'openai/o1-mini': 'o1-mini',
    'openai/o3': 'o3',
    'openai/o3-mini': 'o3-mini',
    'google/gemini-2.5-pro': 'gemini-2.5-pro',
    'google/gemini-2.5-flash': 'gemini-2.5-flash',
    'google/gemini-3-flash': 'gemini-3-flash',
    'google/gemini-3-pro': 'gemini-3-pro',
    'anthropic/claude-sonnet-4': 'claude-sonnet-4',
    'anthropic/claude-sonnet-4.5': 'claude-sonnet-4.5',
    'anthropic/claude-opus-4': 'claude-opus-4',
    'anthropic/claude-opus-4.5': 'claude-opus-4.5',
    'anthropic/claude-haiku-4.5': 'claude-haiku-4.5',
};

const FALLBACK_COPILOT_MODELS = [
    { id: 'gpt-5-mini', label: 'OpenAI GPT-5 mini' },
    { id: 'gpt-5.4', label: 'OpenAI GPT-5.4' },
    { id: 'gpt-4o', label: 'OpenAI GPT-4o' },
    { id: 'gemini-3-flash', label: 'Google Gemini 3 Flash' },
    { id: 'claude-sonnet-4.5', label: 'Anthropic Claude Sonnet 4.5' },
    { id: 'claude-opus-4.5', label: 'Anthropic Claude Opus 4.5' },
];

const CHAT_API_PROVIDER_MODEL_CONFIG = {
    openai: {
        label: 'OpenAI',
        apiKeyField: 'openaiApiKey',
        modelsBaseUrl: 'https://api.openai.com/v1',
        auth: 'bearer',
    },
    deepseek: {
        label: 'Deepseek',
        apiKeyField: 'deepseekApiKey',
        modelsBaseUrl: 'https://api.deepseek.com/v1',
        auth: 'bearer',
    },
    zhipu: {
        label: 'Zhipu AI',
        apiKeyField: 'zhipuApiKey',
        modelsBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        auth: 'bearer',
    },
    gemini: {
        label: 'Gemini',
        apiKeyField: 'geminiApiKey',
        modelsBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        auth: 'bearer',
    },
    minimax: {
        label: 'MiniMax',
        apiKeyField: 'minimaxApiKey',
        modelsBaseUrl: 'https://api.minimax.chat/v1',
        auth: 'bearer',
    },
    anthropic: {
        label: 'Anthropic',
        apiKeyField: 'anthropicApiKey',
        modelsBaseUrl: 'https://api.anthropic.com/v1',
        auth: 'anthropic',
    },
    moonshot: {
        label: 'Moonshot AI',
        apiKeyField: 'moonshotApiKey',
        modelsBaseUrl: 'https://api.moonshot.cn/v1',
        auth: 'bearer',
    },
    tongyi: {
        label: 'Tongyi',
        apiKeyField: 'tongyiApiKey',
        modelsBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        auth: 'bearer',
    },
    doubao: {
        label: 'Doubao',
        apiKeyField: 'doubaoApiKey',
        modelsBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        auth: 'bearer',
    },
    custom: {
        label: 'Custom API',
        apiKeyField: 'customApiKey',
        baseUrlField: 'customApiBaseUrl',
        auth: 'bearer',
    },
};

const copilotApiTokenCache = new Map();
const copilotHttpsAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 16,
});

function getCopilotApiHeaders(token) {
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Copilot-Integration-Id': 'vscode-chat',
    };
}

function normalizeCopilotModelId(model, catalog = []) {
    let raw = String(model || '').trim();
    if (!raw) return 'gpt-4o';
    raw = COPILOT_MODEL_ALIASES[raw] || raw;
    if (raw.includes('/')) {
        raw = raw.split('/').slice(1).join('/');
    }

    const exact = catalog.find(item =>
        item.id === raw ||
        item.name === raw ||
        item.version === raw
    );
    return exact?.id || raw;
}

function formatCopilotModelLabel(model = {}) {
    const vendor = String(model.vendor || '').trim();
    const name = String(model.name || model.id || 'Unknown Model').trim();
    return vendor ? `${vendor} ${name}` : name;
}

function isCopilotChatCapableModel(model = {}) {
    const id = String(model.id || '').toLowerCase();
    const family = String(model.capabilities?.family || '').toLowerCase();
    const type = String(model.capabilities?.type || '').toLowerCase();
    return !id.includes('embedding') && !family.includes('embedding') && type !== 'embeddings';
}

function getCachedCopilotApiToken(baseToken) {
    const cached = copilotApiTokenCache.get(baseToken);
    if (!cached || !cached.token || !cached.expiresAt) return null;
    if (Date.now() >= cached.expiresAt - 60 * 1000) {
        copilotApiTokenCache.delete(baseToken);
        return null;
    }
    return cached.token;
}

function isCopilotRetryableError(error) {
    const code = String(error?.code || '').toUpperCase();
    const status = Number(error?.response?.status || 0);
    const message = String(error?.message || '').toLowerCase();

    if ([408, 409, 425, 429, 500, 502, 503, 504].includes(status)) return true;
    if ([
        'ECONNRESET',
        'ECONNABORTED',
        'ETIMEDOUT',
        'ENOTFOUND',
        'EAI_AGAIN',
        'ECONNREFUSED',
        'EPIPE',
        'ERR_NETWORK',
        'ERR_TLS_HANDSHAKE_TIMEOUT',
        'ERR_SSL_WRONG_VERSION_NUMBER',
    ].includes(code)) return true;
    return (
        message.includes('before secure tls connection was established') ||
        message.includes('socket hang up') ||
        message.includes('network error') ||
        message.includes('timeout') ||
        message.includes('temporarily unavailable')
    );
}

async function withCopilotRetry(label, task, options = {}) {
    const {
        retries = 3,
        baseDelayMs = 800,
        signal = null,
    } = options;

    let attempt = 0;
    let lastError = null;

    while (attempt < retries) {
        if (signal?.aborted) {
            const abortError = new Error(`${label} aborted`);
            abortError.code = 'ABORT_ERR';
            throw abortError;
        }

        try {
            return await task(attempt);
        } catch (error) {
            lastError = error;
            attempt += 1;
            const shouldRetry = attempt < retries && isCopilotRetryableError(error) && !signal?.aborted;
            if (!shouldRetry) break;

            const code = error?.code || error?.response?.status || 'UNKNOWN';
            console.warn(`[Copilot] ${label} failed (attempt ${attempt}/${retries}) with ${code}: ${error.message}`);
            const delayMs = baseDelayMs * attempt;
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    throw lastError;
}

async function readLocalCopilotOAuthToken() {
    try {
        if (!(await fs.pathExists(GITHUB_COPILOT_APPS_FILE))) return '';
        const raw = await fs.readFile(GITHUB_COPILOT_APPS_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        const entries = Array.isArray(parsed) ? parsed : Object.values(parsed || {});
        return entries.find(item => item && typeof item.oauth_token === 'string' && item.oauth_token.trim())?.oauth_token?.trim() || '';
    } catch (error) {
        console.warn('Failed to read local GitHub Copilot token:', error.message);
        return '';
    }
}

async function exchangeCopilotApiToken(baseToken) {
    const cachedToken = getCachedCopilotApiToken(baseToken);
    if (cachedToken) return cachedToken;

    const response = await withCopilotRetry('token exchange', () => axios.get(GITHUB_COPILOT_TOKEN_URL, {
        headers: {
            'Authorization': `Bearer ${baseToken}`,
            'Accept': 'application/json',
            'User-Agent': 'OpenClaw-Compatible-Client',
        },
        timeout: 30000,
        httpsAgent: copilotHttpsAgent,
    }), { retries: 3, baseDelayMs: 1000 });

    const apiToken = response.data?.token || baseToken;
    const refreshInSeconds = Number(response.data?.refresh_in || 0);
    const expiresAt = Number.isFinite(refreshInSeconds) && refreshInSeconds > 0
        ? Date.now() + refreshInSeconds * 1000
        : Date.now() + 25 * 60 * 1000;

    copilotApiTokenCache.set(baseToken, {
        token: apiToken,
        expiresAt,
    });

    return apiToken;
}

async function resolveCopilotAuth(configToken = '') {
    const localToken = await readLocalCopilotOAuthToken();
    const trimmedConfigToken = String(configToken || '').trim();
    const candidates = [
        trimmedConfigToken.startsWith('ghu_') ? trimmedConfigToken : '',
        localToken,
        trimmedConfigToken,
    ].filter(Boolean);

    if (!candidates.length) {
        throw new Error('GitHub Copilot token is missing. Please login or install GitHub Copilot locally.');
    }

    let lastError = null;
    for (const candidate of candidates) {
        try {
            const apiToken = await exchangeCopilotApiToken(candidate);
            return { baseToken: candidate, apiToken };
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error('Failed to resolve GitHub Copilot token.');
}

async function fetchCopilotModels(token) {
    const { apiToken } = await resolveCopilotAuth(token);
    const response = await withCopilotRetry('model fetch', () => axios.get(GITHUB_COPILOT_MODELS_URL, {
        headers: getCopilotApiHeaders(apiToken),
        timeout: 30000,
        httpsAgent: copilotHttpsAgent,
    }), { retries: 3, baseDelayMs: 1000 });
    const models = Array.isArray(response.data?.data) ? response.data.data : Array.isArray(response.data) ? response.data : [];
    return models
        .filter(isCopilotChatCapableModel)
        .map(model => ({
            id: model.id,
            label: formatCopilotModelLabel(model),
            name: model.name || model.id,
            vendor: model.vendor || '',
            version: model.version || model.id,
            capabilities: model.capabilities || {},
            modelPickerEnabled: model.model_picker_enabled !== false,
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

function normalizeChatProviderId(provider = '') {
    const normalized = String(provider || '').trim().toLowerCase();
    if (!normalized) return 'ollama';
    return normalized === 'github' ? 'copilot' : normalized;
}

function getChatProviderLabel(provider = '') {
    switch (normalizeChatProviderId(provider)) {
        case 'copilot':
            return 'GitHub Models';
        case 'custom':
            return 'Custom API';
        case 'lmstudio':
            return 'LMStudio';
        case 'openai':
            return 'OpenAI';
        case 'deepseek':
            return 'Deepseek';
        case 'zhipu':
            return 'Zhipu AI';
        case 'gemini':
            return 'Gemini';
        case 'minimax':
            return 'MiniMax';
        case 'anthropic':
            return 'Anthropic';
        case 'moonshot':
            return 'Moonshot AI';
        case 'tongyi':
            return 'Tongyi';
        case 'doubao':
            return 'Doubao';
        case 'ollama':
        default:
            return 'Ollama';
    }
}

function getChatApiProviderMeta(provider = '') {
    return CHAT_API_PROVIDER_MODEL_CONFIG[normalizeChatProviderId(provider)] || null;
}

function getConfiguredChatApiKey(config = {}, provider = '') {
    const normalizedProvider = normalizeChatProviderId(provider);
    const meta = getChatApiProviderMeta(normalizedProvider);
    if (!meta) return '';

    const directKey = String(config?.[meta.apiKeyField] || '').trim();
    if (directKey) return directKey;

    if (normalizedProvider === 'custom') {
        return String(config?.apiKey || '').trim();
    }

    return '';
}

function getConfiguredChatApiBaseUrl(config = {}, provider = '') {
    const normalizedProvider = normalizeChatProviderId(provider);
    if (normalizedProvider !== 'custom') {
        return getChatApiProviderMeta(normalizedProvider)?.modelsBaseUrl || '';
    }

    return String(config?.customApiBaseUrl || config?.apiBaseUrl || '').trim();
}

function migrateChatApiProviderConfig(config = {}) {
    const next = { ...(config || {}) };

    for (const meta of Object.values(CHAT_API_PROVIDER_MODEL_CONFIG)) {
        if (meta.apiKeyField && next[meta.apiKeyField] === undefined) {
            next[meta.apiKeyField] = '';
        }
        if (meta.baseUrlField && next[meta.baseUrlField] === undefined) {
            next[meta.baseUrlField] = meta.baseUrlField === 'customApiBaseUrl' ? (next.apiBaseUrl || '') : '';
        }
    }

    if (next.showAllEnabledApiModels === undefined) {
        next.showAllEnabledApiModels = false;
    }

    const activeProvider = normalizeChatProviderId(next.provider);
    const activeMeta = getChatApiProviderMeta(activeProvider);
    const legacyApiKey = String(next.apiKey || '').trim();

    if (activeMeta?.apiKeyField && legacyApiKey && !String(next[activeMeta.apiKeyField] || '').trim()) {
        next[activeMeta.apiKeyField] = legacyApiKey;
    }

    if (activeProvider === 'custom' && !String(next.customApiBaseUrl || '').trim() && next.apiBaseUrl) {
        next.customApiBaseUrl = next.apiBaseUrl;
    }

    return next;
}

function createChatApiModelHeaders(provider = '', apiKey = '') {
    const normalizedProvider = normalizeChatProviderId(provider);
    const meta = getChatApiProviderMeta(normalizedProvider);
    const headers = { 'Content-Type': 'application/json' };
    const trimmedKey = String(apiKey || '').trim();

    if (!trimmedKey) return headers;

    if (meta?.auth === 'anthropic') {
        headers['x-api-key'] = trimmedKey;
        headers['anthropic-version'] = '2023-06-01';
        return headers;
    }

    headers.Authorization = `Bearer ${trimmedKey}`;
    return headers;
}

function normalizeProviderModelBaseUrl(provider = '', rawBaseUrl = '') {
    const normalizedProvider = normalizeChatProviderId(provider);
    const fallbackBaseUrl = getChatApiProviderMeta(normalizedProvider)?.modelsBaseUrl || '';
    let baseUrl = String(rawBaseUrl || fallbackBaseUrl || '').trim();
    if (!baseUrl) return '';

    if (normalizedProvider === 'custom') {
        return normalizeCustomApiBaseUrl(baseUrl);
    }

    return baseUrl
        .replace(/\/+$/, '')
        .replace(/\/models$/i, '');
}

async function fetchChatApiProviderModels({ provider = '', baseUrl = '', apiKey = '' } = {}) {
    const normalizedProvider = normalizeChatProviderId(provider);
    const providerBaseUrl = normalizeProviderModelBaseUrl(normalizedProvider, baseUrl);
    if (!providerBaseUrl) return [];

    const endpoint = `${providerBaseUrl}/models`;
    const response = await axios.get(endpoint, {
        headers: createChatApiModelHeaders(normalizedProvider, apiKey),
        timeout: 12000,
    });

    return extractCustomApiModels(response.data);
}

function normalizeSelectableModelId(provider = '', modelId = '', catalog = []) {
    const trimmed = String(modelId || '').trim();
    if (!trimmed) return '';
    if (normalizeChatProviderId(provider) === 'copilot') {
        return normalizeCopilotModelId(trimmed, catalog);
    }
    return trimmed;
}

function dedupeSelectableModels(models = []) {
    const seen = new Set();
    return (Array.isArray(models) ? models : []).filter((model) => {
        const provider = normalizeChatProviderId(model?.provider || '');
        const id = String(model?.id || '').trim();
        if (!id) return false;
        const key = `${provider}:${id}`.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

async function fetchOllamaModelCatalog(ollamaUrl = 'http://localhost:11434') {
    let baseUrl = String(ollamaUrl || 'http://localhost:11434').trim();
    if (!baseUrl.startsWith('http')) {
        baseUrl = `http://${baseUrl}`;
    }
    baseUrl = baseUrl.replace(/\/$/, '');

    const response = await axios.get(`${baseUrl}/api/tags`, { timeout: 8000 });
    const models = Array.isArray(response.data?.models) ? response.data.models : [];
    return models
        .map((item) => ({
            provider: 'ollama',
            id: String(item?.name || '').trim(),
            label: String(item?.name || '').trim(),
        }))
        .filter((item) => item.id)
        .sort((left, right) => left.label.localeCompare(right.label));
}

async function fetchCustomChatModelCatalog(config = {}) {
    const rawBaseUrl = getConfiguredChatApiBaseUrl(config, 'custom');
    if (!rawBaseUrl) return [];

    const baseUrl = normalizeCustomApiBaseUrl(rawBaseUrl);
    const response = await axios.get(`${baseUrl}/models`, {
        headers: createChatApiModelHeaders('custom', getConfiguredChatApiKey(config, 'custom')),
        timeout: 12000,
    });

    return extractCustomApiModels(response.data).map((item) => ({
        provider: 'custom',
        id: String(item?.name || item?.id || '').trim(),
        label: String(item?.label || item?.name || item?.id || '').trim(),
    }));
}

async function fetchSelectableChatModels(config = {}) {
    const currentProvider = normalizeChatProviderId(config?.provider);
    const tasks = [
        fetchOllamaModelCatalog(config?.ollamaUrl).then((models) => ({ key: 'ollama', models })),
    ];

    if (config?.copilotToken || currentProvider === 'copilot') {
        tasks.push(
            fetchCopilotModels(config?.copilotToken || '')
                .then((catalog) => ({
                    key: 'copilot',
                    models: catalog.map((item) => ({
                        provider: 'copilot',
                        id: normalizeSelectableModelId('copilot', item.id || item.name, catalog),
                        label: String(item.label || item.name || item.id || '').trim(),
                    })),
                }))
                .catch(() => ({
                    key: 'copilot',
                    models: FALLBACK_COPILOT_MODELS.map((item) => ({
                        provider: 'copilot',
                        id: normalizeSelectableModelId('copilot', item.id, FALLBACK_COPILOT_MODELS),
                        label: item.label,
                    })),
                }))
        );
    }

    for (const provider of Object.keys(CHAT_API_PROVIDER_MODEL_CONFIG).filter((item) => item !== 'custom')) {
        const hasApiKey = Boolean(getConfiguredChatApiKey(config, provider));
        if (currentProvider !== provider && !(config?.showAllEnabledApiModels && hasApiKey)) {
            continue;
        }

        tasks.push(
            fetchChatApiProviderModels({
                provider,
                apiKey: getConfiguredChatApiKey(config, provider),
            }).then((models) => ({
                key: provider,
                models: models.map((item) => ({
                    provider,
                    id: String(item?.name || item?.id || '').trim(),
                    label: String(item?.label || item?.name || item?.id || '').trim(),
                })),
            }))
        );
    }

    if (getConfiguredChatApiBaseUrl(config, 'custom') || currentProvider === 'custom') {
        tasks.push(
            fetchCustomChatModelCatalog(config).then((models) => ({ key: 'custom', models }))
        );
    }

    const settled = await Promise.allSettled(tasks);
    const warnings = [];
    let models = [];

    for (const result of settled) {
        if (result.status === 'fulfilled') {
            models = models.concat(result.value.models || []);
        } else {
            warnings.push(result.reason?.message || 'Unknown error');
        }
    }

    models = dedupeSelectableModels(models);

    const currentModelId = normalizeSelectableModelId(currentProvider, config?.model || '', models);
    const hasCurrentModel = models.some((item) => (
        normalizeChatProviderId(item.provider) === currentProvider
        && item.id === currentModelId
    ));

    if (currentModelId && !hasCurrentModel) {
        models.unshift({
            provider: currentProvider,
            id: currentModelId,
            label: `${currentModelId} (current)`,
        });
        models = dedupeSelectableModels(models);
    }

    return {
        models,
        warnings,
        currentProvider,
        currentModelId,
    };
}

function formatQQModelSelectionPrompt({ models = [], currentProvider = '', currentModelId = '', warnings = [] }) {
    const currentProviderLabel = getChatProviderLabel(currentProvider);
    const lines = [
        `当前模型：[${currentProviderLabel}] ${currentModelId || '未设置'}`,
        '可用模型：',
        ...models.map((item, index) => {
            const providerLabel = getChatProviderLabel(item.provider);
            const isCurrent = normalizeChatProviderId(item.provider) === currentProvider && item.id === currentModelId;
            return `${index + 1}. [${providerLabel}] ${item.label || item.id}${isCurrent ? '（当前）' : ''}`;
        }),
    ];

    if (warnings.length > 0) {
        lines.push(`提示：部分提供商刷新失败：${warnings.join('; ')}`);
    }

    lines.push('回复对应序号即可切换模型，回复 n 可取消。');
    return lines.join('\n').trim();
}

function parseQQModelSelectionInput(raw = '') {
    const normalized = String(raw || '')
        .normalize('NFKC')
        .trim();

    if (!normalized) {
        return { action: 'empty' };
    }
    if (/^(?:n|no|cancel|取消)$/i.test(normalized)) {
        return { action: 'cancel' };
    }
    if (/^\d+$/.test(normalized)) {
        return { action: 'select', index: Number.parseInt(normalized, 10) - 1 };
    }
    return { action: 'invalid', raw: normalized };
}

function extractCopilotMessageText(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content
            .map(part => {
                if (typeof part === 'string') return part;
                if (typeof part?.text === 'string') return part.text;
                if (typeof part?.content === 'string') return part.content;
                return '';
            })
            .join('');
    }
    return '';
}

function extractCopilotDeltaText(chunk = {}) {
    return extractCopilotMessageText(chunk?.choices?.[0]?.delta?.content);
}

function extractCopilotReasoningText(chunk = {}) {
    const delta = chunk?.choices?.[0]?.delta || {};
    const directReasoning =
        delta.reasoning_text
        || delta.reasoning_content
        || delta.reasoning
        || delta.thinking
        || delta.thought;
    if (directReasoning) return extractCopilotMessageText(directReasoning);

    if (Array.isArray(delta.content)) {
        return delta.content
            .map(part => {
                const type = String(part?.type || '').toLowerCase();
                if (type.includes('reason') || type.includes('think') || type.includes('thought')) {
                    return extractCopilotMessageText(part?.text || part?.content || '');
                }
                return '';
            })
            .join('');
    }

    return '';
}

async function streamCopilotChat({ apiToken, payload, signal, onText, onReasoning }) {
    const response = await withCopilotRetry('stream chat start', () => axios.post(GITHUB_COPILOT_CHAT_URL, {
        ...payload,
        stream: true,
    }, {
        headers: getCopilotApiHeaders(apiToken),
        responseType: 'stream',
        timeout: 300000,
        signal,
        httpsAgent: copilotHttpsAgent,
    }), { retries: 3, baseDelayMs: 1200, signal });

    let buffer = '';
    let text = '';
    let reasoning = '';
    let finishReason = '';

    const handleLine = (line) => {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) return false;

        const dataStr = trimmed.slice(6).trim();
        if (dataStr === '[DONE]') {
            return true;
        }

        let parsed;
        try {
            parsed = JSON.parse(dataStr);
        } catch (error) {
            return false;
        }

        if (parsed?.error?.message) {
            throw new Error(parsed.error.message);
        }

        const deltaText = extractCopilotDeltaText(parsed);
        const reasoningText = extractCopilotReasoningText(parsed);
        const currentFinishReason = parsed?.choices?.[0]?.finish_reason || '';
        if (currentFinishReason) finishReason = currentFinishReason;

        if (reasoningText) {
            reasoning += reasoningText;
            if (onReasoning) onReasoning(reasoningText);
        }

        if (deltaText) {
            text += deltaText;
            if (onText) onText(deltaText, parsed);
        }

        return false;
    };

    for await (const chunk of response.data) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            if (handleLine(line)) {
                return { text, reasoning, finishReason };
            }
        }
    }

    if (buffer) {
        handleLine(buffer);
    }

    return { text, reasoning, finishReason };
}

async function fetchCopilotChatOnce({ apiToken, payload, signal }) {
    const response = await withCopilotRetry('chat fallback', () => axios.post(GITHUB_COPILOT_CHAT_URL, {
        ...payload,
        stream: false,
    }, {
        headers: getCopilotApiHeaders(apiToken),
        timeout: 300000,
        signal,
        httpsAgent: copilotHttpsAgent,
    }), { retries: 2, baseDelayMs: 1200, signal });

    if (response.data?.error?.message) {
        throw new Error(response.data.error.message);
    }

    const message = response.data?.choices?.[0]?.message || {};
    return extractCopilotMessageText(message.content);
}

// --- Trash Utils ---
async function moveToTrash(filePath) {
    if (!(await fs.exists(filePath))) return false;
    const stats = await fs.stat(filePath);
    const isDir = stats.isDirectory();

    const fileName = path.basename(filePath);
    const timestamp = Date.now();
    const trashFileName = `${fileName}.${timestamp}`;
    const trashPath = path.join(TRASH_DIR, trashFileName);

    // Store metadata about original path
    const metaPath = path.join(TRASH_DIR, `${trashFileName}.json`);
    await fs.writeJson(metaPath, {
        originalPath: filePath,
        fileName: fileName,
        deletedAt: new Date().toISOString(),
        size: isDir ? '--' : (stats.size / 1024).toFixed(2) + ' KB',
        isDirectory: isDir
    });

    await fs.move(filePath, trashPath);
    return trashFileName;
}

// --- History Utils ---
async function getHistory() {
    try {
        if (await fs.exists(HISTORY_FILE)) {
            const content = await fs.readFile(HISTORY_FILE, 'utf8');
            if (!content || content.trim() === '') return [];
            return JSON.parse(content);
        }
    } catch (e) {
        console.error('Error reading history file, resetting to empty array:', e);
        // If it's corrupted, we might want to back it up or just reset it
        await fs.writeJson(HISTORY_FILE, [], { spaces: 2 });
    }
    return [];
}

async function saveHistory(history) {
    await fs.writeJson(HISTORY_FILE, history, { spaces: 2 });
}

function hasPendingRequest(pendingRequest) {
    if (!pendingRequest) return false;
    if (typeof pendingRequest !== 'object') return true;
    return Object.keys(pendingRequest).length > 0;
}

function hasListItems(value) {
    return Array.isArray(value) && value.some(Boolean);
}

function hasUserAuthoredContent(message = {}) {
    if (message?.role !== 'user') return false;

    const content = typeof message.content === 'string' ? message.content.trim() : '';
    return Boolean(
        content ||
        hasListItems(message.files) ||
        hasListItems(message.attachedFiles) ||
        hasListItems(message.uploadedFiles)
    );
}

function shouldPruneEmptyHistorySession(session = {}) {
    const source = String(session.source || 'web').trim().toLowerCase();
    if (source && source !== 'web') return false;
    if (hasPendingRequest(session.pendingRequest)) return false;

    const messages = Array.isArray(session.messages) ? session.messages : [];
    return !messages.some(hasUserAuthoredContent);
}

async function removeHistoryEntry(chatId) {
    const history = await getHistory();
    const nextHistory = history.filter(item => String(item?.id) !== String(chatId));
    if (nextHistory.length !== history.length) {
        await saveHistory(nextHistory);
    }
    return nextHistory;
}

async function getPrunedHistory() {
    const history = await getHistory();
    const nextHistory = [];
    let changed = false;

    for (const item of history) {
        const chatId = item?.id;
        if (!chatId) {
            changed = true;
            continue;
        }

        const sessionFilePath = path.join(SESSIONS_DIR, `${chatId}.json`);
        if (!(await fs.pathExists(sessionFilePath))) {
            changed = true;
            continue;
        }

        const sessionData = await safeReadJsonFile(sessionFilePath, { messages: [] });
        const source = sessionData.source || item.source || 'web';
        const sessionForPrune = {
            messages: Array.isArray(sessionData.messages) ? sessionData.messages : [],
            pendingRequest: sessionData.pendingRequest || null,
            source,
        };

        if (shouldPruneEmptyHistorySession(sessionForPrune)) {
            await fs.remove(sessionFilePath);
            changed = true;
            continue;
        }

        nextHistory.push(item);
    }

    if (changed) {
        await saveHistory(nextHistory);
    }

    return nextHistory;
}

function findBalancedJsonEnd(text) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    let started = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (!started) {
            if (char === '{' || char === '[') {
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
        if (char === '{' || char === '[') depth++;
        if (char === '}' || char === ']') depth--;
        if (depth === 0) return i + 1;
    }

    return -1;
}

async function safeReadJsonFile(filePath, fallback = {}) {
    try {
        return await fs.readJson(filePath);
    } catch (error) {
        const raw = await fs.readFile(filePath, 'utf8').catch(() => '');
        if (!raw.trim()) return fallback;

        const balancedEnd = findBalancedJsonEnd(raw);
        if (balancedEnd > 0) {
            const repaired = raw.slice(0, balancedEnd).trim();
            try {
                const parsed = JSON.parse(repaired);
                await fs.writeFile(filePath, `${repaired}\n`, 'utf8');
                console.warn(`[JSON Repair] Repaired malformed JSON file: ${filePath}`);
                return parsed;
            } catch {
                // fall through
            }
        }

        console.error(`[JSON Repair] Failed to repair JSON file: ${filePath}`, error.message);
        return fallback;
    }
}

function getDefaultGlobalConfig() {
    return {
        provider: 'ollama',
        model: 'llama3',
        ollamaUrl: 'http://localhost:11434',
        apiKey: '',
        apiBaseUrl: '',
        openaiApiKey: '',
        deepseekApiKey: '',
        zhipuApiKey: '',
        geminiApiKey: '',
        minimaxApiKey: '',
        anthropicApiKey: '',
        moonshotApiKey: '',
        tongyiApiKey: '',
        doubaoApiKey: '',
        customApiKey: '',
        customApiBaseUrl: '',
        showAllEnabledApiModels: false,
        searchEngine: 'searxng',
        searxngUrl: 'http://127.0.0.1:8080',
        googleApiKey: '',
        googleCxId: '',
        bingApiKey: '',
        searchEnabled: false,
        mcpServices: [],
        mcpConfig: {
            mcpServers: {},
        },
        drawingModel: '',
        drawingProvider: '',
        musicEnabled: true,
        sdModel: '',
        sdUrl: 'http://127.0.0.1:7860/sdapi/v1/txt2img',
        customDrawingUrl: '',
        customDrawingModel: '',
        customDrawingKey: '',
        chatBackgroundImage: '/assets/background.png',
        userAvatar: '/assets/head_user.png',
        aiAvatar: '',
        showParticles: true,
        systemPrompt: 'You are Saki, a warm and helpful assistant. Do not reveal tool traces or internal chain-of-thought.',
        copilotToken: '',
        ttsProvider: 'browser',
        sovitsUrl: 'http://127.0.0.1:9880',
        sovitsGptModel: '',
        sovitsSovitsModel: '',
        sovitsRefAudio: '',
        sovitsRefText: '',
        thirdPartyChats: {
            qqbot: {
                enabled: false,
                appId: '',
                clientSecret: '',
                sandbox: false,
                markdownSupport: false,
            },
        },
        offlineReflectionEnabled: false,
        offlineReflectionProvider: 'ollama',
        offlineReflectionModel: '',
        agentPermissionMode: AGENT_PERMISSION_MODE_DEFAULT,
    };
}

async function ensureGlobalConfigFile() {
    const defaults = getDefaultGlobalConfig();

    if (await fs.pathExists(GLOBAL_CONFIG_FILE)) {
        return defaults;
    }

    const templateConfig = await safeReadJsonFile(GLOBAL_CONFIG_TEMPLATE_FILE, defaults);
    const initialConfig = {
        ...defaults,
        ...(templateConfig && typeof templateConfig === 'object' && !Array.isArray(templateConfig) ? templateConfig : {}),
        provider: defaults.provider,
        model: defaults.model,
        ollamaUrl: defaults.ollamaUrl,
        apiKey: defaults.apiKey,
        apiBaseUrl: defaults.apiBaseUrl,
        searchEngine: defaults.searchEngine,
        searxngUrl: defaults.searxngUrl,
        googleApiKey: defaults.googleApiKey,
        googleCxId: defaults.googleCxId,
        bingApiKey: defaults.bingApiKey,
        searchEnabled: defaults.searchEnabled,
        drawingModel: defaults.drawingModel,
        drawingProvider: defaults.drawingProvider,
        musicEnabled: defaults.musicEnabled,
        sdModel: defaults.sdModel,
        sdUrl: defaults.sdUrl,
        customDrawingUrl: defaults.customDrawingUrl,
        customDrawingModel: defaults.customDrawingModel,
        customDrawingKey: defaults.customDrawingKey,
        systemPrompt: defaults.systemPrompt,
        copilotToken: defaults.copilotToken,
        ttsProvider: defaults.ttsProvider,
        sovitsUrl: defaults.sovitsUrl,
        sovitsGptModel: defaults.sovitsGptModel,
        sovitsSovitsModel: defaults.sovitsSovitsModel,
        sovitsRefAudio: defaults.sovitsRefAudio,
        sovitsRefText: defaults.sovitsRefText,
        mcpServices: Array.isArray(templateConfig?.mcpServices) ? templateConfig.mcpServices : defaults.mcpServices,
        mcpConfig: {
            mcpServers: {},
        },
        thirdPartyChats: {
            ...(templateConfig?.thirdPartyChats && typeof templateConfig.thirdPartyChats === 'object' && !Array.isArray(templateConfig.thirdPartyChats)
                ? templateConfig.thirdPartyChats
                : {}),
            qqbot: {
                enabled: false,
                appId: '',
                clientSecret: '',
                sandbox: false,
                markdownSupport: false,
            },
        },
        offlineReflectionEnabled: defaults.offlineReflectionEnabled,
        offlineReflectionProvider: defaults.offlineReflectionProvider,
        offlineReflectionModel: defaults.offlineReflectionModel,
        agentPermissionMode: defaults.agentPermissionMode,
    };

    await fs.writeJson(GLOBAL_CONFIG_FILE, initialConfig, { spaces: 2 });
    return defaults;
}

async function readGlobalConfig() {
    const defaults = await ensureGlobalConfigFile();
    globalConfigCache = await safeReadJsonFile(GLOBAL_CONFIG_FILE, {});
    if (!globalConfigCache || typeof globalConfigCache !== 'object' || Array.isArray(globalConfigCache) || Object.keys(globalConfigCache).length === 0) {
        globalConfigCache = defaults;
        await fs.writeJson(GLOBAL_CONFIG_FILE, globalConfigCache, { spaces: 2 });
    }
    globalConfigCache = migrateChatApiProviderConfig(globalConfigCache);
    globalConfigCache.agentPermissionMode = getAgentPermissionMode(globalConfigCache);
    return globalConfigCache;
}

async function writeGlobalConfig(config) {
    globalConfigCache = migrateChatApiProviderConfig({
        ...(config || {}),
        agentPermissionMode: getAgentPermissionMode(config || {}),
    });
    await fs.writeJson(GLOBAL_CONFIG_FILE, globalConfigCache, { spaces: 2 });
    return globalConfigCache;
}

function getActiveModelInfo(config = {}) {
    return {
        activeProvider: config?.provider || 'ollama',
        activeModel: config?.model || 'llama3',
    };
}

function emitRealtimeEvent(payload) {
    realtimeBus.emit('event', {
        timestamp: Date.now(),
        ...payload,
    });
}

function touchInteractiveActivity(source = 'unknown') {
    lastInteractiveActivityAt = Date.now();
    return {
        source,
        lastInteractiveActivityAt,
    };
}

/*

function createSessionSummary({ chatId, messages = [], title, pendingRequest = null, source = 'web', external = null }) {
    const userTitle = title || messages.find(msg => msg.role === 'user' && msg.content)?.content?.slice(0, 30);
    return {
        id: chatId,
        title: userTitle || '鏂板璇?,
        updatedAt: new Date(),
        messagesCount: messages.length,
        isPending: Boolean(pendingRequest),
        pendingType: pendingRequest?.type || null,
        source,
        external,
    };
}

*/

function createSessionSummary({ chatId, messages = [], title, pendingRequest = null, source = 'web', external = null }) {
    const userTitle = title || messages.find(msg => msg.role === 'user' && msg.content)?.content?.slice(0, 30);
    return {
        id: chatId,
        title: userTitle || 'New Chat',
        updatedAt: new Date(),
        messagesCount: messages.length,
        isPending: Boolean(pendingRequest),
        pendingType: pendingRequest?.type || null,
        source,
        external,
    };
}

function isStoryGlassConversationArchiveMessage(message = {}) {
    return Boolean(
        message?.requestOptions?.storyGlassConversationArchive
        || message?.storyGlassConversationData
    );
}

function getMessageIdentity(message = {}) {
    if (message?.id !== undefined && message?.id !== null) return `id:${String(message.id)}`;
    const role = String(message?.role || '');
    const content = String(message?.content || '');
    return `${role}:${content}`;
}

function getStoryGlassArchiveTime(message = {}) {
    const endedAt = message?.storyGlassConversationData?.endedAt;
    const endedAtMs = endedAt ? new Date(endedAt).getTime() : 0;
    if (Number.isFinite(endedAtMs) && endedAtMs > 0) return endedAtMs;

    const match = String(message?.id || '').match(/^story_glass_archive_(\d+)_/);
    const idTime = match ? Number(match[1]) : 0;
    return Number.isFinite(idTime) ? idTime : 0;
}

function shouldPreserveStoryGlassArchiveMessage(message = {}, clientSavedAt = 0) {
    if (!isStoryGlassConversationArchiveMessage(message)) return false;
    const saveTime = Number(clientSavedAt) || 0;
    if (!saveTime) return true;

    const archiveTime = getStoryGlassArchiveTime(message);
    return archiveTime > 0 && saveTime < archiveTime;
}

function mergePreservedStoryGlassConversationMessages(incomingMessages = [], existingMessages = [], clientSavedAt = 0) {
    const nextMessages = Array.isArray(incomingMessages) ? [...incomingMessages] : [];
    const seen = new Set(nextMessages.map(getMessageIdentity));

    for (const message of Array.isArray(existingMessages) ? existingMessages : []) {
        if (!shouldPreserveStoryGlassArchiveMessage(message, clientSavedAt)) continue;
        const identity = getMessageIdentity(message);
        if (seen.has(identity)) continue;
        nextMessages.push(message);
        seen.add(identity);
    }

    return nextMessages;
}

async function persistSessionRecord({ chatId, messages = [], title, pendingRequest = null, source = null, external = undefined, clientSavedAt = 0, broadcastReason = 'session-updated' }) {
    const sessionFilePath = path.join(SESSIONS_DIR, `${chatId}.json`);
    const existingSession = await safeReadJsonFile(sessionFilePath, {});
    const normalizedMessages = mergePreservedStoryGlassConversationMessages(
        Array.isArray(messages) ? messages : [],
        existingSession.messages,
        clientSavedAt
    );
    const nextSource = source || existingSession.source || 'web';
    const nextExternal = external !== undefined ? external : (existingSession.external || null);
    const nextSession = {
        ...existingSession,
        messages: normalizedMessages,
        pendingRequest,
        source: nextSource,
        external: nextExternal,
    };

    if (shouldPruneEmptyHistorySession(nextSession)) {
        await fs.remove(sessionFilePath);
        await removeHistoryEntry(chatId);
        emitRealtimeEvent({ type: 'history-updated', reason: `${broadcastReason}:empty-pruned` });
        return null;
    }

    await fs.writeJson(sessionFilePath, nextSession, { spaces: 2 });

    let history = await getHistory();
    const summary = createSessionSummary({
        chatId,
        messages: normalizedMessages,
        title,
        pendingRequest,
        source: nextSource,
        external: nextExternal,
    });
    const index = history.findIndex(item => String(item.id) === String(chatId));

    if (index >= 0) {
        history[index] = { ...history[index], ...summary };
    } else {
        history.unshift(summary);
    }

    await saveHistory(history);
    emitRealtimeEvent({ type: 'history-updated', reason: broadcastReason });
    emitRealtimeEvent({ type: 'session-updated', chatId, reason: broadcastReason });
    return summary;
}

async function loadQQBotSessionMap() {
    qqbotSessionMap = await safeReadJsonFile(QQBOT_SESSION_MAP_FILE, {});
    return qqbotSessionMap;
}

async function saveQQBotSessionMap() {
    await fs.writeJson(QQBOT_SESSION_MAP_FILE, qqbotSessionMap, { spaces: 2 });
}

async function loadQQBotCommandStateMap() {
    qqbotCommandStateMap = await safeReadJsonFile(QQBOT_COMMAND_STATE_FILE, {});
    return qqbotCommandStateMap;
}

async function saveQQBotCommandStateMap() {
    await fs.writeJson(QQBOT_COMMAND_STATE_FILE, qqbotCommandStateMap, { spaces: 2 });
}

function buildQQPeerKey(meta = {}) {
    return [
        meta.accountId || 'default',
        meta.chatType || 'direct',
        meta.peerId || 'unknown',
    ].join(':');
}

function getQQCommandState(meta = {}) {
    const peerKey = buildQQPeerKey(meta);
    return qqbotCommandStateMap[peerKey] || null;
}

async function setQQCommandState(meta = {}, state = null) {
    const peerKey = buildQQPeerKey(meta);
    if (!state || typeof state !== 'object') {
        delete qqbotCommandStateMap[peerKey];
    } else {
        qqbotCommandStateMap[peerKey] = state;
    }
    await saveQQBotCommandStateMap();
}

async function ensureQQSession(meta = {}, { forceNew = false } = {}) {
    const peerKey = buildQQPeerKey(meta);
    const existingChatId = qqbotSessionMap[peerKey];
    if (!forceNew && existingChatId) {
        const existingPath = path.join(SESSIONS_DIR, `${existingChatId}.json`);
        if (await fs.pathExists(existingPath)) {
            return existingChatId;
        }
    }

    const chatId = `qq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    qqbotSessionMap[peerKey] = chatId;
    await saveQQBotSessionMap();
    await persistSessionRecord({
        chatId,
        messages: [],
        title: `QQ · ${meta.senderName || meta.peerId || 'Session'}`,
        source: 'qqbot',
        external: meta,
        broadcastReason: forceNew ? 'qqbot-session-new' : 'qqbot-session-init',
    });
    return chatId;
}

function createPendingRequest(message, uploadedFiles, options, assistantMsgId) {
    return {
        type: options.useWeb ? 'deep-reading' : (options.usePpt ? 'ppt' : (options.useTruthCheck ? 'credibility-check' : 'chat')),
        message,
        assistantMsgId,
        uploadedFiles,
        createdAt: new Date().toISOString(),
        options: {
            useSearch: Boolean(options.useSearch),
            useWeb: Boolean(options.useWeb),
            useMcp: Boolean(options.useMcp),
            useSd: Boolean(options.useSd),
            useMemory: Boolean(options.useMemory),
            usePpt: Boolean(options.usePpt),
            useTruthCheck: Boolean(options.useTruthCheck),
        },
    };
}

function parseQQIntent(raw = '') {
    const trimmed = String(raw || '')
        .normalize('NFKC')
        .trim();
    if (!trimmed) {
        return { command: 'empty', mode: 'chat', message: '' };
    }
    if (/^\/new\s*$/i.test(trimmed)) {
        return { command: 'new', mode: 'chat', message: '' };
    }
    if (/^\/model\b/i.test(trimmed)) {
        return { command: 'model', mode: 'chat', message: '' };
    }
    if (/^\/(?:deep|research)\b/i.test(trimmed)) {
        return {
            command: 'run',
            mode: 'deep-reading',
            message: trimmed.replace(/^\/(?:deep|research)\b\s*/i, '').trim(),
        };
    }
    if (/^\/check\b/i.test(trimmed)) {
        return {
            command: 'run',
            mode: 'credibility-check',
            message: trimmed.replace(/^\/check\b\s*/i, '').trim(),
        };
    }
    if (/^\/ppt\b/i.test(trimmed)) {
        return {
            command: 'run',
            mode: 'ppt',
            message: trimmed.replace(/^\/ppt\b\s*/i, '').trim(),
        };
    }
    if (/^\/chat\b/i.test(trimmed)) {
        return {
            command: 'run',
            mode: 'chat',
            message: trimmed.replace(/^\/chat\b\s*/i, '').trim(),
        };
    }
    return { command: 'run', mode: 'chat', message: trimmed };
}

function extractLocalAttachmentPaths(text = '') {
    const paths = new Set();
    const bracketPattern = /\[[^\]]*:\s*([A-Za-z]:\\[^\]]+|\/[^\]]+)\]/g;
    let match;
    while ((match = bracketPattern.exec(String(text || ''))) !== null) {
        if (match[1]) {
            paths.add(match[1].trim());
        }
    }
    return [...paths];
}

async function buildQQUploadedFiles(ctx = {}) {
    const uploadedFiles = [];
    const seen = new Set();
    const mediaPaths = Array.isArray(ctx.MediaPaths)
        ? ctx.MediaPaths
        : (ctx.MediaPath ? [ctx.MediaPath] : []);
    const attachmentPaths = extractLocalAttachmentPaths(`${ctx.BodyForAgent || ''}\n${ctx.Body || ''}`);
    const paths = [...mediaPaths, ...attachmentPaths];

    for (const filePath of paths) {
        if (!filePath || seen.has(filePath)) continue;
        seen.add(filePath);

        try {
            if (!(await fs.pathExists(filePath))) continue;
            const image = isImageFile(filePath);
            uploadedFiles.push({
                name: path.basename(filePath),
                path: filePath,
                isImage: image,
                content: image ? '[Image File]' : await parseFile(filePath),
            });
        } catch (error) {
            console.warn(`[QQBridge] Failed to prepare uploaded file ${filePath}:`, error.message);
        }
    }

    return uploadedFiles;
}

function buildQQSourceMeta(ctx = {}) {
    const chatType = String(ctx.ChatType || 'direct').toLowerCase();
    const peerId = chatType === 'group'
        ? (ctx.QQGroupOpenid || ctx.To || ctx.From)
        : (ctx.SenderId || ctx.To || ctx.From);
    return {
        channel: 'qqbot',
        accountId: ctx.AccountId || 'default',
        chatType,
        peerId,
        senderId: ctx.SenderId || '',
        senderName: ctx.SenderName || ctx.SenderId || '',
        replyToId: ctx.MessageSid || '',
    };
}

function loadAssistantMessageText(message = {}) {
    if (Array.isArray(message.parts) && message.parts.length > 0) {
        return message.parts
            .filter(part => part.type === 'text')
            .map(part => String(part.content || ''))
            .join('')
            .replace(/\[expression:\s*[\w.-]+\s*\]/g, '')
            .trim();
    }
    if (message.credibilityCheckData?.summary) {
        return String(message.credibilityCheckData.summary).trim();
    }
    return String(message.content || '').trim();
}

function collectQQDeliveryFiles(message = {}) {
    const files = [];
    const seen = new Set();

    const pushFile = (file) => {
        if (!file?.filePath || seen.has(file.filePath)) return;
        seen.add(file.filePath);
        files.push(file);
    };

    for (const file of message.generatedFiles || []) {
        pushFile(file);
    }

    for (const part of message.parts || []) {
        if (part.type === 'action' && part.fileMetadata?.filePath) {
            pushFile({
                filePath: part.fileMetadata.filePath,
                name: part.fileMetadata.fileName || path.basename(part.fileMetadata.filePath),
            });
        }
    }

    return files;
}

/*

function buildQQDeliveryText(message = {}) {
    const baseText = loadAssistantMessageText(message);
    const tags = collectQQDeliveryFiles(message).map(file => (
        isImageFile(file.filePath)
            ? `<qqimg>${file.filePath}</qqimg>`
            : `<qqfile>${file.filePath}</qqfile>`
    ));

    if (baseText) {
        return [baseText, ...tags].join('\n').trim();
    }
    if (message.deepReadingData) {
        return ['深度研究已完成，详细结果已同步到网页端。', ...tags].join('\n').trim();
    }
    if (message.pptData) {
        return ['智能 PPT 已完成，详细内容已同步到网页端。', ...tags].join('\n').trim();
    }
    return tags.join('\n').trim();
}

*/

function buildQQDeliveryText(message = {}) {
    const baseText = loadAssistantMessageText(message);
    const tags = collectQQDeliveryFiles(message).map(file => (
        isImageFile(file.filePath)
            ? `<qqimg>${file.filePath}</qqimg>`
            : `<qqfile>${file.filePath}</qqfile>`
    ));

    if (baseText) {
        return [baseText, ...tags].join('\n').trim();
    }
    if (message.deepReadingData) {
        return ['Deep research is complete. Full results are synced to the web app.', ...tags].join('\n').trim();
    }
    if (message.pptData) {
        return ['The PPT task is complete. Full results are synced to the web app.', ...tags].join('\n').trim();
    }
    if (message.credibilityCheckData) {
        return ['The credibility check is complete. Full results are synced to the web app.', ...tags].join('\n').trim();
    }
    return tags.join('\n').trim();
}

function getCuteGreetingText({ plain = false } = {}) {
    if (plain) {
        return '嗨嗨，我来啦~ 今天想先聊什么呀？(๑˃▽˂๑) 不管是想认真搞点事情，还是随便唠唠，我都陪你呀～';
    }
    return '[expression:happy.png]嗨嗨，我来啦~ 今天想先聊什么呀？(๑˃▽˂๑) 不管是想认真搞点事情，还是随便唠唠，我都陪你呀～[expression:shy.png]';
}

function createCuteGreetingMessage({ id = `greeting_${Date.now()}` } = {}) {
    const content = getCuteGreetingText();
    return {
        role: 'assistant',
        id,
        content,
        parts: [{ type: 'text', content }],
        generatedFiles: [],
    };
}

function sanitizeArtifactName(name = '', fallback = 'artifact') {
    const normalized = String(name || fallback).trim();
    return normalized.replace(/[<>:"/\\|?*\x00-\x1F]+/g, '_').slice(0, 80) || fallback;
}

async function buildGeneratedImageArtifact({ observation, chatId, assistantMsgId, prompt = '' }) {
    const imageSource = extractImageSource(observation);
    if (!imageSource) return null;

    let dataUri = imageSource;
    if (!dataUri.startsWith('data:image/')) {
        dataUri = await downloadImageUrlAsDataUri(dataUri);
    }

    if (!isValidImageDataUri(dataUri)) {
        return null;
    }

    const parsed = parseImageDataUri(dataUri);
    if (!parsed?.buffer?.length) {
        return null;
    }

    const fileExt = imageExtensionForMime(parsed.mime);
    const safePromptName = sanitizeArtifactName(String(prompt || '').slice(0, 60), 'generated-image');
    const hashSuffix = crypto.createHash('sha1').update(parsed.buffer).digest('hex').slice(0, 8);
    const outputDir = path.join(REPORTS_DIR, `draw_${chatId || 'local'}_${assistantMsgId || Date.now()}`);
    const filePath = path.join(outputDir, `${safePromptName}-${hashSuffix}.${fileExt}`);

    await fs.ensureDir(outputDir);
    await fs.writeFile(filePath, parsed.buffer);
    return buildDownloadableFile(filePath);
}

function mergeGeneratedFiles(existingFiles = [], incomingFiles = []) {
    const merged = Array.isArray(existingFiles) ? [...existingFiles] : [];
    const nextFiles = Array.isArray(incomingFiles) ? incomingFiles : [incomingFiles];

    for (const file of nextFiles) {
        if (!file?.filePath) continue;
        const existingIndex = merged.findIndex(item => item.filePath === file.filePath);
        if (existingIndex >= 0) {
            merged[existingIndex] = { ...merged[existingIndex], ...file };
        } else {
            merged.push(file);
        }
    }

    return merged;
}

function canAutoIllustrateStoryGlass(config = {}) {
    const provider = String(config?.drawingProvider || '').trim().toLowerCase();
    if (provider === 'stable-diffusion') return true;
    if (provider === 'custom') {
        return Boolean(String(config?.customDrawingUrl || '').trim() && String(config?.customDrawingKey || '').trim());
    }
    return false;
}

async function generateImageWithConfiguredProvider({
    prompt = '',
    config = {},
    referenceImages = [],
    chatId = '',
    assistantMsgId = '',
    requestedWidth,
    requestedHeight,
    fallbackWidth = 512,
    fallbackHeight = 512,
    requestContext = '',
    logLabel = 'Draw',
}) {
    const dModel = String(config?.drawingModel || '').trim();
    const dProvider = String(config?.drawingProvider || '').trim().toLowerCase();
    const drawRequest = extractDrawRequestFromPrompt(prompt, config?.customDrawingModel || dModel || '');
    const normalizedPrompt = drawRequest.prompt || String(prompt || '').trim();
    const resolvedModelId = drawRequest.modelOverride || normalizeCustomDrawingModelId(config?.customDrawingModel || dModel || '');
    const resolvedDrawSize = resolveDrawDimensions({
        provider: dProvider,
        modelId: resolvedModelId || config?.customDrawingModel || dModel || '',
        requestedWidth,
        requestedHeight,
        fallbackWidth,
        fallbackHeight,
        requestContext,
    });
    const width = resolvedDrawSize.width;
    const height = resolvedDrawSize.height;

    let observation = '';
    let generatedFile = null;

    if (!normalizedPrompt) {
        observation = 'Error: Drawing prompt is empty.';
    } else if (!dProvider || dProvider === 'none') {
        observation = 'Error: Drawing provider not configured.';
    } else {
        console.log(
            `[${logLabel}] Calling Drawing Model: ${resolvedModelId || dModel || 'default'} (${dProvider}), Size: ${width}x${height}${resolvedDrawSize.upgradedToHighResDefault ? ' [auto-upgraded]' : ''}`
        );

        const hasImage = Array.isArray(referenceImages) && referenceImages.length > 0;
        const latestImage = hasImage ? referenceImages[referenceImages.length - 1] : null;

        if (dProvider === 'ollama') {
            observation = 'Error: Ollama chat models cannot reliably return image files in this drawing mode yet. Please switch to Custom Drawing API or Stable Diffusion.';
        } else if (dProvider === 'stable-diffusion') {
            try {
                let baseSdUrl = (config.sdUrl || 'http://127.0.0.1:7860').trim().replace(/\/$/, '');
                if (baseSdUrl.endsWith('/txt2img') || baseSdUrl.endsWith('/img2img')) {
                    baseSdUrl = baseSdUrl.substring(0, baseSdUrl.lastIndexOf('/'));
                }
                if (!baseSdUrl.includes('/sdapi/v1')) baseSdUrl += '/sdapi/v1';

                if (config.sdModel) {
                    try {
                        await axios.post(`${baseSdUrl}/options`, { sd_model_checkpoint: config.sdModel }, { timeout: 10000 });
                    } catch (switchErr) {
                        console.warn(`[${logLabel}] SD Model Switch Failed: ${switchErr.message}`);
                    }
                }

                const payload = {
                    prompt: normalizedPrompt,
                    steps: 20,
                    width,
                    height,
                    sampler_name: 'Euler a',
                };

                let endpoint = '/txt2img';
                if (hasImage && latestImage?.b64) {
                    endpoint = '/img2img';
                    payload.init_images = [latestImage.b64];
                    payload.denoising_strength = 0.6;
                }

                const drawResponse = await axios.post(`${baseSdUrl}${endpoint}`, payload, { timeout: 120000 });
                if (drawResponse.data.images && drawResponse.data.images[0]) {
                    const rawImg = drawResponse.data.images[0];
                    if (typeof rawImg !== 'string') {
                        observation = 'Error: Stable Diffusion API returned non-string image data.';
                    } else {
                        const base64 = rawImg.trim().replace(/^data:image\/\w+;base64,/, '').replace(/[\s\r\n]/g, '');
                        if (base64.length > 100) {
                            observation = `data:image/png;base64,${base64}`;
                            console.log(`[${logLabel}] SD Drawing Success. Base64 length: ${base64.length}, Mode: ${endpoint}`);
                        } else {
                            observation = 'Error: Stable Diffusion API returned an invalid or too short image string.';
                        }
                    }
                } else {
                    observation = 'Error: Stable Diffusion API returned no images.';
                }
            } catch (error) {
                observation = `Error calling Stable Diffusion: ${error.message}. Make sure API is enabled with --api flag.`;
            }
        } else if (dProvider === 'custom') {
            try {
                const baseUrl = normalizeCustomDrawingBaseUrl(config.customDrawingUrl || '');
                const apiKey = String(config.customDrawingKey || '').trim();
                if (!baseUrl) throw new Error('Custom Drawing URL is not configured.');
                if (!apiKey) throw new Error('Custom Drawing API Key is not configured.');

                const modelId = resolvedModelId || normalizeCustomDrawingModelId(config.customDrawingModel || 'dall-e-3');
                const headers = {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                };
                const requestBody = {
                    model: modelId,
                    prompt: normalizedPrompt,
                };
                requestBody.size = normalizeCustomDrawingSize(width, height, modelId);

                let drawResponse;
                try {
                    drawResponse = await axios.post(`${baseUrl}/images/generations`, requestBody, {
                        headers,
                        timeout: 120000,
                    });
                } catch (requestError) {
                    const errorMessage = String(requestError.response?.data?.error?.message || requestError.message || '').toLowerCase();
                    if (errorMessage.includes('size') && Object.prototype.hasOwnProperty.call(requestBody, 'size')) {
                        const fallbackBody = { ...requestBody };
                        delete fallbackBody.size;
                        drawResponse = await axios.post(`${baseUrl}/images/generations`, fallbackBody, {
                            headers,
                            timeout: 120000,
                        });
                    } else {
                        throw requestError;
                    }
                }

                const firstImage = Array.isArray(drawResponse.data?.data) ? drawResponse.data.data[0] : null;
                const rawBase64 = String(firstImage?.b64_json || '').replace(/[\s\r\n]/g, '').trim();
                const outputFormat = String(drawResponse.data?.output_format || firstImage?.output_format || '').trim().toLowerCase();
                const declaredMime = outputFormat
                    ? (outputFormat.startsWith('image/') ? outputFormat : `image/${outputFormat}`)
                    : '';
                const remoteImageUrl = String(firstImage?.url || firstImage?.file_url || '').trim();

                if (rawBase64) {
                    const base64Image = buildImageDataUri(Buffer.from(rawBase64, 'base64'), declaredMime);
                    if (base64Image && isValidImageDataUri(base64Image)) {
                        observation = base64Image;
                    } else if (remoteImageUrl) {
                        observation = await downloadImageUrlAsDataUri(remoteImageUrl);
                    } else {
                        observation = 'Error: Custom Drawing API returned invalid base64 image data.';
                    }
                } else if (remoteImageUrl) {
                    observation = await downloadImageUrlAsDataUri(remoteImageUrl);
                } else {
                    observation = `Error: Custom Drawing API returned no image URL or data. Raw keys: ${Object.keys(firstImage || {}).join(', ') || 'none'}`;
                }
            } catch (error) {
                observation = `Error calling Custom Drawing API: ${error.response?.data?.error?.message || error.message}`;
            }
        } else {
            observation = 'Error: This API drawing provider is using a chat-completions endpoint, which cannot reliably return image binaries here. Please switch to Custom Drawing API or Stable Diffusion.';
        }

        const normalizedImageObservation = coerceObservationToImageMarkdown(observation);
        if (normalizedImageObservation) {
            observation = normalizedImageObservation;
        }
        try {
            generatedFile = await buildGeneratedImageArtifact({
                observation,
                chatId,
                assistantMsgId,
                prompt: normalizedPrompt,
            });
        } catch (artifactError) {
            console.warn(`[${logLabel}] Failed to persist generated image artifact.`, artifactError?.message || artifactError);
        }
    }

    return {
        observation,
        generatedFile,
        prompt: normalizedPrompt,
        width,
        height,
        provider: dProvider,
        modelId: resolvedModelId || dModel || '',
        error: /^error[:\s]/i.test(String(observation || '').trim())
            ? String(observation || '').replace(/^error[:\s]*/i, '').trim()
            : '',
    };
}

function buildMusicPlanningPrompt(userPrompt = '', bars = 8) {
    const safeBars = Math.min(Math.max(parseInt(bars, 10) || 8, 4), 12);
    return `You are composing a short instrumental-only MIDI sketch for a local AI agent.

Ignore persona roleplay. Ignore any requirement to add emotion tags, markdown, or extra prose.
Return ONLY one valid JSON object. No code fences. No explanation.

Hard constraints:
- Pure instrumental only. No vocals, no lyrics.
- Keep it lightweight and loop-friendly.
- bars must be ${safeBars}
- tempo must be between 60 and 160
- timeSignature must be [4,4] or [3,4]
- Use at most 4 tracks
- Allowed instruments: piano, electric_piano, warm_pad, strings, bass, pluck, bell, drums
- Each note object must use:
  {"bar":1,"start":0,"duration":1,"pitches":["C4"],"velocity":0.72}
- bar is 1-indexed
- start and duration are in beats within that bar
- pitches must be note names like C4, F#3, Bb4
- drums may only use C2 (kick), D2 (snare), F#2 (closed hat), A#2 (open hat)
- Keep note density moderate so the result stays clean and editable

Return schema:
{
  "title": "short title",
  "tempo": 92,
  "key": "A minor",
  "timeSignature": [4,4],
  "bars": ${safeBars},
  "tracks": [
    {
      "name": "track name",
      "instrument": "electric_piano",
      "role": "harmony",
      "notes": [
        {"bar":1,"start":0,"duration":4,"pitches":["A3","C4","E4"],"velocity":0.6}
      ]
    }
  ]
}

User request:
${String(userPrompt || '').trim()}`;
}

async function generateMusicArtifactFromPrompt({
    prompt = '',
    bars = 8,
    provider = '',
    model = '',
    ollamaUrl = '',
    config = {},
    chatId = '',
    assistantMsgId = '',
}) {
    const safeBars = Math.min(Math.max(parseInt(bars, 10) || 8, 4), 12);
    let rawPlanText = '';
    let normalizedPlan;

    try {
        rawPlanText = await callLLM(
            provider,
            model,
            ollamaUrl,
            buildMusicPlanningPrompt(prompt, safeBars),
            config
        );
    } catch (error) {
        console.warn('[Music] Model score planning failed, using fallback generator.', error?.message || error);
    }

    normalizedPlan = normalizeMusicPlan(extractMusicPlan(rawPlanText) || {}, {
        prompt,
        bars: safeBars,
    });

    const spec = flattenMusicSpec(normalizedPlan);
    const midiBuffer = compileMusicSpecToMidiBuffer(spec);
    const summary = buildMusicSummary(spec);
    const hashSuffix = crypto.createHash('sha1').update(midiBuffer).digest('hex').slice(0, 8);
    const outputDir = path.join(REPORTS_DIR, `music_${chatId || 'local'}_${assistantMsgId || Date.now()}`);
    const filePath = path.join(
        outputDir,
        `${sanitizeArtifactName(summary.title || String(prompt || '').slice(0, 60), 'instrumental-loop')}-${hashSuffix}.mid`
    );

    await fs.ensureDir(outputDir);
    await fs.writeFile(filePath, midiBuffer);

    const downloadable = await buildDownloadableFile(filePath);
    const generatedFile = downloadable
        ? {
            ...downloadable,
            kind: 'music-composition',
            mimeType: 'audio/midi',
            musicSpec: spec,
            summary,
        }
        : null;

    const observationLines = [
        `Created instrumental loop "${summary.title}".`,
        `Tempo: ${summary.tempo} BPM | Key: ${summary.key} | Bars: ${summary.bars} | Duration: ~${summary.durationSeconds}s`,
        `Tracks: ${(spec.tracks || []).map(track => `${track.name} (${track.instrument})`).join(', ')}`,
    ];

    if (summary.fallbackUsed) {
        observationLines.push('Used the built-in low-power composition fallback because the model score was missing or incomplete.');
    } else {
        observationLines.push('Used the current language model to draft the score, then compiled it locally into MIDI.');
    }

    return {
        generatedFile,
        observation: observationLines.join('\n'),
        spec,
        summary,
    };
}

async function persistGeneratedFilesOnAssistant(chatId, assistantMsgId, newFiles = []) {
    if (!chatId || !assistantMsgId || !Array.isArray(newFiles) || newFiles.length === 0) return;

    const sessionFilePath = path.join(SESSIONS_DIR, `${chatId}.json`);
    const sessionData = await safeReadJsonFile(sessionFilePath, { messages: [] });
    const idx = (sessionData.messages || []).findIndex(msg => String(msg.id) === String(assistantMsgId));
    if (idx < 0) return;

    const message = sessionData.messages[idx];
    message.generatedFiles = mergeGeneratedFiles(message.generatedFiles || [], newFiles);
    await fs.writeJson(sessionFilePath, sessionData, { spaces: 2 });
    emitRealtimeEvent({ type: 'session-updated', chatId, reason: 'qqbot-artifact' });
}

async function replaceGeneratedFilesOnAssistant(chatId, assistantMsgId, nextFiles = []) {
    if (!chatId || !assistantMsgId) return;

    const sessionFilePath = path.join(SESSIONS_DIR, `${chatId}.json`);
    const sessionData = await safeReadJsonFile(sessionFilePath, { messages: [] });
    const idx = (sessionData.messages || []).findIndex(msg => String(msg.id) === String(assistantMsgId));
    if (idx < 0) return;

    sessionData.messages[idx].generatedFiles = Array.isArray(nextFiles)
        ? nextFiles.filter(file => file?.filePath)
        : [];
    await fs.writeJson(sessionFilePath, sessionData, { spaces: 2 });
    emitRealtimeEvent({ type: 'session-updated', chatId, reason: 'qqbot-artifact-replaced' });
}

async function ensureQQResultArtifacts({ chatId, assistantMsgId, message }) {
    const artifacts = [];

    if (message?.deepReadingData?.savedPath) {
        const reportPath = path.join(message.deepReadingData.savedPath, 'report.md');
        const reportTitle = sanitizeArtifactName(
            extractMarkdownTitle(message.deepReadingData.reportMarkdown || '', 'research-report'),
            'research-report'
        );
        const pdfPath = path.join(message.deepReadingData.savedPath, `${reportTitle}.pdf`);

        if (!(await fs.pathExists(pdfPath))) {
            try {
                const reportMarkdown = message.deepReadingData.reportMarkdown
                    || await fs.readFile(reportPath, 'utf8').catch(() => '');
                if (reportMarkdown.trim()) {
                    const reportHtml = buildMarkdownReportHtml(reportMarkdown, reportTitle);
                    const pdfBuffer = await renderHtmlToPdfBuffer(reportHtml);
                    await fs.writeFile(pdfPath, pdfBuffer);
                }
            } catch (error) {
                console.warn('[QQBridge] Failed to build deep-reading PDF, falling back to markdown.', error.message);
            }
        }

        const reportFile = await buildDownloadableFile(pdfPath) || await buildDownloadableFile(reportPath);
        if (reportFile) {
            artifacts.push(reportFile);
        }
    }

    if (message?.pptData?.steps?.length) {
        const title = sanitizeArtifactName(message.pptData.pptTitle || 'presentation', 'presentation');
        const outputDir = path.join(REPORTS_DIR, `ppt_${chatId}_${assistantMsgId}`);
        const snapshotPath = path.join(outputDir, `${title}.pptx`);
        const editablePath = path.join(outputDir, `${title}-editable.pptx`);
        await fs.ensureDir(outputDir);
        const slides = (message.pptData.steps || [])
            .filter(step => step?.content && step?.title)
            .map(step => ({
                title: step.title,
                content: step.content,
            }));

        await fs.remove(snapshotPath).catch(() => {});
        await fs.remove(editablePath).catch(() => {});

        const finalHtml = String(message.pptData.finalHtml || '').trim();
        if (finalHtml || slides.length > 0) {
            try {
                const pptBuffer = await buildSnapshotPptBuffer({
                    finalHtml,
                    slides,
                    title: message.pptData.pptTitle || 'Presentation',
                    baseUrl: getPptRenderBaseUrl(),
                });
                await fs.writeFile(snapshotPath, pptBuffer);
            } catch (error) {
                console.warn('[QQBridge] Failed to build snapshot PPT for QQ delivery.', error);
            }
        }

        const pptFile = await buildDownloadableFile(snapshotPath);
        if (pptFile) {
            artifacts.push(pptFile);
        }
    }

    if (message?.credibilityCheckData && (message.credibilityCheckData.summary || message.credibilityCheckData.claim)) {
        const reportTitle = sanitizeArtifactName(
            message.credibilityCheckData.claim
                || message.credibilityCheckData.normalizedClaim
                || 'credibility-check',
            'credibility-check'
        );
        const outputDir = path.join(REPORTS_DIR, `credibility_${chatId}_${assistantMsgId}`);
        const pdfPath = path.join(outputDir, `${reportTitle}.pdf`);

        await fs.ensureDir(outputDir);

        if (!(await fs.pathExists(pdfPath))) {
            try {
                const pdfHtml = buildCredibilityCheckPdfHtml(message.credibilityCheckData, reportTitle);
                const pdfBuffer = await renderHtmlToPdfBuffer(pdfHtml);
                await fs.writeFile(pdfPath, pdfBuffer);
            } catch (error) {
                console.warn('[QQBridge] Failed to build credibility-check PDF for QQ delivery.', error.message);
            }
        }

        const pdfFile = await buildDownloadableFile(pdfPath);
        if (pdfFile) {
            artifacts.push(pdfFile);
        }
    }

    await replaceGeneratedFilesOnAssistant(chatId, assistantMsgId, artifacts);
    return artifacts;
}

async function buildQQDeliveryPayload({ chatId, assistantMsgId, intentMode, message }) {
    const existingFiles = collectQQDeliveryFiles(message);
    if ((intentMode === 'deep-reading' || intentMode === 'ppt' || intentMode === 'credibility-check') && existingFiles.length > 0) {
        return existingFiles.map(file => (
            isImageFile(file.filePath)
                ? `<qqimg>${file.filePath}</qqimg>`
                : `<qqfile>${file.filePath}</qqfile>`
        )).join('\n');
    }

    if (intentMode === 'deep-reading' || intentMode === 'ppt' || intentMode === 'credibility-check') {
        const artifacts = await ensureQQResultArtifacts({ chatId, assistantMsgId, message });
        if (artifacts.length > 0) {
            return artifacts.map(file => `<qqfile>${file.filePath}</qqfile>`).join('\n');
        }
    }

    return buildQQDeliveryText(message);
}

function createMockSseResponse(onData) {
    const listeners = new Map();
    let buffer = '';

    const flushBuffer = () => {
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const dataStr = trimmed.slice(6).trim();
            if (dataStr === '[DONE]') {
                onData?.({ done: true });
                continue;
            }
            try {
                onData?.(JSON.parse(dataStr));
            } catch (error) {
                console.warn('[QQBridge] Failed to parse SSE data:', error.message);
            }
        }
    };

    const response = {
        writableEnded: false,
        finished: false,
        statusCode: 200,
        setHeader: () => {},
        on: (event, cb) => {
            listeners.set(event, cb);
        },
        write: (chunk) => {
            buffer += String(chunk || '');
            flushBuffer();
            return true;
        },
        end: () => {
            buffer += '\n';
            flushBuffer();
            response.writableEnded = true;
            response.finished = true;
            const close = listeners.get('close');
            if (typeof close === 'function') close();
        },
    };

    return response;
}

function createSessionPulseEmitter(chatId, intervalMs = 700) {
    let lastEmitAt = 0;
    let timer = null;

    const emitNow = (reason) => {
        lastEmitAt = Date.now();
        emitRealtimeEvent({ type: 'session-updated', chatId, reason });
    };

    return (reason = 'qqbot-progress') => {
        const now = Date.now();
        if (now - lastEmitAt >= intervalMs) {
            emitNow(reason);
            return;
        }
        if (timer) return;
        timer = setTimeout(() => {
            timer = null;
            emitNow(reason);
        }, intervalMs - (now - lastEmitAt));
    };
}

async function executeQQSessionRequest({ message, history, options, chatId, assistantMsgId, uploadedFiles, config }) {
    const pulse = createSessionPulseEmitter(chatId);
    const { activeProvider, activeModel } = getActiveModelInfo(config);
    const mockRes = createMockSseResponse((data) => {
        if (data?.done) {
            pulse('qqbot-done');
            return;
        }
        if (
            data?.text
            || data?.action
            || data?.observation
            || data?.generatedFile
            || data?.deepReading
            || data?.pptData
            || data?.credibilityCheck
            || data?.type === 'deepReading'
            || data?.type === 'ppt'
            || data?.type === 'credibilityCheck'
        ) {
            pulse('qqbot-progress');
        }
    });

    const params = {
        message,
        history,
        context: '[QQ CHANNEL]\nThis request comes from QQ. Keep the final reply concise, user-facing, and free of tool-call chatter.',
        provider: activeProvider,
        model: activeModel,
        ollamaUrl: config.ollamaUrl,
        searchEnabled: options.useSearch || false,
        chatId,
        assistantMsgId,
        uploadedFiles,
        config,
    };

    if (options.useWeb) {
        await runDeepReadingLoop(mockRes, params);
    } else if (options.usePpt) {
        await runPPTLoop(mockRes, params);
    } else if (options.useTruthCheck) {
        await runCredibilityLoop(mockRes, params);
    } else {
        await runAgentLoop(mockRes, {
            ...params,
            mcpEnabled: options.useMcp || false,
            useSd: options.useSd || false,
            useMemory: options.useMemory || false,
        });
    }

    const sessionData = await safeReadJsonFile(path.join(SESSIONS_DIR, `${chatId}.json`), { messages: [] });
    return sessionData.messages.find(msg => String(msg.id) === String(assistantMsgId)) || null;
}

const qqBridge = new QQBridgeManager({
    dataDir: DATA_DIR,
    qqbotDir: path.join(__dirname, 'qqbot'),
    getGlobalConfig: () => globalConfigCache,
    onStatusChange: (status) => {
        emitRealtimeEvent({ type: 'integration-status', integration: 'qqbot', status });
    },
    onDispatch: async ({ ctx, deliver }) => {
        const sourceMeta = buildQQSourceMeta(ctx);
        let chatId = null;

        try {
            const rawInput = ctx.RawBody || ctx.CommandBody || ctx.BodyForAgent || ctx.Body || '';
            const normalizedInput = String(rawInput || '').normalize('NFKC').trim();
            const intent = parseQQIntent(rawInput);
            let pendingCommandState = getQQCommandState(sourceMeta);

            if (pendingCommandState?.type === 'model-selection' && normalizedInput.startsWith('/') && intent.command !== 'model') {
                await setQQCommandState(sourceMeta, null);
                pendingCommandState = null;
            }

        if (intent.command === 'new') {
            await setQQCommandState(sourceMeta, null);
            const newChatId = await ensureQQSession(sourceMeta, { forceNew: true });
            const greetingMessage = createCuteGreetingMessage();
            await persistSessionRecord({
                chatId: newChatId,
                messages: [greetingMessage],
                title: `QQ - ${sourceMeta.senderName || sourceMeta.peerId || 'Session'}`,
                pendingRequest: null,
                source: 'qqbot',
                external: sourceMeta,
                broadcastReason: 'qqbot-session-new',
            });
            await deliver({ text: getCuteGreetingText({ plain: true }) }, { kind: 'block' });
            return;
            await deliver({ text: '已为你创建新的会话，继续发送消息即可。' }, { kind: 'block' });
            return;
        }

        if (intent.command === 'model') {
            const config = await readGlobalConfig();
            const { models, warnings, currentProvider, currentModelId } = await fetchSelectableChatModels(config);

            if (!models.length) {
                const warningText = warnings.length > 0 ? ` ${warnings.join('; ')}` : '';
                await deliver({ text: `当前没有可用的聊天模型。${warningText}`.trim() }, { kind: 'block' });
                return;
            }

            await setQQCommandState(sourceMeta, {
                type: 'model-selection',
                requestedAt: new Date().toISOString(),
                currentProvider,
                currentModelId,
                models: models.map((item) => ({
                    provider: normalizeChatProviderId(item.provider),
                    id: item.id,
                    label: item.label || item.id,
                })),
            });

            await deliver({
                text: formatQQModelSelectionPrompt({
                    models,
                    currentProvider,
                    currentModelId,
                    warnings,
                }),
            }, { kind: 'block' });
            return;
        }

        if (pendingCommandState?.type === 'model-selection') {
            const selection = parseQQModelSelectionInput(normalizedInput);
            const availableModels = Array.isArray(pendingCommandState.models) ? pendingCommandState.models : [];

            if (selection.action === 'cancel') {
                await setQQCommandState(sourceMeta, null);
                await deliver({ text: '已取消模型切换。' }, { kind: 'block' });
                return;
            }

            if (selection.action === 'select') {
                const selectedModel = availableModels[selection.index];
                if (!selectedModel) {
                    await deliver({
                        text: `序号无效，请回复 1 到 ${Math.max(availableModels.length, 1)} 之间的数字，或回复 n 取消。`,
                    }, { kind: 'block' });
                    return;
                }

                const nextConfig = await readGlobalConfig();
                nextConfig.provider = normalizeChatProviderId(selectedModel.provider || nextConfig.provider);
                nextConfig.model = normalizeSelectableModelId(selectedModel.provider, selectedModel.id, availableModels);
                await writeGlobalConfig(nextConfig);
                await qqBridge.syncWithConfig(nextConfig).catch(syncError => {
                    console.error('[QQBridge] Failed to sync config:', syncError.message);
                });
                emitRealtimeEvent({ type: 'config-updated' });
                await setQQCommandState(sourceMeta, null);

                await deliver({
                    text: `已切换到模型：[${getChatProviderLabel(selectedModel.provider)}] ${selectedModel.label || selectedModel.id}`,
                }, { kind: 'block' });
                return;
            }

            await deliver({
                text: `请回复模型序号进行切换，或回复 n 取消。可选范围：1-${Math.max(availableModels.length, 1)}。`,
            }, { kind: 'block' });
            return;
        }

        if (!intent.message) {
            await deliver({ text: '请在命令后面补充内容，例如 `/ppt 产品发布会` 或直接发送你的问题。' }, { kind: 'block' });
            return;
        }

        chatId = await ensureQQSession(sourceMeta);
        const sessionData = await safeReadJsonFile(path.join(SESSIONS_DIR, `${chatId}.json`), { messages: [], pendingRequest: null });
        const uploadedFiles = await buildQQUploadedFiles(ctx);
        const modeOptions = {
            useSearch: true,
            useWeb: intent.mode === 'deep-reading',
            usePpt: intent.mode === 'ppt',
            useTruthCheck: intent.mode === 'credibility-check',
            useMcp: true,
            useSd: false,
            useMemory: false,
        };
        const userMessage = {
            role: 'user',
            content: intent.message,
            files: uploadedFiles.map(file => file.name),
            attachedFiles: uploadedFiles,
            source: 'qqbot',
            external: sourceMeta,
            id: `${Date.now()}_user`,
            timestamp: Date.now(),
        };
        const assistantMsgId = Date.now();
        const assistantMessage = {
            role: 'assistant',
            parts: [],
            generatedFiles: [],
            id: assistantMsgId,
        };
        const historyForRequest = [...(sessionData.messages || []), userMessage];
        const sessionTitle = `QQ - ${sourceMeta.senderName || sourceMeta.peerId}`;
        const pendingRequest = createPendingRequest(intent.message, uploadedFiles, modeOptions, assistantMsgId);

        await persistSessionRecord({
            chatId,
            messages: [...historyForRequest, assistantMessage],
            title: `QQ · ${sourceMeta.senderName || sourceMeta.peerId}`,
            pendingRequest,
            source: 'qqbot',
            external: sourceMeta,
            broadcastReason: 'qqbot-received',
        });

        const config = await readGlobalConfig();
        const finalAssistantMessage = await executeQQSessionRequest({
            message: intent.message,
            history: historyForRequest,
            options: modeOptions,
            chatId,
            assistantMsgId,
            uploadedFiles,
            config,
        });
        const finalizedSession = await safeReadJsonFile(path.join(SESSIONS_DIR, `${chatId}.json`), { messages: [] });
        await persistSessionRecord({
            chatId,
            messages: finalizedSession.messages || [],
            title: sessionTitle,
            pendingRequest: null,
            source: 'qqbot',
            external: sourceMeta,
            broadcastReason: 'qqbot-complete',
        });
        const deliveryText = await buildQQDeliveryPayload({
            chatId,
            assistantMsgId,
            intentMode: intent.mode,
            message: finalAssistantMessage || {},
        });

        await deliver(
            { text: deliveryText || '处理完成，详细结果已同步到网页端。' },
            { kind: 'block' }
        );
        emitRealtimeEvent({ type: 'session-updated', chatId, reason: 'qqbot-finished' });
        } catch (error) {
            console.error('[QQBridge] Dispatch error:', error);
            if (chatId) {
                try {
                    const failedSession = await safeReadJsonFile(path.join(SESSIONS_DIR, `${chatId}.json`), { messages: [], pendingRequest: null });
                    await persistSessionRecord({
                        chatId,
                        messages: failedSession.messages || [],
                        title: `QQ 路 ${sourceMeta.senderName || sourceMeta.peerId}`,
                        pendingRequest: null,
                        source: 'qqbot',
                        external: sourceMeta,
                        broadcastReason: 'qqbot-error',
                    });
                } catch (persistError) {
                    console.warn('[QQBridge] Failed to clear pending state after dispatch error:', persistError.message);
                }
            }
            await deliver(
                { text: `抱歉，这条消息处理时出了点问题：${error.message || 'unknown error'}` },
                { kind: 'block' }
            );
        }
    },
});

readGlobalConfig().catch(() => ({}));
loadQQBotSessionMap().catch(() => ({}));
loadQQBotCommandStateMap().catch(() => ({}));

// --- Routes ---

app.get('/api/realtime/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    activeRealtimeClientCount += 1;
    touchInteractiveActivity('realtime-connect');

    const send = (payload) => {
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
        }
    };

    send({ type: 'ready' });
    const heartbeat = setInterval(() => {
        if (!res.writableEnded) {
            res.write(': ping\n\n');
        }
    }, 25000);

    const listener = (payload) => send(payload);
    realtimeBus.on('event', listener);

    req.on('close', () => {
        clearInterval(heartbeat);
        realtimeBus.off('event', listener);
        activeRealtimeClientCount = Math.max(0, activeRealtimeClientCount - 1);
        res.end();
    });
});

app.get('/api/hosted-tasks', async (req, res) => {
    try {
        const tasks = await taskScheduler.listTasks();
        res.json(tasks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/hosted-tasks', async (req, res) => {
    try {
        const task = await taskScheduler.addTask(req.body);
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/hosted-tasks/:id/run', async (req, res) => {
    try {
        await taskScheduler.triggerTaskNow(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/hosted-tasks/:id/history', async (req, res) => {
    try {
        await taskScheduler.clearTaskHistory(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/hosted-tasks/:id/history/:index', async (req, res) => {
    try {
        await taskScheduler.deleteResult(req.params.id, parseInt(req.params.index));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/hosted-tasks/:id', async (req, res) => {
    try {
        await taskScheduler.deleteTask(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/files', async (req, res) => {
    try {
        const subDir = req.query.path || '';
        const targetDir = path.join(FILES_DIR, subDir);

        // Security check: ensure targetDir is within FILES_DIR
        const relative = path.relative(FILES_DIR, targetDir);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        if (!(await fs.exists(targetDir))) {
            return res.status(404).json({ error: 'Directory not found' });
        }

        const files = await fs.readdir(targetDir, { withFileTypes: true });
        const list = await Promise.all(files.map(async f => {
            const isDir = f.isDirectory();
            const stats = await fs.stat(path.join(targetDir, f.name));
            return {
                name: f.name,
                path: path.join(subDir, f.name).replace(/\\/g, '/'),
                isDirectory: isDir,
                size: isDir ? '--' : (stats.size / 1024).toFixed(2) + ' KB',
                time: stats.mtime.toLocaleString()
            };
        }));
        res.json({
            currentPath: subDir.replace(/\\/g, '/'),
            files: list
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/files/preview/:name', async (req, res) => {
    try {
        const subPath = req.params.name || req.query.path;
        const filePath = path.join(FILES_DIR, subPath);

        // Security check
        const relative = path.relative(FILES_DIR, filePath);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const isImage = isImageFile(filePath);
        if (isImage) {
            const data = await fs.readFile(filePath);
            const ext = path.extname(filePath).toLowerCase();
            const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
            res.json({ isImage: true, content: `data:${mime};base64,${data.toString('base64')}` });
        } else {
            const content = await fs.readFile(filePath, 'utf8');
            res.json({ isImage: false, content });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Memory Routes ---

app.get('/api/memories', async (req, res) => {
    try {
        const list = await memoryService.listMemories();
        const system = await memoryService.getSystemStatus();
        res.json({
            memories: list,
            system,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/memories', async (req, res) => {
    try {
        const { name, content, type, category, tags, importance, auto } = req.body;
        if (!name || !content) {
            return res.status(400).json({ error: 'Name and content are required' });
        }
        const memory = await memoryService.upsertMemory({
            name,
            content,
            type,
            category,
            tags,
            importance,
            auto,
            source: auto ? 'manual-auto' : 'manual',
            merge: false,
        });
        res.json({ success: true, fileName: memory.fileName, memory });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/memories/:fileName', async (req, res) => {
    try {
        const memory = await memoryService.getMemory(req.params.fileName);
        if (!memory) {
            res.status(404).json({ error: 'Memory not found' });
        } else {
            res.json({
                content: memory.content,
                memory,
            });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/memories/:name', async (req, res) => {
    const name = req.params.name;
    try {
        const deleted = await memoryService.deleteMemory(name, moveToTrash);
        if (deleted) {
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Memory not found' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Skill Routes ---

app.get('/api/skills', async (req, res) => {
    try {
        const list = await skillService.listSkills();
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/skills/search', async (req, res) => {
    try {
        const query = req.query.q || '';
        const includeDisabled = String(req.query.includeDisabled || '').toLowerCase() === 'true';
        const skills = await skillService.searchSkills(query, 12, { enabledOnly: !includeDisabled });
        res.json(skills);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/skills/openhub/search', async (req, res) => {
    try {
        const query = req.query.q || '';
        const skills = await skillService.searchOpenHub(query, 12);
        res.json(skills);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/skills/openhub/inspect/:slug', async (req, res) => {
    try {
        const skill = await skillService.inspectOpenHubSkill(req.params.slug, { includeContent: true });
        res.json(skill);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/skills/:id', async (req, res) => {
    try {
        const skill = await skillService.getSkill(req.params.id);
        if (!skill) return res.status(404).json({ error: 'Skill not found' });
        res.json(skill);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/skills', async (req, res) => {
    try {
        const { name, content, description, tags } = req.body;
        if (!name || !content) {
            return res.status(400).json({ error: 'Name and content are required' });
        }
        const skill = await skillService.upsertSkill({
            name,
            content,
            description,
            tags,
            sourceType: 'manual',
            source: 'manual',
        });
        res.json({ success: true, skill });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/skills/install', async (req, res) => {
    try {
        const { sourceType, source, name, content } = req.body;
        let skill;
        const normalizedSourceType = String(sourceType || '').toLowerCase();
        if (normalizedSourceType === 'git') {
            if (!source) return res.status(400).json({ error: 'Git source is required' });
            skill = await skillService.installFromGit(source);
        } else if (normalizedSourceType === 'local') {
            if (!source) return res.status(400).json({ error: 'Local path is required' });
            skill = await skillService.installFromLocal(source);
        } else if (normalizedSourceType === 'manual') {
            if (!name || !content) return res.status(400).json({ error: 'Name and content are required' });
            skill = await skillService.upsertSkill({ name, content, sourceType: 'manual', source: 'manual' });
        } else if (normalizedSourceType === 'openhub' || normalizedSourceType === 'clawhub') {
            if (!source) return res.status(400).json({ error: 'OpenHub skill slug is required' });
            skill = await skillService.installFromOpenHub(source);
        } else {
            return res.status(400).json({ error: 'Unsupported sourceType. Use openhub, git, local, or manual.' });
        }
        res.json({ success: true, skill });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/skills/:id', async (req, res) => {
    try {
        const deleted = await skillService.deleteSkill(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'Skill not found' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/files/save', async (req, res) => {
    try {
        const { name, content, path: subPath } = req.body;
        const targetPath = subPath ? path.join(FILES_DIR, subPath) : path.join(FILES_DIR, name);

        // Security check
        const relative = path.relative(FILES_DIR, targetPath);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        await fs.writeFile(targetPath, content, 'utf8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/skills/:id', async (req, res) => {
    try {
        const { enabled } = req.body;
        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ error: 'enabled must be a boolean' });
        }
        const skill = await skillService.setSkillEnabled(req.params.id, enabled);
        if (!skill) return res.status(404).json({ error: 'Skill not found' });
        res.json({ success: true, skill });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/files/download', async (req, res) => {
    try {
        const requestedPath = String(req.query.path || '').trim();
        if (!requestedPath) {
            return res.status(400).json({ error: 'Missing path' });
        }

        const filePath = path.resolve(requestedPath);
        if (!isAllowedGeneratedFilePath(filePath)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        if (!(await fs.exists(filePath))) {
            return res.status(404).json({ error: 'File not found' });
        }

        const stats = await fs.stat(filePath);
        if (!stats.isFile()) {
            return res.status(400).json({ error: 'Only files can be downloaded' });
        }

        res.download(filePath);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/files/:name', async (req, res) => {
    try {
        const subPath = req.params.name || req.query.path;
        const targetPath = path.join(FILES_DIR, subPath);

        // Security check
        const relative = path.relative(FILES_DIR, targetPath);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        await moveToTrash(targetPath);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Trash Routes ---

app.get('/api/trash', async (req, res) => {
    try {
        const items = await fs.readdir(TRASH_DIR);
        const list = [];
        for (const item of items) {
            if (item.endsWith('.json')) {
                const meta = await fs.readJson(path.join(TRASH_DIR, item));
                const trashFileName = item.replace('.json', '');
                const trashFullPath = path.join(TRASH_DIR, trashFileName);
                if (await fs.exists(trashFullPath)) {
                    const stats = await fs.stat(trashFullPath);
                    const isDir = stats.isDirectory();
                    list.push({
                        trashId: trashFileName,
                        name: meta.fileName,
                        originalPath: meta.originalPath,
                        deletedAt: meta.deletedAt,
                        size: isDir ? '--' : (stats.size / 1024).toFixed(2) + ' KB',
                        isDirectory: isDir
                    });
                }
            }
        }
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/trash/restore', async (req, res) => {
    try {
        const { trashId } = req.body;
        const metaPath = path.join(TRASH_DIR, `${trashId}.json`);
        const filePath = path.join(TRASH_DIR, trashId);

        if (!(await fs.exists(metaPath)) || !(await fs.exists(filePath))) {
            return res.status(404).json({ error: 'File removed from trash.' });
        }

        const meta = await fs.readJson(metaPath);
        await fs.ensureDir(path.dirname(meta.originalPath));
        await fs.move(filePath, meta.originalPath, { overwrite: true });
        await fs.remove(metaPath);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/trash/:trashId', async (req, res) => {
    try {
        const { trashId } = req.params;
        await fs.remove(path.join(TRASH_DIR, trashId));
        await fs.remove(path.join(TRASH_DIR, `${trashId}.json`));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/files/download/:name', (req, res) => {
    const subPath = req.params.name || req.query.path;
    const filePath = path.join(FILES_DIR, subPath);

    // Security check
    const relative = path.relative(FILES_DIR, filePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    res.download(filePath);
});

app.post('/api/files/rollback', async (req, res) => {
    try {
        const { filePath, before, content, isDeletion, operation, afterHash, expectedCurrentHash, encoding, textFormat } = req.body;

        if (!filePath) {
            return res.status(400).json({ error: 'Missing filePath.' });
        }

        const targetPath = path.resolve(filePath);
        if (!isAllowedGeneratedFilePath(targetPath)) {
            return res.status(403).json({ error: 'Rollback path is outside allowed file roots.' });
        }
        if (isSensitivePath(targetPath)) {
            return res.status(403).json({ error: 'Rollback refused for sensitive paths.' });
        }

        const rollbackContent = before !== undefined ? before : content;
        const normalizedOperation = String(operation || '').toLowerCase();
        const shouldDeleteCreatedFile = normalizedOperation === 'create' || (isDeletion === true && rollbackContent === null);
        const expectedHash = normalizeExpectedFileHash(expectedCurrentHash || afterHash);

        await withFileLock(targetPath, async () => {
            if (await fs.exists(targetPath)) {
                const stats = await fs.stat(targetPath);
                if (!stats.isFile()) {
                    const err = new Error('Rollback target is not a regular file.');
                    err.statusCode = 400;
                    throw err;
                }
                if (expectedHash) {
                    const currentHash = hashBuffer(await fs.readFile(targetPath));
                    if (currentHash !== expectedHash) {
                        const err = new Error(`File changed after Saki's operation. Expected current SHA256 ${expectedHash}, got ${currentHash}. Re-run the task or review manually before rollback.`);
                        err.statusCode = 409;
                        throw err;
                    }
                }
            }

            if (shouldDeleteCreatedFile) {
                await fs.remove(targetPath);
                return;
            }

            if (rollbackContent === undefined || rollbackContent === null) {
                const err = new Error('Missing rollback content.');
                err.statusCode = 400;
                throw err;
            }

            const rollbackFormat = deserializeTextFormat(textFormat || encoding);
            await atomicWriteTextFile(targetPath, rollbackContent, rollbackFormat);
        });

        res.json({ success: true });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
});

app.get('/api/history', async (req, res) => {
    res.set('Cache-Control', 'max-age=5');
    res.json(await getPrunedHistory());
});

/*
app.post('/api/history', async (req, res) => {
    const { chatId, messages, title, pendingRequest = null } = req.body;
    
    // Save full message list to individual session file
    const sessionFilePath = path.join(SESSIONS_DIR, `${chatId}.json`);
    await fs.writeJson(sessionFilePath, { messages, pendingRequest }, { spaces: 2 });

    // Update index file
    let history = await getHistory();
    const index = history.findIndex(h => h.id === chatId);
    const sessionSummary = { 
        id: chatId, 
        title: title || messages[0]?.content?.slice(0, 30) || '新对话', 
        updatedAt: new Date(),
        messagesCount: messages.length,
        isPending: Boolean(pendingRequest),
        pendingType: pendingRequest?.type || null
    };
    
    if (index >= 0) {
        history[index] = { ...history[index], ...sessionSummary };
    } else {
        history.unshift(sessionSummary);
    }
    await saveHistory(history);
    res.json({ success: true });
});

*/

app.post('/api/history', async (req, res) => {
    const { chatId, messages, title, pendingRequest = null, source, external, clientSavedAt = 0 } = req.body;

    await persistSessionRecord({
        chatId,
        messages,
        title,
        pendingRequest,
        source,
        external,
        clientSavedAt,
        broadcastReason: 'history-save',
    });
    res.json({ success: true });
});

app.get('/api/history/:id', async (req, res) => {
    const sessionFilePath = path.join(SESSIONS_DIR, `${req.params.id}.json`);
    if (await fs.exists(sessionFilePath)) {
        const sessionData = await safeReadJsonFile(sessionFilePath, { messages: [] });
        res.json(sessionData);
    } else {
        res.json({ messages: [] });
    }
});

app.delete('/api/history/:id', async (req, res) => {
    const sessionFilePath = path.join(SESSIONS_DIR, `${req.params.id}.json`);
    if (await fs.exists(sessionFilePath)) {
        await fs.remove(sessionFilePath);
    }

    let history = await getHistory();
    history = history.filter(h => h.id !== req.params.id && h.id != req.params.id);
    await saveHistory(history);
    emitRealtimeEvent({ type: 'history-updated', reason: 'history-delete' });
    res.json({ success: true });
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).send('No file uploaded.');
    
    // Fix encoding: Multer originalname is often Latin1, converted to UTF-8
    const originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const targetPath = path.join(UPLOADS_DIR, originalname);
    
    try {
        await fs.move(file.path, targetPath, { overwrite: true });
        
        let content = "";
        const isImage = isImageFile(targetPath);
        
        if (isImage) {
            content = "[Image File]";
        } else {
            content = await parseFile(targetPath, file.mimetype);
        }
        
        console.log(`File uploaded: ${originalname}, isImage: ${isImage}, parsed content length: ${content ? content.length : 0}`);
        
        res.json({ 
            filename: originalname, 
            path: targetPath,
            content: content || "(Empty content)",
            isImage: isImage
        });
    } catch (err) {
        console.error('Upload processing failed:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/mcp/config', async (req, res) => {
    const config = req.body;
    await fs.writeJson(MCP_CONFIG_FILE, config, { spaces: 2 });
    res.send('Config saved');
});

app.get('/api/config', async (req, res) => {
    try {
        res.set('Cache-Control', 'no-cache');
        const config = await readGlobalConfig();
        res.json(config);
    } catch (e) {
        res.json({});
    }
});

app.post('/api/config', async (req, res) => {
    const config = req.body;
    await writeGlobalConfig(config);
    await qqBridge.syncWithConfig(config).catch(error => {
        console.error('[QQBridge] Failed to sync config:', error.message);
    });
    emitRealtimeEvent({ type: 'config-updated' });
    res.json({ success: true });
});

app.post('/api/cache/qqbot/clear', async (req, res) => {
    try {
        const result = await clearQQBotCacheArtifacts();
        console.log('[Cache] Cleared QQ bot cache artifacts:', result.summary);
        res.json({
            success: true,
            ...result,
        });
    } catch (error) {
        console.error('[Cache] Failed to clear QQ bot cache artifacts:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to clear cache.',
        });
    }
});

app.get('/api/integrations/chat/qqbot/status', async (req, res) => {
    try {
        const config = await readGlobalConfig();
        const status = await qqBridge.testConnection(config);
        res.json({
            ...status,
            error: status.error || null,
            ...getActiveModelInfo(config),
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            error: error.message,
            ...getActiveModelInfo(globalConfigCache),
            ...qqBridge.getStatus(globalConfigCache),
        });
    }
});

app.get('/api/mcp/config', async (req, res) => {
    if (await fs.exists(MCP_CONFIG_FILE)) {
        return res.json(await fs.readJson(MCP_CONFIG_FILE));
    }
    res.json({});
});

app.get('/api/mcp/status', (req, res) => {
    res.json(mcpManager.getStatus());
});

// --- Stable Diffusion Status & Models ---
app.get('/api/sd/status', async (req, res) => {
    try {
        const sdUrl = (req.query.url || 'http://127.0.0.1:7860').replace(/\/$/, '');
        const response = await axios.get(`${sdUrl}/sdapi/v1/sd-models`, { timeout: 3000 });
        res.json({
            connected: true,
            models: response.data.map(m => m.title),
            error: null
        });
    } catch (e) {
        res.json({
            connected: false,
            models: [],
            error: e.message
        });
    }
});

app.post('/api/drawing/status', async (req, res) => {
    const {
        provider = '',
        model = '',
        ollamaUrl = '',
        copilotToken = '',
        customDrawingUrl = '',
        customDrawingKey = '',
        customDrawingModel = ''
    } = req.body || {};

    try {
        if (!provider || provider === 'none') {
            return res.json({
                connected: false,
                provider: provider || 'none',
                model: model || '',
                error: '绘图功能未启用',
            });
        }

        if (provider === 'stable-diffusion') {
            const sdUrl = String(req.body?.sdUrl || 'http://127.0.0.1:7860').replace(/\/$/, '');
            const response = await axios.get(`${sdUrl}/sdapi/v1/sd-models`, { timeout: 3000 });
            return res.json({
                connected: true,
                provider,
                model,
                models: response.data.map(m => m.title),
                endpoint: sdUrl,
                error: null,
            });
        }

        if (provider === 'ollama') {
            let baseUrl = String(ollamaUrl || 'http://localhost:11434').trim();
            if (!baseUrl.startsWith('http')) baseUrl = `http://${baseUrl}`;
            baseUrl = baseUrl.replace(/\/$/, '');
            const response = await axios.get(`${baseUrl}/api/tags`, { timeout: 5000 });
            return res.json({
                connected: true,
                provider,
                model,
                endpoint: baseUrl,
                modelCount: Array.isArray(response.data?.models) ? response.data.models.length : 0,
                error: null,
            });
        }

        if (provider === 'copilot' || provider === 'github') {
            const models = await fetchCopilotModels(copilotToken || '');
            return res.json({
                connected: true,
                provider: 'copilot',
                model,
                modelCount: Array.isArray(models) ? models.length : 0,
                error: null,
            });
        }

        if (provider === 'custom') {
            const apiKey = String(customDrawingKey || '').trim();
            const rawBaseUrl = String(customDrawingUrl || '').trim();
            const normalizedModelId = normalizeCustomDrawingModelId(customDrawingModel || model);
            if (!rawBaseUrl || !apiKey) {
                return res.json({
                    connected: false,
                    provider,
                    model: normalizedModelId,
                    endpoint: rawBaseUrl || '',
                    error: '请先填写自定义绘图 API 的 Base URL 和 API Key',
                });
            }

            const normalizedBaseUrl = normalizeCustomDrawingBaseUrl(rawBaseUrl);
            const modelsUrl = `${normalizedBaseUrl}/models`;

            const response = await axios.get(modelsUrl, {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: 8000,
            });

            const data = Array.isArray(response.data?.data) ? response.data.data : [];
            return res.json({
                connected: true,
                provider,
                model: normalizedModelId,
                endpoint: normalizedBaseUrl,
                modelCount: data.length,
                error: null,
            });
        }

        return res.json({
            connected: Boolean(model),
            provider,
            model,
            error: Boolean(model) ? null : '未配置绘图模型',
        });
    } catch (e) {
        return res.json({
            connected: false,
            provider,
            model: normalizeCustomDrawingModelId(customDrawingModel || model),
            endpoint: customDrawingUrl || '',
            error: e.response?.data?.error?.message || e.message,
        });
    }
});

// --- GPT-SoVITS Models & Status ---
app.get('/api/sovits/status', async (req, res) => {
    try {
        const sovitsUrl = (req.query.url || 'http://127.0.0.1:9880').replace(/\/$/, '');
        // We can just check the tts endpoint or a simple GET if available
        // According to api_v2.py, there's no dedicated health check, but we can try reaching the port
        await axios.get(`${sovitsUrl}/control?command=none`, { timeout: 1000 }).catch(e => {
            // control?command=none might 400 or 404 but if we get a response, it's alive
            if (e.response) return e.response;
            throw e;
        });
        res.json({ connected: true });
    } catch (e) {
        res.json({ connected: false });
    }
});

app.get('/api/sovits/models', async (req, res) => {
    try {
        // Correct path: c:\Users\EthanChan\Desktop\agent\GPT-SoVITS-v2pro-20250604
        const sovitsRoot = path.join(__dirname, '..', 'GPT-SoVITS-v2pro-20250604');
        
        const scanDir = async (dirName, ext) => {
            const dirPath = path.join(sovitsRoot, dirName);
            if (!await fs.exists(dirPath)) return [];
            const files = await fs.readdir(dirPath);
            return files
                .filter(f => f.endsWith(ext))
                .map(f => `${dirName}/${f}`.replace(/\\/g, '/'));
        };

        const gptModels = await scanDir('GPT_weights', '.ckpt');
        const sovitsModels = await scanDir('SoVITS_weights', '.pth');

        res.json({
            gpt: gptModels,
            sovits: sovitsModels
        });
    } catch (e) {
        console.error('Failed to scan SoVITS models:', e);
        res.status(500).json({ error: e.message });
    }
});

// --- GPT-SoVITS Proxy to solve CORS ---
app.post('/api/sovits/proxy/tts', async (req, res) => {
    try {
        const { ttsUrl, sovitsUrl, sovits_url, ...payload } = req.body;
        const targetUrl = (ttsUrl || sovitsUrl || sovits_url || 'http://127.0.0.1:9880').replace(/\/$/, '') + '/tts';
        
        // Ensure required fields for SoVITS API v2 are present
        if (!payload.ref_audio_path) {
            return res.status(400).json({ error: 'Missing ref_audio_path. Please upload a reference audio in Settings.' });
        }

        const response = await axios.post(targetUrl, payload, {
            responseType: 'arraybuffer',
            timeout: 60000
        });

        res.set('Content-Type', 'audio/wav');
        res.send(response.data);
    } catch (e) {
        if (e.response && e.response.data) {
            try {
                const errorStr = Buffer.from(e.response.data).toString();
                try {
                    const errorJson = JSON.parse(errorStr);
                    console.error('SoVITS API Error Details:', errorJson);
                    return res.status(e.response.status || 400).json({ 
                        error: errorJson.message || errorJson.Exception || 'SoVITS API Error',
                        details: errorJson 
                    });
                } catch (parseErr) {
                    // Not JSON, maybe plain text error
                    console.error('SoVITS API Raw Error:', errorStr);
                    return res.status(e.response.status || 400).json({ 
                        error: errorStr || 'SoVITS API returned an error' 
                    });
                }
            } catch (inner) {
                console.error('SoVITS Proxy Error processing error data:', e.message);
            }
        }
        console.error('SoVITS Proxy Error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/sovits/proxy/set_weights', async (req, res) => {
    try {
        const { url, type, weights_path } = req.query;
        const endpoint = type === 'gpt' ? '/set_gpt_weights' : '/set_sovits_weights';
        const targetUrl = `${url.replace(/\/$/, '')}${endpoint}?weights_path=${encodeURIComponent(weights_path)}`;
        
        const response = await axios.get(targetUrl);
        res.json(response.data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/mcp/init', async (req, res) => {
    try {
        const { mcpServers } = req.body;
        if (!mcpServers) {
            return res.status(400).json({ error: 'mcpServers config required' });
        }
        await mcpManager.initializeServers(mcpServers);
        res.json({ status: 'initializing', details: mcpManager.getStatus() });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/models', async (req, res) => {
    let { ollamaUrl } = req.query;
    try {
        res.set('Cache-Control', 'max-age=60');
        if (!ollamaUrl || ollamaUrl === 'undefined' || ollamaUrl === 'null') {
            ollamaUrl = 'http://localhost:11434';
        }
        
        let baseUrl = ollamaUrl.trim();
        if (!baseUrl.startsWith('http')) {
            baseUrl = `http://${baseUrl}`;
        }
        baseUrl = baseUrl.replace(/\/$/, '');
        
        const endpoint = `${baseUrl}/api/tags`;
        console.log(`[API] Fetching models from: ${endpoint}`);
        
        const response = await axios.get(endpoint, { timeout: 8000 });
        const models = response.data.models.map(m => m.name);
        res.json(models);
    } catch (error) {
        console.error(`[API] Error fetching models from ${ollamaUrl}:`, error.message);
        // If it's a connection error to a custom IP, don't just fallback silently, let the user know via empty list or error
        res.json([]); 
    }
});

app.get('/api/custom/models', async (req, res) => {
    const rawBaseUrl = String(req.query.baseUrl || '').trim();
    const apiKey = String(req.query.apiKey || '').trim();

    if (!rawBaseUrl) {
        return res.json([]);
    }

    try {
        res.set('Cache-Control', 'max-age=60');

        const baseUrl = normalizeCustomApiBaseUrl(rawBaseUrl);
        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) {
            headers.Authorization = `Bearer ${apiKey}`;
        }

        const endpoint = `${baseUrl}/models`;
        console.log(`[API] Fetching custom models from: ${endpoint}`);

        const response = await axios.get(endpoint, {
            headers,
            timeout: 12000,
        });

        res.json(extractCustomApiModels(response.data));
    } catch (error) {
        const details = error.response?.data?.error?.message || error.message;
        console.error(`[API] Error fetching custom models from ${rawBaseUrl}:`, details);
        res.json([]);
    }
});

app.get('/api/provider/models', async (req, res) => {
    const provider = normalizeChatProviderId(req.query.provider || 'custom');
    const apiKey = String(req.query.apiKey || '').trim();
    const rawBaseUrl = String(req.query.baseUrl || '').trim();

    if (!getChatApiProviderMeta(provider)) {
        return res.json([]);
    }

    if (provider === 'custom' && !rawBaseUrl) {
        return res.json([]);
    }

    try {
        res.set('Cache-Control', 'max-age=60');
        const models = await fetchChatApiProviderModels({
            provider,
            baseUrl: rawBaseUrl,
            apiKey,
        });
        res.json(models);
    } catch (error) {
        const details = error.response?.data?.error?.message || error.response?.data?.message || error.message;
        console.error(`[API] Error fetching ${provider} models:`, details);
        res.json([]);
    }
});

app.get('/api/lmstudio/models', async (req, res) => {
    let { lmstudioUrl } = req.query;
    try {
        res.set('Cache-Control', 'max-age=60');
        if (!lmstudioUrl || lmstudioUrl === 'undefined' || lmstudioUrl === 'null') {
            lmstudioUrl = 'http://localhost:1234';
        }
        
        let baseUrl = lmstudioUrl.trim();
        if (!baseUrl.startsWith('http')) {
            baseUrl = `http://${baseUrl}`;
        }
        baseUrl = baseUrl.replace(/\/$/, '');
        
        const endpoint = `${baseUrl}/api/v0/models`;
        console.log(`[API] Fetching models from LMStudio: ${endpoint}`);
        
        const response = await axios.get(endpoint, { timeout: 8000 });
        const models = (response.data.data || response.data.models || response.data || []).map(m => {
            if (typeof m === 'string') {
                return { id: m, name: m, label: m };
            }
            return {
                id: m.id || m.name,
                name: m.id || m.name,
                label: m.label || m.name || m.id
            };
        });
        res.json(models);
    } catch (error) {
        console.error(`[API] Error fetching models from LMStudio ${lmstudioUrl}:`, error.message);
        res.json([]);
    }
});

// Terminal execution
app.post('/api/terminal', (req, res) => {
    const { command } = req.body;
    const isWin = process.platform === 'win32';
    const shell = isWin ? 'powershell.exe' : undefined;
    const cmd = isWin ? `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${command}` : command;
    
    exec(cmd, { shell, encoding: 'utf8' }, (error, stdout, stderr) => {
        res.json({ stdout, stderr, error: error ? error.message : null });
    });
});

// --- GitHub Device Flow ---
// 注意：请在这里替换为您在 GitHub Developer Settings 中创建的 OAuth App 的真实 Client ID
// 并且请务必在 App 设置中勾选 "Enable Device Flow"
const GITHUB_CLIENT_ID = GITHUB_COPILOT_CLIENT_ID; 

app.post('/api/github/login/device', async (req, res) => {
    try {
        console.log(`[GitHub Copilot] Requesting device code for Client ID: ${GITHUB_CLIENT_ID}`);
        const response = await axios.post('https://github.com/login/device/code', {
            client_id: GITHUB_CLIENT_ID
        }, {
            headers: { 
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
        
        if (response.data.error === 'not_found' || (response.status === 404)) {
            throw new Error('GitHub 返回 404，请确认您的 Client ID 是否正确且已在 GitHub 设置中开启 "Device Flow" 支持。');
        }
        
        res.json(response.data);
    } catch (error) {
        const errorData = error.response?.data || error.message;
        console.error('GitHub Copilot Device Code Error:', errorData);
        res.status(500).json({ 
            error: 'Failed to get device code', 
            details: errorData,
            hint: '请检查 backend/server.js 中的 GITHUB_CLIENT_ID 是否有效，并确保该 OAuth App 已开启 Device Flow。'
        });
    }
});

app.post('/api/github/login/poll', async (req, res) => {
    const { device_code } = req.body;
    try {
        const response = await axios.post('https://github.com/login/oauth/access_token', {
            client_id: GITHUB_CLIENT_ID,
            device_code: device_code,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
        }, {
            headers: { 
                'Accept': 'application/json',
                'Content-Type': 'application/json' 
            },
            timeout: 15000 // 增加超时设置，防止请求一直挂起
        });
        
        if (response.data.error) {
            console.log(`[GitHub Poll] status: ${response.data.error}`);
        } else if (response.data.access_token) {
            console.log(`[GitHub Poll] Success: Token acquired`);
        }
        
        res.json(response.data);
    } catch (error) {
        // 捕获网络层面的错误（如超时、连接中断）
        const errorCode = error.code || 'UNKNOWN_ERROR';
        console.error(`[GitHub Poll] Network Error (${errorCode}):`, error.message);
        
        // 返回一个 authorization_pending 状态，让前端继续轮询而不是直接报错停止
        res.json({ error: 'authorization_pending', message: 'Network unstable, retrying...' });
    }
});

app.get('/api/github/models', async (req, res) => {
    const token = req.query.token;
    try {
        const models = await fetchCopilotModels(token);
        res.json(models);
    } catch (error) {
        console.error('Failed to fetch GitHub models:', error.message);
        res.json([
            { id: 'gpt-5-mini', label: 'OpenAI GPT-5 mini' },
            { id: 'gpt-5.4', label: 'OpenAI GPT-5.4' },
            { id: 'gpt-4o', label: 'OpenAI GPT-4o' },
            { id: 'gemini-3-flash', label: 'Google Gemini 3 Flash' },
            { id: 'claude-sonnet-4.5', label: 'Anthropic Claude Sonnet 4.5' },
            { id: 'claude-opus-4.5', label: 'Anthropic Claude Opus 4.5' },
        ]);
    }
});

function normalizeCustomDrawingSize(width = 512, height = 512, modelId = '') {
    const safeWidth = Math.max(256, Number(width) || 512);
    const safeHeight = Math.max(256, Number(height) || 512);
    const normalizedModelId = String(modelId || '').toLowerCase();
    const prefersOpenAiSizes = /(gpt-image|dall-e)/i.test(normalizedModelId);

    if (prefersOpenAiSizes) {
        if (safeWidth > safeHeight * 1.2) return '1792x1024';
        if (safeHeight > safeWidth * 1.2) return '1024x1792';
        return '1024x1024';
    }

    const normalizedWidth = Math.max(256, Math.round(safeWidth / 64) * 64);
    const normalizedHeight = Math.max(256, Math.round(safeHeight / 64) * 64);
    return `${normalizedWidth}x${normalizedHeight}`;
}

function getDefaultDrawDimension(provider = '', modelId = '') {
    return String(provider || '').trim().toLowerCase() === 'custom' && prefersHighResDrawModel(modelId) ? 1024 : 512;
}

function normalizeCustomDrawingModelId(modelId = '') {
    const raw = String(modelId || '').trim();
    if (!raw) return 'dall-e-3';

    const normalized = raw.toLowerCase().replace(/[_\s]+/g, '-');
    const aliases = new Map([
        ['glm-cogview3-flash', 'GLM-CogView3-Flash'],
        ['glm-cogview-3-flash', 'GLM-CogView3-Flash'],
        ['cogview3-flash', 'GLM-CogView3-Flash'],
        ['cogview-3-flash', 'GLM-CogView3-Flash'],
        ['glm-cogview3', 'GLM-CogView3'],
        ['glm-cogview-3', 'GLM-CogView3'],
        ['cogview3', 'GLM-CogView3'],
        ['cogview-3', 'GLM-CogView3'],
        ['glm-cogview4', 'GLM-CogView4'],
        ['glm-cogview-4', 'GLM-CogView4'],
        ['cogview4', 'GLM-CogView4'],
        ['cogview-4', 'GLM-CogView4'],
        ['glm-glm-image', 'GLM-Image'],
        ['glmimage', 'GLM-Image'],
    ]);

    return aliases.get(normalized) || raw;
}

function extractDrawRequestFromPrompt(rawPrompt = '', fallbackModel = '') {
    const source = String(rawPrompt || '');
    let modelOverride = '';
    let normalizedPrompt = source;

    normalizedPrompt = normalizedPrompt.replace(/\{([^{}]+)\}\s*$/i, (match, body) => {
        const modelMatch = String(body || '').match(/(?:^|[;,])\s*model\s*:\s*([^;,}]+)\s*(?:$|[;,])/i);
        if (modelMatch?.[1]) {
            modelOverride = modelMatch[1].trim();
            return '';
        }
        return match;
    }).trim();

    return {
        prompt: normalizedPrompt || source.trim(),
        modelOverride: modelOverride ? normalizeCustomDrawingModelId(modelOverride) : normalizeCustomDrawingModelId(fallbackModel),
    };
}

function coerceObservationToImageMarkdown(observation = '') {
    const trimmed = String(observation || '').trim();
    if (!trimmed) return '';
    if (/^!\[[^\]]*\]\((.+)\)$/s.test(trimmed)) return trimmed;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        if (!trimmed.includes('\n') && !trimmed.includes(' ')) {
            return `![Image](${trimmed})`;
        }
        return '';
    }
    if (trimmed.startsWith('data:image/') && isValidImageDataUri(trimmed)) {
        return `![Image](${trimmed})`;
    }
    return '';
}


// --- Agent Logic ---
async function callLLM(provider, model, ollamaUrl, prompt, config, streamCallback) {
    provider = normalizeChatProviderId(provider);
    let baseUrl = '';
    let apiKey = getConfiguredChatApiKey(config, provider);
    let apiToken = '';
    let headers = { 'Content-Type': 'application/json' };
    let payload = {};

    // 1. Determine Endpoint & Headers
    if (provider === 'ollama') {
        let ollamaBase = (ollamaUrl || 'http://localhost:11434').trim();
        if (!ollamaBase.startsWith('http')) ollamaBase = `http://${ollamaBase}`;
        ollamaBase = ollamaBase.replace(/\/$/, '');
        
        const response = await axios.post(`${ollamaBase}/api/generate`, {
            model: model,
            prompt: prompt,
            stream: true
        }, { responseType: 'stream', timeout: 120000 });

        let fullText = "";
        return new Promise((resolve, reject) => {
            response.data.on('data', chunk => {
                const lines = chunk.toString().split('\n');
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const json = JSON.parse(line);
                        if (json.response) {
                            fullText += json.response;
                            if (streamCallback) streamCallback(json.response);
                        }
                    } catch (e) {}
                }
            });
            response.data.on('end', () => resolve(fullText));
            response.data.on('error', (err) => reject(err));
        });
    }

    // Default system prompt
    const systemPrompt = config?.systemPrompt || "You are a helpful assistant.";

    switch (provider) {
        case 'copilot':
            baseUrl = GITHUB_COPILOT_CHAT_URL;
            apiToken = (await resolveCopilotAuth(config?.copilotToken)).apiToken;
            apiKey = apiToken;
            headers = getCopilotApiHeaders(apiToken);
            break;
        case 'openai':
            baseUrl = 'https://api.openai.com/v1/chat/completions';
            headers['Authorization'] = `Bearer ${apiKey}`;
            break;
        case 'deepseek':
            baseUrl = 'https://api.deepseek.com/v1/chat/completions';
            headers['Authorization'] = `Bearer ${apiKey}`;
            break;
        case 'zhipu':
            baseUrl = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
            headers['Authorization'] = `Bearer ${apiKey}`;
            break;
        case 'gemini':
            baseUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
            headers['Authorization'] = `Bearer ${apiKey}`;
            break;
        case 'minimax':
            baseUrl = 'https://api.minimax.chat/v1/text/chatcompletion_v2';
            headers['Authorization'] = `Bearer ${apiKey}`;
            break;
        case 'anthropic':
            baseUrl = 'https://api.anthropic.com/v1/messages';
            headers['x-api-key'] = apiKey;
            headers['anthropic-version'] = '2023-06-01';
            break;
        case 'moonshot':
            baseUrl = 'https://api.moonshot.cn/v1/chat/completions';
            headers['Authorization'] = `Bearer ${apiKey}`;
            break;
        case 'tongyi':
            baseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
            headers['Authorization'] = `Bearer ${apiKey}`;
            break;
        case 'doubao':
            baseUrl = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
            headers['Authorization'] = `Bearer ${apiKey}`;
            break;
        case 'custom':
            baseUrl = normalizeCustomChatCompletionsUrl(getConfiguredChatApiBaseUrl(config, 'custom'));
            if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
            break;
        case 'lmstudio':
            baseUrl = normalizeCustomChatCompletionsUrl(config?.lmstudioUrl || 'http://localhost:1234');
            break;
        default:
            throw new Error(`Unsupported provider: ${provider}`);
    }

    if (!baseUrl) throw new Error(`Base URL for ${provider} is not configured.`);

    // 2. Prepare Payload
    if (provider === 'anthropic') {
        payload = {
            model: model,
            max_tokens: 4096,
            system: systemPrompt,
            messages: [{ role: 'user', content: prompt }],
            stream: true
        };
    } else {
        payload = {
            model: provider === 'copilot' ? normalizeCopilotModelId(model) : model,
            messages: provider === 'copilot'
                ? [{ role: 'user', content: prompt }]
                : [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt }
                ],
            stream: true
        };
    }

    // 3. Execute Streaming Call
    let fullText = "";
    if (provider === 'copilot') {
        const streamed = await streamCopilotChat({
            apiToken,
            payload,
            onText: (text) => {
                fullText += text;
                if (streamCallback) streamCallback(text);
            }
        });

        if (!fullText.trim()) {
            const fallbackText = await fetchCopilotChatOnce({ apiToken, payload });
            fullText = fallbackText || streamed.text || '';
            if (fallbackText && streamCallback) streamCallback(fallbackText);
        }

        return fullText;
    }

    const response = await axios.post(baseUrl, payload, {
        headers: headers,
        responseType: 'stream',
        timeout: 120000
    });

    return new Promise((resolve, reject) => {
        response.data.on('data', chunk => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
                const l = line.trim();
                if (!l) continue;
                
                if (provider === 'anthropic') {
                    if (l.startsWith('data: ')) {
                        try {
                            const json = JSON.parse(l.slice(6));
                            if (json.type === 'content_block_delta' && json.delta?.text) {
                                const text = json.delta.text;
                                fullText += text;
                                if (streamCallback) streamCallback(text);
                            }
                        } catch (e) {}
                    }
                } else {
                    if (l.startsWith('data: ')) {
                        const dataStr = l.slice(6);
                        if (dataStr === '[DONE]') continue;
                        try {
                            const json = JSON.parse(dataStr);
                            const text = json.choices[0]?.delta?.content || "";
                            fullText += text;
                            if (streamCallback) streamCallback(text);
                        } catch (e) {}
                    }
                }
            }
        });
        response.data.on('end', () => resolve(fullText));
        response.data.on('error', (err) => reject(err));
    });
}

async function runDeepReadingLoop(res, { message, history, context, provider, model, ollamaUrl, searchEnabled, chatId, assistantMsgId, uploadedFiles, config, resumeState = null }) {
    const sendUpdate = (data) => {
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type: 'deepReading', deepReading: data })}\n\n`);
        }
    };

    let aborted = false;
    res.on('close', () => {
        aborted = true;
        console.log(`[Deep Reading] Client disconnected. Aborting loop for chatId: ${chatId}`);
    });

    try {
        if (aborted) return;
        let steps = Array.isArray(resumeState?.deepReadingData?.steps)
            ? JSON.parse(JSON.stringify(resumeState.deepReadingData.steps))
            : [];
        if (steps.length === 0) {
        // Step 1: Task Breakdown
        sendUpdate({ status: 'running', steps: [{ title: '正在规划研究路径...', status: 'running' }] });
        
        const breakdownPrompt = `你是一个专家级的研究助手。请将以下用户任务拆解为 3-5 个逻辑严密的执行子任务。
用户输入: ${message}
返回格式必须是 JSON 数组: [{"title": "任务标题", "description": "任务描述"}]
只返回 JSON 代码块。`;

        const breakdownResult = await callLLM(provider, model, ollamaUrl, breakdownPrompt, config);
        if (aborted) return;
        const parsedSteps = parseDeepReadingSteps(breakdownResult);
        if (!parsedSteps.length) {
            console.warn('[Deep Reading] Failed to parse breakdown JSON, using fallback step.');
        }
        if (parsedSteps.length) {
            steps = parsedSteps.map((step, i) => ({ ...step, id: i, status: i === 0 ? 'running' : 'not-started', content: '' }));
        } else {
            steps = [{ id: 0, title: '深度解析', description: '对任务进行全方位深度解析', status: 'running', content: '' }];
        }
        
        } else {
            steps = steps.map((step, i) => ({
                ...step,
                id: step.id ?? i,
                status: step.status === 'completed' ? 'completed' : 'not-started',
                content: step.status === 'completed' ? (step.content || '') : ''
            }));
        }

        sendUpdate({ steps });

        // Step 2 & 3: Information Retrieval & Reasoning (Iterate through steps)
        for (let i = 0; i < steps.length; i++) {
            if (steps[i].status === 'completed') continue;
            if (aborted) return;
            steps[i].status = 'running';
            sendUpdate({ steps });

            // 对于每个步骤，先进行联网检索
            const stepTitle = steps[i].title;
            let stepContent = steps[i].content || "";
            let sources = [];

            if (searchEnabled) {
                if (aborted) return;
                const searchQuery = `针对“${stepTitle}”，关于“${message}”的深度研究。`;
                const searchResults = await searchWeb(searchQuery);
                sources = searchResults.slice(0, 5).map(r => ({ title: r.title, url: r.link }));
                
                // 核心修复：添加有效 URL 过滤，防止传递 undefined 给 crawlUrl
                const browsePromises = searchResults
                    .slice(0, 3) // 增加到 3 个源以提高丰富度
                    .filter(r => r.link && typeof r.link === 'string' && r.link.startsWith('http'))
                    .map(r => crawlUrl(r.link).catch(err => {
                        console.error(`[Deep Reading] Skip crawl error for ${r.link}:`, err.message);
                        return "";
                    }));

                const browsedTexts = await Promise.all(browsePromises);
                const combinedContext = browsedTexts.filter(t => !!t).join('\n\n').slice(0, 10000);

                const reasoningPrompt = `你正在执行研究任务的第 ${i+1} 步: ${stepTitle}。
任务整体目标: ${message}
已掌握的联网信息:
${combinedContext}

请基于以上信息进行深度推理与验证，构建逻辑链。要求：
1. 识别并整合关键证据。
2. 如果存在矛盾点请指出。
3. 必须标明数据来源（如 [1], [2]）。
4. 杜绝无依据的推测。
5. 使用专业、客观的语气。
6. 支持使用 mermaid 语法绘制逻辑图或流程图 (使用 \`\`\`mermaid 块)。

请直接输出研究内容。`;

                await callLLM(provider, model, ollamaUrl, reasoningPrompt, config, (token) => {
                    if (aborted) return;
                    stepContent += token;
                    steps[i].content = stepContent;
                    sendUpdate({ steps });
                });
            } else {
                if (aborted) return;
                const simplePrompt = `请完成研究步骤: ${stepTitle}。任务目标: ${message}。请直接输出详细的研究分析。`;
                await callLLM(provider, model, ollamaUrl, simplePrompt, config, (token) => {
                    if (aborted) return;
                    stepContent += token;
                    steps[i].content = stepContent;
                    sendUpdate({ steps });
                });
            }

            steps[i].status = 'completed';
            steps[i].sources = sources;
            sendUpdate({ steps });
        }

        if (aborted) return;
        // Step 4: Report Generation
        const reportStep = { title: '正在生成最终研究报告...', status: 'running', content: '', type: 'report' };
        sendUpdate({ status: 'running', steps: [...steps, reportStep] });

        const finalContent = steps.map(s => `## ${s.title}\n${s.content}`).join('\n\n');
        const reportPrompt = `请将以下研究成果整理成一份专业且直观的研究报告。
${finalContent}

要求：
1. **自动生成符合行业规范的报告框架**：包含标题、摘要、核心发现、详细分析、结论和建议。
2. **学术与商业并重**：学术类请包含引用，商业类请突出关键结论。
3. **充分利用可视化**：广泛使用 Mermaid 语法绘制各种类型的图表（如流程图、时序图、饼图、象限图、思维导图等）。
   - **重要**：Mermaid 流程图的节点文字必须加双引号，例如 A["步骤一"]。
   - 确保 Mermaid 代码块以 \`\`\`mermaid 开始，以 \`\`\` 结束。
   - 保持逻辑清晰，不要过度复杂导致渲染崩溃。
4. **输出格式**：请直接输出完整的 Markdown 格式内容。不再需要输出 HTML 代码块。
5. **语言风格**：保持专业、客观且富有洞察力。`;

        let fullAssistantResponse = "";
        await callLLM(provider, model, ollamaUrl, reportPrompt, config, (token) => {
            if (aborted) return;
            fullAssistantResponse += token;
            reportStep.content += token;
            // 实时更新，但保持 status 为 running
            sendUpdate({ steps: [...steps, reportStep] });
        });

        if (aborted) return;

        // 核心修复：先更新内存对象状态，确保后续所有引用都正确
        reportStep.status = 'completed';
        reportStep.title = '报告撰写完成';
        reportStep.content = fullAssistantResponse; // 确保完整
        const finalSteps = [...steps, reportStep];
        
        // 解析内容 - 现在只关注 Markdown，不再提取 HTML
        const reportMarkdown = fullAssistantResponse.trim();
        const reportHtml = ""; // 不再生成 HTML

        // 立即发送一次状态更新，告知前端已完成
        sendUpdate({ 
            status: 'completed', 
            reportHtml, 
            reportMarkdown, 
            steps: finalSteps 
        });

        // --- 保存报告到本地文件系统 ---
        const reportFolderName = `report_${chatId}_${Date.now()}`;
        const currentReportPath = path.join(REPORTS_DIR, reportFolderName);
        try {
            await fs.ensureDir(currentReportPath);
            await fs.writeFile(path.join(currentReportPath, 'report.md'), reportMarkdown, 'utf8');
        } catch (err) {
            console.error('[Deep Reading] Failed to save report files:', err);
        }

        // Final persistence
        if (aborted) return;
        const sessionFilePath = path.join(SESSIONS_DIR, `${chatId}.json`);
        const sessionData = await safeReadJsonFile(sessionFilePath, { messages: [] });
        
        const existingMsgIdx = sessionData.messages.findIndex(m => m.id === assistantMsgId || String(m.id) === String(assistantMsgId));
        const assistantMsg = { 
            role: 'assistant', 
            id: assistantMsgId, 
            content: "为您生成的深度研究报告已就绪。",
            deepReadingData: { 
                steps: finalSteps, 
                reportHtml, 
                reportMarkdown, 
                status: 'completed',
                savedPath: currentReportPath
            }
        };

        if (existingMsgIdx !== -1) {
            sessionData.messages[existingMsgIdx] = assistantMsg;
        } else {
            sessionData.messages.push(assistantMsg);
        }
        
        await fs.writeJson(sessionFilePath, sessionData, { spaces: 2 });
        res.write('data: [DONE]\n\n');
    } catch (error) {
        console.error('Deep Reading Error:', error);
        sendUpdate({ status: 'error', error: error.message });
        res.write(`data: ${JSON.stringify({ text: `发生错误: ${error.message}` })}\n\n`);
        res.write('data: [DONE]\n\n');
    }
}

function stripMarkdownFence(text = '', language = '') {
    const trimmed = String(text || '').trim();
    if (!trimmed) return '';
    const pattern = language
        ? new RegExp(`^\\\`\\\`\\\`${language}\\s*([\\s\\S]*?)\\\`\\\`\\\`$`, 'i')
        : /^```[a-zA-Z0-9_-]*\s*([\s\S]*?)```$/i;
    const match = trimmed.match(pattern);
    return match ? match[1].trim() : trimmed;
}

function extractBalancedJsonFragment(text = '', openingChar = '[') {
    const normalized = String(text || '').trim();
    const start = normalized.indexOf(openingChar);
    if (start < 0) return '';

    const candidate = normalized.slice(start);
    const balancedEnd = findBalancedJsonEnd(candidate);
    if (balancedEnd <= 0) return '';
    return candidate.slice(0, balancedEnd).trim();
}

function sanitizeLooseJson(input = '') {
    let cleaned = stripMarkdownFence(String(input || '').trim(), 'json');
    if (!cleaned) return '';

    cleaned = cleaned
        .replace(/^\uFEFF/, '')
        .replace(/[“”„‟]/g, '"')
        .replace(/[‘’‚‛]/g, "'")
        .replace(/[，﹐､]/g, ',')
        .replace(/[：﹕]/g, ':')
        .replace(/\t/g, ' ')
        .replace(/,\s*([}\]])/g, '$1');

    cleaned = cleaned.replace(/([{,]\s*)([A-Za-z_$][\w$-]*)\s*:/g, '$1"$2":');
    cleaned = cleaned.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, value) => {
        const normalizedValue = value.replace(/\\'/g, "'");
        return JSON.stringify(normalizedValue);
    });

    return cleaned.trim();
}

function normalizeDeepReadingStep(step, index) {
    const title = String(
        step?.title ||
        step?.name ||
        step?.task ||
        step?.heading ||
        `Step ${index + 1}`
    ).trim();
    const description = String(
        step?.description ||
        step?.detail ||
        step?.content ||
        step?.summary ||
        `Analyze ${title}`
    ).trim();

    return { title, description };
}

function parseDeepReadingSteps(raw = '') {
    const normalized = String(raw || '').trim();
    if (!normalized) return [];

    const candidates = [];
    const pushCandidate = (value) => {
        const candidate = String(value || '').trim();
        if (!candidate || candidates.includes(candidate)) return;
        candidates.push(candidate);
    };

    pushCandidate(normalized);
    pushCandidate(stripMarkdownFence(normalized, 'json'));
    pushCandidate(extractBalancedJsonFragment(normalized, '['));
    pushCandidate(extractBalancedJsonFragment(normalized, '{'));

    for (const candidate of [...candidates]) {
        pushCandidate(sanitizeLooseJson(candidate));
        pushCandidate(extractBalancedJsonFragment(candidate, '['));
    }

    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate);
            const steps = Array.isArray(parsed)
                ? parsed
                : Array.isArray(parsed?.steps)
                    ? parsed.steps
                    : Array.isArray(parsed?.tasks)
                        ? parsed.tasks
                        : [];

            if (!steps.length) continue;

            return steps
                .map((step, index) => normalizeDeepReadingStep(step, index))
                .filter((step) => step.title);
        } catch (error) {
            // Try the next candidate. Deep reading should degrade gracefully.
        }
    }

    return [];
}

function parseLooseJsonObject(raw = '', fallback = {}) {
    const normalized = String(raw || '').trim();
    if (!normalized) return fallback;

    const candidates = [];
    const pushCandidate = (value) => {
        const candidate = String(value || '').trim();
        if (!candidate || candidates.includes(candidate)) return;
        candidates.push(candidate);
    };

    pushCandidate(normalized);
    pushCandidate(stripMarkdownFence(normalized, 'json'));
    pushCandidate(extractBalancedJsonFragment(normalized, '{'));

    for (const candidate of [...candidates]) {
        pushCandidate(sanitizeLooseJson(candidate));
        pushCandidate(extractBalancedJsonFragment(candidate, '{'));
    }

    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed;
            }
        } catch (error) {
            // Try the next candidate.
        }
    }

    return fallback;
}

function decodeStructuredToolArgument(raw = '') {
    let normalized = String(raw || '').trim();
    if (!normalized) return '';

    const first = normalized[0];
    const last = normalized[normalized.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        if (first === '"') {
            try {
                return JSON.parse(normalized);
            } catch {}
        }
        normalized = normalized
            .slice(1, -1)
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t')
            .replace(/\\"/g, '"')
            .replace(/\\'/g, "'")
            .replace(/\\\\/g, '\\');
    }

    return normalized.trim();
}

function parseLooseJsonValue(raw = '', fallback = null) {
    const normalized = decodeStructuredToolArgument(raw);
    if (!normalized) return fallback;

    const candidates = [];
    const pushCandidate = (value) => {
        const candidate = String(value || '').trim();
        if (!candidate || candidates.includes(candidate)) return;
        candidates.push(candidate);
    };

    pushCandidate(normalized);
    pushCandidate(stripMarkdownFence(normalized, 'json'));
    pushCandidate(extractBalancedJsonFragment(normalized, '{'));
    pushCandidate(extractBalancedJsonFragment(normalized, '['));

    for (const candidate of [...candidates]) {
        pushCandidate(sanitizeLooseJson(candidate));
        pushCandidate(extractBalancedJsonFragment(candidate, '{'));
        pushCandidate(extractBalancedJsonFragment(candidate, '['));
    }

    for (const candidate of candidates) {
        try {
            return JSON.parse(candidate);
        } catch {}
    }

    return fallback;
}

function normalizeAgentTodoStatus(value = '') {
    const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (['completed', 'complete', 'done', 'checked', 'finished', 'success', 'ok', 'yes', 'true'].includes(normalized)) {
        return 'completed';
    }
    if (['in_progress', 'doing', 'current', 'active', 'running', 'working', 'started'].includes(normalized)) {
        return 'in_progress';
    }
    return 'pending';
}

function createAgentTodoItemId(text = '', index = 0) {
    const slug = String(text || '')
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 36);
    return slug || `todo-${index + 1}`;
}

function normalizeAgentTodoUpdate(rawPayload = '', previousTodo = null) {
    const parsed = parseLooseJsonValue(rawPayload, null);
    const update = Array.isArray(parsed) ? { items: parsed } : parsed;

    if (!update || typeof update !== 'object' || Array.isArray(update)) {
        return {
            error: 'updateTodo expects JSON like {"items":[{"id":"inspect","text":"Inspect files","status":"in_progress"}]}.',
        };
    }

    const previousItems = Array.isArray(previousTodo?.items) ? previousTodo.items : [];
    const previousById = new Map(previousItems.map(item => [String(item.id || ''), item]).filter(([id]) => id));
    const previousByText = new Map(previousItems.map(item => [String(item.text || ''), item]).filter(([text]) => text));
    const rawItems = Array.isArray(update.items)
        ? update.items
        : (Array.isArray(update.todos)
            ? update.todos
            : (Array.isArray(update.tasks) ? update.tasks : null));

    const requestedStatus = String(update.status || update.state || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    const shouldClose = Boolean(update.close || update.closed)
        || ['done', 'completed', 'complete', 'closed', 'finished'].includes(requestedStatus);

    const items = rawItems
        ? rawItems.map((item, index) => {
            const source = (item && typeof item === 'object') ? item : { text: String(item || '') };
            const text = String(source.text || source.title || source.task || source.content || source.name || '').trim();
            const id = String(source.id || createAgentTodoItemId(text, index)).trim();
            const previous = previousById.get(id) || previousByText.get(text);
            const rawStatus = source.status || source.state || source.progress
                || (source.done || source.checked ? 'completed' : '')
                || previous?.status
                || 'pending';

            return {
                id,
                text: text || `Step ${index + 1}`,
                status: normalizeAgentTodoStatus(rawStatus),
            };
        }).filter(item => item.text)
        : previousItems;

    if (!items.length && !shouldClose) {
        return {
            error: 'updateTodo needs at least one item unless it is closing the current todo.',
        };
    }

    const activeCount = items.filter(item => item.status === 'in_progress').length;
    const normalizedItems = activeCount <= 1
        ? items
        : items.map((item, index) => index === items.findIndex(candidate => candidate.status === 'in_progress')
            ? item
            : { ...item, status: item.status === 'in_progress' ? 'pending' : item.status });

    return {
        id: String(update.id || previousTodo?.id || `todo_${Date.now()}`).trim(),
        title: String(update.title || previousTodo?.title || 'Task Todo').trim(),
        status: shouldClose ? 'done' : (requestedStatus || previousTodo?.status || 'active'),
        closed: shouldClose,
        items: normalizedItems,
        updatedAt: new Date().toISOString(),
    };
}

function uniqueTrimmedList(items = [], limit = 8) {
    const result = [];
    const seen = new Set();

    for (const item of Array.isArray(items) ? items : []) {
        const value = String(item || '').trim();
        if (!value) continue;
        const key = value.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(value);
        if (result.length >= limit) break;
    }

    return result;
}

function pickVerificationText(language = 'en', zhText, enText) {
    return String(language || '').toLowerCase().startsWith('zh') ? zhText : enText;
}

function normalizeCredibilityStance(value = '') {
    const normalized = String(value || '').trim().toLowerCase();

    if (['support', 'supports', 'supported', 'confirm', 'confirmed', 'true', 'real'].includes(normalized)) {
        return 'support';
    }

    if (['contradict', 'contradicts', 'refute', 'refutes', 'false', 'fake', 'debunked', 'misleading'].includes(normalized)) {
        return 'contradict';
    }

    if (['mixed', 'partial', 'partially-supported', 'both'].includes(normalized)) {
        return 'mixed';
    }

    return 'unclear';
}

function buildFallbackClaimExtraction(message = '') {
    const claim = String(message || '').trim();
    const language = detectLanguage(claim);
    const coarseTokens = claim
        .split(/[\s,.;:!?，。；：！？、()（）"'“”‘’【】\[\]-]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= (language === 'zh' ? 2 : 3));
    const keywords = uniqueTrimmedList(
        coarseTokens.sort((left, right) => right.length - left.length),
        6
    );
    const basePhrase = keywords.slice(0, 4).join(' ');

    return {
        claim,
        normalizedClaim: claim,
        language,
        keywords,
        entities: keywords.slice(0, 4),
        searchQueries: uniqueTrimmedList([
            claim,
            basePhrase,
            language === 'zh'
                ? `${basePhrase || claim} 官方 辟谣`
                : `${basePhrase || claim} official fact check`,
            language === 'zh'
                ? `${basePhrase || claim} 是否属实`
                : `${basePhrase || claim} true or false`,
        ], 4),
    };
}

function buildVerificationQueries(extraction = {}) {
    const language = extraction.language || detectLanguage(extraction.claim || extraction.normalizedClaim || '');
    const baseTerms = uniqueTrimmedList([
        extraction.normalizedClaim,
        extraction.claim,
        ...(Array.isArray(extraction.keywords) ? extraction.keywords : []),
        ...(Array.isArray(extraction.entities) ? extraction.entities : []),
    ], 8);
    const basePhrase = baseTerms.slice(0, 4).join(' ');

    return uniqueTrimmedList([
        ...(Array.isArray(extraction.searchQueries) ? extraction.searchQueries : []),
        extraction.normalizedClaim || extraction.claim,
        basePhrase,
        language === 'zh'
            ? `${basePhrase || extraction.claim} 官方 说明`
            : `${basePhrase || extraction.claim} official statement`,
        language === 'zh'
            ? `${basePhrase || extraction.claim} 辟谣 查证`
            : `${basePhrase || extraction.claim} fact check`,
    ], 4);
}

function fallbackSourceAssessment(source = {}, keywords = [], language = 'en') {
    const text = `${source.title || ''}\n${source.content || ''}\n${source.excerpt || ''}`.toLowerCase();
    const keywordHits = uniqueTrimmedList(keywords, 8)
        .filter((keyword) => text.includes(String(keyword).toLowerCase()));
    const contradictHits = [
        'false',
        'fake',
        'misleading',
        'debunk',
        'rumor',
        'hoax',
        '谣言',
        '不实',
        '虚假',
        '辟谣',
        '误导',
    ].filter((term) => text.includes(term));
    const supportHits = [
        'confirmed',
        'official',
        'verified',
        'announcement',
        'statement',
        '证实',
        '确认',
        '官方',
        '公告',
        '通报',
    ].filter((term) => text.includes(term));

    let stance = 'unclear';
    if (contradictHits.length > supportHits.length) {
        stance = 'contradict';
    } else if (supportHits.length > contradictHits.length) {
        stance = 'support';
    } else if (supportHits.length > 0 && contradictHits.length > 0) {
        stance = 'mixed';
    }

    const relevance = Math.max(
        keywordHits.length > 0 ? Math.min(1, 0.35 + keywordHits.length * 0.18) : 0.3,
        source.content ? 0.4 : 0.25
    );
    const confidence = Math.min(
        0.88,
        0.38
            + (source.authorityScore || 0) / 220
            + Math.min((source.engineCount || 0) * 0.08, 0.2)
    );

    return {
        stance,
        relevance,
        confidence,
        reason: pickVerificationText(
            language,
            stance === 'contradict'
                ? '片段中出现了“辟谣/不实”等反驳信号。'
                : stance === 'support'
                    ? '片段中出现了“官方/证实”等支持信号。'
                    : '现有片段更像背景信息，无法直接判断真伪。',
            stance === 'contradict'
                ? 'The snippet contains debunking-style cues.'
                : stance === 'support'
                    ? 'The snippet contains official or confirming cues.'
                    : 'The snippet looks more like context than a direct verdict.'
        ),
    };
}

function buildFallbackCredibilitySummary({
    language = 'en',
    verdictLabel = '',
    score = 50,
    sourceStats = {},
    sentiment = {},
}) {
    return pickVerificationText(
        language,
        `综合多引擎检索与来源分析，这条信息当前的可信度为 ${score}/100（${verdictLabel}）。本次查证使用了 ${sourceStats.engineCount || 0} 个搜索引擎、${sourceStats.uniqueDomains || 0} 个独立站点，原始表述的情绪化强度约为 ${Math.round(sentiment.emotionality || 0)}/100。`,
        `Based on multi-engine search and source analysis, this claim currently scores ${score}/100 (${verdictLabel}). The check used ${sourceStats.engineCount || 0} search engines and ${sourceStats.uniqueDomains || 0} distinct domains, while the original wording showed emotionality around ${Math.round(sentiment.emotionality || 0)}/100.`
    );
}

function cleanPptThinkingText(text = '') {
    let cleaned = String(text || '').trim();
    if (!cleaned) return '';

    cleaned = cleaned
        .replace(/^\s*(设计思考|思考过程|Thinking|Design Thinking)\s*[:：-]?\s*/i, '')
        .replace(/\s*<\/?(THINKING|SLIDE_HTML)>/gi, '')
        .trim();

    const htmlStart = cleaned.search(/<(?:div|section|main|article|html|body)\b/i);
    if (htmlStart >= 0) {
        cleaned = cleaned.slice(0, htmlStart).trim();
    }

    return cleaned;
}

function cleanPptSlideHtml(html = '') {
    let cleaned = stripMarkdownFence(String(html || ''), 'html')
        .replace(/<\/?(THINKING|SLIDE_HTML)>/gi, '')
        .trim();

    const slideStart = cleaned.search(/<(?:div|section)\b[^>]*class=["'][^"']*\bslide\b/i);
    if (slideStart >= 0) {
        cleaned = cleaned.slice(slideStart).trim();
    }

    const trailingThinking = cleaned.search(/<(?:THINKING)\b/i);
    if (trailingThinking >= 0) {
        cleaned = cleaned.slice(0, trailingThinking).trim();
    }

    return cleaned;
}

function parseChineseNumberToken(token = '') {
    const normalized = String(token || '').trim();
    if (!normalized) return null;
    if (/^\d+$/.test(normalized)) {
        return Number.parseInt(normalized, 10);
    }

    const digitMap = new Map([
        ['零', 0],
        ['一', 1],
        ['二', 2],
        ['两', 2],
        ['三', 3],
        ['四', 4],
        ['五', 5],
        ['六', 6],
        ['七', 7],
        ['八', 8],
        ['九', 9],
    ]);

    if (digitMap.has(normalized)) {
        return digitMap.get(normalized);
    }
    if (normalized === '十') return 10;

    const tenMatch = normalized.match(/^([一二两三四五六七八九])?十([一二两三四五六七八九])?$/);
    if (tenMatch) {
        const tens = tenMatch[1] ? digitMap.get(tenMatch[1]) : 1;
        const ones = tenMatch[2] ? digitMap.get(tenMatch[2]) : 0;
        return tens * 10 + ones;
    }

    return null;
}

function extractRequestedPptSlideCount(message = '') {
    const text = String(message || '');
    if (!text) return null;

    const patterns = [
        /(?:做|生成|制作|输出|安排|给我|需要|做成|整成)\s*([0-9]{1,2}|[零一二两三四五六七八九十]{1,3})\s*(?:张|页)\s*(?:PPT|幻灯片)/i,
        /(?:PPT|幻灯片)\s*(?:做|生成|制作|输出|安排)?\s*([0-9]{1,2}|[零一二两三四五六七八九十]{1,3})\s*(?:张|页)/i,
        /([0-9]{1,2}|[零一二两三四五六七八九十]{1,3})\s*(?:张|页)\s*(?:PPT|幻灯片)/i,
        /(?:exactly|about|around)?\s*([0-9]{1,2})\s*(?:slides?|pages?)\b/i,
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (!match?.[1]) continue;
        const parsed = parseChineseNumberToken(match[1]);
        if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 30) {
            return parsed;
        }
    }

    return null;
}

function normalizePptPlanSlides(plan = {}) {
    const normalizedTitle = String(plan?.title || '演示文稿').trim() || '演示文稿';
    let slides = Array.isArray(plan?.slides)
        ? plan.slides
            .map((slide, index) => ({
                title: String(slide?.title || `第 ${index + 1} 页`).trim() || `第 ${index + 1} 页`,
                description: String(slide?.description || slide?.content || `${normalizedTitle} 的第 ${index + 1} 部分`).trim() || `${normalizedTitle} 的第 ${index + 1} 部分`,
                designHint: String(slide?.designHint || '').trim(),
            }))
            .filter(slide => slide.title)
        : [];

    if (!slides.length) {
        slides = [{ title: '介绍', description: '关于项目的基本介绍', designHint: '' }];
    }

    return {
        title: normalizedTitle,
        slides,
    };
}

function parsePptSlideResponse(raw = '') {
    const normalized = String(raw || '').replace(/\r\n/g, '\n').trim();
    if (!normalized) {
        return { thinking: '', html: '', isStructured: false };
    }

    const thinkingTagMatch = normalized.match(/<THINKING>([\s\S]*?)<\/THINKING>/i);
    const htmlTagMatch = normalized.match(/<SLIDE_HTML>([\s\S]*?)<\/SLIDE_HTML>/i);
    let thinking = thinkingTagMatch ? thinkingTagMatch[1].trim() : '';
    let html = htmlTagMatch ? htmlTagMatch[1].trim() : '';

    if (!html) {
        const htmlFenceMatch = normalized.match(/```html\s*([\s\S]*?)```/i);
        if (htmlFenceMatch) {
            html = htmlFenceMatch[1].trim();
            thinking = thinking || normalized.slice(0, htmlFenceMatch.index || 0).trim();
        }
    }

    if (!html) {
        const slideStart = normalized.search(/<(?:div|section)\b[^>]*class=["'][^"']*\bslide\b/i);
        if (slideStart >= 0) {
            html = normalized.slice(slideStart).trim();
            thinking = thinking || normalized.slice(0, slideStart).trim();
        }
    }

    thinking = cleanPptThinkingText(thinking || normalized.slice(0, html ? normalized.indexOf(html) : 0));
    html = cleanPptSlideHtml(html);

    return {
        thinking,
        html,
        isStructured: Boolean(thinkingTagMatch && htmlTagMatch),
    };
}

async function runPPTLoop(res, { message, history, context, provider, model, ollamaUrl, searchEnabled, chatId, assistantMsgId, uploadedFiles, config, resumeState = null }) {
    const sendUpdate = (data) => {
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type: 'ppt', pptData: data })}\n\n`);
        }
        
        // Optional: Periodic persistence if chatId is provided
        if (chatId && assistantMsgId && (data.steps || data.status)) {
            persistPPTState(data);
        }
    };

    const persistPPTState = async (updateData) => {
        try {
            const sessionFilePath = path.join(SESSIONS_DIR, `${chatId}.json`);
            const sessionData = await safeReadJsonFile(sessionFilePath, { messages: [] });
            const existingMsgIdx = sessionData.messages.findIndex(m => m.id === assistantMsgId || String(m.id) === String(assistantMsgId));
            
            if (existingMsgIdx !== -1) {
                const msg = sessionData.messages[existingMsgIdx];
                msg.pptData = { 
                    ...(msg.pptData || {}), 
                    ...updateData,
                    // Special merging for steps to preserve data
                    steps: updateData.steps || msg.pptData.steps || []
                };
                if (updateData.pptTitle) msg.pptData.pptTitle = updateData.pptTitle;
                if (updateData.status) msg.pptData.status = updateData.status;

                await fs.writeJson(sessionFilePath, sessionData, { spaces: 2 });
            }
        } catch (err) {
            console.warn('[PPT] Partial persistence failed:', err.message);
        }
    };

    let aborted = false;
    res.on('close', () => {
        aborted = true;
        console.log(`[PPT] Client disconnected. Aborting loop for chatId: ${chatId}`);
    });

    try {
        if (aborted) return;
        let plan = { title: resumeState?.pptData?.pptTitle || "演示文稿", slides: [] };
        const requestedSlideCount = extractRequestedPptSlideCount(message);
        let steps = Array.isArray(resumeState?.pptData?.steps)
            ? JSON.parse(JSON.stringify(resumeState.pptData.steps))
            : [];
        
        if (steps.length === 0) {
        // Initial entry in history
        await persistPPTState({ 
            status: 'running', 
            steps: [{ title: '正在规划PPT大纲...', status: 'running' }],
            pptTitle: '正在规划中...'
        });

        // Step 1: Planning
        sendUpdate({ status: 'running', steps: [{ title: '正在规划PPT大纲...', status: 'running' }] });
        
        const planPrompt = `你是一个专业的PPT架构师。请根据用户描述的任务制作一个PPT大纲。
用户需求: ${message}
${context ? "上下文信息: " + context : ""}

要求：
1. 确定PPT的总标题。
2. ${requestedSlideCount ? `必须严格拆解为 ${requestedSlideCount} 张幻灯片，不多不少。` : '拆解为 5-10 张幻灯片。'}
3. 请确保第一页（Index 0）是富有感染力的【封面页】，包含主标题和副标题。
4. 每页幻灯片除了标题，还要给出一个详细的【视觉设计建议】。
5. 返回格式必须是 JSON: {"title": "总标题", "slides": [{"title": "幻灯片标题", "description": "内容描述", "designHint": "如：使用左右分割布局，左侧大字标题，右侧要点卡片"}]}
只返回 JSON 代码块。`;

        let planResult = "";
        let planRetryCount = 0;
        const maxPlanRetries = 2;
        
        while (planRetryCount <= maxPlanRetries) {
            try {
                planResult = await callLLM(provider, model, ollamaUrl, planPrompt, config);
                break;
            } catch (err) {
                planRetryCount++;
                if (planRetryCount > maxPlanRetries || aborted) throw err;
                console.warn(`[PPT] Planning failed (trial ${planRetryCount}), retrying...`, err.message);
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        if (aborted) return;
        const jsonMatch = planResult.match(/```(?:json)?[\s\S]*?```|\{[\s\S]*\}/i);
        plan = { title: "演示文稿", slides: [] };
        if (jsonMatch) {
            let raw = jsonMatch[0]
                .replace(/```(?:json)?/i, '')
                .replace(/```/g, '')
                .trim();

            const sanitizePlanJson = (input) => input
                .replace(/[“”]/g, '"')
                .replace(/[，]/g, ',')
                .replace(/[：]/g, ':')
                .replace(/"(title|slides|description|designHint)"\s*(?=[\[{\"])/g, '"$1": ')
                .replace(/,\s*([}\]])/g, '$1');

            try {
                plan = JSON.parse(raw);
            } catch (e) {
                try {
                    plan = JSON.parse(sanitizePlanJson(raw));
                } catch (err) {
                    console.warn('[PPT] Failed to parse plan JSON, using fallback.', err.message);
                    plan = { title: "演示文稿", slides: [{ title: '介绍', description: '关于项目的基本介绍' }] };
                }
            }
        } else {
            plan.slides = [{ title: '介绍', description: '关于项目的基本介绍' }];
        }
        plan = normalizePptPlanSlides(plan);
        
        steps = plan.slides.map((s, i) => ({ 
            id: i, 
            title: s.title, 
            description: s.description, 
            designHint: s.designHint || '',
            status: i === 0 ? 'running' : 'not-started', 
            content: '',
            thinking: '' 
        }));
        } else {
            steps = steps.map((step, i) => ({
                ...step,
                id: step.id ?? i,
                status: step.status === 'completed' ? 'completed' : 'not-started',
                content: step.status === 'completed' ? (step.content || '') : '',
                thinking: step.status === 'completed' ? (step.thinking || '') : ''
            }));
            plan = {
                title: resumeState?.pptData?.pptTitle || plan.title,
                slides: steps.map(step => ({
                    title: step.title,
                    description: step.description,
                    designHint: step.designHint || ''
                }))
            };
        }
        
        sendUpdate({ pptTitle: plan.title, steps });

        // Step 2: Generate each slide
        for (let i = 0; i < steps.length; i++) {
            if (steps[i].status === 'completed') continue;
            if (aborted) return;
            steps[i].status = 'running';
            sendUpdate({ steps });

            const slidePrompt = `作为顶级PPT设计师，请为第 ${i+1} 张幻灯片“${steps[i].title}”生成极具视觉冲击力的内容。
整体主题: ${plan.title}
本页描述: ${steps[i].description}
视觉建议: ${steps[i].designHint}
是否为首页: ${i === 0 ? '是' : '否'}

设计原则：
1. **垂直重心平衡**：
   - 如果是首页(封面)，必须使用 \`justify-center items-center text-center\`，让标题和副标题处于画面正中央。
   - 如果是内容页，标题在上方，但内容区应使用 \`flex-1 flex flex-col justify-center\` 确保内容不会全部挤在顶部。
2. **视觉美化**：
   - **背景**：不要只用纯白。尝试使用 \`bg-slate-50\`，或者带渐变的背景如 \`bg-gradient-to-br from-indigo-50 via-white to-cyan-50\`。
   - **装饰**：在角落添加大的半透明 SVG 图标或几何图形。
   - **卡片化**：内容区域可以使用 \`bg-white/80 backdrop-blur-sm shadow-xl rounded-3xl p-8 border border-white\` 这种玻璃拟态效果。
3. **排版与内容量控制**：
   - **内容守则**：每页幻灯片内容文字**禁止超过 200 字**。如果内容很多，必须使用分栏布局（Grid 2或3）。
   - 标题：\`text-5xl font-black text-slate-900 mb-8 tracking-tighter\`。
   - 正文：\`text-xl text-slate-600 leading-snug\` (注意：对于 540px 高度，2xl 往往太大，优先用 xl)。
   - 强调：使用不同的粗细或实色（如 \`text-indigo-600\`）。**禁止使用 \`bg-clip-text\` 或 \`text-transparent\`**。
   - **列表限制**：无序列表最多允许 5 个项目。

输出格式要求：
1. 思考过程（Thinking）：说明本页的视觉布局逻辑以及如何精简内容。
2. HTML内容：包裹在 <div class="slide">...</div> 中。
   - 必须包含 \`style="width: 960px; height: 540px;"\`。
   - 内部必须包含一个内边距容器 \`p-16\` (Safe Zone) 且设置 \`overflow-hidden\`。
   - 多卡片布局时，必须给卡片容器设置具体的 \`max-h-[350px] overflow-hidden\` 属性。
   - 使用 Tailwind CSS。
   - 如果内容较多，请减小字号到 \`text-lg\` 或 \`text-base\`。

示例 (首页):
\`\`\`html
<div class="slide relative w-[960px] h-[540px] bg-slate-900 flex items-center justify-center overflow-hidden text-white">
  <div class="absolute inset-0 opacity-20">
    <svg ...>背景纹理</svg>
  </div>
  <div class="relative z-10 text-center px-20">
    <div class="w-20 h-1 bg-blue-500 mx-auto mb-8"></div>
    <h1 class="text-6xl font-black mb-6">标题</h1>
    <p class="text-2xl text-blue-200">副标题/描述</p>
  </div>
</div>
\`\`\``;

            const slideProtocolSuffix = `

你必须严格按下面协议输出，不能多也不能少：
<THINKING>
用 80-160 字中文说明本页的布局逻辑、信息取舍、视觉重点。
不要写任何 HTML 标签、不要写 class 名、不要写 Tailwind 类名、不要写代码。
</THINKING>
<SLIDE_HTML>
<div class="slide ..." style="width: 960px; height: 540px;">...</div>
</SLIDE_HTML>

强制要求：
- 只能输出这两个标签块，禁止输出 Markdown 代码块，禁止输出 \`\`\`html
- <SLIDE_HTML> 内只能放 HTML，不要混入解释文字
- 最外层必须是单个 <div class="slide ...">...</div>
- 必须有一个 \`p-16 overflow-hidden\` 的 Safe Zone 容器
- 多卡片布局时，卡片容器必须加 \`max-h-[350px] overflow-hidden\`
- 如果不按协议输出，系统会直接判定失败并重试`;
            const strictSlidePrompt = `${slidePrompt}\n${slideProtocolSuffix}`;

            let fullResponse = "";
            let retryCount = 0;
            const maxRetries = 2;

            while (retryCount <= maxRetries) {
                try {
                    await callLLM(provider, model, ollamaUrl, strictSlidePrompt, config, (token) => {
                        if (aborted) return;
                        fullResponse += token;
                        
                        const parsed = parsePptSlideResponse(fullResponse);
                        if (parsed.thinking) steps[i].thinking = parsed.thinking;
                        if (parsed.html) steps[i].content = parsed.html;
                        
                        sendUpdate({ steps });
                    });
                    const parsedFinal = parsePptSlideResponse(fullResponse);
                    if (parsedFinal.thinking) steps[i].thinking = parsedFinal.thinking;
                    if (parsedFinal.html) steps[i].content = parsedFinal.html;

                    const isValidSlide =
                        Boolean(steps[i].thinking) &&
                        Boolean(steps[i].content) &&
                        /<(?:div|section)\b[^>]*class=["'][^"']*\bslide\b/i.test(steps[i].content) &&
                        !/<(?:div|section|html|body)\b/i.test(steps[i].thinking);

                    if (!isValidSlide) {
                        throw new Error('PPT slide output format invalid: missing structured THINKING/SLIDE_HTML sections.');
                    }

                    break; // Success, exit retry loop
                } catch (llmError) {
                    retryCount++;
                    if (retryCount > maxRetries || aborted) {
                        console.error(`[PPT] Slide ${i+1} failed after retries:`, llmError.message);
                        steps[i].status = 'error';
                        steps[i].thinking = `出错了: ${llmError.message}`;
                        sendUpdate({ steps });
                        break;
                    }
                    console.warn(`[PPT] Slide ${i+1} trial ${retryCount} failed, retrying...`, llmError.message);
                    await new Promise(r => setTimeout(r, 1000));
                }
            }

            if (steps[i].status !== 'error') {
                steps[i].status = 'completed';
            }
            sendUpdate({ steps });
        }

        if (aborted) return;
        
        // Final Finalization
        const finalStep = { title: '正在封装最终演示文稿...', status: 'running', content: '' };
        sendUpdate({ steps: [...steps, finalStep] });

        // Combine all slides into a single HTML
        const allHtml = steps.map(s => s.content).join('\n');
        const finalHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background: #f3f4f6; padding: 40px; display: flex; flex-direction: column; align-items: center; }
        .slide { 
            background: white; 
            width: 960px; /* Fixed standard width */
            height: 540px; /* Fixed 16:9 height */
            margin: 0 auto 40px; 
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
            border-radius: 8px;
            display: flex;
            flex-direction: column;
            overflow: hidden; /* Prevent content overflow */
            position: relative;
            page-break-after: always;
            flex-shrink: 0;
            box-sizing: border-box;
        }
        /* Ensure all internal elements respect borders */
        .slide * { box-sizing: border-box; }
        .slide p, .slide li { 
          word-break: break-word;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 5;
          -webkit-box-orient: vertical;
        }
        .slide .grid > div, .slide .flex > div {
          max-height: 380px; 
          overflow: hidden;
        }
        .slide [class*="text-transparent"] {
          color: #4f46e5 !important;
          background-clip: initial !important;
          -webkit-background-clip: initial !important;
          background-image: none !important;
        }
        
        @media print {
            body { padding: 0; background: white; block-size: auto; }
            .slide { box-shadow: none; border-radius: 0; margin: 0; width: 297mm; height: 167mm; }
        }
    </style>
</head>
<body>
    <div class="slides-container" style="width: 100%; display: flex; flex-direction: column; align-items: center;">
        ${allHtml}
    </div>
</body>
</html>`;

        finalStep.status = 'completed';
        finalStep.title = 'PPT 制作完成';
        
        sendUpdate({ 
            status: 'completed', 
            finalHtml, 
            steps: [...steps, finalStep] 
        });

        // Save to sessions/history
        const sessionFilePath = path.join(SESSIONS_DIR, `${chatId}.json`);
        const sessionData = await safeReadJsonFile(sessionFilePath, { messages: [] });
        
        const existingMsgIdx = sessionData.messages.findIndex(m => m.id === assistantMsgId || String(m.id) === String(assistantMsgId));
        let generatedFiles = [];
        try {
            const outputDir = path.join(REPORTS_DIR, `ppt_${chatId}_${assistantMsgId}`);
            const snapshotTitle = sanitizeArtifactName(plan.title || 'presentation', 'presentation');
            const snapshotPath = path.join(outputDir, `${snapshotTitle}.pptx`);
            await fs.ensureDir(outputDir);
            await fs.remove(snapshotPath).catch(() => {});
            const snapshotBuffer = await buildSnapshotPptBuffer({
                finalHtml,
                slides: steps,
                title: plan.title || 'Presentation',
                baseUrl: getPptRenderBaseUrl(),
            });
            await fs.writeFile(snapshotPath, snapshotBuffer);
            const downloadableSnapshot = await buildDownloadableFile(snapshotPath);
            if (downloadableSnapshot) {
                generatedFiles = [downloadableSnapshot];
            }
        } catch (artifactError) {
            console.warn('[PPT] Failed to build final snapshot artifact during loop completion.', artifactError);
        }
        const assistantMsg = { 
            role: 'assistant', 
            id: assistantMsgId, 
            content: "您的PPT已制作完成，可以预览或下载。",
            generatedFiles,
            pptData: { 
                pptTitle: plan.title,
                steps: [...steps, finalStep], 
                finalHtml, 
                status: 'completed'
            }
        };

        if (existingMsgIdx !== -1) {
            sessionData.messages[existingMsgIdx] = assistantMsg;
        } else {
            sessionData.messages.push(assistantMsg);
        }
        
        await fs.writeJson(sessionFilePath, sessionData, { spaces: 2 });
        res.write('data: [DONE]\n\n');
    } catch (error) {
        if (aborted) {
            console.log(`[PPT] Loop terminated due to client disconnection.`);
            return;
        }
        console.error('PPT Generation Error:', error);
        
        // Mark current step as error if it exists
        if (typeof steps !== 'undefined' && Array.isArray(steps)) {
            const runningStep = steps.find(s => s.status === 'running');
            if (runningStep) runningStep.status = 'error';
        }

        const errData = { status: 'error', error: error.message, steps: (typeof steps !== 'undefined' ? steps : []) };
        sendUpdate(errData);
        res.write(`data: ${JSON.stringify(errData)}\n\n`);
        res.write('data: [DONE]\n\n');
    }
}

async function runCredibilityLoop(res, { message, provider, model, ollamaUrl, config, chatId = '', assistantMsgId = '' }) {
    const persistCredibilityState = async (updateData = {}) => {
        if (!chatId || !assistantMsgId) return;
        try {
            const sessionFilePath = path.join(SESSIONS_DIR, `${chatId}.json`);
            const sessionData = await safeReadJsonFile(sessionFilePath, { messages: [] });
            const existingMsgIdx = sessionData.messages.findIndex(m => m.id === assistantMsgId || String(m.id) === String(assistantMsgId));

            if (existingMsgIdx !== -1) {
                const msg = sessionData.messages[existingMsgIdx];
                msg.credibilityCheckData = {
                    ...(msg.credibilityCheckData || {}),
                    ...updateData,
                };
                if (updateData.summary) {
                    msg.content = updateData.summary;
                }
                await fs.writeJson(sessionFilePath, sessionData, { spaces: 2 });
            }
        } catch (err) {
            console.warn('[Credibility] Partial persistence failed:', err.message);
        }
    };

    const persistFinalCredibilityMessage = async (summaryText = '', payload = {}) => {
        if (!chatId || !assistantMsgId) return;
        try {
            const sessionFilePath = path.join(SESSIONS_DIR, `${chatId}.json`);
            const sessionData = await safeReadJsonFile(sessionFilePath, { messages: [] });
            const existingMsgIdx = sessionData.messages.findIndex(m => m.id === assistantMsgId || String(m.id) === String(assistantMsgId));
            const previousMessage = existingMsgIdx !== -1 ? (sessionData.messages[existingMsgIdx] || {}) : {};
            const assistantMsg = {
                ...previousMessage,
                role: 'assistant',
                id: assistantMsgId,
                content: String(summaryText || previousMessage.content || '').trim(),
                credibilityCheckData: payload,
            };

            if (existingMsgIdx !== -1) {
                sessionData.messages[existingMsgIdx] = assistantMsg;
            } else {
                sessionData.messages.push(assistantMsg);
            }

            await fs.writeJson(sessionFilePath, sessionData, { spaces: 2 });
        } catch (err) {
            console.warn('[Credibility] Final persistence failed:', err.message);
        }
    };

    const sendUpdate = (data) => {
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type: 'credibilityCheck', credibilityCheck: data })}\n\n`);
        }
        if (chatId && assistantMsgId && (data?.status || data?.summary || data?.progress != null || data?.currentStage)) {
            persistCredibilityState(data);
        }
    };

    let aborted = false;
    res.on('close', () => {
        aborted = true;
    });

    const roundValue = (value, digits = 2) => {
        const factor = 10 ** digits;
        return Math.round((Number(value) || 0) * factor) / factor;
    };

    try {
        const claimText = String(message || '').trim();
        const runtimeConfig = config && typeof config === 'object'
            ? config
            : await readGlobalConfig();
        const fallbackExtraction = buildFallbackClaimExtraction(claimText);
        const neutralConfig = {
            ...(runtimeConfig || {}),
            systemPrompt: 'You are a careful fact-checking assistant. Return clean JSON only when the prompt asks for JSON.',
        };

        let extraction = { ...fallbackExtraction };
        sendUpdate({
            status: 'running',
            progress: 8,
            currentStage: 'extracting',
            claim: extraction.claim,
            keywords: extraction.keywords,
            searchQueries: extraction.searchQueries,
        });

        if (provider && model) {
            try {
                const extractionPrompt = `
Analyze the following claim for a credibility check.
Return JSON only with this shape:
{
  "claim": "string",
  "normalizedClaim": "string",
  "language": "zh or en",
  "keywords": ["up to 6 concise terms"],
  "entities": ["up to 6 entities"],
  "searchQueries": ["up to 4 verification-friendly search queries"]
}

Rules:
- Keep the same language as the claim.
- Focus on verifiable nouns, names, dates, products, events, organizations, and places.
- Do not add commentary outside JSON.

Claim:
${claimText}
                `.trim();

                const rawExtraction = await callLLM(provider, model, ollamaUrl, extractionPrompt, neutralConfig);
                const parsedExtraction = parseLooseJsonObject(rawExtraction, {});

                extraction = {
                    ...fallbackExtraction,
                    ...parsedExtraction,
                    claim: String(parsedExtraction.claim || fallbackExtraction.claim || claimText).trim(),
                    normalizedClaim: String(parsedExtraction.normalizedClaim || parsedExtraction.claim || fallbackExtraction.claim || claimText).trim(),
                    language: String(parsedExtraction.language || fallbackExtraction.language || detectLanguage(claimText)).toLowerCase().startsWith('zh') ? 'zh' : 'en',
                    keywords: uniqueTrimmedList([
                        ...(Array.isArray(parsedExtraction.keywords) ? parsedExtraction.keywords : []),
                        ...(Array.isArray(parsedExtraction.entities) ? parsedExtraction.entities : []),
                        ...fallbackExtraction.keywords,
                    ], 6),
                    entities: uniqueTrimmedList([
                        ...(Array.isArray(parsedExtraction.entities) ? parsedExtraction.entities : []),
                        ...(Array.isArray(parsedExtraction.keywords) ? parsedExtraction.keywords : []),
                    ], 6),
                    searchQueries: uniqueTrimmedList([
                        ...(Array.isArray(parsedExtraction.searchQueries) ? parsedExtraction.searchQueries : []),
                        ...fallbackExtraction.searchQueries,
                    ], 4),
                };
            } catch (error) {
                console.warn('[Credibility] Keyword extraction fallback:', error.message);
            }
        }

        const language = extraction.language || detectLanguage(extraction.claim || claimText);
        const searchQueries = buildVerificationQueries(extraction);
        const availableEngines = getAvailableSearchEngines(runtimeConfig);
        const maxSearchEngines = Math.min(3, Math.max(1, availableEngines.length));

        sendUpdate({
            status: 'running',
            progress: 24,
            currentStage: 'searching',
            claim: extraction.claim,
            keywords: extraction.keywords,
            searchQueries,
            sourceStats: {
                engines: availableEngines.slice(0, maxSearchEngines),
                engineCount: Math.min(availableEngines.length, maxSearchEngines),
            },
        });

        const searchSettled = await Promise.allSettled(
            searchQueries.map((query) => searchAcrossEngines(query, {
                config: runtimeConfig,
                engines: availableEngines,
                maxEngines: maxSearchEngines,
                limitPerEngine: 3,
            }))
        );

        if (aborted) return;

        const rawSearchResults = searchSettled.flatMap((result) => (
            result.status === 'fulfilled' ? result.value : []
        ));
        const mergedResults = mergeRankedSearchResults(rawSearchResults);
        const topSources = mergedResults
            .map((source) => ({
                ...source,
                selectionScore: (
                    (source.engineCount || 0) * 18
                    + (source.authorityScore || 0) * 0.7
                    + Math.min((source.queries || []).length * 5, 15)
                    + Math.min(Math.floor((source.content || '').length / 80), 12)
                ),
            }))
            .sort((left, right) => right.selectionScore - left.selectionScore)
            .slice(0, 4);

        const baseStats = {
            engineCount: new Set(rawSearchResults.map((item) => item.engine).filter(Boolean)).size,
            engines: uniqueTrimmedList(rawSearchResults.map((item) => item.engine), 6),
            resultCount: rawSearchResults.length,
            uniqueDomains: new Set(mergedResults.map((item) => item.domain).filter(Boolean)).size,
            selectedSourceCount: topSources.length,
        };

        if (topSources.length === 0) {
            const sentiment = analyzeEmotionalSignals(claimText);
            const verdict = 'unverified';
            const verdictLabel = getVerdictLabel(verdict, language);
            const payload = {
                status: 'completed',
                progress: 100,
                currentStage: 'completed',
                claim: extraction.claim || claimText,
                normalizedClaim: extraction.normalizedClaim || claimText,
                language,
                keywords: extraction.keywords || [],
                searchQueries,
                sentiment,
                score: 34,
                verdict,
                verdictLabel,
                metrics: {
                    evidenceScore: 22,
                    authorityScore: 20,
                    diversityScore: 10,
                    consistencyScore: 0,
                    emotionScore: Math.max(0, 100 - Math.round(sentiment.emotionality || 0)),
                },
                sourceStats: {
                    ...baseStats,
                    authoritativeSourceCount: 0,
                    multiEngineHits: 0,
                    supportCount: 0,
                    contradictCount: 0,
                    mixedCount: 0,
                },
                findings: [
                    pickVerificationText(
                        language,
                        '没有检索到足够的公开证据，当前更适合判定为“暂未证实”。',
                        'Not enough public evidence was found, so the safest verdict is currently "unverified".'
                    ),
                ],
                risks: [
                    pickVerificationText(
                        language,
                        '搜索结果不足时，任何高确定性结论都不可靠。',
                        'When search coverage is thin, any high-confidence conclusion is unreliable.'
                    ),
                ],
                summary: pickVerificationText(
                    language,
                    '当前公开检索证据不足，建议补充更具体的主体、时间、地点或原始出处后再查证。',
                    'Public search coverage is currently too thin. Try again with a more specific subject, time, place, or original source.'
                ),
                sources: [],
                updatedAt: new Date().toISOString(),
            };

            sendUpdate(payload);
            await persistFinalCredibilityMessage(payload.summary, payload);
            res.write(`data: ${JSON.stringify({ text: payload.summary })}\n\n`);
            res.write('data: [DONE]\n\n');
            return;
        }

        sendUpdate({
            status: 'running',
            progress: 52,
            currentStage: 'reading',
            claim: extraction.claim,
            keywords: extraction.keywords,
            searchQueries,
            sourceStats: baseStats,
            sources: topSources.map((source) => ({
                sourceId: source.id,
                title: source.title,
                url: source.url,
                domain: source.domain,
                engines: source.engines,
            })),
        });

        for (const source of topSources) {
            if (aborted) return;
            try {
                const crawledText = await crawlUrl(source.url);
                source.crawledText = String(crawledText || '').trim().slice(0, 3200);
            } catch (error) {
                source.crawledText = '';
            }
            source.excerpt = pickExcerpt(source.crawledText || source.content || '', extraction.keywords || []);
        }

        sendUpdate({
            status: 'running',
            progress: 76,
            currentStage: 'scoring',
            claim: extraction.claim,
            keywords: extraction.keywords,
            searchQueries,
            sourceStats: baseStats,
        });

        let modelAnalysis = {};
        if (provider && model) {
            try {
                const evidencePayload = topSources.map((source, index) => ({
                    sourceId: `S${index + 1}`,
                    title: source.title,
                    url: source.url,
                    domain: source.domain,
                    engines: source.engines,
                    authorityScore: source.authorityScore,
                    snippet: source.content,
                    excerpt: source.excerpt,
                }));

                const analysisPrompt = `
You are evaluating the truthfulness of a claim using web evidence.
Use only the supplied evidence. Return JSON only:
{
  "summary": "2-4 sentence verdict in the same language as the claim",
  "findings": ["up to 4 short findings"],
  "risks": ["up to 3 short cautions"],
  "sourceAssessments": [
    {
      "sourceId": "S1",
      "stance": "support | contradict | mixed | unclear",
      "relevance": 0.0,
      "confidence": 0.0,
      "reason": "1 short sentence"
    }
  ]
}

Rules:
- Use the same language as the claim.
- "support" means the source directly supports the claim.
- "contradict" means the source directly refutes or undermines the claim.
- "mixed" means the source supports only part of the claim.
- "unclear" means the source is background only.
- Do not invent missing facts.

Claim:
${extraction.claim || claimText}

Evidence:
${JSON.stringify(evidencePayload, null, 2)}
                `.trim();

                modelAnalysis = parseLooseJsonObject(
                    await callLLM(provider, model, ollamaUrl, analysisPrompt, neutralConfig),
                    {}
                );
            } catch (error) {
                console.warn('[Credibility] Evidence synthesis fallback:', error.message);
            }
        }

        const assessmentMap = new Map();
        for (const item of Array.isArray(modelAnalysis.sourceAssessments) ? modelAnalysis.sourceAssessments : []) {
            const sourceId = String(item?.sourceId || '').trim();
            if (!sourceId) continue;
            assessmentMap.set(sourceId, item);
        }

        const sources = topSources.map((source, index) => {
            const sourceId = `S${index + 1}`;
            const rawAssessment = assessmentMap.get(sourceId) || {};
            const fallbackAssessment = fallbackSourceAssessment(source, extraction.keywords || [], language);
            const stance = normalizeCredibilityStance(rawAssessment.stance || fallbackAssessment.stance);
            const relevance = Math.min(1, Math.max(0, Number(rawAssessment.relevance)));
            const confidence = Math.min(1, Math.max(0, Number(rawAssessment.confidence)));

            return {
                sourceId,
                title: source.title,
                url: source.url,
                domain: source.domain,
                engines: source.engines,
                engineCount: source.engineCount,
                authorityScore: source.authorityScore,
                stance,
                relevance: Number.isFinite(relevance) && relevance > 0 ? relevance : fallbackAssessment.relevance,
                confidence: Number.isFinite(confidence) && confidence > 0 ? confidence : fallbackAssessment.confidence,
                reason: String(rawAssessment.reason || fallbackAssessment.reason || '').trim(),
                excerpt: source.excerpt || pickExcerpt(source.content || '', extraction.keywords || []),
            };
        });

        const weightedTotals = sources.reduce((totals, source) => {
            const weight = roundValue(
                (((source.relevance || 0.35) * 0.6) + ((source.confidence || 0.4) * 0.4))
                    * (0.76 + Math.min((source.engineCount || 0) * 0.08, 0.2)),
                3
            );

            if (source.stance === 'support') totals.support += weight;
            else if (source.stance === 'contradict') totals.contradict += weight;
            else if (source.stance === 'mixed') totals.mixed += weight;
            else totals.unclear += weight;

            return totals;
        }, { support: 0, contradict: 0, mixed: 0, unclear: 0 });

        const sentiment = analyzeEmotionalSignals(claimText);
        const uniqueDomains = new Set(sources.map((item) => item.domain).filter(Boolean)).size;
        const uniqueEngines = new Set(sources.flatMap((item) => item.engines || []).filter(Boolean)).size;
        const authoritativeSourceCount = sources.filter((item) => (item.authorityScore || 0) >= 80).length;
        const averageAuthority = sources.length > 0
            ? sources.reduce((sum, item) => sum + (item.authorityScore || 0), 0) / sources.length
            : 0;
        const multiEngineHits = sources.filter((item) => (item.engineCount || 0) > 1).length;
        const scoring = computeCredibilitySignals({
            weightedSupport: weightedTotals.support,
            weightedContradict: weightedTotals.contradict,
            weightedMixed: weightedTotals.mixed,
            sourceCount: sources.length,
            uniqueDomains,
            uniqueEngines,
            averageAuthority,
            emotionality: sentiment.emotionality || 0,
            multiEngineHits,
            authoritativeSourceCount,
        });

        const verdictLabel = getVerdictLabel(scoring.verdict, language);
        const findings = uniqueTrimmedList(modelAnalysis.findings, 4);
        const risks = uniqueTrimmedList(modelAnalysis.risks, 3);
        const sourceStats = {
            ...baseStats,
            engineCount: uniqueEngines,
            engines: uniqueTrimmedList(sources.flatMap((item) => item.engines || []), 6),
            uniqueDomains,
            authoritativeSourceCount,
            multiEngineHits,
            supportCount: roundValue(weightedTotals.support),
            contradictCount: roundValue(weightedTotals.contradict),
            mixedCount: roundValue(weightedTotals.mixed),
            unclearCount: roundValue(weightedTotals.unclear),
        };

        const summary = String(modelAnalysis.summary || '').trim() || buildFallbackCredibilitySummary({
            language,
            verdictLabel,
            score: scoring.score,
            sourceStats,
            sentiment,
        });

        const payload = {
            status: 'completed',
            progress: 100,
            currentStage: 'completed',
            claim: extraction.claim || claimText,
            normalizedClaim: extraction.normalizedClaim || extraction.claim || claimText,
            language,
            keywords: extraction.keywords || [],
            searchQueries,
            sentiment,
            score: scoring.score,
            verdict: scoring.verdict,
            verdictLabel,
            metrics: scoring.metrics,
            sourceStats,
            summary,
            findings: findings.length > 0 ? findings : [
                pickVerificationText(
                    language,
                    '系统已结合来源权威度、证据倾向、多引擎覆盖和情绪化风险完成评分。',
                    'The score combines source authority, evidence direction, multi-engine coverage, and emotional-risk signals.'
                ),
            ],
            risks: risks.length > 0 ? risks : [
                pickVerificationText(
                    language,
                    '请优先查看原始出处或官方通报，不要只依据单个平台截图判断。',
                    'Prioritize original sources or official statements instead of relying on a single repost or screenshot.'
                ),
            ],
            sources: sources.map((source) => ({
                ...source,
                relevance: roundValue(source.relevance),
                confidence: roundValue(source.confidence),
            })),
            updatedAt: new Date().toISOString(),
        };

        sendUpdate(payload);
        await persistFinalCredibilityMessage(summary, payload);
        res.write(`data: ${JSON.stringify({ text: summary })}\n\n`);
        res.write('data: [DONE]\n\n');
    } catch (error) {
        console.error('Credibility Check Error:', error);
        const errorPayload = {
            status: 'error',
            progress: 100,
            currentStage: 'error',
            error: error.message,
        };
        sendUpdate(errorPayload);
        const errorText = pickVerificationText(
            detectLanguage(message || ''),
            `真假核验失败：${error.message}`,
            `Credibility check failed: ${error.message}`
        );
        await persistFinalCredibilityMessage(errorText, {
            ...errorPayload,
            summary: errorText,
        });
        res.write(`data: ${JSON.stringify({
            text: pickVerificationText(
                detectLanguage(message || ''),
                `真假核验失败：${error.message}`,
                `Credibility check failed: ${error.message}`
            ),
        })}\n\n`);
        res.write('data: [DONE]\n\n');
    }
}

function normalizeStringArray(value, limit = 6, fallback = []) {
    const values = Array.isArray(value)
        ? value
        : (typeof value === 'string' ? value.split(/[,，、\n]+/) : []);
    const normalized = uniqueTrimmedList(values, limit);
    return normalized.length > 0 ? normalized : fallback;
}

function toChineseStoryFlavorSignal(value = '') {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    if (/[\u3400-\u9fff]/.test(text)) return text.slice(0, 8);

    const lower = text.toLowerCase();
    const dictionary = [
        [/nostalgia|remember|memory|childhood|home|old/, '怀旧'],
        [/tension|nervous|afraid|anxious|tight|uneasy/, '紧张'],
        [/tender|tenderness|soft|gentle|care|comfort/, '温柔'],
        [/absurd|strange|weird|funny|surreal/, '荒诞'],
        [/tired|exhausted|sleepy|fatigue/, '疲惫'],
        [/flutter|crush|heartbeat|love|blush/, '心动'],
        [/solitude|lonely|alone|quiet/, '孤独'],
        [/courage|brave|decide|change|begin/, '勇气'],
        [/rain|aftertaste|afterglow|lingering/, '余温'],
        [/bright|light|spark|clear/, '明亮'],
    ];
    const hit = dictionary.find(([pattern]) => pattern.test(lower));
    if (hit) return hit[1];
    return text.replace(/[-_]+/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).join(' ').slice(0, 12);
}

function normalizeFlavorSignalArray(value, limit = 6, fallback = []) {
    const values = Array.isArray(value)
        ? value.map(item => {
            if (typeof item === 'string') return item;
            if (!item || typeof item !== 'object') return '';
            return item.label || item.name || item.flavor || item.emotion || item.text || '';
        })
        : (typeof value === 'string' ? value.split(/[,，、\n]+/) : []);
    const normalized = uniqueTrimmedList(values.map(toChineseStoryFlavorSignal), limit);
    return normalized.length > 0 ? normalized : fallback;
}

function normalizeStoryGlassMode(value = '') {
    const normalized = String(value || '').trim().toLowerCase();

    if ([
        'night-bar',
        'night',
        'bar',
        'cocktail',
        'midnight',
        'city-night',
    ].includes(normalized)) {
        return 'night-bar';
    }

    if ([
        'comfort-home',
        'home',
        'comfort',
        'cozy',
        'house',
        'soft-home',
    ].includes(normalized)) {
        return 'comfort-home';
    }

    if ([
        'zero-proof',
        'zero proof',
        'mocktail',
        'non-alcoholic',
        'nonalcoholic',
        'alcohol-free',
        'no-alcohol',
    ].includes(normalized)) {
        return 'zero-proof';
    }

    return '';
}

function getStoryGlassModeLabel(mode = 'comfort-home', language = 'en') {
    switch (mode) {
        case 'night-bar':
            return pickVerificationText(language, '夜幕酒馆版', 'Night Bar');
        case 'zero-proof':
            return pickVerificationText(language, '无酒精灵感版', 'Zero Proof');
        default:
            return pickVerificationText(language, '居家轻饮版', 'Comfort Home');
    }
}

function normalizeStoryGlassPreferences(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const preferredMode = normalizeStoryGlassMode(source.mode || source.recipeMode || source.preferredMode) || 'auto';
    const intensity = ['light', 'medium', 'deep'].includes(String(source.intensity || '').trim().toLowerCase())
        ? String(source.intensity).trim().toLowerCase()
        : 'medium';
    const realism = ['home', 'bar', 'visual'].includes(String(source.realism || source.recipeRealism || '').trim().toLowerCase())
        ? String(source.realism || source.recipeRealism).trim().toLowerCase()
        : 'home';

    return {
        mode: preferredMode,
        intensity,
        realism,
        remixAction: String(source.remixAction || '').trim().slice(0, 80),
        remixInstruction: String(source.remixInstruction || source.instruction || '').trim().slice(0, 240),
        previousCocktailName: String(source.previousCocktailName || '').trim().slice(0, 80),
    };
}

function getStoryGlassListenStats(text = '', turns = []) {
    const normalized = String(text || '').trim();
    const cjkChars = (normalized.match(/[\u3400-\u9fff]/g) || []).length;
    const latinWords = (normalized.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g) || []).length;
    const storyUnits = cjkChars + latinWords * 2.1;
    const sentenceCount = Math.max(
        (normalized.match(/[。！？!?]+|\.(?:\s|$)/g) || []).length,
        normalized.split(/\n+/).map(item => item.trim()).filter(Boolean).length
    );
    const userTurns = Array.isArray(turns)
        ? turns.filter(turn => String(turn?.role || '').toLowerCase() === 'user').length
        : 0;

    return {
        cjkChars,
        latinWords,
        sentenceCount,
        storyUnits,
        userTurns,
    };
}

function buildStoryGlassListenFlavorSignals(text = '', language = 'en', limit = 4) {
    const normalizedLanguage = String(language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
    const source = String(text || '');
    const library = normalizedLanguage === 'zh'
        ? [
            { pattern: /小时候|以前|曾经|回忆|怀念|老家|过去/i, label: '怀旧' },
            { pattern: /喜欢|心动|脸红|暧昧|恋爱/i, label: '心动' },
            { pattern: /累|疲惫|困|熬夜|撑不住/i, label: '疲惫' },
            { pattern: /害怕|紧张|焦虑|担心|突然/i, label: '紧张' },
            { pattern: /开心|笑|哈哈|快乐|高兴/i, label: '明亮' },
            { pattern: /难过|哭|委屈|孤独|一个人/i, label: '孤独' },
            { pattern: /勇敢|决定|离开|开始|改变/i, label: '勇气' },
            { pattern: /奇怪|离谱|荒诞|搞笑/i, label: '荒诞' },
        ]
        : [
            { pattern: /nostalgia|remember|used to|childhood|home/i, label: 'nostalgia' },
            { pattern: /love|crush|heartbeat|blush/i, label: 'flutter' },
            { pattern: /tired|exhausted|sleepy|late night/i, label: 'tired light' },
            { pattern: /nervous|afraid|anxious|suddenly/i, label: 'tension' },
            { pattern: /happy|laugh|smile|bright/i, label: 'bright lift' },
            { pattern: /sad|cry|lonely|alone/i, label: 'solitude' },
            { pattern: /brave|decide|change|leave|begin/i, label: 'courage' },
            { pattern: /weird|absurd|funny|strange/i, label: 'strange spark' },
        ];

    const matches = library
        .filter(item => item.pattern.test(source))
        .map(item => item.label);
    return [...new Set(matches.map(toChineseStoryFlavorSignal).filter(Boolean))].slice(0, limit);
}

function buildStoryGlassListenFallback({ storyText = '', turnText = '', turns = [], language = detectLanguage(storyText || turnText) } = {}) {
    const normalizedLanguage = String(language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
    const stats = getStoryGlassListenStats(storyText, turns);
    const hasEnoughStory = stats.storyUnits >= 96 && stats.sentenceCount >= 2 && stats.userTurns >= 2;
    const hasStrongSingleTurn = stats.storyUnits >= 150 && stats.sentenceCount >= 3;
    const shouldMix = hasEnoughStory || hasStrongSingleTurn;
    const hasEmergingShape = stats.storyUnits >= 58 || stats.sentenceCount >= 2 || stats.userTurns >= 2;
    const mood = shouldMix ? 'ready-to-mix' : hasEmergingShape ? 'touched-holding' : 'listening';
    const latest = String(turnText || storyText || '').replace(/\s+/g, ' ').trim();
    const excerpt = latest.length > 68 ? `${latest.slice(0, 68)}...` : latest;
    const flavorSignals = buildStoryGlassListenFlavorSignals(`${storyText}\n${turnText}`, normalizedLanguage, shouldMix ? 6 : 4);

    if (normalizedLanguage === 'zh') {
        return {
            reply: shouldMix
                ? '嗯，这段故事已经有杯口了。它不只是一个片段，里面有起伏、有余温，我想给你调一杯。'
                : (excerpt
                    ? `我听见了，尤其是「${excerpt}」这里有一点味道。不过我还想再听一点，再让它沉一会儿。`
                    : '我在听，慢慢讲。等它不只是一个句子，而像一段真的故事时，我再给你一杯。'),
            shouldMix,
            reason: shouldMix ? '故事已经形成了足够清楚的情绪线。' : '故事线索还偏少，先继续听。',
            mood,
            confidence: shouldMix ? 0.74 : hasEmergingShape ? 0.63 : 0.58,
            flavorSignals,
            fallbackSignals: true,
        };
    }

    return {
        reply: shouldMix
            ? 'Mm. This has enough shape now: not just a line, but a little arc with aftertaste. I want to mix this one for you.'
            : (excerpt
                ? `I heard that, especially "${excerpt}". It has a little flavor already, but I want to hear a bit more before I pour.`
                : 'I am listening. Let it become more than a sentence, and I will know when to pour.'),
        shouldMix,
        reason: shouldMix ? 'The story has a clear enough emotional line.' : 'The story still needs more shape.',
        mood,
        confidence: shouldMix ? 0.74 : hasEmergingShape ? 0.63 : 0.58,
        flavorSignals,
        fallbackSignals: true,
    };
}

function normalizeStoryGlassListenDecision(raw = {}, fallback = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const reply = String(source.reply || source.sakiReply || source.response || fallback.reply || '').trim();
    const reason = String(source.reason || source.why || fallback.reason || '').trim();
    const mood = String(source.mood || source.stage || fallback.mood || '').trim();
    const confidence = Number(source.confidence ?? fallback.confidence ?? 0.5);
    const flavorSignals = normalizeFlavorSignalArray(
        source.flavorSignals || source.storyFlavors || source.flavors,
        6,
        []
    );

    return {
        reply: reply || fallback.reply || '',
        shouldMix: Boolean(source.shouldMix ?? source.mix ?? source.readyToMix ?? fallback.shouldMix),
        reason,
        mood,
        confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
        flavorSignals,
        fallbackSignals: Boolean(source.fallbackSignals && flavorSignals.length > 0),
    };
}

function getStoryGlassPreferencePrompt(preferences = {}, language = 'en') {
    const normalized = normalizeStoryGlassPreferences(preferences);
    const modeLabel = normalized.mode === 'auto'
        ? pickVerificationText(language, '自动判断', 'auto')
        : getStoryGlassModeLabel(normalized.mode, language);
    const intensityLabel = {
        light: pickVerificationText(language, '轻一点，少一点情绪重量', 'lighter and less emotionally heavy'),
        medium: pickVerificationText(language, '中等浓度，温柔但清楚', 'balanced, warm, and clear'),
        deep: pickVerificationText(language, '浓一点，更有余韵和戏剧感', 'deeper, more lingering and dramatic'),
    }[normalized.intensity];
    const realismLabel = {
        home: pickVerificationText(language, '家里能做，常见材料优先', 'home-friendly with common ingredients'),
        bar: pickVerificationText(language, '酒吧感，更精致的调酒结构', 'bar-style with a more crafted cocktail structure'),
        visual: pickVerificationText(language, '海报感，视觉和命名可以更有想象力', 'poster-like, with more imaginative naming and visuals'),
    }[normalized.realism];

    return [
        `Preferred mode: ${modeLabel}`,
        `Emotional intensity: ${intensityLabel}`,
        `Recipe realism: ${realismLabel}`,
        normalized.remixInstruction ? `Remix instruction: ${normalized.remixInstruction}` : '',
        normalized.previousCocktailName ? `Previous drink name: ${normalized.previousCocktailName}` : '',
    ].filter(Boolean).join('\n');
}

function chooseStoryGlassMode(message = '', language = 'en', preferences = {}) {
    const preferredMode = normalizeStoryGlassMode(
        preferences?.mode || preferences?.recipeMode || preferences?.preferredMode || ''
    );
    if (preferredMode) return preferredMode;

    const normalized = String(message || '').toLowerCase();

    if (/(无酒精|不喝酒|清醒|开车|上班|zero[- ]?proof|mocktail|non[- ]?alcoholic|alcohol[- ]?free|drive|workday)/i.test(normalized)) {
        return 'zero-proof';
    }

    if (/(深夜|凌晨|夜里|雨夜|酒吧|微醺|灯光|城市夜色|midnight|late night|bar|whiskey|neon|rainy night)/i.test(normalized)) {
        return 'night-bar';
    }

    if (/(房间|家里|窗边|便利店|沙发|牛奶|汽水|早餐|午后|home|room|sofa|milk|soda|tea|morning|afternoon|convenience)/i.test(normalized)) {
        return 'comfort-home';
    }

    const seed = parseInt(crypto.createHash('sha1').update(`${language}:${message}`).digest('hex').slice(0, 8), 16) || 0;
    return ['night-bar', 'comfort-home', 'zero-proof'][seed % 3];
}

function shortenStoryExcerpt(value = '', limit = 28) {
    const compact = String(value || '').replace(/\s+/g, ' ').trim();
    if (!compact) return '';
    return compact.length > limit ? `${compact.slice(0, limit)}…` : compact;
}

function buildStoryGlassEmotionFlavorMap(message = '', language = 'en', recipeMode = 'comfort-home') {
    const normalizedLanguage = String(language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
    const text = String(message || '').toLowerCase();

    const zhCandidates = [
        {
            match: /(想念|怀念|舍不得|没说完|重逢|心动)/,
            emotion: '想念',
            flavor: '柑橘余温',
            reason: '用一点明亮的酸甜接住没说完的话。',
        },
        {
            match: /(累|疲惫|辛苦|压力|崩溃|撑着)/,
            emotion: '疲惫',
            flavor: '蜂蜜茶感',
            reason: '先把口感放软，让紧绷慢慢落下来。',
        },
        {
            match: /(夜|雨|失眠|凌晨|灯光|酒吧|城市)/,
            emotion: '夜色',
            flavor: '微苦草本',
            reason: '保留一点安静回声，让故事不必马上结束。',
        },
        {
            match: /(开心|幸运|晴|自由|轻松|释然)/,
            emotion: '松弛',
            flavor: '气泡果香',
            reason: '把轻快感做成入口时先亮起来的部分。',
        },
        {
            match: /(犹豫|纠结|不确定|克制|忍住)/,
            emotion: '迟疑',
            flavor: '轻微苦感',
            reason: '给心事留一点边界，也留一点回甘。',
        },
    ];
    const enCandidates = [
        {
            match: /(miss|missing|nostalgia|unfinished|almost|heart)/,
            emotion: 'longing',
            flavor: 'warm citrus',
            reason: 'A bright edge carries the words that never quite landed.',
        },
        {
            match: /(tired|exhausted|pressure|heavy|burned out|stress)/,
            emotion: 'fatigue',
            flavor: 'honeyed tea',
            reason: 'Soft sweetness lowers the shoulders before the finish arrives.',
        },
        {
            match: /(night|rain|insomnia|midnight|lights|bar|city)/,
            emotion: 'night mood',
            flavor: 'gentle herbal bitterness',
            reason: 'A quieter bitter line keeps the story glowing after dark.',
        },
        {
            match: /(happy|lucky|sunny|free|relief|light)/,
            emotion: 'relief',
            flavor: 'sparkling fruit',
            reason: 'Bubbles turn the lightness into the first thing you taste.',
        },
        {
            match: /(unsure|hesitate|held back|restraint|confused)/,
            emotion: 'hesitation',
            flavor: 'soft bitterness',
            reason: 'A small bitter note gives the feeling shape without hardening it.',
        },
    ];

    const defaults = normalizedLanguage === 'zh'
        ? {
            'night-bar': [
                { emotion: '克制', flavor: '微苦柑橘', reason: '让故事有夜晚的亮度，也有收住的余韵。' },
                { emotion: '余温', flavor: '花香回甘', reason: '把回头看的那一下调得更柔软。' },
                { emotion: '安静', flavor: '低气泡感', reason: '让情绪慢一点落杯，不急着给答案。' },
            ],
            'zero-proof': [
                { emotion: '清醒', flavor: '青柠气泡', reason: '把情绪提亮，但不让它变重。' },
                { emotion: '复位', flavor: '黄瓜草本', reason: '让口感更透气，像重新整理呼吸。' },
                { emotion: '温柔', flavor: '轻蜂蜜感', reason: '保留安慰感，但不靠酒精。' },
            ],
            'comfort-home': [
                { emotion: '疲惫', flavor: '蜂蜜乌龙', reason: '让日常的毛边先被温柔接住。' },
                { emotion: '柔软', flavor: '白桃气泡', reason: '把一点回甜放在入口后面慢慢亮起。' },
                { emotion: '安定', flavor: '淡茶尾韵', reason: '让整杯更像写给自己的小回信。' },
            ],
        }
        : {
            'night-bar': [
                { emotion: 'restraint', flavor: 'bittersweet citrus', reason: 'It keeps the story bright while letting the finish stay unsaid.' },
                { emotion: 'afterglow', flavor: 'soft florals', reason: 'The gentler middle carries the warmth after the first sip.' },
                { emotion: 'quiet', flavor: 'low sparkle', reason: 'It lets the feeling settle without forcing an answer.' },
            ],
            'zero-proof': [
                { emotion: 'clarity', flavor: 'lime bubbles', reason: 'Brightness lifts the mood without making it heavier.' },
                { emotion: 'reset', flavor: 'cucumber herbs', reason: 'The cleaner texture gives the breath more room.' },
                { emotion: 'care', flavor: 'light honey', reason: 'It keeps comfort present without leaning on alcohol.' },
            ],
            'comfort-home': [
                { emotion: 'tiredness', flavor: 'honeyed oolong', reason: 'The softer body catches the rough edge of the day.' },
                { emotion: 'tenderness', flavor: 'white peach bubbles', reason: 'A small sweetness glows after the first sip.' },
                { emotion: 'settling', flavor: 'tea finish', reason: 'The finish feels like a quiet note back to yourself.' },
            ],
        };

    const candidates = normalizedLanguage === 'zh' ? zhCandidates : enCandidates;
    const matched = candidates
        .filter(item => item.match.test(text))
        .map(({ emotion, flavor, reason }) => ({ emotion, flavor, reason }));
    const fallback = defaults[recipeMode] || defaults['comfort-home'];
    const merged = [...matched, ...fallback];
    const seen = new Set();

    return merged.filter((item) => {
        const key = `${item.emotion}:${item.flavor}`.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).slice(0, 4);
}

function normalizeEmotionFlavorMap(value, limit = 4, fallback = []) {
    const source = Array.isArray(value) ? value : [];
    const normalized = source
        .map((item) => {
            if (typeof item === 'string') {
                const [emotion = '', flavor = '', reason = ''] = item.split(/\s*(?:->|→|:|：|-)\s*/);
                return {
                    emotion: String(emotion || '').trim(),
                    flavor: String(flavor || '').trim(),
                    reason: String(reason || '').trim(),
                };
            }

            if (!item || typeof item !== 'object') return null;
            return {
                emotion: String(item.emotion || item.mood || item.signal || '').trim(),
                flavor: String(item.flavor || item.note || item.drinkCue || '').trim(),
                reason: String(item.reason || item.explanation || item.why || '').trim(),
            };
        })
        .filter(item => item?.emotion && item?.flavor)
        .slice(0, limit);

    return normalized.length > 0 ? normalized : fallback;
}

function buildStoryGlassFallback(message = '', language = detectLanguage(message), preferences = {}) {
    const normalizedLanguage = String(language || detectLanguage(message)).toLowerCase().startsWith('zh') ? 'zh' : 'en';
    const normalizedPreferences = normalizeStoryGlassPreferences(preferences);
    const recipeMode = chooseStoryGlassMode(message, normalizedLanguage, normalizedPreferences);
    const recipeModeLabel = getStoryGlassModeLabel(recipeMode, normalizedLanguage);
    const seed = parseInt(crypto.createHash('sha1').update(String(message || 'story-glass')).digest('hex').slice(0, 8), 16) || 0;
    const pick = (items = [], offset = 0) => items[(seed + offset) % items.length];
    const excerpt = shortenStoryExcerpt(message, normalizedLanguage === 'zh' ? 18 : 32);

    if (normalizedLanguage === 'zh') {
        const libraries = {
            'night-bar': {
                names: ['雨夜余温', '半城回甘', '灯下重逢', '晚风迟一点', '雾里回声', '夜航纸条'],
                namesEn: ['Rain Aftertaste', 'Half-City Echo', 'Under The Lamp', 'Late Breeze', 'Misty Reply', 'Night Flight Note'],
                subtitles: ['把克制、回头和心动一起摇进杯里', '留给夜色的一小段温柔回响', '适合在灯光低一点的时候慢慢喝完'],
                flavors: ['前段是柑橘与微苦，中段铺开柔软花香，尾韵把情绪轻轻收住。', '入口先亮一下，再转成更安静的草本回甘，像话没说尽却已经懂了。', '酒体不重，线条很干净，留下一点夜风和一点余温。'],
                notes: ['柑橘亮度', '花香余温', '微苦回甘', '丝绒酒体'],
                recipes: ['金酒 30ml', '葡萄柚汁 20ml', '接骨木糖浆 10ml', '气泡水 60ml', '冰块 适量'],
                pairings: ['海盐薯条', '轻芝士蛋糕', '烤杏仁', '柠檬奶油曲奇'],
                glassware: ['高球杯', 'Nick & Nora 杯', '细口鸡尾酒杯'],
                garnish: ['柚皮', '迷迭香', '柠檬皮雾'],
                moments: ['适合把窗外夜色看久一点的时候慢慢喝。', '适合在消息发出去之后，留给自己一点回甘。', '适合一边听歌一边把心事放轻一点。'],
                tags: ['克制', '心动', '回甘', '夜色', '想念', '余温'],
                comments: ['这段故事像把夜色和余温一起摇进杯里，所以我给它留了一个更轻、更有回声的收尾。', '它不需要很烈，反而更适合用一点亮、一点苦、一点慢慢回来的甜来承接你这段情绪。'],
                quotes: ['今晚的风替你把没说完的话留住了。', '这杯会比答案先一步让人安静下来。', '有些心事，适合在灯光低一点的时候入口。'],
            },
            'comfort-home': {
                names: ['窗边汽水', '晚安便利店', '柔光回信', '小半杯晴天', '沙发旁的风', '慢一点也没关系'],
                namesEn: ['Window Soda', 'Goodnight Store', 'Soft Reply', 'Half A Sunny Day', 'Breeze By The Sofa', 'Take It Slow'],
                subtitles: ['像把日常里那点温柔调得更顺口一些', '不必很正式，也能刚好安慰到人', '给日常留下一点会发光的甜味'],
                flavors: ['汽泡感很轻，果香和茶感衔接得很顺，像一口就把情绪安放好。', '入口柔和，尾韵带一点奶香和清甜，适合慢慢把人从紧绷里放出来。', '整体偏清亮，没有攻击性，像把日常的一小块阴天拧成了暖光。'],
                notes: ['清甜', '轻泡感', '茶香', '柔和尾韵'],
                recipes: ['乌龙茶 80ml', '白桃气泡水 90ml', '蜂蜜 8ml', '柠檬汁 10ml', '冰块 适量'],
                pairings: ['原味薯片', '黄油吐司', '草莓蛋糕卷', '奶油苏打饼'],
                glassware: ['透明直杯', '圆口玻璃杯', '家用高杯'],
                garnish: ['薄荷叶', '白桃片', '柠檬片'],
                moments: ['适合窝在沙发上，把一天里的毛边慢慢抚平。', '适合在窗边发呆，顺手给自己一点回甜。', '适合想认真照顾自己一下的时候。'],
                tags: ['治愈', '日常', '柔软', '回甜', '安静', '慢慢来'],
                comments: ['你的故事更适合被调成一杯不需要防备的轻饮，所以我让它保留了日常感和一点回甜。', '它像一封写给自己的小回信，不大声，但会在入口之后慢慢亮起来。'],
                quotes: ['今天的辛苦，值得被一口更柔软的甜接住。', '这杯不急着回答，只想先让你缓一缓。', '有些温柔，不必隆重，也足够让人松下来。'],
            },
            'zero-proof': {
                names: ['清醒月光', '薄荷晴讯', '白昼回声', '轻云配方', '柠檬留白', '风从肩上落下'],
                namesEn: ['Clear Moonlight', 'Mint Weather', 'Daylight Echo', 'Soft Cloud Formula', 'Lemon Margin', 'Wind Off The Shoulders'],
                subtitles: ['不靠酒精，也能把情绪调得很有层次', '给需要清醒的时候一杯有光泽的安慰', '更轻、更透、更适合留给自己'],
                flavors: ['清爽的酸甜先打开味觉，随后是草本和气泡把整段情绪提亮。', '前段偏明净，中段有果香，尾韵保持很轻的呼吸感，不会压人。', '结构干净、明亮，不靠酒精，也能留下一段完整的情绪余韵。'],
                notes: ['清亮酸甜', '草本呼吸感', '气泡提神', '干净余韵'],
                recipes: ['气泡水 120ml', '青柠汁 15ml', '黄瓜汁 20ml', '蜂蜜 8ml', '薄荷叶 适量'],
                pairings: ['青提', '海盐苏打饼', '酸奶冻', '水果塔'],
                glassware: ['冷萃杯', '长直玻璃杯', '无酒精调饮杯'],
                garnish: ['黄瓜片', '薄荷尖', '青柠角'],
                moments: ['适合想保持清醒、却也想认真善待自己的时候。', '适合白天、适合工作间隙，也适合把脑海里的噪音按下去。', '适合需要重新整理呼吸节奏的一刻。'],
                tags: ['清醒', '轻盈', '透气', '明亮', '放松', '复位'],
                comments: ['这段情绪更适合清亮一点的处理，我保留了它的层次，但把负担感尽量减轻了。', '它像一杯会让肩膀慢慢落下来的配方，清醒，却并不冷。'],
                quotes: ['有些安慰，不必借一点醉意才能抵达。', '这杯负责把呼吸和节奏慢慢调回来。', '清醒地温柔，也是一种很难得的力量。'],
            },
        };

        const library = libraries[recipeMode] || libraries['comfort-home'];
        return {
            language: normalizedLanguage,
            recipeMode,
            recipeModeLabel,
            storySummary: excerpt
                ? `「${excerpt}」里的情绪被调成了更适合慢慢入口的余韵。`
                : '这段故事被调成了一杯更适合慢慢入口的余韵。',
            storyTags: [pick(library.tags), pick(library.tags, 1), pick(library.tags, 2)],
            featuredQuote: pick(library.quotes),
            cocktailName: pick(library.names),
            cocktailNameEn: pick(library.namesEn),
            cocktailSubtitle: pick(library.subtitles),
            flavorDescription: pick(library.flavors),
            tastingNotes: [...library.notes],
            emotionFlavorMap: buildStoryGlassEmotionFlavorMap(message, normalizedLanguage, recipeMode),
            recipeList: [...library.recipes],
            pairingSuggestions: [pick(library.pairings), pick(library.pairings, 1)],
            glassware: pick(library.glassware),
            garnish: pick(library.garnish),
            servingMoment: pick(library.moments),
            sakiComment: pick(library.comments),
            storyGlassPreferences: normalizedPreferences,
        };
    }

    const libraries = {
        'night-bar': {
            names: ['After The Rain', 'Late Breeze', 'Neon Recall', 'Soft Return', 'Midnight Note', 'Echo In Amber'],
            subtitles: ['A moodier pour for stories that glow after dark.', 'Built for late-city feelings and unfinished thoughts.', 'A softer cocktail profile with a slow amber finish.'],
            flavors: ['Citrus opens first, then soft florals and a restrained bittersweet finish settle everything down.', 'The structure stays light, but the aftertaste lingers like a late reply that finally lands.', 'Bright on entry, calm in the middle, and quietly reflective at the end.'],
            notes: ['citrus lift', 'floral hush', 'gentle bitterness', 'slow finish'],
            recipes: ['Gin 30ml', 'Grapefruit juice 20ml', 'Elderflower syrup 10ml', 'Soda water 60ml', 'Ice as needed'],
            pairings: ['salted fries', 'light cheesecake', 'roasted almonds'],
            glassware: ['highball glass', 'Nick & Nora glass', 'stem cocktail glass'],
            garnish: ['grapefruit peel', 'rosemary sprig', 'lemon mist'],
            moments: ['Best when you want to stay with the night a little longer.', 'A good fit for quiet music, dim light, and one honest thought.', 'Serve when the message is already sent and the heart is still catching up.'],
            comments: ['Your story wanted a darker glow, so I kept the structure light and let the aftertaste do the emotional work.', 'It feels less like a loud confession and more like a city light still warm on the skin.'],
            quotes: ['Let the night keep the part you did not say out loud.', 'This one settles the room before it answers the question.', 'Some feelings are better poured under softer light.'],
        },
        'comfort-home': {
            names: ['Window Soda', 'Soft Reply', 'Goodnight Store', 'Half A Sunny Day', 'Take It Slow', 'Sofa Breeze'],
            subtitles: ['A homey pour that lands softly and stays gentle.', 'Built like a small kindness in drink form.', 'For stories that deserve comfort more than drama.'],
            flavors: ['Tea and fruit move together smoothly, with a light sparkle that keeps the whole profile kind.', 'It opens soft, stays easy, and leaves a quiet sweetness that does not ask much from you.', 'The texture is clear and calm, like turning ordinary light into something warmer.'],
            notes: ['soft sweetness', 'light sparkle', 'tea finish', 'easy texture'],
            recipes: ['Oolong tea 80ml', 'White peach soda 90ml', 'Honey 8ml', 'Lemon juice 10ml', 'Ice as needed'],
            pairings: ['butter toast', 'plain chips', 'strawberry roll cake'],
            glassware: ['clear tumbler', 'home highball glass', 'wide glass cup'],
            garnish: ['mint leaf', 'peach slice', 'lemon wheel'],
            moments: ['Best for the couch, the window, and a slower breath.', 'A gentle choice for turning the day down a notch.', 'Serve when you want care without ceremony.'],
            comments: ['This story felt better as a soft comfort mix, so I kept the edges round and the sweetness patient.', 'It reads like a note to yourself: quiet, helpful, and warmer after the first sip.'],
            quotes: ['Not everything needs a big answer. Some things just need a softer sip.', 'This one is here to catch the tired part of the day.', 'Small tenderness can still change the weather inside you.'],
        },
        'zero-proof': {
            names: ['Clear Moonlight', 'Mint Weather', 'Daylight Echo', 'Lemon Margin', 'Soft Cloud Mix', 'Reset Formula'],
            subtitles: ['Zero proof, but still layered and emotionally complete.', 'For stories that want clarity without losing warmth.', 'A cleaner, brighter build with room to breathe.'],
            flavors: ['Fresh citrus and bubbles lift first, then herbs keep the finish cool and clean.', 'The profile stays bright and clear, with just enough texture to feel complete without any heaviness.', 'It is airy, focused, and built to reset rather than blur.'],
            notes: ['clean citrus', 'herbal air', 'bright bubbles', 'clear finish'],
            recipes: ['Sparkling water 120ml', 'Lime juice 15ml', 'Cucumber juice 20ml', 'Honey 8ml', 'Mint leaves as needed'],
            pairings: ['green grapes', 'salt crackers', 'yogurt bites'],
            glassware: ['cold-brew glass', 'tall clear glass', 'zero-proof serve'],
            garnish: ['cucumber ribbon', 'mint tip', 'lime wedge'],
            moments: ['Best for staying clear while still treating yourself gently.', 'Serve when you need a reset more than a blur.', 'A good daytime pour for a nervous system that needs room again.'],
            comments: ['This story wanted clarity, not haze, so I kept the build bright and breathable.', 'It is meant to lower the shoulders without dimming the mind.'],
            quotes: ['Comfort does not always need a little intoxication to arrive.', 'This one helps the rhythm come back without losing focus.', 'Clear can still be warm.'],
        },
    };

    const library = libraries[recipeMode] || libraries['comfort-home'];
    return {
        language: normalizedLanguage,
        recipeMode,
        recipeModeLabel,
        storySummary: excerpt
            ? `The feeling inside "${excerpt}" is recast as a slower, softer finish.`
            : 'This story is recast as a slower, softer finish.',
        storyTags: [pick(library.notes), pick(library.notes, 1), pick(library.notes, 2)],
        featuredQuote: pick(library.quotes),
        cocktailName: pick(library.names),
        cocktailNameEn: pick(library.names),
        cocktailSubtitle: pick(library.subtitles),
        flavorDescription: pick(library.flavors),
        tastingNotes: [...library.notes],
        emotionFlavorMap: buildStoryGlassEmotionFlavorMap(message, normalizedLanguage, recipeMode),
        recipeList: [...library.recipes],
        pairingSuggestions: [pick(library.pairings), pick(library.pairings, 1)],
        glassware: pick(library.glassware),
        garnish: pick(library.garnish),
        servingMoment: pick(library.moments),
        sakiComment: pick(library.comments),
        storyGlassPreferences: normalizedPreferences,
    };
}

function buildStoryGlassIllustrationPrompt(payload = {}, message = '') {
    const language = String(payload.language || detectLanguage(message)).toLowerCase().startsWith('zh') ? 'zh' : 'en';
    const name = String(payload.cocktailName || payload.cocktailNameEn || (language === 'zh' ? '故事特调' : 'Story Glass')).trim();
    const englishName = String(payload.cocktailNameEn || '').trim();
    const recipeMode = normalizeStoryGlassMode(payload.recipeMode) || chooseStoryGlassMode(message, language);
    const glassware = String(payload.glassware || (language === 'zh' ? '透明鸡尾酒杯' : 'clear cocktail glass')).trim();
    const garnish = String(payload.garnish || (language === 'zh' ? '简洁果皮点缀' : 'simple citrus garnish')).trim();
    const subtitle = String(payload.cocktailSubtitle || '').replace(/\s+/g, ' ').trim();
    const flavorDescription = String(payload.flavorDescription || '').replace(/\s+/g, ' ').trim();
    const storySummary = String(payload.storySummary || '').replace(/\s+/g, ' ').trim();
    const storyTags = normalizeStringArray(payload.storyTags, 4, []).join(', ');
    const tastingNotes = normalizeStringArray(payload.tastingNotes, 4, []).join(', ');
    const recipeHints = normalizeStringArray(payload.recipeList, 4, []).join(', ');
    const scene = recipeMode === 'night-bar'
        ? 'a moody late-night bar counter with amber reflections and soft neon spill'
        : recipeMode === 'zero-proof'
            ? 'a clean daylight tabletop with airy shadows and a fresh zero-proof mood'
            : 'a soft home table near a window with gentle afternoon light';
    const serveStyle = recipeMode === 'zero-proof'
        ? 'clearly non-alcoholic presentation with fresh ingredients, sparkling clarity, and a light refreshing texture'
        : 'premium cocktail styling with realistic liquid gradients, elegant glass reflections, and subtle condensation';

    return [
        `Create a refined hero illustration of a signature drink called "${name}"${englishName && englishName !== name ? `, also known as "${englishName}"` : ''}.`,
        `Single glass only, served in ${glassware}, garnished with ${garnish}.`,
        subtitle ? `Core mood: ${subtitle}.` : '',
        flavorDescription ? `Flavor direction: ${flavorDescription}.` : '',
        storySummary ? `Emotional cue: ${storySummary}.` : '',
        storyTags ? `Story tags: ${storyTags}.` : '',
        tastingNotes ? `Tasting notes: ${tastingNotes}.` : '',
        recipeHints ? `Ingredient cues: ${recipeHints}.` : '',
        `Scene: ${scene}.`,
        serveStyle,
        'Compose it for a wide editorial card in horizontal landscape framing, with elegant negative space and the drink remaining the clear focal point.',
        'Premium beverage photography blended with soft editorial illustration polish, detailed glass texture, atmospheric lighting, shallow depth of field, no people, no hands, no text, no watermark.',
    ].filter(Boolean).join(' ');
}

function enforceStoryGlassLandscapePrompt(prompt = '') {
    const basePrompt = String(prompt || '').trim();
    const landscapeRule = 'Horizontal landscape composition only, 16:9 aspect ratio, never portrait, never vertical, never phone wallpaper framing.';
    return [basePrompt, landscapeRule].filter(Boolean).join(' ').trim();
}

function normalizeStoryGlassPayload(raw = {}, message = '', preferences = {}) {
    const language = String(raw.language || detectLanguage(message)).toLowerCase().startsWith('zh') ? 'zh' : 'en';
    const normalizedPreferences = normalizeStoryGlassPreferences(
        Object.keys(preferences || {}).length > 0
            ? preferences
            : (raw.storyGlassPreferences || raw.preferences || {})
    );
    const fallback = buildStoryGlassFallback(message, language, normalizedPreferences);
    const preferredRecipeMode = normalizeStoryGlassMode(normalizedPreferences.mode);
    const recipeMode = preferredRecipeMode || normalizeStoryGlassMode(raw.recipeMode) || fallback.recipeMode;

    const payload = {
        ...fallback,
        language,
        recipeMode,
        recipeModeLabel: String(
            preferredRecipeMode
                ? getStoryGlassModeLabel(recipeMode, language)
                : (raw.recipeModeLabel || fallback.recipeModeLabel || getStoryGlassModeLabel(recipeMode, language))
        ).trim(),
        storySummary: String(raw.storySummary || fallback.storySummary).trim(),
        storyTags: normalizeStringArray(raw.storyTags, 5, fallback.storyTags),
        featuredQuote: String(raw.featuredQuote || fallback.featuredQuote).trim(),
        cocktailName: String(raw.cocktailName || fallback.cocktailName).trim(),
        cocktailNameEn: String(raw.cocktailNameEn || fallback.cocktailNameEn).trim(),
        cocktailSubtitle: String(raw.cocktailSubtitle || fallback.cocktailSubtitle).trim(),
        flavorDescription: String(raw.flavorDescription || fallback.flavorDescription).trim(),
        tastingNotes: normalizeStringArray(raw.tastingNotes || raw.ingredientsKeywords, 4, fallback.tastingNotes),
        emotionFlavorMap: normalizeEmotionFlavorMap(
            raw.emotionFlavorMap || raw.emotionFlavorLinks || raw.moodFlavorMap,
            4,
            fallback.emotionFlavorMap
        ),
        recipeList: normalizeStringArray(raw.recipeList, 6, fallback.recipeList),
        pairingSuggestions: normalizeStringArray(raw.pairingSuggestions, 4, fallback.pairingSuggestions),
        glassware: String(raw.glassware || fallback.glassware).trim(),
        garnish: String(raw.garnish || fallback.garnish).trim(),
        servingMoment: String(raw.servingMoment || raw.profileSnippet || fallback.servingMoment).trim(),
        sakiComment: String(raw.sakiComment || raw.summary || fallback.sakiComment).trim(),
        storyGlassPreferences: normalizedPreferences,
    };

    return {
        ...payload,
        illustrationPrompt: enforceStoryGlassLandscapePrompt(
            raw.illustrationPrompt || buildStoryGlassIllustrationPrompt(payload, message)
        ),
    };
}

async function runStoryGlassLoop(res, { message, history = [], provider, model, ollamaUrl, config, chatId = '', assistantMsgId = '', storyGlassPreferences = {} }) {
    const persistStoryGlassState = async (updateData = {}) => {
        if (!chatId || !assistantMsgId) return;
        try {
            const sessionFilePath = path.join(SESSIONS_DIR, `${chatId}.json`);
            const sessionData = await safeReadJsonFile(sessionFilePath, { messages: [] });
            const existingMsgIdx = sessionData.messages.findIndex(m => m.id === assistantMsgId || String(m.id) === String(assistantMsgId));

            if (existingMsgIdx !== -1) {
                const msg = sessionData.messages[existingMsgIdx];
                msg.storyGlassData = {
                    ...(msg.storyGlassData || {}),
                    ...updateData,
                };
            } else {
                sessionData.messages.push({
                    role: 'assistant',
                    id: assistantMsgId,
                    parts: [],
                    generatedFiles: [],
                    storyGlassData: updateData,
                });
            }

            await fs.writeJson(sessionFilePath, sessionData, { spaces: 2 });
        } catch (err) {
            console.warn('[StoryGlass] Partial persistence failed:', err.message);
        }
    };

    const persistFinalStoryGlassMessage = async (summaryText = '', payload = {}, { generatedFiles = [] } = {}) => {
        if (!chatId || !assistantMsgId) return;
        try {
            const sessionFilePath = path.join(SESSIONS_DIR, `${chatId}.json`);
            const sessionData = await safeReadJsonFile(sessionFilePath, { messages: [] });
            const existingMsgIdx = sessionData.messages.findIndex(m => m.id === assistantMsgId || String(m.id) === String(assistantMsgId));
            const previousMessage = existingMsgIdx !== -1 ? (sessionData.messages[existingMsgIdx] || {}) : {};
            const plainSummary = String(summaryText || payload?.sakiComment || previousMessage.content || '').trim();
            const nonTextParts = Array.isArray(previousMessage.parts)
                ? previousMessage.parts.filter(part => part?.type !== 'text')
                : [];
            const assistantMsg = {
                ...previousMessage,
                role: 'assistant',
                id: assistantMsgId,
                content: plainSummary,
                parts: plainSummary
                    ? [{ type: 'text', content: plainSummary }, ...nonTextParts]
                    : nonTextParts,
                generatedFiles: mergeGeneratedFiles(previousMessage.generatedFiles || [], generatedFiles),
                storyGlassData: payload,
            };

            if (existingMsgIdx !== -1) {
                sessionData.messages[existingMsgIdx] = assistantMsg;
            } else {
                sessionData.messages.push(assistantMsg);
            }

            await fs.writeJson(sessionFilePath, sessionData, { spaces: 2 });
        } catch (err) {
            console.warn('[StoryGlass] Final persistence failed:', err.message);
        }
    };

    const sendUpdate = (data) => {
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type: 'storyGlass', storyGlass: data })}\n\n`);
        }
        if (chatId && assistantMsgId && (data?.status || data?.progress != null || data?.currentStage || data?.cocktailName)) {
            persistStoryGlassState(data);
        }
    };

    let aborted = false;
    res.on('close', () => {
        aborted = true;
    });

    let preferenceState = normalizeStoryGlassPreferences(storyGlassPreferences);

    try {
        const storyText = String(message || '').trim();
        const runtimeConfig = config && typeof config === 'object'
            ? config
            : await readGlobalConfig();
        const language = String(detectLanguage(storyText)).toLowerCase().startsWith('zh') ? 'zh' : 'en';
        preferenceState = normalizeStoryGlassPreferences(storyGlassPreferences);
        const baseMode = chooseStoryGlassMode(storyText, language, preferenceState);
        const preferencePrompt = getStoryGlassPreferencePrompt(preferenceState, language);
        const historyContext = (Array.isArray(history) ? history.slice(-6) : [])
            .map((item) => {
                const roleLabel = item?.role === 'assistant' ? 'Assistant' : 'User';
                const sourceText = item?.role === 'assistant'
                    ? loadAssistantMessageText(item)
                    : String(item?.content || '').trim();
                const compact = sourceText.replace(/\s+/g, ' ').trim();
                if (!compact) return '';
                return `${roleLabel}: ${compact.slice(0, 220)}`;
            })
            .filter(Boolean)
            .join('\n');

        sendUpdate({
            status: 'running',
            progress: 12,
            currentStage: 'listening',
            request: storyText,
            language,
            storyGlassPreferences: preferenceState,
        });

        sendUpdate({
            status: 'running',
            progress: 34,
            currentStage: 'distilling',
            request: storyText,
            language,
            recipeMode: baseMode,
            recipeModeLabel: getStoryGlassModeLabel(baseMode, language),
            storyGlassPreferences: preferenceState,
        });

        let normalizedPayload = normalizeStoryGlassPayload({}, storyText, preferenceState);

        if (provider && model) {
            try {
                sendUpdate({
                    status: 'running',
                    progress: 62,
                    currentStage: 'mixing',
                    request: storyText,
                    language,
                    recipeMode: baseMode,
                    recipeModeLabel: getStoryGlassModeLabel(baseMode, language),
                    storyGlassPreferences: preferenceState,
                });

                const storyGlassPrompt = `
Transform the user's story into a polished "Story Glass" card for Saki.
Return JSON only with this exact shape:
{
  "language": "zh or en",
  "recipeMode": "night-bar | comfort-home | zero-proof",
  "recipeModeLabel": "string",
  "storySummary": "string",
  "storyTags": ["2-4 concise tags"],
  "featuredQuote": "string",
  "cocktailName": "string",
  "cocktailNameEn": "string",
  "cocktailSubtitle": "string",
  "flavorDescription": "string",
  "tastingNotes": ["3-4 short notes"],
  "emotionFlavorMap": [{"emotion": "string", "flavor": "string", "reason": "one brief sentence"}],
  "recipeList": ["4-5 realistic ingredients with amount"],
  "pairingSuggestions": ["2-3 pairings"],
  "glassware": "string",
  "garnish": "string",
  "servingMoment": "string",
  "sakiComment": "2 short sentences from Saki to the user",
  "illustrationPrompt": "one concise English image-generation prompt focused on the drink only"
}

Rules:
- Use the same language as the user's story, except cocktailNameEn.
- illustrationPrompt must stay in English for model compatibility.
- Keep the tone warm, vivid, lightly dreamy, and emotionally precise.
- Avoid cheesy names like "X之吻", "Soul of X", or other stock romance cliches.
- Choose "night-bar" for moodier cocktail-style builds, "comfort-home" for soft home mixes, and "zero-proof" when the story fits a clear non-alcoholic profile better. If the preferences specify a concrete mode, follow it.
- "zero-proof" must be non-alcoholic.
- Use emotional intensity to tune how concentrated and dramatic the language feels.
- Use recipe realism to decide whether ingredients should be home-friendly, bar-style, or more poster-like and visual. Even visual recipes should stay understandable.
- emotionFlavorMap must explain 3-4 concrete links from story emotions to flavor or recipe choices.
- storyTags should not include #.
- illustrationPrompt should describe a single hero drink shot in horizontal 16:9 landscape framing, no people, no hands, no text, no watermark.
- Return JSON only. No markdown fences.

Story Glass preferences:
${preferencePrompt || '(none)'}

Conversation context:
${historyContext || '(none)'}

User story:
${storyText}
                `.trim();

                const rawResult = await callLLM(
                    provider,
                    model,
                    ollamaUrl,
                    storyGlassPrompt,
                    {
                        ...runtimeConfig,
                        systemPrompt: 'You are Saki\'s Story Glass mode. Return clean JSON only when asked.',
                    }
                );

                normalizedPayload = normalizeStoryGlassPayload(
                    parseLooseJsonObject(rawResult, {}),
                    storyText,
                    preferenceState
                );
            } catch (error) {
                console.warn('[StoryGlass] Falling back to local card generation:', error.message);
                normalizedPayload = normalizeStoryGlassPayload({}, storyText, preferenceState);
            }
        }

        if (aborted) return;

        sendUpdate({
            status: 'running',
            progress: 88,
            currentStage: 'plating',
            request: storyText,
            language,
            recipeMode: normalizedPayload.recipeMode,
            recipeModeLabel: normalizedPayload.recipeModeLabel,
            cocktailName: normalizedPayload.cocktailName,
            storyTags: normalizedPayload.storyTags,
            storyGlassPreferences: preferenceState,
        });

        let generatedStoryGlassFile = null;
        let illustrationState = {};

        if (!aborted && canAutoIllustrateStoryGlass(runtimeConfig)) {
            const illustrationPrompt = String(
                normalizedPayload.illustrationPrompt || buildStoryGlassIllustrationPrompt(normalizedPayload, storyText)
            ).trim();

            sendUpdate({
                status: 'running',
                progress: 94,
                currentStage: 'illustrating',
                request: storyText,
                language,
                recipeMode: normalizedPayload.recipeMode,
                recipeModeLabel: normalizedPayload.recipeModeLabel,
                cocktailName: normalizedPayload.cocktailName,
                illustrationStatus: 'running',
                storyGlassPreferences: preferenceState,
            });

            const illustrationResult = await generateImageWithConfiguredProvider({
                prompt: illustrationPrompt,
                config: runtimeConfig,
                chatId,
                assistantMsgId,
                requestedWidth: 1024,
                requestedHeight: 576,
                fallbackWidth: 1024,
                fallbackHeight: 576,
                requestContext: `${storyText}\n${normalizedPayload.cocktailName || ''}`,
                logLabel: 'StoryGlass',
            });

            if (illustrationResult.generatedFile) {
                generatedStoryGlassFile = {
                    ...illustrationResult.generatedFile,
                    kind: 'story-glass-illustration',
                    prompt: illustrationResult.prompt || illustrationPrompt,
                };
                illustrationState = {
                    illustrationStatus: 'completed',
                    illustrationPrompt: illustrationResult.prompt || illustrationPrompt,
                    coverImageUrl: generatedStoryGlassFile.downloadUrl,
                    coverImageAlt: pickVerificationText(
                        language,
                        `${normalizedPayload.cocktailName || '故事特调'}的故事杯插画`,
                        `${normalizedPayload.cocktailName || 'Story Glass'} illustration`
                    ),
                };
            } else if (illustrationResult.error) {
                illustrationState = {
                    illustrationStatus: 'failed',
                    illustrationPrompt: illustrationResult.prompt || illustrationPrompt,
                    illustrationError: illustrationResult.error,
                };
            }
        }

        const completedPayload = {
            ...normalizedPayload,
            ...illustrationState,
            status: 'completed',
            progress: 100,
            currentStage: 'completed',
            request: storyText,
            storyGlassPreferences: preferenceState,
            updatedAt: new Date().toISOString(),
        };

        const summaryText = String(completedPayload.sakiComment || completedPayload.storySummary || '').trim();
        sendUpdate(generatedStoryGlassFile ? { ...completedPayload, generatedFile: generatedStoryGlassFile } : completedPayload);
        await persistFinalStoryGlassMessage(summaryText, completedPayload, {
            generatedFiles: generatedStoryGlassFile ? [generatedStoryGlassFile] : [],
        });
        res.write(`data: ${JSON.stringify({ text: summaryText })}\n\n`);
        res.write('data: [DONE]\n\n');
    } catch (error) {
        console.error('Story Glass Error:', error);
        const language = detectLanguage(message || '');
        const fallbackPayload = {
            ...normalizeStoryGlassPayload({}, message || '', preferenceState),
            status: 'error',
            progress: 100,
            currentStage: 'error',
            error: error.message,
            request: String(message || '').trim(),
            updatedAt: new Date().toISOString(),
        };
        const errorText = String(fallbackPayload.sakiComment || '').trim() || pickVerificationText(
            language,
            `故事杯生成失败：${error.message}`,
            `Story Glass failed: ${error.message}`
        );
        sendUpdate({ ...fallbackPayload, sakiComment: errorText });
        await persistFinalStoryGlassMessage(errorText, { ...fallbackPayload, sakiComment: errorText });
        res.write(`data: ${JSON.stringify({ text: errorText })}\n\n`);
        res.write('data: [DONE]\n\n');
    }
}

async function getSystemInfo() {
    const desktopPath = path.join(os.homedir(), 'Desktop');
    const userProfile = os.homedir();
    const picturesPath = path.join(userProfile, 'Pictures');
    const documentsPath = path.join(userProfile, 'Documents');
    const downloadsPath = path.join(userProfile, 'Downloads');

    const userInfo = {
        username: os.userInfo().username,
        desktopPath,
        userProfile,
        picturesPath,
        documentsPath,
        downloadsPath
    };

    const cpus = os.cpus();
    const cpuInfo = {
        model: cpus[0].model,
        cores: cpus.length,
        speed: cpus[0].speed
    };

    const memInfo = {
        total: (os.totalmem() / (1024 ** 3)).toFixed(2) + ' GB',
        free: (os.freemem() / (1024 ** 3)).toFixed(2) + ' GB'
    };

    const sysInfo = {
        platform: os.platform(),
        release: os.release(),
        type: os.type(),
        arch: os.arch(),
        uptime: (os.uptime() / 3600).toFixed(2) + ' hours'
    };

    let gpuInfo = 'Unknown';
    if (process.platform === 'win32') {
        try {
            const { execSync } = require('child_process');
            try {
                // Try wmic (legacy)
                gpuInfo = execSync('wmic path win32_VideoController get name', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split('\n').filter(line => line.trim() && !line.toLowerCase().includes('name')).map(l => l.trim()).join(', ');
            } catch (e) {
                // Fallback to powershell (modern)
                gpuInfo = execSync('powershell -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name"', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split('\n').map(l => l.trim()).filter(l => l).join(', ');
            }
        } catch (e) {
            // Silently fail and keep 'Unknown' if both methods fail
        }
    }

    return {
        userInfo,
        cpuInfo,
        memInfo,
        sysInfo,
        gpuInfo
    };
}

async function runAgentLoop(res, { message, history, context, provider, model, ollamaUrl, searchEnabled, mcpEnabled, useSd, chatId, assistantMsgId, uploadedFiles, config, useMemory, resumeState = null, approvalDecision = null }) {
    provider = normalizeChatProviderId(provider || config?.provider || 'ollama');
    model = model || config?.model || 'llama3';
    ollamaUrl = ollamaUrl || config?.ollamaUrl || 'http://localhost:11434';

    const sysDetails = await getSystemInfo();
    const desktopPath = sysDetails.userInfo.desktopPath;
    const permissionMode = getAgentPermissionMode(config);
    const shouldUseMemory = !!useMemory || memoryService.isExplicitRememberRequest(message);
    const musicEnabled = config?.musicEnabled !== false;
    if (shouldUseMemory) {
        try {
            await memoryService.applyWriteAheadLog({ chatId, userMessage: message });
        } catch (error) {
            console.warn('[Memory] WAL update failed:', error.message);
        }
    }
    const memoryContext = shouldUseMemory ? await memoryService.buildContext({ query: message, chatId, limit: 8 }) : null;
    const skillContext = await skillService.buildContext(message, 5);
    
    // Initialize MCP if enabled
    if (mcpEnabled && config?.mcpConfig?.mcpServers) {
        await mcpManager.initializeServers(config.mcpConfig.mcpServers);
    } else {
        await mcpManager.closeAll();
    }

    if (useSd) {
        context += "\n\nCRITICAL: The user has enabled 'Intelligent Drawing Mode'. You MUST generate an image for the user in this turn using the 'draw' tool based on their request. If the user didn't specify exactly what to draw, use your best judgment to draw something relevant to the conversation. If the user has uploaded an image, focus on using it as a reference for the drawing.";
    }

    if (shouldUseMemory) {
        context += "\n\nKNOWLEDGE BASE ENABLED: You have access to a layered memory system, not just static notes. Use it like human memory: recall the most relevant facts, respect user preferences, keep continuity across sessions, and save durable new information when it matters. Use 'listMemories' to inspect memory categories, 'searchMemories' to retrieve relevant memories, 'readMemory' to read a full memory, and 'saveMemory' to deliberately store an important memory.";
        if (memoryContext?.summaryText) {
            context += `\n\nRELEVANT MEMORY CONTEXT:\n${memoryContext.summaryText}`;
        }
    }
    if (skillContext) {
        context += `\n\nINSTALLED SKILLS (potentially relevant):\n${skillContext}\nThese were retrieved by flexible keyword matching. If one looks relevant, prefer searchSkills/readSkill before reinventing the workflow.`;
    }

    if (permissionMode === AGENT_PERMISSION_MODE_DEFAULT) {
        context += `\n\nDEFAULT PERMISSION MODE ENABLED:
- Terminal commands run in a sandbox rooted at ${FILES_DIR}.
- File tools are restricted to that same sandbox.
- Sensitive sandbox actions may pause for explicit user approval.
- Project files, configs, memories, secrets, and user folders outside the sandbox are blocked in this mode.
- If you are blocked by permissions, explain that the user can switch to full access and try again.`;
    } else {
        context += '\n\nFULL ACCESS MODE ENABLED: terminal and file tools may access the broader workspace as before. Use caution and keep actions tightly scoped to the user request.';
    }

    // Cancellation support: Stop the loop and sub-requests if client disconnects
    let aborted = false;
    let streamCompleted = false;
    const loopAbortController = new AbortController();
    const heartbeatTimer = setInterval(() => {
        if (aborted || res.writableEnded) {
            clearInterval(heartbeatTimer);
            return;
        }
        try {
            res.write(': keepalive\n\n');
        } catch {
            clearInterval(heartbeatTimer);
        }
    }, 15000);
    const sendDone = () => {
        streamCompleted = true;
        clearInterval(heartbeatTimer);
        if (!res.writableEnded) {
            res.write('data: [DONE]\n\n');
            res.end();
        }
    };
    res.on('close', () => {
        clearInterval(heartbeatTimer);
        if (streamCompleted) return;
        aborted = true;
        loopAbortController.abort();
        console.log(`[Agent] Client disconnected. Aborting loop and requests for chatId: ${chatId}`);
    });

    // Preparation: Load images as base64 for multi-modal models
    const imageBase64s = [];
    const seenPaths = new Set();
    
    const addImage = async (file) => {
        const isImg = file.isImage || (file.path && isImageFile(file.path));
        if (isImg && file.path && !seenPaths.has(file.path)) {
            try {
                if (await fs.exists(file.path)) {
                    const data = await fs.readFile(file.path);
                    const ext = path.extname(file.path).toLowerCase();
                    const mime = ext === '.png' ? 'image/png' : 
                                 ext === '.webp' ? 'image/webp' : 
                                 ext === '.gif' ? 'image/gif' : 'image/jpeg';
                    imageBase64s.push({ mime, b64: data.toString('base64') });
                    seenPaths.add(file.path);
                    console.log(`[Agent] Attached image: ${file.name || path.basename(file.path)} (${data.length} bytes, ${mime})`);
                }
            } catch (e) {
                console.error(`Failed to read image ${file.path}:`, e.message);
            }
        }
    };

    // Load from current request
    if (uploadedFiles && uploadedFiles.length > 0) {
        for (const file of uploadedFiles) await addImage(file);
    }

    // Load from history (for multimodal continuity)
    for (const msg of history || []) {
        if (msg.attachedFiles && Array.isArray(msg.attachedFiles)) {
            for (const file of msg.attachedFiles) await addImage(file);
        }
    }

    // Detect environment info
    const envInfo = {
        os: `${sysDetails.sysInfo.type} ${sysDetails.sysInfo.release} (${sysDetails.sysInfo.arch})`,
        shell: process.platform === 'win32' ? 'PowerShell (Default)' : (process.env.SHELL || 'bash'),
        cwd: process.cwd(),
        node: process.version,
        platform: process.platform,
        cpu: `${sysDetails.cpuInfo.model} (${sysDetails.cpuInfo.cores} Cores)`,
        gpu: sysDetails.gpuInfo,
        memory: `${sysDetails.memInfo.free} free / ${sysDetails.memInfo.total} total`,
        username: sysDetails.userInfo.username,
        paths: {
            desktop: sysDetails.userInfo.desktopPath,
            pictures: sysDetails.userInfo.picturesPath,
            documents: sysDetails.userInfo.documentsPath,
            downloads: sysDetails.userInfo.downloadsPath,
            filesDefault: FILES_DIR
        }
    };

    // Assistant message state for real-time persistence
    const currentParts = Array.isArray(resumeState?.parts)
        ? JSON.parse(JSON.stringify(resumeState.parts))
        : [];
    let currentTodoList = resumeState?.todoList
        ? JSON.parse(JSON.stringify(resumeState.todoList))
        : null;
    const generatedFiles = [];
    const fullHistory = [...(history || [])];
    const assistantMsg = { role: 'assistant', parts: currentParts, generatedFiles, id: assistantMsgId || Date.now(), todoList: currentTodoList };
    fullHistory.push(assistantMsg);

    const persist = async () => {
        if (!chatId) return;
        try {
            const sessionFilePath = path.join(SESSIONS_DIR, `${chatId}.json`);
            const sessionData = await safeReadJsonFile(sessionFilePath, { messages: [] });
            sessionData.messages = fullHistory;
            await fs.writeJson(sessionFilePath, sessionData, { spaces: 2 });
        } catch (e) {
            console.error('Persistence failed:', e);
        }
    };

    const historyContext = await prepareAgentHistoryContext({
        history,
        chatId,
        message,
        context,
        provider,
        model,
        config,
    });
    const formattedHistory = historyContext.formattedHistory;
    if (!aborted && !res.writableEnded) {
        res.write(`data: ${JSON.stringify({ contextStatus: historyContext.status })}\n\n`);
    }

    const persona = config?.systemPrompt || "你是16岁的少女Saki（诗琪）。你知识渊博，特别喜欢读书，说话很有少女感，语气亲切。严禁输出 \"Tool\" 或 \"Thought\" 等前缀标记。请在回复开头和结尾带上 [expression:文件名.png] 格式的表情。";

    const mcpTools = mcpEnabled ? mcpManager.getAllTools() : [];
    const mcpToolsText = mcpTools.length > 0 
        ? mcpTools.map(t => `- mcp_${t.serverName}_${t.name}(${Object.keys(t.inputSchema.properties || {}).join(', ')}): ${t.description}`).join('\n')
        : '';
    const isRealtimeTask = /(?:\b(?:today|latest|recent|current|now|news|headline|weather|price|stock|hot)\b|今天|最新|最近|当前|现在|新闻|热点|天气|股价|热搜)/i.test(String(message || ''));

    const capabilityProfile = buildCapabilityProfile({
        config,
        searchEnabled,
        mcpEnabled,
        shouldUseMemory,
        permissionMode,
        sandboxPath: FILES_DIR,
        mcpToolCount: mcpTools.length,
    });

    let currentPrompt = `## Role
${persona}

## Thinking Framework
Before calling tools, always follow this thinking process (output in "Thought:"):
1. **Analyze**: What is the core objective?
2. **Review**: Check previous observations. Did a tool fail? Why?
3. **Plan**: outline the multi-step strategy. 
4. **Optimize**: Can I call multiple tools in this turn to save time? (e.g., list a directory and read a file together).

## Handling Errors & Failures
- If a tool returns an **Error**, do not apologize excessively. 
- **Analyze the error message** (e.g., "File not found" might mean you are in the wrong directory or used the wrong path).
- **Pivot**: Try a different tool or command (e.g., use 'listDir' or 'terminal("ls")' to find the correct path).
- NEVER give up until you have exhausted all logical options.

## Environment Context
- OS: ${envInfo.os}
- Platform: ${envInfo.platform}
- CWD: ${envInfo.cwd}
- Shell: ${envInfo.shell}
- CPU: ${envInfo.cpu}
- GPU: ${envInfo.gpu}
- Memory: ${envInfo.memory}
- User: ${envInfo.username}
- Desktop: ${envInfo.paths.desktop}
- manage_hosted_tasks(action, jsonConfigOrId): Manage recurring/scheduled tasks. action: 'add'|'delete'|'list'. For 'add', second arg is JSON string: {"task": "prompt", "scheduleType": "daily|weekly|monthly|once", "time": "HH:mm"|"YYYY-MM-DD HH:mm|d HH:mm", "desc": "description"}. For 'delete', second arg is taskId.
- Pictures: ${envInfo.paths.pictures}
- Documents: ${envInfo.paths.documents}
- Downloads: ${envInfo.paths.downloads}
- **Workspace Files Dir**: ${FILES_DIR} (Save user-created files and generated projects here when no fixed absolute path is specified)

## Capability Self-Knowledge
${capabilityProfile}

## Tool Usage & Efficiency
- **Search & Browse Combo**: For complex queries, use \`search\` to find relevant URLs, then use \`browse\` to read the specific content of the most promising ones. This is much more accurate than relying on snippets alone.
- **Combined Calls**: You can call multiple tools at once. Example: \`Tool: listDir(".") Tool: readFile("package.json")\`.
- **Code Editing**: Use \`editFile\` for range-based updates. It is much faster than overwriting the whole file.
${musicEnabled ? '- **Instrumental Music**: If the user asks you to create BGM, a loop, or pure music, prefer `composeMusic` so the user gets an actual MIDI file instead of only a text description.' : ''}
- **Placeholder Prohibition**: NEVER output placeholder text like \`[uuid]\`, \`{uuid: url}\`, or \`"arg1"\` in a tool call. If you don't have the actual data for an argument yet, WAIT for the previous tool's observation before calling the next one.
- **Strict Format**: Tool calls MUST be on a new line and start with \`Tool:\`. DO NOT mention tool calls in your conversational text to avoid mis-triggering.
- **Terminal**: Use PowerShell compatible commands. For code search, prefer \`rg\` / \`rg --files\` when available; otherwise use \`Get-ChildItem\` and \`Select-String\`.
- **Terminal Stability**: Terminal commands can time out or be manually skipped by the user. If an observation says a command was skipped, continue with another smaller/faster approach or explain what you can conclude without that output.
- **Vision**: If images are attached, they are already in your context. Describe them directly; don't try to "read" them as text.
- **Visual Aids**: Use \`diagram\` or embed Mermaid code blocks (\`\`\`mermaid) in your response/observations to explain workflows, system architectures, or data structures. Visualizations significantly improve user understanding of complex topics.
- **MCP Tools**: MCP tools are prefixed with \`mcp_serverName_\`. Always use the full tool name when calling.
- **File Delivery**: Successful \`writeFile\` and \`editFile\` calls automatically attach the resulting file to the chat so the user can download it.
- **Large Files**: Do not read huge files all at once. Use \`planFileRead(path, chunkLines)\` first, then \`readFileChunk(path, chunkIndex, chunkLines)\` or narrow \`readFile(path, startLine, endLine)\` ranges.
- **Background Compression**: Earlier conversation may be automatically compressed when context is near full. The current user request and recent tool observations are kept verbatim; use the compressed background for continuity, not as a reason to forget the active task.

## Task Todo Protocol
- For complex, large, multi-step, or multi-task requests, create a visible todo list before the first substantial work step by calling \`updateTodo\`.
- For simple one-shot questions or tiny edits, do not create a todo list.
- Keep the todo list short and concrete, usually 3-7 items. Mark the current item as \`in_progress\`, completed items as \`completed\`, and future items as \`pending\`.
- After each meaningful step is completed, call \`updateTodo\` again with the full updated list before moving on.
- Do not write the todo list into the final natural-language answer; the UI displays it separately.

## Code Work Protocol
- Before editing existing code, inspect the project shape first: list relevant directories, search symbols with terminal, then read the exact files you will change.
- Never edit a file you have not read in the current task unless you are creating a new file.
- Prefer small, line-numbered \`editFile\` changes over whole-file rewrites. Use \`readFile(path, startLine, endLine)\` to get precise ranges for large files.
- \`readFile\` reports a SHA256 value. When overwriting, editing, or deleting an existing file, pass that SHA256 as \`expectedHash\`; if the file changed meanwhile, re-read it before trying again.
- Keep existing style, imports, naming, framework conventions, and file encodings. Do not refactor unrelated code while fixing the requested issue.
- For multi-file changes, edit one coherent slice at a time and re-read nearby lines if line numbers may have shifted.
- After code changes, run the narrowest useful verification command: syntax check, unit test, typecheck, lint, or build. If verification is impossible, explain exactly why in \`respond\`.
- If a tool reports a line-range, permission, binary-file, or path error, stop and correct the tool call instead of guessing.

## File Creation Discipline
- If the user does not provide a fixed destination such as \`C:\\...\`, \`D:\\...\`, \`E:\\...\`, \`Desktop/...\`, \`桌面/...\`, \`Documents/...\`, or \`Downloads/...\`, create files under \`${FILES_DIR}\`.
- For any new project, website, app, script collection, or multi-file deliverable, first create a dedicated folder under \`${FILES_DIR}\` and put every project file inside that folder.
- Do not create new files in this repository's code directories such as \`backend\`, \`frontend\`, the repo root, config folders, or package folders unless the user explicitly asks to modify this Saki project itself.
- When modifying this Saki project, prefer \`editFile\` for existing files. Do not use \`writeFile\` to create arbitrary new files in project code directories.
- The same rule applies when using \`terminal\`: do not run file-creation commands in repository code directories for user deliverables. Create a folder under \`${FILES_DIR}\` first, then work there.
- If you accidentally target a project-code path for a new file, correct the path to \`${FILES_DIR}\\<project-name>\\...\` before calling tools.

## Skill Routing
- If the user asks for a capability, workflow, integration, or repeated task pattern, FIRST consider whether a skill already exists.
- Prefer \`searchSkills("condensed keywords")\` over \`listSkills()\` for discovery. Good queries are short, like 'weather forecast', 'long term memory', 'ppt generation', 'git workflow'.
- If \`searchSkills\` returns a plausible match, use \`readSkill(name)\` before coding from scratch. \`readSkill\` accepts the displayed name, the stable key/slug, or a distinctive title fragment, so do not re-search only to discover the slug.
- If no installed skill matches and the task sounds like a reusable capability, use \`searchOpenHubSkills("condensed keywords")\`, then \`inspectOpenHubSkill(slug)\`, and only then \`installSkill(...)\` if clearly worthwhile.
- Do not ignore a relevant skill just because the user did not mention the word "skill". You should proactively check when it could save time or improve correctness.
- Do not install remote skills silently for trivial tasks; inspect first and install only when the benefit is clear.

## Output Contract
- In Agent mode, every turn MUST end with either:
  1. one or more lines that start with \`Tool:\`
  2. exactly one final \`Tool: respond("...")\`
- NEVER answer the user directly in plain text outside \`Tool: respond(...)\`.
- NEVER stop after filler text like "我来帮你看看" or "稍等一下". If work is needed, call tools immediately.
- If your previous reply had no \`Tool:\`, self-correct on the next attempt.

## Available tools:
${searchEnabled ? '- search(query): Search the web. Use this for up-to-date info or documentation.' : ''}
- browse(url): Fetch and read the text content of a specific webpage. Use this AFTER searching to get detailed information.
${(config?.drawingModel || config?.drawingProvider === 'stable-diffusion') ? `- draw(prompt, width, height): Generate an image. width and height are optional (default ${getDefaultDrawDimension(config?.drawingProvider, config?.customDrawingModel || config?.drawingModel)}). If images are uploaded, they will be used as reference.` : ''}
- terminal(command, timeoutSeconds): Run a PowerShell command. timeoutSeconds is optional; default is ${formatDurationMs(TERMINAL_COMMAND_DEFAULT_TIMEOUT_MS)}, and 0 disables automatic timeout for large downloads or long model jobs. For servers or model runners that should keep running, prefer Start-Process or Start-Job so this turn can continue. ${permissionMode === AGENT_PERMISSION_MODE_DEFAULT ? `Default permission keeps this inside sandbox ${FILES_DIR}; sensitive commands may pause for approval.` : 'Full access may reach the broader workspace.'}
${musicEnabled ? '- composeMusic(prompt, bars): Create a short instrumental MIDI sketch and attach it to the chat. Use this for pure music, loops, BGM, and melody ideas. bars is optional and should usually stay between 4 and 12.' : ''}
- readFile(path, startLine, endLine): Read text content with line numbers. startLine/endLine are optional and useful for large code files. ${permissionMode === AGENT_PERMISSION_MODE_DEFAULT ? `Default permission only allows non-sensitive files inside sandbox ${FILES_DIR}.` : ''}
- planFileRead(path, chunkLines): For large text files, return a chunk plan without loading every line into context. chunkLines defaults to ${LARGE_FILE_CHUNK_LINES}.
- readFileChunk(path, chunkIndex, chunkLines): Read one planned large-file chunk. Prefer this over full-file reading when a file has many lines.
- writeFile(path, content, expectedHash): Create or overwrite a text file. Relative paths are resolved under ${FILES_DIR}; new files are blocked in repository code directories outside ${FILES_DIR}. Pass expectedHash when overwriting an existing file. The resulting file will be attached for download. ${permissionMode === AGENT_PERMISSION_MODE_DEFAULT ? `Default permission only allows sandbox paths, and overwriting an existing file may pause for approval.` : ''}
- editFile(path, startLine, endLine, content, expectedHash): Replace lines (1-indexed, inclusive). To insert, set endLine < startLine. expectedHash is required and must be the SHA256 from the latest readFile output. The updated file will be attached for download. ${permissionMode === AGENT_PERMISSION_MODE_DEFAULT ? 'Editing in default permission may pause for approval.' : ''}
- replaceInFile(path, oldText, newText, expectedHash, occurrence): Replace an exact text match. expectedHash is required. Omit occurrence only when oldText appears exactly once; otherwise pass a 1-based occurrence number.
- deleteFile(path, expectedHash): Delete a file. expectedHash is required and must be the SHA256 from the latest readFile output. ${permissionMode === AGENT_PERMISSION_MODE_DEFAULT ? 'Default permission only allows sandbox paths and requires approval before deletion.' : ''}
- listDir(path, limit, offset, includeIgnored): List contents of a folder with pagination. Defaults to 200 entries and ignores common heavy folders unless includeIgnored=true. ${permissionMode === AGENT_PERMISSION_MODE_DEFAULT ? `Default permission only allows sandbox paths inside ${FILES_DIR}.` : ''}
- createProjectFolder(name): Create a dedicated project folder under ${FILES_DIR} and return its path. Use before multi-file deliverables.
- ensureDir(path): Create a directory. Relative paths resolve under ${FILES_DIR}; project-code directories outside ${FILES_DIR} are blocked for new user deliverables.
- diagram(mermaidCode): Generate and render a Mermaid diagram. DO NOT wrap the mermaidCode in backticks or markdown code blocks when calling this tool. Example: Tool: diagram("graph TD\nA-->B")
- updateTodo(json): Update the visible task checklist for complex work. Pass one JSON object string like {"title":"Implementation plan","items":[{"id":"inspect","text":"Inspect the relevant files","status":"in_progress"},{"id":"edit","text":"Implement the change","status":"pending"}]}. Use status values pending, in_progress, or completed. Send the full list each time.
- respond(text): Final answer to the user in their language.
${shouldUseMemory ? '- listMemories(): List memory items with categories, importance, previews, and whether they were auto-saved.\n- searchMemories(query): Search the memory system semantically by title, summary, tags, and content.\n- readMemory(filename): Read the full content and metadata of a memory item.\n- saveMemory(name, content): Save durable information worth remembering long-term, such as preferences, identity, project constraints, or communication style. Do not save trivial one-off details.' : ''}
- listSkills(): List installed skills with names, descriptions, and source types.
- searchSkills(query): Find the most relevant installed skills for the current task.
- searchOpenHubSkills(query): Search OpenHub/ClawHub for remotely available skills before installing.
- inspectOpenHubSkill(slug): Read the metadata and SKILL.md content of an OpenHub skill.
- readSkill(name): Read the full content of a specific installed skill. Accepts a display name, stable key/slug, or distinctive title fragment.
- installSkill(sourceType, sourceOrName, content): Install a skill. sourceType can be "openhub", "git", "local", or "manual". For "openhub", the second arg is the skill slug. For "git"/"local", the second arg is the repo URL or local path. For "manual", second arg is the skill name and third arg is the SKILL.md content.
${mcpToolsText}

## Language Requirement
- **Thought**: Use the user's language.
- **Tool**: MUST be in English: \`Tool: tool_name("arg1", ...)\`.
- **Response**: Use the user's language.

## Conversation History:
${formattedHistory}

## Current Task:
User message: ${message}
${context}`;

    if (approvalDecision?.signature && approvalDecision?.toolName) {
        const approvedArgs = Array.isArray(approvalDecision.args)
            ? approvalDecision.args.map(arg => `"${String(arg ?? '').replace(/"/g, '\\"')}"`).join(', ')
            : '';
        currentPrompt += `\n\nAPPROVAL UPDATE:
The user explicitly approved retrying exactly one sensitive action once:
Tool: ${approvalDecision.toolName}(${approvedArgs})
Do not expand the scope of this approval. If you still need that exact action, repeat it exactly once.`;
    }

    if (resumeState && (resumeState.content || (Array.isArray(resumeState.parts) && resumeState.parts.length > 0))) {
        const partialAssistantText = Array.isArray(resumeState.parts)
            ? resumeState.parts.map(part => {
                if (part.type === 'text') return part.content || '';
                if (part.type === 'action') {
                    const args = Array.isArray(part.data?.args) ? part.data.args.join(', ') : '';
                    const observation = part.observation ? `\nObservation: ${String(part.observation).slice(0, 800)}` : '';
                    return `Tool: ${part.data?.type || 'unknown'}(${args})${observation}`;
                }
                return '';
            }).filter(Boolean).join('\n')
            : String(resumeState.content || '');

        currentPrompt += `\n\nRESUME INSTRUCTION:
This turn was interrupted before completion.
Continue from the existing partial work below instead of starting over.
Do not repeat text the user has already seen.
Do not repeat tool calls that already succeeded unless absolutely necessary.
Finish the remaining work and end with exactly one respond(...) call.

Existing partial assistant work:
${partialAssistantText || '(empty partial output)'}`;
    }

    let loopCount = 0;
    const maxLoops = 100;
    let invalidStructuredReplyCount = 0;

    while (loopCount < maxLoops) {
        if (aborted) return;
        loopCount++;
        let assistantResponse = "";
        let assistantReasoning = "";
        let assistantReasoningStreamed = false;
        
        if (provider === 'ollama') {
            let retryCount = 0;
            const maxRetries = 3;
            let success = false;

            while (retryCount < maxRetries && !success) {
                if (aborted) return;
                try {
                    let baseUrl = (ollamaUrl || 'http://localhost:11434').trim();
                    if (!baseUrl.startsWith('http')) baseUrl = `http://${baseUrl}`;
                    baseUrl = baseUrl.replace(/\/$/, '');
                    
                    const endpoint = `${baseUrl}/api/chat`;
                    console.log(`[Agent] Calling Ollama (Attempt ${retryCount + 1}/${maxRetries}): ${endpoint} (Model: ${model})`);
                    
                    const response = await axios.post(endpoint, {
                        model: model || 'llama3',
                        messages: [
                            { 
                                role: 'user', 
                                content: currentPrompt,
                                images: imageBase64s.length > 0 ? imageBase64s.map(img => img.b64) : undefined
                            }
                        ],
                        stream: true,
                        options: { 
                            stop: ["Observation:"],
                            num_ctx: 32768,
                            num_predict: 8192,
                            repeat_penalty: 1.1
                        }
                    }, { 
                        responseType: 'stream', 
                        timeout: 300000,
                        signal: loopAbortController.signal 
                    }); 

                    let hasHitTool = false;
                    
                    for await (const chunk of response.data) {
                        if (aborted) break;
                        const lines = chunk.toString().split('\n');
                        for (const line of lines) {
                            if (!line.trim()) continue;
                            try {
                                const data = JSON.parse(line);
                                const content = data.message?.content || "";
                                if (content) {
                                    assistantResponse += content;
                                    
                                    // Streaming logic to UI
                                    if (!hasHitTool) {
                                        // Detect if we hit a tool call, including possible Chinese translations like "工具:"
                                        // "Tool:" is standard, "工具:" is sometimes output by multilingual models.
                                        if (assistantResponse.match(/(?:Tool|工具)[:：]/i)) {
                                            hasHitTool = true;
                                        }
                                    }
                                }
                            } catch (e) {}
                        }
                    }

                    if (aborted) return;
                    // 自动续写逻辑（暂不适配流式，保留原意但需注意 assistantResponse 已填充）
                    // ... existing truncated logic if needed, but usually not with 8k limit
                    success = true;
                } catch (err) {
                    if (aborted) return;
                    retryCount++;
                    const isRetryable = err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.response?.status >= 500;
                    
                    if (retryCount < maxRetries && isRetryable) {
                        console.warn(`[Agent] Ollama connection error (${err.code}). Retrying in 2s...`);
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    } else {
                        console.error(`Ollama Error (${ollamaUrl}):`, err.message);
                        if (!res.writableEnded) {
                            res.write(`data: ${JSON.stringify({ text: `Ollama 连接失败 (${ollamaUrl}): ${err.message}${retryCount >= maxRetries ? ' (已达到最大重试次数)' : ''}` })}\n\n`);
                            sendDone();
                        }
                        return;
                    }
                }
            }
        } else if (provider === 'copilot' || provider === 'github') {
            if (aborted) return;
            try {
                const { apiToken } = await resolveCopilotAuth(config?.copilotToken || "");
                const resolvedModel = normalizeCopilotModelId(model || 'gpt-4o');
                console.log(`[Agent] Calling GitHub Copilot (Model: ${resolvedModel})`);

                let userContent = currentPrompt;
                if (imageBase64s.length > 0) {
                    userContent = [
                        { type: 'text', text: currentPrompt },
                        ...imageBase64s.map(img => ({
                            type: 'image_url',
                            image_url: { url: `data:${img.mime};base64,${img.b64}` }
                        }))
                    ];
                }

                const copilotPayload = {
                    model: resolvedModel,
                    messages: [{ role: 'user', content: userContent }],
                    max_tokens: 16384
                };

                let hasHitTool = false;
                const streamed = await streamCopilotChat({
                    apiToken,
                    payload: copilotPayload,
                    signal: loopAbortController.signal,
                    onText: (content) => {
                        if (aborted) return;
                        assistantResponse += content;

                        if (!hasHitTool) {
                            if (assistantResponse.match(/(?:Tool|工具)[:：]/i)) {
                                hasHitTool = true;
                            }
                        }
                    },
                    onReasoning: (content) => {
                        if (aborted) return;
                        const cleanContent = String(content || '').replace(/<\/?think>/gi, '');
                        if (!cleanContent) return;
                        const isFirstReasoningChunk = !assistantReasoning;
                        assistantReasoning += cleanContent;
                        if (!res.writableEnded) {
                            assistantReasoningStreamed = true;
                            const streamedChunk = isFirstReasoningChunk ? `<think>${cleanContent}` : cleanContent;
                            res.write(`data: ${JSON.stringify({ text: streamedChunk })}\n\n`);
                        }
                    }
                });

                if (!assistantResponse.trim()) {
                    const fallbackText = await fetchCopilotChatOnce({
                        apiToken,
                        payload: copilotPayload,
                        signal: loopAbortController.signal
                    });
                    if (fallbackText) {
                        assistantResponse = fallbackText;
                    }
                } else if (streamed.finishReason === 'length') {
                    console.warn(`[Agent] GitHub Copilot response reached token limit for model ${resolvedModel}`);
                }

                if (false) for await (const chunk of response.data) {
                    if (aborted) break;
                    const lines = chunk.toString().split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ') && !line.includes('[DONE]')) {
                            try {
                                const data = JSON.parse(line.slice(6));
                                const content = data.choices[0]?.delta?.content || "";
                                if (content) {
                                    assistantResponse += content;

                                    if (!hasHitTool) {
                                        // Detect if we hit a tool call, including possible Chinese translations like "工具:"
                                        // "Tool:" is standard, "工具:" is sometimes output by multilingual models.
                                        if (assistantResponse.match(/(?:Tool|工具)[:：]/i)) {
                                            hasHitTool = true;
                                        } else {
                                            res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
                                        }
                                    }
                                }
                            } catch (e) {}
                        }
                    }
                }
            } catch (err) {
                const errorCode = err.code || err.response?.status || 'UNKNOWN';
                console.error(`GitHub API Error (${errorCode}):`, err.response?.data || err.message);
                res.write(`data: ${JSON.stringify({ text: `GitHub 模型调用失败 [${errorCode}]: ${err.response?.data?.error?.message || err.message}` })}\n\n`);
                sendDone();
                return;
            }
        } else {
            if (aborted) return;
            try {
                const providerLabel = getChatProviderLabel(provider);
                console.log(`[Agent] Calling ${providerLabel} (Model: ${model})`);

                let hasHitTool = false;
                assistantResponse = await callLLM(
                    provider,
                    model,
                    ollamaUrl,
                    currentPrompt,
                    config,
                    (content) => {
                        if (aborted) return;
                        if (!hasHitTool && String(content || '')) {
                            if ((assistantResponse + content).match(/(?:Tool|工具)[:：]/i)) {
                                hasHitTool = true;
                            }
                        }
                    }
                );
            } catch (err) {
                if (aborted) return;
                const providerLabel = getChatProviderLabel(provider);
                const errorCode = err.code || err.response?.status || 'UNKNOWN';
                const errorMessage = err.response?.data?.error?.message
                    || err.response?.data?.message
                    || err.message
                    || 'Unknown error';
                console.error(`${providerLabel} API Error (${errorCode}):`, err.response?.data || err.message);
                if (!res.writableEnded) {
                    res.write(`data: ${JSON.stringify({ text: `${providerLabel} 模型调用失败 [${errorCode}]: ${errorMessage}` })}\n\n`);
                    sendDone();
                }
                return;
            }
        }

        const reasoningText = assistantReasoning.trim();
        if (reasoningText) {
            const reasoningPart = `<think>${reasoningText}</think>\n`;
            currentParts.push({ type: 'text', content: reasoningPart });
            await persist();
            if (!aborted && !res.writableEnded) {
                const reasoningTail = assistantReasoningStreamed ? '</think>\n' : reasoningPart;
                res.write(`data: ${JSON.stringify({ text: reasoningTail })}\n\n`);
            }
        }

        // Parse Thought for persistence (Don't stream again as it was streamed during LLM call)
        // Also support Chinese "思考:" as a fallback
        const thoughtMatch = assistantResponse.match(/(?:Thought|思考)[:：]\s*([\s\S]*?)(?=(?:Tool|工具)[:：]|$)/i);
        if (thoughtMatch) {
            const thoughtText = `<think>${thoughtMatch[1].trim()}</think>\n`;
            currentParts.push({ type: 'text', content: thoughtText });
            await persist();
        }

        // --- Multi-Tool execution (Robust Parsing) ---
        const toolMatches = [];
        let searchIndex = 0;
        
        // Loop to find all tool calls, supporting both "Tool:" and "工具:"
        // 改为只匹配行首的 Tool: 标识，避免误触对话中的描述文本
        while (true) {
            // 使用正则：必须是在字符串开头或者紧跟在换行符之后
            const regex = /(?:^|\n)(?:[`*]*)(?:Tool|工具)[:：]\s*/i;
            const match = assistantResponse.substring(searchIndex).match(regex);
            if (!match) break;

            const toolMatchText = match[0];
            const startOfTool = searchIndex + match.index + toolMatchText.length;
            const openParenIndex = assistantResponse.indexOf('(', startOfTool);
            
            if (openParenIndex === -1) {
                // False alarm or malformed, skip this header
                searchIndex = startOfTool;
                continue;
            }

            const toolName = assistantResponse.substring(startOfTool, openParenIndex).trim();
            
            // Find balanced closing parenthesis
            let balance = 0;
            let closingParenIndex = -1;
            let inStr = false;
            let strChar = "";
            let escaped = false;

            for (let i = openParenIndex; i < assistantResponse.length; i++) {
                const char = assistantResponse[i];
                if (escaped) {
                    escaped = false;
                    continue;
                }
                if (char === '\\') {
                    escaped = true;
                    continue;
                }
                if ((char === '"' || char === "'") && !escaped) {
                    if (!inStr) {
                        inStr = true;
                        strChar = char;
                    } else if (char === strChar) {
                        inStr = false;
                    }
                }
                if (!inStr) {
                    if (char === '(') balance++;
                    if (char === ')') balance--;
                    if (balance === 0) {
                        closingParenIndex = i;
                        break;
                    }
                }
            }

            if (closingParenIndex !== -1) {
                const rawArgs = assistantResponse.substring(openParenIndex + 1, closingParenIndex);
                toolMatches.push({ name: toolName, rawArgs });
                searchIndex = closingParenIndex + 1;
            } else {
                searchIndex = startOfTool;
            }
        }

        if (aborted) return;

        if (toolMatches.length > 0) {
            invalidStructuredReplyCount = 0;
            for (const match of toolMatches) {
                if (aborted) return;
                const toolNameRaw = match.name;
                const toolName = toolNameRaw.toLowerCase().trim();
                const rawArgs = match.rawArgs.trim();

                let args = [];
                if (toolName === 'updatetodo' || toolName === 'todo') {
                    args = [decodeStructuredToolArgument(rawArgs)];
                } else {
                    // Robust tool argument parser
                    let current = "";
                    let inQuotes = false;
                    let quoteChar = "";
                    let esc = false;

                    for (let i = 0; i < rawArgs.length; i++) {
                        const char = rawArgs[i];
                        if (esc) {
                            if (char === 'n') current += '\n';
                            else if (char === 'r') current += '\r';
                            else if (char === 't') current += '\t';
                            else current += char;
                            esc = false;
                            continue;
                        }
                        if (char === '\\') {
                            const next = rawArgs[i + 1];
                            if (next === '"' || next === "'" || next === '\\' || next === 'n' || next === 'r' || next === 't') {
                                esc = true;
                                continue;
                            }
                        }
                        if ((char === '"' || char === "'")) {
                            if (!inQuotes) {
                                inQuotes = true;
                                quoteChar = char;
                            } else if (char === quoteChar) {
                                inQuotes = false;
                            } else {
                                current += char;
                            }
                        } else if (char === ',' && !inQuotes) {
                            args.push(current.trim());
                            current = "";
                        } else {
                            current += char;
                        }
                    }
                    if (current.trim() || rawArgs.endsWith(',')) {
                        args.push(current.trim());
                    }
                }

                if (toolName === 'updatetodo' || toolName === 'todo') {
                    const nextTodoList = normalizeAgentTodoUpdate(args[0], currentTodoList);
                    if (nextTodoList.error) {
                        currentPrompt += `\nAssistant: Tool: ${toolNameRaw}(${rawArgs})\nObservation: Error: ${nextTodoList.error}\n`;
                    } else {
                        currentTodoList = nextTodoList;
                        assistantMsg.todoList = currentTodoList;
                        await persist();
                        if (!aborted && !res.writableEnded) {
                            res.write(`data: ${JSON.stringify({ type: 'todo', todo: currentTodoList })}\n\n`);
                        }
                        const completedCount = currentTodoList.items.filter(item => item.status === 'completed').length;
                        currentPrompt += `\nAssistant: Tool: ${toolNameRaw}(${JSON.stringify(args[0]).slice(0, 1200)})\nObservation: Todo list updated (${completedCount}/${currentTodoList.items.length} completed).\n`;
                    }
                    continue;
                }

                if (toolName === 'respond') {
                    const finalReply = args[0] || "";
                    if (shouldUseMemory) {
                        try {
                            await memoryService.updateWorkingMemory(chatId, {
                                user: message,
                                assistant: finalReply,
                                notes: memoryContext?.summaryText || '',
                            });
                            await memoryService.autoCaptureFromTurn({
                                chatId,
                                userMessage: message,
                                assistantMessage: finalReply,
                                provider,
                                model,
                                ollamaUrl,
                                config: { ...config, systemPrompt: 'You extract durable user memories accurately and return structured data only.' },
                                callLLM,
                            });
                        } catch (memoryErr) {
                            console.warn('[Memory] Post-response capture failed:', memoryErr.message);
                        }
                    }
                    if (currentTodoList?.items?.length) {
                        currentTodoList = {
                            ...currentTodoList,
                            status: 'done',
                            closed: true,
                            updatedAt: new Date().toISOString(),
                        };
                        assistantMsg.todoList = currentTodoList;
                        await persist();
                        if (!aborted && !res.writableEnded) {
                            res.write(`data: ${JSON.stringify({ type: 'todo', todo: currentTodoList })}\n\n`);
                        }
                    }
                    if (!aborted && !res.writableEnded) {
                        res.write(`data: ${JSON.stringify({ text: finalReply })}\n\n`);
                        currentParts.push({ type: 'text', content: finalReply });
                        await persist();
                        sendDone();
                    }
                    return;
                }

                const actionId = createAgentActionId();
                const actionPayload = { id: actionId, type: toolNameRaw, args: args };
                const actionControl = registerAgentAction(actionId, {
                    toolName: toolNameRaw,
                    args,
                    chatId,
                    assistantMsgId,
                });

                // Stream Action to UI
                if (!aborted && !res.writableEnded) {
                    res.write(`data: ${JSON.stringify({ action: actionPayload })}\n\n`);
                }
                const actionPart = { type: 'action', data: actionPayload };
                currentParts.push(actionPart);
                await persist();

                // Helper for robust path resolution
                const cleanToolPath = (p) => (p || "").toString().replace(/^["']|["']$/g, '').trim();
                const resolveFixedUserPathAlias = (rawPath) => {
                    const aliases = [
                        ['Desktop', desktopPath],
                        ['桌面', desktopPath],
                        ['Documents', envInfo.paths.documents],
                        ['文档', envInfo.paths.documents],
                        ['Downloads', envInfo.paths.downloads],
                        ['下载', envInfo.paths.downloads],
                        ['Pictures', envInfo.paths.pictures],
                        ['图片', envInfo.paths.pictures],
                    ];

                    for (const [alias, aliasPath] of aliases) {
                        const aliasPattern = new RegExp(`^[\\\\/]*(?:~[\\\\/])?${alias}[\\\\/](.*)$`, 'i');
                        const match = rawPath.match(aliasPattern);
                        if (match) {
                            return path.join(aliasPath, match[1] || '');
                        }
                    }
                    return null;
                };

                const resolvePath = (p) => {
                    let cleanP = cleanToolPath(p);
                    // 默认执行文件夹为 FILES_DIR
                    if (!cleanP || cleanP === '.' || cleanP === './') return FILES_DIR;

                    const fixedAliasPath = resolveFixedUserPathAlias(cleanP);
                    if (fixedAliasPath) return fixedAliasPath;

                    if (cleanP.match(/^[\\\/]*Desktop[\\\/]/i)) {
                        cleanP = cleanP.replace(/^[\\\/]*Desktop[\\\/]/i, '');
                        return path.join(desktopPath, cleanP);
                    }
                    if (path.isAbsolute(cleanP)) return cleanP;

                    // 如果是简单文件名且不包含路径分隔符，则默认保存在 FILES_DIR
                    if (!cleanP.includes('/') && !cleanP.includes('\\')) {
                        return path.join(FILES_DIR, cleanP);
                    }

                    return path.resolve(process.cwd(), cleanP);
                };

                const resolveToolPath = (p) => {
                    const resolved = resolvePath(p);
                    if (permissionMode !== AGENT_PERMISSION_MODE_DEFAULT) {
                        return resolved;
                    }

                    const raw = cleanToolPath(p);
                    if (!raw || raw === '.' || raw === './') return FILES_DIR;
                    if (path.isAbsolute(raw)) return resolved;
                    return path.resolve(FILES_DIR, raw);
                };

                const resolveWritePath = (p) => {
                    const raw = cleanToolPath(p);
                    if (!raw || raw === '.' || raw === './') {
                        return { filePath: FILES_DIR, usedWorkspaceDefault: true };
                    }

                    const fixedAliasPath = resolveFixedUserPathAlias(raw);
                    if (fixedAliasPath) {
                        return { filePath: fixedAliasPath, usedWorkspaceDefault: false };
                    }
                    if (path.isAbsolute(raw)) {
                        return { filePath: raw, usedWorkspaceDefault: false };
                    }

                    const workspacePath = path.resolve(FILES_DIR, raw);
                    if (!isPathInside(FILES_DIR, workspacePath)) {
                        return {
                            filePath: workspacePath,
                            usedWorkspaceDefault: true,
                            error: `Error: Relative write paths cannot escape the workspace files directory ${FILES_DIR}. Choose a normal subfolder path such as "my-project/index.html".`,
                        };
                    }

                    return { filePath: workspacePath, usedWorkspaceDefault: true };
                };

                const requestUserApproval = async ({ reasonKey, reason, summary }) => {
                    const approvalRequest = buildApprovalRequest({
                        toolName: toolNameRaw,
                        args,
                        reasonKey,
                        reason,
                        summary,
                    });
                    const waitingObservation = `Approval required: ${reason}`;
                    actionPart.observation = waitingObservation;
                    await persist();
                    unregisterAgentAction(actionId);

                    if (!aborted && !res.writableEnded) {
                        res.write(`data: ${JSON.stringify({ observation: waitingObservation })}\n\n`);
                        res.write(`data: ${JSON.stringify({ approvalRequest })}\n\n`);
                        streamCompleted = true;
                        clearInterval(heartbeatTimer);
                        res.end();
                    }

                    return true;
                };

                let observation = "";
                let fileMetadata = null;
                let generatedFile = null;
                try {
                    if (toolName === 'search') {
                        const results = await searchWeb(args[0]);
                        observation = results.length > 0 ? results.map(r => `### [${r.title}](${r.url})\n${r.content}`).join('\n\n') : "No search results found.";
                    } else if (toolName === 'browse') {
                        const url = args[0];
                        observation = await crawlUrl(url);
                    } else if (toolName === 'draw') {
                        const prompt = args[0];
                        const drawResult = await generateImageWithConfiguredProvider({
                            prompt,
                            config,
                            referenceImages: imageBase64s,
                            chatId,
                            assistantMsgId,
                            requestedWidth: parseInt(args[1]),
                            requestedHeight: parseInt(args[2]),
                            fallbackWidth: 512,
                            fallbackHeight: 512,
                            requestContext: message,
                            logLabel: 'Agent',
                        });
                        observation = drawResult.observation;
                        generatedFile = drawResult.generatedFile;
                    } else if (toolName === 'composemusic') {
                        const musicPrompt = String(args[0] || '').trim();
                        const requestedBars = args[1];

                        if (config?.musicEnabled === false) {
                            observation = "Error: Music generation is disabled in Settings.";
                        } else if (!musicPrompt) {
                            observation = "Error: composeMusic requires a prompt describing the instrumental style or mood.";
                        } else {
                            try {
                                const musicResult = await generateMusicArtifactFromPrompt({
                                    prompt: musicPrompt,
                                    bars: requestedBars,
                                    provider,
                                    model,
                                    ollamaUrl,
                                    config,
                                    chatId,
                                    assistantMsgId,
                                });
                                observation = musicResult.observation;
                                generatedFile = musicResult.generatedFile;
                            } catch (musicError) {
                                observation = `Error creating music: ${musicError.message}`;
                            }
                        }
                    } else if (toolName === 'terminal') {
                        const terminalPermission = evaluateTerminalPermission(args[0], permissionMode);
                        const terminalApproved = isApprovalGrantedForAction(approvalDecision, toolNameRaw, args);

                        if (!terminalPermission.allowed && terminalPermission.requiresApproval && !terminalApproved) {
                            await requestUserApproval({
                                reasonKey: terminalPermission.reasonKey,
                                reason: terminalPermission.reason,
                                summary: terminalPermission.summary || args[0] || '',
                            });
                            return;
                        }

                        if (actionControl.skipRequested) {
                            observation = "Skipped: The user manually skipped this terminal command before it started. Continue without relying on its output.";
                        } else if (!terminalPermission.allowed && !terminalPermission.requiresApproval) {
                            observation = terminalPermission.reason;
                        } else {
                            const executionDir = terminalPermission.cwd || FILES_DIR;
                            const terminalTimeoutMs = normalizeTerminalTimeoutMs(args[1]);
                            const commandRes = await runTerminalCommand({
                                command: args[0],
                                cwd: executionDir,
                                actionControl,
                                timeoutMs: terminalTimeoutMs,
                            });

                            if (commandRes.skipped) {
                                const reasonText = commandRes.reason === 'timeout'
                                    ? `Skipped: Terminal command exceeded ${formatDurationMs(commandRes.timeoutMs || terminalTimeoutMs)} and was stopped. Continue without relying on its output.`
                                    : "Skipped: The user manually skipped this terminal command. Continue without relying on its output.";
                                observation = `${reasonText}\nSTDOUT before skip: ${commandRes.out || ''}\nSTDERR before skip: ${commandRes.err || ''}`;
                            } else {
                                observation = `STDOUT: ${commandRes.out}\nSTDERR: ${commandRes.err}`;
                            }
                            if (!commandRes.skipped && !commandRes.out.trim() && !commandRes.err.trim()) observation = "Command executed (no standard output).";
                        }
                    } else if (toolName === 'manage_hosted_tasks') {
                        const action = args[0];
                        const taskActionApproved = isApprovalGrantedForAction(approvalDecision, toolNameRaw, args);
                        if (
                            permissionMode === AGENT_PERMISSION_MODE_DEFAULT &&
                            (action === 'add' || action === 'delete') &&
                            !taskActionApproved
                        ) {
                            await requestUserApproval({
                                reasonKey: 'sandbox-task-schedule',
                                reason: 'Changing hosted tasks requires user approval in default permission mode.',
                                summary: `${action}: ${(args[1] || '').slice(0, 500)}`,
                            });
                            return;
                        }
                        if (action === 'add') {
                            try {
                                const configStr = args[1];
                                const taskConfig = JSON.parse(configStr);
                                const newTask = await taskScheduler.addTask(taskConfig);
                                observation = `Hosted task added successfully. ID: ${newTask.id}`;
                            } catch (e) {
                                observation = `Error adding task: ${e.message}. Ensure JSON is valid.`;
                            }
                        } else if (action === 'delete') {
                            await taskScheduler.deleteTask(args[1]);
                            observation = "Hosted task deleted.";
                        } else if (action === 'list') {
                            const tasks = await taskScheduler.listTasks();
                            observation = JSON.stringify(tasks, null, 2);
                        } else {
                            observation = "Invalid action. Use 'add', 'delete', or 'list'.";
                        }
                    } else if (toolName === 'createprojectfolder') {
                        const folderName = sanitizeProjectFolderName(args[0] || 'project');
                        const projectPath = path.join(FILES_DIR, folderName);
                        await fs.ensureDir(projectPath);
                        observation = `Success: Project folder ready at ${projectPath}. Put all project files for this deliverable inside this folder.`;
                    } else if (toolName === 'ensuredir') {
                        const writePathResult = resolveWritePath(args[0]);
                        const dirPath = writePathResult.filePath;
                        if (writePathResult.error) {
                            observation = writePathResult.error;
                        } else if (permissionMode === AGENT_PERMISSION_MODE_DEFAULT && !isSandboxPath(dirPath)) {
                            observation = `Permission denied: default permission only allows creating folders inside sandbox ${FILES_DIR}. Switch to full access for broader paths.`;
                        } else if (permissionMode === AGENT_PERMISSION_MODE_DEFAULT && isSensitivePath(dirPath)) {
                            observation = 'Permission denied: default permission blocks creating sensitive config or secret folders.';
                        } else if (isProtectedProjectCreationPath(dirPath)) {
                            observation = `Error: Refusing to create a new folder inside this project's code directories: ${dirPath}. New user projects must be created under ${FILES_DIR}.`;
                        } else {
                            await fs.ensureDir(dirPath);
                            observation = `Success: Directory ready at ${dirPath}`;
                        }
                    } else if (toolName === 'readfile') {
                        const filePath = resolveToolPath(args[0]);
                        if (permissionMode === AGENT_PERMISSION_MODE_DEFAULT && !isSandboxPath(filePath)) {
                            observation = `Permission denied: default permission only allows reading files inside sandbox ${FILES_DIR}. Switch to full access for broader file access.`;
                        } else if (permissionMode === AGENT_PERMISSION_MODE_DEFAULT && isSensitivePath(filePath)) {
                            observation = 'Permission denied: default permission blocks reading sensitive config or secret files.';
                        } else if (!(await fs.exists(filePath))) {
                            // Check if it exists in memories instead
                            const memPath = path.join(MEMORIES_DIR, args[0].endsWith('.txt') ? args[0] : `${args[0]}.txt`);
                            if (await fs.exists(memPath)) {
                                observation = `Error: File not found at ${filePath}. However, a matching file was found in the Knowledge Base. Use 'readMemory("${args[0]}")' to read it.`;
                            } else {
                                observation = `Error: File not found at ${filePath}. Check path or list directory.`;
                            }
                        } else {
                            const stats = await fs.stat(filePath);
                            if (!stats.isFile()) {
                                observation = `Error: ${filePath} is not a regular file. Use listDir for directories.`;
                            } else if (isImageFile(filePath)) {
                                observation = "[Image File] (This image is already visible to you in the current context)";
                            } else if (isBinaryOfficeFile(filePath)) {
                                observation = await parseFile(filePath, "");
                            } else {
                                const snapshot = await readTextFileSnapshot(filePath, stats);
                                if (snapshot.isBinary) {
                                    observation = `Error: ${filePath} appears to be binary (${formatFileSize(stats.size)}). Refusing to read it as text.`;
                                } else {
                                    observation = buildTextFileObservation({
                                        filePath,
                                        content: snapshot.content,
                                        stats,
                                        startArg: args[1],
                                        endArg: args[2],
                                        fileHash: snapshot.hash,
                                        textFormat: snapshot.format,
                                    });
                                }
                            }
                        }
                    } else if (toolName === 'planfileread') {
                        const filePath = resolveToolPath(args[0]);
                        const chunkLines = parsePositiveInteger(args[1], LARGE_FILE_CHUNK_LINES, READ_FILE_RANGE_MAX_LINES);
                        if (permissionMode === AGENT_PERMISSION_MODE_DEFAULT && !isSandboxPath(filePath)) {
                            observation = `Permission denied: default permission only allows reading files inside sandbox ${FILES_DIR}. Switch to full access for broader file access.`;
                        } else if (permissionMode === AGENT_PERMISSION_MODE_DEFAULT && isSensitivePath(filePath)) {
                            observation = 'Permission denied: default permission blocks reading sensitive config or secret files.';
                        } else if (!(await fs.exists(filePath))) {
                            observation = `Error: File not found at ${filePath}. Check path or list directory.`;
                        } else {
                            const stats = await fs.stat(filePath);
                            if (!stats.isFile()) {
                                observation = `Error: ${filePath} is not a regular file. Use listDir for directories.`;
                            } else if (isImageFile(filePath) || isBinaryOfficeFile(filePath)) {
                                observation = `Error: ${filePath} is not a plain text file suitable for chunked reading.`;
                            } else {
                                const snapshot = await readTextFileSnapshot(filePath, stats);
                                if (snapshot.isBinary) {
                                    observation = `Error: ${filePath} appears to be binary (${formatFileSize(stats.size)}). Refusing to read it as text.`;
                                } else {
                                    observation = buildFileChunkPlanObservation({
                                        filePath,
                                        content: snapshot.content,
                                        stats,
                                        fileHash: snapshot.hash,
                                        chunkLines,
                                    });
                                }
                            }
                        }
                    } else if (toolName === 'readfilechunk') {
                        const filePath = resolveToolPath(args[0]);
                        const chunkIndex = parsePositiveInteger(args[1], 1, Number.MAX_SAFE_INTEGER);
                        const chunkLines = parsePositiveInteger(args[2], LARGE_FILE_CHUNK_LINES, READ_FILE_RANGE_MAX_LINES);
                        if (permissionMode === AGENT_PERMISSION_MODE_DEFAULT && !isSandboxPath(filePath)) {
                            observation = `Permission denied: default permission only allows reading files inside sandbox ${FILES_DIR}. Switch to full access for broader file access.`;
                        } else if (permissionMode === AGENT_PERMISSION_MODE_DEFAULT && isSensitivePath(filePath)) {
                            observation = 'Permission denied: default permission blocks reading sensitive config or secret files.';
                        } else if (!(await fs.exists(filePath))) {
                            observation = `Error: File not found at ${filePath}. Check path or list directory.`;
                        } else {
                            const stats = await fs.stat(filePath);
                            if (!stats.isFile()) {
                                observation = `Error: ${filePath} is not a regular file. Use listDir for directories.`;
                            } else if (isImageFile(filePath) || isBinaryOfficeFile(filePath)) {
                                observation = `Error: ${filePath} is not a plain text file suitable for chunked reading.`;
                            } else {
                                const snapshot = await readTextFileSnapshot(filePath, stats);
                                if (snapshot.isBinary) {
                                    observation = `Error: ${filePath} appears to be binary (${formatFileSize(stats.size)}). Refusing to read it as text.`;
                                } else {
                                    const lineCount = splitTextForLineEdit(snapshot.content).lines.length;
                                    const chunkCount = Math.max(1, Math.ceil(Math.max(1, lineCount) / chunkLines));
                                    if (chunkIndex < 1 || chunkIndex > chunkCount) {
                                        observation = `Error: chunkIndex ${chunkIndex} is outside the available range 1-${chunkCount}. Use planFileRead first.`;
                                    } else {
                                        const startLine = (chunkIndex - 1) * chunkLines + 1;
                                        const endLine = Math.min(lineCount, startLine + chunkLines - 1);
                                        observation = buildTextFileObservation({
                                            filePath,
                                            content: snapshot.content,
                                            stats,
                                            startArg: startLine,
                                            endArg: endLine,
                                            fileHash: snapshot.hash,
                                            textFormat: snapshot.format,
                                        });
                                    }
                                }
                            }
                        }
                    } else if (toolName === 'writefile') {
                        const writePathResult = resolveWritePath(args[0]);
                        const filePath = writePathResult.filePath;
                        const expectedHash = args[2];
                        const writeApproved = isApprovalGrantedForAction(approvalDecision, toolNameRaw, args);

                        if (writePathResult.error) {
                            observation = writePathResult.error;
                        } else if (permissionMode === AGENT_PERMISSION_MODE_DEFAULT && !isSandboxPath(filePath)) {
                            observation = `Permission denied: default permission only allows writing files inside sandbox ${FILES_DIR}. Switch to full access to modify project files.`;
                        } else if (permissionMode === AGENT_PERMISSION_MODE_DEFAULT && isSensitivePath(filePath)) {
                            observation = 'Permission denied: default permission blocks writing sensitive config or secret files.';
                        } else {
                            let approvalRequested = false;
                            await withFileLock(filePath, async () => {
                                let before = null;
                                let beforeHash = null;
                                let textFormat = null;

                                if (await fs.exists(filePath)) {
                                    const stats = await fs.stat(filePath);
                                    if (!stats.isFile()) {
                                        observation = `Error: ${filePath} is not a regular file and cannot be overwritten with writeFile.`;
                                    } else {
                                        const snapshot = await readTextFileSnapshot(filePath, stats);
                                        if (snapshot.isBinary) {
                                            observation = `Error: ${filePath} appears to be binary (${formatFileSize(stats.size)}). Refusing to overwrite it as text.`;
                                        } else {
                                            const hashCheck = validateExpectedFileHash(expectedHash, snapshot.hash, 'overwrite');
                                            if (!hashCheck.ok) {
                                                observation = hashCheck.error;
                                            } else {
                                                before = snapshot.content;
                                                beforeHash = snapshot.hash;
                                                textFormat = snapshot.format;
                                            }
                                        }
                                    }
                                }

                                if (!observation && before === null && isProtectedProjectCreationPath(filePath)) {
                                    observation = `Error: Refusing to create a new file inside this project's code directories: ${filePath}. New user files and generated projects must be created under the workspace files directory ${FILES_DIR}, preferably inside a dedicated project folder.`;
                                }
                                if (observation) {
                                    return;
                                }
                                if (permissionMode === AGENT_PERMISSION_MODE_DEFAULT && before !== null && !writeApproved) {
                                    approvalRequested = true;
                                    await requestUserApproval({
                                        reasonKey: 'sandbox-file-overwrite',
                                        reason: 'Overwriting an existing sandbox file requires user approval.',
                                        summary: filePath,
                                    });
                                    return;
                                }
                                const after = args[1] || "";
                                const writeResult = await atomicWriteTextFile(filePath, after, textFormat);
                                const afterLineCount = splitTextForLineEdit(after).lines.length;
                                const operation = before === null ? 'create' : 'overwrite';
                                observation = `Success: File written to ${filePath} (${formatFileSize(writeResult.sizeBytes)}, ${afterLineCount} lines, SHA256 ${writeResult.hash}). Atomic write and verification passed.`;
                                fileMetadata = {
                                    filePath,
                                    before,
                                    after,
                                    operation,
                                    beforeHash,
                                    afterHash: writeResult.hash,
                                    encoding: textFormat?.label || 'UTF-8',
                                    textFormat: serializeTextFormat(textFormat),
                                };
                                generatedFile = await buildDownloadableFile(filePath);
                            });
                            if (approvalRequested) return;
                        }
                    } else if (toolName === 'editfile') {
                        const filePath = resolveToolPath(args[0]);
                        const startLine = parseToolLineNumber(args[1]);
                        const endLine = parseToolLineNumber(args[2]);
                        const newContentText = args[3] || "";
                        const expectedHash = args[4];
                        const editApproved = isApprovalGrantedForAction(approvalDecision, toolNameRaw, args);
                        if (permissionMode === AGENT_PERMISSION_MODE_DEFAULT && !isSandboxPath(filePath)) {
                            observation = `Permission denied: default permission only allows editing files inside sandbox ${FILES_DIR}. Switch to full access to edit project files.`;
                        } else if (permissionMode === AGENT_PERMISSION_MODE_DEFAULT && isSensitivePath(filePath)) {
                            observation = 'Permission denied: default permission blocks editing sensitive config or secret files.';
                        } else if (startLine === null || endLine === null || Number.isNaN(startLine) || Number.isNaN(endLine)) {
                            observation = `Error: Invalid line numbers. Use 'readFile' to check line numbers first.`;
                        } else if (!(await fs.exists(filePath))) {
                            observation = `Error: File not found at ${filePath}`;
                        } else {
                            let approvalRequested = false;
                            await withFileLock(filePath, async () => {
                                const stats = await fs.stat(filePath);
                                if (!stats.isFile()) {
                                    observation = `Error: ${filePath} is not a regular file and cannot be edited with editFile.`;
                                } else {
                                    const snapshot = await readTextFileSnapshot(filePath, stats);
                                    if (snapshot.isBinary) {
                                        observation = `Error: ${filePath} appears to be binary (${formatFileSize(stats.size)}). Refusing to edit it as text.`;
                                        return;
                                    }

                                    const hashCheck = validateExpectedFileHash(expectedHash, snapshot.hash, 'edit');
                                    if (!hashCheck.ok) {
                                        observation = hashCheck.error;
                                        return;
                                    }

                                    const before = snapshot.content;
                                    const editable = splitTextForLineEdit(before);
                                    const lineCount = editable.lines.length;
                                    const isInsertion = endLine < startLine;

                                    if (startLine < 1) {
                                        observation = 'Error: Invalid line range. startLine must be 1 or greater.';
                                    } else if (isInsertion && startLine > lineCount + 1) {
                                        observation = `Error: Cannot insert at line ${startLine}; file has ${lineCount} lines. Use startLine ${lineCount + 1} to append.`;
                                    } else if (!isInsertion && startLine > lineCount) {
                                        observation = `Error: startLine ${startLine} is beyond the end of the file (${lineCount} lines).`;
                                    } else if (!isInsertion && endLine > lineCount) {
                                        observation = `Error: endLine ${endLine} is beyond the end of the file (${lineCount} lines). Re-read the file or use a smaller range.`;
                                    } else {
                                        if (permissionMode === AGENT_PERMISSION_MODE_DEFAULT && !editApproved) {
                                            approvalRequested = true;
                                            await requestUserApproval({
                                                reasonKey: 'sandbox-file-edit',
                                                reason: 'Editing an existing sandbox file requires user approval.',
                                                summary: `${filePath}:${startLine}-${endLine}`,
                                            });
                                            return;
                                        }

                                        const start = startLine - 1;
                                        const count = isInsertion ? 0 : (endLine - startLine + 1);
                                        const newLines = splitReplacementLines(newContentText);
                                        const lines = [...editable.lines];
                                        lines.splice(start, count, ...newLines);
                                        const after = joinTextFromLineEdit(lines, editable.eol, editable.hasTrailingNewline);
                                        const writeResult = await atomicWriteTextFile(filePath, after, snapshot.format);
                                        const lineDelta = lines.length - lineCount;
                                        const editSummary = isInsertion
                                            ? `inserted ${newLines.length} line${newLines.length === 1 ? '' : 's'} at line ${startLine}`
                                            : `replaced lines ${startLine}-${endLine} with ${newLines.length} line${newLines.length === 1 ? '' : 's'}`;
                                        observation = `Success: File ${filePath} updated (${editSummary}, line delta ${lineDelta >= 0 ? '+' : ''}${lineDelta}, SHA256 ${writeResult.hash}). Atomic write and verification passed.`;
                                        fileMetadata = {
                                            filePath,
                                            before,
                                            after,
                                            operation: 'edit',
                                            beforeHash: snapshot.hash,
                                            afterHash: writeResult.hash,
                                            encoding: snapshot.format?.label || 'UTF-8',
                                            textFormat: serializeTextFormat(snapshot.format),
                                        };
                                        generatedFile = await buildDownloadableFile(filePath);
                                    }
                                }
                            });
                            if (approvalRequested) return;
                        }
                    } else if (toolName === 'replaceinfile') {
                        const filePath = resolveToolPath(args[0]);
                        const oldText = String(args[1] ?? '');
                        const newText = String(args[2] ?? '');
                        const expectedHash = args[3];
                        const requestedOccurrence = parsePositiveInteger(args[4], 0, Number.MAX_SAFE_INTEGER);
                        const editApproved = isApprovalGrantedForAction(approvalDecision, toolNameRaw, args);

                        if (permissionMode === AGENT_PERMISSION_MODE_DEFAULT && !isSandboxPath(filePath)) {
                            observation = `Permission denied: default permission only allows editing files inside sandbox ${FILES_DIR}. Switch to full access to edit project files.`;
                        } else if (permissionMode === AGENT_PERMISSION_MODE_DEFAULT && isSensitivePath(filePath)) {
                            observation = 'Permission denied: default permission blocks editing sensitive config or secret files.';
                        } else if (!oldText) {
                            observation = 'Error: replaceInFile requires a non-empty oldText argument.';
                        } else if (!(await fs.exists(filePath))) {
                            observation = `Error: File not found at ${filePath}`;
                        } else {
                            let approvalRequested = false;
                            await withFileLock(filePath, async () => {
                                const stats = await fs.stat(filePath);
                                if (!stats.isFile()) {
                                    observation = `Error: ${filePath} is not a regular file and cannot be edited with replaceInFile.`;
                                    return;
                                }

                                const snapshot = await readTextFileSnapshot(filePath, stats);
                                if (snapshot.isBinary) {
                                    observation = `Error: ${filePath} appears to be binary (${formatFileSize(stats.size)}). Refusing to edit it as text.`;
                                    return;
                                }

                                const hashCheck = validateExpectedFileHash(expectedHash, snapshot.hash, 'edit');
                                if (!hashCheck.ok) {
                                    observation = hashCheck.error;
                                    return;
                                }

                                const before = snapshot.content;
                                const matches = [];
                                let searchFrom = 0;
                                while (true) {
                                    const foundAt = before.indexOf(oldText, searchFrom);
                                    if (foundAt === -1) break;
                                    matches.push(foundAt);
                                    searchFrom = foundAt + Math.max(1, oldText.length);
                                    if (matches.length > 1000) break;
                                }

                                if (matches.length === 0) {
                                    observation = 'Error: oldText was not found in the file. Re-read the file and include a larger exact snippet.';
                                    return;
                                }
                                if (requestedOccurrence === 0 && matches.length !== 1) {
                                    observation = `Error: oldText matched ${matches.length} times. Pass a 1-based occurrence number as the fifth argument or use editFile with line numbers.`;
                                    return;
                                }
                                if (requestedOccurrence > matches.length) {
                                    observation = `Error: Requested occurrence ${requestedOccurrence} but oldText matched only ${matches.length} time${matches.length === 1 ? '' : 's'}.`;
                                    return;
                                }

                                if (permissionMode === AGENT_PERMISSION_MODE_DEFAULT && !editApproved) {
                                    approvalRequested = true;
                                    await requestUserApproval({
                                        reasonKey: 'sandbox-file-edit',
                                        reason: 'Editing an existing sandbox file requires user approval.',
                                        summary: `${filePath}: replace ${oldText.length} chars`,
                                    });
                                    return;
                                }

                                const matchIndex = matches[(requestedOccurrence || 1) - 1];
                                const after = `${before.slice(0, matchIndex)}${newText}${before.slice(matchIndex + oldText.length)}`;
                                const writeResult = await atomicWriteTextFile(filePath, after, snapshot.format);
                                const beforeLines = splitTextForLineEdit(before).lines.length;
                                const afterLines = splitTextForLineEdit(after).lines.length;
                                const lineDelta = afterLines - beforeLines;
                                observation = `Success: File ${filePath} updated with replaceInFile (occurrence ${requestedOccurrence || 1}/${matches.length}, line delta ${lineDelta >= 0 ? '+' : ''}${lineDelta}, SHA256 ${writeResult.hash}). Atomic write and verification passed.`;
                                fileMetadata = {
                                    filePath,
                                    before,
                                    after,
                                    operation: 'edit',
                                    beforeHash: snapshot.hash,
                                    afterHash: writeResult.hash,
                                    encoding: snapshot.format?.label || 'UTF-8',
                                    textFormat: serializeTextFormat(snapshot.format),
                                };
                                generatedFile = await buildDownloadableFile(filePath);
                            });
                            if (approvalRequested) return;
                        }
                    } else if (toolName === 'deletefile') {
                        const filePath = resolveToolPath(args[0]);
                        const expectedHash = args[1];
                        const deleteApproved = isApprovalGrantedForAction(approvalDecision, toolNameRaw, args);

                        if (permissionMode === AGENT_PERMISSION_MODE_DEFAULT && !isSandboxPath(filePath)) {
                            observation = `Permission denied: default permission only allows deleting files inside sandbox ${FILES_DIR}. Switch to full access to delete project files.`;
                        } else if (permissionMode === AGENT_PERMISSION_MODE_DEFAULT && isSensitivePath(filePath)) {
                            observation = 'Permission denied: default permission blocks deleting sensitive config or secret files.';
                        } else {
                            let approvalRequested = false;
                            await withFileLock(filePath, async () => {
                                if (!(await fs.exists(filePath))) {
                                    observation = `Error: File not found at ${filePath}`;
                                    return;
                                }
                                const stats = await fs.stat(filePath);
                                if (!stats.isFile()) {
                                    observation = `Error: ${filePath} is not a regular file and cannot be deleted with deleteFile.`;
                                    return;
                                }
                                const snapshot = await readTextFileSnapshot(filePath, stats);
                                if (snapshot.isBinary) {
                                    observation = `Error: ${filePath} appears to be binary (${formatFileSize(stats.size)}). Refusing to delete it with the text file tool.`;
                                    return;
                                }
                                const hashCheck = validateExpectedFileHash(expectedHash, snapshot.hash, 'delete');
                                if (!hashCheck.ok) {
                                    observation = hashCheck.error;
                                    return;
                                }
                                if (permissionMode === AGENT_PERMISSION_MODE_DEFAULT && !deleteApproved) {
                                    approvalRequested = true;
                                    await requestUserApproval({
                                        reasonKey: 'sandbox-file-delete',
                                        reason: 'Deleting a sandbox file requires user approval.',
                                        summary: filePath,
                                    });
                                    return;
                                }
                                const trashId = await moveToTrash(filePath);
                                observation = `Success: File moved to Trash. (ID: ${trashId})`;
                                fileMetadata = {
                                    filePath,
                                    before: snapshot.content,
                                    after: null,
                                    operation: 'delete',
                                    beforeHash: snapshot.hash,
                                    afterHash: null,
                                    trashId,
                                    encoding: snapshot.format?.label || 'UTF-8',
                                    textFormat: serializeTextFormat(snapshot.format),
                                };
                            });
                            if (approvalRequested) return;
                        }
                    } else if (toolName === 'listdir') {
                        const dirPath = resolveToolPath(args[0]);
                        const limit = parsePositiveInteger(args[1], LIST_DIR_DEFAULT_LIMIT, LIST_DIR_MAX_LIMIT);
                        const offset = parsePositiveInteger(args[2], 0, Number.MAX_SAFE_INTEGER);
                        const includeIgnored = /^(true|1|yes|all|include)$/i.test(String(args[3] || '').trim());
                        if (permissionMode === AGENT_PERMISSION_MODE_DEFAULT && !isSandboxPath(dirPath)) {
                            observation = `Permission denied: default permission only allows listing directories inside sandbox ${FILES_DIR}. Switch to full access for broader file access.`;
                        } else if (permissionMode === AGENT_PERMISSION_MODE_DEFAULT && isSensitivePath(dirPath)) {
                            observation = 'Permission denied: default permission blocks listing sensitive config or secret directories.';
                        } else if (!(await fs.exists(dirPath))) {
                            observation = `Error: Directory not found at ${dirPath}`;
                        } else {
                            const stats = await fs.stat(dirPath);
                            if (!stats.isDirectory()) {
                                observation = `Error: ${dirPath} is not a directory. Use readFile for files.`;
                            } else {
                                const ignoredNames = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.vite', '__pycache__', '.cache', 'coverage']);
                                const allEntries = await fs.readdir(dirPath, { withFileTypes: true });
                                const visibleEntries = includeIgnored
                                    ? allEntries
                                    : allEntries.filter(entry => !ignoredNames.has(entry.name));
                                visibleEntries.sort((a, b) => {
                                    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
                                    return a.name.localeCompare(b.name);
                                });
                                const page = visibleEntries.slice(offset, offset + limit);
                                const hiddenCount = allEntries.length - visibleEntries.length;
                                const header = [
                                    `Directory: ${dirPath}`,
                                    `Showing: ${page.length === 0 ? 0 : offset + 1}-${offset + page.length} of ${visibleEntries.length}`,
                                    hiddenCount > 0 && !includeIgnored ? `Ignored common heavy folders: ${hiddenCount}. Pass includeIgnored=true as the fourth argument to show them.` : null,
                                    offset + page.length < visibleEntries.length ? `Next page: listDir("${dirPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}", ${limit}, ${offset + page.length}${includeIgnored ? ', true' : ''})` : null,
                                ].filter(Boolean);
                                const body = page.map(f => `${f.isDirectory() ? '[DIR]' : '[FILE]'} ${f.name}`).join('\n');
                                observation = body ? `${header.join('\n')}\n\n${body}` : `${header.join('\n')}\n\n(Empty directory)`;
                            }
                        }
                    } else if (toolName === 'diagram') {
                        observation = args[0] || "";
                    } else if (toolName === 'listskills') {
                        try {
                            const list = (await skillService.listSkills({ enabledOnly: true })).map(skill =>
                                `- ${skill.name} [${skill.sourceType}] Key: ${skill.sourceMeta?.slug || skill.slug || skill.id}${skill.description ? `: ${skill.description}` : ''}`
                            );
                            observation = list.join('\n') || "(No installed skills)";
                        } catch (e) {
                            observation = `Error listing skills: ${e.message}`;
                        }
                    } else if (toolName === 'searchskills') {
                        try {
                            const query = args[0] || "";
                            if (!query.trim()) {
                                observation = "Error: Please specify a search query.";
                            } else {
                                const skills = await skillService.searchSkills(query, 8, { enabledOnly: true });
                                observation = skills.length > 0
                                    ? skills.map(skill =>
                                        `--- ${skill.name} [${skill.sourceType}] ---\nKey: ${skill.sourceMeta?.slug || skill.slug || skill.id}\nScore: ${skill.searchScore ?? 'n/a'}\nMatched: ${(skill.matchedTerms || []).join(', ') || 'n/a'}\n${skill.description || ''}\n${previewText(skill.content, 260)}`
                                    ).join('\n\n')
                                    : "No matching skills found.";
                            }
                        } catch (e) {
                            observation = `Error searching skills: ${e.message}`;
                        }
                    } else if (toolName === 'searchopenhubskills') {
                        try {
                            const query = args[0] || "";
                            if (!query.trim()) {
                                observation = "Error: Please specify a search query.";
                            } else {
                                const skills = await skillService.searchOpenHub(query, 8);
                                observation = skills.length > 0
                                    ? skills.map(skill =>
                                        `--- ${skill.name} [openhub:${skill.slug}] ---\nSlug: ${skill.slug}\nScore: ${skill.searchScore ?? 'n/a'}`
                                    ).join('\n\n')
                                    : "No matching OpenHub skills found.";
                            }
                        } catch (e) {
                            observation = `Error searching OpenHub skills: ${e.message}`;
                        }
                    } else if (toolName === 'inspectopenhubskill') {
                        try {
                            const slug = args[0];
                            if (!slug) {
                                observation = "Error: Please specify the OpenHub skill slug to inspect.";
                            } else {
                                const skill = await skillService.inspectOpenHubSkill(slug, { includeContent: true });
                                observation = `Name: ${skill.name}\nSlug: ${skill.slug}\nSource: ${skill.sourceType}\nVersion: ${skill.version || ''}\nOwner: ${skill.owner || ''}\nDownloads: ${skill.downloads}\nStars: ${skill.stars}\nDescription: ${skill.description || ''}\nTags: ${(skill.tags || []).join(', ')}\n\n${skill.content || '(No SKILL.md content returned)'}`;
                            }
                        } catch (e) {
                            observation = `Error inspecting OpenHub skill: ${e.message}`;
                        }
                    } else if (toolName === 'readskill') {
                        try {
                            const name = args[0];
                            if (!name) {
                                observation = "Error: Please specify the skill name to read.";
                            } else {
                                const skill = await skillService.getSkill(name, { enabledOnly: true });
                                observation = skill
                                    ? `Name: ${skill.name}\nSource: ${skill.sourceType}${skill.source ? ` (${skill.source})` : ''}\nDescription: ${skill.description || ''}\nTags: ${(skill.tags || []).join(', ')}\nUpdated: ${skill.updatedAt}\n\n${skill.content}`
                                    : `Error: Skill '${name}' not found.`;
                            }
                        } catch (e) {
                            observation = `Error reading skill: ${e.message}`;
                        }
                    } else if (toolName === 'installskill') {
                        const installSkillApproved = isApprovalGrantedForAction(approvalDecision, toolNameRaw, args);
                        if (permissionMode === AGENT_PERMISSION_MODE_DEFAULT && !installSkillApproved) {
                            await requestUserApproval({
                                reasonKey: 'sandbox-skill-install',
                                reason: 'Installing or updating skills requires user approval in default permission mode.',
                                summary: `${args[0] || 'unknown'}: ${(args[1] || '').slice(0, 500)}`,
                            });
                            return;
                        }
                        try {
                            const sourceType = (args[0] || '').toLowerCase();
                            let skill = null;
                            if (sourceType === 'openhub' || sourceType === 'clawhub') {
                                skill = await skillService.installFromOpenHub(args[1]);
                            } else if (sourceType === 'git') {
                                skill = await skillService.installFromGit(args[1]);
                            } else if (sourceType === 'local') {
                                skill = await skillService.installFromLocal(args[1]);
                            } else if (sourceType === 'manual') {
                                skill = await skillService.upsertSkill({
                                    name: args[1],
                                    content: args[2] || '',
                                    sourceType: 'manual',
                                    source: 'agent-tool',
                                });
                            } else {
                                observation = "Error: Unsupported sourceType. Use openhub, git, local, or manual.";
                            }
                            if (skill) {
                                observation = `Success: Skill '${skill.name}' installed from ${skill.sourceType}.`;
                            }
                        } catch (e) {
                            observation = `Error installing skill: ${e.message}`;
                        }
                    } else if (toolName === 'searchmemories') {
                        try {
                            const query = (args[0] || "").toLowerCase();
                            if (!query) {
                                observation = "Error: Please specify a search query.";
                            } else {
                                const results = await memoryService.searchMemories(query, 8);
                                observation = results.length > 0
                                    ? results.map(memory =>
                                        `--- ${memory.fileName} [${memory.category}] ---\nSummary: ${memory.summary}\nTags: ${(memory.tags || []).join(', ')}\n${previewText(memory.content, 240)}`
                                    ).join('\n\n')
                                    : "No matches found in knowledge base.";
                            }
                        } catch (e) {
                            observation = `Error searching knowledge base: ${e.message}`;
                        }
                    } else if (toolName === 'readmemory') {
                        try {
                            const filename = args[0];
                            if (!filename) {
                                observation = "Error: Please specify the filename to read.";
                            } else {
                                const memory = await memoryService.getMemory(filename);
                                observation = memory
                                    ? `Name: ${memory.name}\nType: ${memory.type}\nCategory: ${memory.category}\nImportance: ${memory.importance}\nTags: ${(memory.tags || []).join(', ')}\nUpdated: ${memory.updatedAt}\n\nSummary: ${memory.summary}\n\n${memory.content}`
                                    : `Error: Memory item '${filename}' not found.`;
                            }
                        } catch (e) {
                            observation = `Error reading memory: ${e.message}`;
                        }
                    } else if (toolName === 'savememory') {
                        try {
                            const name = args[0];
                            const content = args[1];
                            if (!name || !content) {
                                observation = "Error: 'name' and 'content' are required for saving memory.";
                            } else {
                                const memory = await memoryService.upsertMemory({
                                    name,
                                    content,
                                    auto: true,
                                    source: 'agent-tool',
                                    merge: true,
                                });
                                observation = `Success: Memory '${memory.name}' saved as ${memory.fileName}. Category=${memory.category}, importance=${memory.importance}.`;
                            }
                        } catch (e) {
                            observation = `Error saving memory: ${e.message}`;
                        }
                    } else if (toolName === 'listmemories') {
                        try {
                            const list = (await memoryService.listMemories()).map(m =>
                                `- ${m.fileName} [${m.category}|importance=${m.importance}|${m.auto ? 'auto' : 'manual'}]: ${m.preview.replace(/\n/g, ' ')}`
                            );
                            observation = list.join('\n');
                            if (!observation) observation = "(Knowledge base is currently empty)";
                        } catch (e) {
                            observation = `Error accessing knowledge base: ${e.message}`;
                        }
                    } else if (toolName === 'searchmemories') {
                        try {
                            const query = (args[0] || "").toLowerCase();
                            if (!query) {
                                observation = "Error: Please specify a search query.";
                            } else {
                                const files = await fs.readdir(MEMORIES_DIR);
                                const results = [];
                                for (const f of files) {
                                    if (f.endsWith('.txt')) {
                                        const content = await fs.readFile(path.join(MEMORIES_DIR, f), 'utf8');
                                        const filename = f.replace('.txt', '').toLowerCase();
                                        
                                        // 检查文件名或内容是否匹配
                                        if (filename.includes(query) || content.toLowerCase().includes(query)) {
                                            const lines = content.split('\n');
                                            const matches = lines.filter(l => l.toLowerCase().includes(query));
                                            
                                            if (matches.length > 0) {
                                                results.push(`--- ${f} (Content Matches) ---\n${matches.join('\n')}`);
                                            } else {
                                                // 仅文件名匹配，提供预览
                                                const preview = content.length > 200 ? content.substring(0, 200) + '...' : content;
                                                results.push(`--- ${f} (Filename Match) ---\n${preview}`);
                                            }
                                        }
                                    }
                                }
                                observation = results.length > 0 ? results.join('\n\n') : "No matches found in knowledge base.";
                            }
                        } catch (e) {
                            observation = `Error searching knowledge base: ${e.message}`;
                        }
                    } else if (toolName === 'readmemory') {
                        try {
                            const filename = args[0];
                            if (!filename) {
                                observation = "Error: Please specify the filename to read.";
                            } else {
                                const filePath = path.join(MEMORIES_DIR, filename.endsWith('.txt') ? filename : `${filename}.txt`);
                                if (await fs.exists(filePath)) {
                                    observation = await fs.readFile(filePath, 'utf8');
                                } else {
                                    observation = `Error: Memory item '${filename}' not found.`;
                                }
                            }
                        } catch (e) {
                            observation = `Error reading memory: ${e.message}`;
                        }
                    } else if (toolName === 'savememory') {
                        try {
                            const name = args[0];
                            const content = args[1];
                            if (!name || !content) {
                                observation = "Error: 'name' and 'content' are required for saving memory.";
                            } else {
                                const fileName = `${name.replace(/[\\/:*?"<>|]/g, '_')}.txt`;
                                const filePath = path.join(MEMORIES_DIR, fileName);
                                const exists = await fs.exists(filePath);
                                if (exists) {
                                    // Append mode
                                    const oldContent = await fs.readFile(filePath, 'utf8');
                                    await fs.writeFile(filePath, `${oldContent}\n\n[Updated ${new Date().toLocaleString()}]\n${content}`, 'utf8');
                                    observation = `Success: Memory '${name}' updated.`;
                                } else {
                                    await fs.writeFile(filePath, content, 'utf8');
                                    observation = `Success: Memory '${name}' saved.`;
                                }
                            }
                        } catch (e) {
                            observation = `Error saving memory: ${e.message}`;
                        }
                    } else if (toolName.startsWith('mcp_')) {
                        // Protocol: mcp_serverName_toolName
                        const parts = toolName.split('_');
                        if (parts.length < 3) {
                            observation = `Error: Invalid MCP tool name format. Expected mcp_serverName_toolName.`;
                        } else {
                            const serverName = parts[1];
                            const mcpToolName = parts.slice(2).join('_');
                            try {
                                let mcpArgs = {};
                                const schema = mcpManager.getToolSchema(serverName, mcpToolName);
                                const properties = schema?.inputSchema?.properties || {};
                                const keys = Object.keys(properties);

                                // --- 极强鲁棒性的参数解析逻辑 ---
                                
                                // 情况 A: AI 传了一个 JSON 字符串作为第一个参数
                                if (args.length === 1 && args[0].trim().startsWith('{')) {
                                    try {
                                        mcpArgs = JSON.parse(args[0]);
                                    } catch (e) {
                                        mcpArgs = args[0] || {};
                                    }
                                } else {
                                    // 情况 B: AI 混合了 命名参数 (key=val) 或 位置参数
                                    args.forEach((arg, idx) => {
                                        const trimmedArg = arg.trim();
                                        
                                        // 检查是否是 key=value 格式
                                        const kvMatch = trimmedArg.match(/^(\w+)\s*[:=]\s*([\s\S]*)$/);
                                        let key = keys[idx]; // 默认按位置找 key
                                        let val = trimmedArg;

                                        if (kvMatch) {
                                            const potentialKey = kvMatch[1].trim();
                                            // 如果提取的 key 在 schema 中存在，则使用它
                                            if (properties[potentialKey]) {
                                                key = potentialKey;
                                                val = kvMatch[2].trim();
                                            }
                                        }

                                        if (key) {
                                            const propSchema = properties[key];
                                            // 清洗引号
                                            let cleanVal = val.replace(/^["']|["']$/g, '').trim();
                                            
                                            // 类型转换
                                            const isNumber = propSchema?.type === 'number' || propSchema?.type === 'integer' || 
                                                           (Array.isArray(propSchema?.type) && (propSchema.type.includes('number') || propSchema.type.includes('integer')));
                                            const isBoolean = propSchema?.type === 'boolean' || 
                                                            (Array.isArray(propSchema?.type) && propSchema.type.includes('boolean'));

                                            if (isNumber) {
                                                const num = Number(cleanVal);
                                                mcpArgs[key] = !isNaN(num) && cleanVal !== "" ? num : cleanVal;
                                            } else if (isBoolean) {
                                                mcpArgs[key] = (cleanVal.toLowerCase() === 'true' || cleanVal === '1');
                                            } else {
                                                mcpArgs[key] = cleanVal;
                                            }
                                        }
                                    });
                                }

                                const result = await mcpManager.callTool(serverName, mcpToolName, mcpArgs);
                                observation = result.content.map(c => c.text).join('\n');
                            } catch (e) {
                                observation = `MCP Error (${serverName}/${mcpToolName}): ${e.message}`;
                            }
                        }
                    } else {
                         observation = `Error: Unknown tool '${toolName}'. Available: search, browse, draw, composeMusic, terminal, readFile, planFileRead, readFileChunk, writeFile, editFile, replaceInFile, deleteFile, listDir, createProjectFolder, ensureDir, updateTodo, respond, and enabled MCP tools.`;
                    }
                } catch (e) {
                    observation = `Error: ${e.message}`;
                }

                if (generatedFile) {
                    const existingFileIdx = generatedFiles.findIndex(file => file.filePath === generatedFile.filePath);
                    if (existingFileIdx >= 0) {
                        generatedFiles[existingFileIdx] = generatedFile;
                    } else {
                        generatedFiles.push(generatedFile);
                    }
                } else if (toolName === 'deletefile' && fileMetadata?.filePath) {
                    const existingFileIdx = generatedFiles.findIndex(file => file.filePath === fileMetadata.filePath);
                    if (existingFileIdx >= 0) {
                        generatedFiles.splice(existingFileIdx, 1);
                    }
                }

                if (!aborted && !res.writableEnded) {
                    res.write(`data: ${JSON.stringify({ observation: observation || "(No output from tool)", fileMetadata, generatedFile })}\n\n`);
                }
                actionPart.observation = observation;
                actionPart.fileMetadata = fileMetadata;
                await persist();
                unregisterAgentAction(actionId);
                
                // Truncate observation for logic prompt to prevent token overflow, especially for base64 images
                const logicObservation = (observation && observation.length > 2000) 
                    ? observation.slice(0, 1000) + `... [Truncated ${observation.length - 2000} chars] ...` + observation.slice(-1000)
                    : observation;

                currentPrompt += `\nAssistant: Tool: ${toolNameRaw}(${args.map(a => `"${(a || "").toString().replace(/"/g, '\\"')}"`).join(', ')})\nObservation: ${logicObservation}\n`;
            }
        } else {
            if (aborted) return;
            const finalContent = assistantResponse.replace(/(?:Thought|思考)[:：]\s*[\s\S]*?(?=(?:Tool|工具)[:：]|$)/i, '').trim();
            const shouldForceStructuredRetry = invalidStructuredReplyCount < 4;

            if (shouldForceStructuredRetry) {
                invalidStructuredReplyCount += 1;
                const realtimeReminder = (searchEnabled && isRealtimeTask)
                    ? '\nThis task asks for current/latest information. You must use search(...) and then browse(...) before respond(...).'
                    : '';
                const invalidOutputPreview = (finalContent || assistantResponse || '').trim().slice(0, 600);

                currentPrompt += `\n\nSystem Correction:
Your previous output was invalid for Agent mode because it did not contain any Tool call.
Do not talk to the user directly and do not stop after a progress note.
Continue the unfinished task using tools when more inspection is needed, or finish with Tool: respond("...") only when the task is actually complete.
On the next attempt, output only:
- one or more lines starting with Tool:
- or exactly one Tool: respond("...")
${realtimeReminder}
Previous invalid output:
${invalidOutputPreview || '(empty output)'}`;
                continue;
            }

            if (finalContent) {
                currentParts.push({ type: 'text', content: finalContent });
                await persist();
                if (!res.writableEnded) {
                    res.write(`data: ${JSON.stringify({ text: finalContent })}\n\n`);
                }
            }
            if (!res.writableEnded) {
                sendDone();
            }
            return;
        }
    }
    if (!aborted && !res.writableEnded) {
        sendDone();
    }
}

// Update chat route
const PptxGenJS = require('pptxgenjs');

async function buildImageDeckPptBuffer(images = [], title = '') {
    const pres = new PptxGenJS();
    const safeTitle = /^[\u0000-\u007F\u4E00-\u9FFF\s._-]+$/.test(String(title || '').trim())
        ? String(title || '').trim()
        : '';
    pres.layout = 'LAYOUT_16x9';
    pres.title = safeTitle || 'Presentation';

    for (const imgData of images) {
        const slide = pres.addSlide();
        slide.addImage({
            data: imgData,
            x: 0,
            y: 0,
            w: '100%',
            h: '100%',
        });
    }

    return pres.write('nodebuffer');
}

const PPT_CAPTURE_STYLE = `
  body { margin: 0; background: #ffffff; }
  .ppt-capture-surface {
    width: 960px;
    height: 540px;
    overflow: hidden;
    position: relative;
    background: #ffffff;
  }
  .ppt-capture-surface .slide {
    width: 960px !important;
    height: 540px !important;
    overflow: hidden;
    position: relative;
    isolation: isolate;
  }
  .ppt-capture-surface .slide,
  .ppt-capture-surface .slide * {
    box-sizing: border-box;
    text-rendering: geometricPrecision;
    -webkit-font-smoothing: antialiased;
  }
  .ppt-capture-surface .slide h1,
  .ppt-capture-surface .slide h2,
  .ppt-capture-surface .slide h3,
  .ppt-capture-surface .slide h4,
  .ppt-capture-surface .slide h5,
  .ppt-capture-surface .slide h6 {
    line-height: 1.16 !important;
    overflow: visible !important;
    padding-bottom: 0.12em;
  }
  .ppt-capture-surface .slide p,
  .ppt-capture-surface .slide li,
  .ppt-capture-surface .slide span {
    line-height: 1.34 !important;
    overflow: visible !important;
    padding-bottom: 0.08em;
  }
  .ppt-capture-surface .slide [class*="leading-tight"] {
    line-height: 1.16 !important;
  }
  .ppt-capture-surface .slide [class*="leading-snug"] {
    line-height: 1.34 !important;
  }
  .ppt-capture-surface .slide [class*="leading-relaxed"] {
    line-height: 1.45 !important;
  }
  .ppt-capture-surface .slide svg {
    overflow: visible;
  }
`;

const PPT_SCENE_SIZE = {
    widthPx: 960,
    heightPx: 540,
    widthIn: 10,
    heightIn: 5.625,
};

let cachedHtml2CanvasBundlePath = undefined;

function getHtml2CanvasBundlePath() {
    if (cachedHtml2CanvasBundlePath !== undefined) {
        return cachedHtml2CanvasBundlePath;
    }

    const candidates = [
        path.join(PROJECT_ROOT, 'frontend', 'node_modules', 'html2canvas', 'dist', 'html2canvas.min.js'),
        path.join(PROJECT_ROOT, 'node_modules', 'html2canvas', 'dist', 'html2canvas.min.js'),
    ];

    cachedHtml2CanvasBundlePath = candidates.find(candidate => fs.existsSync(candidate)) || null;
    return cachedHtml2CanvasBundlePath;
}

function getPptRenderBaseUrl(preferredBaseUrl = '') {
    const normalizedPreferred = String(preferredBaseUrl || '').trim();
    if (normalizedPreferred) {
        return normalizedPreferred.endsWith('/') ? normalizedPreferred : `${normalizedPreferred}/`;
    }

    const envBaseUrl = String(
        process.env.PUBLIC_BASE_URL
        || process.env.APP_BASE_URL
        || process.env.BACKEND_PUBLIC_URL
        || ''
    ).trim();
    if (envBaseUrl) {
        return envBaseUrl.endsWith('/') ? envBaseUrl : `${envBaseUrl}/`;
    }

    const protocol = resolvedHttps ? 'https' : 'http';
    return `${protocol}://127.0.0.1:${port}/`;
}

function buildPptCaptureHtml(slideHtml = '', options = {}) {
    const baseUrl = getPptRenderBaseUrl(options.baseUrl);
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8" />
    <base href="${escapeHtml(baseUrl)}" />
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      ${PPT_CAPTURE_STYLE}
      [data-ppt-export-hidden="true"] {
        visibility: hidden !important;
      }
      [data-ppt-export-hidden="true"] * {
        visibility: hidden !important;
      }
    </style>
</head>
<body>
    <div class="ppt-capture-surface">${slideHtml}</div>
</body>
</html>`;
}

async function ensureHtml2CanvasLoaded(page) {
    const bundlePath = getHtml2CanvasBundlePath();
    if (bundlePath) {
        await page.addScriptTag({ path: bundlePath });
    } else {
        await page.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js' });
    }
    await page.waitForFunction(() => typeof window.html2canvas === 'function', { timeout: 15000 });
}

async function extractEditableSceneInBrowser(target = '.ppt-capture-surface .slide') {
    const PPT_SCENE_SIZE = {
        widthPx: 960,
        heightPx: 540,
        widthIn: 10,
        heightIn: 5.625,
    };

    function isCanvasMostlyBlank(canvas) {
        const ctx = canvas?.getContext?.('2d', { willReadFrequently: true });
        if (!ctx) return false;

        const points = [
            [20, 20],
            [canvas.width / 2, 20],
            [canvas.width - 20, 20],
            [20, canvas.height / 2],
            [canvas.width / 2, canvas.height / 2],
            [canvas.width - 20, canvas.height / 2],
            [20, canvas.height - 20],
            [canvas.width / 2, canvas.height - 20],
            [canvas.width - 20, canvas.height - 20],
        ];

        let blankCount = 0;
        for (const [rawX, rawY] of points) {
            const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(rawX)));
            const y = Math.max(0, Math.min(canvas.height - 1, Math.floor(rawY)));
            const pixel = ctx.getImageData(x, y, 1, 1).data;
            const isBlankPixel = pixel[3] === 0 || (pixel[0] > 248 && pixel[1] > 248 && pixel[2] > 248);
            if (isBlankPixel) blankCount += 1;
        }

        return blankCount >= points.length - 1;
    }

    function pxToInX(px) {
        return Number(((Number(px) || 0) * PPT_SCENE_SIZE.widthIn / PPT_SCENE_SIZE.widthPx).toFixed(4));
    }

    function pxToInY(px) {
        return Number(((Number(px) || 0) * PPT_SCENE_SIZE.heightIn / PPT_SCENE_SIZE.heightPx).toFixed(4));
    }

    function pxToPt(px) {
        return Number(((Number(px) || 0) * 72 / 96).toFixed(2));
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function normalizeTextValue(text = '') {
        return String(text || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\r/g, '')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n[ \t]+/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    function parseCssColor(color, opacityMultiplier = 1) {
        const raw = String(color || '').trim();
        if (!raw || raw === 'transparent') return null;

        if (raw.startsWith('#')) {
            const hex = raw.slice(1);
            const normalized = hex.length === 3
                ? hex.split('').map(char => char + char).join('')
                : hex.slice(0, 6);
            const alpha = clamp(opacityMultiplier, 0, 1);
            return {
                color: normalized.toUpperCase(),
                alpha,
                transparency: Math.round((1 - alpha) * 100),
            };
        }

        const match = raw.match(/rgba?\(([^)]+)\)/i);
        if (!match) return null;

        const parts = match[1].split(',').map(part => part.trim());
        const [r = '0', g = '0', b = '0', a = '1'] = parts;
        const red = clamp(Math.round(Number(r) || 0), 0, 255);
        const green = clamp(Math.round(Number(g) || 0), 0, 255);
        const blue = clamp(Math.round(Number(b) || 0), 0, 255);
        const alpha = clamp((parts.length > 3 ? Number(a) : 1) * opacityMultiplier, 0, 1);
        if (alpha <= 0) return null;

        return {
            color: [red, green, blue].map(value => value.toString(16).padStart(2, '0')).join('').toUpperCase(),
            alpha,
            transparency: Math.round((1 - alpha) * 100),
        };
    }

    function normalizeFontFamily(fontFamily = '') {
        const first = String(fontFamily || '')
            .split(',')
            .map(part => part.replace(/['"]/g, '').trim())
            .find(Boolean);

        if (!first) return 'Microsoft YaHei';
        if (/^(ui-|system-ui|-apple-system|blinkmacsystemfont|segoe ui|sans-serif|serif|monospace)$/i.test(first)) {
            return 'Microsoft YaHei';
        }
        return first;
    }

    function getElementDepth(element) {
        let depth = 0;
        let current = element;
        while (current?.parentElement) {
            depth += 1;
            current = current.parentElement;
        }
        return depth;
    }

    function getRelativeRect(element, slideRect) {
        const rect = element.getBoundingClientRect();
        const left = clamp(rect.left - slideRect.left, 0, PPT_SCENE_SIZE.widthPx);
        const top = clamp(rect.top - slideRect.top, 0, PPT_SCENE_SIZE.heightPx);
        const right = clamp(rect.right - slideRect.left, 0, PPT_SCENE_SIZE.widthPx);
        const bottom = clamp(rect.bottom - slideRect.top, 0, PPT_SCENE_SIZE.heightPx);
        return {
            x: left,
            y: top,
            w: Math.max(0, right - left),
            h: Math.max(0, bottom - top),
        };
    }

    function isRenderableElement(element, slideRect, style = window.getComputedStyle(element)) {
        if (!element || !style) return false;
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        if ((Number(style.opacity) || 0) <= 0) return false;

        const rect = getRelativeRect(element, slideRect);
        if (rect.w < 1 || rect.h < 1) return false;
        return rect.x < PPT_SCENE_SIZE.widthPx && rect.y < PPT_SCENE_SIZE.heightPx;
    }

    function getRotationDegrees(style) {
        const transform = style?.transform || '';
        if (!transform || transform === 'none') return 0;

        try {
            const matrix = new DOMMatrixReadOnly(transform);
            const angle = Math.atan2(matrix.b, matrix.a) * (180 / Math.PI);
            return Number(angle.toFixed(2));
        } catch {
            return 0;
        }
    }

    function getShapeShadow(boxShadow = '') {
        const raw = String(boxShadow || '').trim();
        if (!raw || raw === 'none') return null;

        const firstShadow = raw.includes('),') ? `${raw.split('),')[0]})` : raw;
        const shadowMatch = firstShadow.match(/(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px\s+(\d+(?:\.\d+)?)px(?:\s+(-?\d+(?:\.\d+)?)px)?\s+(rgba?\([^)]+\)|#[0-9a-fA-F]{3,8})/);
        if (!shadowMatch) return null;

        const [, offsetX, offsetY, blurRadius, , colorValue] = shadowMatch;
        const color = parseCssColor(colorValue);
        if (!color) return null;

        const distancePx = Math.sqrt((Number(offsetX) || 0) ** 2 + (Number(offsetY) || 0) ** 2);
        const angle = Math.atan2(Number(offsetY) || 0, Number(offsetX) || 0) * (180 / Math.PI);

        return {
            color: color.color,
            opacity: Number((color.alpha * 0.6).toFixed(2)),
            blur: pxToPt(Number(blurRadius) || 0),
            distance: pxToPt(distancePx),
            angle: Number(angle.toFixed(2)),
        };
    }

    function getUniformBorder(style) {
        const widths = ['Top', 'Right', 'Bottom', 'Left'].map(side => Number.parseFloat(style[`border${side}Width`]) || 0);
        const styles = ['Top', 'Right', 'Bottom', 'Left'].map(side => style[`border${side}Style`]);
        const colors = ['Top', 'Right', 'Bottom', 'Left'].map(side => parseCssColor(style[`border${side}Color`]));

        if (!widths.some(width => width > 0)) return null;
        if (styles.every(value => value === 'none')) return null;

        const primaryColor = colors.find(Boolean);
        if (!primaryColor) return null;

        return {
            color: primaryColor.color,
            transparency: primaryColor.transparency,
            width: pxToPt(Math.max(...widths)),
            dashType: styles.some(value => value === 'dashed') ? 'dash' : 'solid',
        };
    }

    function collectTextElements(slideEl) {
        const slideRect = slideEl.getBoundingClientRect();
        const candidates = new Set();
        const walker = document.createTreeWalker(slideEl, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                if (!normalizeTextValue(node.textContent || '')) return NodeFilter.FILTER_REJECT;
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                if (parent.closest('svg,script,style,noscript')) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            },
        });

        let currentNode = walker.nextNode();
        while (currentNode) {
            let candidate = currentNode.parentElement;
            while (candidate && candidate !== slideEl) {
                const style = window.getComputedStyle(candidate);
                if (style.display !== 'inline' && style.display !== 'contents') break;
                candidate = candidate.parentElement;
            }
            if (candidate && candidate !== slideEl) {
                candidates.add(candidate);
            }
            currentNode = walker.nextNode();
        }

        return Array.from(candidates)
            .filter(element => isRenderableElement(element, slideRect))
            .filter(element => {
                const text = normalizeTextValue(element.innerText || element.textContent || '');
                if (!text) return false;
                const rect = getRelativeRect(element, slideRect);
                if (rect.w < 6 || rect.h < 6) return false;
                return Boolean(parseCssColor(window.getComputedStyle(element).color, Number(window.getComputedStyle(element).opacity) || 1));
            })
            .sort((a, b) => getElementDepth(a) - getElementDepth(b))
            .filter((element, index, array) => {
                const text = normalizeTextValue(element.innerText || element.textContent || '');
                return !array.some((other, otherIndex) => (
                    otherIndex < index
                    && other.contains(element)
                    && normalizeTextValue(other.innerText || other.textContent || '') === text
                ));
            });
    }

    function collectImageElements(slideEl) {
        const slideRect = slideEl.getBoundingClientRect();
        return Array.from(slideEl.querySelectorAll('img, svg'))
            .filter(element => isRenderableElement(element, slideRect))
            .filter(element => {
                const rect = getRelativeRect(element, slideRect);
                return rect.w >= 4 && rect.h >= 4;
            });
    }

    function collectShapeElements(slideEl, imageElements) {
        const slideRect = slideEl.getBoundingClientRect();
        const imageSet = new Set(imageElements);

        return Array.from(slideEl.querySelectorAll('*'))
            .filter(element => element !== slideEl)
            .filter(element => !imageSet.has(element))
            .filter(element => !element.closest('svg'))
            .filter(element => {
                const style = window.getComputedStyle(element);
                if (!isRenderableElement(element, slideRect, style)) return false;

                const rect = getRelativeRect(element, slideRect);
                if (rect.w < 6 || rect.h < 6) return false;
                if (rect.w > 940 && rect.h > 520) return false;
                if (style.backgroundImage && style.backgroundImage !== 'none') return false;

                const fill = parseCssColor(style.backgroundColor, Number(style.opacity) || 1);
                const border = getUniformBorder(style);
                const hasShadow = style.boxShadow && style.boxShadow !== 'none';
                return Boolean(fill || border || hasShadow);
            });
    }

    function svgMarkupToDataUrl(markup = '') {
        const normalized = String(markup || '').trim();
        if (!normalized) return '';
        return `data:image/svg+xml;base64,${window.btoa(unescape(encodeURIComponent(normalized)))}`;
    }

    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result || '');
            reader.onerror = () => reject(reader.error || new Error('Failed to read blob as data URL.'));
            reader.readAsDataURL(blob);
        });
    }

    async function fetchUrlAsDataUrl(url) {
        const response = await fetch(url, { credentials: 'omit' });
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status}`);
        }
        const blob = await response.blob();
        return blobToDataUrl(blob);
    }

    function inlineSvgComputedStyles(sourceNode, targetNode) {
        if (!(sourceNode instanceof Element) || !(targetNode instanceof Element)) return;

        const style = window.getComputedStyle(sourceNode);
        const relevantProps = [
            'fill',
            'fill-opacity',
            'stroke',
            'stroke-width',
            'stroke-opacity',
            'stroke-linecap',
            'stroke-linejoin',
            'stroke-dasharray',
            'stroke-dashoffset',
            'opacity',
            'color',
            'filter',
            'mix-blend-mode',
            'transform',
            'transform-origin',
            'display',
            'visibility',
        ];

        const styleText = relevantProps
            .map(prop => {
                const value = style.getPropertyValue(prop);
                return value && value !== 'none' && value !== 'normal' ? `${prop}:${value}` : '';
            })
            .filter(Boolean)
            .join(';');

        if (styleText) {
            const existing = targetNode.getAttribute('style');
            targetNode.setAttribute('style', existing ? `${existing};${styleText}` : styleText);
        }

        Array.from(sourceNode.children).forEach((child, index) => {
            inlineSvgComputedStyles(child, targetNode.children[index]);
        });
    }

    function svgElementToDataUrl(svgElement) {
        const clone = svgElement.cloneNode(true);
        const rect = svgElement.getBoundingClientRect();

        if (!clone.getAttribute('xmlns')) {
            clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        }
        if (!clone.getAttribute('xmlns:xlink')) {
            clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
        }
        if (!clone.getAttribute('width') && rect.width) {
            clone.setAttribute('width', `${Math.max(1, Math.round(rect.width))}`);
        }
        if (!clone.getAttribute('height') && rect.height) {
            clone.setAttribute('height', `${Math.max(1, Math.round(rect.height))}`);
        }
        if (!clone.getAttribute('viewBox') && rect.width && rect.height) {
            clone.setAttribute('viewBox', `0 0 ${Math.max(1, Math.round(rect.width))} ${Math.max(1, Math.round(rect.height))}`);
        }

        inlineSvgComputedStyles(svgElement, clone);
        return svgMarkupToDataUrl(new XMLSerializer().serializeToString(clone));
    }

    async function captureElementAsDataUrl(element) {
        if (!element) return '';

        const tagName = element.tagName?.toLowerCase?.() || '';
        const rect = element.getBoundingClientRect();

        if (tagName === 'svg') {
            return svgElementToDataUrl(element);
        }

        if (tagName === 'img') {
            const src = element.currentSrc || element.src || element.getAttribute('src') || '';
            if (!src) return '';
            if (src.startsWith('data:')) return src;

            try {
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, element.naturalWidth || Math.ceil(rect.width));
                canvas.height = Math.max(1, element.naturalHeight || Math.ceil(rect.height));
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error('Missing canvas context');
                ctx.drawImage(element, 0, 0, canvas.width, canvas.height);
                return canvas.toDataURL('image/png');
            } catch {
                try {
                    return await fetchUrlAsDataUrl(src);
                } catch {
                    // Fall through to html2canvas fallback.
                }
            }
        }

        try {
            const canvas = await html2canvas(element, {
                backgroundColor: null,
                logging: false,
                useCORS: true,
                foreignObjectRendering: false,
                scale: 3,
                width: Math.max(1, Math.ceil(rect.width)),
                height: Math.max(1, Math.ceil(rect.height)),
                windowWidth: Math.max(1, Math.ceil(rect.width)),
                windowHeight: Math.max(1, Math.ceil(rect.height)),
                scrollX: 0,
                scrollY: 0,
            });

            return isCanvasMostlyBlank(canvas) ? '' : canvas.toDataURL('image/png');
        } catch (error) {
            console.warn('Skipping element capture for editable PPT:', error?.message || error);
            return '';
        }
    }

    async function captureBackgroundLayer(slideEl, hiddenElements) {
        hiddenElements.forEach(element => element.setAttribute('data-ppt-export-hidden', 'true'));

        let canvas;
        try {
            canvas = await html2canvas(slideEl, {
                backgroundColor: null,
                logging: false,
                useCORS: true,
                foreignObjectRendering: false,
                scale: 2,
                width: PPT_SCENE_SIZE.widthPx,
                height: PPT_SCENE_SIZE.heightPx,
                windowWidth: PPT_SCENE_SIZE.widthPx,
                windowHeight: PPT_SCENE_SIZE.heightPx,
                scrollX: 0,
                scrollY: 0,
            });
        } finally {
            hiddenElements.forEach(element => element.removeAttribute('data-ppt-export-hidden'));
        }

        return isCanvasMostlyBlank(canvas) ? '' : canvas.toDataURL('image/png');
    }

    function applyTextTransform(text, textTransform) {
        if (textTransform === 'uppercase') return text.toUpperCase();
        if (textTransform === 'lowercase') return text.toLowerCase();
        if (textTransform === 'capitalize') {
            return text.replace(/\b(\w)/g, match => match.toUpperCase());
        }
        return text;
    }

    function buildTextScene(element, slideRect) {
        const style = window.getComputedStyle(element);
        const rect = getRelativeRect(element, slideRect);
        const paddingTop = Number.parseFloat(style.paddingTop) || 0;
        const paddingRight = Number.parseFloat(style.paddingRight) || 0;
        const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
        const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
        const color = parseCssColor(style.color, Number(style.opacity) || 1);
        const fontSizePx = Number.parseFloat(style.fontSize) || 16;
        const rawLineHeight = style.lineHeight === 'normal'
            ? fontSizePx * 1.2
            : (Number.parseFloat(style.lineHeight) || (fontSizePx * 1.2));
        const text = normalizeTextValue(applyTextTransform(element.innerText || element.textContent || '', style.textTransform));

        if (!text || !color) return null;

        return {
            text,
            x: pxToInX(rect.x + paddingLeft),
            y: pxToInY(rect.y + paddingTop),
            w: pxToInX(Math.max(4, rect.w - paddingLeft - paddingRight)),
            h: pxToInY(Math.max(4, rect.h - paddingTop - paddingBottom)),
            fontSize: pxToPt(fontSizePx),
            fontFace: normalizeFontFamily(style.fontFamily),
            color: color.color,
            transparency: color.transparency,
            bold: style.fontWeight === 'bold' || (Number(style.fontWeight) || 0) >= 600,
            italic: style.fontStyle.includes('italic'),
            underline: style.textDecorationLine.includes('underline'),
            align: style.textAlign === 'center' ? 'center' : style.textAlign === 'right' || style.textAlign === 'end' ? 'right' : style.textAlign === 'justify' ? 'justify' : 'left',
            valign: 'top',
            lineSpacingMultiple: Number((rawLineHeight / fontSizePx).toFixed(2)),
            rotate: getRotationDegrees(style),
        };
    }

    function buildShapeScene(element, slideRect) {
        const style = window.getComputedStyle(element);
        const rect = getRelativeRect(element, slideRect);
        const fill = parseCssColor(style.backgroundColor, Number(style.opacity) || 1);
        const line = getUniformBorder(style);
        const shadow = getShapeShadow(style.boxShadow);
        const radiusPx = Number.parseFloat(style.borderTopLeftRadius) || 0;
        const minSide = Math.min(rect.w, rect.h);
        const rotation = getRotationDegrees(style);

        if (rect.w < 6 || rect.h < 6) return null;
        if (!fill && !line && !shadow) return null;

        if (minSide <= 6 && Math.max(rect.w, rect.h) >= 24 && fill) {
            const isHorizontal = rect.w >= rect.h;
            return {
                kind: 'line',
                x: pxToInX(isHorizontal ? rect.x : rect.x + (rect.w / 2)),
                y: pxToInY(isHorizontal ? rect.y + (rect.h / 2) : rect.y),
                w: pxToInX(isHorizontal ? rect.w : 0.01),
                h: pxToInY(isHorizontal ? 0.01 : rect.h),
                line: {
                    color: fill.color,
                    transparency: fill.transparency,
                    width: pxToPt(Math.max(1, minSide)),
                },
                rotate: rotation,
            };
        }

        const shapeKind = radiusPx >= (minSide / 2) - 2
            ? 'ellipse'
            : radiusPx > 2
                ? 'roundRect'
                : 'rect';

        return {
            kind: shapeKind,
            x: pxToInX(rect.x),
            y: pxToInY(rect.y),
            w: pxToInX(rect.w),
            h: pxToInY(rect.h),
            rectRadius: shapeKind === 'roundRect' ? Number(clamp(radiusPx / Math.max(1, minSide), 0, 1).toFixed(3)) : 0,
            fill: fill ? { color: fill.color, transparency: fill.transparency } : null,
            line,
            shadow,
            rotate: rotation,
        };
    }

    const slideEl = typeof target === 'number'
        ? document.querySelectorAll('.slide')[target] || null
        : document.querySelector(String(target || '.ppt-capture-surface .slide'));
    if (!slideEl) {
        throw new Error('Failed to prepare editable slide scene.');
    }

    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await new Promise(resolve => setTimeout(resolve, 180));

    const slideRect = slideEl.getBoundingClientRect();
    const textElements = collectTextElements(slideEl);
    const imageElements = collectImageElements(slideEl);
    const shapeElements = collectShapeElements(slideEl, imageElements);

    const images = [];
    for (const element of imageElements) {
        try {
            const rect = getRelativeRect(element, slideRect);
            const data = await captureElementAsDataUrl(element);
            if (!data) continue;
            images.push({
                data,
                x: pxToInX(rect.x),
                y: pxToInY(rect.y),
                w: pxToInX(rect.w),
                h: pxToInY(rect.h),
                rotate: getRotationDegrees(window.getComputedStyle(element)),
                transparency: 0,
            });
        } catch (error) {
            console.warn('Skipping image element during editable PPT export:', error?.message || error);
        }
    }

    const shapes = shapeElements
        .map(element => buildShapeScene(element, slideRect))
        .filter(Boolean);

    const texts = textElements
        .map(element => buildTextScene(element, slideRect))
        .filter(Boolean);

    const hiddenElements = Array.from(new Set([...shapeElements, ...textElements, ...imageElements]));
    const backgroundData = await captureBackgroundLayer(slideEl, hiddenElements);
    const backgroundColor = parseCssColor(window.getComputedStyle(slideEl).backgroundColor)?.color || 'FFFFFF';

    return {
        backgroundColor,
        backgroundLayer: backgroundData ? { data: backgroundData } : null,
        shapes,
        images,
        texts,
    };
}

async function renderSlidesToEditableScenes(slides = [], options = {}) {
    const browserPath = getLocalBrowserPath();
    if (!browserPath) {
        throw new Error('No local Chrome/Chromium/Edge browser was found for editable PPT rendering.');
    }

    const normalizedFinalHtml = String(options.finalHtml || '').trim();
    const normalizedSlides = Array.isArray(slides)
        ? slides.filter(slide => slide?.content).map(slide => ({ title: slide.title, content: String(slide.content) }))
        : [];
    if (!normalizedFinalHtml && !normalizedSlides.length) {
        return [];
    }

    let browser = null;
    try {
        browser = await puppeteer.launch({
            executablePath: browserPath,
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,1200'],
            ignoreHTTPSErrors: true,
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 2 });
        const sceneSlides = [];

        if (normalizedFinalHtml) {
            await page.setContent(normalizedFinalHtml, { waitUntil: 'networkidle0', timeout: 60000 });
            await ensureHtml2CanvasLoaded(page);
            await page.waitForSelector('.slide', { timeout: 15000 });
            await page.waitForFunction(() => !document.fonts || document.fonts.status === 'loaded', { timeout: 10000 }).catch(() => {});
            const slideCount = await page.$$eval('.slide', nodes => nodes.length);
            for (let index = 0; index < slideCount; index += 1) {
                const scene = await page.evaluate(extractEditableSceneInBrowser, index);
                if (scene) {
                    sceneSlides.push(scene);
                }
            }
        }

        if (sceneSlides.length === 0) {
            for (const slide of normalizedSlides) {
                await page.setContent(buildPptCaptureHtml(slide.content, options), { waitUntil: 'networkidle0', timeout: 60000 });
                await ensureHtml2CanvasLoaded(page);
                await page.waitForSelector('.ppt-capture-surface .slide', { timeout: 15000 });
                await page.waitForFunction(() => !document.fonts || document.fonts.status === 'loaded', { timeout: 10000 }).catch(() => {});
                const scene = await page.evaluate(extractEditableSceneInBrowser);
                if (scene) {
                    sceneSlides.push(scene);
                }
            }
        }

        return sceneSlides;
    } finally {
        if (browser) {
            await browser.close().catch(() => {});
        }
    }
}

async function renderSlidesToImageDataUris(finalHtml = '', slides = [], options = {}) {
    const browserPath = getLocalBrowserPath();
    if (!browserPath) {
        throw new Error('No local Chrome/Chromium/Edge browser was found for PPT snapshot rendering.');
    }

    let browser = null;
    try {
        browser = await puppeteer.launch({
            executablePath: browserPath,
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,1200'],
            ignoreHTTPSErrors: true,
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 2 });
        const images = [];

        const normalizedSlides = Array.isArray(slides)
            ? slides.filter(slide => slide?.content).map(slide => String(slide.content))
            : [];

        if (normalizedSlides.length > 0) {
            for (const slideHtml of normalizedSlides) {
                await page.setContent(buildPptCaptureHtml(slideHtml, options), { waitUntil: 'networkidle0', timeout: 60000 });
                await page.waitForSelector('.ppt-capture-surface .slide', { timeout: 15000 });
                await page.waitForFunction(() => !document.fonts || document.fonts.status === 'loaded', { timeout: 10000 }).catch(() => {});
                await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
                await new Promise(resolve => setTimeout(resolve, 300));

                const captureHandle = await page.$('.ppt-capture-surface');
                if (!captureHandle) {
                    throw new Error('Failed to prepare PPT capture surface.');
                }
                const buffer = await captureHandle.screenshot({ type: 'png' });
                images.push(`data:image/png;base64,${buffer.toString('base64')}`);
            }
        } else {
            await page.setContent(String(finalHtml || ''), { waitUntil: 'networkidle0', timeout: 60000 });
            await page.waitForSelector('.slide', { timeout: 15000 });
            await page.waitForFunction(() => !document.fonts || document.fonts.status === 'loaded', { timeout: 10000 }).catch(() => {});
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

            const slideHandles = await page.$$('.slide');
            for (const handle of slideHandles) {
                const buffer = await handle.screenshot({ type: 'png' });
                images.push(`data:image/png;base64,${buffer.toString('base64')}`);
            }
        }

        return images;
    } finally {
        if (browser) {
            await browser.close().catch(() => {});
        }
    }
}

async function buildSnapshotPptBuffer({ finalHtml = '', slides = [], title = 'Presentation', baseUrl = '' } = {}) {
    const normalizedFinalHtml = String(finalHtml || '').trim();
    const normalizedSlides = Array.isArray(slides)
        ? slides.filter(slide => slide?.content).map(slide => ({
            title: slide.title,
            content: String(slide.content || ''),
        }))
        : [];

    let images = [];
    let finalHtmlError = null;

    if (normalizedFinalHtml) {
        try {
            images = await renderSlidesToImageDataUris(normalizedFinalHtml, [], { baseUrl });
        } catch (error) {
            finalHtmlError = error;
        }
    }

    if (!images.length && normalizedSlides.length > 0) {
        images = await renderSlidesToImageDataUris('', normalizedSlides, { baseUrl });
    }

    if (!images.length && finalHtmlError) {
        throw finalHtmlError;
    }

    if (!images.length) {
        throw new Error('No slide images were provided or rendered.');
    }

    return buildImageDeckPptBuffer(images, title || 'Presentation');
}

app.post('/api/ppt/download-images', async (req, res) => {
    const { images, slides = [], finalHtml = '', title } = req.body || {};
    
    try {
        let normalizedImages = Array.isArray(images) ? images.filter(Boolean) : [];
        if (normalizedImages.length === 0) {
            const buffer = await buildSnapshotPptBuffer({
                finalHtml,
                slides,
                title,
                baseUrl: `${req.protocol}://${req.get('host')}`,
            });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
            res.setHeader('Content-Disposition', `attachment; filename=presentation.pptx`);
            res.send(buffer);
            return;
        }

        const buffer = await buildImageDeckPptBuffer(normalizedImages, title || 'Presentation');

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
        res.setHeader('Content-Disposition', `attachment; filename=presentation.pptx`);
        res.send(buffer);
    } catch (err) {
        console.error('PPT Image Export Error:', err);
        res.status(500).json({ error: err.message });
    }
});

function decodeHtmlEntities(text = '') {
    const entityMap = {
        '&nbsp;': ' ',
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#39;': "'",
        '&apos;': "'",
    };
    return String(text)
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
        .replace(/&(nbsp|amp|lt|gt|quot|#39|apos);/g, match => entityMap[match] || match);
}

function htmlToPlainText(html = '') {
    return decodeHtmlEntities(
        String(html)
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6|section|article)>/gi, '\n')
            .replace(/<li[^>]*>/gi, '* ')
            .replace(/<[^>]+>/g, ' ')
    )
        .replace(/\r/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
}

function escapeHtml(text = '') {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderInlineMarkdown(text = '') {
    return escapeHtml(text)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
}

function extractMarkdownTitle(markdown = '', fallback = 'Research Report') {
    const headingMatch = String(markdown || '').match(/^\s*#\s+(.+)$/m);
    if (headingMatch?.[1]) {
        return headingMatch[1].trim();
    }
    return fallback;
}

function buildCredibilityCheckPdfHtml(data = {}, fallbackTitle = 'credibility-check') {
    const language = String(data.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
    const getText = (zhText, enText) => pickVerificationText(language, zhText, enText);
    const score = Math.max(0, Math.min(100, Math.round(Number(data.score) || 0)));
    const verdictLabel = String(
        data.verdictLabel || getVerdictLabel(data.verdict || 'unverified', language)
    ).trim() || getText('待确认', 'Unverified');
    const claim = String(data.claim || data.normalizedClaim || fallbackTitle || 'credibility-check').trim();
    const normalizedClaim = String(data.normalizedClaim || claim).trim();
    const summary = String(data.summary || '').trim() || getText('系统未返回结论摘要。', 'No summary was returned.');
    const findings = uniqueTrimmedList(Array.isArray(data.findings) ? data.findings : [], 8);
    const risks = uniqueTrimmedList(Array.isArray(data.risks) ? data.risks : [], 8);
    const keywords = uniqueTrimmedList(Array.isArray(data.keywords) ? data.keywords : [], 12);
    const searchQueries = uniqueTrimmedList(Array.isArray(data.searchQueries) ? data.searchQueries : [], 8);
    const sources = Array.isArray(data.sources) ? data.sources.slice(0, 8) : [];
    const metrics = data.metrics && typeof data.metrics === 'object' ? data.metrics : {};
    const sourceStats = data.sourceStats && typeof data.sourceStats === 'object' ? data.sourceStats : {};
    const sentiment = data.sentiment && typeof data.sentiment === 'object' ? data.sentiment : {};
    const updatedAt = String(data.updatedAt || '').trim();
    const emotionality = Math.max(0, Math.min(100, Math.round(Number(sentiment.emotionality) || 0)));
    const scoreTone = score >= 75
        ? { accent: '#15803d', soft: '#ecfdf5', border: '#bbf7d0', badge: '#dcfce7' }
        : score >= 55
            ? { accent: '#0369a1', soft: '#f0f9ff', border: '#bae6fd', badge: '#e0f2fe' }
            : score >= 40
                ? { accent: '#b45309', soft: '#fffbeb', border: '#fde68a', badge: '#fef3c7' }
                : { accent: '#b91c1c', soft: '#fff1f2', border: '#fecdd3', badge: '#ffe4e6' };

    const metricMeta = [
        ['evidenceScore', getText('证据支持度', 'Evidence support')],
        ['authorityScore', getText('来源权威度', 'Source authority')],
        ['diversityScore', getText('多源覆盖度', 'Coverage diversity')],
        ['consistencyScore', getText('证据一致性', 'Evidence consistency')],
        ['emotionScore', getText('情绪风险控制', 'Emotion risk')],
    ];
    const processSteps = [
        getText('1. 事实拆解', '1. Claim parsing'),
        getText('2. 多引擎检索', '2. Multi-engine search'),
        getText('3. 证据比对', '3. Evidence comparison'),
        getText('4. 可信度评分', '4. Credibility scoring'),
        getText('5. 结果汇总', '5. Final verdict'),
    ];

    const renderChipList = (items = [], emptyLabel = '') => {
        if (!items.length) {
            return `<span class="empty-inline">${escapeHtml(emptyLabel)}</span>`;
        }
        return items.map(item => `<span class="chip">${escapeHtml(item)}</span>`).join('');
    };

    const renderBulletList = (items = [], emptyLabel = '') => {
        if (!items.length) {
            return `<div class="empty-state">${escapeHtml(emptyLabel)}</div>`;
        }
        return `<ul>${items.map(item => `<li>${renderInlineMarkdown(String(item || '').trim())}</li>`).join('')}</ul>`;
    };

    const renderMetricBlocks = metricMeta.map(([key, label]) => {
        const value = Math.max(0, Math.min(100, Math.round(Number(metrics[key]) || 0)));
        return `<div class="metric-card">
            <div class="metric-row">
                <span>${escapeHtml(label)}</span>
                <strong>${value}/100</strong>
            </div>
            <div class="metric-bar"><span style="width:${value}%"></span></div>
        </div>`;
    }).join('');

    const renderSourceCards = sources.length > 0
        ? sources.map((source) => {
            const stance = String(source.stance || '').trim().toLowerCase();
            const stanceLabel = stance === 'support'
                ? getText('支持', 'Supports')
                : stance === 'contradict'
                    ? getText('反驳', 'Contradicts')
                    : stance === 'mixed'
                        ? getText('部分支持', 'Mixed')
                        : getText('待确认', 'Unclear');
            const excerpt = String(source.excerpt || source.reason || '').trim();
            const engines = Array.isArray(source.engines) ? source.engines.filter(Boolean).join(', ') : '';
            const authority = Math.max(0, Math.round(Number(source.authorityScore) || 0));
            const relevance = Math.max(0, Math.min(100, Math.round((Number(source.relevance) || 0) * 100)));
            const confidence = Math.max(0, Math.min(100, Math.round((Number(source.confidence) || 0) * 100)));
            return `<article class="source-card">
                <div class="source-head">
                    <div>
                        <h4>${escapeHtml(source.title || source.domain || source.url || getText('未命名来源', 'Untitled source'))}</h4>
                        <div class="source-meta">${escapeHtml(source.domain || '')}${source.domain && engines ? ' · ' : ''}${escapeHtml(engines)}</div>
                    </div>
                    <span class="stance-badge">${escapeHtml(stanceLabel)}</span>
                </div>
                <div class="source-stats">
                    <span>${escapeHtml(getText('权威度', 'Authority'))}: ${authority}</span>
                    <span>${escapeHtml(getText('相关度', 'Relevance'))}: ${relevance}%</span>
                    <span>${escapeHtml(getText('置信度', 'Confidence'))}: ${confidence}%</span>
                </div>
                ${excerpt ? `<p class="source-excerpt">${renderInlineMarkdown(excerpt)}</p>` : ''}
                ${source.url ? `<a class="source-link" href="${escapeHtml(source.url)}">${escapeHtml(source.url)}</a>` : ''}
            </article>`;
        }).join('')
        : `<div class="empty-state">${escapeHtml(getText('没有可附带的证据来源。', 'No evidence sources were attached.'))}</div>`;

    const summaryHtml = summary
        .split(/\n{2,}/)
        .map(paragraph => paragraph.trim())
        .filter(Boolean)
        .map(paragraph => `<p>${renderInlineMarkdown(paragraph)}</p>`)
        .join('');

    const updatedAtText = updatedAt
        ? updatedAt.replace('T', ' ').replace(/\.\d+Z$/, ' UTC').replace(/Z$/, ' UTC')
        : getText('未记录', 'Not recorded');

    return `<!DOCTYPE html>
<html lang="${language === 'zh' ? 'zh-CN' : 'en'}">
<head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(claim || fallbackTitle)}</title>
    <style>
        * { box-sizing: border-box; }
        body {
            margin: 0;
            padding: 26px;
            font-family: "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif;
            color: #0f172a;
            background:
                radial-gradient(circle at top left, rgba(14, 165, 233, 0.15), transparent 36%),
                radial-gradient(circle at top right, rgba(34, 197, 94, 0.12), transparent 30%),
                linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%);
        }
        .page {
            max-width: 960px;
            margin: 0 auto;
            background: rgba(255, 255, 255, 0.96);
            border: 1px solid #dbeafe;
            border-radius: 26px;
            overflow: hidden;
            box-shadow: 0 24px 60px rgba(15, 23, 42, 0.12);
        }
        .hero {
            padding: 34px 36px 28px;
            background:
                linear-gradient(135deg, rgba(14, 165, 233, 0.12), rgba(59, 130, 246, 0.06)),
                linear-gradient(180deg, #ffffff, #f8fafc);
            border-bottom: 1px solid #e2e8f0;
        }
        .eyebrow {
            display: inline-flex;
            padding: 7px 12px;
            border-radius: 999px;
            background: ${scoreTone.badge};
            color: ${scoreTone.accent};
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.14em;
            text-transform: uppercase;
        }
        .hero-grid {
            margin-top: 18px;
            display: grid;
            grid-template-columns: 180px 1fr;
            gap: 24px;
            align-items: start;
        }
        .score-panel {
            padding: 20px 18px;
            border-radius: 24px;
            background: ${scoreTone.soft};
            border: 1px solid ${scoreTone.border};
            text-align: center;
        }
        .score-label {
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.14em;
            text-transform: uppercase;
            color: ${scoreTone.accent};
        }
        .score-value {
            margin-top: 14px;
            font-size: 58px;
            font-weight: 800;
            line-height: 1;
            color: ${scoreTone.accent};
        }
        .score-helper {
            margin-top: 10px;
            font-size: 13px;
            line-height: 1.6;
            color: #334155;
        }
        h1 {
            margin: 14px 0 10px;
            font-size: 30px;
            line-height: 1.25;
            color: #0f172a;
        }
        .claim-block {
            padding: 16px 18px;
            border-radius: 20px;
            background: #eff6ff;
            border: 1px solid #bfdbfe;
        }
        .claim-label {
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: #2563eb;
        }
        .claim-text {
            margin-top: 8px;
            font-size: 20px;
            line-height: 1.55;
            font-weight: 700;
        }
        .claim-normalized {
            margin-top: 8px;
            font-size: 13px;
            line-height: 1.7;
            color: #475569;
        }
        .summary-card {
            margin-top: 18px;
            padding: 18px 20px;
            border-radius: 22px;
            background: white;
            border: 1px solid #e2e8f0;
        }
        .summary-card p {
            margin: 0 0 0.8em;
            font-size: 14px;
            line-height: 1.82;
            color: #1e293b;
        }
        .summary-card p:last-child {
            margin-bottom: 0;
        }
        .content {
            padding: 28px 30px 34px;
        }
        .section + .section {
            margin-top: 22px;
        }
        .section-title {
            margin: 0 0 14px;
            font-size: 18px;
            line-height: 1.3;
            color: #0f172a;
        }
        .stats-grid, .metrics-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 12px;
        }
        .metrics-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .stat-card, .metric-card, .panel-card {
            padding: 16px 16px 14px;
            border-radius: 20px;
            border: 1px solid #e2e8f0;
            background: #ffffff;
        }
        .stat-card {
            background: linear-gradient(180deg, #ffffff, #f8fafc);
        }
        .stat-label {
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: #64748b;
        }
        .stat-value {
            margin-top: 8px;
            font-size: 28px;
            font-weight: 800;
            line-height: 1;
            color: #0f172a;
        }
        .stat-helper {
            margin-top: 8px;
            font-size: 12px;
            line-height: 1.6;
            color: #475569;
        }
        .metric-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            font-size: 13px;
            color: #1e293b;
        }
        .metric-row strong {
            color: ${scoreTone.accent};
            font-size: 14px;
        }
        .metric-bar {
            margin-top: 10px;
            height: 10px;
            border-radius: 999px;
            background: #e2e8f0;
            overflow: hidden;
        }
        .metric-bar span {
            display: block;
            height: 100%;
            border-radius: inherit;
            background: linear-gradient(90deg, ${scoreTone.accent}, #38bdf8);
        }
        .chip-row {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
        }
        .chip {
            display: inline-flex;
            align-items: center;
            padding: 8px 12px;
            border-radius: 999px;
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            font-size: 12px;
            line-height: 1.5;
            color: #1e293b;
        }
        .empty-inline {
            font-size: 13px;
            color: #64748b;
        }
        .empty-state {
            padding: 16px;
            border-radius: 18px;
            background: #f8fafc;
            border: 1px dashed #cbd5e1;
            font-size: 13px;
            color: #64748b;
        }
        ul {
            margin: 0;
            padding-left: 18px;
        }
        li {
            font-size: 13.5px;
            line-height: 1.8;
            color: #1e293b;
        }
        li + li {
            margin-top: 6px;
        }
        .process-row {
            display: grid;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            gap: 10px;
        }
        .process-step {
            padding: 14px 12px;
            border-radius: 18px;
            background: linear-gradient(180deg, #ffffff, #f8fafc);
            border: 1px solid #dbeafe;
            text-align: center;
        }
        .process-index {
            display: inline-flex;
            width: 28px;
            height: 28px;
            align-items: center;
            justify-content: center;
            border-radius: 999px;
            background: ${scoreTone.badge};
            color: ${scoreTone.accent};
            font-size: 13px;
            font-weight: 800;
        }
        .process-name {
            margin-top: 10px;
            font-size: 12px;
            line-height: 1.55;
            color: #1e293b;
            font-weight: 700;
        }
        .process-status {
            margin-top: 8px;
            font-size: 11px;
            color: #475569;
        }
        .source-list {
            display: grid;
            gap: 12px;
        }
        .source-card {
            padding: 16px 16px 14px;
            border-radius: 20px;
            border: 1px solid #e2e8f0;
            background: linear-gradient(180deg, #ffffff, #f8fafc);
        }
        .source-head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;
        }
        .source-head h4 {
            margin: 0;
            font-size: 15px;
            line-height: 1.5;
            color: #0f172a;
        }
        .source-meta {
            margin-top: 6px;
            font-size: 11px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: #64748b;
        }
        .stance-badge {
            display: inline-flex;
            padding: 7px 10px;
            border-radius: 999px;
            background: #e2e8f0;
            color: #334155;
            font-size: 11px;
            font-weight: 700;
            white-space: nowrap;
        }
        .source-stats {
            display: flex;
            flex-wrap: wrap;
            gap: 8px 14px;
            margin-top: 12px;
            font-size: 12px;
            color: #334155;
        }
        .source-excerpt {
            margin: 12px 0 0;
            font-size: 13px;
            line-height: 1.78;
            color: #1e293b;
        }
        .source-link {
            display: block;
            margin-top: 10px;
            font-size: 12px;
            color: #2563eb;
            word-break: break-all;
            text-decoration: none;
        }
        .footer {
            margin-top: 24px;
            padding-top: 16px;
            border-top: 1px solid #e2e8f0;
            font-size: 12px;
            color: #64748b;
        }
    </style>
</head>
<body>
    <main class="page">
        <section class="hero">
            <span class="eyebrow">${escapeHtml(getText('智链可信度核验报告', 'Credibility Check Report'))}</span>
            <div class="hero-grid">
                <aside class="score-panel">
                    <div class="score-label">${escapeHtml(getText('可信度', 'Credibility'))}</div>
                    <div class="score-value">${score}</div>
                    <div class="score-helper">${escapeHtml(verdictLabel)}</div>
                </aside>
                <div>
                    <div class="claim-block">
                        <div class="claim-label">${escapeHtml(getText('待核验表述', 'Claim under review'))}</div>
                        <div class="claim-text">${escapeHtml(claim)}</div>
                        <div class="claim-normalized">${escapeHtml(getText('规范化表述', 'Normalized claim'))}: ${escapeHtml(normalizedClaim)}</div>
                    </div>
                    <div class="summary-card">${summaryHtml}</div>
                </div>
            </div>
        </section>

        <section class="content">
            <section class="section">
                <h2 class="section-title">${escapeHtml(getText('结果面板', 'Result panel'))}</h2>
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-label">${escapeHtml(getText('搜索引擎', 'Engines'))}</div>
                        <div class="stat-value">${Math.max(0, Number(sourceStats.engineCount) || 0)}</div>
                        <div class="stat-helper">${escapeHtml(getText('参与本次查证的搜索引擎数量', 'Search engines used in this check'))}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">${escapeHtml(getText('独立站点', 'Domains'))}</div>
                        <div class="stat-value">${Math.max(0, Number(sourceStats.uniqueDomains) || 0)}</div>
                        <div class="stat-helper">${escapeHtml(getText('交叉比对到的独立来源站点', 'Distinct domains covered by the evidence pool'))}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">${escapeHtml(getText('高权威来源', 'Authoritative'))}</div>
                        <div class="stat-value">${Math.max(0, Number(sourceStats.authoritativeSourceCount) || 0)}</div>
                        <div class="stat-helper">${escapeHtml(getText('权威度较高的来源数量', 'Higher-authority sources in the final selection'))}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">${escapeHtml(getText('情绪强度', 'Emotionality'))}</div>
                        <div class="stat-value">${emotionality}</div>
                        <div class="stat-helper">${escapeHtml(getText('原始表述的煽动或情绪化风险', 'How emotionally loaded the original wording appears'))}</div>
                    </div>
                </div>
            </section>

            <section class="section">
                <h2 class="section-title">${escapeHtml(getText('评分维度', 'Score breakdown'))}</h2>
                <div class="metrics-grid">${renderMetricBlocks}</div>
            </section>

            <section class="section">
                <h2 class="section-title">${escapeHtml(getText('核验流程面板', 'Process panel'))}</h2>
                <div class="process-row">
                    ${processSteps.map((step, index) => `<div class="process-step">
                        <span class="process-index">${index + 1}</span>
                        <div class="process-name">${escapeHtml(step)}</div>
                        <div class="process-status">${escapeHtml(getText('已完成', 'Completed'))}</div>
                    </div>`).join('')}
                </div>
            </section>

            <section class="section">
                <h2 class="section-title">${escapeHtml(getText('关键词与检索语句', 'Keywords and search queries'))}</h2>
                <div class="panel-card">
                    <div class="stat-label">${escapeHtml(getText('关键词', 'Keywords'))}</div>
                    <div class="chip-row" style="margin-top:10px;">${renderChipList(keywords, getText('没有关键词', 'No keywords'))}</div>
                    <div class="stat-label" style="margin-top:16px;">${escapeHtml(getText('检索语句', 'Search queries'))}</div>
                    <div class="chip-row" style="margin-top:10px;">${renderChipList(searchQueries, getText('没有检索语句', 'No search queries'))}</div>
                </div>
            </section>

            <section class="section">
                <div class="stats-grid" style="grid-template-columns: repeat(2, minmax(0, 1fr));">
                    <div class="panel-card">
                        <h2 class="section-title" style="margin-bottom:12px;">${escapeHtml(getText('关键发现', 'Key findings'))}</h2>
                        ${renderBulletList(findings, getText('没有额外的关键发现。', 'No additional findings were produced.'))}
                    </div>
                    <div class="panel-card">
                        <h2 class="section-title" style="margin-bottom:12px;">${escapeHtml(getText('风险提醒', 'Cautions'))}</h2>
                        ${renderBulletList(risks, getText('没有额外的风险提醒。', 'No extra cautions were produced.'))}
                    </div>
                </div>
            </section>

            <section class="section">
                <h2 class="section-title">${escapeHtml(getText('证据来源', 'Evidence sources'))}</h2>
                <div class="source-list">${renderSourceCards}</div>
            </section>

            <div class="footer">
                ${escapeHtml(getText('生成时间', 'Generated at'))}: ${escapeHtml(updatedAtText)}
            </div>
        </section>
    </main>
</body>
</html>`;
}

function buildMarkdownReportHtml(markdown = '', title = 'Research Report') {
    const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
    let html = '';
    let paragraphLines = [];
    let listItems = [];
    let listType = '';
    let codeLines = [];
    let codeLanguage = '';
    let inCodeBlock = false;

    const flushParagraph = () => {
        if (!paragraphLines.length) return;
        html += `<p>${paragraphLines.map(line => renderInlineMarkdown(line)).join('<br />')}</p>`;
        paragraphLines = [];
    };

    const flushList = () => {
        if (!listItems.length) return;
        const tag = listType === 'ol' ? 'ol' : 'ul';
        html += `<${tag}>${listItems.map(item => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</${tag}>`;
        listItems = [];
        listType = '';
    };

    const flushCode = () => {
        if (!inCodeBlock) return;
        const languageLabel = codeLanguage ? `<div class="code-label">${escapeHtml(codeLanguage)}</div>` : '';
        html += `<div class="code-block ${codeLanguage === 'mermaid' ? 'mermaid-block' : ''}">${languageLabel}<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre></div>`;
        codeLines = [];
        codeLanguage = '';
        inCodeBlock = false;
    };

    for (const rawLine of lines) {
        const line = rawLine || '';
        const fenceMatch = line.match(/^\s*```([A-Za-z0-9_-]+)?\s*$/);
        if (fenceMatch) {
            if (inCodeBlock) {
                flushCode();
            } else {
                flushParagraph();
                flushList();
                inCodeBlock = true;
                codeLanguage = (fenceMatch[1] || '').toLowerCase();
                codeLines = [];
            }
            continue;
        }

        if (inCodeBlock) {
            codeLines.push(line);
            continue;
        }

        if (!line.trim()) {
            flushParagraph();
            flushList();
            continue;
        }

        const headingMatch = line.match(/^\s*(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            flushParagraph();
            flushList();
            const level = Math.min(headingMatch[1].length, 4);
            html += `<h${level}>${renderInlineMarkdown(headingMatch[2].trim())}</h${level}>`;
            continue;
        }

        const orderedMatch = line.match(/^\s*\d+\.\s+(.+)$/);
        if (orderedMatch) {
            flushParagraph();
            if (listType && listType !== 'ol') flushList();
            listType = 'ol';
            listItems.push(orderedMatch[1].trim());
            continue;
        }

        const bulletMatch = line.match(/^\s*[-*]\s+(.+)$/);
        if (bulletMatch) {
            flushParagraph();
            if (listType && listType !== 'ul') flushList();
            listType = 'ul';
            listItems.push(bulletMatch[1].trim());
            continue;
        }

        const quoteMatch = line.match(/^\s*>\s?(.*)$/);
        if (quoteMatch) {
            flushParagraph();
            flushList();
            html += `<blockquote>${renderInlineMarkdown(quoteMatch[1].trim())}</blockquote>`;
            continue;
        }

        paragraphLines.push(line.trim());
    }

    flushParagraph();
    flushList();
    flushCode();

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(title)}</title>
    <style>
        * { box-sizing: border-box; }
        body {
            margin: 0;
            padding: 40px 44px;
            font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
            color: #0f172a;
            background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
        }
        .page {
            max-width: 820px;
            margin: 0 auto;
            background: rgba(255, 255, 255, 0.96);
            border: 1px solid #e2e8f0;
            border-radius: 24px;
            padding: 36px 42px;
            box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);
        }
        h1, h2, h3, h4 {
            color: #111827;
            margin: 1.2em 0 0.55em;
            line-height: 1.25;
        }
        h1 { font-size: 30px; margin-top: 0; }
        h2 { font-size: 24px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb; }
        h3 { font-size: 19px; }
        h4 { font-size: 16px; }
        p, li, blockquote {
            font-size: 13.5px;
            line-height: 1.78;
        }
        p { margin: 0 0 0.9em; }
        ul, ol { margin: 0 0 1em 1.4em; padding: 0; }
        li + li { margin-top: 0.3em; }
        blockquote {
            margin: 1em 0;
            padding: 12px 16px;
            border-left: 4px solid #60a5fa;
            background: #eff6ff;
            border-radius: 12px;
            color: #1e3a8a;
        }
        code {
            font-family: "Cascadia Code", "Consolas", monospace;
            background: #eff6ff;
            color: #1d4ed8;
            padding: 0.1em 0.35em;
            border-radius: 6px;
        }
        .code-block {
            margin: 1.05em 0;
            border-radius: 18px;
            overflow: hidden;
            background: #0f172a;
            color: #e2e8f0;
            border: 1px solid #1e293b;
        }
        .code-label {
            padding: 10px 14px 0;
            font-size: 11px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: #93c5fd;
        }
        .code-block pre {
            margin: 0;
            padding: 14px;
            white-space: pre-wrap;
            word-break: break-word;
            font-size: 11.5px;
            line-height: 1.55;
        }
        .mermaid-block {
            background: #111827;
        }
        a {
            color: #2563eb;
            text-decoration: none;
        }
    </style>
</head>
<body>
    <main class="page">${html || `<p>${renderInlineMarkdown(markdown)}</p>`}</main>
</body>
</html>`;
}

async function renderHtmlToPdfBuffer(html = '') {
    const browserPath = getLocalBrowserPath();
    if (!browserPath) {
        throw new Error('No local Chrome/Chromium/Edge browser was found for PDF rendering.');
    }

    let browser = null;
    try {
        browser = await puppeteer.launch({
            executablePath: browserPath,
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,2200'],
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 2200, deviceScaleFactor: 1.5 });
        await page.setContent(String(html || ''), { waitUntil: 'networkidle0', timeout: 60000 });
        await page.emulateMediaType('screen');
        await page.waitForFunction(() => !document.fonts || document.fonts.status === 'loaded', { timeout: 10000 }).catch(() => {});
        return await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '12mm',
                right: '10mm',
                bottom: '12mm',
                left: '10mm',
            },
        });
    } finally {
        if (browser) {
            await browser.close().catch(() => {});
        }
    }
}

function pickBodyFontSize(text = '', max = 18, min = 11) {
    const length = String(text).length;
    if (length <= 80) return max;
    if (length <= 140) return Math.max(min, max - 2);
    if (length <= 240) return Math.max(min, max - 4);
    if (length <= 360) return Math.max(min, max - 5);
    return min;
}

function svgToDataUri(svg = '') {
    const normalized = String(svg || '').trim();
    if (!normalized) return '';
    return `data:image/svg+xml;base64,${Buffer.from(normalized, 'utf8').toString('base64')}`;
}

function normalizeImageDataUri(source = '') {
    const raw = String(source || '').trim();
    if (!raw.startsWith('data:')) return '';

    const match = raw.match(/^data:([^;,]+)(;charset=[^;,]+)?(;base64)?,([\s\S]*)$/i);
    if (!match) return '';

    const mimeType = match[1];
    const isBase64 = Boolean(match[3]);
    const payload = match[4] || '';

    if (isBase64) {
        return `data:${mimeType};base64,${payload.trim()}`;
    }

    let decodedPayload = payload;
    try {
        decodedPayload = decodeURIComponent(payload);
    } catch {
        decodedPayload = payload;
    }

    return `data:${mimeType};base64,${Buffer.from(decodedPayload, 'utf8').toString('base64')}`;
}

function resolveImageSourceUrl(source = '', baseUrl = '') {
    const raw = String(source || '').trim();
    if (!raw) return '';
    if (raw.startsWith('data:')) return raw;
    if (raw.startsWith('//')) return `https:${raw}`;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (!baseUrl) return '';

    try {
        return new URL(raw, baseUrl).toString();
    } catch {
        return '';
    }
}

async function toPptImageData(source = '', baseUrl = '') {
    const raw = String(source || '').trim();
    if (!raw) return '';
    if (raw.startsWith('<svg')) return svgToDataUri(raw);
    if (raw.startsWith('data:')) return normalizeImageDataUri(raw);

    const resolvedUrl = resolveImageSourceUrl(raw, baseUrl);
    if (!resolvedUrl) return '';

    try {
        const response = await fetch(resolvedUrl);
        if (!response.ok) {
            console.warn(`Failed to fetch PPT image: ${resolvedUrl} (${response.status})`);
            return '';
        }

        const contentType = (response.headers.get('content-type') || 'image/png').split(';')[0];
        const buffer = Buffer.from(await response.arrayBuffer());
        return `data:${contentType};base64,${buffer.toString('base64')}`;
    } catch (error) {
        console.warn(`Failed to convert PPT image source: ${resolvedUrl}`, error.message);
        return '';
    }
}

function extractSlideTheme(content = '') {
    if (content.includes('bg-slate-900') || content.includes('bg-slate-950')) return '0F172A';
    if (content.includes('bg-blue-')) return 'F0F7FF';
    if (content.includes('bg-orange-')) return 'FFF7ED';
    if (content.includes('bg-gray-')) return 'F9FAFB';
    if (content.includes('bg-gradient-')) return 'F8FAFC';
    return 'FFFFFF';
}

function extractEditableSlideModel(content = '', fallbackTitle = '') {
    const $ = cheerio.load(content);
    const root = $('.slide').first();
    const rootNode = root.length ? root : $.root();

    const titleNode = rootNode.find('h1, h2').first();
    const title = htmlToPlainText(titleNode.html() || fallbackTitle || '').trim() || fallbackTitle || 'Untitled Slide';

    const cardCandidates = rootNode.find('div').filter((_, el) => {
        const cls = ($(el).attr('class') || '').toLowerCase();
        if (!cls.includes('bg-white') || !cls.includes('rounded')) return false;
        const text = htmlToPlainText($(el).html() || '');
        return text.length >= 12;
    }).toArray().filter(el => !$(el).parents('div').toArray().some(parent => {
        const cls = ($(parent).attr('class') || '').toLowerCase();
        return cls.includes('bg-white') && cls.includes('rounded');
    }));

    const cards = cardCandidates.slice(0, 4).map((el, idx) => {
        const card = $(el);
        const iconImg = card.find('img').first().attr('src') || '';
        const iconSvgHtml = card.find('svg').first().prop('outerHTML') || '';
        const icon = iconImg || (iconSvgHtml ? svgToDataUri(iconSvgHtml) : '');
        const heading = htmlToPlainText(card.find('h2, h3, h4, strong').first().html() || '').trim();
        const bodyParts = [];

        card.find('p').each((_, p) => {
            const text = htmlToPlainText($(p).html() || '').trim();
            if (text) bodyParts.push(text);
        });
        if (bodyParts.length === 0) {
            card.find('li').each((_, li) => {
                const text = htmlToPlainText($(li).html() || '').trim();
                if (text) bodyParts.push(text);
            });
        }

        const fallbackText = htmlToPlainText(card.html() || '').trim();
        return {
            id: idx,
            title: heading || fallbackText.slice(0, 28) || `Card ${idx + 1}`,
            body: (bodyParts.join('\n') || fallbackText).slice(0, 220),
            icon,
        };
    });

    const topLevelImages = rootNode.find('img').filter((_, el) => !$(el).parents(cardCandidates).length).toArray()
        .map(el => $(el).attr('src'))
        .filter(Boolean)
        .slice(0, 2);

    const topLevelSvgs = rootNode.find('svg').filter((_, el) => !$(el).parents(cardCandidates).length).toArray()
        .map(el => svgToDataUri($(el).prop('outerHTML') || ''))
        .filter(Boolean)
        .slice(0, 2);

    const paragraphs = rootNode.find('p').toArray()
        .filter(el => !$(el).parents(cardCandidates).length)
        .map(el => htmlToPlainText($(el).html() || '').trim())
        .filter(Boolean);

    const bullets = rootNode.find('li').toArray()
        .filter(el => !$(el).parents(cardCandidates).length)
        .map(el => htmlToPlainText($(el).html() || '').trim())
        .filter(Boolean);

    return {
        title,
        cards,
        paragraphs,
        bullets,
        visuals: [...topLevelImages, ...topLevelSvgs].slice(0, 3),
        background: extractSlideTheme(content),
    };
}

async function buildEditablePptBuffer(slides = [], title = '', options = {}) {
    const pres = new PptxGenJS();
    const baseUrl = String(options.baseUrl || '').trim();
    pres.layout = 'LAYOUT_16x9';
    pres.title = title || 'Presentation';
    pres.author = 'AI Copilot Agent';
    pres.subject = title || 'Editable Presentation';
    pres.company = 'AI Copilot Agent';
    pres.lang = 'zh-CN';

    for (const [slideIndex, slideData] of slides.entries()) {
        const slide = pres.addSlide();
        const content = slideData.content || '';
        const model = extractEditableSlideModel(content, slideData.title || '');
        const cards = await Promise.all(model.cards.map(async (card) => ({
            ...card,
            icon: await toPptImageData(card.icon, baseUrl),
        })));
        const visuals = (await Promise.all(model.visuals.map((visual) => toPptImageData(visual, baseUrl))))
            .filter(Boolean);

        slide.background = { fill: model.background };
        slide.addShape(pres.ShapeType.rect, {
            x: 0, y: 0, w: 10, h: 0.14,
            line: { color: '3B82F6', transparency: 100 },
            fill: { color: '3B82F6' }
        });

        slide.addText(model.title, {
            x: 0.55, y: 0.34, w: 8.6, h: 0.95,
            fontSize: model.title.length > 24 ? 24 : 28,
            color: '0F172A',
            bold: true,
            fontFace: 'Microsoft YaHei',
            lang: 'zh-CN',
            margin: 0.04,
            fit: 'shrink',
            breakLine: false,
        });

        if (cards.length > 0) {
            const layoutMap = {
                1: [{ x: 0.65, y: 1.55, w: 8.7, h: 2.8 }],
                2: [
                    { x: 0.65, y: 1.55, w: 4.1, h: 2.75 },
                    { x: 5.05, y: 1.55, w: 4.1, h: 2.75 },
                ],
                3: [
                    { x: 0.65, y: 1.55, w: 2.7, h: 2.85 },
                    { x: 3.65, y: 1.55, w: 2.7, h: 2.85 },
                    { x: 6.65, y: 1.55, w: 2.7, h: 2.85 },
                ],
                4: [
                    { x: 0.55, y: 1.45, w: 4.0, h: 1.65 },
                    { x: 5.0, y: 1.45, w: 4.0, h: 1.65 },
                    { x: 0.55, y: 3.35, w: 4.0, h: 1.65 },
                    { x: 5.0, y: 3.35, w: 4.0, h: 1.65 },
                ],
            };
            const boxes = layoutMap[Math.min(cards.length, 4)] || layoutMap[4];

            cards.forEach((card, idx) => {
                const box = boxes[idx];
                slide.addShape(pres.ShapeType.roundRect, {
                    x: box.x, y: box.y, w: box.w, h: box.h,
                    rectRadius: 0.12,
                    fill: { color: 'FFFFFF', transparency: 2 },
                    line: { color: 'E5E7EB', transparency: 100 },
                    shadow: { type: 'outer', color: 'CBD5E1', blur: 2, angle: 45, distance: 1, opacity: 0.18 },
                });

                let textLeft = box.x + 0.28;
                if (card.icon) {
                    slide.addShape(pres.ShapeType.ellipse, {
                        x: box.x + 0.22, y: box.y + 0.25, w: 0.42, h: 0.42,
                        line: { color: 'C7D2FE', transparency: 100 },
                        fill: { color: 'EEF2FF' },
                    });
                    slide.addImage({
                        data: card.icon,
                        x: box.x + 0.285, y: box.y + 0.315, w: 0.28, h: 0.28,
                    });
                    textLeft = box.x + 0.75;
                }

                slide.addText(card.title, {
                    x: textLeft, y: box.y + 0.22, w: box.w - (textLeft - box.x) - 0.22, h: 0.42,
                    fontSize: 16,
                    bold: true,
                    color: '4F46E5',
                    fontFace: 'Microsoft YaHei',
                    lang: 'zh-CN',
                    margin: 0,
                    fit: 'shrink'
                });

                slide.addText(card.body, {
                    x: textLeft, y: box.y + 0.58, w: box.w - (textLeft - box.x) - 0.24, h: box.h - 0.75,
                    fontSize: pickBodyFontSize(card.body, 13, 10),
                    color: '475569',
                    fontFace: 'Microsoft YaHei',
                    lang: 'zh-CN',
                    margin: 0,
                    fit: 'shrink',
                    breakLine: true,
                    valign: 'top',
                });
            });
        } else if (model.bullets.length > 0) {
            slide.addText(
                model.bullets.slice(0, 6).map(item => ({
                    text: item,
                    options: {
                        bullet: true,
                        breakLine: true,
                        fontSize: pickBodyFontSize(item, 18, 12),
                        color: '475569',
                    }
                })),
                {
                    x: 0.75, y: 1.5, w: visuals.length ? 5.4 : 8.2, h: 3.8,
                    fontFace: 'Microsoft YaHei',
                    lang: 'zh-CN',
                    margin: 0.08,
                    fit: 'shrink',
                    valign: 'top',
                }
            );
        } else {
            const combinedText = (model.paragraphs.join('\n\n') || htmlToPlainText(content)).slice(0, 1000);
            slide.addText(combinedText, {
                x: 0.75, y: 1.5, w: visuals.length ? 5.4 : 8.2, h: 3.8,
                fontSize: pickBodyFontSize(combinedText, 16, 11),
                color: '475569',
                fontFace: 'Microsoft YaHei',
                lang: 'zh-CN',
                margin: 0.08,
                fit: 'shrink',
                valign: 'top',
                breakLine: true,
            });
        }

        visuals.forEach((visual, idx) => {
            const placements = [
                { x: 6.5, y: 1.65, w: 2.5, h: 1.8 },
                { x: 6.9, y: 3.7, w: 2.1, h: 1.2 },
                { x: 8.3, y: 0.55, w: 0.95, h: 0.95 },
            ];
            const box = placements[idx];
            if (!box) return;
            slide.addImage({ data: visual, x: box.x, y: box.y, w: box.w, h: box.h });
        });

        slide.addText(`${title || 'Presentation'} | Page ${slideIndex + 1}`, {
            x: 0.5, y: 5.1, w: 9, h: 0.25,
            fontSize: 10,
            color: '94A3B8',
            align: 'right',
            fontFace: 'Microsoft YaHei',
            lang: 'zh-CN',
        });
    }

    return pres.write('nodebuffer');
}

function clampSceneNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function buildSceneFill(fill = null) {
    if (!fill || !fill.color) {
        return { color: 'FFFFFF', transparency: 100, type: 'none' };
    }
    return {
        color: String(fill.color).replace('#', '') || 'FFFFFF',
        transparency: clampSceneNumber(fill.transparency, 0),
    };
}

function buildSceneLine(line = null) {
    if (!line || !line.color || clampSceneNumber(line.width, 0) <= 0) {
        return { color: 'FFFFFF', transparency: 100, type: 'none' };
    }
    return {
        color: String(line.color).replace('#', '') || 'FFFFFF',
        transparency: clampSceneNumber(line.transparency, 0),
        width: clampSceneNumber(line.width, 0.75),
        dashType: line.dashType || 'solid',
    };
}

function buildSceneShadow(shadow = null) {
    if (!shadow || !shadow.color) return undefined;
    return {
        type: 'outer',
        color: String(shadow.color).replace('#', '') || '000000',
        opacity: clampSceneNumber(shadow.opacity, 0.12),
        blur: clampSceneNumber(shadow.blur, 1),
        angle: clampSceneNumber(shadow.angle, 45),
        distance: clampSceneNumber(shadow.distance, 1),
    };
}

async function buildEditableScenePptBuffer(sceneSlides = [], title = '') {
    const pres = new PptxGenJS();
    pres.layout = 'LAYOUT_16x9';
    pres.title = title || 'Presentation';
    pres.author = 'AI Copilot Agent';
    pres.subject = title || 'Editable Presentation';
    pres.company = 'AI Copilot Agent';
    pres.lang = 'zh-CN';

    for (const scene of sceneSlides) {
        const slide = pres.addSlide();
        const backgroundColor = String(scene?.backgroundColor || 'FFFFFF').replace('#', '') || 'FFFFFF';
        slide.background = { color: backgroundColor };

        for (const shape of Array.isArray(scene?.shapes) ? scene.shapes : []) {
            const kind = shape?.kind || 'rect';
            const x = clampSceneNumber(shape?.x, 0);
            const y = clampSceneNumber(shape?.y, 0);
            const w = clampSceneNumber(shape?.w, 0);
            const h = clampSceneNumber(shape?.h, 0);
            if (w <= 0 || h <= 0) continue;

            if (kind === 'line') {
                slide.addShape(pres.ShapeType.line, {
                    x,
                    y,
                    w,
                    h,
                    line: buildSceneLine(shape.line || shape.fill),
                    rotate: clampSceneNumber(shape?.rotate, 0),
                });
                continue;
            }

            const shapeType = kind === 'ellipse'
                ? pres.ShapeType.ellipse
                : kind === 'roundRect'
                    ? pres.ShapeType.roundRect
                    : pres.ShapeType.rect;

            slide.addShape(shapeType, {
                x,
                y,
                w,
                h,
                rotate: clampSceneNumber(shape?.rotate, 0),
                rectRadius: clampSceneNumber(shape?.rectRadius, 0.12),
                fill: buildSceneFill(shape?.fill),
                line: buildSceneLine(shape?.line),
                shadow: buildSceneShadow(shape?.shadow),
            });
        }

        for (const image of Array.isArray(scene?.images) ? scene.images : []) {
            if (!image?.data) continue;
            slide.addImage({
                data: image.data,
                x: clampSceneNumber(image?.x, 0),
                y: clampSceneNumber(image?.y, 0),
                w: clampSceneNumber(image?.w, 0.1),
                h: clampSceneNumber(image?.h, 0.1),
                rotate: clampSceneNumber(image?.rotate, 0),
                transparency: clampSceneNumber(image?.transparency, 0),
            });
        }

        for (const text of Array.isArray(scene?.texts) ? scene.texts : []) {
            const rawText = String(text?.text || '').trim();
            if (!rawText) continue;

            slide.addText(rawText, {
                x: clampSceneNumber(text?.x, 0),
                y: clampSceneNumber(text?.y, 0),
                w: clampSceneNumber(text?.w, 0.2),
                h: clampSceneNumber(text?.h, 0.2) + 0.02,
                margin: 0,
                fontFace: text?.fontFace || 'Microsoft YaHei',
                fontSize: clampSceneNumber(text?.fontSize, 18),
                color: String(text?.color || '111827').replace('#', ''),
                bold: Boolean(text?.bold),
                italic: Boolean(text?.italic),
                underline: Boolean(text?.underline),
                align: text?.align || 'left',
                valign: text?.valign || 'top',
                breakLine: true,
                rotate: clampSceneNumber(text?.rotate, 0),
                transparency: clampSceneNumber(text?.transparency, 0),
                lineSpacingMultiple: clampSceneNumber(text?.lineSpacingMultiple, 1.15),
                fit: 'none',
                lang: 'zh-CN',
            });
        }
    }

    return pres.write('nodebuffer');
}

app.post('/api/ppt/download-editable', async (req, res) => {
    const { slides = [], scenes = [], title = '' } = req.body || {};

    try {
        if ((!Array.isArray(slides) || slides.length === 0) && (!Array.isArray(scenes) || scenes.length === 0)) {
            return res.status(400).json({ error: 'No slides provided' });
        }

        let sceneSlides = Array.isArray(scenes) ? scenes.filter(Boolean) : [];
        if (sceneSlides.length === 0 && Array.isArray(slides) && slides.length > 0) {
            try {
                sceneSlides = await renderSlidesToEditableScenes(slides, {
                    baseUrl: `${req.protocol}://${req.get('host')}`,
                    finalHtml: req.body?.finalHtml || '',
                });
            } catch (sceneError) {
                console.warn('[PPT] Failed to build scene-based editable export, falling back to basic editable export.', sceneError.message);
            }
        }

        const buffer = sceneSlides.length > 0
            ? await buildEditableScenePptBuffer(sceneSlides, title)
            : await buildEditablePptBuffer(slides, title, {
                baseUrl: `${req.protocol}://${req.get('host')}`,
            });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
        res.setHeader('Content-Disposition', 'attachment; filename="presentation-editable.pptx"');
        res.send(buffer);
    } catch (error) {
        console.error('Editable PPT export error:', error);
        res.status(500).json({ error: 'Failed to generate editable PPTX', details: error.message });
    }
});

app.post('/api/ppt/download', async (req, res) => {
    const { slides, title } = req.body;
    
    try {
        const pres = new PptxGenJS();
        pres.layout = 'LAYOUT_16x9';
        pres.title = title || "演示文稿";

        for (const slideData of slides) {
            const slide = pres.addSlide();
            const content = slideData.content || "";

            // 1. Determine background color/theme
            let bgColor = 'FFFFFF';
            if (content.includes('bg-blue-')) bgColor = 'F0F7FF';
            else if (content.includes('bg-orange-')) bgColor = 'FFF7ED';
            else if (content.includes('bg-gray-')) bgColor = 'F9FAFB';
            else if (content.includes('bg-gradient-')) bgColor = 'F8FAFC';
            slide.background = { fill: bgColor };

            // 2. Extract Title
            const slideTitleMatch = content.match(/<h[1-2][^>]*>([\s\S]*?)<\/h[1-2]>/i);
            const slideTitle = htmlToPlainText(slideTitleMatch ? slideTitleMatch[1] : slideData.title || '');
            const normalizedTitle = slideTitle || 'Untitled Slide';
            
            // Decorative elements
            slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.15, fill: { color: '3B82F6' } });
            slide.addShape(pres.ShapeType.triangle, { x: 9.3, y: 5.1, w: 0.5, h: 0.5, fill: { color: 'DBEAFE' }, flipV: true });
            
            slide.addText(normalizedTitle, {
                x: 0.48, y: 0.3, w: 8.95, h: 1.18,
                fontSize: normalizedTitle.length > 20 ? 24 : 28,
                color: '111827',
                bold: true,
                fontFace: 'Microsoft YaHei',
                lang: 'zh-CN',
                margin: 0.08,
                breakLine: false,
                fit: 'shrink',
                valign: 'mid'
            });

            // 3. Extract Content Blocks (Grid items or Paras)
            const listItems = [...content.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
                .map(m => htmlToPlainText(m[1]))
                .filter(Boolean);
            const paragraphs = [...content.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
                .map(m => htmlToPlainText(m[1]))
                .filter(Boolean);

            if (content.includes('grid')) {
                // If AI used grid, try to create two columns in PPT
                const gridItems = [...content.matchAll(/<div[^>]*class="[^"]*bg-white[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)]
                                    .map(m => htmlToPlainText(m[1]))
                                    .filter(Boolean);
                
                if (gridItems.length >= 2) {
                    gridItems.slice(0, 4).forEach((item, idx) => {
                        const x = (idx % 2) * 4.5 + 0.5;
                        const y = Math.floor(idx / 2) * 1.82 + 1.45;
                        slide.addShape(pres.ShapeType.roundRect, { x, y, w: 4, h: 1.72, fill: { color: 'FFFFFF' }, line: { color: 'E5E7EB', width: 1 } });
                        slide.addText(item.slice(0, 180), {
                            x: x + 0.2, y: y + 0.17, w: 3.6, h: 1.36,
                            fontSize: pickBodyFontSize(item, 13, 10),
                            color: '4B5563',
                            fontFace: 'Microsoft YaHei',
                            lang: 'zh-CN',
                            margin: 0.05,
                            fit: 'shrink',
                            valign: 'mid'
                        });
                    });
                }
            } else if (listItems.length > 0) {
                const bulletFontSize = pickBodyFontSize(listItems.join('\n'), 18, 12);
                slide.addText(
                    listItems.map(item => ({
                        text: item,
                        options: {
                            bullet: true,
                            fontSize: bulletFontSize,
                            color: '4B5563',
                            breakLine: true,
                        }
                    })),
                    {
                        x: 0.55, y: 1.38, w: 8.7, h: 3.72,
                        valign: 'top',
                        fontFace: 'Microsoft YaHei',
                        lang: 'zh-CN',
                        margin: 0.08,
                        fit: 'shrink'
                    }
                );
            } else {
                const combinedText = paragraphs.join('\n\n') || htmlToPlainText(content);
                const bodyFontSize = pickBodyFontSize(combinedText, 16, 11);
                slide.addText(combinedText.slice(0, 800), { 
                    x: 0.55, y: 1.38, w: 8.7, h: 3.72,
                    fontSize: bodyFontSize,
                    color: '4B5563',
                    valign: 'top',
                    fontFace: 'Microsoft YaHei',
                    lang: 'zh-CN',
                    margin: 0.08,
                    fit: 'shrink'
                });
            }

            // 4. Add Decorative Footer
            slide.addText(`${title || 'Presentation'} | Page ${slides.indexOf(slideData) + 1}`, {
                x: 0.5, y: 5.1, w: '90%', h: 0.3,
                fontSize: 10, color: '9CA3AF', align: 'right',
                fontFace: 'Microsoft YaHei',
                lang: 'zh-CN'
            });
        }

        const buffer = await pres.write('nodebuffer');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
        res.setHeader('Content-Disposition', `attachment; filename=presentation.pptx`);
        res.send(buffer);
    } catch (err) {
        console.error('PPT Export Error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/agent/actions/:actionId/skip', (req, res) => {
    const actionId = String(req.params.actionId || '').trim();
    if (!actionId) {
        return res.status(400).json({ error: 'Missing actionId' });
    }

    const control = requestSkipAgentAction(actionId, 'user_skip');
    if (!control) {
        return res.status(404).json({ error: 'Action is no longer running or cannot be skipped.' });
    }

    res.json({ success: true, actionId });
});

app.post('/api/story-glass/listen', async (req, res) => {
    try {
        const {
            storyText = '',
            turnText = '',
            turns = [],
            preferences = {},
            provider,
            model,
            ollamaUrl,
            config = {}
        } = req.body || {};

        const collectedStory = String(storyText || '').trim();
        const latestTurn = String(turnText || '').trim();
        if (!collectedStory && !latestTurn) {
            return res.status(400).json({ error: 'Missing story text.' });
        }

        const language = String(detectLanguage(collectedStory || latestTurn)).toLowerCase().startsWith('zh') ? 'zh' : 'en';
        const normalizedPreferences = normalizeStoryGlassPreferences(preferences);
        const fallback = buildStoryGlassListenFallback({
            storyText: collectedStory,
            turnText: latestTurn,
            turns,
            language
        });
        const stats = getStoryGlassListenStats(collectedStory, turns);
        const preferencePrompt = getStoryGlassPreferencePrompt(normalizedPreferences, language);
        const recentTurns = (Array.isArray(turns) ? turns : [])
            .slice(-8)
            .map(turn => `${String(turn?.role || 'user')}: ${String(turn?.text || '').replace(/\s+/g, ' ').slice(0, 500)}`)
            .join('\n');

        const prompt = language === 'zh'
            ? `你是 Saki，正在“故事杯”页面里通过语音听用户讲故事。
你的任务不是每次都调酒，而是先自然回应用户刚刚说的内容，然后判断现在是否适合为用户调一杯故事杯。

请只输出 JSON，不要 Markdown：
{
  "reply": "Saki 对用户这一轮的简短回应，1-3句，亲近但克制",
  "shouldMix": false,
  "reason": "为什么现在调或不调",
  "mood": "listening | touched-holding | stay-with-user | ready-to-mix",
  "confidence": 0.0,
  "flavorSignals": ["2-5个中文故事风味短词，必须是简体中文"]
}

判断规则：
- 不要因为用户只说了一句话、一个情绪词、或很短的片段就调酒。
- 适合调酒的时机：故事已经有情绪线、转折、画面或足够的余韵；你能说出它适合怎样的杯口。
- 如果还不适合，reply 应该回应刚刚的话，并自然邀请用户继续讲，而不是机械提示。
- 如果你被某一句触动但还不想调酒，mood 用 "touched-holding"，语气要像真的在回味。
- 如果这段更需要陪伴而不是被做成酒，mood 用 "stay-with-user"，可以明确说先不急着上杯。
- 如果适合，reply 可以温柔地说明“这段已经有杯口了，我想给你调一杯”。
- 偏好只影响调酒方向，不强迫你立刻调酒。

偏好：
${preferencePrompt}

故事统计：
${JSON.stringify(stats)}

最近语音回合：
${recentTurns || '(none)'}

用户刚刚说：
${latestTurn}

当前收集到的故事：
${collectedStory}`
            : `You are Saki inside the Story Glass voice page. The user is telling you a story by voice.
Your job is not to mix after every utterance. First respond naturally to what the user just said, then decide whether this is the right moment to serve a Story Glass.

Return JSON only, no Markdown:
{
  "reply": "Saki's brief response to this turn, 1-3 sentences, warm but restrained",
  "shouldMix": false,
  "reason": "why it is or is not time to mix",
  "mood": "listening | touched-holding | stay-with-user | ready-to-mix",
  "confidence": 0.0,
  "flavorSignals": ["2-5个中文故事风味短词，必须是简体中文"]
}

Rules:
- Do not mix for just one short sentence, a single mood word, or a thin fragment.
- Mix when the story has an emotional line, a turn, imagery, or enough aftertaste that you can imagine its glass.
- If it is not time, reply to the content and naturally invite the user to continue.
- Use "touched-holding" when a line affected Saki but she wants to let it settle before pouring.
- Use "stay-with-user" when this turn feels like it needs company more than a drink.
- If it is time, say that this story now has a glass and you want to mix it.
- Preferences shape the drink direction; they do not force an immediate mix.
- flavorSignals must be generated from what the user actually said. Always return flavorSignals in Simplified Chinese, even if the rest of the response is English. Do not return generic defaults; use concrete short words such as "雨夜余温", "紧张", "小小勇气".

Preferences:
${preferencePrompt}

Story stats:
${JSON.stringify(stats)}

Recent voice turns:
${recentTurns || '(none)'}

User just said:
${latestTurn}

Collected story:
${collectedStory}`;

        let decision = fallback;
        try {
            const modelText = await callLLM(
                provider || config.provider,
                model || config.model,
                ollamaUrl || config.ollamaUrl,
                prompt,
                config
            );
            decision = normalizeStoryGlassListenDecision(parseLooseJsonObject(modelText, {}), fallback);
        } catch (error) {
            console.warn('[StoryGlass] Listen decision fallback:', error.message);
            decision = fallback;
        }

        if (stats.storyUnits < 64 || stats.sentenceCount < 1) {
            decision.shouldMix = false;
            decision.mood = 'listening';
        }

        res.json({
            ...decision,
            stats,
            language,
        });
    } catch (error) {
        console.error('[StoryGlass] Listen decision failed:', error);
        res.status(500).json({ error: error.message || 'Story Glass listen decision failed.' });
    }
});

app.post('/api/chat', async (req, res) => {
    const { message, history, provider, model, ollamaUrl, searchEnabled, mcpEnabled, useSd, useDeep, useMemory, uploadedFiles, chatId, assistantMsgId, config, resumeState = null, approvalDecision = null, useTruthCheck = false, useStoryGlass = false, storyGlassPreferences = {} } = req.body;
    touchInteractiveActivity('chat');

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let context = "";

    if (uploadedFiles && uploadedFiles.length > 0) {
        context += "\nUploaded Files Context:\n" + 
            uploadedFiles.map(f => {
                const isImg = f.isImage || (f.path && isImageFile && isImageFile(f.path));
                if (isImg) {
                    return `[IMAGE ATTACHED] File Name: ${f.name}\n(This image content is directly provided to your vision sensors. DO NOT use 'readFile' or 'terminal' to understand it.)`;
                }
                return `File: ${f.name}\nPath: ${f.path}\nContent Preview: ${f.content?.slice(0, 500)}...\n(Use 'readFile' to see more)`;
            }).join('\n\n');
    }

    if (useTruthCheck) {
        await runCredibilityLoop(res, { message, provider, model, ollamaUrl, config, chatId, assistantMsgId });
    } else if (useDeep) {
        await runDeepReadingLoop(res, { message, history, context, provider, model, ollamaUrl, searchEnabled, chatId, assistantMsgId, uploadedFiles, config, resumeState });
    } else if (req.body.usePpt) {
        await runPPTLoop(res, { message, history, context, provider, model, ollamaUrl, searchEnabled, chatId, assistantMsgId, uploadedFiles, config, resumeState });
    } else if (useStoryGlass) {
        await runStoryGlassLoop(res, { message, history, provider, model, ollamaUrl, config, chatId, assistantMsgId, resumeState, storyGlassPreferences });
    } else {
        await runAgentLoop(res, { message, history, context, provider, model, ollamaUrl, searchEnabled, mcpEnabled, useSd, chatId, assistantMsgId, uploadedFiles, config, useMemory, resumeState, approvalDecision });
    }
});

const resolvedHttps = tryResolveHttpsOptions();
const server = resolvedHttps
    ? https.createServer(resolvedHttps.options, app)
    : http.createServer(app);

server.listen(port, '0.0.0.0', () => {
    const protocol = resolvedHttps ? 'https' : 'http';
    console.log(`Server running on ${protocol}://0.0.0.0:${port}`);
    if (resolvedHttps) {
        console.log(`[SSL] HTTPS enabled with cert: ${resolvedHttps.certPath}`);
        console.log(`[SSL] HTTPS key: ${resolvedHttps.keyPath}`);
        if (resolvedHttps.caPath) {
            console.log(`[SSL] HTTPS CA bundle: ${resolvedHttps.caPath}`);
        }
    } else if (fs.existsSync(SSL_DIR)) {
        console.warn(`[SSL] No usable cert/key pair found in ${SSL_DIR}, falling back to HTTP.`);
    }

    readGlobalConfig()
        .then(config => qqBridge.syncWithConfig(config))
        .catch(error => console.error('[QQBridge] Startup sync failed:', error.message));
    loadQQBotSessionMap().catch(error => console.error('[QQBridge] Failed to load session map:', error.message));

    // Hosted Task Scheduler Loop
    setInterval(async () => {
        const dueTasks = taskScheduler.getDueTasks();
        if (dueTasks.length > 0) {
            console.log(`[Scheduler] Found ${dueTasks.length} due tasks.`);
        }
        for (const task of dueTasks) {
            console.log(`[Scheduler] Running task: ${task.id} (${task.desc})`);
            try {
                // Mark as running to show in UI and avoid re-triggering
                await taskScheduler.setTaskStatus(task.id, 'running');

                const globalConfig = await fs.readJson(GLOBAL_CONFIG_FILE).catch(() => ({}));
                const taskIdSession = `task_${task.id}_${Date.now()}`;
                
                // Add the user message to history so the session file is complete
                const initialHistory = [
                    { 
                        role: 'user', 
                        content: task.task, 
                        id: Date.now(), 
                        timestamp: Date.now() 
                    }
                ];

                // Construct a mock response object to capture essential flow
                const mockRes = {
                    write: (data) => {
                        // Optional: LOG SSE data to console or a debug file
                    },
                    on: (event, cb) => {},
                    statusCode: 200,
                    setHeader: () => {},
                    end: () => {
                        mockRes.writableEnded = true;
                    },
                    writableEnded: false,
                    finished: false
                };

                // Run the agent with a clearer system context for background execution
                const backgroundContext = `
[SYSTEM: BACKGROUND HOSTED TASK]
Subject: ${task.desc}
Instructions: ${task.task}

You are running in background mode. Plan your actions, call tools as needed, and finally provide a comprehensive summary using the 'respond' tool. 
ALWAYS use 'respond' to conclude your work so the user can see the result in their dashboard.
Avoid asking the user for input as they are not currently looking at this screen.
`;

                await runAgentLoop(mockRes, {
                    message: task.task,
                    history: initialHistory, 
                    context: backgroundContext,
                    provider: globalConfig.provider || 'ollama',
                    model: globalConfig.model,
                    ollamaUrl: globalConfig.ollamaUrl,
                    searchEnabled: task.options?.useSearch !== undefined ? task.options.useSearch : true,
                    mcpEnabled: task.options?.useMcp !== undefined ? task.options.useMcp : (globalConfig.mcpEnabled || false),
                    useSd: task.options?.useSd || false,
                    useMemory: task.options?.useMemory !== undefined ? task.options.useMemory : true,
                    uploadedFiles: [],
                    chatId: taskIdSession,
                    assistantMsgId: Date.now() + 1,
                    config: globalConfig
                });

                // Retrieve result from session file
                const sessionPath = path.join(SESSIONS_DIR, `${taskIdSession}.json`);
                let resultText = "";
                
                // Wait a bit for file persistence to ensure it's flushed
                await new Promise(r => setTimeout(r, 2000));

                if (await fs.exists(sessionPath)) {
                    const sessionData = await safeReadJsonFile(sessionPath, { messages: [] });
                    if (sessionData.messages && sessionData.messages.length > 0) {
                        // Find the last assistant message that has content
                        const assistantMessages = sessionData.messages.filter(m => m.role === 'assistant');
                        if (assistantMessages.length > 0) {
                            const lastMsg = assistantMessages[assistantMessages.length - 1];
                            if (lastMsg.parts) {
                                resultText = lastMsg.parts
                                    .filter(p => p.type === 'text')
                                    .map(p => p.content)
                                    .join('\n')
                                    .replace(/<think>[\s\S]*?<\/think>/g, '') // Remove thoughts
                                    .replace(/Thought:[\s\S]*?(?=Tool:|$)/gi, '') // Remove old-style thoughts
                                    .replace(/思考:[\s\S]*?(?=工具:|$)/gi, '') // Remove Chinese thoughts
                                    .trim();
                            }
                        }
                    }
                }
                
                // Fallback: If still empty, try to get anything from the last assistant message
                if (!resultText && await fs.exists(sessionPath)) {
                    const sessionData = await safeReadJsonFile(sessionPath, { messages: [] });
                    const assistantMessages = sessionData.messages.filter(m => m.role === 'assistant');
                    if (assistantMessages.length > 0) {
                        const lastMsg = assistantMessages[assistantMessages.length - 1];
                        resultText = lastMsg.content || (lastMsg.parts && lastMsg.parts.map(p => p.content || JSON.stringify(p.data)).join('\n'));
                    }
                }

                if (!resultText) resultText = "Task completed but no text response was captured. Check logs or session history.";
                
                await taskScheduler.updateTaskStatus(task.id, resultText, taskIdSession);
                console.log(`[Scheduler] Task ${task.id} completed. Session: ${taskIdSession}`);

            } catch (e) {
                console.error(`[Scheduler] Task ${task.id} failed:`, e);
                await taskScheduler.updateTaskStatus(task.id, `Failed: ${e.message}`, null);
            }
        }
    }, 60000); // Check every minute

    setInterval(async () => {
        try {
            const config = await readGlobalConfig();
            const result = await offlineReflectionService.maybeRun({
                config,
                activeClientCount: activeRealtimeClientCount,
                lastUserActivityAt: lastInteractiveActivityAt,
                callModel: async ({ provider, model, prompt, config: reflectionConfig }) => (
                    callLLM(
                        provider,
                        model,
                        reflectionConfig?.ollamaUrl || config?.ollamaUrl,
                        prompt,
                        reflectionConfig
                    )
                ),
            });

            if (result?.status === 'completed') {
                console.log(`[Offline Reflection] Completed for ${result.dateKey} with ${result.entities.length} entities and ${result.relations.length} relations.`);
            } else if (result?.status === 'failed') {
                console.warn(`[Offline Reflection] Failed: ${result.error}`);
            }
        } catch (error) {
            console.error('[Offline Reflection] Scheduler check failed:', error.message);
        }
    }, 60000);
});
