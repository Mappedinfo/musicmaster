# -*- coding: utf-8 -*-
"""MusicMaster 冒烟测试：页面渲染、麦克风流程（虚拟设备）、各选项卡"""
import sys, time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8901"
errors = []

with sync_playwright() as p:
    import glob
    exe = sorted(glob.glob("/Users/shiqi/Library/Caches/ms-playwright/chromium-*/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"))[-1]
    print("using chromium:", exe)
    browser = p.chromium.launch(headless=True, executable_path=exe, args=[
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
    ])
    ctx = browser.new_context(viewport={"width": 1280, "height": 900}, locale="zh-CN")
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE + "/?testtone=220")
    page.wait_for_load_state("networkidle")

    ok = True
    def check(name, cond, detail=""):
        global ok
        print(("PASS" if cond else "FAIL"), name, detail)
        if not cond: ok = False

    check("title", "MusicMaster" in page.title(), page.title())
    check("tabs", page.locator(".tab").count() == 5, str(page.locator(".tab").count()))
    check("exercise cards", page.locator(".exercise-card").count() == 5, str(page.locator(".exercise-card").count()))
    check("key options", page.locator("#keySelect option").count() == 7)
    check("learn content rendered", len(page.locator("#learnContent .lesson").all()) >= 4)

    # 打开麦克风（虚拟音频设备自动授权，并输出测试音）
    page.click("#micBtn")
    page.wait_for_timeout(4000)
    frames = page.evaluate("""() => {
      const mm = window.__mm;
      return { sr: mm.engine.ctx && mm.engine.ctx.sampleRate,
               last: mm.state.lastFrame,
               trail: mm.state.trail.slice(-40) };
    }""")
    print("   debug frames:", frames.get("sr"), frames.get("last"))
    voiced = [p for p in (frames.get("trail") or []) if p.get("midi") is not None]
    print("   voiced frames in trail:", len(voiced), "of", len(frames.get("trail") or []))
    check("mic listening", "listening" in (page.get_attribute("#micBtn", "class") or ""))
    freq_txt = page.inner_text("#tunerFreq")
    note_txt = page.inner_text("#tunerNote")
    print("   tuner reads:", repr(note_txt), repr(freq_txt))
    check("tuner shows frequency", "Hz" in freq_txt and not freq_txt.startswith("0.0"), freq_txt)
    try:
        fv = float(freq_txt.replace(" Hz", ""))
        check("tuner accuracy 220Hz", abs(fv - 220) < 2, freq_txt)
        check("tuner note A3", note_txt.startswith("A3"), note_txt)
    except ValueError:
        check("tuner accuracy 220Hz", False, freq_txt)
    page.screenshot(path="/tmp/mm-tuner.png")

    # 频谱页
    page.click('.tab[data-tab="spectrum"]')
    page.wait_for_timeout(1500)
    centroid = page.inner_text("#mCentroid")
    print("   centroid:", centroid)
    check("spectrum metrics live", centroid != "--", centroid)
    page.screenshot(path="/tmp/mm-spectrum.png")

    # 练习页：开始一个练习，观察状态机推进
    page.click('.tab[data-tab="practice"]')
    page.locator(".exercise-card").first.click()
    page.wait_for_timeout(400)
    check("runner card visible", page.locator("#runnerCard").is_visible())
    page.click("#startExerciseBtn")
    page.wait_for_timeout(6000)
    phase = page.inner_text("#runnerPhase")
    dots = page.locator(".step-dot").count()
    print("   phase:", phase, "dots:", dots)
    check("exercise running", dots == 7 and phase in ("🔊 听示范音", "🎤 唱！", "准备", "完成"), phase)
    page.screenshot(path="/tmp/mm-practice.png")
    page.click("#stopExerciseBtn")

    # 课程页
    page.click('.tab[data-tab="learn"]')
    page.wait_for_timeout(400)
    page.screenshot(path="/tmp/mm-learn.png", full_page=True)

    js_errors = [e for e in errors if "favicon" not in e]
    check("no js errors", not js_errors, "; ".join(js_errors[:3]))
    browser.close()

print("---")
print("SMOKE " + ("OK" if ok else "FAILED"))
sys.exit(0 if ok else 1)
