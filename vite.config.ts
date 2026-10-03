import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {},
    allowedHosts: ['e4d4-75-87-150-241.ngrok-free.app']
  }
})
