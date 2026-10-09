# -*- coding: utf-8 -*-
"""成品 UI 回归：先启动预览，再运行 uv run --with playwright python test/ui_smoke.py。

BASE_URL 可指向本地预览、项目子路径或线上 Pages。测试只在隔离浏览器上下文
里使用合成音频和练习记录；截图默认保存到 docs/screenshots，可用 SCREENSHOT_DIR 覆盖。
"""
import glob
import math
import os
from pathlib import Path
import re
import struct
import sys
import tempfile
import traceback
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
import wave

from playwright.sync_api import sync_playwright


BASE = os.environ.get("BASE_URL", "http://localhost:8901").rstrip("/") + "/"
ROOT = Path(__file__).resolve().parents[1]
SCREENSHOTS = Path(os.environ.get("SCREENSHOT_DIR", str(ROOT / "docs/screenshots")))
TABS = ["tuner", "practice", "karaoke", "spectrum", "learn"]
VIEWPORTS = [
    ("desktop", 1280, 900, False),
    ("phone-320", 320, 568, True),
    ("phone-375", 375, 667, True),
    ("phone-393", 393, 852, True),
    ("ipad", 744, 1133, True),
]
passed = 0
failed = 0


def check(name, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
    else:
        failed += 1
    print(("PASS" if condition else "FAIL"), name, str(detail)[:500], flush=True)


def run_case(name, operation):
    """独立场景失败后继续其余场景，但保留非零退出码和失败依据。"""
    try:
        operation()
    except Exception as error:
        check(name, False, error)
        traceback.print_exc()


def app_url(**query):
    parts = urlsplit(BASE)
    merged = dict(parse_qsl(parts.query))
    merged.update(query)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(merged), ""))


def chromium_executable():
    override = os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE")
    if override:
        if not Path(override).is_file():
            raise FileNotFoundError("PLAYWRIGHT_CHROMIUM_EXECUTABLE 不存在: " + override)
        return override
    # 复用本机缓存；其他平台由 Playwright 查找自己安装的 Chromium。
    cache = Path.home() / "Library/Caches/ms-playwright"
    candidates = glob.glob(str(cache / "chromium-*/chrome-mac-*/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"))
    if candidates:
        return max(candidates, key=lambda path: int(re.search(r"chromium-(\d+)", path)[1]))
    return None


CANVAS_PROBE = """(() => {
  window.__uiCanvasTexts = {};
  const originalFill = CanvasRenderingContext2D.prototype.fillText;
  const originalClear = CanvasRenderingContext2D.prototype.clearRect;
  CanvasRenderingContext2D.prototype.clearRect = function(...args) {
    if (this.canvas.id && args[0] === 0 && args[1] === 0)
      window.__uiCanvasTexts[this.canvas.id] = [];
    return originalClear.apply(this, args);
  };
  CanvasRenderingContext2D.prototype.fillText = function(text, x, y, ...rest) {
    if (this.canvas.id) {
      const labels = window.__uiCanvasTexts[this.canvas.id] ||= [];
      if (labels.length < 200) labels.push({text: String(text), x, y});
    }
    return originalFill.call(this, text, x, y, ...rest);
  };
})()"""


def watch_errors(page):
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
    page.on("requestfailed", lambda request: errors.append(request.url + ": " + str(request.failure)))
    page.on("response", lambda response: errors.append(str(response.status) + " " + response.url) if response.status >= 400 else None)
    return errors


def ready(page, url=None):
    page.goto(url or app_url(), wait_until="networkidle")
    page.wait_for_function("() => !!window.__mm && document.querySelectorAll('[role=tab]').length === 5")
    page.evaluate("() => document.fonts.ready")


def select_tab(page, tab):
    page.locator(f"#nav-{tab}").click()
    page.wait_for_function("tab => document.querySelector('#tab-' + tab).classList.contains('active')", arg=tab)
    page.evaluate("() => window.scrollTo(0, 0)")


