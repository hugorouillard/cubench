import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['cubing', 'cubing/scramble'],
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
