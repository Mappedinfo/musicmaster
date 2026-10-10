# -*- coding: utf-8 -*-
"""实时演唱验收：仅用临时合成声，真实 Chromium fake microphone，不启动服务器。

先启动开发或构建预览，再运行：
  BASE_URL=http://localhost:8902 uv run --with playwright python test/live_session_ui.py
RUN_OFFLINE=1 追加已构建 PWA 的离线录制/完整 Worker 复盘。
教练方向提示另用 onFrame 注入，只验证 UI 接线；不冒充真实波形录制证据。
"""
import argparse
import hashlib
import math
import os
from pathlib import Path
import statistics
import struct
import tempfile
import time
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright
import ui_smoke as ui

ERRORS, UPLOADS, EXTERNAL = [], [], []


def watch_context(context):
    context.on('page', lambda page: page.on('pageerror', lambda error: ERRORS.append(str(error))))
    host = urlsplit(ui.BASE).netloc
    def request(request):
        if request.method not in ['GET', 'HEAD']:
            UPLOADS.append(request.method + ' ' + request.url)
        parsed = urlsplit(request.url)
        if parsed.scheme in ['http', 'https'] and parsed.netloc != host:
            EXTERNAL.append(request.url)
    context.on('request', request)


SESSION_SNAPSHOT = """async () => {
  const open = indexedDB.open('musicmaster-local-sessions-v1', 1);
  const db = await new Promise((resolve, reject) => {open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);});
  try {
    const request=db.transaction('sessions','readonly').objectStore('sessions').getAll();
    const sessions=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    return sessions.map(s=>({id:s.id,createdAt:s.createdAt,status:s.status,songName:s.songName,durationSec:s.durationSec,
      sourceKind:s.sourceKind,audioBytes:s.audioBlob?.size,audioType:s.audioBlob?.type,capture:s.capture,
      report:s.report?{schemaVersion:s.report.schemaVersion,sourceKind:s.report.metadata?.sourceKind,durationSec:s.report.metadata?.durationSec,
        frames:s.report.frames?.length,effectiveVoicedSec:s.report.quality?.effectiveVoicedSec,quality:s.report.quality,
        issues:s.report.issues?.length,hypotheses:s.report.hypotheses?.length,comparison:s.report.comparison,
        audioIdentity:s.report.metadata?.audioIdentity,parameters:s.report.parameters}:null}));
  } finally {db.close();}
}"""


def sessions(page):
    return page.evaluate(SESSION_SNAPSHOT)


def ready_live(page):
    ui.ready(page)
    page.locator('#langSelect').select_option('zh')
    ui.select_tab(page, 'karaoke')
    page.locator('#liveModeBtn').click()
    page.locator('#karaokeLive').wait_for(state='visible')
    page.wait_for_function('() => !!window.__mm.state.karaoke.sessions')


def load_song(page, path, speaker=False):
    page.locator('#liveModeBtn').click()
    page.locator('#karaokeEcho').set_checked(speaker)
    page.locator('#karaokeAutoRecord').check()
    page.locator('#songFile').set_input_files(str(path))
    page.wait_for_function('() => window.__mm.state.karaoke.fileReady', timeout=45000)
    if not page.evaluate('window.__mm.state.micOn'):
        page.locator('#micBtn').click()
        page.wait_for_function('() => window.__mm.state.micOn && window.__mm.engine.running', timeout=15000)


def start(page):
    page.locator('#karaokePlayBtn').click()
    page.wait_for_function('() => window.__mm.state.karaoke.player.playing && !!window.__mm.state.karaoke.sessions.active', timeout=15000)
    return page.evaluate('window.__mm.state.karaoke.sessions.active.id')


def wait_ready(page, identifiers, auto_open=False):
    try:
        page.wait_for_function("""ids => {
          const k=window.__mm.state.karaoke;
          return ids.every(id=>k.sessions.sessions.some(s=>s.id===id&&s.status==='ready'&&s.persistent===true));
        }""", arg=identifiers, timeout=60000)
    except Exception:
        print('WAIT-READY STATE', page.evaluate("() => {const k=window.__mm?.state.karaoke;return {fileReady:k?.fileReady,player:{playing:k?.player?.playing,currentTime:k?.player?.currentTime,micOn:k?.player?.micOn,takeActive:k?.player?.takeActive,takeState:k?.player?.takeState,takeId:k?.player?.takeId},controller:k?.sessions?.status,error:k?.sessions?.errorKey,currentId:k?.sessions?.currentId,active:k?.sessions?.active?.id,jobs:k?.sessions?[...k.sessions.jobs.keys()]:[],sessions:k?.sessions?.sessions};}"), flush=True)
        raise
    if auto_open:
        page.locator('#recordingReview').wait_for(state='visible')
        page.locator('#reviewReport').wait_for(state='visible')
    return [s for s in sessions(page) if s['id'] in identifiers]


