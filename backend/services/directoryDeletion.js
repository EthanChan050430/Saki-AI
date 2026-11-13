const fs = require('node:fs/promises');
const path = require('node:path');

function containsPath(parent, child) {
    const relative = path.relative(parent, child);
    return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function deleteDirectoryToTrash({ targetPath, workspaceRoot, protectedPaths = [], restricted = true, isSensitivePath = () => false, approved = false, requestApproval, moveToTrash }) {
    if (!String(targetPath || '').trim()) return { observation: 'Error: deleteDirectory requires an explicit directory path.' };
    const target = path.resolve(targetPath);
    const workspace = path.resolve(workspaceRoot);
    if (restricted && !containsPath(workspace, target)) {
        return { observation: `Permission denied: default permission only allows deleting directories inside sandbox ${workspace}.` };
    }
    if (target === path.parse(target).root || [workspace, ...protectedPaths].some(entry => containsPath(target, path.resolve(entry)))) {
        return { observation: 'Permission denied: refusing to delete a filesystem root, protected directory, or an ancestor of one.' };
    }
    const stats = await fs.lstat(target);
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
        return { observation: 'Error: deleteDirectory requires a real directory, not a file, symlink or junction. Use deleteFile only for regular text files.' };
    }
    const realTarget = await fs.realpath(target);
    for (let ancestor = path.dirname(target); ; ancestor = path.dirname(ancestor)) {
        if ((await fs.lstat(ancestor)).isSymbolicLink()) {
            return { observation: 'Permission denied: directory deletion through a symlink or junction is not supported. Inspect the actual path first.' };
        }
        if (ancestor === path.dirname(ancestor)) break;
    }
    for (const entry of [workspace, ...protectedPaths]) {
        const realProtected = await fs.realpath(entry).catch(() => path.resolve(entry));
        if (containsPath(realTarget, realProtected)) return { observation: 'Permission denied: refusing to delete a protected directory or an ancestor of one.' };
    }
    if (restricted) {
        const realWorkspace = await fs.realpath(workspace);
        if (!containsPath(realWorkspace, realTarget)) return { observation: 'Permission denied: directory resolves outside the sandbox.' };
        // Check descendants too: deleting a harmless-looking parent must not bypass secret-path protection.
        const pending = [target];
        let inspected = 0;
        while (pending.length) {
            const current = pending.pop();
            if (isSensitivePath(current)) return { observation: 'Permission denied: directory contains a sensitive config or secret path.' };
            const entries = await fs.readdir(current, { withFileTypes: true });
            for (const entry of entries) {
                if (++inspected > 10000) return { observation: 'Error: directory exceeds the 10000-entry safety inspection limit; choose a smaller directory.' };
                const child = path.join(current, entry.name);
                if (isSensitivePath(child)) return { observation: 'Permission denied: directory contains a sensitive config or secret path.' };
                if (entry.isDirectory() && !entry.isSymbolicLink()) pending.push(child);
            }
        }
    }
    if (!approved) {
        await requestApproval({ reasonKey: 'directory-delete', reason: 'Moving this directory and all its contents to Trash requires approval for this exact path.', summary: target });
        return { approvalRequested: true };
    }
    const trashId = await moveToTrash(target);
    if (!trashId) return { observation: 'Error: directory disappeared before it could be moved to Trash.' };
    return { observation: `Success: Directory and its contents moved to Trash. (ID: ${trashId}). Restore it from the file manager Trash if needed.`, deletedPath: target, trashId };
}

module.exports = { deleteDirectoryToTrash };
