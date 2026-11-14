// One catalog drives both prompt discovery and executable tool parsing.
const BUILTIN_TOOLS = [
    ['search', ['query'], 'Search the web for current information, external pages, or factual lookup. Include the key entities and relationships; quote exact names when useful. Supports space-separated multi-tag keyword queries (for covering multiple independent tags), site:host, -site:host and excluded terms. Reports match levels (direct, background, weak), missing terms, page-read status and retrieval warnings. Domain filters remain enforced, so omit them when broader coverage is intended. Refine or simplify keywords if results are incomplete. For verifying a disputed or uncertain factual claim across multiple sources, use verifyClaim. Do not search for greetings or tasks answerable from provided context. Never submit private content.', 'query'],
    ['verifyClaim', ['claim'], 'Gather multi-source evidence for a specific public factual claim when verification is requested or needed. Compare supporting and contradicting evidence, cite source URLs, distinguish snippets from full text, and explain uncertainty. No evidence is not proof of falsehood. Never submit private content.', 'claim'],
    ['browse', ['url'], 'Fetch and read webpage content.'],
    ['presentStoryGlass', ['json'], 'Present a drink story card ONLY when the user asks for one or a remix, never for ordinary emotional conversation. Compose the content yourself in the current conversation. Pass a JSON string with cocktailName, storySummary, flavorDescription, sakiComment and recipeList (ingredient strings with amounts). Optional: language (zh/en), recipeMode (night-bar/comfort-home/zero-proof), cocktailNameEn, cocktailSubtitle, featuredQuote, storyTags, tastingNotes, pairingSuggestions, glassware, garnish, servingMoment, request. Honor non-alcoholic and home-ingredient requests; zero-proof must contain no alcohol. Use draw separately only if an illustration is requested. Continue the conversation after presenting the card.', 'json'],
    ['terminal', ['command', 'timeoutSeconds'], 'Run a terminal command in the active workspace. timeoutSeconds is optional; 0 disables the timeout. Commands run non-interactively, without automatic confirmation.', 'command'],
    ['readFile', ['path', 'startLine', 'endLine'], 'Read text with line numbers and SHA256. Use narrow ranges for large files.'],
    ['planFileRead', ['path', 'chunkLines'], 'Plan reading a large file in chunks.'],
    ['readFileChunk', ['path', 'chunkIndex', 'chunkLines'], 'Read a planned file chunk.'],
    ['writeFile', ['path', 'content', 'expectedHash'], 'Create or overwrite a text file. Pass the latest SHA256 when overwriting.', 'content'],
    ['createWordDocument', ['path', 'spec', 'expectedHash'], 'Create a native .docx document from JSON. spec supports title and blocks of paragraph, heading, and table items.', 'spec'],
    ['createSpreadsheet', ['path', 'spec', 'expectedHash'], 'Create a native .xlsx workbook from JSON. spec supports sheets with name, headers, and rows.', 'spec'],
    ['readSpreadsheet', ['path'], 'Read workbook sheet names, dimensions, headers, and a small row preview as structured JSON.'],
    ['editFile', ['path', 'startLine', 'endLine', 'content', 'expectedHash'], 'Replace inclusive 1-based lines. expectedHash from the latest readFile is required.', 'content'],
    ['replaceInFile', ['path', 'oldText', 'newText', 'expectedHash', 'occurrence'], 'Replace exact text. expectedHash is required; occurrence disambiguates repeated matches.'],
    ['replaceBlocks', ['path', 'blocks', 'expectedHash'], 'Apply unique SEARCH/REPLACE blocks. Preferred for code edits. expectedHash is required.', 'blocks'],
    ['deleteFile', ['path', 'expectedHash'], 'Move a regular text file to Trash with its latest SHA256 from readFile. Never use for directories; use deleteDirectory for folders.'],
    ['deleteDirectory', ['path'], 'Move a directory and all its contents to Trash, after explicit path approval. Inspect with listDir first. Never use deleteFile for folders. Filesystem roots and protected directories cannot be deleted.'],
    ['listDir', ['path', 'limit', 'offset', 'includeIgnored'], 'List directory entries with pagination.'],
    ['getRepoMap', ['path'], 'Scan code structures in a repository.'],
    ['createProjectFolder', ['name'], 'Create a project folder under the active workspace.'],
    ['ensureDir', ['path'], 'Create a directory under the active workspace.'],
    ['diagram', ['mermaidCode'], 'Render Mermaid source without Markdown fences.', 'mermaidCode'],
    ['updateTodo', ['json'], 'For complex multi-step work only. Pass a JSON object with title and items; each item has id, text, status (pending, in_progress, completed).', 'json'],
    ['respond', ['text'], 'Finish with a reply in the user\'s language. Report unfinished work and verification accurately.', 'text'],
    ['draw', ['prompt', 'width', 'height'], 'Generate an image only when the user requests image creation.', 'prompt', 'drawing'],
    ['composeMusic', ['prompt', 'bars'], 'Create instrumental MIDI only when the user requests music.', 'prompt', 'music'],
    ['manage_hosted_tasks', ['action', 'jsonConfigOrId'], 'Manage scheduled tasks: list, add, delete. For add pass JSON with task, scheduleType (once/daily/weekly/monthly), time, desc. For delete pass the task ID.'],
    ['listSkills', [], 'List installed enabled skills.'],
    ['searchSkills', ['query'], 'Find relevant installed skills.', 'query'],
    ['searchOpenHubSkills', ['query'], 'Search remote OpenHub skills.', 'query'],
    ['inspectOpenHubSkill', ['slug'], 'Inspect a remote skill before installing.'],
    ['readSkill', ['name'], 'Read a skill by display name, key, slug, or title fragment.'],
    ['installSkill', ['sourceType', 'sourceOrName', 'content'], 'Install a skill from openhub, git, local, or manual. Manual uses a name and content.'],
    ['listPlugins', [], 'List installed plugins with their status, bundled skills and MCP capabilities.'],
    ['getPluginDetails', ['pluginId'], 'Get detailed information about an installed plugin.'],
    ['listMemories', [], 'List durable memories.', undefined, 'memory'],
    ['searchMemories', ['query'], 'Search durable memories.', 'query', 'memory'],
    ['readMemory', ['filename'], 'Read a complete memory.', undefined, 'memory'],
    ['saveMemory', ['name', 'content'], 'Save durable user preferences or project constraints.', 'content', 'memory'],
];

