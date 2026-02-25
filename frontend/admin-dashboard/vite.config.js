import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    watch: {
      usePolling: true,
    },
    proxy: {
      '/auth': { target: 'http://api-gateway:8000', changeOrigin: true },
      '/admin': { target: 'http://api-gateway:8000', changeOrigin: true },
      '/pass': { target: 'http://api-gateway:8000', changeOrigin: true },
      '/mail': { target: 'http://api-gateway:8000', changeOrigin: true },
      '/health': { target: 'http://api-gateway:8000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})