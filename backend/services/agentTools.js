// One catalog drives both prompt discovery and executable tool parsing.
const BUILTIN_TOOLS = [
    ['search', ['query'], 'Search the web for current information.', 'query', 'search'],
    ['browse', ['url'], 'Fetch and read webpage content.'],
    ['terminal', ['command', 'timeoutSeconds'], 'Run a terminal command in the active workspace. timeoutSeconds is optional; 0 disables the timeout. Commands run non-interactively, without automatic confirmation.', 'command'],
    ['readFile', ['path', 'startLine', 'endLine'], 'Read text with line numbers and SHA256. Use narrow ranges for large files.'],
    ['planFileRead', ['path', 'chunkLines'], 'Plan reading a large file in chunks.'],
    ['readFileChunk', ['path', 'chunkIndex', 'chunkLines'], 'Read a planned file chunk.'],
    ['writeFile', ['path', 'content', 'expectedHash'], 'Create or overwrite a text file. Pass the latest SHA256 when overwriting.', 'content'],
    ['editFile', ['path', 'startLine', 'endLine', 'content', 'expectedHash'], 'Replace inclusive 1-based lines. expectedHash from the latest readFile is required.', 'content'],
    ['replaceInFile', ['path', 'oldText', 'newText', 'expectedHash', 'occurrence'], 'Replace exact text. expectedHash is required; occurrence disambiguates repeated matches.'],
    ['replaceBlocks', ['path', 'blocks', 'expectedHash'], 'Apply unique SEARCH/REPLACE blocks. Preferred for code edits. expectedHash is required.', 'blocks'],
    ['deleteFile', ['path', 'expectedHash'], 'Delete a file with its latest SHA256.'],
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
    ['listMemories', [], 'List durable memories.', undefined, 'memory'],
    ['searchMemories', ['query'], 'Search durable memories.', 'query', 'memory'],
    ['readMemory', ['filename'], 'Read a complete memory.', undefined, 'memory'],
    ['saveMemory', ['name', 'content'], 'Save durable user preferences or project constraints.', 'content', 'memory'],
];

function createToolRegistry({ searchEnabled = false, drawingEnabled = false, musicEnabled = true, memoryEnabled = false, mcpTools = [] } = {}) {
    const enabled = { search: searchEnabled, drawing: drawingEnabled, music: musicEnabled, memory: memoryEnabled };
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

function decodeArgument(raw) {
    const text = raw.trim();
    if (text.startsWith('"') && text.endsWith('"')) {
        try { return JSON.parse(text); } catch { /* Accept legacy unescaped Windows paths below. */ }
    }
    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
        const quote = text[0];
        return text.slice(1, -1).replace(/\\([\\"'])/g, (match, char) => char === quote || char === '\\' ? char : match);
    }
    return text;
}

// Delimit only at the top level: JSON objects/arrays and quoted commas stay intact.
function splitArguments(raw) {
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
            args.push(decodeArgument(raw.slice(start, i)));
            start = i + 1;
        }
    }
    if (quote || stack.length) throw new Error('Incomplete tool arguments.');
    args.push(decodeArgument(raw.slice(start)));
    return args;
}

function parseToolCalls(response, registry) {
    // A quoted example in prose, reasoning, or a Markdown code block is not an action.
    const text = String(response || '');
    const calls = [];
    const startPattern = /(?:(?:Tool|工具)[:：]\s*([\w.:-]+)\s*\(|<([\w.:-]+)(?:\s+([^>]*))?>)|(^[ \t]*(?:`{3,}|~{3,})[^\n]*)/gmi;
    let match;
    while ((match = startPattern.exec(text))) {
        if (match[4]) {
            const fence = match[4].trim().match(/^(?:`+|~+)/)[0];
            const closing = new RegExp(`^[ \\t]*${fence[0]}{${fence.length},}[ \\t]*\\r?$`, 'gm');
            closing.lastIndex = startPattern.lastIndex;
            const end = closing.exec(text);
            startPattern.lastIndex = end ? closing.lastIndex : text.length;
            continue;
        }
        if (match[2]?.toLowerCase() === 'think') {
            const end = text.toLowerCase().indexOf('</think>', startPattern.lastIndex);
            startPattern.lastIndex = end < 0 ? text.length : end + '</think>'.length;
            continue;
        }
        const lineStart = text.lastIndexOf('\n', match.index - 1) + 1;
        const prefixStart = Math.max(lineStart, calls.length ? calls[calls.length - 1].end : 0);
        if (text.slice(prefixStart, match.index).trim()) continue;
        let name = match[1], rawArgs = '', parsedArgs;
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
            rawArgs = text.slice(startPattern.lastIndex, end);
            startPattern.lastIndex = end + 1;
        } else {
            const tag = match[2];
            const endTag = `</${tag}>`;
            const end = text.indexOf(endTag, startPattern.lastIndex);
            if (end < 0) continue;
            const attrs = Object.create(null);
            for (const attr of (match[3] || '').matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
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
            calls.push({ name: tool.name, rawArgs, parsedArgs: parsedArgs || splitArguments(rawArgs), end: startPattern.lastIndex });
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

module.exports = { createToolRegistry, renderToolCatalog, parseToolCalls, parseMcpArguments };
