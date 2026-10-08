# -*- coding: utf-8 -*-
"""双文件精准模式端到端：上传原唱+伴奏 -> 相减 -> 旋律应精确等于人声 440Hz"""
import glob, sys, math
from playwright.sync_api import sync_playwright
BASE = "http://localhost:8901"
ok = True
def check(name, cond, detail=""):
    global ok
    print(("PASS" if cond else "FAIL"), name, detail)
    if not cond: ok = False

with sync_playwright() as p:
    exe = sorted(glob.glob("/Users/shiqi/Library/Caches/ms-playwright/chromium-*/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"))[-1]
    b = p.chromium.launch(headless=True, executable_path=exe, args=[
        "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
        "--autoplay-policy=no-user-gesture-required"])
    ctx = b.new_context(locale="zh-CN", viewport={"width": 1280, "height": 900})
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route("**/*", lambda r: r.continue_(headers={**r.request.headers, "cache-control": "no-cache"}))
    pg.goto(BASE + "/?testtone=440")
    pg.wait_for_load_state("networkidle")
    pg.click("#micBtn")
    pg.wait_for_timeout(1500)
    pg.click('.tab[data-tab="karaoke"]')
    pg.wait_for_timeout(300)

    # 先选主文件，再选伴奏（触发精准模式）
    pg.set_input_files("#songFile", "/tmp/diag/ui_mix.wav")
    pg.wait_for_timeout(1500)
    pg.set_input_files("#accFile", "/tmp/diag/ui_acc.wav")
    ready = False
    for _ in range(60):
        pg.wait_for_timeout(500)
        txt = pg.inner_text("#karaokePairInfo")
        if "精准模式已就绪" in txt or "失败" in txt or "退回" in txt:
            ready = True
            break
    pair_txt = pg.inner_text("#karaokePairInfo")
    print("   pair info:", pair_txt[:110])
    check("精准模式完成", ready, pair_txt[:80])

    st = pg.evaluate("""() => {
      const k = window.__mm.state.karaoke;
      const r = k.ref;
      if (!r) return null;
      const vals = r.midis.filter((v) => v != null);
      const avg = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
      return { frames: r.midis.length, voiced: vals.length, avgMidi: avg,
               notes: r.notes ? r.notes.length : 0, pairUsed: k.pairUsed,
               coverage: r.midis.length ? vals.length / r.midis.length : 0 };
    }""")
    print("   ref:", st)
    check("参考线生成", st and st["frames"] > 100, str(st))
    check("走的是精准模式", st and st["pairUsed"] is True)
    # 相减后应只剩 440Hz 人声（MIDI 69）；伴奏 220Hz 应被消掉
    check("相减结果 = 人声 440Hz(69)", st and abs(st["avgMidi"] - 69) < 0.6,
          "avgMidi=" + str(st and round(st["avgMidi"], 2)))
    check("人声段覆盖率 >= 80%", st and st["coverage"] >= 0.8, str(st and round(st["coverage"] * 100)) + "%")
    check("产生了音符段", st and st["notes"] > 0, str(st and st["notes"]))
    check("无 JS 错误", not errs, "; ".join(errs[:2]))
    pg.screenshot(path="/tmp/mm-pair.png")
    b.close()
print("---")
print("PAIR-E2E " + ("OK" if ok else "FAILED"))
sys.exit(0 if ok else 1)
