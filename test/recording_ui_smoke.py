# -*- coding: utf-8 -*-
"""录音复盘回归。仅用临时生成音频；BASE_URL 支持开发、构建预览与 Pages。

RUN_OFFLINE=1 要求已构建的 PWA；SCREENSHOT_DIR 指定合成结果截图目录。
"""
import json
import math
import os
from pathlib import Path
import struct
import tempfile
import wave

from playwright.sync_api import sync_playwright
import ui_smoke as ui


def tone(path, seconds=5, frequency=220, phase=0, fading=False):
    rate = 16000
    data = bytearray()
    angle = phase
    for index in range(round(seconds * rate)):
        t = index / rate
        angle += 2 * math.pi * (frequency - (8 * t / seconds if fading else 0)) / rate
        amplitude = .4 * (1 - .88 * t / seconds) if fading else .35
        value = amplitude * (math.sin(angle) + .15 * math.sin(2 * angle))
        data.extend(struct.pack('<h', round(value * 32767)))
    with wave.open(str(path), 'wb') as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(rate)
        output.writeframes(data)


def melody(path, delay=0, gain=1):
    rate, seconds = 16000, 24
    notes = [57,62,59,65,60,58,64,61,67,59,63,57,66,60,62,58,
             65,59,61,64,57,63,60,67,58,62,66,59,64,61,57,65]
    data = bytearray()
    for index in range(round((seconds+delay)*rate)):
        t = index/rate-delay
        note = math.floor(t/.75)
        local = t-note*.75
        frequency = 440*2**((notes[max(0,min(31,note))]-69)/12)
        value = gain*.3*math.sin(2*math.pi*frequency*local) if 0 <= t < seconds and .07 < local < .65 else 0
        data.extend(struct.pack('<h', round(value*32767)))
    with wave.open(str(path), 'wb') as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(rate)
        output.writeframes(data)


def select_review(page):
    ui.select_tab(page, 'karaoke')
    page.locator('#reviewModeBtn').click()
    page.locator('#recordingReview').wait_for(state='visible')


def choose(page, role, path, kind='vocal'):
    page.locator('#review' + role + 'File').set_input_files(str(path))
    page.wait_for_function("() => !document.querySelector('.review-source [role=status]')")
    page.locator('#review' + role + 'Kind').select_option(kind)


def analyze(page):
    page.locator('#reviewAnalyzeBtn').click()
    page.wait_for_function("() => document.querySelector('#reviewReport')?.dataset.stale === 'false' && !document.querySelector('#reviewCancelBtn')", timeout=60000)


def export(page, path):
    with page.expect_download() as download:
        page.locator('#reviewExportBtn').click()
    download.value.save_as(path)
    return json.loads(Path(path).read_text())


PROBE = """(() => {
  window.__reviewMicCalls = 0; window.__holdReviewWorker = false;
  if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => {
    window.__reviewMicCalls++; return Promise.reject(new Error('test microphone denied'));
  };
  const NativeWorker = window.Worker;
  window.Worker = class extends NativeWorker {
    postMessage(...args) {
      if (window.__holdReviewWorker) setTimeout(() => super.postMessage(...args), 1000);
      else super.postMessage(...args);
    }
  };
})()"""


