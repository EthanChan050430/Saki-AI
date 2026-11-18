const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { hasUnsafeAbsoluteCd, isExistingDirectoryInside } = require('../services/terminalPaths');

test('absolute cd targets must resolve to an existing directory inside the workspace', (t) => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'saki-terminal-'));
    t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
    const root = path.join(temp, 'workspace');
    const child = path.join(root, 'project');
    const outside = path.join(temp, 'workspace-other');
    fs.mkdirSync(child, { recursive: true });
    fs.mkdirSync(outside);
    assert.equal(isExistingDirectoryInside(root, child), true);
    assert.equal(isExistingDirectoryInside(root, outside), false);
    assert.equal(isExistingDirectoryInside(root, path.join(root, 'missing')), false);
    if (process.platform !== 'win32') {
        fs.symlinkSync(outside, path.join(root, 'link'));
        assert.equal(hasUnsafeAbsoluteCd(`cd '${child}' && git status`, root), false);
        assert.equal(hasUnsafeAbsoluteCd(`cd ${outside}`, root), true);
        assert.equal(hasUnsafeAbsoluteCd(`cd ${path.join(root, 'link')}`, root), true);
        assert.equal(hasUnsafeAbsoluteCd('cd /tmp/$HOME', root), true);
    }
    assert.equal(hasUnsafeAbsoluteCd('cd ~', root), true);
});