function createToolRegistry({ drawingEnabled = false, musicEnabled = true, memoryEnabled = false, mcpTools = [] } = {}) {
    const enabled = { drawing: drawingEnabled, music: musicEnabled, memory: memoryEnabled };
    const registry = new Map();
    for (const [name, params, description, bodyParam, feature] of BUILTIN_TOOLS) {
        if (feature && !enabled[feature]) continue;
        registry.set(name.toLowerCase(), { name, params, description, bodyParam });
    }
    registry.set('todo', { ...registry.get('updatetodo'), name: 'updateTodo', alias: true });
    for (const tool of mcpTools) {
        const name = `mcp_${tool.serverName}_${tool.name}`;
        const key = name.toLowerCase();
        if (registry.has(key)) throw new Error(`Ambiguous tool name: ${name}`);
        registry.set(key, {
            name, params: Object.keys(tool.inputSchema?.properties || {}),
            description: tool.description || '', bodyParam: '$json',
            mcp: { serverName: tool.serverName, toolName: tool.name, schema: tool.inputSchema || {}, annotations: tool.annotations || {} },
        });
    }
    return registry;
}

function renderToolCatalog(registry) {
    return [...registry.values()].filter(tool => !tool.alias).map(tool => {
        const schema = tool.mcp ? ` Pass one JSON object matching this schema: ${JSON.stringify(tool.mcp.schema)}` : '';
        return `- ${tool.name}(${tool.params.join(', ')}): ${tool.description}${schema}`;
    }).join('\n');
}

