// tools/pwa/generate-icons.mjs
// 生成 PWA / Chrome 应用图标（PNG）。无第三方依赖：手写 PNG 编码 + 4x 超采样抗锯齿。
// 用法：node tools/pwa/generate-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../../public/icons/', import.meta.url));
const BG = [0x5b, 0xe0, 0xb3];
const FG = [0x10, 0x13, 0x15];

// 图标几何（0..1 归一化坐标）：五根圆头条形，中间最高，和站点 mark 一致。
const BARS = [
  { x: 0.250, half: 0.085 },
  { x: 0.375, half: 0.195 },
  { x: 0.500, half: 0.305 },
  { x: 0.625, half: 0.195 },
  { x: 0.750, half: 0.085 },
];
const BAR_HALF_WIDTH = 0.040;

function inRoundRect(px, py, x0, y0, x1, y1, r) {
  if (px < x0 || px > x1 || py < y0 || py > y1) return false;
  const cx = Math.min(Math.max(px, x0 + r), x1 - r);
  const cy = Math.min(Math.max(py, y0 + r), y1 - r);
  const dx = px - cx, dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

/** 返回某点的颜色分量（含 alpha 0/1）；maskable 图标铺满画布并内缩图形。 */
function sample(u, v, maskable) {
  if (maskable) {
    const s = 0.62; // 安全区：图形缩到中间 62%
    const uu = (u - 0.5) / s + 0.5, vv = (v - 0.5) / s + 0.5;
    return barOrBg(uu, vv, true);
  }
  if (!inRoundRect(u, v, 0, 0, 1, 1, 0.22)) return [0, 0, 0, 0];
  return barOrBg(u, v, false);
}

function barOrBg(u, v, fill) {
  if (fill || inRoundRect(u, v, 0, 0, 1, 1, 0.22)) {
    for (const bar of BARS) {
      if (inRoundRect(u, v, bar.x - BAR_HALF_WIDTH, 0.5 - bar.half, bar.x + BAR_HALF_WIDTH, 0.5 + bar.half, BAR_HALF_WIDTH)) {
        return [...FG, 255];
      }
    }
    return [...BG, 255];
  }
  return null;
}

function render(size, maskable) {
  const SS = 4, rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size;
          const v = (y + (sy + 0.5) / SS) / size;
          const c = sample(u, v, maskable) || [0, 0, 0, 0];
          const alpha = c[3] / 255;
          r += c[0] * alpha; g += c[1] * alpha; b += c[2] * alpha; a += alpha;
        }
      }
      const n = SS * SS, i = (y * size + x) * 4;
      const alpha = a / n;
      rgba[i] = alpha ? Math.round(r / a) : 0;
      rgba[i + 1] = alpha ? Math.round(g / a) : 0;
      rgba[i + 2] = alpha ? Math.round(b / a) : 0;
      rgba[i + 3] = Math.round(alpha * 255);
    }
  }
  return rgba;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function encodePNG(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const targets = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, false],
];

mkdirSync(OUT, { recursive: true });
for (const [name, size, maskable] of targets) {
  const png = encodePNG(size, render(size, maskable));
  writeFileSync(OUT + name, png);
  console.log(name, size + 'x' + size, png.length + 'B');
}
