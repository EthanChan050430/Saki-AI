import assert from 'node:assert/strict'
import test from 'node:test'
import { createSpeechPipeline, createSpeechSegmenter } from '../src/utils/videoCallSpeech.js'

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

function collect(options) {
  const segments = []
  const segmenter = createSpeechSegmenter({ ...options, onSegment: text => segments.push(text) })
  return { segments, segmenter }
}

test('speech starts before the sentence is finished', () => {
  const { segments, segmenter } = collect()
  // Streaming arrives in small pieces; nothing may play until a boundary is known.
  segmenter.push('好的呀')
  assert.deepEqual(segments, [])
  segmenter.push('，我先')
  assert.deepEqual(segments, [], 'a four-character opener is not worth a pause yet')
  segmenter.push('看看，')
  assert.deepEqual(segments, ['好的呀，我先看看，'], 'the sentence is still going, but speaking already started')
})

test('a short first clause is not cut before it is worth speaking', () => {
  const { segments, segmenter } = collect()
  segmenter.push('嗯')
  assert.deepEqual(segments, [])
  segmenter.push('，')
  assert.deepEqual(segments, [])
  segmenter.push('我知道了，别担心')
  assert.equal(segments.length, 1)
})

test('sentence ends are the preferred boundary', () => {
  const { segments, segmenter } = collect()
  segmenter.push('今天天气不错，我们出去走走吧。')
  assert.deepEqual(segments, ['今天天气不错，我们出去走走吧。'])
  segmenter.push('好的！')
  assert.equal(segments.length, 2)
})

test('a run of terminators stays together', () => {
  const { segments, segmenter } = collect()
  segmenter.push('真的吗？！我不信。')
  assert.deepEqual(segments, ['真的吗？！', '我不信。'])
})

test('long speech without punctuation is cut at a cap, never mid-word', () => {
  const { segments, segmenter } = collect({ firstLimit: 12, limit: 12 })
  segmenter.push('这个 design 我觉得挺好的')
  assert.ok(segments.length > 0)
  for (const segment of segments) assert.ok(segment.length > 0)
  // No segment may end inside a Latin word.
  for (const segment of segments.slice(0, -1)) assert.ok(!/[A-Za-z]$/.test(segment) || segment.endsWith(' '))
})

test('a decimal point is not a sentence end', () => {
  const { segments, segmenter } = collect()
  segmenter.push('版本是1.0.3。')
  assert.deepEqual(segments, ['版本是1.0.3。'])
})

test('flush speaks whatever is left', () => {
  const { segments, segmenter } = collect()
  segmenter.push('还没说完的一句话')
  assert.deepEqual(segments, [])
  segmenter.flush()
  assert.deepEqual(segments, ['还没说完的一句话'])
  assert.equal(segmenter.pending, '')
})

test('the first segment is spoken early in the reply, not at the end', () => {
  const reply = '好的呀，我明白了。这个设计我觉得挺好的，就用它吧。还有别的问题吗？'
  const segments = []
  let received = 0
  let receivedAtFirst = -1
  const segmenter = createSpeechSegmenter({ onSegment: text => segments.push(text) })
  for (const char of reply) {
    received += 1
    segmenter.push(char)
    if (receivedAtFirst < 0 && segments.length) receivedAtFirst = received
  }
  segmenter.flush()
  assert.ok(receivedAtFirst > 0, 'something is spoken')
  assert.ok(receivedAtFirst <= 12, `first audio after only ${receivedAtFirst} of ${reply.length} characters`)
  assert.equal(segments.join(''), reply, 'and nothing is lost or duplicated')
})

test('whitespace-only segments are never spoken', () => {
  const { segments, segmenter } = collect()
  segmenter.push('   \n  ')
  segmenter.flush()
  assert.deepEqual(segments, [])
})

test('reset starts a new reply with a fresh first-segment budget', () => {
  const { segments, segmenter } = collect({ firstLimit: 10, limit: 40 })
  segmenter.push('一二三四五六七八九十十一十二')
  assert.equal(segments.length, 1, 'the first segment is cut at the short first limit')
  assert.equal(segments[0].length, 10)
  segmenter.reset()
  segmenter.push('一二三四五六七八九十十一十二')
  assert.equal(segments.length, 2, 'after reset the short first limit applies again')
  assert.equal(segments[1].length, 10)
})

// The pipeline is what makes speech continuous: synthesis of the next sentence
// must overlap the playback of the current one.
test('a sentence is synthesised while the previous one is still playing', async () => {
  const events = []
  const pipeline = createSpeechPipeline({
    synthesize: async text => {
      events.push(`synth:${text}:start`)
      await delay(10)
      events.push(`synth:${text}:end`)
      return text
    },
    play: async (_buffer, text) => {
      events.push(`play:${text}:start`)
      await delay(50)
      events.push(`play:${text}:end`)
    },
  })
  pipeline.push('一')
  pipeline.push('二')
  await pipeline.done
  assert.ok(
    events.indexOf('synth:二:end') < events.indexOf('play:一:end'),
    'the second sentence was ready before the first finished playing',
  )
})

test('segments still play in order and never overlap', async () => {
  const events = []
  const pipeline = createSpeechPipeline({
    synthesize: async text => text,
    play: async (_buffer, text) => {
      events.push(`start:${text}`)
      await delay(5)
      events.push(`end:${text}`)
    },
  })
  for (const text of ['一', '二', '三']) pipeline.push(text)
  await pipeline.done
  assert.deepEqual(events, [
    'start:一', 'end:一', 'start:二', 'end:二', 'start:三', 'end:三',
  ])
})

test('a failed synthesis still reaches playback so the caller can fall back', async () => {
  const played = []
  const pipeline = createSpeechPipeline({
    synthesize: async () => { throw new Error('engine down') },
    play: async (buffer, text) => played.push([buffer, text]),
  })
  pipeline.push('一句话')
  await pipeline.done
  assert.deepEqual(played, [[null, '一句话']])
})

test('a playback error on one segment does not skip the remaining segments', async () => {
  const played = []
  const pipeline = createSpeechPipeline({
    synthesize: async text => text,
    play: async (_buffer, text) => {
      if (text === '第一句') throw new Error('playback glitch')
      played.push(text)
    },
  })
  pipeline.push('第一句')
  pipeline.push('第二句')
  await pipeline.done
  assert.deepEqual(played, ['第二句'])
})
