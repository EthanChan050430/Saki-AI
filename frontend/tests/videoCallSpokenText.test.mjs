import assert from 'node:assert/strict'
import test from 'node:test'
import { toSpokenText } from '../src/utils/videoCallSpeech.js'

// Whatever the model writes may be shown in the chat, but only prose may reach
// the speech engine: emoji and kaomoji get read out as noise.
test('emoji are never spoken', () => {
  assert.equal(toSpokenText('今天天气真好😊'), '今天天气真好')
  assert.equal(toSpokenText('好开心✨🎉'), '好开心')
  assert.equal(toSpokenText('👍🏻 我同意'), '我同意')
  assert.equal(toSpokenText('爱你❤️'), '爱你')
  assert.equal(toSpokenText('合成 emoji 序列 👨‍👩‍👧‍👦 也要清掉'), '合成 emoji 序列 也要清掉')
  assert.equal(toSpokenText('国旗 🇨🇳 也清掉'), '国旗 也清掉')
})

test('an emoji that separated two clauses leaves a pause behind', () => {
  // Removing it must not glue the sentences together.
  assert.equal(toSpokenText('我帮你记下来了📝 明天提醒你'), '我帮你记下来了 明天提醒你')
})

test('kaomoji are never spoken', () => {
  assert.equal(toSpokenText('辛苦了(￣▽￣)'), '辛苦了')
  assert.equal(toSpokenText('好耶╮(╯▽╰)╭'), '好耶')
  assert.equal(toSpokenText('这边(｡･ω･｡)ﾉ'), '这边')
  assert.equal(toSpokenText('笑死（*^▽^*）'), '笑死')
})

test('bracketed text that is actually prose is kept', () => {
  assert.equal(toSpokenText('（注）记得带伞'), '（注）记得带伞')
  assert.equal(toSpokenText('结果(2024)年'), '结果(2024)年')
  assert.equal(toSpokenText('（笑）好吧'), '（笑）好吧')
  assert.equal(toSpokenText('【重要】明天截止'), '【重要】明天截止')
  // Halfwidth katakana is real Japanese text, not a face.
  assert.equal(toSpokenText('(ﾃｽﾄ)です'), '(ﾃｽﾄ)です')
})

test('decorative symbols and musical notes are dropped', () => {
  assert.equal(toSpokenText('♪ 听着音乐'), '听着音乐')
  assert.equal(toSpokenText('★重要提示★'), '重要提示')
  // The space the arrow occupied becomes the pause between the two phrases.
  assert.equal(toSpokenText('结果 → 最终'), '结果 最终')
  assert.equal(toSpokenText('完成✓ 要不要检查一下？'), '完成 要不要检查一下？')
})

test('classic emoticons are dropped without touching real punctuation', () => {
  assert.equal(toSpokenText('好的 :)'), '好的')
  assert.equal(toSpokenText('收到 ;P'), '收到')
  assert.equal(toSpokenText('好的^_^'), '好的')
  assert.equal(toSpokenText('哈哈^^你真逗'), '哈哈你真逗')
  // Times, ratios and URLs must survive.
  assert.equal(toSpokenText('12:30 见'), '12:30 见')
  assert.equal(toSpokenText('比例是 3:1'), '比例是 3:1')
  assert.equal(toSpokenText('访问 https://a.example.com'), '访问 https://a.example.com')
})

test('markup and expression tags never reach the voice', () => {
  assert.equal(toSpokenText('[expression:happy.png]你好呀'), '你好呀')
  assert.equal(toSpokenText('**重点**是_这个_'), '重点是这个')
})

test('a segment that was only emoji produces no speech', () => {
  assert.equal(toSpokenText('😊😊😊'), '')
  assert.equal(toSpokenText('🎉。'), '')
  assert.equal(toSpokenText('(￣▽￣)'), '')
  assert.equal(toSpokenText('   '), '')
  assert.equal(toSpokenText(''), '')
  assert.equal(toSpokenText(null), '')
})

test('ordinary Chinese, Japanese and English are untouched', () => {
  assert.equal(toSpokenText('今天天气不错，我们出去走走吧。'), '今天天气不错，我们出去走走吧。')
  assert.equal(toSpokenText('按 F 键打开设置'), '按 F 键打开设置')
  assert.equal(toSpokenText('Let me know if it works.'), 'Let me know if it works.')
  assert.equal(toSpokenText('こんにちは、元気ですか？'), 'こんにちは、元気ですか？')
  assert.equal(toSpokenText('版本 1.0.3 修好了'), '版本 1.0.3 修好了')
})