def exercise(page, folder):
    vocal, reference, long, wrong = [folder / name for name in ['vocal.wav', 'reference.wav', 'long.wav', 'wrong.wav']]
    tone(vocal, fading=True)
    tone(reference, frequency=217, phase=.15)
    tone(long, seconds=75)
    tone(wrong, frequency=330)
    broken = folder / 'broken.wav'
    broken.write_text('invalid audio')
    report_path = folder / 'report.json'
    ui.ready(page)
    if 'localhost' in ui.BASE or '127.0.0.1' in ui.BASE:
        fixture = ui.ROOT / 'stems/private/recording-ui-deny-probe.json'
        fixture.parent.mkdir(parents=True, exist_ok=True)
        fixture.write_text('{"synthetic":true}')
        try:
            response = page.request.get(ui.BASE + 'stems/private/recording-ui-deny-probe.json')
            ui.check('开发/预览服务不能提供私人产物', response.status != 200 or 'synthetic' not in response.text())
        finally:
            fixture.unlink()
    select_review(page)
    top = page.locator('#reviewAnalyzeBtn').bounding_box()
    ui.check('分析设置与按钮默认展开', top is not None and not page.locator('#reviewAnalyzeBtn').evaluate('e => !!e.closest("details")'))
    page.locator('#reviewVocalFile').set_input_files(str(vocal))
    page.wait_for_function("() => !document.querySelector('.review-source [role=status]')")
    page.locator('#reviewAnalyzeBtn').click()
    ui.check('未知声源要求确认', page.locator('.review-notice').count() == 1 and page.locator('#reviewReport').count() == 0)
    page.locator('#reviewVocalKind').select_option('vocal')
    analyze(page)
    report = export(page, str(report_path))
    ui.check('真实 Worker 无参考报告可导出', report['schemaVersion'] == 1 and report['quality']['effectiveVoicedSec'] > 3 and 'comparison' not in report)
    ui.check('音频身份绑定且不调用麦克风', len(report['metadata']['audioIdentity']['sha256']) == 64 and page.evaluate('window.__reviewMicCalls') == 0)
    page.locator('#reviewCanvas').focus()
    page.keyboard.press('ArrowRight')
    ui.check('曲线键盘定位同步音频', page.locator('#reviewCanvas').get_attribute('aria-valuenow') == '1' and abs(page.locator('#reviewAudio').evaluate('e => e.currentTime') - 1) < .1)
    page.locator('.review-details summary').click()
    page.locator('.review-segment-table button').first.click()
    page.wait_for_function("() => !document.querySelector('#reviewAudio').paused")
    page.locator('#reviewLoop').check()
    page.locator('#reviewAudio').evaluate('e => { e.currentTime=e.duration-.01; e.dispatchEvent(new Event("timeupdate")); }')
    page.wait_for_timeout(200)
    ui.check('片段循环试听', page.locator('#reviewAudio').evaluate('e => e.currentTime < 1 && !e.paused'))
    page.locator('#liveModeBtn').click()
    ui.check('切换模式停止试听', page.locator('#reviewAudio').evaluate('e => e.paused'))
    page.locator('#reviewModeBtn').click()
    choose(page, 'Reference', reference)
    analyze(page)
    untrusted = export(page, str(folder / 'untrusted.json'))
    ui.check('未验证偏移不提供分数', untrusted['comparison']['score'] is None and 'alignmentUntrusted' in untrusted['comparison']['reasons'])
    page.locator('#reviewAlignment').check()
    analyze(page)
    paired = export(page, str(folder / 'paired.json'))
    ui.check('可信独立参考使用共同口径', paired['comparison']['status'] == 'ready' and paired['comparison']['scoreMetric'] == 'pairedPitchHitPercent')
    choose(page, 'Reference', vocal)
    page.locator('#reviewAlignment').check()
    analyze(page)
    identical = export(page, str(folder / 'identical.json'))
    ui.check('同文件不能自己给自己评分', identical['comparison']['score'] is None and 'selfComparison' in identical['comparison']['reasons'])
    # 重新载入页面后只有报告、没有音频，仍能阅读。
    page.reload(wait_until='networkidle')
    select_review(page)
    page.locator('#reviewReportFile').set_input_files(str(report_path))
    page.locator('#reviewCanvas').wait_for()
    ui.check('无音频导入报告仍能查看', page.locator('#reviewReport').count() == 1 and page.locator('#reviewAudio').count() == 0)
    choose(page, 'Vocal', vocal)
    page.wait_for_function("() => document.querySelector('.review-audio-match')?.dataset.matched === 'true'")
    ui.check('补选同一音频恢复试听', page.locator('#reviewExportBtn').is_enabled())
    choose(page, 'Vocal', wrong)
    ui.check('换错文件标记旧报告', page.locator('#reviewReport').get_attribute('data-stale') == 'true')
    choose(page, 'Vocal', vocal)
    page.wait_for_function("() => document.querySelector('.review-audio-match')?.dataset.matched === 'true'")
    ui.check('重新选对文件恢复报告', page.locator('#reviewReport').get_attribute('data-stale') == 'false')
    bad_report = folder / 'bad.json'
    bad_report.write_text('{"schemaVersion":1,"metadata":{}}')
    page.locator('#reviewReportFile').set_input_files(str(bad_report))
    page.locator('.review-notice').wait_for()
    ui.check('坏报告保留已验证结果', page.locator('#reviewCanvas').count() == 1 and page.locator('#reviewExportBtn').is_enabled())
    choose(page, 'Vocal', broken)
    page.locator('#reviewAnalyzeBtn').click()
    page.locator('.review-notice').wait_for()
    ui.check('解码错误可见且没有覆盖结果', page.locator('#reviewReport').get_attribute('data-stale') == 'true' and page.locator('#reviewCancelBtn').count() == 0)
    choose(page, 'Vocal', long)
    page.evaluate('window.__holdReviewWorker = true')
    page.locator('#reviewAnalyzeBtn').click()
    page.locator('#reviewCancelBtn').click()
    page.wait_for_timeout(1200)
    ui.check('取消任务不覆盖旧报告', page.locator('#reviewCancelBtn').count() == 0 and page.locator('#reviewReport').get_attribute('data-stale') == 'true')
    page.locator('#reviewAnalyzeBtn').click()
    page.locator('#reviewCancelBtn').wait_for()
    choose(page, 'Vocal', vocal)
    page.evaluate('window.__holdReviewWorker = false')
    analyze(page)
    page.wait_for_timeout(1200)
    replaced = export(page, str(folder / 'replaced.json'))
    ui.check('替换文件后旧任务不能写回', replaced['metadata']['audioIdentity']['name'] == 'vocal.wav' and replaced['metadata']['durationSec'] < 6)
    performance, shifted = folder/'melody.wav', folder/'shifted.wav'
    melody(performance)
    melody(shifted, delay=.7, gain=1.05)
    choose(page, 'Vocal', performance)
    choose(page, 'Reference', shifted)
    page.locator('#reviewAutoOffset').check()
    analyze(page)
    estimated = export(page, str(folder/'estimated.json'))
    ui.check('自动估计候选偏移但不评分', estimated['comparison']['alignmentEstimate']['status'] == 'estimated'
             and abs(estimated['comparison']['offsetSec']-.7)<.12 and estimated['comparison']['score'] is None)
    ui.check('候选锚点成对试听可用', page.locator('.review-alignment-anchors button').count() == 6)
    page.locator('.review-alignment-anchors button').nth(1).click()
    page.wait_for_function("() => !document.querySelector('#reviewAudio').paused")
    ui.check('切换到参考片段持续播放', page.locator('#reviewPreviewTrack').input_value() == 'reference')
    ui.select_tab(page, 'learn')
    select_review(page)
    page.locator('#langSelect').select_option('en')
    english = ui.english_content(page)
    # 文件名是用户内容，vocal.wav 不是丢失的翻译键。
    english['keys'] = [key for key in english['keys'] if not key.lower().endswith(('.wav','.m4a','.mp3','.flac','.ogg','.aac'))]
    ui.check('复盘双语无缺键与中文残留', not english['chinese'] and not english['keys'], english)
    page.locator('#langSelect').select_option('zh')
    page.locator('#octaveBase').select_option('1')
    page.locator('#reviewCanvas').focus()
    page.keyboard.press('Home')
    page.locator('#reviewAudio').evaluate('e => e.play()')
    ui.select_tab(page, 'learn')
    ui.check('离开 K歌 停止播放', page.locator('#reviewAudio').evaluate('e => e.paused'))
    select_review(page)
    for width, height in [(320,568),(375,667),(1280,900)]:
        page.set_viewport_size({'width':width,'height':height})
        page.wait_for_timeout(120)
        layout = ui.layout_details(page)
        ui.check(f'复盘 {width}px 不溢出且可触控', layout['scrollWidth'] <= width+1 and not layout['bad'] and not layout['canvases'] and not layout['small'], layout)
    if os.environ.get('SCREENSHOT_DIR'):
        page.locator('#toast').wait_for(state='hidden')
        ui.SCREENSHOTS.mkdir(parents=True, exist_ok=True)
        page.evaluate('() => window.scrollTo(0, 0)')
        page.screenshot(path=str(ui.SCREENSHOTS/'recording-review.png'), full_page=True)
    ui.check('录音流程未调用麦克风', page.evaluate('window.__reviewMicCalls') == 0)


