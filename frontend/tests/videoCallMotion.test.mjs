import test from 'node:test'
import assert from 'node:assert/strict'
import { createVideoCallMotion } from '../src/utils/videoCallMotion.js'

function harness() {
  const motion = createVideoCallMotion({ random: () => .5 })
  let time = 0
  const tick = () => motion.tick(time += 16)
  const frames = (count = 180) => Array.from({ length: count }, tick)
  tick()
  return { motion, tick, frames }
}

test('pointer gaze tracks a held drag and settles after release', () => {
  const { motion, frames } = harness()
  motion.pointerLook(-.9, -.5)
  const left = frames(24).at(-1)
  assert(left.face[0] < -9 && left.face[5] < -.6 && left.face[6] < -.3)
  motion.pointerLook(.9, .5)
  const right = frames(65).at(-1)
  assert(right.face[0] > 9 && right.face[5] > .6 && right.face[6] > .3)
  motion.releasePointer()
  assert(frames(13).at(-1).face[5] > .6, 'a click holds the gaze briefly')
  assert.deepEqual(frames(105).at(-1).face.slice(5, 7), [0, 0])
})

test('skirt reaction brings in both hands, looks away, then returns to listening', () => {
  const { motion, frames } = harness()
  motion.touch('skirt', -1)
  const held = frames(56).at(-1)
  assert(held.hands.left[0] > .95 && held.hands.right[0] > .95)
  assert(held.hands.left[2] < -35 && held.hands.right[2] < -35)
  assert(held.face[0] > 10 && held.pout > .9)
  const end = frames(105).at(-1)
  assert.equal(end.hands, null)
  assert.equal(end.pout, undefined)
  assert.deepEqual(end.face.slice(5, 7), [0, 0])
})

test('head, bow, and either pigtail have distinct reactions', () => {
  const { motion, frames } = harness()
  motion.touch('head')
  const pat = frames(24).at(-1)
  assert(pat.face[3] < .2 && pat.face[4] < .2)
  motion.touch('bow')
  const bow = frames(24).at(-1)
  assert(bow.face[1] < -9 && bow.face[6] > .4)
  for (const [side, direction] of [['left', -1], ['right', 1]]) {
    motion.touch(`tail-${side}`)
    const poses = frames(55)
    assert(poses.some(pose => pose.tailTouch?.[0] === direction && pose.tailTouch[1] > .4))
    assert(poses.some(pose => pose.tailTouch?.[1] < -.4))
  }
})

test('a loaded video reaction yields immediately to speech and pointer gaze', () => {
  const motion = createVideoCallMotion({ random: () => .5 })
  motion.loadReactionClips({ head: 1440, skirt: 2210 })
  motion.tick(0)
  motion.touch('head')
  const halfway = motion.tick(720)
  assert.deepEqual(halfway.reaction, { name: 'head', progress: .5 })
  const speaking = motion.tick(752, { phase: 'speaking', voice: .6 })
  assert.equal(speaking.reaction, undefined)
  assert(speaking.face[7] > .1)
  motion.touch('head')
  assert.equal(motion.tick(900, { phase: 'speaking', voice: .6 }).reaction, undefined)
  motion.tick(1900)
  motion.touch('skirt')
  assert.equal(motion.tick(2240).reaction?.name, 'skirt')
  motion.pointerLook(1, 0)
  assert.equal(motion.tick(2280).reaction, undefined)
  assert(motion.tick(2320).face[5] > .25)
})

