import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  REMEMBERED_PASSWORD_STORAGE_KEY,
  hasLoginPassword,
  verifyLoginPassword,
  readRememberedPassword,
  writeRememberedPassword,
  clearRememberedPassword,
  reconcileLockStateOnConfigLoad,
} from '../src/utils/loginAuth.js';

function createMemoryStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: key => { store.delete(key); },
  };
}

test('hasLoginPassword and verifyLoginPassword enforce exact configured passwords', () => {
  assert.equal(hasLoginPassword(null), false);
  assert.equal(hasLoginPassword({}), false);
  assert.equal(hasLoginPassword({ loginPassword: '' }), false);
  assert.equal(hasLoginPassword({ loginPassword: 'saki-secret' }), true);

  assert.equal(verifyLoginPassword('', {}), true);
  assert.equal(verifyLoginPassword('saki-secret', { loginPassword: 'saki-secret' }), true);
  assert.equal(verifyLoginPassword('saki-secret ', { loginPassword: 'saki-secret' }), false);
  assert.equal(verifyLoginPassword('', { loginPassword: 'saki-secret' }), false);
  assert.equal(verifyLoginPassword(undefined, { loginPassword: 'saki-secret' }), false);
});

test('remembered password storage persists, clears, and tolerates corrupted or blocked storage', () => {
  const storage = createMemoryStorage();
  assert.deepEqual(readRememberedPassword(storage), { remember: false, password: '' });

  writeRememberedPassword('my-pass-123', true, storage);
  assert.deepEqual(readRememberedPassword(storage), { remember: true, password: 'my-pass-123' });

  writeRememberedPassword('my-pass-123', false, storage);
  assert.deepEqual(readRememberedPassword(storage), { remember: false, password: '' });
  assert.equal(storage.getItem(REMEMBERED_PASSWORD_STORAGE_KEY), null);

  writeRememberedPassword('temp-pass', true, storage);
  clearRememberedPassword(storage);
  assert.deepEqual(readRememberedPassword(storage), { remember: false, password: '' });

  const broken = createMemoryStorage({ [REMEMBERED_PASSWORD_STORAGE_KEY]: '{not-json' });
  assert.deepEqual(readRememberedPassword(broken), { remember: false, password: '' });

  const failingStorage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('quota exceeded'); },
    removeItem() { throw new Error('blocked'); },
  };
  assert.deepEqual(readRememberedPassword(failingStorage), { remember: false, password: '' });
  assert.doesNotThrow(() => writeRememberedPassword('abc', true, failingStorage));
  assert.doesNotThrow(() => clearRememberedPassword(failingStorage));
});

test('reconcileLockStateOnConfigLoad locks on startup when protected and preserves active session unlock', () => {
  // No password in backend config -> unlocked
  assert.equal(
    reconcileLockStateOnConfigLoad({
      wasSessionUnlocked: false,
      hadCachedPassword: true,
      unlockedByUser: false,
      loadedConfig: { loginPassword: '' },
    }),
    true
  );

  // Cached had no password, backend has password -> lock immediately
  assert.equal(
    reconcileLockStateOnConfigLoad({
      wasSessionUnlocked: true,
      hadCachedPassword: false,
      unlockedByUser: false,
      loadedConfig: { loginPassword: 'secret' },
    }),
    false
  );

  // Cached had password and user has NOT unlocked yet -> stay locked
  assert.equal(
    reconcileLockStateOnConfigLoad({
      wasSessionUnlocked: false,
      hadCachedPassword: true,
      unlockedByUser: false,
      loadedConfig: { loginPassword: 'secret' },
    }),
    false
  );

  // User already unlocked while backend config fetch was in flight -> stay unlocked
  assert.equal(
    reconcileLockStateOnConfigLoad({
      wasSessionUnlocked: true,
      hadCachedPassword: true,
      unlockedByUser: true,
      loadedConfig: { loginPassword: 'secret' },
    }),
    true
  );
});

test('App, SettingsModal, LoginScreen and index.css wire login lock screen and liquid-glass capsule', async () => {
  const [appSource, settingsSource, loginSource, cssSource] = await Promise.all([
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/SettingsModal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/LoginScreen.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
  ]);

  assert.match(appSource, /import LoginScreen from '\.\/components\/LoginScreen'/);
  assert.match(appSource, /loginPassword:\s*''/);
  assert.match(appSource, /reconcileLockStateOnConfigLoad\(/);
  assert.match(appSource, /onLockNow=\{handleLockNow\}/);
  assert.match(appSource, /<LoginScreen/);

  assert.match(settingsSource, /config\.loginPassword/);
  assert.match(settingsSource, /handleLoginPasswordChange/);
  assert.match(settingsSource, /onLockNow/);

  assert.match(loginSource, /saki-login-avatar-frame/);
  assert.match(loginSource, /saki-login-capsule/);
  assert.match(loginSource, /readRememberedPassword/);
  assert.match(loginSource, /writeRememberedPassword/);
  assert.match(loginSource, /verifyLoginPassword/);

  assert.match(cssSource, /\.saki-login-capsule/);
  assert.match(cssSource, /\.saki-login-avatar-frame/);
});
