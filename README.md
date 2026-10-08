# MusicMaster · 歌声练功房

纯前端的唱歌基本功训练工具：打开网页、允许麦克风，就能实时看到自己的音准、音高曲线、频谱与共鸣指标，并跟着结构化练习打分。**无需注册、无服务器，所有音频都在浏览器本地分析，关闭页面即消失。**

## 功能

- **音准仪**：YIN 基频检测（±1 音分精度），音分表盘（±10 优 / ±25 合格 / ±50 唱错音）、实时音高曲线、唱名（do re mi…）提示。
- **跟唱练习**：5 种练习（单音模唱、音阶上/下行、长音稳定、五度跳进）× 7 个调，自动播示范音 → 你唱 → 逐音打分（60% 音准 + 40% 稳定），历史记录存 localStorage。
- **共鸣与频谱**：实时频谱、频谱质心、H1−H2（胸声/头声倾向启发式）、谐波占比、歌手共振峰（2.5–3.5 kHz）能量占比。
- **音域测试**：滑音探测最低/最高音（2%/98% 分位抗噪）。
- **入门课程**：腹式呼吸、音准与音分、胸声/头声/混声（M1/M2/换声点）、共鸣科学、量化指标速查 + 四周入门计划。

## 技术要点

- 零依赖、零构建：原生 ES Modules + Canvas，直接静态部署。
- 音频管线：getUserMedia（关闭回声消除/降噪/自动增益）→ AudioWorklet 采集 → 主线程 YIN 音高检测（CMNDF + 抛物线插值，帧 2048 / 跳跃 512）+ AnalyserNode 频谱特征。
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
python3 test/smoke.py           # Playwright 冒烟测试（需 pip install playwright + chromium）
```

冒烟测试用 `?testtone=220` 参数让页面以振荡器代替麦克风，可在无麦克风环境（CI/headless）验证完整分析管线。

## 免责

所有指标是声学代理量，用于"自己和自己比较"的进步跟踪，不能替代声乐老师，也不构成嗓音医学诊断。
