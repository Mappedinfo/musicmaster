import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import App from './App.jsx';
import { initI18n } from '../js/i18n.js';
import '../css/style.css';

initI18n();
const root = createRoot(document.getElementById('root'));
flushSync(() => root.render(<App />));

// 视图先挂载，现有音频与训练控制器随后绑定；保持分析内核独立。
import('../js/app.js').catch(error => {
  console.error(error);
  const toast = document.getElementById('toast');
  toast.hidden = false;
  toast.textContent = document.documentElement.lang === 'en'
    ? 'Unable to start. Refresh the page to try again.'
    : '页面初始化失败，请刷新重试。';
});