test('each waiting turn plays one thinking clip and uses live motion for the rest of the wait', () => {
  const motion = createVideoCallMotion({ random: () => .5 })
  const thinking = { phase: 'thinking', turnId: 'first' }
  motion.loadReactionClips({ 'think-chin': 2000, 'think-tilt': 2100, 'think-nod': 2200 })
  motion.tick(0)
  assert.equal(motion.tick(10, thinking).reaction, undefined)
  assert.equal(motion.tick(240, thinking).reaction, undefined)
  assert.deepEqual(motion.tick(250, thinking).reaction, { name: 'think-chin', progress: 0 })
  assert(motion.tick(900, thinking).reaction.progress > .3)
  assert.equal(motion.tick(2250, thinking).reaction, undefined)
  assert.equal(motion.tick(3600, thinking).reaction, undefined)
  assert.equal(motion.tick(32000, thinking).reaction, undefined)

  // A replacement request may arrive before the next frame sees a phase change.
  const replacement = { phase: 'thinking', turnId: 'second' }
  assert.equal(motion.tick(32020, replacement).reaction, undefined)
  assert.equal(motion.tick(32260, replacement).reaction.name, 'think-tilt')
  const reply = motion.tick(32340, { phase: 'speaking', voice: .7 })
  assert.equal(reply.reaction, undefined)
  assert(reply.face[7] > .2)
  assert.equal(motion.tick(34500, { phase: 'listening' }).reaction, undefined)
  const next = { phase: 'thinking', turnId: 'third' }
  motion.tick(34600, next)
  assert.equal(motion.tick(34840, next).reaction.name, 'think-nod')
})

test('touch reactions and deliberate pointer looks take priority over thinking clips', () => {
  const motion = createVideoCallMotion({ random: () => .5 })
  const thinking = { phase: 'thinking' }
  motion.loadReactionClips({ 'think-chin': 2400, 'think-tilt': 2400, head: 1600 })
  motion.tick(0, thinking)
  assert.equal(motion.tick(240, thinking).reaction.name, 'think-chin')
  motion.touch('head')
  assert.equal(motion.tick(450, thinking).reaction.name, 'head')
  motion.pointerLook(.9, -.5)
  assert.equal(motion.tick(560, thinking).reaction, undefined)
  const look = motion.tick(640, thinking)
  assert.equal(look.reaction, undefined)
  assert(look.face[5] > .4)
  motion.releasePointer(true)
  assert.equal(motion.tick(1000, thinking).reaction, undefined)
  assert.equal(motion.tick(1300, thinking).reaction, undefined)
  assert.equal(motion.tick(20000, thinking).reaction, undefined)
})

function assertSteps(poses) {
  assert(poses.some(pose => pose.legs[0][1] < -1), 'left knee must bend during a step')
  assert(poses.some(pose => pose.legs[1][1] > 1), 'right knee must bend in the opposite rig direction')
  assert(poses.some(pose => Math.abs(pose.legs[0][1]) > 1 && Math.abs(pose.legs[1][1]) < .001), 'legs must alternate')
  assert(poses.some(pose => Math.abs(pose.legs[1][1]) > 1 && Math.abs(pose.legs[0][1]) < .001), 'both legs must take a turn')
}

function assertContinuous(poses) {
  for (let index = 1; index < poses.length; index++) {
    assert(Math.abs(poses[index].x - poses[index - 1].x) < .02, 'position must advance continuously')
  }
}

test('closer and back commands articulate both legs while changing depth', () => {
  const { motion, frames } = harness()
  for (const [command, expectedScale] of [['靠近一点', .87 + .092], ['退后', .87]]) {
    motion.command(command)
    const poses = frames()
    assertSteps(poses)
    assert.equal(poses.at(-1).x, 0)
    assert(Math.abs(poses.at(-1).scale - expectedScale) < 1e-12)
  }
})

test('either presentation side uses steps and closes to the original position and scale', () => {
  const { motion, tick, frames } = harness()
  motion.command('往左走')
  frames()
  motion.command('靠近一点')
  const home = frames().at(-1)

  for (const side of [-1, 1]) {
    motion.present(side)
    const outward = frames()
    assert.equal(outward[0].x, home.x)
    assert.equal(outward[0].scale, home.scale)
    assert.equal(outward[0].presented, false)
    assertSteps(outward)
    assertContinuous(outward)
    const destination = outward.at(-1)
    assert.equal(destination.x, side * .25)
    assert.equal(destination.scale, .87)
    assert.equal(destination.presented, true)

    motion.present(side)
    assert.equal(tick().presented, true, 'same-side replacement must not restart walking')
    motion.command('往右走')
    assert.equal(frames().at(-1).x, destination.x, 'presentation must keep its allocated side')

    motion.present(0)
    const returning = frames()
    assert.equal(returning[0].x, destination.x)
    assertSteps(returning)
    assertContinuous(returning)
    assert.equal(returning.at(-1).x, home.x)
    assert.equal(returning.at(-1).scale, home.scale)
    assert.equal(returning.at(-1).presented, false)
    assert.deepEqual(returning.at(-1).legs, [[0, 0, 0, 1, 1], [0, 0, 0, 1, 1]])
  }
})

