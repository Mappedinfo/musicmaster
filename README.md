# MusicMaster · 歌声练功房

纯前端的唱歌基本功训练工具：打开网页、允许麦克风，就能实时看到自己的音准、音高曲线、频谱与共鸣指标，并跟着结构化练习打分。**无需注册、无服务器，所有音频都在浏览器本地分析，关闭页面即消失。**

[打开歌声练功房](https://mappedinfo.github.io/musicmaster/)

## 当前状态与接续

继续开发前，先阅读本节及下方的运行、测试和部署说明。本节是项目当前状态入口。

- 当前界面采用 React + Vite，按工作台、共享控件和功能面板拆分组件；音频分析内核保留在 `js/`。
- 语言切换固定在页头右上角，是全局控件，不随子页面重复出现；音名基准与麦克风在其下方的设置条里。K歌上传歌曲、伴奏、歌词与播放设置位于曲线前。长说明可展开阅读。
- 页面切换保留训练状态；停止录音释放声音采集，已导入歌曲留在当前页面内存中，重新启用麦克风后可继续练习。
- 成品可安装为本地应用（Chrome / Edge 应用窗口，iOS 添加到主屏幕），安装后断网也能打开。
- 发布流程先运行单元检查与构建，再把 `dist/` 部署到 GitHub Pages。本地音源分离工具、测试和音频素材不进入网站成品。
- 本轮验证记录更新于 2026-10-09；浏览器回归入口为 `test/ui_smoke.py`，覆盖双语、多视口、键盘操作、麦克风拒绝后的恢复、音名基准、K歌上传与报告、页头语言位置与安装入口，以及构建成品断网启动。截图见下方。

## 功能

- **音准仪**：YIN 基频检测（±1 音分精度），音分表盘（±10 优 / ±25 合格 / ±50 唱错音）、实时音高曲线、唱名（do re mi…）提示。
- **跟唱练习**：5 种练习（单音模唱、音阶上/下行、长音稳定、五度跳进）× 7 个调，自动播示范音 → 你唱 → 逐音打分（60% 音准 + 40% 稳定），历史记录存 localStorage。
- **共鸣与频谱**：实时频谱、频谱质心、H1−H2（胸声/头声倾向启发式）、谐波占比、歌手共振峰（2.5–3.5 kHz）能量占比。
- **K歌跟唱**：上传本地音频（BGM 或原唱），浏览器在 Web Worker 里离线提取参考旋律线，跟着唱时实时对比每个音，唱完给逐句得分和针对性指导；支持 .lrc 歌词逐句评分、片段跳转重唱。**音频只在内存里，不上传、不落盘。**
- **音名八度基准**：可切换 C4=中央C（GarageBand / Logic / 科学音高记号）或 C3=中央C（Cubase / MuseScore / 部分硬件）。内部一律用 MIDI 编号计算，切换只影响显示。
- **音域测试**：滑音探测最低/最高音（2%/98% 分位抗噪）。
- **入门课程**：腹式呼吸、音准与音分、胸声/头声/混声（M1/M2/换声点）、共鸣科学、量化指标速查 + 四周入门计划。
- **中英双语**：界面、练习、K歌报告与课程正文全部支持中文 / English，在页头右上角切换并记忆选择；默认跟随浏览器语言。
- **可安装为本地应用**：带 Web App Manifest 与 Service Worker，Chrome / Edge 可"安装到本机"（独立窗口打开，断网可用），iOS Safari 可"添加到主屏幕"；浏览器允许安装时，页头会给出安装入口。
- **移动端适配**：手机 / iPad / 横屏布局、触摸目标 ≥32px、画布自适应、刘海屏安全区；手机默认开启 K歌外放回声消除。

## 界面

| 音准仪（音名八度可校准） | K歌跟唱 |
| --- | --- |
| ![音准仪](docs/screenshots/octave-base.png) | ![K歌跟唱](docs/screenshots/karaoke.png) |

| 手机（音准仪） | 手机（K歌跟唱） |
| --- | --- |
| ![手机音准仪](docs/screenshots/mobile-tuner.png) | ![手机K歌](docs/screenshots/mobile-karaoke.png) |

英文界面（入口课程）：

![English UI](docs/screenshots/en-lessons.png)

## 技术要点

- React 组件负责界面与导航，Canvas 和独立音频模块负责实时显示、训练与分析。Vite 构建生成静态成品，依赖版本锁定在 `package-lock.json`。
- 音频管线：getUserMedia → AudioWorklet 采集 → 主线程 YIN 音高检测（CMNDF + 抛物线插值，帧 2048 / 跳跃 512）+ AnalyserNode 频谱特征。外放模式控制回声消除与降噪，自动增益关闭。
- K歌离线旋律提取：decodeAudioData → OfflineAudioContext 重采样到 16kHz 单声道 → Web Worker 逐帧 YIN（帧 2048 / 跳跃 480，60–1100 Hz）→ 中值滤波去八度毛刺。
- K歌实时打分：只在参考线有音高的帧上比，±0.35s 窗口内取最近参考音，±50 音分算唱准；覆盖率、平均偏差、整体倾向、波动四项统计 + 4 秒分段，据此生成"偏低/偏高/波动/音域不合"等针对性建议。
- 安装为本地应用：`public/manifest.webmanifest` 声明独立窗口与 192/512/maskable 图标；构建插件把 `tools/pwa/sw.template.js` 生成为 `dist/sw.js`，注入内容哈希版本和预缓存清单（导航请求网络优先、其余同源请求缓存优先），版本变化即整体失效旧缓存。图标由 `node tools/pwa/generate-icons.mjs` 生成，不引入图形依赖。开发模式不注册 Service Worker，避免缓存干扰热更新。
- 部署：GitHub Actions 静态 Pages 工作流（见 .github/workflows/pages.yml）。

## 本地运行

需要 Node.js 22.12+（推荐 24）。

```bash
npm ci
npm run dev
# 打开 http://localhost:8901
```

检查发布成品：

```bash
npm run build
npm run preview
```

麦克风权限要求 HTTPS 或 localhost。安装为本地应用与离线启动只在 `npm run build` 的产物里生效（`dist/sw.js` 由构建生成），验证安装和离线行为请用 `npm run preview`，不要用开发服务器。

## 部署到 GitHub Pages

仓库 Settings → Pages → Source 选择 **GitHub Actions**。推送 `main` 后，工作流执行 `npm ci`、`npm test` 和 `npm run build`，仅上传 `dist/`。构建资源使用相对地址，支持 `/musicmaster/` 项目子路径；Worker 和 AudioWorklet 也由构建管理。

## 测试

```bash
npm test                      # DSP 19项、K歌74项、双语键完整性5项
uv run --with playwright playwright install chromium
npm run build && npm run preview
npm run test:ui                # 对 preview 运行可一并验证安装与离线启动，并更新截图
uv run --with playwright python test/smoke.py
uv run --with playwright python test/karaoke_smoke.py
```

`test/ui_smoke.py` 支持 `BASE_URL` 指向部署站点或带子路径的成品；`SCREENSHOT_DIR` 可指定截图输出位置，`PLAYWRIGHT_CHROMIUM_EXECUTABLE` 可指定浏览器。对开发服务器运行时，需要 Service Worker 的离线用例会自动跳过并给出提示。旧的专项回归脚本仍保留在 `test/`。

K歌端到端测试会生成一个 A4 正弦 WAV，验证提取出的参考音高落在 MIDI 69 附近，并检查唱准时的评分与报告渲染。

冒烟测试用 `?testtone=220` 参数让页面以振荡器代替麦克风，可在无麦克风环境（CI/headless）验证完整分析管线。

## 本地工具

`tools/stem-separation/` 是一个**本地**命令行音源分离工具（基于 Demucs），用于准备 K 歌练习素材：把混音拆成人声与伴奏。它不属于网页应用，网页不引用它，也不需要运行它。

用法见 [tools/stem-separation/README.md](tools/stem-separation/README.md)。

## 免责

所有指标是声学代理量，用于"自己和自己比较"的进步跟踪，不能替代声乐老师，也不构成嗓音医学诊断。
