import test from 'node:test'
import assert from 'node:assert/strict'
import { createVideoCallQuality } from '../src/utils/videoCallQuality.js'

test('weak hardware and data saver start in the light profile', () => {
  for (const limits of [{ cores: 4 }, { memory: 2 }, { saveData: true }]) {
    const quality = createVideoCallQuality(limits)
    assert.equal(quality.level, 'lite')
    assert.equal(quality.interval, 50)
    assert(quality.compactAssets)
  }
  assert.equal(createVideoCallQuality({ compact: true, cores: 8 }).level, 'balanced')
  assert.equal(createVideoCallQuality({ compact: false }).level, 'full')
})

test('the frame budget backs off under sustained pressure and recovers gradually', () => {
  const quality = createVideoCallQuality({ compact: false, cores: 12, memory: 8 })
  let now = 0
  const run = (frameTime, duration) => {
    const until = now + duration
    while (now < until) quality.sample(now += frameTime)
  }
  run(16, 1024)
  run(58, 2100)
  assert.equal(quality.level, 'balanced')
  run(64, 2200)
  assert.equal(quality.level, 'lite')
  run(16, 4000)
  assert.equal(quality.level, 'lite')
  run(16, 6200)
  assert.equal(quality.level, 'balanced')
})

test('cold calls start balanced and slower connections keep the lighter assets', () => {
  const quality = createVideoCallQuality({ cores: 12, memory: 8, startBalanced: true, downlink: 3 })
  assert.equal(quality.level, 'balanced')
  assert.equal(quality.compactAssets, true)
  for (let t = 0; t < 9500; t += 16) quality.sample(t)
  assert.equal(quality.level, 'full')
  assert.equal(quality.compactAssets, true)
})

test('resetting after a hidden tab avoids counting the paused time as a slow frame', () => {
  const quality = createVideoCallQuality({ compact: true, cores: 8 })
  quality.sample(0)
  quality.sample(17)
  quality.reset()
  for (let t = 420000; t < 430000; t += 16) quality.sample(t)
  assert.equal(quality.level, 'balanced')
})

test('compact layout changes update ceiling, level and compactAssets dynamically', () => {
  const quality = createVideoCallQuality({ compact: false, cores: 12, memory: 8 })
  assert.equal(quality.level, 'full')
  assert.equal(quality.compactAssets, false)

  quality.setCompact(true)
  assert.equal(quality.level, 'balanced')
  assert.equal(quality.compactAssets, true)

  let now = 0
  for (let i = 0; i < 650; i++) quality.sample(now += 16)
  assert.equal(quality.level, 'balanced', 'smooth frames in compact mode must not exceed balanced ceiling')

  quality.setCompact(false)
  assert.equal(quality.level, 'full')
  assert.equal(quality.compactAssets, false)

  for (let i = 0; i < 80; i++) quality.sample(now += 58)
  assert.equal(quality.level, 'lite')
  quality.setCompact(true)
  assert.equal(quality.level, 'lite')
  assert.equal(quality.compactAssets, true)
  quality.setCompact(false)
  assert.equal(quality.level, 'lite', 'pressure-degraded level stays lite when ceiling rises')
  assert.equal(quality.compactAssets, false)
  for (let i = 0; i < 650; i++) quality.sample(now += 16)
  assert.equal(quality.level, 'balanced')
  for (let i = 0; i < 650; i++) quality.sample(now += 16)
  assert.equal(quality.level, 'full')
})
