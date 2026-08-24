import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const sharedRoot = path.resolve(__dirname, '../../packages/cloudity-shared/src')
const uiRoot = path.resolve(__dirname, '../../packages/cloudity-ui/src')
const webShellRoot = path.resolve(__dirname, '../cloudity-web/src')

const reactPkgRoot = path.dirname(require.resolve('react/package.json'))
const reactDomPkgRoot = path.dirname(require.resolve('react-dom/package.json'))
const reactJsxDevRuntime = require.resolve('react/jsx-dev-runtime')
const reactJsxRuntime = require.resolve('react/jsx-runtime')

/** SPA Drive autonome — base /app/drive/ (FE-SPLIT-02). */
export default defineConfig({
  base: '/app/drive/',
  plugins: [react()],
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
  resolve: {
    alias: [
      { find: '@cloudity/shared', replacement: sharedRoot },
      { find: '@cloudity/ui', replacement: uiRoot },
      { find: /^@cloudity\/web-shell\/(.*)$/, replacement: `${webShellRoot}/$1` },
      { find: 'react', replacement: reactPkgRoot },
      { find: 'react-dom', replacement: reactDomPkgRoot },
      { find: 'react/jsx-dev-runtime', replacement: reactJsxDevRuntime },
      { find: 'react/jsx-runtime', replacement: reactJsxRuntime },
    ],
  },
  server: {
    host: '0.0.0.0',
    port: 3002,
    proxy: {
      '/auth': { target: 'http://api-gateway:8000', changeOrigin: true },
      '/drive': { target: 'http://api-gateway:8000', changeOrigin: true },
      '/admin/': { target: 'http://api-gateway:8000', changeOrigin: true },
      '/health': { target: 'http://api-gateway:8000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    emptyOutDir: true,
  },
})