const ESCAPED_WINDOWS_OR_UNC_PATH_RE = /^(?:[a-zA-Z]:\\|\\\\)/;
const REAL_FENCED_BLOCK_RE = /(?:^|\n)[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n[ \t]*\1[ \t]*(?=\n|$)/g;
const INLINE_CODE_SPAN_RE = /(?<!`)(`{1,2})(?!`)([^`\n]+?)\1(?!`)/g;
const WINDOWS_OR_UNC_PATH_RE = /(?:[A-Za-z]:\\|\\\\)(?:(?!(?:\\r)?\\n(?=$|[\s"'`<>()[\]\u4e00-\u9fff#*]))[^\s"'`<>()[\]])*/g;
const ESCAPED_BLOCK_RE = /(?:^|[^\\])(?:\\r)?\\n[ \t]*(?:#{1,6}[ \t]|[-*+][ \t]|\d+\.[ \t]|>[ \t]|```|~~~|\|[^|\n]+\|)/;
const ESCAPED_PARAGRAPH_RE = /(?:^|[^\\])(?:\\r)?\\n(?:\\r)?\\n/;
const ESCAPED_EDGE_RE = /^(?:\[expression:[^\]]+\])?(?:\\r)?\\n|(?:^|[^\\])(?:\\r)?\\n(?:\[expression:[^\]]+\])?$/;
const UNESCAPED_NEWLINE_TOKEN_RE = /(\\*)(?:\\r)?\\n/g;

function countUnescapedNewlines(text) {
    let count = 0;
    for (const match of text.matchAll(UNESCAPED_NEWLINE_TOKEN_RE)) {
        if ((match[1] || '').length % 2 === 0) count += 1;
    }
    return count;
}

// Recover respond(...) payloads when models/proxies double-escape newlines inside tool JSON or string args.
function normalizeRespondText(content) {
    if (typeof content !== 'string' || !content.includes('\\n')) return content;
    const placeholders = [];
    const stash = (match) => {
        const token = `\u0000MD_KEEP_${placeholders.length}\u0000`;
        placeholders.push(match);
        return token;
    };
    const masked = content
        .replace(REAL_FENCED_BLOCK_RE, stash)
        .replace(INLINE_CODE_SPAN_RE, stash)
        .replace(WINDOWS_OR_UNC_PATH_RE, stash);

    const trimmed = content.trim();
    const shouldUnescape =
        ESCAPED_PARAGRAPH_RE.test(masked) ||
        ESCAPED_BLOCK_RE.test(masked) ||
        ESCAPED_EDGE_RE.test(trimmed) ||
        (!content.includes('\n') && countUnescapedNewlines(masked) >= 1);

    if (!shouldUnescape) return content;

    const unescaped = masked.replace(UNESCAPED_NEWLINE_TOKEN_RE, (match, slashes) => (
        slashes.length % 2 === 0 ? `${slashes}\n` : match
    ));
    return unescaped.replace(/\u0000MD_KEEP_(\d+)\u0000/g, (_, idx) => placeholders[Number(idx)]);
}

