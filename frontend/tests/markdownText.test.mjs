import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEscapedMarkdown } from '../src/utils/markdownText.js';

test('normalizeEscapedMarkdown restores real newlines in escaped-newline Markdown replies', () => {
  const input =
    '[expression:think.png]\\n这条信息是**假的**哦~\\n\\n## 核查结论：❌ 虚假信息\\n\\n1. **第一点**\\n   - 子项 A\\n   - 子项 B\\n\\n[expression:no_problem.png]';

  const output = normalizeEscapedMarkdown(input);
  assert.equal(
    output,
    '[expression:think.png]\n这条信息是**假的**哦~\n\n## 核查结论：❌ 虚假信息\n\n1. **第一点**\n   - 子项 A\n   - 子项 B\n\n[expression:no_problem.png]'
  );
});

test('normalizeEscapedMarkdown converts leading/trailing escaped newlines left after tag stripping', () => {
  const input = '\\n第一段内容\\n\\n## 标题\\n结尾\\n';
  assert.equal(normalizeEscapedMarkdown(input), '\n第一段内容\n\n## 标题\n结尾\n');
});

test('normalizeEscapedMarkdown preserves inline code, fenced code blocks, Windows paths, and double backslashes', () => {
  const inlineCode = 'In JS, use `\\n` or `"a\\nb"` for newlines.';
  assert.equal(normalizeEscapedMarkdown(inlineCode), inlineCode);

  const fenced = 'Example:\n\n```json\n{\n  "text": "hello\\n\\n## heading"\n}\n```';
  assert.equal(normalizeEscapedMarkdown(fenced), fenced);

  const windowsPath = '请检查文件 C:\\new\\notes.txt 和 D:\\docs\\news.md';
  assert.equal(normalizeEscapedMarkdown(windowsPath), windowsPath);

  const uncPath = '共享路径：\\\\server\\new\\notes';
  assert.equal(normalizeEscapedMarkdown(uncPath), uncPath);

  const escapedWithInlineCode = '说明\\n\\n使用 `\\n` 换行\\n\\n路径 C:\\new\\a.txt\\n下一行';
  assert.equal(
    normalizeEscapedMarkdown(escapedWithInlineCode),
    '说明\n\n使用 `\\n` 换行\n\n路径 C:\\new\\a.txt\n下一行'
  );

  const doubleSlash = 'line1\n\\\\n literal';
  assert.equal(normalizeEscapedMarkdown(doubleSlash), doubleSlash);
});
