import React from 'react';
import { t } from '../../js/i18n.js';

export function Text({ k, as: Tag = 'span', ...props }) {
  return <Tag data-i18n={k} {...props}>{t(k)}</Tag>;
}

const paths = {
  wave: <><path d="M3 10v4m4-7v10m5-14v18m5-14v10m4-7v4" /></>,
  mic: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" /></>,
  music: <><path d="M9 18V5l12-3v13M9 9l12-3" /><ellipse cx="6" cy="18" rx="3" ry="3" /><ellipse cx="18" cy="15" rx="3" ry="3" /></>,
  book: <><path d="M12 6v15M12 6C8 2 3 3 2 3v16c4-1 7 0 10 2 3-2 6-3 10-2V3c-4-1-7 0-10 3Z" /></>,
  headphones: <><path d="M3 14v-2a9 9 0 0 1 18 0v2" /><rect x="3" y="12" width="4" height="9" rx="2" /><rect x="17" y="12" width="4" height="9" rx="2" /></>,
  sliders: <><path d="M4 21v-7m0-6V3m8 18v-5m0-6V3m8 18V10m0-6V3M1 8h6m2 8h6m2-12h6" /></>,
  shield: <><path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Z" /><path d="m8 12 3 3 5-6" /></>,
  arrow: <><path d="M7 17 17 7M7 7h10v10" /></>,
};

export function Icon({ name, size = 18, ...props }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name] || paths.wave}</svg>;
}

export function PanelHeading({ title, subtitle, children }) {
  return <div className="panel-heading"><div><Text as="h2" k={title} /><Text as="p" k={subtitle} className="panel-subtitle" /></div>{children}</div>;
}
