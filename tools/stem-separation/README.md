# 本地音源分离

用 Demucs 把混音拆成人声与伴奏。代码可以发布；音频、模型和个人报告只放在根目录已忽略的 `stems/` 中。它是本机工具，GitHub Pages 不执行 Python 或模型推理。

## 先准备，后离线推理

前置要求：`uv`、Python 3.10+、PATH 中的 `ffmpeg`。建议使用 Python 3.11。依赖固定在 [requirements.txt](requirements.txt)，与脚本的 PEP 723 元数据一致。

```bash
# 在仓库根目录运行；所有依赖/模型缓存留在 stems/。
export UV_CACHE_DIR="$PWD/stems/.model-cache/uv"

# 联网阶段只安装依赖、下载并验证模型，不接收音频输入。
uv run --python 3.11 tools/stem-separation/separate.py --prepare-model

# 模型准备成功后，显式离线处理本地音频。
uv run --offline --python 3.11 tools/stem-separation/separate.py /path/to/mix.m4a \
  --offline --device cpu --shifts 0 --out stems/private/my-run/separated
```

两个 `--offline` 分别约束 uv 依赖解析与脚本的模型加载。缺少依赖或权重时命令会失败，不静默联网补齐。首次准备可能下载较大的 Torch 轮子和模型，具体时间取决于本机缓存与网络。

Demucs 4.1 使用 Hugging Face 模型；普通模型名加载失败时，上游会回退到旧 Torch 下载源。此包装的离线模式显式使用 `hf://htdemucs` 并设置 `HF_HUB_OFFLINE=1`，避免该回退。`--cache-dir` 同时设置：

- `TORCH_HOME=<cache-dir>`
- `HF_HOME=<cache-dir>/huggingface`
- `HF_HUB_CACHE=<cache-dir>/huggingface/hub`

默认缓存根目录是本仓库 `stems/.model-cache/`。已有旧版 Torch 权重不等于已有新版 HF 权重，请先单独准备并验证。

## 参数

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| 输入文件 | — | 可多个；模型准备时不允许输入音频 |
| `--prepare-model` | 关 | 仅准备/验证模型，不分离、不建立音频输出目录 |
| `--offline` | 关 | 仅加载已缓存 HF 模型，缺少时失败 |
| `--cache-dir` | `stems/.model-cache` | 隔离 HF 与 Torch 缓存 |
| `-o, --out` | `stems` | 输出根目录 |
| `-n, --model` | `htdemucs` | 模型名称；离线模式添加 `hf://` 前缀 |
| `--two-stems` | `vocals` | `vocals/drums/bass/other/none`，`none` 输出四轨 |
| `--other-method` | 不传 | `none/add/minus`，透传给 Demucs |
| `--shifts` | 不传 | 随机移位次数；0 便于快速、可重复的本地运行 |
| `--overlap` / `--segment` | 不传 | 分段重叠比例与长度 |
| `-d, --device` | 不传 | `cpu/cuda/mps`；本项目优先验证 CPU |
| `-j, --jobs` | 不传 | 曲目并行数 |
| `--filename` | 不传 | 输出文件模板 |
| `--mp3` / `--mp3-bitrate` / `--flac` | 不传 | 输出格式；默认 WAV |
| `--dry-run` | 关 | 打印命令，不执行、不创建缓存/输出目录 |

注意：`uv run` 会先解析 PEP 723 依赖，即使脚本传了 `--dry-run` 也可能准备环境。只检查命令且不准备依赖时，用已有 Python 直接执行 `python3 separate.py ... --dry-run`；脚本顶层只有标准库。

输出沿用上游布局，离线模型名可能产生额外目录层级；以结束时列出的实际路径为准。通常找到 `vocals.wav` 与 `no_vocals.wav` 即可。两轨模式内部仍运行完整分离模型，不能据此声称比四轨快一倍。相同输出路径会覆盖产物，建议每次使用独立 run-id。

## 本地分析报告

完整流程见 [vocal-analysis](../vocal-analysis/README.md)：一条命令可以先准备模型、离线分离、复用网页内核分析，再生成私有 JSON 和中文 HTML。分离后的人声应按 `sourceKind: separated` 分析，分离残留会限制判断；不要再次用原混音减去该人声。

## 测试与来源

```bash
UV_CACHE_DIR="$PWD/stems/.model-cache/uv" uv run python tools/stem-separation/test_separate.py
```

标准库检查覆盖命令拼装、输入验证、dry-run、模型准备不接收音频、HF/Torch 缓存隔离、离线显式 HF 分支、退出码透传与依赖清单一致性；不会下载模型或读取真实录音。退出码 0 成功、2 参数/环境错误、130 中断，其它分离失败码透传。

上游：[adefossez/demucs](https://github.com/adefossez/demucs)、[Demucs 4.1.0](https://pypi.org/project/demucs/4.1.0/)、[HF 模型加载器](https://github.com/adefossez/demucs/blob/main/demucs/hf.py)。TorchAudio 2.11 起的稳定 ABI 说明见 [官方安装文档](https://docs.pytorch.org/audio/stable/installation.html)。本仓库不分发权重，不附带音频，不授予歌曲使用权。
