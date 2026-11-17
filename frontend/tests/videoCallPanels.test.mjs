import test from 'node:test'
import assert from 'node:assert/strict'
import { showCallPanels, closeCallPanels, callPanelPosition, callImageUrl, callContentUrl } from '../src/utils/videoCallPanels.js'

const empty = { left: null, right: null }
test('single content chooses either side and replaces the old layout by default', () => {
  let panels = showCallPanels(empty, { id: 'one', title: 'Text' })
  assert.equal(callPanelPosition(panels), -1)
  panels = showCallPanels(panels, { id: 'two', title: 'Left', side: 'left' })
  assert.equal(panels.right, null)
  assert.equal(callPanelPosition(panels), 1)
})
test('dual layout renders distinct content and closes each side independently', () => {
  const panels = showCallPanels(empty, { id: 'layout', type: 'layout', left: { title: 'Notes' }, right: { title: 'Options' } })
  assert.equal(panels.left.id, 'layout-left')
  assert.equal(panels.right.id, 'layout-right')
  assert.equal(callPanelPosition(panels), 'center')
  assert.equal(callPanelPosition(closeCallPanels(panels, 'left')), -1)
  assert.equal(callPanelPosition(closeCallPanels(panels, 'right')), 1)
  assert.equal(callPanelPosition(closeCallPanels(panels, true)), 0)
})
test('explicit keepOther can add or replace one panel without losing the other', () => {
  let panels = showCallPanels(empty, { id: 'one', title: 'Right' })
  panels = showCallPanels(panels, { id: 'two', title: 'Left', side: 'left', keepOther: true })
  assert.equal(callPanelPosition(panels), 'center')
  panels = showCallPanels(panels, { id: 'three', title: 'New right', side: 'right', keepOther: true })
  assert.equal(panels.left.id, 'two')
  assert.equal(panels.right.id, 'three')
  panels = showCallPanels(panels, { id: 'layout-update', type: 'layout', left: { title: 'New left' }, keepOther: true })
  assert.equal(panels.left.id, 'layout-update-left')
  assert.equal(panels.right.id, 'three')
  assert.deepEqual(closeCallPanels(panels, 'all'), empty)
})
test('compact presentations keep Saki centered while either panel is open', () => {
  assert.equal(callPanelPosition(empty, true), 0)
  let panels = showCallPanels(empty, { id: 'one', title: 'Right' })
  assert.equal(callPanelPosition(panels, true), 'center')
  panels = showCallPanels(panels, { id: 'two', title: 'Left', side: 'left', keepOther: true })
  assert.equal(callPanelPosition(panels, true), 'center')
  panels = closeCallPanels(panels, 'right')
  assert.equal(callPanelPosition(panels, true), 'center')
  assert.equal(callPanelPosition(panels), 1)
  assert.equal(callPanelPosition(closeCallPanels(panels, 'left'), true), 0)
})

test('callImageUrl and callContentUrl allow https (and mailto for links) while rejecting http/javascript/data', () => {
  assert.equal(callImageUrl('https://example.com/pic.png'), 'https://example.com/pic.png')
  assert.equal(callImageUrl('http://example.com/pic.png'), '')
  assert.equal(callImageUrl('javascript:alert(1)'), '')
  assert.equal(callImageUrl('data:image/png;base64,AAAA'), '')

  assert.equal(callContentUrl('https://example.com/page', 'href'), 'https://example.com/page')
  assert.equal(callContentUrl('mailto:test@example.com', 'href'), 'mailto:test@example.com')
  assert.equal(callContentUrl('http://example.com/page', 'href'), '')
  assert.equal(callContentUrl('javascript:alert(1)', 'href'), '')
  assert.equal(callContentUrl('data:text/html,hi', 'href'), '')
  assert.equal(callContentUrl('mailto:test@example.com', 'src'), '')
  assert.equal(callContentUrl('http://example.com/pixel.png', 'src'), '')
  assert.equal(callContentUrl('https://example.com/pixel.png', 'src'), 'https://example.com/pixel.png')
})
