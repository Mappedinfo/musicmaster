# 本地录音分析与离线报告

输入录音留在本机，默认先分离人声，再复用网页的 `js/recording-analysis.js` 计算。输出为中文 `report.html`、可导入网页的 `analysis.json` 和可回听的人声 WAV。所有依赖、模型、日志和个人结果都在已被 Git 忽略的 `stems/`，不进入 GitHub Pages 构建。

## 一条命令

```bash
node tools/vocal-analysis/analyze.mjs /path/to/my-take.m4a

# 已有无伴奏干声，免分离与模型准备。
node tools/vocal-analysis/analyze.mjs /path/to/dry-vocal.wav --input-kind vocal

# 依赖与模型已准备时，明确不再联网。
node tools/vocal-analysis/analyze.mjs /path/to/my-take.m4a --offline \
  --out stems/private/my-run

# 使用独立的参考录音；默认也分离参考人声。
node tools/vocal-analysis/analyze.mjs /path/to/my-take.m4a \
  --reference /path/to/reference.m4a --out stems/private/with-reference

# 内核更新后复用原始分离 run：核对原件和分离人声身份，不重复模型推理。
node tools/vocal-analysis/analyze.mjs /path/to/my-take.m4a --offline \
  --reference /path/to/reference.m4a --reuse-separated stems/private/with-reference \
  --out stems/private/recomputed
```

前置要求：Node.js、`ffmpeg`、`uv`。混音流程第一次会用 uv 在 `stems/.model-cache/venv` 创建 Python 3.11 环境、安装固定依赖，并单独准备模型。依赖校验成功后，分离子进程始终使用显式 HF 离线模式，不把录音传给任何服务。已有干声不需要 Python 或 Demucs。

双击 `report.html` 即可离线回听、点击曲线跳转、按乐句或候选问题区间回听。HTML 数据与绘图代码均内嵌，没有 CDN 或外部请求。`analysis.json` 不含原录音，却含个人声音分析，仍应作为私人文件保管。

## 观察、假设与音准分

报告分为可测到的观察与需要验证的声乐假设。音高漂移、持续音波动、尾部响度衰减来自录音测量；气息支持、偏紧发声和漏气发声只是候选解释，列出重复证据、元音/音量/混响/分离残留等替代解释，以及短干声验证练习。分离人声的假设可信度最高为低。录音频谱不能直接确定声带闭合或诊断喉部状态。

没有独立参考就不计算音准分。参考与演唱相同、来源未核实、有效音高覆盖不足或对齐未验证时也不评分。`metadata.audioIdentity` 记录实际回听人声文件的 SHA-256、大小与名称；网页补选此人声文件时可核对身份。原混音身份仅留在私有 `provenance.json`。

两份混音都有分离伴奏且未显式设置 offset 时，自动使用多窗口 RMS 包络估计固定时间偏移候选，再用去直流、归一化波形核验独立内容，保存 `alignment-evidence.json`。至少 3 个锚点覆盖 30 秒以上，每个内容匹配相关性至少 0.65、至少两处达到 0.85，内容偏移残差不超过 3ms，并通过包络相关性与唯一候选检查，才支持自动对齐。规则允许一处较强噪声，但替换错误内容窗口、错编曲、变速、静音或证据不足会拒绝可信状态；不会按整曲长度拉伸。录制染色或分离残留可能使真实对应也未通过自动门限，此时保持未评分，通过公共乐句人工核验。自动匹配仍是信号证据，应回听锚点与曲线检查版本是否相同。

需要人工确认偏移时，可提供以下文件；时间定义统一为 `referenceSec = performanceSec + offsetSec`：

```json
{
  "method": "public-phrase",
  "verified": true,
  "notes": "回听核验三个公共乐句起点；没有变速或整曲长度拉伸",
  "anchors": [
    {"performanceSec": 10, "referenceSec": 14},
    {"performanceSec": 50, "referenceSec": 54},
    {"performanceSec": 90, "referenceSec": 94}
  ]
}
```

```bash
node tools/vocal-analysis/analyze.mjs /path/to/my-take.wav --input-kind vocal \
  --reference /path/to/reference-vocal.wav --reference-kind vocal \
  --offset 4 --alignment-evidence /path/to/verified-anchors.json --transpose 0
```

锚点必须独立，固定偏移残差不超过 250ms，跨度至少 30 秒。单独给 `--offset` 只规定比较位置，不等于证明对齐可信。移调 `--transpose` 是加到参考 MIDI 的半音数，范围 -24 到 24，不改变录音频率。

最多分析 20 分钟音频；固定偏移范围 -1200 到 1200 秒。`--reuse-separated` 指向实际保存 `performance/separated` 与可选 `reference/separated` 的原始 run；演唱/参考原件和分离人声身份不匹配时拒绝复用。复算报告用相对链接回听原 run 的人声，保留两个私有目录的相对位置即可。

## 输出与边界

`--out` 只允许位于仓库 `stems/private/` 内，已有报告不覆盖；每次选择新 run-id。默认目录带时间戳和输入 hash 前缀。输出包括：

- `analysis.json`、`report.html` 与实际回听的人声文件。
- 原混音存在时，其分离人声和伴奏；不会复制原件到跟踪路径。
- `provenance.json`、依赖/模型准备/分离/解码日志；这些文件可能含本地路径，应留在私有目录。
- 有参考时的 `reference-analysis.json`，以及对齐证据。

工具不自动下载歌曲。参考应由用户提供或通过普通公开渠道取得，不使用登录绕过。GitHub Pages 只发布网页代码；网页本地导入报告与人声文件，不需要发布个人录音或运行 Python。不要把私人输出复制到 `public/`、`docs/` 或其它会被构建/提交的位置。

```bash
node tools/vocal-analysis/analyze.mjs --help
node --test tools/vocal-analysis/test_analyze.mjs
node --test test/recording-alignment.test.mjs
```

CLI 测试使用合成正弦音频，覆盖私有输出、实际人声 hash、JSON 校验、无参考不评分、拒绝自我比对、对齐锚点与 HTML 转义。方法与边界以共享内核、[分离包装](../stem-separation/README.md)及其测试为准。
