export function getBackendUrl() {
  const { protocol, hostname } = window.location
  const resolvedHost = hostname || '127.0.0.1'
  return `${protocol}//${resolvedHost}:5431`
}

export const BACKEND_URL = getBackendUrl()
