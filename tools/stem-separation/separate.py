#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "demucs==4.1.0",
#     "torch==2.14.1",
#     "torchaudio==2.11.0",
#     "numpy==2.4.6",
# ]
# ///
"""本地音源分离：把混音拆成人声与伴奏，供 K 歌素材准备 / 学习使用。

这是 Demucs 的命令行薄包装，不实现任何分离算法：

    uv run tools/stem-separation/separate.py song.mp3 --two-stems vocals -o stems

边界：纯本地运行，不上传音频、不托管结果、不提供任何服务。
依赖清单同时维护在 requirements.txt；test_separate.py 会校验两者一致。
本模块顶层只 import 标准库，因此可以被单测直接 import（无需 demucs 环境）。
"""

from __future__ import annotations

import argparse
import os
import shlex
import shutil
import subprocess
import sys
from pathlib import Path
from typing import List, Optional, Sequence, Set, Tuple

PROG = "separate.py"
DEMUCS_MODULE = "demucs.separate"
DEFAULT_MODEL = "htdemucs"
DEFAULT_OUT = "stems"
DEFAULT_TWO_STEMS = "vocals"
TWO_STEM_CHOICES = ("vocals", "drums", "bass", "other", "none")
OTHER_METHOD_CHOICES = ("none", "add", "minus")

EXIT_OK = 0
EXIT_USAGE = 2
EXIT_INTERRUPTED = 130


class SeparationError(Exception):
    """参数或环境校验失败（对应退出码 2）。"""


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog=PROG,
        description="本地音源分离：把混音拆成人声与伴奏（Demucs 薄包装；不上传、不托管结果）。",
        epilog="用法与性能参考见 tools/stem-separation/README.md",
    )
    parser.add_argument("tracks", nargs="+", help="输入音频文件（可多个）")
    parser.add_argument("-o", "--out", default=DEFAULT_OUT, help="输出根目录（默认 %s）" % DEFAULT_OUT)
    parser.add_argument("-n", "--model", default=DEFAULT_MODEL, help="demucs 模型名（默认 %s）" % DEFAULT_MODEL)
    parser.add_argument(
        "--two-stems",
        default=DEFAULT_TWO_STEMS,
        choices=TWO_STEM_CHOICES,
        help="只分离 STEM 与 no_STEM（默认 vocals）；none 表示 4 轨全分",
    )
    parser.add_argument("--other-method", choices=OTHER_METHOD_CHOICES, default=None,
                        help="no_STEM 的取法，透传给 demucs")
    parser.add_argument("--shifts", type=int, default=None, help="随机移位次数；越大越慢、质量越好")
    parser.add_argument("--overlap", type=float, default=None, help="分段重叠比例，透传给 demucs")
    parser.add_argument("--segment", type=float, default=None, help="分段长度（秒），透传给 demucs")
    parser.add_argument("-d", "--device", default=None, help="cpu / cuda / mps；默认由 demucs 选择")
    parser.add_argument("-j", "--jobs", type=int, default=None, help="并行处理的曲目数，透传给 demucs")
    parser.add_argument("--filename", default=None, help='输出文件名模板，如 "{track}/{stem}.{ext}"')
    parser.add_argument("--mp3", action="store_true", help="输出 mp3（默认输出 wav）")
    parser.add_argument("--mp3-bitrate", type=int, default=None, help="mp3 码率，如 320")
    parser.add_argument("--flac", action="store_true", help="输出 flac")
    parser.add_argument("--cache-dir", default=None,
                        help="模型权重缓存目录（会设为子进程的 TORCH_HOME）；默认 ~/.cache/torch")
    parser.add_argument("--dry-run", action="store_true", help="只打印解析后的命令，不下载权重、不执行")
    return parser


