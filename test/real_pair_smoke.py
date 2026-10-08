# -*- coding: utf-8 -*-
"""用真实歌曲（烟火里的尘埃）验证双文件精准模式：相减应精确恢复已知旋律"""
import glob, sys
from playwright.sync_api import sync_playwright
BASE = "http://localhost:8901"
ok = True
def check(name, cond, detail=""):
    global ok
    print(("PASS" if cond else "FAIL"), name, detail)
    if not cond: ok = False

with sync_playwright() as p:
    exe = sorted(glob.glob("/Users/shiqi/Library/Caches/ms-playwright/chromium-*/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"))[-1]
    b = p.chromium.launch(headless=True, executable_path=exe, args=["--use-fake-device-for-media-stream","--use-fake-ui-for-media-stream","--autoplay-policy=no-user-gesture-required"])
    ctx = b.new_context(locale="zh-CN", viewport={"width": 1280, "height": 900})
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route("**/*", lambda r: r.continue_(headers={**r.request.headers, "cache-control": "no-cache"}))
    pg.goto(BASE + "/?testtone=440")
    pg.wait_for_load_state("networkidle")
    pg.click("#micBtn"); pg.wait_for_timeout(1200)
    pg.click('.tab[data-tab="karaoke"]'); pg.wait_for_timeout(300)
    pg.set_input_files("#songFile", "/tmp/diag/real_mix.wav")
    pg.wait_for_timeout(1200)
    pg.set_input_files("#accFile", "/tmp/diag/real_acc.wav")
    for _ in range(90):
        pg.wait_for_timeout(500)
        t = pg.inner_text("#karaokePairInfo")
        if "精准模式已就绪" in t or "失败" in t: break
    print("   pair:", pg.inner_text("#karaokePairInfo")[:120])
    # 检查已知旋律段（8-11s=440Hz/A4, 18-21s=587Hz/D5, 28-31s=523Hz/C5）
    res = pg.evaluate("""() => {
      const k = window.__mm.state.karaoke;
      const r = k.ref; if (!r) return null;
      const at = (a, b) => {
        const out = [];
        for (let i = 0; i < r.times.length; i++) {
          const t = r.times[i];
          if (t >= a && t < b && r.midis[i] != null) out.push(r.midis[i]);
        }
        out.sort((x, y) => x - y);
        return { n: out.length, med: out.length ? out[out.length >> 1] : null };
      };
      const seg = (a, b) => { let v = 0, tot = 0;
        for (let i = 0; i < r.times.length; i++) { const t = r.times[i]; if (t >= a && t < b) { tot++; if (r.midis[i] != null) v++; } }
        return tot ? v / tot : 0; };
      return {
        pairUsed: k.pairUsed,
        a4: at(8.5, 10.5), d5: at(18.5, 20.5), c5: at(28.5, 30.5),
        cov8: seg(8, 11), cov18: seg(18, 21), cov28: seg(28, 31),
        covSilent: seg(2, 7), notes: r.notes ? r.notes.length : 0,
        frames: r.times.length,
      };
    }""")
    print("   result:", res)
    check("精准模式", res and res["pairUsed"] is True)
    check("8-11s 恢复 A4(69)", res and res["a4"]["med"] is not None and abs(res["a4"]["med"] - 69) < 1.0, str(res and res["a4"]))
    check("18-21s 恢复 D5(74)", res and res["d5"]["med"] is not None and abs(res["d5"]["med"] - 74) < 1.0, str(res and res["d5"]))
    check("28-31s 恢复 C5(72)", res and res["c5"]["med"] is not None and abs(res["c5"]["med"] - 72) < 1.0, str(res and res["c5"]))
    check("已知人声段覆盖 >=80%", res and min(res["cov8"], res["cov18"], res["cov28"]) >= 0.8,
          res and ("%.0f%%/%.0f%%/%.0f%%" % (res["cov8"]*100, res["cov18"]*100, res["cov28"]*100)))
    check("无人声段不误判(<=20%)", res and res["covSilent"] <= 0.2, res and ("%.0f%%" % (res["covSilent"]*100)))
    check("产生了音符段", res and res["notes"] > 3, str(res and res["notes"]))
    check("时间分辨率提升", res and res["frames"] > 3000, str(res and res["frames"]))
    check("无 JS 错误", not errs, "; ".join(errs[:2]))
    pg.screenshot(path="/tmp/mm-real-pair.png")
    b.close()
print("---")
print("REAL-PAIR " + ("OK" if ok else "FAILED"))
sys.exit(0 if ok else 1)
