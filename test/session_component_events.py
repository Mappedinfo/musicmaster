"""本地录音组件事件边界；仅生成临时合成 WAV，拦截控制器动作，不写历史数据库。"""
import json
import math
import struct
import tempfile
import wave
from pathlib import Path

from playwright.sync_api import sync_playwright
import ui_smoke as ui


def make_tone(path, frequency):
    with wave.open(str(path), 'wb') as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(16000)
        output.writeframes(b''.join(struct.pack('<h', round(.4 * math.sin(2 * math.pi * frequency * i / 16000) * 32767)) for i in range(80000)))


def snapshot(page, status, *, persistent=False, audio_persistent=False, item_status='ready', retry=False):
    page.evaluate("""state => window.dispatchEvent(new CustomEvent('musicmaster:session-state', {detail:state}))""", {
        'status': status, 'currentId': 'ui-session', 'sessions': [{
            'id': 'ui-session', 'createdAt': '2026-10-10T00:00:00.000Z', 'songName': 'UI test',
            'durationSec': 5, 'status': item_status, 'persistent': persistent, 'audioPersistent': audio_persistent, 'canRetry': retry,
        }],
    })


def exercise(page, folder):
    ui.ready(page)
    page.locator('#langSelect').select_option('zh')
    ui.select_tab(page, 'karaoke')
    page.wait_for_timeout(150)
    snapshot(page, 'readyMemory')
    ui.check('首次保存失败不声称已保存', '仅本页' in page.locator('.k-session-meta small').inner_text() and '暂留本页' in page.locator('#karaokeSessionStatus').inner_text())
    snapshot(page, 'readyMemory', audio_persistent=True)
    ui.check('复盘写入失败区分已保存的音频', '录音已保存' in page.locator('#karaokeSessionStatus').inner_text() and '最新复盘仅本页' in page.locator('.k-session-meta small').inner_text())
    snapshot(page, 'analyzingMemory', audio_persistent=True, item_status='analyzing')
    ui.check('已有落盘音频重试时不误称仅本页', '录音已保存' in page.locator('#karaokeSessionStatus').inner_text())
    snapshot(page, 'error', audio_persistent=True, item_status='error')
    ui.check('分析失败不误称已经生成报告', '录音已保存' in page.locator('.k-session-meta small').inner_text() and '最新复盘仅本页' not in page.locator('.k-session-meta small').inner_text())
    page.locator('[data-session-action=delete]').click()
    ui.check('点删除先确认、不触发删除动作', page.evaluate('window.__sessionActions.length') == 0)
    page.locator('[data-session-action=cancel-delete]').click()
    ui.check('取消删除不触发控制器动作', page.evaluate('window.__sessionActions.length') == 0)
    page.locator('[data-session-action=delete]').click()
    page.locator('[data-session-action=confirm-delete]').click()
    ui.check('确认删除只派发用户指定会话', page.evaluate('window.__sessionActions.at(-1)') == {'action': 'delete', 'id': 'ui-session'})
    snapshot(page, 'idle', persistent=True, audio_persistent=True, item_status='analyzing', retry=True)
    page.locator('[data-session-action=retry]').click()
    ui.check('刷新中断的分析可以重试', page.evaluate('window.__sessionActions.at(-1).action') == 'retry')

    page.locator('#reviewModeBtn').click()
    page.evaluate("""bytes => {
      window.__testSessionFile = new File([new Uint8Array(bytes)], 'session.wav', {type:'audio/wav'});
      window.dispatchEvent(new CustomEvent('musicmaster:open-session', {detail:{sessionId:'ui-open',vocalFile:window.__testSessionFile,sourceKind:'mixed',status:'error',offsetSec:12}}));
    }""", list((folder / 'session.wav').read_bytes()))
    page.wait_for_function("() => !document.querySelector('.review-source [role=status]')")
    ui.check('历史原始混合声音不自动标干声', page.locator('#reviewVocalKind').input_value() == 'mixed')
    ui.check('截取跟唱保留起点偏移并关闭覆盖', page.locator('#reviewOffset').input_value() == '12' and not page.locator('#reviewAutoOffset').is_checked())
    ui.check('没有报告仍可显式分析录音', page.locator('#reviewAnalyzeBtn').is_enabled())
    page.locator('#reviewAnalyzeBtn').click()
    page.wait_for_function("() => !!document.querySelector('#reviewReport') && !document.querySelector('#reviewCancelBtn')")
    ui.check('会话分析结果发可核对的回写事件', page.evaluate("window.__sessionReports.length === 1 && window.__sessionReports[0].id === 'ui-open' && window.__sessionReports[0].hash.length === 64"))
    page.locator('#reviewVocalFile').set_input_files(str(folder / 'new-upload.wav'))
    page.wait_for_function("() => !document.querySelector('.review-source [role=status]')")
    page.evaluate("window.dispatchEvent(new CustomEvent('musicmaster:session-deleted',{detail:{sessionId:'ui-open'}}))")
    ui.check('删除旧会话清报告但保留后来上传的文件', page.locator('#reviewReport').count() == 0 and 'new-upload.wav' in page.locator('.review-filename').first.inner_text() and page.locator('#reviewAudio').count() == 1)
    page.evaluate("window.dispatchEvent(new CustomEvent('musicmaster:open-session',{detail:{sessionId:'ui-clear',vocalFile:window.__testSessionFile,sourceKind:'vocal',status:'error'}}))")
    page.wait_for_function("() => !document.querySelector('.review-source [role=status]')")
    page.evaluate("window.dispatchEvent(new CustomEvent('musicmaster:session-deleted',{detail:{sessionId:'ui-clear'}}))")
    ui.check('删除当前会话释放录音与回听引用', page.locator('#reviewAudio').count() == 0 and page.locator('#reviewReport').count() == 0 and not page.locator('#reviewAnalyzeBtn').is_enabled())

    page.evaluate("""bytes => window.dispatchEvent(new CustomEvent('musicmaster:open-session',{detail:{
      sessionId:'ui-gap',vocalFile:window.__testSessionFile,referenceFile:new File([new Uint8Array(bytes)],'reference.wav',{type:'audio/wav'}),
      sourceKind:'vocal',referenceKind:'vocal',status:'error',capture:{incomplete:true},offsetSec:0
    }}))""", list((folder / 'new-upload.wav').read_bytes()))
    page.wait_for_function("() => !document.querySelector('.review-source [role=status]')")
    page.locator('#reviewAlignment').check()
    page.locator('#reviewAnalyzeBtn').click()
    page.wait_for_function("() => !!document.querySelector('#reviewReport') && !document.querySelector('#reviewCancelBtn')")
    ui.check('同源重新分析保留采集缺口事实', page.evaluate("window.__sessionReports.at(-1).report.metadata.capture.incomplete && window.__sessionReports.at(-1).report.quality.reasons.includes('captureIncomplete')"))
    ui.check('不完整录音撤销已确认参考的定量评分与假设', page.evaluate("window.__sessionReports.at(-1).report.comparison.status === 'rejected' && window.__sessionReports.at(-1).report.comparison.score === null && window.__sessionReports.at(-1).report.comparison.alignmentTrusted === false && window.__sessionReports.at(-1).report.hypotheses.length === 0") and page.locator('.review-score').count() == 0)
    legacy = page.evaluate("""() => {
      const report=structuredClone(window.__sessionReports.at(-1).report);
      report.quality.status='ok'; report.quality.reasons=[]; report.summary.hypothesisReasons=[];
      Object.assign(report.comparison,{status:'ready',reasons:[],alignmentTrusted:true,score:90,inTuneRatio:.9,medianCents:0,octaveDifferenceRatio:0,octaveUpRatio:0,octaveDownRatio:0});
      return report;
    }""")
    legacy_path = folder / 'legacy-capture.json'
    legacy_path.write_text(json.dumps(legacy))
    page.locator('#reviewReportFile').set_input_files(str(legacy_path))
    page.wait_for_function("() => document.querySelector('.review-status')?.textContent.includes('报告已导入')")
    ui.check('旧可信报告导入后也撤销缺口录音评分', page.locator('.review-score').count() == 0 and page.locator('#reviewReport').get_attribute('data-quality') == 'limited')
    page.locator('#reviewVocalFile').set_input_files(str(folder / 'new-upload.wav'))
    page.wait_for_function("() => !document.querySelector('.review-source [role=status]')")
    page.locator('#reviewVocalKind').select_option('vocal')
    page.locator('#reviewAnalyzeBtn').click()
    page.wait_for_function("() => document.querySelector('#reviewReport')?.dataset.stale === 'false' && !document.querySelector('#reviewCancelBtn')")
    with page.expect_download() as downloaded:
        page.locator('#reviewExportBtn').click()
    output_path = folder / 'new-upload-report.json'
    downloaded.value.save_as(output_path)
    independent = json.loads(output_path.read_text())
    ui.check('替换演唱文件不继承旧采集缺口', 'capture' not in independent['metadata'] and 'captureIncomplete' not in independent['quality']['reasons'])
    page.evaluate("window.dispatchEvent(new CustomEvent('musicmaster:session-deleted',{detail:{sessionId:'ui-gap'}}))")
    ui.check('删除旧参考会话清除其派生报告、保留独立演唱', page.locator('#reviewReport').count() == 0 and 'new-upload.wav' in page.locator('.review-filename').first.inner_text() and page.locator('#reviewAudio').count() == 1)


with tempfile.TemporaryDirectory(prefix='musicmaster-component-') as temporary, sync_playwright() as playwright:
    folder = Path(temporary)
    make_tone(folder / 'session.wav', 220)
    make_tone(folder / 'new-upload.wav', 330)
    browser = playwright.chromium.launch(executable_path=ui.chromium_executable(), headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 900})
    page.add_init_script("""window.__sessionActions=[]; window.__sessionReports=[];
      window.addEventListener('musicmaster:session-action', e=>{window.__sessionActions.push(e.detail);e.stopImmediatePropagation()},true);
      window.addEventListener('musicmaster:session-report', e=>{window.__sessionReports.push({id:e.detail.sessionId,hash:e.detail.sourceHash,report:e.detail.report});e.stopImmediatePropagation()},true);""")
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    ui.run_case('本地录音组件事件', lambda: exercise(page, folder))
    ui.check('组件事件无浏览器错误', not errors, errors)
    browser.close()
print(f'SESSION-COMPONENT {"OK" if ui.failed == 0 else "FAILED"} ({ui.passed} pass, {ui.failed} fail)')
raise SystemExit(0 if ui.failed == 0 else 1)
