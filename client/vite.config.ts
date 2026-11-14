import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  // Domínio fixo do túnel (ex.: app.seudominio.com.br) em client/.env: VITE_ALLOWED_HOSTS=app.seudominio.com.br
  const extra = (loadEnv(mode, process.cwd(), '').VITE_ALLOWED_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean)
  return {
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.dev', '.ngrok-free.app', '.ts.net', ...extra],
    proxy: {
      '/api': 'http://localhost:3333',
      '/uploads': 'http://localhost:3333',
      '/socket.io': {
        target: 'http://localhost:3333',
        ws: true,
      },
    },
  },
  }
})
