# 本地音源分离（tools/stem-separation）

把一首混音拆成人声与伴奏，用来准备 K 歌练习素材。

## 边界（先读这段）

- **这是本地命令行工具，不是网页应用的一部分。** 网页（`js/`、`index.html`）不引用它，也不需要运行它。
- **纯本地**：不上传音频、不托管结果、不提供任何服务，全程只读写你本机的文件。
- **请仅处理你依法有权使用的音频。** 本工具不附带、不下载、不索引任何歌曲或成品伴奏。
- 本目录只发布代码；仓库不提交任何音频文件与模型权重（见根目录 `.gitignore`）。

## 快速开始

```bash
# 分离人声与伴奏（默认只分 vocals / no_vocals），输出到 stems/
uv run tools/stem-separation/separate.py song.mp3 --two-stems vocals -o stems

# 输出 mp3 而不是默认的 wav
uv run tools/stem-separation/separate.py song.mp3 --mp3 --mp3-bitrate 320

# 四轨全分（鼓 / 贝斯 / 其他 / 人声）
uv run tools/stem-separation/separate.py song.mp3 --two-stems none

# 只想看看会执行什么命令，不下载权重也不跑
uv run tools/stem-separation/separate.py song.mp3 --dry-run
```

`separate.py` 带 PEP 723 内联依赖元数据，所以 `uv run` 会自动准备环境，无需手动建虚拟环境。
如果你用 pip，则 `pip install -r tools/stem-separation/requirements.txt` 后直接 `python3 separate.py ...`。

前置要求：`ffmpeg` 在 PATH 中（macOS：`brew install ffmpeg`）。缺失时脚本会直接报错退出，不会静默失败。

## 参数

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `tracks` | — | 输入音频，可以给多个 |
| `-o, --out` | `stems` | 输出根目录，不存在会自动创建 |
| `-n, --model` | `htdemucs` | demucs 模型名 |
| `--two-stems` | `vocals` | 只分 STEM 与 no_STEM；取 `vocals`/`drums`/`bass`/`other`/`none`（`none` = 四轨全分） |
| `--other-method` | 不传 | `none`/`add`/`minus`，no_STEM 的取法 |
| `--shifts` | 不传 | 随机移位次数，越大越慢、质量越好 |
| `--overlap` | 不传 | 分段重叠比例 |
| `--segment` | 不传 | 分段长度（秒） |
| `-d, --device` | 不传 | `cpu`/`cuda`/`mps`；不传时由 demucs 自行选择 |
| `-j, --jobs` | 不传 | 并行处理的曲目数 |
| `--filename` | 不传 | 输出文件名模板，如 `"{track}_{stem}.{ext}"` |
| `--mp3` / `--mp3-bitrate` / `--flac` | 不传 | 输出格式；默认 wav |
| `--cache-dir` | 不传 | 权重缓存目录，会设为子进程的 `TORCH_HOME` |
| `--dry-run` | 关 | 只打印解析后的命令，不下载权重、不执行 |

除校验与路径解析外，所有参数都原样透传给 `demucs.separate`，本工具不改变 demucs 的默认行为。

## 退出码

| 码 | 含义 |
| --- | --- |
| `0` | 成功 |
| `2` | 参数或环境校验失败（输入不存在、输入是目录、`-o` 指向文件、缺 ffmpeg） |
| 其他 | demucs 子进程的退出码被原样透传 |
| `130` | 用户 Ctrl-C 中断 |

## 输出结构

沿用 demucs 的布局，本工具不重命名、不复制产物：

```
stems/
└── htdemucs/            # 模型名
    └── song/            # 曲目名
        ├── vocals.wav
        └── no_vocals.wav
```

运行结束时会列出本次新增或更新的文件。

## 模型权重与缓存

权重首次运行时由 demucs 自动下载，**不进仓库**：

- 默认缓存位置 `~/.cache/torch/hub/checkpoints`
- `htdemucs` 的权重文件约 84 MB（实测 `955717e8-8726e21a.th` = 84,141,911 字节）
- 用 `--cache-dir <dir>` 可以改到别处（会设为子进程的 `TORCH_HOME`）
- 首次运行需要联网；之后走本地缓存，不再下载

## 性能参考（实测，不是估算）

| 项目 | 数值 |
| --- | --- |
| 输入 | 5 分 21 秒、128 kbps mp3 |
| 模型 / 参数 | `htdemucs`、`--two-stems vocals` |
| 机器 | Apple Silicon，CPU（MPS 未使用） |
| 模型推理 | 约 33 秒 |
| 整个命令 wall time | 1 分 13 秒 |
| 首次额外开销 | 下载约 84 MB 权重 |

开启 `--shifts 2` 会更慢（换更好的质量）；`--two-stems none` 四轨全分大约是两轨的 2 倍工作量。

## 依赖与已验证组合

依赖清单的规范来源是 [requirements.txt](requirements.txt)，`separate.py` 顶部的 PEP 723 元数据与它保持一致，单元测试会校验两者相同。

已验证组合：macOS arm64 + CPython 3.11.14（uv 管理），demucs 4.1.0 / torch 2.14.1 / torchaudio 2.11.0 / numpy 2.4.6。
其他平台若遇到某版本没有轮子，可放宽 `==` 后面的版本号；`torchaudio` 必须与 `torch` 搭配。Windows 未验证。

## 上游与许可

- 分离算法与权重来自 [facebookresearch/demucs](https://github.com/facebookresearch/demucs)（Meta，MIT 许可，代码许可证原文已核对）。
- 本目录只是命令行包装，不含模型权重，也不重新分发权重。
- demucs 官方仓库已停止维护，预训练权重的许可证 Meta 未在仓库中单独声明（见其 issue #327）；本工具按上游默认方式在运行时下载权重，不随仓库分发。

## 合规

- 处理全在本机完成，不上传、不落盘到任何服务器、不提供服务端接口。
- 仓库不提交任何音频文件（原曲或分离产物），也不预置任何歌曲；`.gitignore` 已覆盖音频与权重后缀。
- 不按歌名 / 歌手组织内容，不提供成品伴奏下载。
- 请遵守你所在地区法律与所用音频的授权范围；本工具不授予任何音频权利。

## 常见问题

- **`未找到 ffmpeg`**：装一个（macOS `brew install ffmpeg`）。demucs 读写 mp3 依赖它。
- **首次运行卡在下载权重**：权重约 84 MB，网络慢时会等一会儿；也可先用 `--cache-dir` 指到一个你确定可写的目录。
- **想用 GPU**：`-d mps` 在 macOS 上未经本项目验证，默认走 CPU（实测数据见上表）。
- **内存**：默认分段推理，长曲子不会一次性吃满内存；`--segment` 可进一步调小。
- **重复运行**：同一曲目会覆盖上次的输出，不会自动改名。

## 测试

```bash
python3 tools/stem-separation/test_separate.py
```

纯标准库、不需要 demucs / torch：覆盖命令拼装、各参数透传、全部校验失败路径、`--dry-run` 不执行、`--cache-dir` 设置 `TORCH_HOME`、退出码透传、以及依赖清单一致性。
