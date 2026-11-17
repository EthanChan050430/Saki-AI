import test from 'node:test'
import assert from 'node:assert/strict'
import { captionTail } from '../src/utils/videoCallSpeech.js'

test('a short caption is shown unchanged', () => {
  assert.equal(captionTail('夜里下了点雨。', 180), '夜里下了点雨。')
})

test('a long caption keeps the newest complete sentences', () => {
  const text = '第一句比较长一些。第二句也不短呢。第三句继续补充内容。第四句收尾。'
  const tail = captionTail(text, 20)
  assert.ok(tail.length <= 20, tail)
  assert.ok(text.endsWith(tail), tail)
  assert.ok(!tail.startsWith('句'), 'the cut must land on a sentence boundary when one exists')
})

test('without punctuation the caption still keeps the tail', () => {
  const text = 'x'.repeat(400)
  assert.equal(captionTail(text, 50).length, 50)
})

test('empty input stays empty', () => {
  assert.equal(captionTail('', 100), '')
  assert.equal(captionTail(undefined, 100), '')
})
