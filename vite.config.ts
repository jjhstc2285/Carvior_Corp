import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 개발 중에는 Vite dev 서버가 /api 와 /uploads 를 로컬 NestJS로 넘긴다.
    // 운영에서는 Apache가 같은 일을 하므로 프론트 코드는 양쪽에서 동일하게 '/api'만 부르면 된다.
    proxy: {
      '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true },
      '/uploads': { target: 'http://127.0.0.1:3000', changeOrigin: true },
    },
  },
})
