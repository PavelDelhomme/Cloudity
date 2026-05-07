import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const sharedRoot = path.resolve(__dirname, '../../packages/cloudity-shared/src')

/** Résolution explicite : le code source du workspace `@cloudity/shared` utilise le React hoisted de l’app (Vitest/Vite). */
const reactPkgRoot = path.dirname(require.resolve('react/package.json'))
const reactDomPkgRoot = path.dirname(require.resolve('react-dom/package.json'))
const reactJsxDevRuntime = require.resolve('react/jsx-dev-runtime')
const reactJsxRuntime = require.resolve('react/jsx-runtime')

/**
 * Réécritures HTML **avant** le middleware Vite (sinon `/4dm1n` tombe en 404).
 * - `/4dm1n` → `admin.html` (bundle admin)
 * - `/app…` → `/` (SPA utilisateur, index.html)
 */
function cloudityEarlyHtmlRoutes() {
  return {
    name: 'cloudity-early-html-routes',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const u = req.url || ''
        if (u === '/favicon.ico' || u.startsWith('/favicon.ico?')) {
          res.statusCode = 302
          res.setHeader('Location', '/favicon.svg')
          res.end()
          return
        }
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          next()
          return
        }
        const pathOnly = u.split('?')[0]
        if (pathOnly === '/4dm1n' || pathOnly.startsWith('/4dm1n/')) {
          const q = u.includes('?') ? u.slice(u.indexOf('?')) : ''
          req.url = '/admin.html' + q
        } else if (u === '/app' || u === '/app/' || u.startsWith('/app?') || u.startsWith('/app/')) {
          req.url = '/'
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [cloudityEarlyHtmlRoutes(), react()],
  resolve: {
    alias: {
      '@cloudity/shared': sharedRoot,
      react: reactPkgRoot,
      'react-dom': reactDomPkgRoot,
      'react/jsx-dev-runtime': reactJsxDevRuntime,
      'react/jsx-runtime': reactJsxRuntime,
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    exclude: ['e2e/**', '**/node_modules/**'],
    testTimeout: 15_000,
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    watch: {
      usePolling: true,
    },
    proxy: {
      '/auth': { target: 'http://api-gateway:8000', changeOrigin: true },
      '/admin/': { target: 'http://api-gateway:8000', changeOrigin: true },
      '/pass': { target: 'http://api-gateway:8000', changeOrigin: true },
      '/mail': { target: 'http://api-gateway:8000', changeOrigin: true },
      '/calendar': { target: 'http://api-gateway:8000', changeOrigin: true },
      '/notes': { target: 'http://api-gateway:8000', changeOrigin: true },
      '/tasks': { target: 'http://api-gateway:8000', changeOrigin: true },
      '/photos': { target: 'http://api-gateway:8000', changeOrigin: true },
      '/drive': { target: 'http://api-gateway:8000', changeOrigin: true },
      '/contacts': { target: 'http://api-gateway:8000', changeOrigin: true },
      '/health': { target: 'http://api-gateway:8000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        admin: path.resolve(__dirname, 'admin.html'),
      },
    },
  },
})
