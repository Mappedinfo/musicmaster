// ============================================================
// 课程内容（中文 / English）：唱歌基本功知识与四周入门计划
// 素材基于声乐声学研究综述整理；启发式阈值在文中明确标注
// 每个条目都有对应的 *En 字段；渲染器按当前语言选择
// ============================================================

export const LESSONS = [
  {
    title: '🫁 第一课：气息——声音的燃料',
    titleEn: '🫁 Lesson 1: Breath — the fuel for your voice',
    sub: '唱歌先练气。气不稳，音准、音色、音量都会跟着晃。',
    subEn: 'Singing starts with the breath. If the air is unsteady, pitch, tone and volume all wobble with it.',
    blocks: [
      {
        h4: '腹式呼吸是什么',
        h4En: 'What abdominal breathing is',
        html: '<p>吸气时让<b>腹部（而不是肩膀和胸口）</b>向外扩张——横膈膜下降，给肺部腾出空间。呼气发声时用腰腹肌肉控制气流<b>缓慢、均匀</b>地流出，这就是"气息支撑"。</p><p>把身体想象成一个气球：声音是气球口被捏住后<b>均匀漏出</b>的气流驱动的。肩膀不动、肚子先鼓起，就是吸对了；唱歌时肚子慢慢回收而不是瞬间瘪掉，就是有支撑。</p><p class="muted">支撑好的声音稳定、音高不飘、长音不晃；支撑差表现为声音发虚、尾音掉音高、越长越抖。</p>',
        htmlEn: '<p>As you inhale, let the <b>belly (not the shoulders or chest)</b> expand outwards — the diaphragm drops and makes room for the lungs. As you exhale and sing, the muscles around the waist and belly control the air so it flows out <b>slowly and evenly</b>. That is what "breath support" means.</p>'
          + '<p>Picture your body as a balloon: the sound is driven by air <b>leaking out evenly</b> through a pinched neck. Shoulders still and belly rising first means you inhaled correctly; the belly easing back gradually instead of collapsing means you have support.</p>'
          + '<p class="muted">Good support gives a steady sound, stable pitch and long notes that do not waver. Poor support sounds hollow, drops pitch at the end of phrases, and shakes the longer you hold.</p>',
      },
      {
        h4: '练习 1：腹式呼吸感知',
        h4En: 'Exercise 1: Feel the belly breath',
        html: '<p>躺平，腹部放一本书。吸气让书<b>升起</b>，呼气让书<b>缓慢下降</b>。熟练后站立重复。常见错误：耸肩、胸口起伏、吸气过猛。</p>',
        htmlEn: '<p>Lie down and place a book on your belly. On the inhale let the book <b>rise</b>, on the exhale let it <b>sink slowly</b>. Once that feels easy, repeat standing up. Common mistakes: shrugging the shoulders, moving the chest, and snatching the air in too fast.</p>',
      },
      {
        h4: '练习 2："嘶——"长音（/s/）',
        h4En: 'Exercise 2: The "sss—" long breath (/s/)',
        html: '<p>吸足气后均匀发 /s/ 音 <b>15–25 秒</b>，响度尽量恒定。这个练习不涉及声带振动，纯粹练气流控制。常见错误：开头冲、结尾虚。</p><p class="muted">本应用的「频谱」页可以观察响度曲线是否平稳；「练习」页的长音稳定练习会量化你的音高稳定性（cents 标准差），间接反映气息控制。</p>',
        htmlEn: '<p>Fill your lungs, then hiss /s/ evenly for <b>15–25 seconds</b>, keeping the loudness as constant as you can. The vocal folds do not vibrate here, so this trains airflow control alone. Common mistakes: blasting at the start, going thin at the end.</p>'
          + '<p class="muted">The "Spectrum" tab lets you watch whether the loudness curve stays flat, and the steady-long-note exercise in "Exercises" quantifies your pitch stability (standard deviation in cents), which reflects breath control indirectly.</p>',
      },
      {
        h4: '练习 3：哼鸣与唇颤音（SOVT 热身）',
        h4En: 'Exercise 3: Humming and lip trills (SOVT warm-up)',
        html: '<p>闭嘴哼"嗯——"，从舒适音高开始，感受鼻梁和唇部轻微发麻；再练"打嘟噜"（双唇放松吹气打嘟噜，带着音高滑上滑下，像消防车汽笛）。</p><p>这类半闭合声道（SOVT）练习能温和地启动声带、降低发声所需的气息压力，是声乐界和嗓音科都推荐的标准热身——英国 NHS 医院嗓音科也把唇颤音列为嗓音热身单页。唱歌前先做 3 分钟，声带会舒服很多。</p>',
        htmlEn: '<p>Hum "mmm—" with your lips closed, starting on a comfortable pitch and feeling a light buzz on the bridge of your nose and lips. Then do lip trills (blow air through relaxed lips so they flutter, gliding up and down in pitch like a siren).</p>'
          + '<p>These semi-occluded vocal tract (SOVT) exercises start the vocal folds gently and reduce the air pressure needed to phonate. They are a standard warm-up recommended by both singing teachers and voice clinics — the NHS voice clinic lists lip trills on its warm-up sheet. Three minutes before you sing makes a noticeable difference.</p>',
      },
    ],
  },
  {
    title: '🎵 第二课：音准——do re mi 怎么唱准',
    titleEn: '🎵 Lesson 2: Pitch — how to sing do re mi in tune',
    sub: '音准是唱功的地基，好消息是它完全可以量化、可以练出来。',
    subEn: 'Pitch is the foundation of singing, and the good news is that it is fully measurable and trainable.',
    blocks: [
      {
        h4: '音分（cents）：音准的度量衡',
        h4En: 'Cents: the unit of pitch accuracy',
        html: '<p>两个相邻半音（比如 do 到升 do）之间被分成 100 份，每份叫 1 个音分（cent）。<b>±10 音分内是优秀，±25 音分内算合格，超过 ±50 音分（半个半音）基本就是唱错音了。</b></p><p>研究显示，未经训练的人唱歌时偏离目标音的中位数可达 30–62 音分——所以一开始唱不准非常正常。本应用「音准仪」页的表盘就是音分表：指针居中（绿色区）即唱准。</p>',
        htmlEn: '<p>The interval between two adjacent semitones (say do to sharp do) is divided into 100 parts, and each part is one cent. <b>Within ±10 cents is excellent, within ±25 cents is acceptable, and beyond ±50 cents (half a semitone) you are effectively singing the wrong note.</b></p>'
          + '<p>Research shows untrained singers deviate from the target by a median of 30–62 cents — so singing out of tune at the start is completely normal. The dial on the "Tuner" tab is a cents meter: needle centred in the green zone means you are in tune.</p>',
      },
      {
        h4: '音阶与唱名',
        h4En: 'The scale and solfège',
        html: '<p>大调音阶的七个音：<b>do（1）、re（2）、mi（3）、fa（4）、sol（5）、la（6）、si（7）</b>，然后高八度回到 do。它们与钢琴键（半音数）的对应：do=0、re=2、mi=4、fa=5、sol=7、la=9、si=11、高 do=12。</p><p>「音准仪」页会在右上角显示当前音在「练习」页所选调下的唱名，帮你建立音高与唱名的对应感。</p>',
        htmlEn: '<p>The seven notes of the major scale are <b>do (1), re (2), mi (3), fa (4), sol (5), la (6), si (7)</b>, then do again an octave higher. Against the piano keys (in semitones): do=0, re=2, mi=4, fa=5, sol=7, la=9, si=11, upper do=12.</p>'
          + '<p>The "Tuner" tab shows the solfège name of the current note in the key you selected on the "Exercises" tab, which helps you connect a pitch with its name.</p>',
      },
      {
        h4: '怎么练：模唱',
        h4En: 'How to practise: imitation',
        html: '<p>最有效的方法是<b>模唱</b>：听一个音 → 唱出来 → 立刻看音分表修正。「练习」页的「单音模唱」和「音阶跟唱」就是这个流程的自动化：先播示范音，轮到你唱时实时显示偏差，唱完逐音打分。</p><p class="muted">常见错误：抢拍（没听完就唱）、音与音之间滑过去（没"站住"）、越高越挤喉咙。先慢、先准，再求快。</p>',
        htmlEn: '<p>The most effective method is <b>imitation</b>: hear a note, sing it, then immediately check the cents meter and correct. The "Match a single note" and scale exercises on the "Exercises" tab automate exactly that loop — a reference note plays, your deviation appears live while you sing, and each note is scored at the end.</p>'
          + '<p class="muted">Common mistakes: jumping in before the reference finishes, sliding between notes instead of landing on them, and squeezing the throat as the notes rise. Slow and accurate first; speed comes later.</p>',
      },
    ],
  },
  {
    title: '🎤 第三课：胸声、头声与混声',
    titleEn: '🎤 Lesson 3: Chest voice, head voice and mixed voice',
    sub: '三种"挡位"——理解它们，才知道高音该怎么上去。',
    subEn: 'Three "gears" — understanding them is how you learn to reach high notes.',
    blocks: [
      {
        h4: '胸声（Chest Voice）',
        h4En: 'Chest voice',
        html: '<p>就是你平时说话的那副嗓子，中低音区的"实心"声音。手按胸口大声说"啊"，胸口感到的震动就是它。</p><p>声学上对应<b>喉部机制 M1</b>：声带以较厚的质量、全长度参与振动。听感厚实、有力、口语化。</p>',
        htmlEn: '<p>This is the voice you speak with: the solid sound in the low and middle range. Put a hand on your chest, say "ah" loudly, and the vibration you feel is chest voice.</p>'
          + '<p>Acoustically it corresponds mainly to <b>laryngeal mechanism M1</b>: the vocal folds vibrate along their full length with a thicker mass. It sounds full, powerful and speech-like.</p>',
      },
      {
        h4: '头声（Head Voice）',
        h4En: 'Head voice',
        html: '<p>唱高音时声音"翻"上去变成轻、飘、像笛子的那副嗓子，震动感移到面部"面罩"区（颧骨、鼻梁、眉心附近）。</p><p>声学上主要对应<b>喉部机制 M2</b>：声带被拉长变薄、主要沿边缘振动。听感轻、甜、飘逸。</p>',
        htmlEn: '<p>The light, floaty, flute-like voice that high notes "flip" into, with the vibration moving up into the facial "mask" (cheekbones, nose bridge, between the eyebrows).</p>'
          + '<p>Acoustically it corresponds mainly to <b>laryngeal mechanism M2</b>: the folds are stretched thin and vibrate mostly along their edges. It sounds light, sweet and airy.</p>',
      },
      {
        h4: '混声（Mixed Voice）与换声点',
        h4En: 'Mixed voice and the passaggio',
        html: '<p>胸声和头声之间的"无级变速"：高音区保持头声的轻，但混入胸声的芯，唱高音不喊、不破。胸声翻到头声的过渡点叫<b>换声点（passaggio）</b>，初学者过换声点会出现明显的"破音"。</p><p>研究发现混声不是某种神秘的"第三种机制"，而是两种机制在换声点附近的平滑过渡与"伪装"。所以混声训练的本质是<b>练换声点附近的平滑过渡</b>——汽笛滑音和唇颤音就是干这个的。</p>',
        htmlEn: '<p>Mixed voice is the continuously variable blend between chest and head voice: you keep the lightness of head voice but mix in the core of chest voice, so high notes are neither shouted nor broken. The transition point where chest voice flips into head voice is the <b>passaggio</b>, and beginners usually crack audibly right there.</p>'
          + '<p>Research finds that mixed voice is not a mysterious "third mechanism" but a smooth transition and mutual disguise of the two mechanisms around the passaggio. So training it really means <b>training a smooth transition across the break</b> — which is exactly what sirens and lip trills do.</p>',
      },
      {
        h4: '用频谱观察自己的声音（启发式）',
        h4En: 'Watching your own voice in the spectrum (heuristic)',
        html: '<p>「频谱」页的 <b>H1−H2</b> 指标是前两谐波的幅度差：在<b>同一个音高</b>上，数值小通常偏胸声（声带闭合强、高频丰富），数值大通常偏头声（闭合弱、气息多）。</p><p>⚠️ 这只是启发式倾向提示——学术级判定需要电声门图（EGG）设备。它适合用来<b>自己和自己比较</b>：同一个音，今天和上周的数值变化趋势。</p>',
        htmlEn: '<p>On the "Spectrum" tab, <b>H1−H2</b> is the level difference between the first two harmonics. <b>At the same pitch</b>, a smaller value usually leans chest voice (stronger fold closure, richer high harmonics) and a larger value leans head voice (lighter closure, more air).</p>'
          + '<p>⚠️ This is only a heuristic tendency — a research-grade judgement needs an electroglottograph (EGG). Use it to <b>compare yourself with yourself</b>: how the value for the same note changes from last week to today.</p>',
      },
    ],
  },
  {
    title: '🔊 第四课：共鸣——身体的音箱',
    titleEn: '🔊 Lesson 4: Resonance — the body as a speaker cabinet',
    sub: '同样的声带，为什么有人唱得亮、有人唱得闷？差别在"箱体"。',
    subEn: 'Same vocal folds — so why does one singer sound bright and another dull? The difference is the cabinet.',
    blocks: [
      {
        h4: '共鸣的科学真相',
        h4En: 'The science of resonance',
        html: '<p>声带产生的原始声音其实很弱，而且富含泛音。你的<b>咽腔、口腔、鼻腔组成的声道</b>像一个滤波器，选择性地放大某些频率（共振峰），这才是我们听到的音色。</p><p>打个比喻：声带是喇叭的振膜，咽-口-鼻是喇叭的箱体。同样的振膜，箱体形状不同（舌头高低、嘴张多大、软腭抬不抬），音色完全不同。<b>练共鸣 = 学会调整箱体形状。</b></p><p class="muted">教学上说的"胸腔共鸣、头腔共鸣"其实是体感隐喻——你在那些部位感到振动。物理上的主要共振腔是咽-口-鼻组成的声道。</p>',
        htmlEn: '<p>The raw sound produced by the vocal folds is actually weak and rich in overtones. Your <b>vocal tract — pharynx, mouth and nasal cavity together</b> — acts as a filter that selectively amplifies certain frequencies (formants). That filtered result is the timbre we actually hear.</p>'
          + '<p>Think of it this way: the vocal folds are the speaker cone, and the pharynx-mouth-nose is the cabinet. The same cone sounds completely different depending on the cabinet shape (tongue height, how wide you open your mouth, whether the soft palate lifts). <b>Training resonance means learning to reshape the cabinet.</b></p>'
          + '<p class="muted">What teachers call "chest resonance" and "head resonance" are really bodily metaphors for where you feel vibration. Physically, the main resonating cavity is the vocal tract formed by pharynx, mouth and nose.</p>',
      },
      {
        h4: '歌手共振峰：穿透力的来源',
        h4En: "The singer's formant: where ring comes from",
        html: '<p>受过训练的歌声会在约 <b>2.5–3.5 kHz</b> 附近形成能量聚集（"歌手共振峰"），让歌声能穿透整个乐队伴奏而不喊。这就是为什么歌手不用麦克风也能让后排观众听清。</p><p>「频谱」页的"歌手共振峰"指标显示这个频段的能量占比，可以自己和自己比较：哼鸣时、唱"啊"时分别观察它。</p>',
        htmlEn: '<p>A trained voice clusters energy around <b>2.5–3.5 kHz</b> (the "singer\'s formant"), which lets it cut through a full band without shouting. That is why an unamplified singer can still be heard at the back of a hall.</p>'
          + '<p>The "Singer\'s formant" metric on the "Spectrum" tab shows the share of energy in that band. Compare it with yourself: hum, then sing "ah", and watch how it moves.</p>',
      },
      {
        h4: '怎么练',
        h4En: 'How to practise',
        html: '<p>1）<b>哼鸣</b>：闭嘴哼"嗯"，找鼻梁/唇部发麻的震动感，这就是"面罩"位置的感觉；2）<b>元音对比</b>：同一个音分别唱"乌/哦/啊/诶/衣"，在频谱页观察频谱质心怎么移动——"衣"亮、"乌"暗；3）<b>哈欠感</b>：打哈欠时软腭抬起、咽腔打开，带着这个感觉唱"啊"，声音会更圆润。</p>',
        htmlEn: '<p>1) <b>Humming</b>: hum "mmm" with closed lips and find the buzz on the nose bridge and lips — that feeling is the "mask" placement. 2) <b>Vowel contrast</b>: sing the same pitch on "oo / oh / ah / eh / ee" and watch the spectral centroid move on the Spectrum tab — "ee" is bright, "oo" is dark. 3) <b>The yawn feeling</b>: when you yawn the soft palate lifts and the pharynx opens; sing "ah" with that sensation and the sound becomes rounder.</p>',
      },
    ],
  },
  {
    title: '📏 量化指标速查',
    titleEn: '📏 Metric quick reference',
    sub: '本应用每个数字的含义与参考基准。',
    subEn: 'What every number in this app means and how to read it.',
    blocks: [
      {
        html: '<div class="metric-table-scroll"><table class="metric-table"><tr><th>指标</th><th>含义</th><th>参考基准</th></tr>'
          + '<tr><td>音准（cents）</td><td>偏离目标音的音分数，100 音分 = 1 个半音</td><td>±10 优 / ±25 合格 / ±50 唱错音（教学分级）</td></tr>'
          + '<tr><td>稳定性</td><td>长音期间音分偏差的标准差</td><td>≤15 音分为稳；气息不足时尾音会明显抖动</td></tr>'
          + '<tr><td>音域</td><td>能稳定唱出的最低–最高音</td><td>普通人舒适音域约 12–18 个半音，可逐步扩展</td></tr>'
          + '<tr><td>频谱质心</td><td>频谱能量的加权平均频率，"明亮度"</td><td>相对比较；同音高下越亮数值越大</td></tr>'
          + '<tr><td>H1−H2</td><td>前两谐波幅度差（dB），声带闭合/声区倾向</td><td>同音高下：小偏胸声，大偏头声（启发式）</td></tr>'
          + '<tr><td>谐波占比</td><td>周期性谐波能量比例</td><td>越高越"实"；气声多会变低</td></tr>'
          + '<tr><td>歌手共振峰</td><td>2.5–3.5 kHz 频带能量占比</td><td>受过训练的歌声在此聚集，"穿透力"代理</td></tr>'
          + '</table></div>'
          + '<p class="muted" style="margin-top:12px">颤音参考：职业歌手颤音速率约 5.5–8 Hz、幅度约 ±50–100 音分（Seashore/Sundberg 综述）。过快（&gt;8 Hz，"羊声"）或过慢（&lt;4.5 Hz）都提示控制问题。本应用暂不对颤音自动打分。</p>',
        htmlEn: '<div class="metric-table-scroll"><table class="metric-table"><tr><th>Metric</th><th>Meaning</th><th>Reference</th></tr>'
          + '<tr><td>Pitch (cents)</td><td>Deviation from the target note; 100 cents = one semitone</td><td>±10 excellent / ±25 acceptable / ±50 wrong note (teaching grades)</td></tr>'
          + '<tr><td>Steadiness</td><td>Standard deviation of cents during a long note</td><td>≤15 cents is steady; a weak breath makes the tail wobble</td></tr>'
          + '<tr><td>Range</td><td>Lowest to highest note you can produce steadily</td><td>Most untrained singers are comfortable within 12–18 semitones; it extends with practice</td></tr>'
          + '<tr><td>Spectral centroid</td><td>Energy-weighted mean frequency; "brightness"</td><td>Relative measure; at the same pitch, brighter means higher</td></tr>'
          + '<tr><td>H1−H2</td><td>Level difference between the first two harmonics (dB); fold closure / register tendency</td><td>At the same pitch: smaller leans chest, larger leans head (heuristic)</td></tr>'
          + '<tr><td>Harmonic ratio</td><td>Share of periodic harmonic energy</td><td>Higher is more "solid"; lots of breathiness lowers it</td></tr>'
          + "<tr><td>Singer's formant</td><td>Share of energy in the 2.5–3.5 kHz band</td><td>Trained voices cluster energy here; a proxy for vocal ring</td></tr>"
          + '</table></div>'
          + '<p class="muted" style="margin-top:12px">Vibrato reference: professional singers use roughly 5.5–8 Hz at about ±50–100 cents (Seashore/Sundberg reviews). Much faster (&gt;8 Hz, the "bleat") or slower (&lt;4.5 Hz) suggests a control problem. This app does not score vibrato automatically.</p>',
      },
      {
        html: '<p class="muted"><b>诚实声明</b>：所有指标都是声学代理量，用于"自己和自己比较"的进步跟踪，不能替代声乐老师的耳朵，也不构成嗓音医学诊断。嗓子疼痛、声音嘶哑超过两周请就医。</p>',
        htmlEn: "<p class=\"muted\"><b>Honest disclaimer</b>: every metric here is an acoustic proxy, useful for tracking your own progress against yourself. It cannot replace a singing teacher's ear and is not a medical diagnosis of the voice. If your throat hurts or your voice has been hoarse for more than two weeks, see a doctor.</p>",
      },
    ],
  },
];

