import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const avatarDir = new URL('../../video-assets/characters/saki/live2d/', import.meta.url)
const html = readFileSync(new URL('Saki_Preview.html', avatarDir), 'utf8')
const modelJson = html.match(/<script id="model" type="application\/json">(.*?)<\/script>/s)[1]
const renderer = readFileSync(new URL('Saki_Preview.js', avatarDir), 'utf8')
const { front, transition } = JSON.parse(modelJson)

test('a cold turn holds the last rendered angle and keeps animating the face', async () => {
  const elements = new Map(), listeners = new Map(), pending = []
  const drawn = [], expressions = []
  let now = 100, nextFrame, deferAngles = false
  const noOp = () => {}
  function element(id) {
    const context = new Proxy({
      drawImage(image) { if (id === 'stage') drawn.push(image.src) },
    }, { get: (target, key) => target[key] ?? noOp })
    return {
      style: {}, dataset: {}, width: 1000, height: 1000, hidden: true,
      getContext: () => context, hasAttribute: () => false,
      setAttribute: noOp, removeAttribute: noOp, addEventListener: noOp, append: noOp,
    }
  }
  function getElementById(id) {
    if (!elements.has(id)) elements.set(id, element(id))
    return elements.get(id)
  }
  getElementById('model').textContent = modelJson

  runInNewContext(renderer, {
    window: {
      createSakiLegRig: async () => noOp,
      createSakiAngledExpressions: () => ({
        texture: () => ({ pending: false, image: null }),
        drawFeatures: (_ctx, _slots, expression) => expressions.push(expression),
      }),
    },
    document: {
      documentElement: { dataset: { call: 'true', callQuality: 'balanced' } },
      getElementById, createElement: () => element(),
      addEventListener: (type, listener) => listeners.set(type, listener),
    },
    Image: class {
      width = 64
      height = 64
      set src(value) {
        this.source = value
        if (deferAngles && value.startsWith(transition.folder)) pending.push(() => this.onload())
        else queueMicrotask(() => this.onload())
      }
      get src() { return this.source }
    },
    URLSearchParams, location: { search: '?mode=call&view=full' },
    performance: { now: () => now }, setTimeout: noOp,
    requestAnimationFrame: handler => { nextFrame = handler },
  })

  async function paint(yaw, mouth) {
    now += 50
    if (yaw !== undefined) listeners.get('saki-tracking')({ detail: { face: [yaw, 3, 0, 1, 1, .45, 0, mouth] } })
    nextFrame(now)
    await new Promise(resolve => setImmediate(resolve))
  }

  await new Promise(resolve => setImmediate(resolve))
  await paint()
  assert.ok(drawn.includes(front.body), 'the front canvas paints before any angled frames load')
  for (let step = 0; step < 10; step++) await paint(16, .1)
  assert.ok(expressions.at(-1).yaw > 10)

  deferAngles = true
  drawn.length = expressions.length = 0
  for (let step = 0; step < 7; step++) await paint(-20, .7)
  assert.ok(pending.length > 0, 'new angle frames are still in flight')
  assert.ok(expressions.some(pose => pose.yaw > 10 && pose.mouth > .4), 'mouth animation stays on the visible angle')
  assert.ok(!drawn.includes(front.body), 'an incomplete blend never sends the face back to the front art')
  assert.equal(getElementById('pose-image').hidden, true)

  deferAngles = false
  for (const resolve of pending) resolve()
  await new Promise(resolve => setImmediate(resolve))
  for (let step = 0; step < 10; step++) await paint(-20, .4)
  assert.ok(expressions.at(-1).yaw < -15, 'the newest angle paints as soon as its assets arrive')
  assert.ok(!drawn.includes(front.body))
})
