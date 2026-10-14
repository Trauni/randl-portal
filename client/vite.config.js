import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

// Versionsanzeige (#334): Version nur aus der package.json im Hauptordner,
// Commit aus git -- fehlt git zur Build-Zeit, steht dort "dev".
const appVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
let appCommit = 'dev'
try {
  appCommit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev'
} catch {}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_COMMIT__: JSON.stringify(appCommit),
  },
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
