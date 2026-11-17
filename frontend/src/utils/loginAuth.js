export const REMEMBERED_PASSWORD_STORAGE_KEY = 'saki_remembered_login';

/**
 * Returns true when a non-empty login lock password is configured.
 */
export function hasLoginPassword(config) {
  return typeof config?.loginPassword === 'string' && config.loginPassword.length > 0;
}

/**
 * Verifies user input against the configured login password.
 */
export function verifyLoginPassword(input, config) {
  if (!hasLoginPassword(config)) return true;
  return String(input ?? '') === config.loginPassword;
}

/**
 * Reads the locally remembered login password from browser storage.
 */
export function readRememberedPassword(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(REMEMBERED_PASSWORD_STORAGE_KEY);
    if (!raw) return { remember: false, password: '' };
    const parsed = JSON.parse(raw);
    if (parsed?.remember === true && typeof parsed?.password === 'string' && parsed.password.length > 0) {
      return { remember: true, password: parsed.password };
    }
    return { remember: false, password: '' };
  } catch {
    return { remember: false, password: '' };
  }
}

/**
 * Persists or clears the locally remembered login password in browser storage.
 */
export function writeRememberedPassword(password, remember, storage = globalThis.localStorage) {
  try {
    if (remember && typeof password === 'string' && password.length > 0) {
      storage?.setItem?.(
        REMEMBERED_PASSWORD_STORAGE_KEY,
        JSON.stringify({ remember: true, password: String(password) })
      );
      return;
    }
    storage?.removeItem?.(REMEMBERED_PASSWORD_STORAGE_KEY);
  } catch {
    // Ignore storage quota or privacy-mode errors so unlocking still succeeds.
  }
}

/**
 * Clears any locally remembered login password from browser storage.
 */
export function clearRememberedPassword(storage = globalThis.localStorage) {
  try {
    storage?.removeItem?.(REMEMBERED_PASSWORD_STORAGE_KEY);
  } catch {
    // Ignore storage quota or privacy-mode errors.
  }
}

/**
 * Reconciles session unlock status once the backend config finishes loading.
 */
export function reconcileLockStateOnConfigLoad({
  wasSessionUnlocked = false,
  hadCachedPassword = false,
  unlockedByUser = false,
  loadedConfig = null,
} = {}) {
  if (!hasLoginPassword(loadedConfig)) return true;
  if (unlockedByUser) return true;
  if (!hadCachedPassword) return false;
  return Boolean(wasSessionUnlocked);
}