def session_row(page, identifier):
    return page.locator(f'.k-session-item[data-session-id="{identifier}"]')


def delete_all(page):
    for session in sessions(page):
        row = session_row(page, session['id'])
        row.locator('[data-session-action=delete]').click()
        row.locator('[data-session-action=confirm-delete]').click()
        row.wait_for(state='detached')
    ui.check('本机删除清除 IndexedDB 录音与报告', sessions(page) == [])


def wav_details(path):
    """读取真实下载 WAV 的样本，而非页面注入的 MIDI。支持 PCM16/32 和 float32。"""
    raw = Path(path).read_bytes()
    assert raw[:4] == b'RIFF' and raw[8:12] == b'WAVE', '下载内容不是 WAV'
    offset, format_data, data = 12, None, None
    while offset + 8 <= len(raw):
        key, size = raw[offset:offset + 4], struct.unpack_from('<I', raw, offset + 4)[0]
        block = raw[offset + 8:offset + 8 + size]
        if key == b'fmt ':
            format_data = struct.unpack_from('<HHIIHH', block)
        elif key == b'data':
            data = block
        offset += 8 + size + size % 2
    assert format_data and data, 'WAV 缺少 fmt/data'
    encoding, channels, rate, _, align, bits = format_data
    assert channels == 1 and align == channels * bits // 8, '录音应为单声道'
    assert len(data) % align == 0, 'WAV 数据长度与采样格式不符'
    if encoding == 1 and bits == 16:
        values = [v[0] / 32768 for v in struct.iter_unpack('<h', data)]
    elif encoding == 1 and bits == 32:
        values = [v[0] / 2**31 for v in struct.iter_unpack('<i', data)]
    elif encoding == 3 and bits == 32:
        values = [v[0] for v in struct.iter_unpack('<f', data)]
    else:
        raise AssertionError(f'未支持的 WAV 格式 {encoding}/{bits}')
    assert all(math.isfinite(v) for v in values), 'WAV 有非有限采样'
    middle = values[len(values)//4:len(values)*3//4]
    rms = math.sqrt(sum(v*v for v in middle) / max(1, len(middle)))
    crossings = [i for i in range(1, len(middle)) if middle[i-1] <= 0 < middle[i]]
    periods = [b-a for a, b in zip(crossings, crossings[1:]) if b > a]
    central = statistics.median(periods) if periods else 0
    regular = [p for p in periods if .8*central <= p <= 1.2*central]
    frequency = rate / statistics.mean(regular) if regular else 0
    return {'durationSec': len(values)/rate, 'sampleRate': rate, 'rms': rms, 'frequency': frequency,
            'byteLength': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}


def true_recording(page, folder):
    ready_live(page)
    song = folder/'song-330hz-6s.wav'
    ui.make_tone(song, frequency=330, seconds=6)
    load_song(page, song)
    identifier = start(page)
    page.wait_for_function('() => window.__mm.state.karaoke.live?.voiced && Math.abs(window.__mm.state.karaoke.live.midi-69)<.15', timeout=15000)
    observed = page.evaluate('() => ({midi:window.__mm.state.karaoke.live.midi,level:window.__mm.state.karaoke.live.level,clarity:window.__mm.state.karaoke.live.clarity})')
    ui.check('真实 fake-device 波形经过麦克风/YIN onFrame', abs(observed['midi']-69) < .15 and observed['level'] > .01 and observed['clarity'] > .8, observed)
    saved = wait_ready(page, [identifier], auto_open=True)[0]
    report = saved['report']
    ui.check('唱完自动保存 Blob 并调用完整 Worker', saved['audioBytes'] > 10000 and report and report['schemaVersion'] == 1 and report['frames'] > 100 and report['effectiveVoicedSec'] > 3, {k:saved[k] for k in ['durationSec','status','sourceKind','audioBytes']})
    ui.check('完整报告与音频身份关联，原混音参考不评分', report['audioIdentity']['byteLength'] == saved['audioBytes'] and report['comparison']['score'] is None and 'sourceUnverified' in report['comparison']['reasons'])
    with page.expect_download() as download:
        session_row(page, identifier).locator('[data-session-action=download]').click()
    path = folder/'recorded.wav'
    download.value.save_as(str(path))
    actual = wav_details(path)
    ui.check('下载 WAV 含真实440Hz麦克风采样而非330Hz歌曲', actual['rms'] > .01 and abs(actual['frequency']-440) < 6, actual)
    ui.check('下载身份与持久化报告一致', actual['sha256'] == report['audioIdentity']['sha256'] and abs(actual['durationSec']-saved['durationSec']) < .02)
    page.reload(wait_until='networkidle')
    ui.select_tab(page, 'karaoke')
    row = session_row(page, identifier)
    row.wait_for(state='visible')
    ui.check('刷新从 IndexedDB 恢复会话', row.get_attribute('data-persistent') == 'true' and row.get_attribute('data-status') == 'ready')
    row.locator('[data-session-action=open]').click()
    page.locator('#reviewReport').wait_for(state='visible')
    page.wait_for_function("() => document.querySelector('.review-audio-match')?.dataset.matched==='true'")
    ui.check('恢复后无需重新选音频即可回听完整复盘', page.locator('#reviewAudio').count() == 1 and page.locator('#reviewExportBtn').is_enabled())
    delete_all(page)
    page.reload(wait_until='networkidle')
    ui.select_tab(page, 'karaoke')
    ui.check('删除后刷新不恢复旧录音', page.locator('.k-session-item').count() == 0 and sessions(page) == [])


def pause_restart_cancel(page, folder):
    ready_live(page)
    song = folder/'song-330hz-14s.wav'
    ui.make_tone(song, frequency=330, seconds=14)
    load_song(page, song)
    identifier = start(page)
    page.wait_for_function('() => window.__mm.state.karaoke.player.currentTime>1.5')
    page.locator('#karaokePlayBtn').click()
    page.wait_for_function("() => window.__mm.state.karaoke.sessions.status==='paused'")
    at_pause = page.evaluate('window.__mm.state.karaoke.player.currentTime')
    time.sleep(2)
    ui.check('暂停时歌曲位置停住', abs(page.evaluate('window.__mm.state.karaoke.player.currentTime')-at_pause) < .05)
    page.locator('#karaokePlayBtn').click()
    page.wait_for_function('() => window.__mm.state.karaoke.player.currentTime>3.1')
    active_time = page.evaluate('window.__mm.state.karaoke.player.currentTime')
    page.locator('#karaokeFinishBtn').click()
    saved = wait_ready(page, [identifier], auto_open=True)[0]
    ui.check('暂停/继续保留同一id，暂停2秒不计录音时长', abs(saved['durationSec']-active_time) < .4, {'recorded':saved['durationSec'],'songPlayed':active_time,'pausedSec':2})
    delete_all(page)
    load_song(page, song)
    first = start(page)
    page.wait_for_function('() => window.__mm.state.karaoke.player.currentTime>1.4')
    page.locator('#karaokeRestartBtn').click()
    page.wait_for_function('old => window.__mm.state.karaoke.sessions.active?.id && window.__mm.state.karaoke.sessions.active.id!==old', arg=first)
    second = page.evaluate('window.__mm.state.karaoke.sessions.active.id')
    page.wait_for_function('() => window.__mm.state.karaoke.player.currentTime>1.4')
    page.locator('#karaokeFinishBtn').click()
    restarted = wait_ready(page, [first, second], auto_open=True)
    ui.check('重唱保存旧录音并创建独立新id', len(restarted) == 2 and first != second and any(s['capture']['finishReason'] == 'restart' for s in restarted))
    delete_all(page)
    load_song(page, song)
    cancelled = start(page)
    page.wait_for_function('() => window.__mm.state.karaoke.player.currentTime>1.3')
    page.locator('#karaokeAutoRecord').uncheck()
    page.wait_for_function('() => !window.__mm.state.karaoke.sessions.active && !window.__mm.state.karaoke.sessions.finishing')
    result = wait_ready(page, [cancelled])[0]
    stopped_duration = result['durationSec']
    page.wait_for_function('() => window.__mm.state.karaoke.player.currentTime>3.0')
    now = sessions(page)[0]
    ui.check('关闭自动录音立即停止PCM录制，继续跟唱不追加样本', now['capture']['finishReason'] == 'recordingDisabled' and abs(now['durationSec']-stopped_duration) < .001 and page.evaluate('!window.__mm.state.karaoke.sessions.active && !window.__mm.state.karaoke.player.takeActive'))
    page.locator('#karaokePlayBtn').click()
    delete_all(page)


def coach_injected(page, folder):
    ready_live(page)
    song = folder/'coach-reference-440hz.wav'
    ui.make_tone(song, frequency=440, seconds=7)
    load_song(page, song)
    # 没开始采集录音，只在已加载参考上注入onFrame，验证真实app教练与DOM接线。
    for cents, expected in [(-85, 'flat'), (90, 'sharp')]:
        feedback = page.evaluate("""cents => {
          const k=window.__mm.state.karaoke; k.coach.reset();
          k.scorer={feed:(t,midi)=>({ref:69,cents:(midi-69)*100,hit:false})};
          for(let i=0;i<=45;i++)k.player.onFrame({t:i*.05,midi:69+cents/100,level:.1,clarity:.99,voiced:true});
          return {code:document.querySelector('#karaokeCoach').dataset.code,text:document.querySelector('#karaokeCoachText').textContent};
        }""", cents)
        ui.check('仅onFrame注入：持续' + expected + '更新文字教练', feedback['code'] == expected and '音分' in feedback['text'], feedback)
    page.locator('#langSelect').select_option('en')
    ui.check('教练提示切English，不出现文案键', 'sharp' in page.inner_text('#karaokeCoachText').lower() and 'coach.' not in page.inner_text('#karaokeCoachText'))
    page.evaluate('() => {const k=window.__mm.state.karaoke;k.scorer=null;k.coach.reset();}')


def speaker(page, folder):
    ready_live(page)
    song = folder/'speaker-reference.wav'
    ui.make_tone(song, frequency=330, seconds=4)
    load_song(page, song, speaker=True)
    identifier = start(page)
    saved = wait_ready(page, [identifier], auto_open=True)[0]
    report = saved['report']
    ui.check('外放会话标记混音，不输出病因假设或音准分', saved['sourceKind'] == 'mixed' and report['sourceKind'] == 'mixed' and report['hypotheses'] == 0 and report['comparison']['score'] is None and 'mixedSource' in report['quality']['reasons'])
    delete_all(page)


def mobile(browser, width, folder):
    context = browser.new_context(viewport={'width':width,'height':740}, is_mobile=True, has_touch=True, permissions=['microphone'], accept_downloads=True)
    watch_context(context)
    page = context.new_page()
    try:
        ready_live(page)
        page.locator('#langSelect').select_option('en')
        layout = ui.layout_details(page)
        english = ui.english_content(page)
        ui.check(f'手机{width}px无横向溢出/控件可触达', not layout['bad'] and not layout['canvases'] and not layout['small'], layout)
        ui.check(f'手机{width}px实时与会话区完整English', not english['chinese'] and not english['keys'], english)
        ui.check(f'手机{width}px教练/录音入口展开', page.locator('#karaokeCoachEnabled').is_visible() and page.locator('#karaokeAutoRecord').is_visible() and not page.locator('#karaokeAutoRecord').evaluate('e=>!!e.closest("details")'))
        page.screenshot(path=str(folder/f'live-phone-{width}.png'), full_page=True)
    finally:
        context.close()


def storage_failure(browser, folder, kind):
    context = browser.new_context(viewport={'width':1280,'height':900}, permissions=['microphone'], accept_downloads=True)
    watch_context(context)
    if kind == 'unsupported':
        context.add_init_script("Object.defineProperty(window,'indexedDB',{value:undefined,configurable:true});")
    else:
        context.add_init_script("""(() => {const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){
          if(['sessions','summaries'].includes(this.name))throw new DOMException('synthetic quota','QuotaExceededError');
          return original.apply(this,args);
        };})()""")
    page = context.new_page()
    try:
        ready_live(page)
        song = folder/f'storage-{kind}-song.wav'
        ui.make_tone(song, frequency=330, seconds=4)
        load_song(page, song)
        identifier = start(page)
        page.wait_for_function("id => window.__mm.state.karaoke.sessions.memory.get(id)?.status==='ready'", arg=identifier, timeout=60000)
        row = session_row(page, identifier)
        row.wait_for(state='visible')
        status = page.inner_text('#karaokeSessionStatus')
        memory_text = row.inner_text()
        saved_label = '录音与复盘已保存' in status or 'Recording and review saved' in status
        ui.check(f'{kind}保存失败保留memoryOnly且不显示已保存', row.get_attribute('data-persistent') == 'false' and not saved_label and ('本页' in memory_text or 'page only' in memory_text), {'status':status,'row':memory_text})
        with page.expect_download() as download:
            row.locator('[data-session-action=download]').click()
        path = folder/f'storage-{kind}-recording.wav'
        download.value.save_as(str(path))
        actual = wav_details(path)
        ui.check(f'{kind}仍可下载真实WAV备份', actual['rms'] > .01 and abs(actual['frequency']-440) < 6 and actual['durationSec'] > 2, actual)
        if kind == 'quota':
            ui.check('quota失败没有伪造IndexedDB持久会话', sessions(page) == [])
    finally:
        context.close()


def offline(page, context, folder):
    ready_live(page)
    page.wait_for_function('() => !!navigator.serviceWorker.controller', timeout=20000)
    context.set_offline(True)
    try:
        page.reload(wait_until='domcontentloaded')
        page.wait_for_function('() => !!window.__mm', timeout=20000)
        ui.select_tab(page, 'karaoke')
        song = folder/'offline-song.wav'
        ui.make_tone(song, frequency=330, seconds=4)
        load_song(page, song)
        identifier = start(page)
        saved = wait_ready(page, [identifier], auto_open=True)[0]
        ui.check('PWA断网刷新后仍可录制、IndexedDB保存、完整Worker复盘', not page.evaluate('navigator.onLine') and saved['audioBytes'] > 10000 and saved['report']['frames'] > 80)
        delete_all(page)
    finally:
        context.set_offline(False)


def main():
    argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter).parse_args()
    artifacts = Path(os.environ.get('SCREENSHOT_DIR') or tempfile.mkdtemp(prefix='musicmaster-live-ui-artifacts-'))
    artifacts.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='musicmaster-live-ui-') as temporary, sync_playwright() as playwright:
        folder = Path(temporary)
        microphone = folder/'fake-microphone-440hz.wav'
        ui.make_tone(microphone, frequency=440, seconds=90)
        browser = playwright.chromium.launch(executable_path=ui.chromium_executable(), headless=True, args=[
            '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
            '--use-file-for-fake-audio-capture=' + str(microphone), '--autoplay-policy=no-user-gesture-required'])
        context = browser.new_context(viewport={'width':1280,'height':900}, permissions=['microphone'], accept_downloads=True)
        watch_context(context)
        page = context.new_page()
        try:
            ui.run_case('真实波形→唱完自动保存→Worker→刷新→下载→删除', lambda:true_recording(page, folder))
            ui.run_case('暂停时长/重唱独立id/关闭录音', lambda:pause_restart_cancel(page, folder))
            ui.run_case('教练UI方向接线（onFrame注入）', lambda:coach_injected(page, folder))
            ui.run_case('外放混音边界', lambda:speaker(page, folder))
            for kind in ['unsupported', 'quota']:
                ui.run_case(f'本机存储{kind}降级', lambda kind=kind:storage_failure(browser, folder, kind))
            for width in [320,375]:
                ui.run_case(f'手机{width}px English', lambda width=width:mobile(browser, width, artifacts))
            if os.environ.get('RUN_OFFLINE') == '1':
                ui.run_case('PWA离线真实录制与复盘', lambda:offline(page, context, folder))
            ui.check('实时录制与复盘没有浏览器运行错误', not ERRORS, ERRORS)
            ui.check('没有录音上传或外站请求', not UPLOADS and not EXTERNAL, {'uploads':UPLOADS,'external':EXTERNAL})
        finally:
            context.close(); browser.close()
    print(f'LIVE-SESSION-UI {"OK" if ui.failed == 0 else "FAILED"} ({ui.passed} pass, {ui.failed} fail); synthetic screenshots: {artifacts}', flush=True)
    return 0 if ui.failed == 0 else 1


if __name__ == '__main__':
    raise SystemExit(main())
