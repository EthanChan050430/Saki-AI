// Read the shared instance without bootstrapping browser detection / IP requests.
import i18n from "i18next";
import ZH_TO_JA from "./zhToJa.js";

const PLACEHOLDER = /\$\{[^}]*\}/g;

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Interpolated entries are keyed on their source template (e.g. "对话 #${n}"),
// but call sites hand us the already-filled string ("对话 #3"). Compiling the
// templates into patterns lets those values resolve without a re-lookup.
const buildTemplatePatterns = () => {
  const patterns = [];
  for (const [key, value] of Object.entries(ZH_TO_JA)) {
    if (!key.includes("${")) continue;
    const parts = key.split(PLACEHOLDER);
    if (parts.length < 2) continue;
    const source = parts.map(escapeRegExp).join("(.*?)");
    try {
      patterns.push({
        regex: new RegExp(`^${source}$`, "s"),
        template: value,
        weight: parts.join("").length,
      });
    } catch {
      // Skip templates that cannot be compiled; the direct lookup still applies.
    }
  }
  // More literal characters wins, so "已清理 ${X} 个文件" beats "${X} 个文件".
  return patterns.sort((a, b) => b.weight - a.weight);
};

const TEMPLATE_PATTERNS = buildTemplatePatterns();
const LOOKUP_CACHE = new Map();

// Collapses interpolated values into a single token so a runtime string such as
// "已清理 3 个文件，释放约 12 MB。" can still find its dictionary entry.
export const normalizeForLookup = (text) => String(text ?? "").replace(PLACEHOLDER, "\u0001");

// Re-inserts the runtime values into a translated template, matching
// placeholders by position so differing identifier names do not matter.
const fillPlaceholders = (template, source) => {
  const values = String(source).match(PLACEHOLDER) || [];
  let index = 0;
  return template.replace(PLACEHOLDER, () => values[index++] ?? "");
};

export const lookupJapanese = (zhText) => {
  if (typeof zhText !== "string" || !zhText) return undefined;
  if (LOOKUP_CACHE.has(zhText)) return LOOKUP_CACHE.get(zhText);
  const resolved = lookupJapaneseUncached(zhText);
  if (LOOKUP_CACHE.size < 4000) LOOKUP_CACHE.set(zhText, resolved);
  return resolved;
};

const lookupJapaneseUncached = (zhText) => {
  const direct = ZH_TO_JA[zhText];
  if (direct) return direct;

  for (const { regex, template } of TEMPLATE_PATTERNS) {
    const match = zhText.match(regex);
    if (!match) continue;
    let index = 1;
    return template.replace(PLACEHOLDER, () => match[index++] ?? "");
  }

  const normalized = normalizeForLookup(zhText);
  if (normalized === zhText) return undefined;
  for (const key of Object.keys(ZH_TO_JA)) {
    if (normalizeForLookup(key) === normalized) {
      return fillPlaceholders(ZH_TO_JA[key], zhText);
    }
  }
  return undefined;
};

export const resolveLangCode = (language) =>
  String(language || i18n.resolvedLanguage || i18n.language || "en-US").toLowerCase();

export const isJapaneseLanguage = (language) => resolveLangCode(language).startsWith("ja");

export const isChineseLanguage = (language) => resolveLangCode(language).startsWith("zh");

/**
 * Three-way replacement for the binary `getLocalText(zh, en)` helpers.
 * Chinese locales get `zhText`, Japanese gets the dictionary entry (falling
 * back to `jaText` then `enText`), everything else gets `enText`.
 */
export const localize = (zhText, enText, jaText) => {
  const lang = resolveLangCode();
  if (lang.startsWith("zh")) return zhText;
  if (lang.startsWith("ja")) return lookupJapanese(zhText) ?? jaText ?? enText;
  return enText;
};

/** Same as `localize` but for an explicit language instead of the active one. */
export const localizeWith = (language, zhText, enText, jaText) => {
  const lang = resolveLangCode(language);
  if (lang.startsWith("zh")) return zhText;
  if (lang.startsWith("ja")) return lookupJapanese(zhText) ?? jaText ?? enText;
  return enText;
};

export const useLocalize = () => localize;

export default localize;
