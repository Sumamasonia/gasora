import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The browser talks to /api, and Vite forwards it to the FastAPI server (no CORS setup needed).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
