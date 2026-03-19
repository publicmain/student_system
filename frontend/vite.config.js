import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 开发时代理到 Express 后端（Railway 本地调试用）
  server: {
    port: 3001,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  // 生产构建输出到 Express 的 public 目录（可选方案）
  build: {
    outDir: '../public/react',
    emptyOutDir: true,
  },
})
