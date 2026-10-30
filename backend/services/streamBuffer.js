const { StringDecoder } = require('string_decoder');

function createLineBuffer(onLine) {
    const decoder = new StringDecoder('utf8');
    let buffer = '';
    return {
        push(chunk) {
            buffer += decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk || '')));
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() || '';
            lines.forEach(onLine);
        },
        flush() {
            buffer += decoder.end();
            if (buffer) onLine(buffer);
            buffer = '';
        },
    };
}

module.exports = { createLineBuffer };
