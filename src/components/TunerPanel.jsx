import React from 'react';
import { Icon, Text, PanelHeading } from './ui.jsx';

export function TunerPanel() {
  return <section id="tab-tuner" className="tab-panel active">
    <PanelHeading title="ui.tunerTitle" subtitle="ui.tunerSubtitle">
      <div className="live-badge"><span className="status-dot" /><Text k="ui.realtime" /></div>
    </PanelHeading>
    <div className="tuner-grid">
      <div className="card note-card">
        <div className="card-heading"><Text as="h3" k="ui.currentNote" /><Icon name="mic" size={16} /></div>
        <div className="note-display">
          <div className="note-name flat" id="tunerNote">--</div>
          <div className="note-meta"><span id="tunerFreq">0.0 Hz</span><span className="sep">·</span><span id="tunerSolfege" /></div>
        </div>
        <canvas id="centsGauge" width="520" height="190" data-i18n-attr="aria-label:ui.gaugeLabel" />
        <div className="cents-readout"><span id="tunerCents">0</span><small> cents</small></div>
        <div className="gauge-legend"><Text k="ui.flat" /><Text k="ui.inTune" /><Text k="ui.sharp" /></div>
        <div className="signal-row"><Text k="ui.signal" /><div className="clarity-bar" data-i18n-attr="title:tuner.clarityTitle"><div className="clarity-fill" id="clarityFill" /></div></div>
      </div>
      <div className="card curve-card">
        <div className="card-heading"><Text as="h3" k="tuner.curveTitle" /><div className="chart-legend"><span /><Text k="ui.yourVoice" /></div></div>
        <div className="pitch-chart">
          <canvas id="pitchCurve" width="960" height="380" data-i18n-attr="aria-label:tuner.curveTitle" />
          <div id="pitchEmpty" className="chart-empty"><span className="empty-wave"><Icon name="wave" size={28} /></span><Text as="p" k="ui.pitchEmpty" /><Text as="small" k="ui.pitchEmptyHint" /></div>
        </div>
        <div className="chart-footer"><Text k="ui.recentPitch" /><Text k="ui.semitone" /></div>
      </div>
    </div>
    <div className="tuner-tip"><Icon name="headphones" size={17} /><Text k="ui.tunerTip" /></div>
    <details className="guide-details octave-help">
      <Text as="summary" k="ui.tunerHelp" />
      <div className="guide-body"><Text as="p" k="tuner.clarityHint" /><Text as="p" k="tuner.curveHint" /><Text as="p" k="octave.hint" />
        <ul><li><Text as="b" k="octave.helpLi1" /> → <Text k="octave.helpLi1b" /></li><li><Text as="b" k="octave.helpLi2" /> → <Text k="octave.helpLi2b" /></li><li><Text as="b" k="octave.helpLi3" /> → <Text k="octave.helpLi3b" /></li></ul><Text as="p" k="octave.helpP2" />
      </div>
    </details>
  </section>;
}
