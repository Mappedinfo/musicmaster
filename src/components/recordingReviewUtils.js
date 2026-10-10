import { getLang, onLangChange } from '../../js/i18n.js';
import { useEffect, useState } from 'react';

export function useReviewLanguage() {
  const [language, setLanguage] = useState(getLang());
  useEffect(() => {
    let mounted = true;
    onLangChange(next => { if (mounted) setLanguage(next); });
    return () => { mounted = false; };
  }, []);
  return language;
}

export function reviewTime(value) {
  const seconds = Math.max(0, Number(value) || 0);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

export function reviewNote(midi, octaveBase = 0) {
  if (!Number.isFinite(midi)) return '—';
  const rounded = Math.round(midi);
  return ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][((rounded % 12) + 12) % 12]
    + (Math.floor(rounded / 12) - 1 - octaveBase);
}

export async function reviewFileHash(file) {
  const bytes = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function reviewSourceMatches(source, metadata) {
  const expected = metadata?.audioIdentity?.sha256 || metadata?.sourceHash;
  return typeof source?.hash === 'string' && typeof expected === 'string'
    && source.hash.toLowerCase() === expected.toLowerCase();
}

export function reviewDuration(report) {
  const frames = report?.frames || [];
  return Math.max(Number(report?.metadata?.durationSec) || 0, frames.at(-1)?.t || 0, 0.01);
}

export function reviewNumber(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : '—';
}

export function reviewInitialOctave() {
  try { return Number(localStorage.getItem('musicmaster.octavebase.v1')) || 0; } catch { return 0; }
}