test('left, right and center presentations retain the first home and walk between layouts', () => {
  const { motion, tick, frames } = harness()
  motion.command('往左走')
  frames()
  motion.command('靠近一点')
  const home = frames().at(-1)
  let previous = home
  for (const layout of ['center', -1, 1, 'center', 1, -1, 'center']) {
    motion.present(layout)
    const poses = frames()
    assert.equal(poses[0].x, previous.x)
    assert.equal(poses[0].scale, previous.scale)
    assert.equal(poses[0].presented, false)
    assertSteps(poses)
    assertContinuous(poses)
    previous = poses.at(-1)
    assert.equal(previous.x, layout === 'center' ? 0 : layout * .25)
    assert.equal(previous.scale, .87)
    assert.equal(previous.presented, true)
    motion.present(layout)
    assert.equal(tick().presented, true, 'same layout must not restart walking')
    for (const command of ['往左走', '往右走', '走几步', '靠近一点', '退后']) {
      motion.command(command)
      const blocked = frames().at(-1)
      assert.equal(blocked.x, previous.x)
      assert.equal(blocked.scale, previous.scale)
      assert.equal(blocked.presented, true)
    }
  }
  motion.present(0)
  const returning = frames()
  assertSteps(returning)
  assertContinuous(returning)
  assert.equal(returning.at(-1).x, home.x)
  assert.equal(returning.at(-1).scale, home.scale)
  assert.equal(returning.at(-1).presented, false)
})

test('center presentation from an offset position walks in depth and is distinct from closing', () => {
  const { motion, frames } = harness()
  motion.command('靠近一点')
  const home = frames().at(-1)
  motion.present('center')
  const outward = frames()
  assertSteps(outward)
  assert.equal(outward.at(-1).x, 0)
  assert.equal(outward.at(-1).scale, .87)
  assert.equal(outward.at(-1).presented, true)
  motion.present(0)
  const returning = frames()
  assertSteps(returning)
  assert.equal(returning.at(-1).x, 0)
  assert.equal(returning.at(-1).scale, home.scale)
  assert.equal(returning.at(-1).presented, false)
})

test('center transitions interrupted by other layouts or closing keep the original home', () => {
  const { motion, tick, frames } = harness()
  motion.command('往右走')
  const home = frames().at(-1)
  let previous = home
  for (const layout of [-1, 'center', 1, 'center', 0, 'center']) {
    motion.present(layout)
    const first = tick()
    assert.equal(first.x, previous.x)
    assert.equal(first.scale, previous.scale)
    const poses = [first, ...frames(25)]
    assertContinuous(poses)
    previous = poses.at(-1)
  }
  frames()
  motion.present(0)
  const restored = frames().at(-1)
  assert.equal(restored.x, home.x)
  assert.equal(restored.scale, home.scale)
  assert.equal(restored.presented, false)
})

test('closing mid-walk and reopening mid-return preserve continuity and the original home', () => {
  const { motion, tick, frames } = harness()
  motion.command('往右走')
  const home = frames().at(-1)
  motion.present(-1)
  const outward = frames(30).at(-1)
  motion.present(0)
  assert.equal(tick().x, outward.x)
  assert.equal(frames().at(-1).x, home.x)

  motion.present(1)
  frames(40)
  motion.present(0)
  const returning = frames(20).at(-1)
  motion.present(-1)
  assert.equal(tick().x, returning.x)
  assert.equal(frames().at(-1).x, -.25)
  motion.present(0)
  const restored = frames().at(-1)
  assert.equal(restored.x, home.x)
  assert.equal(restored.scale, home.scale)
})

