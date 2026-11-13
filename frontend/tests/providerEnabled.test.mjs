import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateApiProviderConfig, isChatProviderEnabled, isApiProviderEnabled, CHAT_PROVIDER_OPTIONS } from '../src/utils/chatProviderConfig.js';

test('credentials never enable providers; migration preserves current provider and explicit switches', () => {
  const config = migrateApiProviderConfig({ provider: 'copilot', openaiApiKey: 'saved', providerEnabled: { ollama: false } });
  assert.equal(isChatProviderEnabled(config, 'copilot'), true);
  assert.equal(isChatProviderEnabled(config, 'ollama'), false);
  assert.equal(isApiProviderEnabled(config, 'openai'), false);
  assert.equal(config.openaiApiKey, 'saved');
  assert.equal(Object.keys(config.providerEnabled).length, CHAT_PROVIDER_OPTIONS.length);
  assert.deepEqual(migrateApiProviderConfig(config), config);
});

test('every provider can be disabled even when current, and enabled independently of credentials', () => {
  for (const { id } of CHAT_PROVIDER_OPTIONS) {
    const config = migrateApiProviderConfig({ provider: id, providerEnabled: { [id]: false } });
    assert.equal(isChatProviderEnabled(config, id), false);
    config.providerEnabled[id] = true;
    assert.equal(isChatProviderEnabled(config, id), true);
    assert.equal(isChatProviderEnabled({ ...config, provider: 'custom' }, id), true);
  }
});
