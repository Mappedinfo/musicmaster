import { useEffect, useRef, useState } from 'react';
import { t } from '../../js/i18n.js';
import { reviewDuration, reviewNote, reviewTime } from './recordingReviewUtils.js';

export default function RecordingReviewChart({ report, time, selection, onSeek, octaveBase, language }) {
  const canvas = useRef(null);
  const [size, setSize] = useState({ width: 800, height: 248 });
  const duration = reviewDuration(report);
  useEffect(() => {
    const element = canvas.current;
    const observer = new ResizeObserver(entries => {
      const width = entries[0].contentRect.width;
      if (width > 0) setSize({ width, height: width < 500 ? 210 : 248 });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = canvas.current;
    const dpr = window.devicePixelRatio || 1;
    element.width = Math.round(size.width * dpr);
    element.height = Math.round(size.height * dpr);
    const ctx = element.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = size.width, H = size.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#14181b'; ctx.fillRect(0, 0, W, H);
    const frames = report?.frames || [];
    const comparison = report?.comparison;
    const reference = comparison?.referenceFrames || [];
    let minimum = Infinity, maximum = -Infinity;
    for (const [values, transpose] of [[frames, 0], [reference, comparison?.transposeSemitones || 0]]) {
      for (const frame of values) if (Number.isFinite(frame.midi)) {
        minimum = Math.min(minimum, frame.midi + transpose); maximum = Math.max(maximum, frame.midi + transpose);
      }
    }
    let low = Number.isFinite(minimum) ? Math.floor(minimum - 2) : 48;
    let high = Number.isFinite(maximum) ? Math.ceil(maximum + 2) : 72;
    if (high - low < 6) { low -= 3; high += 3; }
    const left = 42, right = 10, top = 12, bottom = 26;
    const xOf = second => left + second / duration * (W - left - right);
    const yOf = midi => top + (high - midi) / (high - low) * (H - top - bottom);
    if (selection) {
      ctx.fillStyle = 'rgba(91,224,179,.08)';
      ctx.fillRect(xOf(selection.start), top, xOf(selection.end) - xOf(selection.start), H - top - bottom);
    }
    ctx.font = '10px ui-monospace, monospace';
    const step = Math.max(1, Math.ceil((high - low) / 12));
    for (let midi = low; midi <= high; midi += step) {
      const y = yOf(midi);
      ctx.strokeStyle = 'rgba(255,255,255,.07)';
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(W - right, y); ctx.stroke();
      ctx.fillStyle = '#859590'; ctx.textAlign = 'right';
      ctx.fillText(reviewNote(midi, octaveBase), left - 6, y + 3);
    }
    for (let index = 0; index <= 4; index++) {
      const second = duration * index / 4;
      ctx.fillStyle = '#859590'; ctx.textAlign = index === 0 ? 'left' : index === 4 ? 'right' : 'center';
      ctx.fillText(reviewTime(second), xOf(second), H - 8);
    }
    function draw(values, color, offset = 0, transpose = 0) {
      ctx.strokeStyle = color; ctx.lineWidth = 1.5;
      ctx.beginPath(); let last = null;
      const stride = Math.max(1, Math.floor(values.length / Math.max(1, W * 3)));
      for (let index = 0; index < values.length; index += stride) {
        const frame = values[index];
        const second = frame.t - offset;
        if (!Number.isFinite(frame.midi) || second < 0 || second > duration) { last = null; continue; }
        const x = xOf(second), y = yOf(frame.midi + transpose);
        if (!last || second - last > Math.max(.15, stride * .05)) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        last = second;
      }
      ctx.stroke();
    }
    draw(reference, '#a6b2b9', comparison?.offsetSec || 0, comparison?.transposeSemitones || 0);
    draw(frames, '#5be0b3');
    ctx.strokeStyle = '#e5bc76'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(xOf(time), top); ctx.lineTo(xOf(time), H - bottom); ctx.stroke();
    for (const issue of report?.issues || []) {
      ctx.fillStyle = '#e5bc76'; ctx.fillRect(xOf(issue.start), H - bottom + 3, Math.max(3, xOf(issue.end) - xOf(issue.start)), 3);
    }
  }, [report, time, selection, size, duration, octaveBase, language]);

  function pointer(event) {
    const box = event.currentTarget.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(duration, (event.clientX - box.left - 42) / Math.max(1, box.width - 52) * duration)));
  }
  function keyboard(event) {
    let target;
    if (event.key === 'ArrowRight') target = time + 1;
    if (event.key === 'ArrowLeft') target = time - 1;
    if (event.key === 'Home') target = 0;
    if (event.key === 'End') target = duration;
    if (target === undefined) return;
    event.preventDefault(); onSeek(Math.max(0, Math.min(duration, target)));
  }
  return <canvas ref={canvas} id="reviewCanvas" className="review-canvas" style={{ height: size.height }}
    role="slider" tabIndex={0} aria-label={t('recording.chartSeek')} aria-valuemin={0} aria-valuemax={Math.ceil(duration)}
    aria-valuenow={Math.round(time)} aria-valuetext={reviewTime(time)} onClick={pointer} onKeyDown={keyboard} />;
}