def build_command(opts: argparse.Namespace) -> List[str]:
    """把解析后的参数翻译成 demucs 命令行（纯函数，便于单测）。"""
    cmd = [sys.executable, "-m", DEMUCS_MODULE]
    cmd += ["-n", opts.model]
    cmd += ["-o", str(Path(opts.out).expanduser().resolve())]
    if opts.two_stems and opts.two_stems != "none":
        cmd += ["--two-stems", opts.two_stems]
    if opts.other_method:
        cmd += ["--other-method", opts.other_method]
    if opts.shifts is not None:
        cmd += ["--shifts", str(opts.shifts)]
    if opts.overlap is not None:
        cmd += ["--overlap", str(opts.overlap)]
    if opts.segment is not None:
        cmd += ["--segment", str(opts.segment)]
    if opts.device:
        cmd += ["--device", opts.device]
    if opts.jobs is not None:
        cmd += ["-j", str(opts.jobs)]
    if opts.filename:
        cmd += ["--filename", opts.filename]
    if opts.flac:
        cmd += ["--flac"]
    if opts.mp3:
        cmd += ["--mp3"]
    if opts.mp3_bitrate is not None:
        cmd += ["--mp3-bitrate", str(opts.mp3_bitrate)]
    cmd += [str(Path(t).expanduser()) for t in opts.tracks]
    return cmd


def validate(opts: argparse.Namespace, require_ffmpeg: bool = True) -> None:
    """校验输入与环境；不满足时抛 SeparationError。"""
    if require_ffmpeg and shutil.which("ffmpeg") is None:
        raise SeparationError("未找到 ffmpeg；demucs 读写音频依赖它（macOS: brew install ffmpeg）")
    for track in opts.tracks:
        path = Path(track).expanduser()
        if not path.exists():
            raise SeparationError("输入不存在: %s" % path)
        if not path.is_file():
            raise SeparationError("输入不是文件: %s" % path)
    out = Path(opts.out).expanduser()
    if out.exists() and not out.is_dir():
        raise SeparationError("输出路径已存在但不是目录: %s" % out)


def child_env(cache_dir: Optional[str]) -> dict:
    """构造子进程环境；--cache-dir 会变成 TORCH_HOME（demucs 的权重下载位置）。"""
    env = os.environ.copy()
    if cache_dir:
        cache = Path(cache_dir).expanduser()
        cache.mkdir(parents=True, exist_ok=True)
        env["TORCH_HOME"] = str(cache.resolve())
    return env


def snapshot(root: Path) -> Set[Tuple[str, int, int]]:
    """记录目录下所有文件的 (路径, mtime_ns, 大小)，用于事后列出本次产出。"""
    if not root.exists():
        return set()
    return {
        (str(p), p.stat().st_mtime_ns, p.stat().st_size)
        for p in root.rglob("*")
        if p.is_file()
    }


def main(argv: Optional[Sequence[str]] = None) -> int:
    opts = build_parser().parse_args(argv)

    try:
        validate(opts, require_ffmpeg=not opts.dry_run)
    except SeparationError as exc:
        print("错误: %s" % exc, file=sys.stderr)
        return EXIT_USAGE

    cmd = build_command(opts)
    env = child_env(opts.cache_dir)
    out_dir = Path(opts.out).expanduser()

    # flush：demucs 的进度条走 stderr，管道/重定向时避免两路输出次序错乱
    print("输出目录: %s" % out_dir.resolve(), flush=True)
    print("执行命令: %s" % " ".join(shlex.quote(part) for part in cmd), flush=True)

    if opts.dry_run:
        print("(--dry-run：未执行，也未下载模型权重)", flush=True)
        return EXIT_OK

    out_dir.mkdir(parents=True, exist_ok=True)
    before = snapshot(out_dir)

    try:
        proc = subprocess.run(cmd, env=env)
    except KeyboardInterrupt:
        print("\n已中断", file=sys.stderr)
        return EXIT_INTERRUPTED

    if proc.returncode != 0:
        print("错误: demucs 退出码 %d" % proc.returncode, file=sys.stderr)
        return proc.returncode

    produced = sorted({item[0] for item in snapshot(out_dir) - before})
    print("\n完成，本次产出 %d 个文件:" % len(produced))
    for path in produced:
        print("  %s" % path)
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
