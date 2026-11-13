import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findCapabilityMention, insertCapabilityMention } from '../src/utils/capabilityMentions.js';

test('mention picker follows the caret, not the end of the draft, and ignores emails', () => {
  assert.equal(findCapabilityMention('hello @git more text', 10)[1], 'git');
  assert.equal(findCapabilityMention('hello @git more text', 20), null);
  assert.equal(findCapabilityMention('user@example.com', 16), null);
  assert.equal(findCapabilityMention('@', 1)[1], '');
});

test('choosing multiple mentions retains surrounding text and returns the insertion caret', () => {
  const first = insertCapabilityMention('hello @gi remaining', 9, '@mcp:git');
  assert.equal(first.text, 'hello @mcp:git  remaining');
  assert.equal(first.cursor, 15);
  const second = insertCapabilityMention(`${first.text} @`, first.text.length + 2, '@skill:notes');
  assert.equal(second.text, 'hello @mcp:git  remaining @skill:notes ');
  assert.equal(findCapabilityMention(second.text, second.cursor), null);
  assert.equal(insertCapabilityMention('ordinary message', 16, '@mcp:git'), null);
});
