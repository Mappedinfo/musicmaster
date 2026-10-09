import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 相对资源地址兼容 GitHub Pages 的 /musicmaster/ 和本地预览。
  base: './',
  build: { assetsInlineLimit: 0 },
});
