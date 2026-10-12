import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Ort und Aufbau folgen apps/web der Core-Vorlage: index.html + vite.config.ts + src/
// (siehe docs/reference/web-frontend.md). Port 5175 ist bewusst frei gewählt, damit die
// Referenz-Vorlage der WebUI auf 5174 unangetastet weiterlaufen kann; dort gilt 5173 als
// belegt (siehe docs/reference/webui-dev.md).
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5175,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 5175,
    strictPort: true,
  },
})
