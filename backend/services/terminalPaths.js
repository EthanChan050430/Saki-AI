const fs = require('fs');
const path = require('path');

// Resolve symlinks before accepting an absolute cd target. Unknown targets are
// rejected rather than assuming that their eventual location is safe.
function isExistingDirectoryInside(root, target) {
    try {
        const realRoot = fs.realpathSync(root);
        const realTarget = fs.realpathSync(target);
        const relative = path.relative(realRoot, realTarget);
        return fs.statSync(realTarget).isDirectory() &&
            (relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)));
    } catch {
        return false;
    }
}

function hasUnsafeAbsoluteCd(command, root) {
    const cd = /\b(?:cd|set-location|sl)\b\s*(?:"([^"]*)"|'([^']*)'|([^\s;&|]+))/gi;
    for (const match of command.matchAll(cd)) {
        const target = match[1] ?? match[2] ?? match[3];
        if (!/^[\\/~]/.test(target)) continue;
        // Shell expansion, escapes and command substitution cannot be safely
        // resolved by inspecting the literal path.
        if (!target.startsWith('/') || /[\\$`*?\[\]{}\n\r]/.test(target) ||
            !isExistingDirectoryInside(root, target)) return true;
    }
    return false;
}

module.exports = { hasUnsafeAbsoluteCd, isExistingDirectoryInside };
