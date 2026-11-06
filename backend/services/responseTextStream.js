'use strict';

// Provider output is parsed repeatedly as it grows. Finalization reconciles the
// canonical answer with that preview instead of sending the whole answer twice.
function createResponseTextStream(send) {
    let visibleText = '';
    return {
        update(value) {
            const next = String(value ?? '');
            if (next === visibleText) return;
            const event = next.startsWith(visibleText)
                ? { text: next.slice(visibleText.length) }
                : { textReplacement: { length: visibleText.length, text: next } };
            visibleText = next;
            send(event);
        },
    };
}

module.exports = { createResponseTextStream };
