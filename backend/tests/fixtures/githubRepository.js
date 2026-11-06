'use strict';

const assert = require('node:assert/strict');
const { PLUGIN_REPOSITORY, gitBlobSha } = require('../../services/githubPluginRepository');

function repositoryFixture() {
    const revision = 'a'.repeat(40);
    const files = new Map();
    const add = (name, content) => files.set(name, Buffer.from(typeof content === 'string' ? content : JSON.stringify(content)));
    add('registry.json', [
        { name: 'saki-dev-workflow', type: 'bundle', category: '开发', repo: PLUGIN_REPOSITORY },
        { name: 'saki-github', type: 'bundle', category: '开发', repo: PLUGIN_REPOSITORY },
        { name: 'saki-theme-geo', type: 'theme', repo: PLUGIN_REPOSITORY },
    ]);
    add('plugins/saki-dev-workflow/saki-plugin.json', {
        name: 'saki-dev-workflow', type: 'bundle', displayName: '开发工作流技能包', version: '1.0.0', skills: 'skills',
    });
    for (const skill of ['code-review', 'commit-message', 'debug-helper', 'tech-writing']) {
        add(`plugins/saki-dev-workflow/skills/${skill}/SKILL.md`, `---\nname: ${skill}\ndescription: Development skill\n---\n# ${skill}\nRead the actual source before answering.`);
    }
    add('plugins/saki-dev-workflow/README.md', '# Development workflows');
    add('plugins/saki-github/saki-plugin.json', {
        name: 'saki-github', type: 'bundle', displayName: 'GitHub', version: '1.0.0', skills: 'skills',
    });
    add('plugins/saki-github/.mcp.json', { mcpServers: { github: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] } } });
    add('plugins/saki-github/skills/github-workflow/SKILL.md', '---\nname: github-workflow\n---\nRead a GitHub repository.');
    const tree = { tree: [...files].map(([name, bytes]) => ({ path: name, type: 'blob', mode: '100644', size: bytes.length, sha: gitBlobSha(bytes) })), truncated: false };
    const fixture = { files, tree, revision, calls: [], fail: false, corrupt: false };
    fixture.request = async url => {
        fixture.calls.push(url);
        if (fixture.fail) throw new Error('network unavailable');
        if (url.endsWith('/commits/HEAD')) return { sha: revision };
        if (url.includes('/git/trees/')) return tree;
        const prefix = `https://raw.githubusercontent.com/${PLUGIN_REPOSITORY}/${revision}/`;
        assert.ok(url.startsWith(prefix), `Unexpected download URL: ${url}`);
        const name = decodeURIComponent(url.slice(prefix.length));
        assert.ok(files.has(name), `Unknown repository file: ${name}`);
        return fixture.corrupt && name.endsWith('/code-review/SKILL.md') ? Buffer.from('corrupted download') : files.get(name);
    };
    return fixture;
}

module.exports = { repositoryFixture };
