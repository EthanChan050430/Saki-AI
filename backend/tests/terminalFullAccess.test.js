const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('full access bypasses terminal sandbox and approval checks', () => {
    const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    const start = source.indexOf('function evaluateTerminalPermission(');
    const end = source.indexOf('\nfunction runTerminalCommand(', start);
    assert.ok(start >= 0 && end > start);
    const evaluate = vm.runInNewContext(`(${source.slice(start, end).trim()})`, {
        AGENT_PERMISSION_MODE_FULL: 'full-access',
        workspaceService: { currentRoot: '/opt' },
        isSensitivePath: () => { throw new Error('full access must bypass sensitive path checks'); },
        hasUnsafeAbsoluteCd: () => { throw new Error('full access must bypass path checks'); },
    });
    for (const command of ['cd /etc && git status', 'rm -rf /tmp/example', 'python script.py', 'cat ~/.ssh/id_rsa']) {
        const result = evaluate(command, 'full-access');
        assert.equal(result.allowed, true);
        assert.equal(result.cwd, '/opt');
        assert.equal(result.requiresApproval, undefined);
    }
});