def offline(page, context, folder):
    page.wait_for_function('() => !!navigator.serviceWorker.controller', timeout=15000)
    context.set_offline(True)
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function('() => !!window.__mm')
    select_review(page)
    choose(page, 'Vocal', folder/'vocal.wav')
    analyze(page)
    ui.check('PWA 离线重载、解码与 Worker 分析', page.locator('#reviewReport').get_attribute('data-quality') != 'insufficient')
    context.set_offline(False)


with tempfile.TemporaryDirectory(prefix='musicmaster-ui-') as temporary, sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path=ui.chromium_executable(), headless=True)
    context = browser.new_context(viewport={'width':1280,'height':900}, accept_downloads=True)
    context.add_init_script(PROBE)
    page = context.new_page()
    errors, outbound = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: outbound.append(request.url) if request.method not in ['GET','HEAD'] else None)
    folder = Path(temporary)
    ui.run_case('录音复盘场景', lambda: exercise(page, folder))
    if os.environ.get('RUN_OFFLINE') == '1':
        ui.run_case('PWA 离线', lambda: offline(page, context, folder))
    ui.check('没有浏览器运行错误', not errors, errors)
    ui.check('没有音频上传请求', not outbound, outbound)
    browser.close()
print(f'RECORDING-UI {"OK" if ui.failed == 0 else "FAILED"} ({ui.passed} pass, {ui.failed} fail)')
raise SystemExit(0 if ui.failed == 0 else 1)
