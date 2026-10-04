import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Eigenes, schlankes Bundle fuer /mobile -- getrennt vom Desktop-Bundle in client/.
// Wird vom bestehenden Express-Server (server.js) unter dem Pfad /mobile ausgeliefert,
// im selben Origin wie randlweb.de -> Session-Cookie aus dem Desktop-Login gilt hier direkt mit.
//
// PWA-Plugin (vite-plugin-pwa) bewusst wieder entfernt: workbox-build scheiterte auf dem
// Server an "Dynamic require of workbox-build is not supported" (Node 18 / ESM-Bundling).
// Installierbarkeit/Service-Worker ist ohnehin erst Phase 4 -- manifest.webmanifest liegt
// stattdessen als statische Datei in public/ und wird unveraendert mitkopiert.
export default defineConfig({
  base: '/mobile/',
  plugins: [react()],
  build: {
    // Eigener Output-Ordner, damit ein "npm run build" hier niemals das
    // bestehende client/dist ueberschreiben kann. Liegt NEBEN client-mobile/,
    // nicht darin -- server.js muss auf path.join(__dirname, 'dist-mobile') zeigen.
    outDir: '../dist-mobile',
    emptyOutDir: true
  }
})
