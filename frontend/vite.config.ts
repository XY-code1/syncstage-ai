import { fileURLToPath, URL } from 'node:url'
import { rmSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [
    react(),
    tailwindcss(),
    // Vite copies public/ verbatim. Local review audio must stay on the developer
    // machine, so remove it only from production output; dev server still supports it.
    {
      name: 'exclude-local-demo-audio-from-build',
      apply: 'build',
      closeBundle() {
        rmSync(fileURLToPath(new URL('./dist/demo-audio-local', import.meta.url)), { recursive: true, force: true })
      },
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // 粒子舞台是懒加载 chunk：提前预打包 three / R3F，避免首次进入执行页时
  // Vite 现场重新优化依赖并整页 reload（会打断正在运行的 Agent 演示）。
  optimizeDeps: {
    include: ['three', '@react-three/fiber', '@react-three/drei'],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
})
