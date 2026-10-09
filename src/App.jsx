import React, { memo, useEffect, useState } from 'react';
import { Text, Icon } from './components/ui.jsx';
import { TunerPanel } from './components/TunerPanel.jsx';
import { PracticePanel, KaraokePanel, SpectrumPanel, LearnPanel } from './components/FeaturePanels.jsx';

const tabs = [
  { id: 'tuner', label: 'tab.tuner', icon: 'mic' },
  { id: 'practice', label: 'tab.practice', icon: 'music' },
  { id: 'karaoke', label: 'tab.karaoke', icon: 'headphones' },
  { id: 'spectrum', label: 'tab.spectrum', icon: 'wave' },
  { id: 'learn', label: 'tab.learn', icon: 'book' },
];

function Navigation() {
  const [active, setActive] = useState('tuner');
  useEffect(() => {
    for (const tab of tabs) {
      const panel = document.getElementById(`tab-${tab.id}`);
      panel.classList.toggle('active', tab.id === active);
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', `nav-${tab.id}`);
      panel.setAttribute('tabindex', '0');
    }
  }, [active]);
  function navigate(event, index) {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    setActive(tabs[next].id);
    document.getElementById(`nav-${tabs[next].id}`).focus();
  }
  return <nav className="tabs" role="tablist" aria-label="MusicMaster">
    {tabs.map((tab, index) => <button key={tab.id} id={`nav-${tab.id}`} className={`tab${active === tab.id ? ' active' : ''}`} data-tab={tab.id} role="tab" aria-selected={active === tab.id} aria-controls={`tab-${tab.id}`} tabIndex={active === tab.id ? 0 : -1} onClick={() => setActive(tab.id)} onKeyDown={event => navigate(event, index)}><Icon name={tab.icon} /><Text k={tab.label} /></button>)}
  </nav>;
}

const SettingsBar = memo(function SettingsBar() {
  return <div className="settings-bar">
    <div className="settings-fields">
      <span className="settings-symbol"><Icon name="sliders" size={17} /></span>
      <label className="setting-field"><Text k="ui.octaveLabel" /><select id="octaveBase" data-i18n-attr="aria-label:octave.label"><Text as="option" value="0" k="ui.octaveC4" /><Text as="option" value="1" k="ui.octaveC3" /></select></label>
      <label className="setting-field lang-picker"><Text k="ui.language" /><select id="langSelect" aria-label="Language / 语言"><option value="zh">中文</option><option value="en">English</option></select></label>
    </div>
    <div className="mic-control"><button id="micBtn" className="btn btn-primary"><span className="mic-dot" id="micDot" /><span id="micBtnText">启用麦克风</span></button></div>
  </div>;
});

// 实时音频控制器只更新这些稳定节点，导航变化不会重建画布或丢失文件输入。
const Workspace = memo(function Workspace() {
  return <main id="workspace"><TunerPanel /><PracticePanel /><KaraokePanel /><SpectrumPanel /><LearnPanel /></main>;
});

export default function App() {
  return <div className="app-shell">
    <a className="skip-link" href="#workspace"><Text k="ui.skip" /></a>
    <header className="site-header"><div className="brand"><span className="brand-mark"><Icon name="wave" size={23} /></span><div className="brand-text"><h1>MusicMaster<span className="brand-divider">/</span><Text k="ui.studio" /></h1></div></div><div className="privacy-badge"><Icon name="shield" size={15} /><Text k="ui.localAudio" /></div></header>
    <Navigation />
    <SettingsBar />
    <div className="session-status"><span className="status-dot" id="sessionDot" /><p className="mic-hint" id="micHint">所有分析都在你的浏览器本地完成，录音不会上传</p></div>
    <Workspace />
    <footer className="site-footer"><span>MusicMaster</span><Text as="p" k="ui.footer" /></footer>
    <div className="toast" id="toast" role="status" aria-live="polite" hidden />
  </div>;
}