export const WEEK_PLAN = [
  {
    week: '第 1 周', weekEn: 'Week 1',
    text: '气息与启动。每天：腹式呼吸感知 3 分钟 → /s/ 长音 3 分钟 → 哼鸣 3 分钟 → 「练习」页单音模唱 5 分钟。目标：建立基线，熟悉音分表盘。',
    textEn: 'Breath and starting up. Daily: 3 min feeling the belly breath → 3 min of the /s/ long breath → 3 min humming → 5 min of note matching on the Exercises tab. Goal: establish a baseline and get used to the cents meter.',
  },
  {
    week: '第 2 周', weekEn: 'Week 2',
    text: '音准入门。每天：哼鸣热身 → 单音模唱 5 分钟 → 音阶跟唱（上行）5 分钟 → 长音稳定 3 分钟。目标：音阶跟唱平均 60 分以上。',
    textEn: 'Pitch basics. Daily: hum to warm up → 5 min note matching → 5 min ascending scale → 3 min steady long notes. Goal: average 60+ on the scale exercise.',
  },
  {
    week: '第 3 周', weekEn: 'Week 3',
    text: '音域与声区。每天：SOVT 热身 3 分钟 → 音阶上/下行各 3 分钟 → 五度跳进 5 分钟 → 音域测试一次。目标：音域扩展 2–3 个半音，感受换声点。',
    textEn: 'Range and registers. Daily: 3 min SOVT warm-up → 3 min each of ascending and descending scales → 5 min fifth leaps → one range test. Goal: extend your range by 2–3 semitones and feel the passaggio.',
  },
  {
    week: '第 4 周', weekEn: 'Week 4',
    text: '共鸣与整曲。每天：热身 3 分钟 → K歌跟唱一首（先看报告再重唱最难的一句）→ 频谱页对比哼鸣与"啊"的歌手共振峰。目标：跟唱分数稳定在 80 分以上。',
    textEn: "Resonance and full songs. Daily: 3 min warm-up → sing one song in Sing-along (read the report, then re-sing the hardest line) → compare the singer's formant for humming versus \"ah\" on the Spectrum tab. Goal: keep your sing-along score above 80.",
  },
];
