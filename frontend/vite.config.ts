import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

// 인프라 고정값(절대 변경 금지):
//   FE 포트 = 9518
//   BE 포트 = 9538
//   공개 도메인 = p18.sumzip.com
//
// dev 서버 → /api/v1/* 호출은 백엔드(9538)로 프록시. 운영에서는 Nginx가 동일 처리.

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 9518,
    strictPort: true,
    allowedHosts: ['p18.sumzip.com', '.sumzip.com', 'localhost'],
    proxy: {
      '/api': {
        target: 'http://localhost:9538',
        changeOrigin: false,
        // 팀 채팅 socket.io(/api/socket.io) WebSocket 업그레이드 프록시
        ws: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 9518,
    strictPort: true,
    allowedHosts: ['p18.sumzip.com', '.sumzip.com', 'localhost'],
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
  },
});
