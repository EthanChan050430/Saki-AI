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
// The backend loads the same local TLS certificates as Vite.
const backendTarget = `${httpsConfig ? 'https' : 'http'}://127.0.0.1:5480`
function createBackendProxy() {
  return {
    target: backendTarget,
    changeOrigin: true,
    secure: false,
    configure(proxy) {
      proxy.on('error', (_error, _request, response) => {
        if (!response || typeof response.writeHead !== 'function' || response.headersSent || response.writableEnded) return
        response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({ error: '后端服务暂时不可用，请确认后端已启动后重试。' }))
      })
    },
  }
}
const proxyConfig = {
  '/api': createBackendProxy(),
  '/uploads': createBackendProxy(),
  '/files': createBackendProxy(),
}

// Light releases keep static expressions, omitting 437 MB of animation frames.
function deploymentAssets() {
  let outDir
  return {
    name: 'saki-deployment-assets',
    apply: 'build',
    configResolved(config) { outDir = path.resolve(config.root, config.build.outDir) },
    closeBundle() {
      const publicDir = process.env.SAKI_PUBLIC_DIR || path.join(__dirname, 'public')
      const animationDir = path.join(publicDir, 'assets/animate')
      const light = process.env.SAKI_BUILD_PROFILE === 'light'
      fs.cpSync(publicDir, outDir, { recursive: true, filter: source => !light || source !== animationDir })
      fs.writeFileSync(path.join(outDir, 'saki-build.json'), JSON.stringify({ animations: !light }))
    },
  }
}

export default defineConfig({
  plugins: [react(), deploymentAssets()],
  build: {
    copyPublicDir: false,
    chunkSizeWarningLimit: 600,
    ...(process.env.SAKI_BUILD_OUT_DIR ? { outDir: process.env.SAKI_BUILD_OUT_DIR } : {}),
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler')) {
              return 'vendor-react';
            }
            if (id.includes('framer-motion')) {
              return 'vendor-motion';
            }
            if (id.includes('react-markdown') || id.includes('remark-gfm') || id.includes('react-syntax-highlighter') || id.includes('prismjs')) {
              return 'vendor-markdown';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            if (id.includes('i18next') || id.includes('react-i18next')) {
              return 'vendor-i18n';
            }
            if (id.includes('react-diff-view') || id.includes('diff')) {
              return 'vendor-diff';
            }
            if (id.includes('html2canvas')) {
              return 'vendor-canvas';
            }
          }
        },
      },
    },
  },
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
