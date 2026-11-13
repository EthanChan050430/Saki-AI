import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatMarkdown } from '../src/utils/chatExport.js';

test('exports ordered messages, code and images without internal reasoning', () => {
  const result = chatMarkdown([
    { role: 'system', content: 'secret' },
    { role: 'user', content: 'Question', attachedFiles: [{ name: 'a b.png', isImage: true }] },
    { role: 'assistant', parts: [{ type: 'reasoning', content: 'private' }, { type: 'text', content: '```js\nconst a = 1;\n```\n[expression:smile.png]' }, { type: 'action', data: { type: 'draw' }, observation: '![Drawing](data:image/png;base64,AAAA)' }], deepReadingData: { reportMarkdown: '## Sources\nhttps://example.com' } },
  ], 'http://localhost:5480');
  assert.match(result, /## 1\. User[\s\S]*## 2\. Assistant/);
  assert.match(result, /a%20b.png/);
  assert.match(result, /```js\nconst a = 1;/);
  assert.match(result, /data:image\/png;base64,AAAA/);
  assert.match(result, /## Sources/);
  assert.doesNotMatch(result, /secret|private|expression:/);
});

test('drawing does not hide fallback answer or export unrelated tool logs', () => {
  const result = chatMarkdown([{ role: 'assistant', content: 'Final answer', parts: [
    { type: 'action', data: { type: 'draw' }, observation: '![Drawing](https://example.com/image.png)' },
    { type: 'action', data: { type: 'search' }, observation: 'private tool log ![image](https://example.com/other.png)' },
  ] }], 'http://localhost');
  assert.match(result, /Final answer/);
  assert.match(result, /Drawing/);
  assert.doesNotMatch(result, /private tool log/);
});
