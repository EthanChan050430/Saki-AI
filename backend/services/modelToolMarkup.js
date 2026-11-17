'use strict';

const tags = ['<toolcall>', '<tool_call>', '</toolcall>', '</tool_call>'];
const searchCall = /^\s*search\s*\(\s*query\s*[:=]\s*<arg_value>([^<]{1,1200})<\/arg_value>\s*\)/i;

// Some providers put their search protocol in the text channel. Keep that
// protocol out of streamed dialogue and recover only explicit search requests.
function parseModelToolMarkup(text, streaming = false) {
    if (!text.includes('<')) return { text, searches: [] };
    const tokens = /^[ \t]*(\x60{3,}|~{3,})[^\n]*(?:\n|$)|(\x60+)|<think>|<\/?tool_?call>/gim;
    const boundary = /<\/?tool_?call>/ig;
    const searches = [];
    let visible = '';
    let cursor = 0;
    let codeAtEnd = false;
    let match;
    while ((match = tokens.exec(text))) {
        if (match[1]) {
            const fence = match[1];
            const closing = new RegExp('^[ \\t]*' + fence[0] + '{' + fence.length + ',}[ \\t]*\\r?(?:\\n|$)', 'gm');
            closing.lastIndex = tokens.lastIndex;
            const closed = closing.exec(text);
            tokens.lastIndex = closed ? closing.lastIndex : text.length;
            codeAtEnd = !closed;
            continue;
        }
        if (match[2]) {
            const inlineEnd = text.indexOf(match[2], tokens.lastIndex);
            const lineEnd = text.indexOf('\n', tokens.lastIndex);
            if (inlineEnd >= 0 && (lineEnd < 0 || inlineEnd < lineEnd)) {
                tokens.lastIndex = inlineEnd + match[2].length;
            } else {
                tokens.lastIndex = lineEnd < 0 ? text.length : lineEnd;
                codeAtEnd = lineEnd < 0;
            }
            continue;
        }
        if (match[0].toLowerCase() === '<think>') {
            const end = text.toLowerCase().indexOf('</think>', tokens.lastIndex);
            tokens.lastIndex = end < 0 ? text.length : end + '</think>'.length;
            continue;
        }
        const lineStart = text.lastIndexOf('\n', match.index - 1) + 1;
        const prefix = text.slice(lineStart, match.index);
        if (/^\s*>/.test(prefix)) continue;
        const quote = prefix.at(-1);
        if (quote === '"' || quote === '“') {
            const end = text.indexOf(quote === '“' ? '”' : '"', tokens.lastIndex);
            if (end >= 0) tokens.lastIndex = end + 1;
            continue;
        }
        visible += text.slice(cursor, match.index);
        cursor = tokens.lastIndex;
        if (match[0].startsWith('</')) continue;

        const call = searchCall.exec(text.slice(cursor));
        if (call) {
            cursor += call[0].length;
            const query = call[1].trim().replace(/\s+/g, ' ');
            if (query) searches.push({ query, start: match.index, end: cursor });
        } else {
            boundary.lastIndex = cursor;
            const next = boundary.exec(text);
            cursor = next ? next.index : text.length;
        }
        tokens.lastIndex = cursor;
    }
    let tail = text.slice(cursor);
    if (!codeAtEnd) {
        const start = tail.lastIndexOf('<');
        const suffix = start >= 0 ? tail.slice(start).toLowerCase() : '';
        if (suffix && (streaming || /^<\/?tool_?c/.test(suffix)) && tags.some(tag => tag.startsWith(suffix))) tail = tail.slice(0, start);
    }
    return { text: visible + tail, searches };
}

function cleanSavedToolMarkup(messages) {
    const clean = content => {
        if (typeof content !== 'string' || !/<tool_?call>/i.test(content)) return content;
        const parsed = parseModelToolMarkup(content);
        return parsed.searches.length ? parsed.text.trimEnd() : content;
    };
    return messages.map(message => message?.role === 'assistant' ? {
        ...message,
        ...(typeof message.content === 'string' && { content: clean(message.content) }),
        ...(Array.isArray(message.parts) && {
            parts: message.parts.map(part => part?.type === 'text' ? { ...part, content: clean(part.content) } : part),
        }),
    } : message);
}

module.exports = { parseModelToolMarkup, cleanSavedToolMarkup };