test('generated lateral clips use their own root motion and finish turning before a queued return', () => {
  const { motion, tick, frames } = harness()
  const root = [0, 0, 0, .04, .11, .2, .35, .58, .77, .93, 1, 1, 1]
  motion.loadWalkProfiles({ left: root, right: root })
  motion.present(-1)
  assert.deepEqual(tick().walk, { direction: 'left', progress: 0 })
  assert.equal(frames(12).at(-1).x, 0, 'turn starts with feet planted')
  motion.present(0)
  const trip = frames(330)
  const firstRight = trip.findIndex(pose => pose.walk?.direction === 'right')
  assert(firstRight > 0)
  assert.equal(trip[firstRight].x, -.25)
  assert.equal(trip[firstRight].walk.progress, 0)
  assert(!trip.some(pose => pose.presented))
  assertContinuous(trip)
  assert.equal(trip.at(-1).x, 0)
  assert.equal(trip.at(-1).walk, undefined)
})

test('each visible presentation walk takes 2.5 seconds in either direction', () => {
  const motion = createVideoCallMotion()
  const root = [0, 0, .01, .09, .2, .33, .5, .67, .8, .9, .99, 1, 1]
  motion.loadWalkProfiles({ left: root, right: root })
  motion.tick(0)
  for (const [i, side, direction] of [[0, -1, 'left'], [1, 1, 'right'], [2, 0, 'left']]) {
    const time = 100 + i * 2600
    motion.present(side)
    assert.deepEqual(motion.tick(time).walk, { direction, progress: 0 })
    assert.equal(motion.tick(time + 2499).presented, false)
    const arrived = motion.tick(time + 2500)
    assert.equal(arrived.walk.progress, 1)
    assert.equal(arrived.x, side * .25)
    assert.equal(arrived.presented, Boolean(side))
  }
})

test('listening, thinking and speaking keep a neutral gaze until an intentional look', () => {
  const motion = createVideoCallMotion()
  for (const [i, phase] of ['listening', 'thinking', 'speaking'].entries()) {
    const pose = motion.tick(i * 840, { phase, voice: .6 })
    assert.deepEqual(pose.face.slice(5, 7), [0, 0])
  }
  motion.command('往右看')
  motion.tick(1700)
  assert(motion.tick(2170).face[5] > .2)
  assert.deepEqual(motion.tick(3000).face.slice(5, 7), [0, 0])
})

test('ordinary speech moves both arms, alternates the lead, and settles during silence', () => {
  const motion = createVideoCallMotion({ random: () => .5 })
  const frames = Array.from({ length: 460 }, (_, index) => motion.tick(index * 16, {
    phase: index >= 410 ? 'listening' : 'speaking',
    voice: index >= 410 ? 0 : .28 + Math.sin(index / 9) * .15,
  }))
  const lifts = frames.filter(pose => pose.hands?.left?.[0] > .35 && pose.hands?.right?.[0] > .35)
  assert(lifts.length > 40)
  assert(lifts.some(({ hands }) => hands.left[2] - hands.right[2] > 25))
  assert(lifts.some(({ hands }) => hands.right[2] - hands.left[2] > 25))
  assert(lifts.some(({ hands }) => hands.left[1] > 12 && hands.right[1] > 12))
  assert.equal(frames.at(-1).hands, null)
})

test('presentation gestures favor the hand next to the component', () => {
  for (const [position, leading] of [[-1, 'left'], [1, 'right']]) {
    const motion = createVideoCallMotion({ random: () => .5 })
    motion.tick(0)
    motion.present(position)
    motion.tick(10)
    assert(motion.tick(2200).presented)
    motion.react('可以看这边的表格。')
    const hands = Array.from({ length: 42 }, (_, i) => motion.tick(2250 + i * 16, { phase: 'speaking', voice: .4 })).at(-1).hands
    assert(hands[leading][2] > hands[leading === 'left' ? 'right' : 'left'][2] + 28)
  }
})
