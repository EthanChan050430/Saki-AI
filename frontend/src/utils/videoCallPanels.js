export function showCallPanels(current, component) {
  if (!component?.id) return current
  if (component.type === 'layout') {
    const panel = side => component[side] ? { ...component[side], id: `${component.id}-${side}` } : component.keepOther ? current[side] : null
    return { left: panel('left'), right: panel('right') }
  }
  if (!component.title) return current
  const side = component.side === 'left' ? 'left' : 'right'
  return { ...(component.keepOther ? current : { left: null, right: null }), [side]: component }
}

export function closeCallPanels(current, side = 'all') {
  if (side === 'left' || side === 'right') return { ...current, [side]: null }
  return { left: null, right: null }
}

export function callPanelPosition(panels, compact = false) {
  if (!panels.left && !panels.right) return 0
  if (compact || (panels.left && panels.right)) return 'center'
  return panels.left ? 1 : -1
}

export function callImageUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.href : ''
  } catch { return '' }
}

export function callContentUrl(value, key) {
  if (key === 'src') return callImageUrl(value)
  try {
    const url = new URL(value)
    return ['https:', 'mailto:'].includes(url.protocol) ? url.href : ''
  } catch { return '' }
}
