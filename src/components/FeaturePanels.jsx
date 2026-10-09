import { Icon, PanelHeading, Text } from './ui.jsx';

function FileControl({ id, accept, titleKey, title, buttonKey, button, children }) {
  return (
    <div className="upload-field">
      <span className="upload-label" data-i18n={titleKey}>{title}</span>
      <button type="button" className="file-btn" onClick={() => document.getElementById(id).click()} data-i18n={buttonKey}>{button}</button>
      <input type="file" id={id} accept={accept} hidden />
      {children}
    </div>
  );
}

function MetricCard({ id, nameKey, name, descriptionKey, description }) {
  return (
    <div className="metric-card">
      <div className="metric-name" data-i18n={nameKey}>{name}</div>
      <div className="metric-value" id={id}>--</div>
      <div className="metric-desc" data-i18n={descriptionKey}>{description}</div>
    </div>
  );
}

export function PracticePanel() {
  return (
    <section id="tab-practice" className="tab-panel panel-stack">
      <PanelHeading title="tab.practice" subtitle="practice.subtitle" />

      <div className="practice-head compact-toolbar">
        <label className="key-select" htmlFor="keySelect">
          <span data-i18n="practice.keyLabel">选择调性</span>
          <select id="keySelect" />
        </label>
        <p className="key-hint" data-i18n="practice.keyHint">音高偏高或偏低都可以换调，选你唱着最舒服的。</p>
      </div>

      <div className="exercise-grid" id="exerciseGrid" />

      <div className="card runner-card" id="runnerCard" hidden>
        <div className="runner-head">
          <h3 id="runnerTitle" />
          <button type="button" className="btn btn-ghost" id="stopExerciseBtn" data-i18n="practice.stop">结束练习</button>
        </div>
        <p className="runner-desc" id="runnerDesc" />
        <div className="step-dots" id="stepDots" />
        <div className="runner-stage">
          <div className="target-display">
            <div className="target-label" id="runnerPhase" data-i18n="practice.ready">准备</div>
            <div className="target-note" id="runnerTarget">--</div>
            <div className="target-cents" id="runnerLiveCents" />
          </div>
          <canvas id="exerciseCurve" width="560" height="240" />
        </div>
        <div className="runner-feedback" id="runnerFeedback" />
        <div className="runner-summary" id="runnerSummary" hidden />
      </div>

      <div className="practice-support-grid">
        <div className="card range-card">
          <div className="runner-head">
            <h3 data-i18n="range.title">音域测试</h3>
            <div className="range-controls">
              <button type="button" className="btn btn-secondary" id="rangeStartBtn" data-i18n="range.start">开始记录</button>
              <button type="button" className="btn btn-ghost" id="rangeResetBtn" data-i18n="range.clear">清除</button>
            </div>
          </div>
          <p className="muted" data-i18n="range.desc">在舒适范围内，先唱你最低的音、再唱最高的音（可以分次）。工具会记录你能稳定发出的音域。</p>
          <div className="range-result" id="rangeResult" data-i18n="range.empty">尚未记录。录音开始后随便哼唱即可。</div>
        </div>

        <div className="card history-card">
          <h3 data-i18n="history.title">练习记录</h3>
          <div id="historyList" className="history-list">
            <p className="muted" data-i18n="history.empty">还没有练习记录，完成一次跟唱练习后会自动保存在本机。</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function KaraokePanel() {
  return (
    <section id="tab-karaoke" className="tab-panel panel-stack">
      <PanelHeading title="k.title" subtitle="k.subtitle" />

      <div className="card k-pick-card karaoke-source-card">
        <div className="karaoke-upload-grid">
          <FileControl
            id="songFile"
            accept="audio/*"
            titleKey="k.pickTitle"
            title="选择歌曲"
            buttonKey="k.pickBtn"
            button="选择本地音频文件"
          >
            <p className="muted" id="karaokeFileInfo" data-i18n="k.pickInfo">支持 mp3 / m4a / wav / flac。文件不会离开你的设备。</p>
          </FileControl>
          <FileControl
            id="accFile"
            accept="audio/*"
            titleKey="k.pairTitle"
            title="伴奏（可选）"
            buttonKey="k.pairBtn"
            button="添加伴奏"
          >
            <p className="muted k-pair-status" id="karaokePairInfo" data-i18n="k.pairIdle">未使用伴奏时按单文件模式分析。</p>
          </FileControl>
          <FileControl
            id="lrcFile"
            accept=".lrc,.txt,text/plain"
            titleKey="k.lyricsTitle"
            title="歌词（可选）"
            buttonKey="k.lrcBtn"
            button="添加歌词 .lrc"
          />
        </div>
        <p className="card-caption" data-i18n="k.desc2">音频只在你的浏览器内存里，不会上传，也不会保存在本机。</p>
        <div id="karaokeLoading" className="karaoke-loading" hidden>
          <div className="progress-bar"><div className="progress-fill" id="karaokeProgressFill" /></div>
          <p className="muted" id="karaokeProgressText" data-i18n="k.prepare">准备中…</p>
        </div>
      </div>

      <div className="card karaoke-head">
        <div className="k-controls compact-toolbar">
          <div className="playback-actions">
            <button type="button" className="btn btn-primary" id="karaokePlayBtn" data-i18n="k.play">开始跟唱</button>
            <button type="button" className="btn btn-ghost" id="karaokeRestartBtn" data-i18n="k.restart">重唱</button>
          </div>
          <label className="k-volume" htmlFor="karaokeVol">
            <span data-i18n="k.volume">伴奏音量</span>
            <input type="range" id="karaokeVol" min="0" max="100" defaultValue="90" />
          </label>
          <label className="k-check" data-i18n-attr="title:k.echo" title="外放模式（回声消除，建议戴耳机时关闭）">
            <input type="checkbox" id="karaokeEcho" />
            <span data-i18n="k.echoShort">外放模式</span>
          </label>
        </div>
        <p className="karaoke-hint" id="karaokeHint" data-i18n="k.hintIdle">先启用麦克风，再开始跟唱。戴耳机练习效果最好。</p>
      </div>

      <div className="karaoke-grid karaoke-workspace">
        <div className="card k-timeline-card">
          <div className="k-timeline-head">
            <div className="k-now">
              <span className="k-now-label" id="karaokeTime">0:00 / 0:00</span>
              <span className="k-now-note" id="karaokeNowNote">--</span>
            </div>
            <div className="k-live-score">
              <span id="karaokeLiveScore">--</span><small data-i18n="k.timeLabel">分</small>
              <span className="k-live-sub" id="karaokeLiveCents" />
            </div>
          </div>
          <canvas id="karaokeCanvas" width="820" height="330" data-i18n-attr="aria-label:k.title" aria-label="K歌跟唱" />
          <p className="card-caption" data-i18n="k.canvasCaption">灰色线是参考音高，彩色点是你唱的音；点在线上方表示唱高、下方表示唱低。绿=准，黄=接近，红=偏。</p>
        </div>

        <div className="card k-status-card">
          <h3 data-i18n="k.statusTitle">实时状态</h3>
          <div className="k-status">
            <div><span data-i18n="k.refNote">参考音</span><b id="karaokeRef">--</b></div>
            <div><span data-i18n="k.myNote">你的音</span><b id="karaokeMine">--</b></div>
            <div><span data-i18n="k.centsDiff">音分差</span><b id="karaokeCents">--</b></div>
            <div><span data-i18n="k.micLevel">麦克风</span><meter id="karaokeLevel" min="0" max="1" value="0" data-i18n-attr="aria-label:k.micLevel">0</meter></div>
          </div>
          <div className="k-lyric" id="karaokeLyric" data-i18n="k.lyricEmpty">上传 .lrc 歌词后，会在这里逐句显示</div>
        </div>

        <div className="card k-report-card" id="karaokeReport" hidden />
      </div>

      <details className="card k-guide-card guide-details">
        <summary data-i18n="k.guideTitle">怎么练才有效</summary>
        <div className="guide-body">
          <p className="muted" data-i18n="k.desc1">选一首歌（BGM 或原唱），浏览器会在本地分析出它的旋律线，然后你跟着唱，工具实时对比你和原唱的每个音，唱完给出逐句指导。</p>
          <p className="muted" data-i18n="k.pickWarning">用「带人声的歌曲」效果最好，因为工具要听出原唱的旋律；纯伴奏因为没有清晰主旋律，分析结果可能不准。</p>
          <h4 className="k-opt-title" data-i18n="k.pairTitle">伴奏（可选）</h4>
          <p className="muted" data-i18n-html="k.pairDesc">单文件混音里伴奏会盖住人声。添加同一版本的伴奏后，工具会对齐并提取人声。</p>
          <ol className="exp-list">
            <li data-i18n="k.guideLi1">戴耳机：手机上外放的话，工具会把伴奏也当成你的声音，评分就失真了。</li>
            <li data-i18n="k.guideLi2">第一遍别用力，先轻声跟一遍，让工具判断“偏高”还是“偏低”。</li>
            <li data-i18n="k.guideLi3">第二遍只练报告里点出的最难那一句，循环十次，再连起来唱。</li>
            <li data-i18n="k.guideLi4">拿到 80 分以上，把这首歌放到「共鸣与频谱」里看胸声/头声倾向，检验高音是不是硬挤出来的。</li>
          </ol>
          <p className="muted" data-i18n="k.guideNote">说明：本工具的参考旋律是从你的音频里自动提取的，可能受伴奏影响；评分和指导是练习参考，不是声乐或医学诊断。</p>
        </div>
      </details>
    </section>
  );
}

export function SpectrumPanel() {
  return (
    <section id="tab-spectrum" className="tab-panel panel-stack">
      <PanelHeading title="tab.spectrum" subtitle="spectrum.subtitle" />

      <div className="spectrum-grid">
        <div className="card spectrum-card">
          <h3 data-i18n="spectrum.title">实时频谱</h3>
          <div className="pitch-chart">
            <canvas id="spectrumCanvas" width="760" height="300" data-i18n-attr="aria-label:spectrum.title" aria-label="实时频谱" />
            <div id="spectrumEmpty" className="chart-empty">
              <span className="empty-wave"><Icon name="wave" size={28} /></span>
              <Text as="p" k="ui.spectrumEmpty" />
              <Text as="small" k="ui.spectrumEmptyHint" />
            </div>
          </div>
          <p className="card-caption" data-i18n="spectrum.hint">纵轴是能量，横轴是频率（对数刻度）。唱歌时能看到基频和一串谐波峰。</p>
        </div>
        <div className="metrics-col spectrum-metrics">
          <MetricCard id="mCentroid" nameKey="metric.centroid" name="频谱质心" descriptionKey="metric.centroidDesc" description="声音的明亮度重心，Hz" />
          <MetricCard id="mSF" nameKey="metric.sf" name="歌手共振峰" descriptionKey="metric.sfDesc" description="2.5–3.5kHz 能量占比；歌声穿透力的代理" />
          <MetricCard id="mH1H2" nameKey="metric.h1h2" name="H1−H2（声区倾向）" descriptionKey="metric.h1h2Desc" description="前两谐波幅度差 dB；同音高下：数值小偏胸声，大偏头声" />
          <MetricCard id="mLH" nameKey="metric.lh" name="低/高频能量比" descriptionKey="metric.lhDesc" description="dB；越高越低沉厚重，越低越明亮" />
          <MetricCard id="mHNR" nameKey="metric.hnr" name="谐波占比" descriptionKey="metric.hnrDesc" description="周期性谐波能量比例；气声多会变低" />
        </div>
      </div>

      <details className="card experiment-card guide-details">
        <summary data-i18n="exp.title">小实验：感受胸声与头声</summary>
        <div className="guide-body">
          <ol className="exp-list">
            <li data-i18n-html="exp.li1"><span>用平时说话的感觉唱一个低音（比如 C3–G3 附近的 “wu”），这是偏<strong>胸声</strong>的发声：观察低/高频能量比通常较高、质心较低。</span></li>
            <li data-i18n-html="exp.li2"><span>再用轻飘飘、像吹口哨的感觉唱高八度，这是偏<strong>头声</strong>的发声：能量比通常会下降、谐波占比可能更纯净。</span></li>
            <li data-i18n="exp.li3">最后尝试在两者之间平滑滑动（滑音），找到不“破音”的过渡——这就是混声要训练的东西。</li>
          </ol>
          <p className="muted" data-i18n="exp.note">说明：胸声/头声在声学上没有单一的判定指标，这里的数值是帮助你建立直觉的近似参考，不是医学或声乐诊断。</p>
        </div>
      </details>
    </section>
  );
}

export function LearnPanel() {
  return (
    <section id="tab-learn" className="tab-panel panel-stack">
      <PanelHeading title="tab.learn" subtitle="learn.subtitle" />
      <div id="learnContent" className="learn-content" />
    </section>
  );
}
