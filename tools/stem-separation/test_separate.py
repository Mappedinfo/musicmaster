#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""separate.py 的单元测试：纯标准库，不需要 demucs / torch。

运行：
    python3 tools/stem-separation/test_separate.py
"""

import contextlib
import io
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import separate  # noqa: E402  （同目录 import，separate.py 顶层只依赖标准库）

PASS = 0
FAIL = 0


def check(name, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("PASS", name, detail)
    else:
        FAIL += 1
        print("FAIL", name, detail)


def parse_args(argv):
    return separate.build_parser().parse_args(argv)


def expect_error(func, *args, **kwargs):
    """执行 func，返回 SeparationError 实例；没有抛错时返回 None。"""
    try:
        func(*args, **kwargs)
    except separate.SeparationError as exc:
        return exc
    return None


def run_main(argv):
    """跑 separate.main，捕获它打印的内容，返回 (退出码, 输出)。"""
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
        code = separate.main(argv)
    return code, buf.getvalue()


@contextlib.contextmanager
def fake_ffmpeg(present=True):
    """替身 shutil.which，避免测试依赖本机是否装了 ffmpeg。"""
    real = separate.shutil.which
    if present:
        separate.shutil.which = lambda name: "/usr/bin/ffmpeg" if name == "ffmpeg" else real(name)
    else:
        separate.shutil.which = lambda name: None if name == "ffmpeg" else real(name)
    try:
        yield
    finally:
        separate.shutil.which = real


def flag_value(cmd, flag):
    """取 flag 后面紧跟的值；flag 不存在时返回 None。"""
    return cmd[cmd.index(flag) + 1] if flag in cmd else None


with tempfile.TemporaryDirectory() as tmp:
    tmpdir = Path(tmp)
    track = tmpdir / "song.mp3"
    track.write_bytes(b"placeholder")

    # 1) 默认命令
    cmd = separate.build_command(parse_args([str(track)]))
    check("命令前缀是当前解释器 + demucs 模块",
          cmd[:3] == [sys.executable, "-m", "demucs.separate"], str(cmd[:3]))
    check("默认模型 htdemucs", flag_value(cmd, "-n") == "htdemucs")
    check("默认输出目录 stems（绝对路径）",
          flag_value(cmd, "-o") == str(Path("stems").resolve()), str(flag_value(cmd, "-o")))
    check("默认 --two-stems vocals", flag_value(cmd, "--two-stems") == "vocals")
    check("输入放在末尾", cmd[-1] == str(track))

    # 2) 各参数透传
    opts = parse_args([
        str(track), "--two-stems", "none", "--other-method", "add",
        "--shifts", "2", "--overlap", "0.5", "--segment", "10",
        "-d", "cpu", "-j", "2", "--filename", "{track}_{stem}.{ext}",
        "--mp3", "--mp3-bitrate", "320", "-o", str(tmpdir / "out"),
    ])
    cmd = separate.build_command(opts)
    check("--two-stems none 时不出现该参数", "--two-stems" not in cmd)
    for flag, want in [
        ("--other-method", "add"), ("--shifts", "2"), ("--overlap", "0.5"),
        # --segment 是 float，argparse 会把 "10" 规范化成 "10.0"
        ("--segment", "10.0"), ("--device", "cpu"), ("-j", "2"),
        ("--filename", "{track}_{stem}.{ext}"), ("--mp3-bitrate", "320"),
    ]:
        check("透传 %s" % flag, flag_value(cmd, flag) == want, str(flag_value(cmd, flag)))
    check("开关 --mp3 生效", "--mp3" in cmd)

    # 3) 校验失败路径
    missing = tmpdir / "nope.mp3"
    err = expect_error(separate.validate, parse_args([str(missing)]))
    check("输入不存在 -> 报错且含路径", err is not None and "nope.mp3" in str(err))

    err = expect_error(separate.validate, parse_args([str(tmpdir)]))
    check("输入是目录 -> 报错", err is not None and "不是文件" in str(err))

    out_file = tmpdir / "out.txt"
    out_file.write_text("x", encoding="utf-8")
    err = expect_error(separate.validate, parse_args([str(track), "-o", str(out_file)]))
    check("输出路径是文件 -> 报错", err is not None and "不是目录" in str(err))

    with fake_ffmpeg(False):
        err = expect_error(separate.validate, parse_args([str(track)]))
    check("缺 ffmpeg -> 报错且提示 ffmpeg", err is not None and "ffmpeg" in str(err))

    err = expect_error(separate.validate, parse_args([str(track)]), require_ffmpeg=False)
    check("require_ffmpeg=False 时不检查 ffmpeg", err is None)

    # 4) --dry-run 只打印、不执行、不建目录
    dry_out = tmpdir / "dry-out"
    real_run = separate.subprocess.run
    called = []

    def explode(*args, **kwargs):
        called.append(args)
        raise AssertionError("--dry-run 不应调用子进程")

    separate.subprocess.run = explode
    try:
        code, printed = run_main([str(track), "--dry-run", "-o", str(dry_out)])
    finally:
        separate.subprocess.run = real_run
    check("--dry-run 退出码 0（无 ffmpeg 也能跑）", code == 0, str(code))
    check("--dry-run 未调用子进程", called == [])
    check("--dry-run 未创建输出目录", not dry_out.exists())
    check("--dry-run 打印了 demucs 命令", "demucs.separate" in printed)

    # 5) --cache-dir -> TORCH_HOME，且目录会被创建
    cache_dir = tmpdir / "torch-cache"
    captured = {}

    def capture_run(cmd, env=None, **kwargs):
        captured["cmd"] = cmd
        captured["env"] = env
        return subprocess.CompletedProcess(cmd, 0)

    separate.subprocess.run = capture_run
    try:
        with fake_ffmpeg():
            code, _ = run_main([str(track), "--cache-dir", str(cache_dir), "-o", str(tmpdir / "out-a")])
    finally:
        separate.subprocess.run = real_run
    check("--cache-dir 退出码 0", code == 0, str(code))
    check("TORCH_HOME 指向 --cache-dir", captured.get("env", {}).get("TORCH_HOME") == str(cache_dir.resolve()),
          str(captured.get("env", {}).get("TORCH_HOME")))
    check("--cache-dir 目录已创建", cache_dir.is_dir())

    # 6) demucs 失败时透传退出码
    separate.subprocess.run = lambda cmd, env=None, **kwargs: subprocess.CompletedProcess(cmd, 7)
    try:
        with fake_ffmpeg():
            code, _ = run_main([str(track), "-o", str(tmpdir / "out-b")])
    finally:
        separate.subprocess.run = real_run
    check("demucs 退出码 7 被透传", code == 7, str(code))

    # 7) 依赖清单一致性：PEP 723 内联元数据 <-> requirements.txt
    source = (HERE / "separate.py").read_text(encoding="utf-8")
    block = re.search(r"# /// script(.*?)# ///", source, re.S)
    check("separate.py 含 PEP 723 元数据块", block is not None)
    declared = set(re.findall(r'"([^"]+)"', re.search(r"dependencies\s*=\s*\[(.*?)\]", block.group(1), re.S).group(1)))
    reqs = set()
    for line in (HERE / "requirements.txt").read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            reqs.add(line)
    check("PEP 723 与 requirements.txt 依赖一致", declared == reqs, "差异: %s" % sorted(declared ^ reqs))
    check("PEP 723 声明了 requires-python", "requires-python" in block.group(1))

print()
print("通过 %d / 失败 %d" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
