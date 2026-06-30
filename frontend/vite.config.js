import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const sslDir = path.join(projectRoot, 'ssl')

function resolveHttpsConfig() {
  if (!fs.existsSync(sslDir)) {
    return false
  }

  const files = fs.readdirSync(sslDir)
  if (!files.length) {
    return false
  }

  const resolveFirst = (patterns = []) => {
    for (const pattern of patterns) {
      const match = files.find(file => pattern.test(file))
      if (match) {
        return path.join(sslDir, match)
      }
    }
    return null
  }

  const resolveCertificatePath = () => {
    const preferred = resolveFirst([
      /(?:^|[_\-.])fullchain\.pem$/i,
      /(?:^|[_\-.])cert(?:ificate)?\.(?:pem|crt)$/i,
      /\.crt$/i,
    ])
    if (preferred) {
      return preferred
    }

    const fallback = files.find(file => {
      const lower = file.toLowerCase()
      return (
        /\.(pem|crt)$/.test(lower) &&
        !lower.endsWith('.key') &&
        !lower.includes('_key.') &&
        !lower.includes('.key.') &&
        !lower.startsWith('ca') &&
        !lower.startsWith('chain') &&
        !lower.includes('bundle')
      )
    })

    return fallback ? path.join(sslDir, fallback) : null
  }

  const keyPath = resolveFirst([
    /(?:^|[_\-.])priv(?:ate)?[_\-.]?key\.(?:pem|key)$/i,
    /(?:^|[_\-.])key\.(?:pem|key)$/i,
    /_key\.(?:pem|key)$/i,
    /\.key$/i,
  ])
  const certPath = resolveCertificatePath()
  const caPath = resolveFirst([
    /^ca(?:[_\-.].*)?\.(?:pem|crt)$/i,
    /^chain(?:[_\-.].*)?\.(?:pem|crt)$/i,
    /bundle/i,
  ])

  if (!keyPath || !certPath) {
    return false
  }

  try {
    const httpsOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    }

    if (caPath && caPath !== certPath) {
      httpsOptions.ca = fs.readFileSync(caPath)
    }

    console.log(`[Vite SSL] HTTPS enabled with cert: ${certPath}`)
    console.log(`[Vite SSL] HTTPS key: ${keyPath}`)
    if (caPath && caPath !== certPath) {
      console.log(`[Vite SSL] HTTPS CA bundle: ${caPath}`)
    }

    return httpsOptions
  } catch (error) {
    console.warn(`[Vite SSL] Failed to read certs from ${sslDir}, falling back to HTTP: ${error.message}`)
    return false
  }
}

const httpsConfig = resolveHttpsConfig()
const proxyConfig = {
  '/api': {
    target: 'http://127.0.0.1:5480',
    changeOrigin: true,
  },
  '/uploads': {
    target: 'http://127.0.0.1:5480',
    changeOrigin: true,
  },
  '/files': {
    target: 'http://127.0.0.1:5480',
    changeOrigin: true,
  },
}

export default defineConfig({
  plugins: [react()],
  server: {
    https: httpsConfig,
    host: '0.0.0.0',
    port: 5482,
    strictPort: false,
    proxy: proxyConfig,
  },
  preview: {
    https: httpsConfig,
    host: '0.0.0.0',
    port: 5482,
    proxy: proxyConfig,
  },
})
