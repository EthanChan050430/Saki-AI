const REAL_FENCED_BLOCK_RE = /(?:^|\n)[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n[ \t]*\1[ \t]*(?=\n|$)/g;
const INLINE_CODE_SPAN_RE = /(?<!`)(`{1,2})(?!`)([^`\n]+?)\1(?!`)/g;
const WINDOWS_OR_UNC_PATH_RE = /(?:[A-Za-z]:\\|\\\\)(?:(?!(?:\\r)?\\n(?=$|[\s"'`<>()[\]\u4e00-\u9fff#*]))[^\s"'`<>()[\]])*/g;
const ESCAPED_BLOCK_RE = /(?:^|[^\\])(?:\\r)?\\n[ \t]*(?:#{1,6}[ \t]|[-*+][ \t]|\d+\.[ \t]|>[ \t]|```|~~~|\|[^|\n]+\|)/;
const ESCAPED_PARAGRAPH_RE = /(?:^|[^\\])(?:\\r)?\\n(?:\\r)?\\n/;
const ESCAPED_EDGE_RE = /^(?:\[expression:[^\]]+\])?(?:\\r)?\\n|(?:^|[^\\])(?:\\r)?\\n(?:\[expression:[^\]]+\])?$/;
const UNESCAPED_NEWLINE_TOKEN_RE = /(\\*)(?:\\r)?\\n/g;

function countUnescapedNewlines(text) {
  let count = 0;
  for (const match of text.matchAll(UNESCAPED_NEWLINE_TOKEN_RE)) {
    if ((match[1] || '').length % 2 === 0) count += 1;
  }
  return count;
}

export function normalizeEscapedMarkdown(content, { minSingleLineCount = 2 } = {}) {
  if (typeof content !== 'string' || !content.includes('\\n')) return content;

  const placeholders = [];
  const stash = (match) => {
    const token = `\u0000MD_KEEP_${placeholders.length}\u0000`;
    placeholders.push(match);
    return token;
  };

  const masked = content
    .replace(REAL_FENCED_BLOCK_RE, stash)
    .replace(INLINE_CODE_SPAN_RE, stash)
    .replace(WINDOWS_OR_UNC_PATH_RE, stash);

  const trimmed = content.trim();
  const shouldUnescape =
    ESCAPED_PARAGRAPH_RE.test(masked) ||
    ESCAPED_BLOCK_RE.test(masked) ||
    ESCAPED_EDGE_RE.test(trimmed) ||
    (!content.includes('\n') && countUnescapedNewlines(masked) >= minSingleLineCount);

  if (!shouldUnescape) return content;

  const unescaped = masked.replace(UNESCAPED_NEWLINE_TOKEN_RE, (match, slashes) => (
    slashes.length % 2 === 0 ? `${slashes}\n` : match
  ));

  return unescaped.replace(/\u0000MD_KEEP_(\d+)\u0000/g, (_, idx) => placeholders[Number(idx)]);
}