def first_screen(page):
    return page.evaluate("""() => Object.fromEntries(['octaveBase', 'langSelect', 'micBtn'].map(id => {
      const el = document.getElementById(id), r = el.getBoundingClientRect();
      return [id, {visible: r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight,
                   outsideGuide: !el.closest('details'), top: Math.round(r.top), bottom: Math.round(r.bottom)}];
    }))""")


def layout_details(page):
    return page.evaluate("""() => {
      const width = document.documentElement.clientWidth;
      const bad = [];
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        let parent = el.parentElement, scrollable = false;
        while (parent) {
          if (['auto', 'scroll'].includes(getComputedStyle(parent).overflowX)) { scrollable = true; break; }
          parent = parent.parentElement;
        }
        if (!scrollable && (r.right > width + 1.5 || r.left < -1.5))
          bad.push((el.id || el.tagName + '.' + String(el.className).slice(0, 30)) + ':' + Math.round(r.left) + '..' + Math.round(r.right));
      }
      const small = [];
      for (const el of document.querySelectorAll('button, select, input[type=range], input[type=checkbox], summary')) {
        if (!el.getClientRects().length) continue;
        // 复选框的关联 label 同样是实际点击区域，按真实触控区域测量。
        const target = el.type === 'checkbox' && el.labels?.length ? el.labels[0] : el;
        const r = target.getBoundingClientRect();
        if (r.width && r.height && r.height < 32)
          small.push((el.id || el.className || el.tagName) + ':' + Math.round(r.height));
      }
      const canvases = Array.from(document.querySelectorAll('canvas')).filter(c => {
        const r = c.getBoundingClientRect(); return r.width && (r.width > width || r.right > width + 1.5);
      }).map(c => c.id);
      return {width, scrollWidth: document.documentElement.scrollWidth, bad: bad.slice(0, 8), small, canvases};
    }""")


def english_content(page):
    return page.evaluate("""() => {
      const root = document.querySelector('.tab-panel.active');
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const chinese = [], keys = []; let node;
      while ((node = walker.nextNode())) {
        const text = node.textContent.trim();
        if (/[\\u4e00-\\u9fff]/.test(text)) chinese.push(text.slice(0, 55));
        if (/^[a-z][a-zA-Z0-9]*\\.[a-zA-Z0-9.]+$/.test(text)) keys.push(text);
      }
      return {chinese: chinese.slice(0, 5), keys};
    }""")


def screenshot(page, filename):
    SCREENSHOTS.mkdir(parents=True, exist_ok=True)
    page.evaluate("() => window.scrollTo(0, 0)")
    page.screenshot(path=str(SCREENSHOTS / filename), full_page=False)


def check_navigation(page):
    check("React 五面板与 tabpanel 关联", page.locator('[role="tab"]').count() == 5 and page.locator('[role="tabpanel"]').count() == 5)
    page.locator("#nav-tuner").focus()
    for key, target in [("ArrowRight", "practice"), ("ArrowLeft", "tuner"), ("ArrowLeft", "learn"), ("Home", "tuner"), ("End", "learn"), ("ArrowRight", "tuner")]:
        page.keyboard.press(key)
        page.wait_for_function("id => document.activeElement.id === 'nav-' + id && document.getElementById('nav-' + id).getAttribute('aria-selected') === 'true'", arg=target)
        data = page.evaluate("""id => ({
          selected: document.querySelectorAll('[role=tab][aria-selected=true]').length,
          tabbable: document.querySelectorAll('[role=tab][tabindex="0"]').length,
          panel: document.querySelector('.tab-panel.active').id,
          labelled: document.getElementById('tab-' + id).getAttribute('aria-labelledby')
        })""", target)
        check("键盘 " + key + " -> " + target, data == {"selected": 1, "tabbable": 1, "panel": "tab-" + target, "labelled": "nav-" + target}, data)