function decodeArgument(raw) {
    const text = raw.trim();
    if (text.startsWith('"') && text.endsWith('"')) {
        try { return JSON.parse(text); } catch { /* Accept single quotes or legacy unescaped strings below. */ }
    }
    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
        const quote = text[0];
        const inner = text.slice(1, -1);
        if (ESCAPED_WINDOWS_OR_UNC_PATH_RE.test(inner)) {
            return inner.replace(/\\([\\"'])/g, (match, char) => char === quote || char === '\\' ? char : match);
        }
        return inner.replace(/\\(n|r|t|\\|"|')/g, (match, char) => {
            if (char === 'n') return '\n';
            if (char === 'r') return '\r';
            if (char === 't') return '\t';
            if (char === '\\') return '\\';
            if (char === quote || char === '"' || char === "'") return char;
            return match;
        });
    }
    return text;
}

// Delimit only at the top level: JSON objects/arrays and quoted commas stay intact.
function splitArguments(raw, decode = true) {
    if (!raw.trim()) return [];
    const args = [];
    let start = 0, quote = '', escaped = false;
    const stack = [];
    for (let i = 0; i < raw.length; i++) {
        const char = raw[i];
        if (quote) {
            if (escaped) { escaped = false; continue; }
            if (char === '\\') { escaped = true; continue; }
            if (char === quote) quote = '';
        } else if (char === '"' || char === "'") quote = char;
        else if ('[{('.includes(char)) stack.push(char);
        else if (']})'.includes(char)) {
            const expected = { ']': '[', '}': '{', ')': '(' }[char];
            if (stack.pop() !== expected) throw new Error('Unbalanced tool arguments.');
        } else if (char === ',' && stack.length === 0) {
            args.push(decode ? decodeArgument(raw.slice(start, i)) : raw.slice(start, i).trim());
            start = i + 1;
        }
    }
    if (quote || stack.length) throw new Error('Incomplete tool arguments.');
    args.push(decode ? decodeArgument(raw.slice(start)) : raw.slice(start).trim());
    return args;
}

function parseToolCalls(response, registry) {
    // A quoted example in prose, reasoning, or a Markdown code block is not an action.
    const text = String(response || '');
    const calls = [];
    const startPattern = /(?:(?:Tool|工具)[:：]\s*([\w.:-]+)\s*\(|^\s*([\w.:-]+)\s*\(|<([\w.:-]+)(?:\s+([^>]*))?>)|(^[ \t]*(?:`{3,}|~{3,})[^\n]*)/gmi;
    let match;
    while ((match = startPattern.exec(text))) {
        if (match[5]) {
            const fence = match[5].trim().match(/^(?:`+|~+)/)[0];
            const closing = new RegExp(`^[ \\t]*${fence[0]}{${fence.length},}[ \\t]*\\r?$`, 'gm');
            closing.lastIndex = startPattern.lastIndex;
            const end = closing.exec(text);
            startPattern.lastIndex = end ? closing.lastIndex : text.length;
            continue;
        }
        if (match[3]?.toLowerCase() === 'think') {
            const end = text.toLowerCase().indexOf('</think>', startPattern.lastIndex);
            startPattern.lastIndex = end < 0 ? text.length : end + '</think>'.length;
            continue;
        }
        const lineStart = text.lastIndexOf('\n', match.index - 1) + 1;
        const prefixStart = Math.max(lineStart, calls.length ? calls[calls.length - 1].end : 0);
        if (text.slice(prefixStart, match.index).trim()) continue;
        let name = match[1] || match[2], rawArgs = '', parsedArgs;
        if (name) {
            let depth = 1, quote = '', escaped = false, end = startPattern.lastIndex;
            for (; end < text.length; end++) {
                const char = text[end];
                if (quote) {
                    if (escaped) { escaped = false; continue; }
                    if (char === '\\') { escaped = true; continue; }
                    if (char === quote) quote = '';
                } else if (char === '"' || char === "'") quote = char;
                else if (char === '(') depth++;
                else if (char === ')' && --depth === 0) break;
            }
            if (depth) continue;
            if (match[2] && (text.slice(0, match.index).trim() || text.slice(end + 1).trim())) continue;
            rawArgs = text.slice(startPattern.lastIndex, end);
            startPattern.lastIndex = end + 1;
        } else {
            const tag = match[3];
            const endTag = `</${tag}>`;
            const end = text.indexOf(endTag, startPattern.lastIndex);
            if (end < 0) continue;
            const attrs = Object.create(null);
            for (const attr of (match[4] || '').matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
                attrs[attr[1]] = attr[2] ?? attr[3] ?? attr[4];
            }
            name = /^(?:tool_call|call)$/i.test(tag) ? attrs.name : tag.replace(/^call:/i, '');
            const tool = registry.get(String(name || '').toLowerCase());
            const body = text.slice(startPattern.lastIndex, end);
            startPattern.lastIndex = end + endTag.length;
            if (!tool) continue;
            parsedArgs = tool.mcp && body.trim() ? [body.trim()] : tool.params.map(param => attrs[param] ?? (param === tool.bodyParam ? body : ''));
        }
        const tool = registry.get(String(name || '').toLowerCase());
        if (!tool) continue;
        try {
            const args = parsedArgs || splitArguments(rawArgs);
            const rawTokens = parsedArgs ? [] : splitArguments(rawArgs, false);
            const namedArgs = rawTokens.length > 0 && rawTokens.every(arg => /^[\w-]+\s*[:=]/.test(arg));
            let resolvedArgs = args;
            if (namedArgs && !tool.mcp && !(args.length === 1 && args[0].trim().startsWith('{'))) {
                const values = Object.create(null);
                for (const arg of rawTokens) {
                    const separator = arg.search(/[:=]/);
                    const key = arg.slice(0, separator).trim();
                    const target = key;
                    if (!tool.params.includes(target) || Object.hasOwn(values, target)) {
                        throw new Error(`Unknown or repeated argument: ${key}`);
                    }
                    values[target] = decodeArgument(arg.slice(separator + 1));
                }
                resolvedArgs = tool.params.map(param => values[param] ?? '');
            }
            calls.push({ name: tool.name, rawArgs, parsedArgs: resolvedArgs, end: startPattern.lastIndex });
        } catch (error) {
            calls.push({ name: tool.name, rawArgs, parsedArgs: [], error: error.message, end: startPattern.lastIndex });
        }
    }
    return calls;
}

function parseMcpArguments(args, tool) {
    const properties = tool.mcp.schema.properties || {};
    let result;
    if (args.length === 1 && args[0].trim().startsWith('{')) {
        result = JSON.parse(args[0]);
    } else {
        result = {};
        args.forEach((arg, index) => {
            const named = arg.match(/^(\w+)\s*[:=]\s*([\s\S]*)$/);
            const key = named && Object.hasOwn(properties, named[1]) ? named[1] : tool.params[index];
            if (!key) throw new Error('Too many MCP arguments.');
            const raw = named && key === named[1] ? named[2] : arg;
            if (!raw && !tool.mcp.schema.required?.includes(key)) return;
            const types = [properties[key]?.type].flat().filter(Boolean);
            let value = decodeArgument(raw);
            if (types.some(type => ['object', 'array', 'boolean', 'number', 'integer', 'null'].includes(type))) {
                try { value = JSON.parse(raw); } catch (error) { if (!types.includes('string')) throw error; }
            }
            Object.defineProperty(result, key, { value, enumerable: true, configurable: true, writable: true });
        });
    }
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('MCP arguments must be a JSON object.');
    for (const key of tool.mcp.schema.required || []) {
        if (!Object.hasOwn(result, key)) throw new Error(`Missing required MCP argument: ${key}`);
    }
    for (const [key, value] of Object.entries(result)) {
        const schema = properties[key];
        if (!schema) {
            if (tool.mcp.schema.additionalProperties === false) throw new Error(`Unknown MCP argument: ${key}`);
            continue;
        }
        const types = [schema.type].flat().filter(Boolean);
        const matchesType = type => type === 'null' ? value === null : type === 'array' ? Array.isArray(value)
            : type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value)
                : type === 'integer' ? Number.isInteger(value) : typeof value === type;
        if (types.length && !types.some(matchesType)) throw new Error(`Invalid type for MCP argument: ${key}; expected ${types.join(' or ')}`);
        if (Array.isArray(schema.enum) && !schema.enum.some(option => JSON.stringify(option) === JSON.stringify(value))) {
            throw new Error(`Invalid value for MCP argument: ${key}`);
        }
    }
    return result;
}

module.exports = { createToolRegistry, renderToolCatalog, parseToolCalls, parseMcpArguments, normalizeRespondText };
