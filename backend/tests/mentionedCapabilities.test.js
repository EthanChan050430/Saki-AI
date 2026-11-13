const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mentionedCapabilities } = require('../services/mentionedCapabilities');
const { SkillService } = require('../services/skills');
const { createToolRegistry } = require('../services/agentTools');

test('mentions preserve exact IDs, deduplicate, and ignore emails and unrelated text', () => {
    const selected = mentionedCapabilities('Use @mcp:my%20server @skill:abc @skill:abc user@mcp:other');
    assert.deepEqual([...selected.mcp], ['my server']);
    assert.deepEqual([...selected.skills], ['abc']);
    assert.equal(mentionedCapabilities('hello').mcp.size, 0);
    assert.throws(() => mentionedCapabilities('@mcp:%xx'), /Invalid capability/);
});

test('skill scope is applied before identifier resolution and search', async () => {
    const service = new SkillService({ dataDir: '.' });
    service.loadStore = async () => ({ skills: [
        { id: 'a', name: 'Alpha', content: 'alpha workflow', enabled: true },
        { id: 'b', name: 'Beta', content: 'beta workflow', enabled: true },
        { id: 'c', name: 'Disabled', enabled: false },
    ] });
    const options = { enabledOnly: true, ids: new Set(['a', 'c']) };
    assert.equal((await service.getSkill('Alpha', options)).id, 'a');
    assert.equal(await service.getSkill('Beta', options), null);
    assert.equal(await service.getSkill('Disabled', options), null);
    assert.ok((await service.searchSkills('beta', 8, options)).every(skill => skill.id === 'a'));
    assert.deepEqual(service.filterSkills((await service.loadStore()).skills, { ids: new Set() }), []);
});

test('MCP selection excludes unselected server tools from executable registry', () => {
    const selected = mentionedCapabilities('@mcp:one');
    const tools = ['one', 'two'].map(serverName => ({ serverName, name: 'read' }));
    const registry = createToolRegistry({ mcpTools: tools.filter(tool => selected.mcp.has(tool.serverName)) });
    assert.ok(registry.has('mcp_one_read'));
    assert.equal(registry.has('mcp_two_read'), false);
});
