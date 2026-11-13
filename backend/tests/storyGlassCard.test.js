const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createStoryGlassCard } = require('../services/storyGlassCard');
const { createToolRegistry, parseToolCalls } = require('../services/agentTools');
const { nativeToolsFromRegistry } = require('../services/nativeToolCalling');

const input = {
    cocktailName: 'Quiet Evening', storySummary: 'A long day',
    flavorDescription: 'Fresh and mellow', sakiComment: 'Take a moment.',
    recipeList: ['100 ml tea', '20 ml apple juice'], recipeMode: 'zero-proof',
};

test('Agent card preserves authored content without fabricating a fallback recipe', () => {
    const card = createStoryGlassCard(JSON.stringify(input));
    assert.equal(card.presentation, 'agent');
    assert.equal(card.status, 'completed');
    assert.deepEqual(card.recipeList, input.recipeList);
    assert.equal(card.cocktailName, input.cocktailName);
    assert.equal(card.recipeMode, 'zero-proof');
    assert.equal(card.coverImageUrl, undefined);
});

test('invalid cards report errors instead of showing fabricated success', () => {
    for (const value of ['{', 'null', '[]', '{}', JSON.stringify({ ...input, recipeList: [] })]) {
        assert.throws(() => createStoryGlassCard(value));
    }
});

test('card tool is discoverable through both Agent protocols', () => {
    const registry = createToolRegistry();
    const call = `presentStoryGlass(${JSON.stringify(JSON.stringify(input))})`;
    assert.equal(parseToolCalls(call, registry)[0].name, 'presentStoryGlass');
    const tool = nativeToolsFromRegistry(registry).tools.find(item => item.function.name === 'presentStoryGlass');
    assert.deepEqual(tool.function.parameters.required, ['json']);
});

test('Agent persists cards and legacy requests no longer invoke the standalone loop', () => {
    const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    assert.match(server, /assistantMsg\.storyGlassData = card;\s*await persist\(\);/);
    assert.ok(!server.includes('await runStoryGlassLoop('));
    const chat = fs.readFileSync(path.join(__dirname, '../../frontend/src/components/Chat.jsx'), 'utf8');
    assert.ok(!chat.includes("id: 'glass'"));
    assert.ok(!chat.includes('type="storyGlass"'));
});
