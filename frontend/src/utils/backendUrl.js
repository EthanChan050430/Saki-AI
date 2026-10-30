// Vite proxies development requests; production serves UI and API on one origin.
export function getBackendUrl() {
  return String(import.meta.env.VITE_BACKEND_URL || '').replace(/\/$/, '')
}

export const BACKEND_URL = getBackendUrl()
