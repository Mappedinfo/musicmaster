# -*- coding: utf-8 -*-
"""K歌跟唱 + 音名八度基准校准：端到端验证"""
import sys, glob, math, os, struct, tempfile, wave
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8901"


def make_tone_wav(path, freq=440.0, seconds=8.0, sr=44100):
    """生成一个纯正弦 WAV，作为"带旋律的歌曲"输入。"""
    n = int(sr * seconds)
    frames = bytearray()
    for i in range(n):
        v = int(0.4 * 32767 * math.sin(2 * math.pi * freq * i / sr))
        frames += struct.pack("<h", v)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(bytes(frames))
    return path


TONE = os.path.join(tempfile.gettempdir(), "mm-tone-a4.wav")
make_tone_wav(TONE)
print("test tone:", TONE, os.path.getsize(TONE), "bytes")
errors = []
ok = True
def check(name, cond, detail=""):
    global ok
    print(("PASS" if cond else "FAIL"), name, detail)
    if not cond: ok = False

with sync_playwright() as p:
    exe = sorted(glob.glob("/Users/shiqi/Library/Caches/ms-playwright/chromium-*/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"))[-1]
    browser = p.chromium.launch(headless=True, executable_path=exe, args=[
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
    ])
    ctx = browser.new_context(viewport={"width": 1280, "height": 980}, locale="zh-CN")
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE + "/?testtone=440")
    page.wait_for_load_state("networkidle")

    check("tabs 数量 5", page.locator(".tab").count() == 5, str(page.locator(".tab").count()))
    check("八度基准选择器存在", page.locator("#octaveBase").count() == 1)
    check("默认基准为 C4", page.input_value("#octaveBase") == "0", page.input_value("#octaveBase"))

    # ---- 打开麦克风（振荡器 440Hz 走同一分析管线）----
    page.click("#micBtn")
    page.wait_for_timeout(3500)
    note0 = page.inner_text("#tunerNote")
    freq0 = page.inner_text("#tunerFreq")
    print("   基准C4:", repr(note0), repr(freq0))
    check("440Hz 显示 A4", note0.startswith("A4"), note0)

    # ---- 切换到 C3=中央C ----
    page.select_option("#octaveBase", "1")
    page.wait_for_timeout(800)
    note1 = page.inner_text("#tunerNote")
    freq1 = page.inner_text("#tunerFreq")
    print("   基准C3:", repr(note1), repr(freq1))
    check("同一频率下切换基准 -> A3", note1.startswith("A3"), note1)
    check("切换基准不改频率", freq0 == freq1, freq0 + " vs " + freq1)
    check("切换提示出现", page.locator("#toast").is_visible())

    # 切回基准 A4
    page.select_option("#octaveBase", "0")
    page.wait_for_timeout(600)
    check("切回基准恢复 A4", page.inner_text("#tunerNote").startswith("A4"), page.inner_text("#tunerNote"))

    # ---- K歌面板 ----
    page.click('.tab[data-tab="karaoke"]')
    page.wait_for_timeout(400)
    check("K歌面板可见", page.locator("#tab-karaoke").is_visible())
    check("画布存在", page.locator("#karaokeCanvas").count() == 1)

    # 上传 WAV
    page.set_input_files("#songFile", TONE)
    # 等待旋律提取完成
    ready = False
    for _ in range(60):
        page.wait_for_timeout(500)
        info = page.inner_text("#karaokeFileInfo")
        if "已就绪" in info or "失败" in info:
            ready = True
            break
    info = page.inner_text("#karaokeFileInfo")
    print("   file info:", info)
    check("旋律提取完成", ready and "已就绪" in info, info)
    check("提示检测到人声旋律", "人声旋律" in info, info)

    kref = page.evaluate("""() => {
      const k = window.__mm.state.karaoke;
      if (!k.ref) return null;
      const voiced = k.ref.midis.filter((v) => v != null);
      const avg = voiced.reduce((a, b) => a + b, 0) / (voiced.length || 1);
      return { frames: k.ref.midis.length, voiced: voiced.length, avgMidi: avg, hop: k.ref.hopSec, ready: k.fileReady };
    }""")
    print("   ref:", kref)
    check("参考线已生成", kref and kref["frames"] > 100, str(kref))
    check("参考线含人声帧", kref and kref["voiced"] > 100, str(kref))
    # 440Hz 正弦 -> 应稳定落在 MIDI 69 附近
    check("440Hz 参考音高≈A4(69)", kref and abs(kref["avgMidi"] - 69) < 0.15, str(kref and kref["avgMidi"]))

    # 播放 + 注入"唱准"的帧，验证评分与报告
    page.click("#karaokePlayBtn")
    page.wait_for_timeout(2000)
    check("播放按钮变为暂停", "暂停" in page.inner_text("#karaokePlayBtn"), page.inner_text("#karaokePlayBtn"))
    check("K歌实际启动麦克风采集", page.evaluate("() => window.__mm.state.karaoke.player.micOn"))

    page.evaluate("""() => {
      const k = window.__mm.state.karaoke;
      // 真实采集链路已验证；隔离虚拟麦克风的静音帧，单独检查满分报告。
      k.player.pause();
      k.player.stopMicrophone();
      k.scorer = new k.scorer.constructor({ ref: k.ref, lyrics: k.lyrics });
      // 模拟"完全唱准"：把参考线的音高当作麦克风输入喂进去
      for (let i = 0; i < k.ref.times.length; i++) {
        const t = k.ref.times[i];
        if (t > 4) break;
        k.live = { t, midi: k.ref.midis[i], voiced: true, clarity: 0.9, level: 0.2 };
        k.scorer.feed(t, k.ref.midis[i]);
      }
      k.time = 4;
      k.duration = 8;
    }""")
    page.wait_for_timeout(600)
    page.evaluate("() => window.__mm.state.karaoke.player.pause()")
    # 直接触发结束流程（等价于播完）
    page.evaluate("""() => {
      const k = window.__mm.state.karaoke;
      k.player.onEnded && k.player.onEnded();
    }""")
    page.wait_for_timeout(900)

    report = page.evaluate("""() => {
      const el = document.querySelector('#karaokeReport');
      const k = window.__mm.state.karaoke;
      return {
        hidden: el.hidden,
        text: el.innerText.slice(0, 400),
        segs: el.querySelectorAll('.k-seg').length,
        tips: el.querySelectorAll('.k-report li').length,
        scorerScore: k.scorer ? k.scorer.score : null,
        inTune: k.scorer ? k.scorer.inTune : null,
      };
    }""")
    print("   report score:", report["scorerScore"], "inTune:", report["inTune"], "segs:", report["segs"], "tips:", report["tips"])
    check("报告已显示", not report["hidden"])
    check("唱准 -> 音准率 1.0", report["inTune"] is not None and report["inTune"] > 0.99, str(report["inTune"]))
    check("唱准 -> 分数 >= 90", report["scorerScore"] is not None and report["scorerScore"] >= 90, str(report["scorerScore"]))
    check("报告含练习建议", report["tips"] >= 1, str(report["tips"]))
    check("报告含分段", report["segs"] >= 1, str(report["segs"]))
    check("分数渲染在页面上", "分" in report["text"], report["text"][:60])

    page.screenshot(path="/tmp/mm-karaoke.png", full_page=False)
    page.click('.tab[data-tab="tuner"]')
    page.wait_for_timeout(400)
    page.screenshot(path="/tmp/mm-octave.png")

    js_errors = [e for e in errors if "favicon" not in e]
    check("无 JS 错误", not js_errors, "; ".join(js_errors[:3]))
    browser.close()

print("---")
print("KARAOKE-E2E " + ("OK" if ok else "FAILED"))
sys.exit(0 if ok else 1)
