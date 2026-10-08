# -*- coding: utf-8 -*-
import glob, json
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
    ctx = b.new_context(locale="en-US", viewport={"width": 1280, "height": 900})
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.route("**/*", lambda r: r.continue_(headers={**r.request.headers, "cache-control": "no-cache"}))
    pg.goto(BASE + "/")
    pg.wait_for_load_state("networkidle")
    pg.select_option("#langSelect", "en")
    pg.wait_for_timeout(500)

    # 逐面板扫描残留中文
    for tab in ["tuner", "practice", "karaoke", "spectrum", "learn"]:
        pg.click('.tab[data-tab="%s"]' % tab)
        pg.wait_for_timeout(350)
        cn = pg.evaluate("""() => {
          const panel = document.querySelector('.tab-panel.active');
          const walk = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
          const out = []; let n;
          while ((n = walk.nextNode())) {
            const t = n.textContent.trim();
            if (t && /[\u4e00-\u9fff]/.test(t)) out.push(t.slice(0, 40));
          }
          return out;
        }""")
        check("英文模式 " + tab + " 无中文", len(cn) == 0, "; ".join(cn[:3]))

        # 键名泄漏：界面出现 exp.li1 这类原始键名说明字典缺键（"无中文"检查抓不到）
        leaked = pg.evaluate("""() => {
          const panel = document.querySelector('.tab-panel.active');
          const walk = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
          const out = []; let n;
          while ((n = walk.nextNode())) {
            const t = n.textContent.trim();
            if (t && /^[a-z][a-zA-Z0-9]*\.[a-zA-Z0-9.]+$/.test(t)) out.push(t);
          }
          return out;
        }""")
        check("英文模式 " + tab + " 无键名泄漏", not leaked, "; ".join(leaked[:3]))


    # 课程英文内容真的渲染了
    pg.click('.tab[data-tab="learn"]')
    pg.wait_for_timeout(300)
    lesson = pg.evaluate("() => { const h2 = document.querySelector('#learnContent .lesson h2'); const p = document.querySelector('#learnContent .lesson .card p'); return { h2: h2 ? h2.textContent : '', p: p ? p.textContent.slice(0, 70) : '' }; }")
    check("课程标题英文", "Lesson 1" in lesson["h2"], lesson["h2"])
    check("课程正文英文", "breath" in lesson["p"].lower() or "inhale" in lesson["p"].lower(), lesson["p"])

    # 练习卡片英文
    pg.click('.tab[data-tab="practice"]')
    pg.wait_for_timeout(300)
    card = pg.evaluate("() => { const c = document.querySelector('.exercise-card h4'); const opt = document.querySelector('#keySelect option'); return { card: c ? c.textContent : '', opt: opt ? opt.textContent : '' }; }")
    check("练习卡片英文", card["card"] and "Match" in card["card"] or "note" in card["card"].lower(), card["card"])
    check("调名英文", "major" in card["opt"], card["opt"])

    # 切回中文
    pg.select_option("#langSelect", "zh")
    pg.wait_for_timeout(400)
    zh = pg.evaluate("""() => {
      const c = document.querySelector('.exercise-card h4');
      const opt = document.querySelector('#keySelect option');
      return { card: c ? c.textContent : '', opt: opt ? opt.textContent : '', lang: document.documentElement.lang };
    }""")
    check("切回中文：练习卡片", "单音模唱" in zh["card"], zh["card"])
    check("切回中文：调名", "大调" in zh["opt"], zh["opt"])
    check("切回中文：lang 属性", zh["lang"] == "zh-CN", zh["lang"])
    pg.screenshot(path="/tmp/mm-i18n-zh.png")
    pg.select_option("#langSelect", "en")
    pg.wait_for_timeout(300)
    pg.click('.tab[data-tab="learn"]')
    pg.wait_for_timeout(300)
    pg.screenshot(path="/tmp/mm-i18n-en-learn.png", full_page=False)
    check("无 JS 错误", not errs, "; ".join(errs[:3]))
    b.close()

print("---")
print("I18N " + ("OK" if ok else "FAILED"))
