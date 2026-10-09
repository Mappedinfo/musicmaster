// ============================================================
// 国际化（i18n）：中文 / English
// 零依赖：字典 + DOM 属性扫描 + 变量插值
// ============================================================
export const LANG_KEY = 'musicmaster.lang.v1';

export const DICT = {
  // ---------- 组件化工作台 ----------
  'ui.studio': { zh: '歌声练功房', en: 'Vocal Studio' },
  'ui.localAudio': { zh: '音频仅在本机处理', en: 'Audio stays on your device' },
  'ui.octaveLabel': { zh: '音名基准', en: 'Note convention' },
  'ui.octaveC4': { zh: '中央 C = C4', en: 'Middle C = C4' },
  'ui.octaveC3': { zh: '中央 C = C3', en: 'Middle C = C3' },
  'ui.language': { zh: '界面语言', en: 'Language' },
  'ui.installApp': { zh: '安装到本机', en: 'Install app' },
  'ui.installTitle': { zh: '安装为本地应用，用独立窗口打开（Chrome / Edge 菜单里的「安装」同样可用）', en: 'Install as a local app that opens in its own window (Chrome / Edge also offer Install in the browser menu)' },
  'ui.installIos': { zh: '在 Safari 的分享菜单里选择「添加到主屏幕」，就能像本地 App 一样打开。', en: 'In Safari, open the Share menu and choose “Add to Home Screen” to open it like a local app.' },
  'ui.tunerTitle': { zh: '音准仪', en: 'Pitch tuner' },
  'ui.tunerSubtitle': { zh: '看见音高，找到更稳的声音。', en: 'See your pitch. Find a steadier voice.' },
  'ui.realtime': { zh: '实时音高', en: 'Real-time pitch' },
  'ui.currentNote': { zh: '当前音高', en: 'Current pitch' },
  'ui.gaugeLabel': { zh: '音分偏差表盘', en: 'Pitch deviation in cents' },
  'ui.flat': { zh: '偏低', en: 'Flat' },
  'ui.inTune': { zh: '准确', en: 'In tune' },
  'ui.sharp': { zh: '偏高', en: 'Sharp' },
  'ui.signal': { zh: '信号清晰度', en: 'Signal clarity' },
  'ui.yourVoice': { zh: '你的声音', en: 'Your voice' },
  'ui.pitchEmpty': { zh: '启用麦克风，开始哼唱', en: 'Turn on the mic and start humming' },
  'ui.pitchEmptyHint': { zh: '试着把音高曲线唱成一条平稳的线', en: 'Try to hold a smooth, steady pitch line' },
  'ui.recentPitch': { zh: '最近 9 秒', en: 'Last 9 seconds' },
  'ui.semitone': { zh: '每格一个半音', en: 'One semitone per row' },
  'ui.tunerTip': { zh: '先轻声哼唱，再练长音。感觉喉咙不适时，请停下来休息。', en: 'Hum softly, then hold a note. Take a break if your throat feels uncomfortable.' },
  'ui.tunerHelp': { zh: '读懂音准仪与音名基准', en: 'Understanding the tuner and note convention' },
  'ui.footer': { zh: '开源唱歌训练工具 · 无需注册 · 练习记录保存在本机', en: 'Open-source vocal practice · No account needed · Practice history stays on this device' },
  'ui.skip': { zh: '跳到练习区', en: 'Skip to practice' },
  'ui.spectrumEmpty': { zh: '启用麦克风，探索你的音色', en: 'Turn on the mic to explore your tone' },
  'ui.spectrumEmptyHint': { zh: '唱一个长音，观察基频与谐波', en: 'Hold a note to see the fundamental and harmonics' },
  'practice.subtitle': { zh: '选择练习，先听示范，再跟唱。', en: 'Choose an exercise, listen, then sing.' },
  'k.subtitle': { zh: '导入歌曲，跟着旋律练准每一句。', en: 'Import a song and practise each line in tune.' },
  'k.echoShort': { zh: '外放模式', en: 'Speaker mode' },
  'k.echoFailed': { zh: '无法切换外放模式，请停止录音后重试。', en: 'Unable to change speaker mode. Stop listening and try again.' },
  'k.lyricsTitle': { zh: '歌词（可选）', en: 'Lyrics (optional)' },
  'spectrum.subtitle': { zh: '观察音色变化，轻松探索自己的声音。', en: 'Observe your tone and explore your voice.' },
  'learn.subtitle': { zh: '从呼吸、音准到共鸣，按自己的节奏练习。', en: 'Practise breathing, pitch and resonance at your own pace.' },
  // ---------- 通用 / 页头 ----------
  'app.title': { zh: 'MusicMaster · 歌声练功房', en: 'MusicMaster · Vocal Studio' },
  'app.description': {
    zh: '纯浏览器端的唱歌基本功练习工具：实时音高分析、跟唱评分、共鸣频谱探索与入门课程。所有数据不离开你的设备。',
    en: 'A browser-only vocal training tool: real-time pitch analysis, sing-along scoring, resonance spectrum, and beginner lessons. Your data never leaves your device.',
  },
  'mic.enable': { zh: '启用麦克风', en: 'Enable microphone' },
  'mic.stop': { zh: '停止录音', en: 'Stop listening' },
  'mic.requesting': { zh: '正在请求权限…', en: 'Requesting permission…' },
  'mic.listening': { zh: '正在监听 · 对着麦克风哼 "wu——" 试试', en: 'Listening · try humming "woo—" into the mic' },
  'mic.privacy': { zh: '麦克风未启用 · 音频仅在本机处理', en: 'Microphone off · Audio is processed locally' },

  // ---------- 选项卡 ----------
  'tab.tuner': { zh: '音准仪', en: 'Tuner' },
  'tab.practice': { zh: '跟唱练习', en: 'Exercises' },
  'tab.karaoke': { zh: 'K歌跟唱', en: 'Sing-along' },
  'tab.spectrum': { zh: '共鸣与频谱', en: 'Spectrum' },
  'tab.learn': { zh: '入门课程', en: 'Lessons' },

  // ---------- 音准仪 ----------
  'tuner.clarityHint': { zh: '清晰度越高，音高检测越可靠。轻声哼 "wu——" 通常最稳定。', en: 'Higher clarity means more reliable pitch detection. A soft "woo—" hum is usually the steadiest.' },
  'tuner.clarityTitle': { zh: '信号清晰度（泛音周期性强度）', en: 'Signal clarity (strength of harmonic periodicity)' },
  'tuner.curveTitle': { zh: '音高曲线', en: 'Pitch curve' },
  'tuner.curveHint': { zh: '横轴是时间，纵轴是音高（每格一个半音）。试着唱一条平稳直线，再试试滑音。', en: 'Time runs left to right; pitch runs bottom to top (one semitone per row). Try holding a steady line, then a glide.' },
  'octave.label': { zh: '音名八度基准', en: 'Note-name octave base' },
  'octave.hint': { zh: '同一个音在不同软件里八度编号可能差一位。选和你的琴/软件一致的那项，界面上所有音名都会跟着变；音高检测本身不受影响。', en: 'The same note can be numbered one octave apart in different software. Pick the one that matches your instrument or DAW; every note name in the app follows, and pitch detection itself is unaffected.' },
  'octave.helpLi1': { zh: '约 131 Hz', en: '~131 Hz' },
  'octave.helpLi1b': { zh: '男声常用的低音 C（GarageBand 里叫 C3，Cubase 里叫 C2）', en: 'the low C used in male voices (C3 in GarageBand, C2 in Cubase)' },
  'octave.helpLi2': { zh: '约 262 Hz', en: '~262 Hz' },
  'octave.helpLi2b': { zh: '中央 C，也就是钢琴正中间那个 C（GarageBand 里叫 C4，Cubase 里叫 C3）', en: 'middle C, the C in the middle of the piano (C4 in GarageBand, C3 in Cubase)' },
  'octave.helpLi3': { zh: '约 440 Hz', en: '~440 Hz' },
  'octave.helpLi3b': { zh: '标准音 A', en: 'the reference pitch A' },
  'octave.helpP2': { zh: '用你的琴弹一个音，看这里显示的 Hz 是否和上面一致。若你的软件把中央 C 写作 C3，就选第二项，两边就对齐了。', en: 'Play a note on your instrument and check whether the Hz shown here matches. If your software calls middle C "C3", choose the second option and the two will agree.' },
  'octave.toastC3': { zh: '已切换：C3 为中央 C（Cubase/MuseScore 习惯）', en: 'Switched: C3 is middle C (Cubase/MuseScore convention)' },
  'octave.toastC4': { zh: '已切换：C4 为中央 C（GarageBand/Logic 习惯）', en: 'Switched: C4 is middle C (GarageBand/Logic convention)' },

  // ---------- 跟唱练习 ----------
  'practice.keyLabel': { zh: '选择调性', en: 'Choose key' },
  'practice.keyHint': { zh: '音高偏高或偏低都可以换调，选你唱着最舒服的。', en: 'If the notes sit too high or too low, change key and pick what feels comfortable.' },
  'practice.stop': { zh: '结束练习', en: 'End exercise' },
  'practice.ready': { zh: '准备', en: 'Ready' },
  'practice.listen': { zh: '🔊 听示范音', en: '🔊 Listen' },
  'practice.sing': { zh: '🎤 唱！', en: '🎤 Sing!' },
  'practice.done': { zh: '完成', en: 'Done' },
  'practice.stopped': { zh: '已停止', en: 'Stopped' },
  'practice.start': { zh: '▶ 开始练习', en: '▶ Start exercise' },
  'practice.again': { zh: '再练一次', en: 'Practise again' },
  'range.title': { zh: '音域测试', en: 'Range test' },
  'range.desc': { zh: '在舒适范围内，先唱你最低的音、再唱最高的音（可以分次）。工具会记录你能稳定发出的音域。', en: 'Within a comfortable range, sing your lowest note then your highest (separate takes are fine). The tool records the range you can produce steadily.' },
  'range.start': { zh: '开始记录', en: 'Start recording' },
  'range.clear': { zh: '清除', en: 'Clear' },
  'range.empty': { zh: '尚未记录。录音开始后随便哼唱即可。', en: 'Nothing recorded yet. Just hum once you turn the mic on.' },
  'history.title': { zh: '练习记录', en: 'Practice history' },
  'history.empty': { zh: '还没有练习记录，完成一次跟唱练习后会自动保存在本机。', en: 'No practice records yet. Finish one exercise and it will be saved on this device.' },

  // ---------- 共鸣与频谱 ----------
  'spectrum.title': { zh: '实时频谱', en: 'Live spectrum' },
  'spectrum.fundamental': { zh: '基频', en: 'Fundamental' },
  'spectrum.hint': { zh: '纵轴是能量，横轴是频率（对数刻度）。唱歌时能看到基频和一串谐波峰。', en: 'Vertical axis is energy, horizontal is frequency (log scale). When you sing you can see the fundamental and a series of harmonic peaks.' },
  'metric.centroid': { zh: '频谱质心', en: 'Spectral centroid' },
  'metric.centroidDesc': { zh: '声音的"明亮度"重心，Hz', en: 'Centre of gravity of brightness, in Hz' },
  'metric.sf': { zh: '歌手共振峰', en: "Singer's formant" },
  'metric.sfDesc': { zh: '2.5–3.5kHz 能量占比；歌声"穿透力"的代理', en: 'Share of energy at 2.5–3.5 kHz; a proxy for vocal "ring"' },
  'metric.h1h2': { zh: 'H1−H2（声区倾向）', en: 'H1−H2 (register tendency)' },
  'metric.h1h2Desc': { zh: '前两谐波幅度差 dB；同音高下：数值小偏胸声，大偏头声', en: 'Level difference between the first two harmonics, in dB. At the same pitch: smaller leans chest voice, larger leans head voice' },
  'metric.lh': { zh: '低/高频能量比', en: 'Low/high energy ratio' },
  'metric.lhDesc': { zh: 'dB；越高越低沉厚重，越低越明亮', en: 'dB; higher is darker and heavier, lower is brighter' },
  'metric.hnr': { zh: '谐波占比', en: 'Harmonic ratio' },
  'metric.hnrDesc': { zh: '周期性谐波能量比例；气声多会变低', en: 'Proportion of periodic harmonic energy; drops with breathiness' },
  'exp.title': { zh: '小实验：感受胸声与头声', en: 'Try this: feel chest voice and head voice' },
  'exp.li1': { zh: "<span>用平时说话的感觉唱一个低音（比如 C3–G3 附近的 \"wu\"），这是偏<strong>胸声</strong>的发声：观察低/高频能量比通常较高、质心较低。</span>", en: "<span>Sing a low note the way you speak (say \"woo\" around C3–G3). This is towards <strong>chest voice</strong>: the low/high energy ratio is usually higher and the centroid lower.</span>" },
  'exp.li2': { zh: "<span>再用轻飘飘、像吹口哨的感觉唱高八度，这是偏<strong>头声</strong>的发声：能量比通常会下降、谐波占比可能更纯净。</span>", en: "<span>Then sing an octave up, light and whistle-like. This is towards <strong>head voice</strong>: the energy ratio usually drops and the harmonics may sound purer.</span>" },
  'exp.li3': { zh: '最后尝试在两者之间平滑滑动（滑音），找到不"破音"的过渡——这就是混声要训练的东西。', en: 'Finally glide smoothly between them to find the transition where your voice does not crack — that is exactly what mixing trains.' },
  'exp.note': { zh: '说明：胸声/头声在声学上没有单一的判定指标，这里的数值是帮助你建立直觉的近似参考，不是医学或声乐诊断。', en: 'Note: there is no single acoustic measure that decides chest versus head voice. These numbers are approximate guides to build intuition, not a medical or vocal diagnosis.' },

  // ---------- K歌跟唱 ----------
  'k.title': { zh: 'K歌跟唱', en: 'Sing-along' },
  'k.desc1': { zh: '选一首歌（BGM 或原唱），浏览器会在本地分析出它的旋律线，然后你跟着唱，工具实时对比你和原唱的每个音，唱完给出逐句指导。', en: 'Pick a song (backing track or the original), and the browser extracts its melody line locally. Sing along and the tool compares every note with the original in real time, then gives line-by-line coaching.' },
  'k.desc2': { zh: '音频只在你的浏览器内存里，不会上传，也不会保存在本机。', en: 'Audio stays in your browser memory only. It is never uploaded and never saved to this device.' },
  'k.prepare': { zh: '准备中…', en: 'Preparing…' },
  'k.play': { zh: '▶ 开始跟唱', en: '▶ Start singing' },
  'k.pause': { zh: '⏸ 暂停', en: '⏸ Pause' },
  'k.restart': { zh: '↺ 重唱', en: '↺ Restart' },
  'k.volume': { zh: '伴奏音量', en: 'Track volume' },
  'k.echo': { zh: '外放模式（回声消除，建议戴耳机时关闭）', en: 'Speaker mode (echo cancellation; turn off if you wear headphones)' },
  'k.hintIdle': { zh: '选择歌曲、启用麦克风，即可跟唱。戴耳机时关闭外放模式。', en: 'Choose a song and enable the mic to sing along. Turn off speaker mode when using headphones.' },
  'k.hintLive': { zh: '正在跟唱 · 灰色是原唱旋律，你的点越靠线越准。', en: 'Singing · the grey line is the original melody; the closer your dots sit to it, the more in tune you are.' },
  'k.hintDone': { zh: '唱完了。看下面的报告，针对最弱的那一句再练十遍。', en: 'Done. Check the report below and drill the weakest line ten more times.' },
  'k.timeLabel': { zh: '分', en: 'pts' },
  'k.statusTitle': { zh: '实时状态', en: 'Live status' },
  'k.refNote': { zh: '参考音', en: 'Reference' },
  'k.myNote': { zh: '你的音', en: 'You' },
  'k.centsDiff': { zh: '音分差', en: 'Cents off' },
  'k.micLevel': { zh: '麦克风', en: 'Microphone' },
  'k.lyricEmpty': { zh: '（上传 .lrc 歌词后，会在这里逐句显示）', en: '(Upload an .lrc file and each line will appear here)' },
  'k.lrcBtn': { zh: '添加歌词 .lrc', en: 'Add lyrics .lrc' },
  'k.pickTitle': { zh: '选择歌曲', en: 'Choose a song' },
  'k.pickBtn': { zh: '选择本地音频', en: 'Choose local audio' },
  'k.pickInfo': { zh: '支持 mp3 / m4a / wav / flac。文件不会离开你的设备。', en: 'Supports mp3 / m4a / wav / flac. The file never leaves your device.' },
  'k.pickWarning': { zh: '用「带人声的歌曲」效果最好，因为工具要听出原唱的旋律；纯伴奏因为没有清晰主旋律，分析结果可能不准。', en: 'Songs with vocals work best, because the tool needs to hear the original melody. A pure backing track has no clear lead line, so the analysis may be unreliable.' },
  'k.canvasCaption': { zh: '灰色线是参考音高，彩色点是你唱的音；点在线上方表示唱高、下方表示唱低。绿=准，黄=接近，红=偏。', en: 'The grey line is the reference pitch; coloured dots are your notes. Above the line means sharp, below means flat. Green = in tune, amber = close, red = off.' },
  'k.canvasEmpty': { zh: '选择歌曲后，这里会出现原唱旋律线和你的音高轨迹', en: 'Pick a song and the original melody plus your pitch trail will appear here' },
  'k.nextLyric': { zh: '下一句：', en: 'Next: ' },
  'k.guideTitle': { zh: '怎么练才有效', en: 'How to actually improve' },
  'k.guideLi1': { zh: '戴耳机：手机上外放的话，工具会把伴奏也当成你的声音，评分就失真了。', en: 'Use headphones: on a phone speaker the tool hears the backing track as your voice and the score becomes meaningless.' },
  'k.guideLi2': { zh: '第一遍别用力，先轻声跟一遍，让工具判断"偏高"还是"偏低"。', en: 'Do not push on the first pass. Sing quietly so the tool can tell whether you run sharp or flat.' },
  'k.guideLi3': { zh: '第二遍只练报告里点出的最难那一句，循环十次，再连起来唱。', en: 'On the second pass practise only the hardest line the report flagged, ten times in a loop, then sing it through.' },
  'k.guideLi4': { zh: '拿到 80 分以上，把这首歌放到「共鸣与频谱」里看胸声/头声倾向，检验高音是不是硬挤出来的。', en: 'Once you score above 80, check the song in "Spectrum" to see your chest/head tendency and whether the high notes are being squeezed out.' },
  'k.guideNote': { zh: '说明：本工具的参考旋律是从你的音频里自动提取的，可能受伴奏影响；评分和指导是练习参考，不是声乐或医学诊断。', en: 'Note: the reference melody is extracted automatically from your audio and may be affected by the accompaniment. Scores and coaching are practice guidance, not a vocal or medical diagnosis.' },
  'k.toastNeedSong': { zh: '请先点击「选择本地音频」导入歌曲', en: 'Import a song with "Choose local audio" first' },
  'k.toastNeedMic': { zh: '请先启用麦克风，才能分析你的声音', en: 'Enable the microphone first to analyze your voice' },
  'k.toastLrc': { zh: '🎵 已载入 {n} 行歌词，唱完会逐句给分', en: '🎵 Loaded {n} lyric lines; you will get per-line scores after singing' },
  'k.toastReady': { zh: '✅ 旋律线已提取完成，点「开始跟唱」', en: '✅ Melody extracted. Hit "Start singing"' },
  'k.decode': { zh: '正在解码「{name}」…', en: 'Decoding "{name}"…' },
  'k.extracting': { zh: '提取旋律 {p}%…（长歌曲需要十几秒）', en: 'Extracting melody {p}%… (a long song takes a few tens of seconds)' },
  'k.ready': { zh: '已就绪：{name}（{dur}，检测到 {sec} 秒人声旋律）', en: 'Ready: {name} ({dur}, {sec}s of vocal melody detected)' },
  'k.loadFail': { zh: '分析失败：{msg}', en: 'Analysis failed: {msg}' },
  'k.loadFailToast': { zh: '加载失败：{msg}', en: 'Load failed: {msg}' },
  'k.noMelody': { zh: '几乎没提取到稳定旋律。这首可能是纯伴奏或纯打击乐，请换成带人声的版本。', en: 'Almost no stable melody was found. This may be a pure backing track or percussion; try a version with vocals.' },
  'k.donePct': { zh: '完成！点「开始跟唱」开唱', en: 'Done! Hit "Start singing"' },
  'k.jumpToast': { zh: '已跳到 {time}，从这一句开始重唱', en: 'Jumped to {time}; sing again from this line' },
  'k.reportTitle': { zh: '🎧 本次跟唱报告', en: '🎧 Sing-along report' },
  'k.statPitch': { zh: '音准', en: 'In tune' },
  'k.statAvgDev': { zh: '平均偏差', en: 'Mean deviation' },
  'k.statTendency': { zh: '整体倾向', en: 'Overall tendency' },
  'k.statWobble': { zh: '波动', en: 'Wobble' },
  'k.statCoverage': { zh: '覆盖率', en: 'Coverage' },
  'k.reportTips': { zh: '练习建议', en: 'Coaching' },
  'k.reportSegs': { zh: '最需要单独练的片段（点击可跳过去重唱）', en: 'Lines that need the most work (tap to jump and retry)' },
  'k.noLyric': { zh: '（无歌词）', en: '(no lyrics)' },
  'k.singHere': { zh: '从这里唱', en: 'Sing from here' },

  // ---------- K歌练习建议（按统计生成） ----------
  'tip.tooShort': { zh: '唱到的片段太短，先完整跟唱一段（30 秒以上）再来看指导。', en: 'The captured stretch is too short. Sing a full section (30 seconds or more) and then check the coaching.' },
  'tip.noVoice': { zh: '麦克风没怎么听到你的声音（可能没开口，或者被伴奏盖住了）。建议戴耳机、把伴奏音量调到能听见自己，再把麦克风靠近一些，重新唱一遍。', en: 'The microphone barely heard you (maybe you did not sing, or the track drowned you out). Use headphones, set the volume so you can hear yourself, move closer to the mic, and try again.' },
  'tip.octaveUp': { zh: '你的音整体比原唱高了一个八度以上，说明这首歌对你偏低。可以整体升 key 唱，或者直接用胸声往下压着唱。', en: 'You are singing more than an octave above the original, so the song sits low for you. Raise the key, or deliberately press down with chest voice.' },
  'tip.octaveDown': { zh: '你的音整体比原唱低了一个八度以上，说明副歌的高音超出了你目前的音域。建议先降 key、用头声轻声把高音带过去，别硬喊。', en: 'You are singing more than an octave below the original, so the chorus sits above your current range. Lower the key and carry the high notes lightly in head voice instead of shouting.' },
  'tip.octaveExtra': { zh: '先用「跟唱练习」把这首歌的最高音和最低音单独哼几遍，确认自己能稳定发出，再回来整首跟唱。', en: 'Hum the highest and lowest notes of this song separately in "Exercises" until they are steady, then come back and sing the whole thing.' },
  'tip.flat': { zh: '整体偏低约 {n} 音分。练法：跟着伴奏先只唱每句的最后一个长音，用钢琴或本工具的音准仪定住，再回到整句；起句时稍微"往上顶"一点，不要一开口就松。', en: 'You run about {n} cents flat overall. Practise the last long note of each line against a piano or the tuner, then sing the whole line. Aim slightly high when you start a phrase instead of relaxing immediately.' },
  'tip.sharp': { zh: '整体偏高约 {n} 音分。练法：很多人一紧张就越唱越高。试试把音量降一点、气息放稳，先轻声哼一遍找准高度再放声。', en: 'You run about {n} cents sharp overall. Many singers drift up when nervous. Lower the volume, steady your breath, hum through once to find the height, then sing out.' },
  'tip.stable': { zh: '整体音高很稳（平均偏差 {n} 音分），方向感没问题，可以开始练长音的稳定度和换气。', en: 'Your overall pitch is steady (mean deviation {n} cents). Your sense of direction is fine, so start working on long-note steadiness and breath planning.' },
  'tip.unsystematic': { zh: '没有系统性偏高或偏低，但每个字落点不够准。建议放慢到 0.75 倍速，先唱准再恢复原速。', en: 'There is no systematic sharpness or flatness, but each note lands imprecisely. Slow the track to 0.75× and only return to full speed once it is accurate.' },
  'tip.wobble': { zh: '音高波动较大（±{n} 音分）。多练长音（一口气唱 6-8 秒同一个音），把曲线唱成直线再唱歌词。', en: 'Your pitch wobbles a lot (±{n} cents). Practise long notes (6–8 seconds on a single pitch) until the curve is a straight line, then add words.' },
  'tip.octaveFrames': { zh: '有 {n} 帧和原唱差了一个八度以上，通常是这首歌超出了你目前的舒适音域。可以换调唱，或者用假声/头声把高音部分带过去。', en: '{n} frames sit more than an octave away from the original, which usually means the song exceeds your comfortable range. Change key, or carry the high part in falsetto/head voice.' },
  'tip.worstSeg': { zh: '最需要单独练的是 {label}（约 {t}s 处，音准 {acc}%）。把这一句单独循环 10 遍，唱对了再连起来。', en: 'The part that needs the most work is {label} (around {t}s, {acc}% accurate). Loop that line ten times, then sing it in context.' },
  'tip.worstNear': { zh: '{t}s 附近', en: 'around {t}s' },
  'tip.keepGoing': { zh: '继续保持，可以尝试更难的歌或提高对自己的要求。', en: 'Keep going — try a harder song or raise your own bar.' },

  // ---------- 练习 / 音域 / 错误提示 ----------
  "ex.best": { zh: "最好成绩 {n} 分", en: "Best {n} pts" },
  "ex.points": { zh: " 分", en: " pts" },
  "ex.stable": { zh: "稳 {v}¢", en: "steadiness {v}¢" },
  "ex.summary": { zh: "完成 {sung}/{steps} 个音。", en: "Sang {sung}/{steps} notes. " },
  "ex.notHeard": { zh: "{note} 没听清你的声音", en: "Could not hear you on {note}" },
  "summary.85": { zh: "非常棒！音准和稳定性都很出色，可以试试更高难度或换个调。", en: "Excellent! Both pitch and steadiness are strong. Try a harder exercise or a different key." },
  "summary.70": { zh: "不错！大部分音都唱准了，注意个别偏低/偏高的音。", en: "Nice work. Most notes landed; watch the few that went flat or sharp." },
  "summary.50": { zh: "有进步空间。跟着示范音慢一些唱，先求准再求稳。", en: "Room to grow. Sing with the reference more slowly — accuracy first, steadiness second." },
  "summary.low": { zh: "没关系，初学者大多从这里开始。先练「单音模唱」，每次只专注于一个音。", en: "That is normal; most beginners start here. Practise \"Match a single note\" and focus on one pitch at a time." },
  "range.result": { zh: "你的可用音域大约是 <b>{lo}</b> — <b>{hi}</b>（约 {n} 个半音）。普通人的舒适音域一般在 12–18 个半音，练声可以逐步扩展。", en: "Your working range is about <b>{lo}</b> — <b>{hi}</b> (roughly {n} semitones). Most untrained singers have a comfortable range of 12–18 semitones; practice extends it gradually." },
  "range.tooFew": { zh: "采集到的有效声音太少，再试一次（唱清楚一点、时间长一点）。", en: "Too little usable sound was captured. Try again — sing more clearly and for longer." },
  "history.item": { zh: "{sung}/{steps} 音", en: "{sung}/{steps} notes" },
  "toast.needMic": { zh: "请先启用麦克风", en: "Enable the microphone first" },
  "toast.micOn": { zh: "🎙️ 麦克风已开启，开始唱吧！", en: "🎙️ Microphone is on — start singing!" },
  "micErr.generic": { zh: "无法访问麦克风。", en: "Cannot access the microphone." },
  "micErr.https": { zh: "浏览器只允许在 HTTPS 或 localhost 下使用麦克风，请通过 GitHub Pages 地址访问。", en: "Browsers only allow microphone access over HTTPS or localhost. Please use the GitHub Pages address." },
  "micErr.denied": { zh: "麦克风权限被拒绝。请点击地址栏左侧的锁形图标，允许麦克风后重试。", en: "Microphone permission was denied. Click the lock icon in the address bar, allow the microphone, and try again." },
  "micErr.noDevice": { zh: "没有检测到麦克风设备。", en: "No microphone device was detected." },

  "learn.weekTitle": { zh: "🗓️ 入门四周计划", en: "🗓️ Four-week starter plan" },
  "learn.weekSub": { zh: "每天 10–15 分钟即可，贵在坚持。练习前后各喝温水，嗓子疼就休息。", en: "Ten to fifteen minutes a day is enough — consistency matters more. Drink warm water before and after, and rest if your throat hurts." },
  "unit.cents": { zh: "音分", en: "cents" },
  "k.decoded": { zh: "已解码 {sec} 秒音频，正在逐帧提取旋律…", en: "Decoded {sec}s of audio; extracting melody frame by frame…" },
  "tuner.solfege": { zh: "唱名 ", en: "solfege " },
  "range.stop": { zh: "停止并查看结果", en: "Stop and see result" },
  "range.recording": { zh: "记录中……先哼一个最低的音，再哼一个最高的音。", en: "Recording… hum your lowest note first, then your highest." },
  "k.lrcLoaded": { zh: "已载入 {n} 行歌词；{name}。", en: "Loaded {n} lyric lines; {name}." },
  "k.historyPrefix": { zh: "K歌：", en: "Sing-along: " },
  "k.pairTitle": { zh: "伴奏（可选）", en: "Backing track (optional)" },
  "k.pairDesc": { zh: "单文件混音里伴奏会盖住人声，旋律提取率只有约 10%。再上传一份<strong>同样的伴奏</strong>，工具会自动对齐时间轴并把伴奏减掉，得到干净人声——实测人声段旋律覆盖率能从 12% 提到 100%。", en: "In a single mix the backing track masks the voice and melody extraction only recovers about 10%. Upload the <strong>matching backing track</strong> too and the tool aligns the timeline and subtracts it to get a clean vocal — measured coverage in vocal sections goes from 12% to 100%." },
  "k.pairBtn": { zh: "添加伴奏", en: "Add backing track" },
  "k.pairIdle": { zh: "未使用伴奏时按单文件模式分析。", en: "Without a backing track the tool analyses the single file." },
  "k.pairWorking": { zh: "正在对齐并相减「{name}」…", en: "Aligning and subtracting \"{name}\"…" },
  "k.pairOk": { zh: "精准模式已就绪：延迟 {ms}ms，增益 {g}，相减质量 {snr}dB（人声段覆盖率 {cov}%）。", en: "Precise mode ready: delay {ms}ms, gain {g}, subtraction {snr}dB (vocal coverage {cov}%)." },
  "k.pairPoor": { zh: "两个文件可能不是同一版本（对齐相关度偏低）。相减后质量可能反而更差，建议换成同一版本的伴奏。", en: "These two files may not be the same version (low alignment correlation). Subtraction may make things worse — try the matching backing track." },
  "k.pairFail": { zh: "伴奏处理失败：{msg}，已退回单文件模式。", en: "Backing track failed: {msg}. Falling back to single-file mode." },
  "k.pairSel": { zh: "已选择伴奏「{name}」，选好原唱后会自动相减分析。", en: "Backing track \"{name}\" selected; it will be subtracted once you pick the original." },
  // ---------- 课程 ----------
};

