import assert from 'node:assert/strict'
import test from 'node:test'
import { looksLikeEcho } from '../src/utils/videoCallEcho.js'

// Saki's own voice can bleed back into the microphone right after she stops
// speaking. Treating too much text as echo silently deletes the user's words.
test('a faithful pickup of the spoken sentence is echo', () => {
  const spoken = '我觉得这个设计挺好的呀'
  assert.equal(looksLikeEcho('我觉得这个设计挺好的呀', spoken), true)
  assert.equal(looksLikeEcho('我觉得这个设计挺', spoken), true)
})

test('a long fragment of the spoken sentence is echo', () => {
  assert.equal(looksLikeEcho('把这个 JSON 文件转成 Excel 表格', '帮我把这个 JSON 文件转成 Excel 表格发给我'), true)
})

test('a short reply that merely appears inside the sentence is the user', () => {
  const spoken = '我觉得这个设计挺好的呀要不要再看看别的方案'
  assert.equal(looksLikeEcho('挺好的', spoken), false)
  assert.equal(looksLikeEcho('这个设计', spoken), false)
})

test('unrelated speech, punctuation-only and empty input are never echo', () => {
  assert.equal(looksLikeEcho('今天天气不错', '我觉得这个设计挺好的呀'), false)
  assert.equal(looksLikeEcho('。。。', '我觉得这个设计挺好的呀'), false)
  assert.equal(looksLikeEcho('', '我觉得这个设计挺好的呀'), false)
  assert.equal(looksLikeEcho('我觉得这个设计挺好', ''), false)
})

test('comparison ignores case, width and punctuation', () => {
  assert.equal(looksLikeEcho('我觉得OK挺好的呀没问题', '我觉得ok挺好的呀，没问题！'), true)
})

test('near-match ASR bleed with homophones or long accumulated speech is still echo', () => {
  const spoken = '是的真的辞职了我给你捋一下时间线是的黄仁勋确实辞职了十一月十二日英伟达官宣他卸任总裁'
  assert.equal(looksLikeEcho('是的黄仁勋却实辞职了', spoken), true)
  assert.equal(looksLikeEcho('我给你理一下时间线', spoken), true)
})

test('short user replies are never swallowed as echo even when Saki spoke a short line', () => {
  assert.equal(looksLikeEcho('好的', '好的'), false)
  assert.equal(looksLikeEcho('好的', '好的，没问题！'), false)
  assert.equal(looksLikeEcho('没问题', '好的，没问题'), false)
  assert.equal(looksLikeEcho('挺好的', '挺好的呀'), false)
  assert.equal(looksLikeEcho('OK', '好的OK'), false)
})
