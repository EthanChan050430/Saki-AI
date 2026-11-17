export function callPointerPosition(iframe, clientX, clientY) {
  const view = iframe?.contentWindow
  const frame = iframe?.contentDocument?.getElementById('frame')
  if (!frame || frame.dataset.framing !== 'full') return null

  const viewport = iframe.getBoundingClientRect()
  const actor = frame.getBoundingClientRect()
  if (!actor.width || !actor.height) return null
  const matrix = new DOMMatrixReadOnly(view.getComputedStyle(frame).transform)
  const local = matrix.inverse().transformPoint({
    x: clientX - viewport.left - actor.left - actor.width / 2 + matrix.e,
    y: clientY - viewport.top - actor.top - actor.height / 2 + matrix.f,
  })
  const painted = frame.querySelector('#stage')
  const x = 500 + local.x * 1000 / frame.offsetWidth
  const y = 825 + local.y * 1650 / frame.offsetHeight
  const eyes = view.sakiFaceAnchor?.() || { x: 500, y: 242 }
  return {
    x, y, painted, walking: Boolean(frame.dataset.walking),
    gazeX: (x - eyes.x) / 625,
    gazeY: (y - eyes.y) / 590,
  }
}

export function callTouchRegion(position, checkPaint = true) {
  if (!position || position.walking) return null
  const { x, y, painted } = position
  let region = null
  if (((x - 500) / 236) ** 2 + ((y - 131) / 103) ** 2 < 1 && y < 194) region = 'head'
  else if (x > 427 && x < 568 && y > 417 && y < 540) region = 'bow'
  else if (x > 286 && x < 714 && y > 723 && y < 964) region = 'skirt'
  else if (y > 276 && y < 815) {
    const edge = Math.min(x, 1000 - x)
    // Follow the long lock as it curves out from the bow.
    const fromRoot = Math.min(1, (y - 276) / 335)
    const inner = 366 - fromRoot * 110
    const outer = 236 - fromRoot * 184
    if (edge > outer && edge < inner) region = x < 500 ? 'tail-left' : 'tail-right'
  }
  if (!region || !checkPaint) return region
  if (!painted || painted.hidden) return null
  const pixelX = Math.floor(x * painted.width / 1000)
  const pixelY = Math.floor(y * painted.height / 1000)
  const [red, green, blue, alpha] = painted.getContext('2d').getImageData(pixelX, pixelY, 1, 1).data
  if (alpha < 210) return null
  if (region.startsWith('tail-') && (red > 160 || green > 140)) return null
  if (region === 'bow' && (red - green < 42 || blue < green + 5)) return null
  // Select the navy fabric and the cardigan draped over it.
  if (region === 'skirt' && !(blue > red || (y >= 800 && green >= red * .82 && blue >= red * .7))) return null
  return region
}
