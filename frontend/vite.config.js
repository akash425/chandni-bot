import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Allow ngrok host
    allowedHosts: ['grubworm-on-tetra.ngrok-free.app'],
  },
})
