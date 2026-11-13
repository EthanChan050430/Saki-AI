const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { deleteDirectoryToTrash } = require('../services/directoryDeletion');
const { createToolRegistry, parseToolCalls } = require('../services/agentTools');
const { nativeToolsFromRegistry } = require('../services/nativeToolCalling');

async function fixture(t) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'saki-directory-test-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const workspaceRoot = path.join(root, 'workspace');
    const targetPath = path.join(workspaceRoot, 'folder');
    const trash = path.join(root, 'trash');
    await fs.mkdir(targetPath, { recursive: true });
    await fs.mkdir(trash);
    await fs.writeFile(path.join(targetPath, 'keep.txt'), 'retained data');
    const server = await fs.readFile(path.join(__dirname, '../server.js'), 'utf8');
    const start = server.indexOf('async function moveToTrash(filePath)');
    const end = server.indexOf('// --- History Utils ---', start);
    assert.ok(start > 0 && end > start);
    const context = vm.createContext({ fs: require('fs-extra'), path, TRASH_DIR: trash });
    vm.runInContext(server.slice(start, end), context);
    let requests = 0;
    return { root, trash, targetPath, workspaceRoot, moveToTrash: context.moveToTrash, requestApproval: async () => { requests++; }, count: () => requests };
}

test('directory deletion requests approval, then uses actual recoverable Trash implementation', async t => {
    const f = await fixture(t);
    const pending = await deleteDirectoryToTrash(f);
    assert.equal(pending.approvalRequested, true);
    assert.equal(f.count(), 1);
    assert.equal(await fs.readFile(path.join(f.targetPath, 'keep.txt'), 'utf8'), 'retained data');
    const result = await deleteDirectoryToTrash({ ...f, approved: true });
    assert.match(result.observation, /^Success:/);
    await assert.rejects(fs.stat(f.targetPath), { code: 'ENOENT' });
    assert.equal(await fs.readFile(path.join(f.trash, result.trashId, 'keep.txt'), 'utf8'), 'retained data');
    const metadata = JSON.parse(await fs.readFile(path.join(f.trash, result.trashId + '.json'), 'utf8'));
    assert.equal(metadata.originalPath, f.targetPath);
    assert.equal(metadata.isDirectory, true);
    await fs.rename(path.join(f.trash, result.trashId), f.targetPath);
    assert.equal(await fs.readFile(path.join(f.targetPath, 'keep.txt'), 'utf8'), 'retained data');
});

test('default scope, protected ancestors, blank paths, and files cannot be deleted as folders', async t => {
    const f = await fixture(t);
    for (const options of [
        { targetPath: f.root },
        { targetPath: f.workspaceRoot, restricted: false },
        { targetPath: path.parse(f.root).root, restricted: false },
        { targetPath: '' },
        { targetPath: path.join(f.targetPath, 'keep.txt') },
        { protectedPaths: [path.join(f.targetPath, 'protected')] },
    ]) {
        const result = await deleteDirectoryToTrash({ ...f, approved: true, ...options });
        assert.match(result.observation, /^(Permission denied|Error):/);
    }
    assert.equal(await fs.readFile(path.join(f.targetPath, 'keep.txt'), 'utf8'), 'retained data');
});

test('full access still requests approval; default scope rejects sensitive descendants', async t => {
    const f = await fixture(t);
    assert.equal((await deleteDirectoryToTrash({ ...f, restricted: false })).approvalRequested, true);
    await fs.writeFile(path.join(f.targetPath, '.env'), 'synthetic value');
    const result = await deleteDirectoryToTrash({ ...f, approved: true, isSensitivePath: p => path.basename(p) === '.env' });
    assert.match(result.observation, /Permission denied/);
    assert.ok(await fs.stat(f.targetPath));
});

test('directory junctions and junction ancestors are refused', async t => {
    const f = await fixture(t);
    const link = path.join(f.workspaceRoot, 'alias');
    try { await fs.symlink(f.targetPath, link, process.platform === 'win32' ? 'junction' : 'dir'); }
    catch (error) { if (error.code === 'EPERM') return t.skip('Host does not permit creating test links'); throw error; }
    await fs.mkdir(path.join(f.targetPath, 'nested'));
    for (const targetPath of [link, path.join(link, 'nested')]) {
        const result = await deleteDirectoryToTrash({ ...f, targetPath, approved: true });
        assert.match(result.observation, /^(Error|Permission denied):/);
    }
});

test('folder tool is discoverable in legacy and native protocols', () => {
    const registry = createToolRegistry({});
    const call = parseToolCalls('Tool: deleteDirectory("folder")', registry)[0];
    assert.equal(call.name, 'deleteDirectory');
    assert.deepEqual(call.parsedArgs, ['folder']);
    const schema = nativeToolsFromRegistry(registry).tools.find(t => t.function.name === 'deleteDirectory');
    assert.deepEqual(schema.function.parameters.required, ['path']);
    assert.match(registry.get('deletefile').description, /Never use for directories/);
});
