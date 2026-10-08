// test/i18n_check.mjs —— i18n 键完整性检查
// 目标：HTML/JS 引用的每个键都必须在字典里存在；缺键会让界面直接显示键名（已修过一次这类 bug）。
import { readFileSync } from 'node:fs';

const base = new URL('../', import.meta.url).pathname;
const i18nSrc = readFileSync(base + 'js/i18n.js', 'utf8');

// 字典键（同时支持单/双引号写法）
const keys = new Set(
  [...i18nSrc.matchAll(/^\s*['"]([a-zA-Z0-9_.]+)['"]:\s*\{\s*zh:/gm)].map((m) => m[1]),
);

// 由代码动态拼接出来的键（如 buildTips 返回的 { key: 'tip.' + kind }）
const DYNAMIC_PREFIXES = ['tip.', 'practice.', 'k.hint'];

const used = new Map();
const add = (k, where) => {
  if (!used.has(k)) used.set(k, []);
  used.get(k).push(where);
};

const html = readFileSync(base + 'index.html', 'utf8');
for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) add(m[1], 'index.html:data-i18n');
for (const m of html.matchAll(/data-i18n-html="([^"]+)"/g)) add(m[1], 'index.html:data-i18n-html');
for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) {
  for (const pair of m[1].split(',')) {
    const idx = pair.indexOf(':');
    if (idx > 0) add(pair.slice(idx + 1).trim(), 'index.html:data-i18n-attr');
  }
}

for (const f of ['js/app.js', 'js/karaoke.js', 'js/exercises.js', 'js/lessons.js', 'js/engine.js']) {
  const src = readFileSync(base + f, 'utf8');
  for (const m of src.matchAll(/\bt\(\s*['"]([a-zA-Z0-9_.]+)['"]/g)) add(m[1], f + ':t()');
  for (const m of src.matchAll(/canvasText\(\s*['"]([a-zA-Z0-9_.]+)['"]/g)) add(m[1], f + ':canvasText()');
}

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log('PASS', name, detail || ''); }
  else { fail++; console.log('FAIL', name, detail || ''); }
};

const missing = [...used.keys()].filter((k) => !keys.has(k)).sort();
check('引用的键都在字典中', missing.length === 0,
  missing.length ? missing.map((k) => k + ' <- ' + [...new Set(used.get(k))].join('/')).join('; ') : ('共 ' + used.size + ' 个引用'));

// 未使用的键：动态前缀之外的真实浪费
const unused = [...keys]
  .filter((k) => !used.has(k))
  .filter((k) => !DYNAMIC_PREFIXES.some((p) => k.startsWith(p)))
  .sort();
check('没有孤立的字典键', unused.length === 0, unused.join(', '));

check('字典规模合理', keys.size >= 150, String(keys.size));

// 双语完整性：每个键都要有 zh 和 en
const bothLangs = [...i18nSrc.matchAll(/^\s*['"]([a-zA-Z0-9_.]+)['"]:\s*\{\s*zh:\s*['"][\s\S]*?en:/gm)].map((m) => m[1]);
check('每个键都有 zh + en', bothLangs.length === keys.size,
  bothLangs.length + '/' + keys.size);


// ---------- 局部变量遮蔽 t() 的检查 ----------
// 教训：drawKaraoke 里有 const t = k.time（时间），在里面调 t('key') 会抛 "t is not a function"
const shadowProblems = [];
const declaredT = ['const t =', 'let t =', 'var t ='];
for (const f of ['js/app.js', 'js/karaoke.js']) {
  const lines = readFileSync(base + f, 'utf8').split('\n');
  let fnStart = -1, fnName = '', depth = 0;
  const ranges = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(?:async )?function ([A-Za-z0-9_]+)\s*\(/);
    if (m) { if (fnStart >= 0 && depth > 0) ranges.push([fnStart, i - 1, fnName]); fnStart = i; fnName = m[1]; depth = 0; }
    for (const ch of lines[i]) { if (ch === '{') depth++; else if (ch === '}') depth--; }
  }
  if (fnStart >= 0) ranges.push([fnStart, lines.length - 1, fnName]);
  for (const decl of declaredT) {
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].includes(decl)) continue;
      const r = ranges.find(([s, e]) => i >= s && i <= e);
      if (!r) continue;
      for (let j = r[0]; j <= r[1]; j++) {
        if (/[^A-Za-z0-9_.]t\(/.test(lines[j])) {
          shadowProblems.push(f + ':' + (j + 1) + ' (' + r[2] + ' 内局部 ' + decl.trim() + ')');
        }
      }
    }
  }
}
check('没有在局部 t 作用域内调用 t()', shadowProblems.length === 0, shadowProblems.join('; '));

console.log('---');
console.log('I18N-CHECK ' + (fail === 0 ? 'OK' : 'FAILED') + ' (' + pass + ' pass, ' + fail + ' fail)');
process.exit(fail === 0 ? 0 : 1);
