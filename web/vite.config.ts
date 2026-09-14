import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Vite's preload helper accesses `document` inside cubing.js's worker.
    modulePreload: false,
  },
  optimizeDeps: {
    exclude: ['cubing', 'cubing/scramble'],
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
