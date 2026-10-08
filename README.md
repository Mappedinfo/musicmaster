# MusicMaster · 歌声练功房

纯前端的唱歌基本功训练工具：打开网页、允许麦克风，就能实时看到自己的音准、音高曲线、频谱与共鸣指标，并跟着结构化练习打分。**无需注册、无服务器，所有音频都在浏览器本地分析，关闭页面即消失。**

## 功能

- **音准仪**：YIN 基频检测（±1 音分精度），音分表盘（±10 优 / ±25 合格 / ±50 唱错音）、实时音高曲线、唱名（do re mi…）提示。
- **跟唱练习**：5 种练习（单音模唱、音阶上/下行、长音稳定、五度跳进）× 7 个调，自动播示范音 → 你唱 → 逐音打分（60% 音准 + 40% 稳定），历史记录存 localStorage。
- **共鸣与频谱**：实时频谱、频谱质心、H1−H2（胸声/头声倾向启发式）、谐波占比、歌手共振峰（2.5–3.5 kHz）能量占比。
- **K歌跟唱**：上传本地音频（BGM 或原唱），浏览器在 Web Worker 里离线提取参考旋律线，跟着唱时实时对比每个音，唱完给逐句得分和针对性指导；支持 .lrc 歌词逐句评分、片段跳转重唱。**音频只在内存里，不上传、不落盘。**
- **音名八度基准**：可切换 C4=中央C（GarageBand / Logic / 科学音高记号）或 C3=中央C（Cubase / MuseScore / 部分硬件）。内部一律用 MIDI 编号计算，切换只影响显示。
- **音域测试**：滑音探测最低/最高音（2%/98% 分位抗噪）。
- **入门课程**：腹式呼吸、音准与音分、胸声/头声/混声（M1/M2/换声点）、共鸣科学、量化指标速查 + 四周入门计划。

## 界面

| 音准仪（音名八度可校准） | K歌跟唱 |
| --- | --- |
| ![音准仪](docs/screenshots/octave-base.png) | ![K歌跟唱](docs/screenshots/karaoke.png) |

## 技术要点

- 零依赖、零构建：原生 ES Modules + Canvas，直接静态部署。
- 音频管线：getUserMedia（关闭回声消除/降噪/自动增益）→ AudioWorklet 采集 → 主线程 YIN 音高检测（CMNDF + 抛物线插值，帧 2048 / 跳跃 512）+ AnalyserNode 频谱特征。
- K歌离线旋律提取：decodeAudioData → OfflineAudioContext 重采样到 16kHz 单声道 → Web Worker 逐帧 YIN（帧 2048 / 跳跃 480，60–1100 Hz）→ 中值滤波去八度毛刺。
- K歌实时打分：只在参考线有音高的帧上比，±0.35s 窗口内取最近参考音，±50 音分算唱准；覆盖率、平均偏差、整体倾向、波动四项统计 + 4 秒分段，据此生成"偏低/偏高/波动/音域不合"等针对性建议。
- 部署：GitHub Actions 静态 Pages 工作流（见 .github/workflows/pages.yml）。

## 本地运行

```bash
python3 -m http.server 8901   # 任意静态服务器
# 打开 http://localhost:8901
```

麦克风权限要求 HTTPS 或 localhost。

## 部署到 GitHub Pages

推送到 GitHub 后：仓库 Settings → Pages → Source 选 **GitHub Actions**，推送 main 分支即自动发布。

## 测试

```bash
node test/dsp.test.mjs          # DSP 单元测试（合成信号验证 YIN 精度等，19 项）
node test/karaoke.test.mjs      # K歌单元测试（LRC 解析、打分、指导文本，74 项）
python3 test/smoke.py           # Playwright 冒烟测试（需 pip install playwright + chromium）
python3 test/karaoke_smoke.py   # K歌端到端测试（上传 WAV → 提取旋律 → 打分 → 报告）
```

K歌端到端测试会生成一个 A4 正弦 WAV，验证提取出的参考音高落在 MIDI 69 附近，并检查唱准时的评分与报告渲染。

冒烟测试用 `?testtone=220` 参数让页面以振荡器代替麦克风，可在无麦克风环境（CI/headless）验证完整分析管线。

## 免责

所有指标是声学代理量，用于"自己和自己比较"的进步跟踪，不能替代声乐老师，也不构成嗓音医学诊断。
