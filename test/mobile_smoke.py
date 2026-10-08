# -*- coding: utf-8 -*-
"""移动端适配验证：多视口布局、横向溢出、触控目标尺寸"""
import sys, glob
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8901"
ok = True
def check(name, cond, detail=""):
    global ok
    print(("PASS" if cond else "FAIL"), name, detail)
    if not cond: ok = False

VIEWPORTS = [
    ("iPhone 14 Pro", 393, 852, True),
    ("iPhone SE", 375, 667, True),
    ("小屏 320", 320, 568, True),
    ("iPad mini", 744, 1133, True),
    ("桌面", 1440, 900, False),
]

with sync_playwright() as p:
    exe = sorted(glob.glob("/Users/shiqi/Library/Caches/ms-playwright/chromium-*/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"))[-1]
    browser = p.chromium.launch(headless=True, executable_path=exe, args=[
        "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
    ])
    for name, w, h, mobile in VIEWPORTS:
        ctx = browser.new_context(viewport={"width": w, "height": h}, is_mobile=mobile,
                                  has_touch=mobile, device_scale_factor=2 if mobile else 1)
        page = ctx.new_page()
        # 禁掉缓存，避免测到旧 CSS/JS
        page.route("**/*", lambda route: route.continue_(headers={**route.request.headers, "cache-control": "no-cache"}))
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.goto(BASE + "/")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(300)

        # 横向溢出检查（关键：手机上不能左右滚）
        overflow = page.evaluate("""() => {
          const docW = document.documentElement.clientWidth;
          const bad = [];
          document.querySelectorAll('body *').forEach((el) => {
            const r = el.getBoundingClientRect();
            if (r.width === 0) return;
            if (r.right > docW + 1.5) {
              const cs = getComputedStyle(el);
              // 允许自身可横滚的容器内部溢出
              let par = el.parentElement, scrollable = false;
              while (par) {
                const pcs = getComputedStyle(par);
                if (pcs.overflowX === 'auto' || pcs.overflowX === 'scroll') { scrollable = true; break; }
                par = par.parentElement;
              }
              if (!scrollable) bad.push(el.tagName + '.' + (el.className || '').toString().slice(0, 30) + ' right=' + Math.round(r.right) + ' doc=' + docW);
            }
          });
          return { docW, scrollW: document.documentElement.scrollWidth, bad: bad.slice(0, 5) };
        }""")
        check(name + " 无横向溢出", len(overflow["bad"]) == 0 and overflow["scrollW"] <= overflow["docW"] + 2,
              "; ".join(overflow["bad"]) or ("scrollW=" + str(overflow["scrollW"]) + " docW=" + str(overflow["docW"])))

        # 触控目标尺寸（仅移动端）
        if mobile:
            small = page.evaluate("""() => {
              const out = [];
              document.querySelectorAll('button, .file-btn, select, input[type=checkbox], input[type=range], .tab').forEach((el) => {
                const r = el.getBoundingClientRect();
                if (r.width === 0 || r.height === 0) return;
                if (r.height < 32) out.push((el.id || el.className || el.tagName) + ' h=' + Math.round(r.height));
              });
              return out;
            }""")
            check(name + " 触控目标 >=32px", len(small) == 0, "; ".join(small[:5]))
            check(name + " 无 JS 错误", not errs, "; ".join(errs[:3]))

        # 主按钮撑满（手机）
        if w <= 640:
            btn = page.evaluate("() => { const b = document.querySelector('#micBtn'); const r = b.getBoundingClientRect(); return { w: Math.round(r.width), pw: Math.round(b.parentElement.getBoundingClientRect().width) }; }")
            check(name + " 麦克风按钮撑满", btn["w"] >= btn["pw"] - 4, str(btn))

        # 画布不超出视口
        cvs = page.evaluate("""() => {
          const docW = document.documentElement.clientWidth;
          return Array.from(document.querySelectorAll('canvas')).map((c) => {
            const r = c.getBoundingClientRect();
            return { id: c.id, w: Math.round(r.width), over: r.right > docW + 1.5 || r.width > docW };
          });
        }""")
        over = [c for c in cvs if c["over"]]
        check(name + " 画布适配", not over, str(over)[:120])

        tag = name.replace(" ", "_")
        page.screenshot(path="/tmp/mm-m-%s-tuner.png" % tag, full_page=False)
        page.click('.tab[data-tab="karaoke"]')
        page.wait_for_timeout(250)
        page.screenshot(path="/tmp/mm-m-%s-karaoke.png" % tag, full_page=False)
        if mobile and w <= 393:
            page.click('.tab[data-tab="practice"]')
            page.wait_for_timeout(250)
            page.screenshot(path="/tmp/mm-m-%s-practice.png" % tag, full_page=False)
        ctx.close()

    browser.close()

print("---")
print("MOBILE " + ("OK" if ok else "FAILED"))
sys.exit(0 if ok else 1)
