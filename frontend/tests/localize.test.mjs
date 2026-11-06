import test from 'node:test';
import assert from 'node:assert/strict';
import i18n from 'i18next';

test('localization imports in Node without DOM, browser bootstrap or IP lookup', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = () => { requests += 1; throw new Error('unexpected network request'); };
  try {
    const { localize, localizeWith } = await import('../src/utils/localize.js');
    assert.equal(typeof globalThis.window, 'undefined');
    assert.equal(localizeWith('zh-CN', '测试', 'Test'), '测试');
    assert.equal(localizeWith('en-US', '测试', 'Test'), 'Test');
    assert.equal(localizeWith('ja', '未收录测试文本', 'Test', 'テスト'), 'テスト');
    await i18n.init({ lng: 'en-US', resources: {}, initImmediate: false });
    assert.equal(localize('测试', 'Test'), 'Test');
    await i18n.changeLanguage('zh-CN');
    assert.equal(localize('测试', 'Test'), '测试');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});