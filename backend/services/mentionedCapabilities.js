function mentionedCapabilities(message = '') {
    const mcp = new Set();
    const skills = new Set();
    for (const match of String(message).matchAll(/(?:^|\s)@(mcp|skill):([^\s]+)/g)) {
        let id;
        try { id = decodeURIComponent(match[2]); }
        catch { throw new Error(`Invalid capability mention: ${match[0].trim()}`); }
        (match[1] === 'mcp' ? mcp : skills).add(id);
    }
    return { mcp, skills };
}

module.exports = { mentionedCapabilities };
