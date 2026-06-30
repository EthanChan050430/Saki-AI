export function getBackendUrl() {
  const { port, protocol, hostname } = window.location
  if (port === '5482') {
    return ''
  }
  const resolvedHost = hostname || '127.0.0.1'
  if (protocol === 'http:') {
    return `https://${resolvedHost}:5480`
  }
  return `${protocol}//${resolvedHost}:5480`
}

export const BACKEND_URL = getBackendUrl()