def make_tone(path, frequency=440, seconds=8, sample_rate=44100):
    frames = bytearray()
    for i in range(int(seconds * sample_rate)):
        frames.extend(struct.pack("<h", int(.4 * 32767 * math.sin(2 * math.pi * frequency * i / sample_rate))))
    with wave.open(str(path), "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(sample_rate)
        audio.writeframes(frames)


def upload_controls(page):
    select_tab(page, "karaoke")
    controls = page.evaluate("""() => Array.from(document.querySelectorAll('.upload-field')).map(field => {
      const button = field.querySelector('button'), input = field.querySelector('input[type=file]');
      const canvas = document.querySelector('#karaokeCanvas');
      return {id: input.id, button: button.tagName === 'BUTTON' && !button.disabled,
        before: !!(button.compareDocumentPosition(canvas) & Node.DOCUMENT_POSITION_FOLLOWING),
        above: button.getBoundingClientRect().bottom <= canvas.getBoundingClientRect().top,
        outsideGuide: !button.closest('details')};
    })""")
    check("歌曲、伴奏、歌词三个入口在曲线前且展开", len(controls) == 3 and all(all(item[key] for key in ["button", "before", "above", "outsideGuide"]) for item in controls), controls)
    page.locator("#nav-karaoke").focus()
    reached = set()
    for _ in range(18):
        page.keyboard.press("Tab")
        identifier = page.evaluate("() => document.activeElement.closest('.upload-field')?.querySelector('input[type=file]')?.id || ''")
        if identifier:
            reached.add(identifier)
    check("Tab 键可达全部上传按钮", reached == {"songFile", "accFile", "lrcFile"}, sorted(reached))
    for identifier in ["songFile", "accFile", "lrcFile"]:
        button = page.locator(f".upload-field:has(#{identifier}) button")
        with page.expect_file_chooser() as chooser:
            button.press("Enter")
        check(identifier + " Enter 打开正确文件选择器", chooser.value.element.get_attribute("id") == identifier)
    selectors = ["#octaveBase", "#langSelect", "#keySelect", "#karaokeVol", "#karaokeEcho", "#songFile", "#accFile", "#lrcFile"]
    hidden_settings = page.evaluate("selectors => selectors.filter(selector => document.querySelector(selector).closest('details'))", selectors)
    check("所有常用设置在帮助折叠区之外", not hidden_settings, hidden_settings)


# 用合成事件验证安装入口：Chromium 是否真的触发 beforeinstallprompt 取决于环境，
# 但页面拿到事件后的行为必须确定可测。
SIMULATE_INSTALL = """() => {
  const event = new Event('beforeinstallprompt');
  event.prompt = () => { window.__installPrompted = true; };
  event.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
  window.dispatchEvent(event);
}"""


def header_and_install(browser):
    """语言切换必须是页头右上角的全局控件，且安装入口能真正调用系统安装。"""
    context = browser.new_context(viewport={"width": 1280, "height": 900}, locale="zh-CN")
    page = context.new_page()
    errors = watch_errors(page)
    try:
        ready(page)
        placement = page.evaluate("""() => {
          const select = document.getElementById('langSelect');
          const rect = select.getBoundingClientRect();
          const bar = document.querySelector('.settings-bar').getBoundingClientRect();
          return {count: document.querySelectorAll('#langSelect').length,
            inHeader: !!select.closest('.site-header'), inPanel: !!select.closest('.tab-panel'),
            right: rect.right, top: rect.top, height: rect.height, width: innerWidth,
            aboveSettings: rect.bottom <= bar.top + 1};
        }""")
        check("语言切换是页头右上角的唯一入口",
              placement["count"] == 1 and placement["inHeader"] and not placement["inPanel"]
              and placement["aboveSettings"] and placement["right"] > placement["width"] * .8
              and placement["height"] >= 32, placement)
        leaked = []
        for tab in TABS:
            select_tab(page, tab)
            if page.evaluate("() => !!document.querySelector('.tab-panel.active #langSelect')"):
                leaked.append(tab)
        check("各子页面内不再重复语言切换", not leaked, leaked)
        select_tab(page, "tuner")
        page.evaluate(SIMULATE_INSTALL)
        page.wait_for_selector("#installBtn")
        button = page.evaluate("""() => { const el = document.getElementById('installBtn'), rect = el.getBoundingClientRect();
          return {visible: rect.width > 0 && rect.height >= 32, text: el.textContent.trim()}; }""")
        check("浏览器可安装时页头出现安装入口", button["visible"] and button["text"], button)
        page.click("#installBtn")
        page.wait_for_function("() => !!window.__installPrompted")
        check("点击安装入口触发系统安装并收起入口",
              page.evaluate("() => !document.getElementById('installBtn')"))
        check("页头语言与安装流程无 JS/资源错误", not errors, errors)
    finally:
        context.close()


def pwa_installable(browser):
    """成品必须能安装成本地应用：manifest、图标、Service Worker 与离线启动。"""
    context = browser.new_context(viewport={"width": 1280, "height": 900}, locale="zh-CN")
    page = context.new_page()
    errors = watch_errors(page)
    try:
        ready(page)
        manifest = page.evaluate("async () => (await fetch(document.querySelector('link[rel=manifest]').href)).json()")
        icons = manifest.get("icons", [])
        check("manifest 为独立窗口且图标齐全",
              manifest.get("display") == "standalone" and manifest.get("start_url") == "./"
              and any(icon.get("sizes") == "192x192" for icon in icons)
              and any(icon.get("sizes") == "512x512" for icon in icons)
              and any("maskable" in (icon.get("purpose") or "") for icon in icons), manifest)
        assets = page.evaluate("""async () => {
          const paths = ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];
          const out = {};
          for (const path of paths) {
            const response = await fetch(new URL(path, document.baseURI));
            // 必须读完响应体，否则中断的下载会被记成 requestfailed。
            const body = await response.arrayBuffer();
            out[path] = [response.status, response.headers.get('content-type'), body.byteLength];
          }
          out.apple = !!document.querySelector('link[rel=apple-touch-icon]');
          return out;
        }""")
        check("应用图标都可访问且为 PNG",
              assets.pop("apple") and all(status == 200 and "png" in (kind or "") and size > 500
                                          for status, kind, size in assets.values()), assets)
        # 开发服务器的产物不含 Service Worker，离线验证针对 npm run preview / Pages。
        built = page.evaluate("() => !document.querySelector('script[src*=\"@vite/client\"]')")
        if not built:
            print("SKIP Service Worker 离线验证：当前是开发服务器，请对 npm run preview 或线上成品运行", flush=True)
            return
        state = page.evaluate("""async () => { const registration = await navigator.serviceWorker.ready;
          return {scope: registration.scope, state: registration.active && registration.active.state}; }""")
        check("Service Worker 注册并激活", state["state"] == "activated", state)
        page.reload(wait_until="networkidle")
        page.wait_for_function("() => !!navigator.serviceWorker.controller")
        check("已构建产物的缓存包含应用资源", page.evaluate("async () => (await caches.keys()).some(key => key.startsWith('musicmaster-'))"))
        online_errors = list(errors)
        context.set_offline(True)
        page.reload(wait_until="domcontentloaded")
        page.wait_for_function("() => !!window.__mm", timeout=20000)
        offline = page.evaluate("""() => ({panels: document.querySelectorAll('.tab-panel').length,
          tabs: document.querySelectorAll('[role=tab]').length, heading: document.querySelector('.panel-heading h2')?.textContent,
          language: document.getElementById('langSelect')?.value, mic: !!document.getElementById('micBtn')})""")
        check("断网后仍能打开完整应用", offline["panels"] == 5 and offline["tabs"] == 5
              and offline["mic"] and offline["language"] == "zh" and bool(offline["heading"]), offline)
        context.set_offline(False)
        check("PWA 在线阶段无 JS/资源错误", not online_errors, online_errors)
    finally:
        context.close()


def desktop_functional(browser):
    context = browser.new_context(viewport={"width": 1280, "height": 900}, locale="zh-CN", permissions=["microphone"])
    context.add_init_script(CANVAS_PROBE)
    page = context.new_page()
    errors = watch_errors(page)
    try:
        ready(page, app_url(testtone="440"))
        check_navigation(page)
        upload_controls(page)
        select_tab(page, "tuner")
        settings = first_screen(page)
        check("桌面全局设置和麦克风首屏可见", all(value["visible"] and value["outsideGuide"] for value in settings.values()), settings)
        page.locator("#micBtn").click()
        page.wait_for_function("() => window.__mm.state.micOn && window.__mm.state.lastFrame?.frequency > 400")
        page.wait_for_function("() => document.querySelector('#tunerNote').textContent.startsWith('A4')")
        page.wait_for_timeout(250)
        before = page.evaluate("() => ({freq: window.__mm.state.lastFrame.frequency, labels: window.__uiCanvasTexts.pitchCurve || []})")
        page.select_option("#octaveBase", "1")
        page.wait_for_function("() => document.querySelector('#tunerNote').textContent.startsWith('A3')")
        after = page.evaluate("() => ({freq: window.__mm.state.lastFrame.frequency, labels: window.__uiCanvasTexts.pitchCurve || []})")
        check("440Hz 八度基准 A4 -> A3，物理频率不变", abs(before["freq"] - 440) < 2 and abs(after["freq"] - before["freq"]) < .1, [before["freq"], after["freq"]])
        pattern = re.compile(r"^([A-G][#b]?)(-?\d+)$")
        old_labels = [(pattern.match(label["text"]), label) for label in before["labels"] if pattern.match(label["text"])]
        new_labels = [(pattern.match(label["text"]), label) for label in after["labels"] if pattern.match(label["text"])]
        consistent = bool(old_labels) and len(old_labels) == len(new_labels) and all(
            old[0][1] == new[0][1] and int(old[0][2]) == int(new[0][2]) + 1 and abs(old[1]["y"] - new[1]["y"]) < .01
            for old, new in zip(old_labels, new_labels)
        )
        check("曲线音名同步降一八度，物理轴位置不变", consistent, [[label["text"] for _, label in old_labels], [label["text"] for _, label in new_labels]])
        for tab in TABS:
            select_tab(page, tab)
            check("全局八度跨面板保持 " + tab, page.input_value("#octaveBase") == "1" and page.evaluate("window.__mm.state.octaveBase") == 1)
        page.select_option("#langSelect", "en")
        check("语言切换为英文", page.evaluate("document.documentElement.lang") == "en")
        page.reload(wait_until="networkidle")
        page.wait_for_function("() => !!window.__mm")
        check("刷新保留语言和八度", page.input_value("#langSelect") == "en" and page.input_value("#octaveBase") == "1" and page.evaluate("window.__mm.state.octaveBase") == 1)
        page.select_option("#langSelect", "zh")
        page.select_option("#octaveBase", "0")
        page.locator("#micBtn").click()
        page.wait_for_function("() => window.__mm.state.micOn && document.querySelector('#tunerNote').textContent.startsWith('A4')")
        screenshot(page, "octave-base.png")
        select_tab(page, "karaoke")
        with tempfile.TemporaryDirectory(prefix="musicmaster-ui-") as temporary:
            tone = Path(temporary) / "ui-tone-a4.wav"
            make_tone(tone)
            with page.expect_file_chooser() as chooser:
                page.locator(".upload-field:has(#songFile) button").press("Enter")
            chooser.value.set_files(str(tone))
            page.wait_for_function("() => window.__mm.state.karaoke.fileReady && window.__mm.state.karaoke.ref?.midis.length > 100", timeout=45000)
            reference = page.evaluate("""() => {
              const ref = window.__mm.state.karaoke.ref, voiced = ref.midis.filter(value => value != null);
              return {frames: ref.midis.length, voiced: voiced.length, avg: voiced.reduce((a,b) => a+b, 0)/(voiced.length || 1)};
            }""")
            check("合成 8秒 WAV 经 Worker 提取 A4 参考线", reference["frames"] > 100 and reference["voiced"] > 100 and abs(reference["avg"] - 69) < .15, reference)
            # fileReady 早于播放器加载完成；等界面真正显示出文件名，再断言语言切换保留状态。
            page.wait_for_function("() => document.getElementById('karaokeFileInfo').textContent.includes('ui-tone-a4.wav')", timeout=15000)
            page.evaluate("() => { const k = window.__mm.state.karaoke; window.__uiLoaded = {ref: k.ref, player: k.player}; }")
            for language in ["en", "zh"]:
                page.select_option("#langSelect", language)
                retained = page.evaluate("""() => { const k = window.__mm.state.karaoke;
                  return k.fileReady && k.ref === window.__uiLoaded.ref && k.player === window.__uiLoaded.player &&
                    document.getElementById('karaokeFileInfo').textContent.includes('ui-tone-a4.wav');
                }""")
                check("上传后切换 " + language + " 保留歌曲信息/参考线", retained, page.inner_text("#karaokeFileInfo"))
            page.evaluate("""() => { window.__uiHeld = {
              canvas: document.getElementById('pitchCurve'), songInput: document.getElementById('songFile'),
              history: document.getElementById('historyList'), ref: window.__mm.state.karaoke.ref,
              file: window.__mm.state.karaoke.songFile, trail: window.__mm.state.trail,
              historyValue: localStorage.getItem('musicmaster.history.v1')
            }; }""")
            for tab in ["practice", "spectrum", "learn", "tuner", "karaoke"]:
                select_tab(page, tab)
            held = page.evaluate("""() => {
              const held = window.__uiHeld, k = window.__mm.state.karaoke;
              return {canvas: held.canvas === document.getElementById('pitchCurve'),
                input: held.songInput === document.getElementById('songFile'),
                history: held.history === document.getElementById('historyList'),
                historyValue: held.historyValue === localStorage.getItem('musicmaster.history.v1'),
                ref: held.ref === k.ref, file: held.file === k.songFile && k.songName === 'ui-tone-a4.wav',
                trail: held.trail === window.__mm.state.trail && held.trail.length > 0,
                microphone: window.__mm.state.micOn, ready: k.fileReady};
            }""")
            check("导航保留实时 DOM、音频文件/参考线/历史与麦克风", all(held.values()), held)
            page.locator("#karaokePlayBtn").click()
            page.wait_for_function("() => window.__mm.state.karaoke.player.playing")
            page.wait_for_timeout(500)
            check("开始跟唱进入播放状态", "暂停" in page.inner_text("#karaokePlayBtn"))
            check("跟唱播放启动真实麦克风采集", page.evaluate("window.__mm.state.karaoke.player.micOn"))
            for language, label in [("en", "Pause"), ("zh", "暂停")]:
                page.select_option("#langSelect", language)
                retained = page.evaluate("""() => { const k = window.__mm.state.karaoke;
                  return k.player === window.__uiLoaded.player && k.player.playing && k.player.micOn && window.__mm.state.micOn;
                }""")
                check("播放时切换 " + language + " 保留播放/录音状态", retained and label in page.inner_text("#karaokePlayBtn"), page.inner_text("#karaokePlayBtn"))
            page.evaluate("""() => {
              const k = window.__mm.state.karaoke;
              // 先验证采集已经启动，再隔离真实静音帧，单独验证满分报告。
              k.player.pause(); k.player.stopMicrophone();
              k.scorer = new k.scorer.constructor({ref: k.ref});
              for (let i = 0; i < k.ref.times.length && k.ref.times[i] <= 4; i++) k.scorer.feed(k.ref.times[i], k.ref.midis[i]);
              k.player.onEnded();
            }""")
            page.wait_for_function("() => !document.querySelector('#karaokeReport').hidden")
            report = page.evaluate("""() => { const k = window.__mm.state.karaoke, el = document.querySelector('#karaokeReport');
              return {score: k.scorer.score, inTune: k.scorer.inTune, tips: el.querySelectorAll('.k-report li').length,
                segments: el.querySelectorAll('.k-seg').length, history: document.querySelectorAll('.history-item').length};
            }""")
            check("唱准评分 >=90 且报告有分段/建议/练习历史", report["score"] >= 90 and report["inTune"] > .99 and report["tips"] >= 1 and report["segments"] >= 1 and report["history"] >= 1, report)
            history_text = page.locator("#historyList").text_content()
            for tab in ["practice", "tuner", "karaoke"]:
                select_tab(page, tab)
            check("导航保持生成的练习历史", history_text == page.locator("#historyList").text_content())
            screenshot(page, "karaoke.png")
            page.locator("#micBtn").click()
            page.wait_for_function("() => !window.__mm.state.micOn")
            stopped = page.evaluate("""() => { const held = window.__uiHeld, k = window.__mm.state.karaoke;
              return {ref: held.ref === k.ref, file: held.file === k.songFile,
                ready: k.fileReady, name: k.songName === 'ui-tone-a4.wav',
                released: !window.__mm.engine.running && !k.player.micOn,
                cleared: k.live == null && k.lastEval == null};
            }""")
            check("关麦释放采集并保留歌曲/旋律", all(stopped.values()), stopped)
            page.locator("#karaokeReport [data-seek]").first.click()
            blocked = page.evaluate("""() => { const k = window.__mm.state.karaoke;
              return !k.player.playing && !k.player.micOn && !document.getElementById('karaokeReport').hidden;
            }""")
            check("关麦后分段重唱保留报告并要求启用麦克风", blocked and "启用麦克风" in page.inner_text("#toast"), page.inner_text("#toast"))
            page.locator("#micBtn").click()
            page.wait_for_function("() => window.__mm.state.micOn")
            page.locator("#karaokeReport [data-seek]").first.click()
            page.wait_for_function("() => window.__mm.state.karaoke.player.playing && window.__mm.state.karaoke.player.micOn")
            check("重新启用后分段重唱恢复播放和采集", page.evaluate("window.__mm.state.karaoke.fileReady"))
            page.locator("#karaokeRestartBtn").click()
            page.wait_for_function("() => window.__mm.state.karaoke.player.playing && window.__mm.state.karaoke.player.micOn")
            check("重新启用后歌曲无需再上传即可重唱", page.evaluate("window.__mm.state.karaoke.fileReady"))
            page.locator("#micBtn").click()
            page.wait_for_function("() => !window.__mm.state.micOn && !window.__mm.state.karaoke.player.micOn")
            saved_history = page.evaluate("localStorage.getItem('musicmaster.history.v1')")
            page.reload(wait_until="networkidle")
            page.wait_for_function("() => !!window.__mm")
            check("刷新保留已生成的练习历史", saved_history == page.evaluate("localStorage.getItem('musicmaster.history.v1')") and page.locator(".history-item").count() >= 1)
        check("桌面成品无 JS/资源错误", not errors, errors)
    finally:
        context.close()


def responsive(browser, name, width, height, mobile):
    context = browser.new_context(viewport={"width": width, "height": height}, locale="zh-CN", is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1)
    page = context.new_page()
    errors = watch_errors(page)
    try:
        ready(page)
        for language in ["zh", "en"]:
            page.select_option("#langSelect", language)
            for tab in TABS:
                select_tab(page, tab)
                prefix = name + " " + language + " " + tab
                settings = first_screen(page)
                check(prefix + " 设置/麦克风首屏可达", all(item["visible"] and item["outsideGuide"] for item in settings.values()), settings)
                layout = layout_details(page)
                check(prefix + " 页面/画布无横向溢出", layout["scrollWidth"] <= layout["width"] + 2 and not layout["bad"] and not layout["canvases"], layout)
                check(prefix + " 主要触控目标 >=32px", not layout["small"], layout["small"])
                if language == "en":
                    content = english_content(page)
                    check(prefix + " 完整英文，无翻译键泄漏", not content["chinese"] and not content["keys"], content)
                # 展开后的说明同样应适配；设置仍在折叠区外。
                details = page.locator(f"#tab-{tab} details")
                for index in range(details.count()):
                    details.nth(index).evaluate("el => el.open = true")
                expanded = layout_details(page)
                check(prefix + " 展开说明无横向溢出", expanded["scrollWidth"] <= expanded["width"] + 2 and not expanded["bad"], expanded)
                for index in range(details.count()):
                    details.nth(index).evaluate("el => el.open = false")
                if name == "phone-393" and language == "zh" and tab in ["tuner", "karaoke"]:
                    screenshot(page, "mobile-" + tab + ".png")
                if name == "desktop" and language == "en" and tab == "learn":
                    screenshot(page, "en-lessons.png")
            page.screenshot(path=str(Path(tempfile.gettempdir()) / f"musicmaster-ui-{name}-{language}.png"), full_page=False)
        check(name + " 无 JS/资源错误", not errors, errors)
    finally:
        context.close()


def permission_recovery(browser):
    context = browser.new_context(viewport={"width": 1280, "height": 900}, locale="zh-CN")
    page = context.new_page()
    errors = watch_errors(page)
    try:
        ready(page)
        session = context.new_cdp_session(page)
        target = session.send("Target.getTargetInfo")["targetInfo"]
        origin = urlsplit(BASE).scheme + "://" + urlsplit(BASE).netloc
        permission = {"permission": {"name": "microphone"}, "origin": origin, "browserContextId": target["browserContextId"]}
        session.send("Browser.setPermission", {**permission, "setting": "denied"})
        check("浏览器麦克风权限实际为 denied", page.evaluate("async () => (await navigator.permissions.query({name: 'microphone'})).state") == "denied")
        page.locator("#micBtn").click()
        page.wait_for_function("() => !document.querySelector('#micBtn').disabled && !document.querySelector('#toast').hidden")
        denied_errors = list(errors)
        check("拒绝权限后按钮恢复，可读提示", not page.evaluate("window.__mm.state.micOn") and "listening" not in (page.locator("#micBtn").get_attribute("class") or "") and "拒绝" in page.inner_text("#toast"), page.inner_text("#toast"))
        check("权限拒绝只产生预期 NotAllowedError", all("NotAllowedError" in error or "Permission denied" in error for error in denied_errors), denied_errors)
        errors.clear()
        session.send("Browser.setPermission", {**permission, "setting": "granted"})
        page.locator("#micBtn").click()
        page.wait_for_function("() => window.__mm.state.micOn && window.__mm.engine.running", timeout=15000)
        check("重新授权后同一页面可启用麦克风", not page.locator("#micBtn").is_disabled() and "listening" in page.locator("#micBtn").get_attribute("class"))
        page.locator("#micBtn").click()
        page.wait_for_function("() => !window.__mm.state.micOn")
        check("恢复后可以正常停止麦克风", not page.evaluate("window.__mm.engine.running"))
        check("权限恢复无额外 JS/资源错误", not errors, errors)
    finally:
        context.close()


def main():
    print("UI base:", BASE, flush=True)
    with sync_playwright() as playwright:
        executable = chromium_executable()
        print("Chromium:", executable or "Playwright default", flush=True)
        launch = {"headless": True, "args": ["--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"]}
        if executable:
            launch["executable_path"] = executable
        browser = playwright.chromium.launch(**launch)
        try:
            run_case("桌面音频与键盘流程", lambda: desktop_functional(browser))
            run_case("页头语言与安装入口", lambda: header_and_install(browser))
            for name, width, height, mobile in VIEWPORTS:
                run_case(name + " 响应式双语流程", lambda name=name, width=width, height=height, mobile=mobile: responsive(browser, name, width, height, mobile))
            run_case("真实权限拒绝与恢复", lambda: permission_recovery(browser))
            run_case("PWA 安装与离线启动", lambda: pwa_installable(browser))
        finally:
            browser.close()
    print(f"UI {'OK' if failed == 0 else 'FAILED'} ({passed} pass, {failed} fail)", flush=True)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
