import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

/** Évite le 404 navigateur sur /favicon.ico (réponse identique à nginx en production). */
function faviconIcoRedirect() {
  return {
    name: 'favicon-ico-redirect',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const u = req.url || ''
        if (u === '/favicon.ico' || u.startsWith('/favicon.ico?')) {
          res.statusCode = 302
          res.setHeader('Location', '/favicon.svg')
          res.end()
          return
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), faviconIcoRedirect()],
  test: {
    globals: true,
    environment: 'jsdom',
    exclude: ['e2e/**', '**/node_modules/**'],
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
    sourcemap: true
  }
})