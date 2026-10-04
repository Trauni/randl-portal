import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Build output landet im portal/dist/ — Express serviert von dort
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  // Dev-Server: API-Calls an lokalen Express weiterleiten
  server: {
    proxy: {
      '/api': 'http://localhost:3337',
      '/auth': 'http://localhost:3337',
    }
  }
})
