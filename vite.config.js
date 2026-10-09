import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const root = fileURLToPath(new URL('.', import.meta.url));

/** 遍历构建产物，返回相对 POSIX 路径。 */
function distFiles(dir, base = dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...distFiles(full, base));
    else found.push(relative(base, full).split(sep).join('/'));
  }
  return found;
}

/**
 * 把 tools/pwa/sw.template.js 生成为 dist/sw.js，注入内容哈希版本和预缓存清单。
 * 版本变化会让旧缓存整体失效，避免离线用户拿到上一次部署的资源。
 */
function serviceWorker() {
  return {
    name: 'musicmaster-service-worker',
    apply: 'build',
    closeBundle() {
      const dist = join(root, 'dist');
      const files = distFiles(dist).filter((file) => file !== 'sw.js').sort();
      const hash = createHash('sha256');
      for (const file of files) hash.update(file).update(readFileSync(join(dist, file)));
      const template = readFileSync(join(root, 'tools/pwa/sw.template.js'), 'utf8');
      writeFileSync(join(dist, 'sw.js'), template
        .replace('__MM_VERSION__', hash.digest('hex').slice(0, 12))
        .replace('__MM_PRECACHE__', JSON.stringify(files)));
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  // 相对资源地址兼容 GitHub Pages 的 /musicmaster/ 和本地预览。
  base: './',
  build: { assetsInlineLimit: 0 },
});
