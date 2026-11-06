import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // The backend owns PORT. Reading its local .env keeps the development proxy
  // aligned without exposing any backend values to the browser bundle.
  const backendEnv = loadEnv(mode, '../backend', '')
  const apiPort = backendEnv.PORT || '3001'

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': `http://127.0.0.1:${apiPort}`,
      },
    },
  }
})