let currentLang = 'zh';
const listeners = [];

export function getLang() { return currentLang; }

export function detectLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch (err) { /* 隐私模式 */ }
  const nav = (navigator.language || 'zh').toLowerCase();
  return nav.startsWith('zh') ? 'zh' : 'en';
}

/** 取文案；支持 {name} 形式的插值。缺失的键回退到中文，再回退到键本身。 */
export function t(key, vars) {
  const entry = DICT[key];
  let s = entry ? (entry[currentLang] != null ? entry[currentLang] : entry.zh) : key;
  if (vars) {
    for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(String(vars[k]));
  }
  return s;
}

/** 双语内联：直接给两种语言的字符串，按当前语言取。 */
export function L(zh, en) { return currentLang === 'en' ? en : zh; }

export function onLangChange(fn) { listeners.push(fn); }

export function setLang(lang) {
  if (lang !== 'zh' && lang !== 'en') return;
  currentLang = lang;
  try { localStorage.setItem(LANG_KEY, lang); } catch (err) { /* ignore */ }
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
  applyI18n(document);
  for (const fn of listeners) {
    try { fn(lang); } catch (err) { console.error(err); }
  }
}

export function initI18n() {
  currentLang = detectLang();
  document.documentElement.lang = currentLang === 'en' ? 'en' : 'zh-CN';
  applyI18n(document);
  return currentLang;
}

/**
 * 扫描 DOM 并替换文案。
 * data-i18n            -> textContent
 * data-i18n-html       -> innerHTML（用于含 <b> 等标记的段落）
 * data-i18n-attr       -> "attr:key,attr:key"，例如 "placeholder:foo,title:bar"
 */
export function applyI18n(root) {
  const scope = root || document;
  scope.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });
  scope.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const key = el.getAttribute('data-i18n-html');
    if (key) el.innerHTML = t(key);
  });
  scope.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    const spec = el.getAttribute('data-i18n-attr');
    if (!spec) return;
    for (const pair of spec.split(',')) {
      const idx = pair.indexOf(':');
      if (idx < 0) continue;
      const attr = pair.slice(0, idx).trim();
      const key = pair.slice(idx + 1).trim();
      if (attr && key) el.setAttribute(attr, t(key));
    }
  });
}
