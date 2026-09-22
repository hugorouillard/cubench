import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execFileSync } from 'node:child_process'

function appVersion(): string {
  if (process.env.CUBENCH_VERSION) return process.env.CUBENCH_VERSION

  try {
    return execFileSync('git', ['describe', '--tags', '--always'], { encoding: 'utf8' }).trim()
  } catch {
    return 'development'
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __CUBENCH_VERSION__: JSON.stringify(appVersion()),
  },
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
